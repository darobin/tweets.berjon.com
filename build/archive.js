// Load a Twitter export and turn it into the model the site is built from:
// every original tweet (retweets excluded), with normalised media, reply
// context, self-reply threads, and the own tweets it quotes.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ID_RX = /twitter\.com\/(\w+)\/status\/(\d+)/i;

export async function loadArchive(cfg) {
  const { source } = cfg;
  const account = (await loadData(source, 'account'))[0];
  const profile = (await loadData(source, 'profile'))[0];
  const raw = await loadData(source, 'tweets', 'tweet');
  const me = account.accountId;
  const handle = account.username;

  let retweets = 0;
  const tweets = [];
  for (const t of raw) {
    // Retweets, including the old manual "RT @user text" form.
    if (/^RT @\w+/.test(t.full_text)) { retweets++; continue; }
    tweets.push(model(t));
  }
  tweets.sort((a, b) => compareIds(a.id, b.id));
  const byId = new Map(tweets.map((t) => [t.id, t]));

  // Reply context and self-reply chains.
  for (const t of tweets) {
    if (!t.replyToId) continue;
    const mine = t.replyToUserId === me;
    const parent = mine ? byId.get(t.replyToId) : null;
    t.replyTo = { id: t.replyToId, user: t.replyToUser || (mine ? handle : null), mine };
    if (parent) {
      t.parent = parent.id;
      parent.children.push(t.id);
    }
  }
  // Threads: a root is a tweet with self-replies whose own parent is not in
  // the archive (it may itself be a reply to someone else, or an orphan).
  const threads = [];
  for (const t of tweets) {
    if (t.parent || !t.children.length) continue;
    const ids = [];
    const stack = [t.id];
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      stack.push(...byId.get(id).children);
    }
    ids.sort(compareIds);
    const thread = { root: t.id, ids, size: ids.length, date: t.date, likes: 0 };
    for (const id of ids) {
      const m = byId.get(id);
      m.root = t.id;
      thread.likes += m.likes;
    }
    t.thread = thread;
    threads.push(thread);
  }

  // Quoted tweets: a link to a tweet at the very end of the text is a quote
  // tweet. Own quoted tweets are embedded from the archive when present.
  for (const t of tweets) {
    const last = t.urls[t.urls.length - 1];
    if (!last || last.end !== t.length) continue;
    const m = ID_RX.exec(last.expanded_url);
    if (!m) continue;
    const [, user, id] = m;
    const own = user.toLowerCase() === handle.toLowerCase();
    t.quote = { user, id, own, embedded: own && byId.has(id) };
    last.hidden = true;
  }

  // Media files, checked against the export (a few are missing from it).
  const mediaDir = path.join(source, 'data/tweets_media');
  let missing = 0;
  for (const t of tweets) {
    for (const m of t.media) {
      try {
        m.bytes = (await stat(path.join(mediaDir, m.file))).size;
      } catch {
        m.missing = true;
        missing++;
      }
    }
  }

  // Leading @mentions on replies are Twitter's reply chain, not prose: move
  // them out of the text and into the "replying to" line.
  for (const t of tweets) stripLeadingMentions(t);

  const years = new Map();
  for (const t of tweets) {
    const y = years.get(t.year) || { year: t.year, count: 0, months: new Map(), photos: 0 };
    y.count++;
    const mo = y.months.get(t.month) || { month: t.month, count: 0, tweets: [] };
    mo.count++;
    mo.tweets.push(t);
    y.months.set(t.month, mo);
    y.photos += t.media.filter((m) => m.type === 'photo' && !m.missing).length;
    years.set(t.year, y);
  }

  const avatar = path.join(
    source,
    'data/profile_media',
    `${me}-${profile.avatarMediaUrl.replace(/.*\//, '')}`
  );

  return {
    account,
    profile,
    me,
    handle,
    tweets,
    byId,
    threads,
    years: [...years.values()].sort((a, b) => a.year.localeCompare(b.year)),
    mediaDir,
    avatar,
    stats: {
      tweets: tweets.length,
      retweets,
      replies: tweets.filter((t) => t.replyTo && !t.replyTo.mine).length,
      threads: threads.length,
      threadTweets: threads.reduce((n, th) => n + th.size, 0),
      media: tweets.reduce((n, t) => n + t.media.filter((m) => !m.missing).length, 0),
      missingMedia: missing,
      first: tweets[0]?.date,
      last: tweets[tweets.length - 1]?.date,
    },
  };
}

