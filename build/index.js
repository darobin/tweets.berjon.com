// Build the site into site/: one page per tweet (thread members redirect to
// their thread), month and year pages, thread and photo listings, the search
// page and its per-year index shards, plus the media the tweets use.
import { mkdir, writeFile, rm, readdir, cp, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, OUT_DIR, PUBLIC_DIR } from './config.js';
import { loadArchive } from './archive.js';
import { plainText } from './render.js';
import * as T from './templates.js';
import { bundle } from './bundle.js';

export async function build() {
  const started = Date.now();
  const cfg = await loadConfig();
  const A = await loadArchive(cfg);
  A.site = cfg.site;
  const s = A.stats;
  log(`${s.tweets} tweets (${s.retweets} retweets skipped), ${s.threads} threads, ${s.media} media files (${s.missingMedia} missing from the export)`);

  // Start from a clean output, except media, which is copied incrementally.
  await mkdir(OUT_DIR, { recursive: true });
  for (const entry of await readdir(OUT_DIR)) {
    if (entry !== 'media') await rm(path.join(OUT_DIR, entry), { recursive: true, force: true });
  }
  await cp(PUBLIC_DIR, OUT_DIR, { recursive: true });
  await mkdir(path.join(OUT_DIR, 'media'), { recursive: true });
  await copyFile(A.avatar, path.join(OUT_DIR, 'media/avatar.jpg'));

  const files = new Map();
  const out = (rel, content) => files.set(rel, content);

  // Tweets. Thread members have no page of their own: their URL redirects
  // into the thread, so older links keep working.
  const paged = A.tweets.filter((t) => !(t.root && t.root !== t.id));
  paged.forEach((t, i) => out(`${t.id}.html`, T.tweetPage(A, t, { prev: paged[i - 1], next: paged[i + 1] })));
  for (const t of A.tweets) if (t.root && t.root !== t.id) out(`${t.id}.html`, T.redirectPage(A, t));

  // Months and years.
  const months = [];
  for (const y of A.years) {
    for (const m of [...y.months.values()].sort((a, b) => a.month.localeCompare(b.month))) {
      months.push({ year: y.year, month: m.month, tweets: m.tweets });
    }
  }
  months.forEach((m, i) => out(`${m.year}/${m.month}/index.html`, T.monthPage(A, m.year, m.month, m.tweets, { prev: months[i - 1], next: months[i + 1] })));
  A.years.forEach((y, i) => out(`${y.year}/index.html`, T.yearPage(A, y, { prev: A.years[i - 1], next: A.years[i + 1], top: topLiked(yearTweets(y), 5) })));
  out('years/index.html', T.yearsPage(A));

  // Listings, search, home.
  out('threads/index.html', T.threadsPage(A, cfg));
  out('photos/index.html', T.photosIndexPage(A));
  const photoYears = A.years.filter((y) => y.photos);
  photoYears.forEach((y, i) => out(`photos/${y.year}/index.html`, T.photosYearPage(A, y, { prev: photoYears[i - 1], next: photoYears[i + 1] })));
  out('search/index.html', T.searchPage(A));
  out('404.html', T.notFoundPage(A));
  out('index.html', T.indexPage(A, cfg, { top: topLiked(A.tweets, 10), random: sample(paged, 400).map((t) => t.id) }));

  // Search index: one shard per year of [id, timestamp, text, flags, likes, retweets].
  for (const y of A.years) {
    const rows = yearTweets(y).map((t) => [t.id, t.ts, plainText(t), flags(t), t.likes, t.retweets]);
    out(`search/${y.year}.json`, JSON.stringify({ year: y.year, count: rows.length, rows }));
  }

  // Write everything, directories first.
  const dirs = new Set([...files.keys()].map((rel) => path.dirname(rel)));
  for (const d of dirs) await mkdir(path.join(OUT_DIR, d), { recursive: true });
  await pool([...files], 64, ([rel, content]) => writeFile(path.join(OUT_DIR, rel), content, 'utf8'));
  log(`${files.size} files written`);

  // Media, only what changed.
  const media = new Map();
  for (const t of A.tweets) for (const m of t.media) if (!m.missing) media.set(m.file, m);
  let copied = 0;
  await pool([...media.values()], 16, async (m) => {
    const dest = path.join(OUT_DIR, 'media', m.file);
    try {
      if ((await stat(dest)).size === m.bytes) return;
    } catch {}
    await copyFile(path.join(A.mediaDir, m.file), dest);
    copied++;
  });
  log(`${media.size} media files, ${copied} copied`);

  await bundle();
  log(`built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return A;
}

function yearTweets(y) {
  return [...y.months.values()].sort((a, b) => a.month.localeCompare(b.month)).flatMap((m) => m.tweets);
}

function topLiked(tweets, n) {
  return tweets
    .filter((t) => t.likes > 0)
    .sort((a, b) => b.likes - a.likes || b.ts - a.ts)
    .slice(0, n);
}

function sample(list, n) {
  const picked = new Set();
  while (picked.size < Math.min(n, list.length)) picked.add(list[Math.floor(Math.random() * list.length)]);
  return [...picked];
}

function flags(t) {
  return (t.media.some((m) => !m.missing) ? 1 : 0) | (t.replyTo && !t.replyTo.mine ? 2 : 0) | (t.root ? 4 : 0) | (t.quote ? 8 : 0);
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function log(msg) {
  console.log(`[build] ${msg}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