function model(t) {
  const text = t.full_text;
  const cps = Array.from(text);
  const ent = t.entities || {};
  const span = (e) => ({ start: Number(e.indices[0]), end: Number(e.indices[1]) });
  const media = [];
  const groups = new Map();
  for (const m of t.extended_entities?.media || []) {
    const s = span(m);
    let file, w = Number(m.sizes?.large?.w) || null, h = Number(m.sizes?.large?.h) || null;
    let type = m.type;
    if (type === 'photo') {
      file = `${t.id_str}-${basename(m.media_url_https)}`;
    } else if (type === 'animated_gif' || type === 'video') {
      // The export keeps the best mp4 rendition, named after that variant.
      const best = (m.video_info?.variants || [])
        .filter((v) => v.content_type === 'video/mp4')
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0];
      if (!best) continue;
      file = `${t.id_str}-${basename(best.url)}`;
      if (type === 'animated_gif') type = 'gif';
    } else {
      console.warn(`Unknown media type ${type} on ${t.id_str}`);
      continue;
    }
    const item = { type, file, w, h, ...s };
    media.push(item);
    const key = `${s.start}-${s.end}`;
    if (!groups.has(key)) groups.set(key, { ...s, items: [] });
    groups.get(key).items.push(item);
  }
  const date = new Date(t.created_at);
  return {
    id: t.id_str,
    text,
    length: cps.length,
    date,
    ts: Math.floor(date.getTime() / 1000),
    year: date.toISOString().slice(0, 4),
    month: date.toISOString().slice(5, 7),
    lang: /^(en|fr|es|de|it|pt|nl)$/.test(t.lang) ? t.lang : null,
    likes: Number(t.favorite_count) || 0,
    retweets: Number(t.retweet_count) || 0,
    source: (t.source || '').replace(/<[^>]+>/g, ''),
    hashtags: (ent.hashtags || []).map((e) => ({ ...span(e), text: e.text })),
    symbols: (ent.symbols || []).map((e) => ({ ...span(e), text: e.text })),
    mentions: (ent.user_mentions || []).map((e) => ({ ...span(e), screen_name: e.screen_name, name: e.name })),
    urls: (ent.urls || []).map((e) => ({ ...span(e), url: e.url, expanded_url: e.expanded_url, display_url: e.display_url })),
    media,
    mediaGroups: [...groups.values()],
    replyToId: t.in_reply_to_status_id_str || null,
    replyToUserId: t.in_reply_to_user_id_str || null,
    replyToUser: t.in_reply_to_screen_name || null,
    replyTo: null,
    parent: null,
    children: [],
    root: null,
    thread: null,
    quote: null,
    leadingMentions: [],
    textStart: 0,
  };
}

// On a reply, the run of @mentions at the start of the text is the reply
// chain. Record where the prose starts and who it was addressed to.
function stripLeadingMentions(t) {
  if (!t.replyTo) return;
  // Matched on the text rather than the mention entities: accounts that were
  // gone by the time of the export have no entity, but are still part of the
  // reply chain.
  const m = /^(?:@\w{1,15}\s+)+/.exec(t.text);
  if (!m || m[0].length === t.text.length) return; // nothing, or nothing but mentions
  t.leadingMentions = [...m[0].matchAll(/@(\w+)/g)].map((x) => x[1]);
  t.textStart = Array.from(m[0]).length;
}

export function compareIds(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function basename(url) {
  return url.replace(/.*\//, '').replace(/\?.*/, '');
}

async function loadData(source, key, dataKey = key) {
  const raw = await readFile(path.join(source, `data/${key}.js`), 'utf8');
  return JSON.parse(raw.replace(/^window\.YTD\.[\w-]+\.part0 = /, '')).map((t) => t[dataKey]);
}
