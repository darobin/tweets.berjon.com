// Page templates. Every page shares the layout in page(); the rest build the
// body for one kind of page each.
import {
  esc, attr, fmtDate, fmtDateTime, monthName, MONTHS, num, plural,
  renderTweet, renderThread, titleFor, descriptionFor, tweetURL, monthURL, AVATAR,
} from './render.js';

const ICON = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%220.9em%22 font-size=%22105%22>🦤</text></svg>';

export function page(A, { title, description = '', path = '/', body, image = null, bodyClass = '', head = '', scripts = '' }) {
  const site = A.site;
  const url = site.url + path;
  const img = site.url + (image || AVATAR);
  const from = A.stats.first.getUTCFullYear();
  const to = A.stats.last.getUTCFullYear();
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  ${description ? `<meta name="description" content="${attr(description)}">` : ''}
  <link rel="canonical" href="${attr(url)}">
  <meta property="og:title" content="${attr(title)}">
  ${description ? `<meta property="og:description" content="${attr(description)}">` : ''}
  <meta property="og:url" content="${attr(url)}">
  <meta property="og:image" content="${attr(img)}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="robots" content="noai, noimageai">
  <link rel="stylesheet" href="/css/tweets.css">
  <link rel="icon" href="${ICON}">
  ${head}
</head>
<body class="${bodyClass}">
  <header class="site-header">
    <a class="masthead" href="/"><span class="site-title">${esc(site.name)}</span><span class="site-tagline">${esc(site.tagline)}</span></a>
    <nav class="site-nav" aria-label="Site">
      <a href="/">Home</a><a href="/years/">Years</a><a href="/threads/">Threads</a><a href="/photos/">Photos</a><a href="/search/">Search</a>
    </nav>
    <form class="site-search" action="/search/" method="get" role="search">
      <input type="search" name="q" placeholder="Search tweets…" aria-label="Search tweets">
      <button type="submit">Search</button>
    </form>
  </header>
  <main>
${body}
  </main>
  <footer class="site-footer">
    <p>The archive of <a href="${site.profile}">@${esc(A.handle)}</a>’s tweets, ${from}–${to}, built from the Twitter export. Retweets are left out.</p>
    <p><a href="${site.homepage}">${esc(site.homepage.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a> · <a href="https://github.com/darobin/tweets.berjon.com">source</a></p>
  </footer>
${scripts}
</body>
</html>
`;
}

function pager(items) {
  return `<nav class="pager">${items
    .map((it) => (it ? `<a${it.rel ? ` rel="${it.rel}"` : ''} href="${it.href}"${it.title ? ` title="${attr(it.title)}"` : ''}>${it.label}</a>` : '<span></span>'))
    .join('')}</nav>`;
}

export function tweetPage(A, t, { prev, next }) {
  const isThread = !!t.thread;
  const kicker = isThread
    ? `Thread · ${plural(t.thread.size, 'tweet')} · ${fmtDate(t.date)}`
    : `Tweet · ${fmtDateTime(t.date)}`;
  const body = `<h1 class="kicker">${kicker}</h1>
${isThread ? renderThread(t.thread, A) : renderTweet(t, A)}
${pager([
  prev && { rel: 'prev', href: tweetURL(prev.id), label: '← Older', title: titleFor(prev) },
  { href: `${monthURL(t)}#tweet-${t.id}`, label: `${monthName(t.month)} ${t.year}` },
  next && { rel: 'next', href: tweetURL(next.id), label: 'Newer →', title: titleFor(next) },
])}`;
  const photo = t.media.find((m) => m.type === 'photo' && !m.missing);
  return page(A, {
    title: `${A.site.name}: “${titleFor(t)}”`,
    description: descriptionFor(t),
    path: tweetURL(t.id),
    body,
    image: photo ? `/media/${photo.file}` : null,
    bodyClass: isThread ? 'thread-page' : 'tweet-page',
  });
}

// A tweet inside a thread lives on the thread's page.
export function redirectPage(A, t) {
  const link = `${tweetURL(t.root)}#tweet-${t.id}`;
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${link}">
  <link rel="canonical" href="${A.site.url}${link}">
  <title>${esc(A.site.name)}: “${esc(titleFor(t))}”</title>
</head>
<body>
  <p>This tweet is part of a thread: <a href="${link}">${esc(titleFor(t))}</a></p>
</body>
</html>
`;
}

const INLINE_THREAD_MAX = 6;

function monthListing(A, tweets) {
  const out = [];
  for (const t of tweets) {
    if (t.root && t.root !== t.id) continue; // shown with its thread
    if (!t.thread) { out.push(renderTweet(t, A)); continue; }
    const th = t.thread;
    const last = A.byId.get(th.ids[th.ids.length - 1]);
    const spans = last.year !== t.year || last.month !== t.month ? `, continued until ${fmtDate(last.date)}` : '';
    if (th.size <= INLINE_THREAD_MAX) {
      out.push(`<section class="thread-in-list">${renderThread(th, A)}<p class="thread-foot"><a href="${tweetURL(t.id)}">Thread of ${plural(th.size, 'tweet')}${spans}</a></p></section>`);
    } else {
      const head = { ...th, ids: th.ids.slice(0, 3) };
      out.push(`<section class="thread-in-list truncated">${renderThread(head, A)}<p class="thread-foot"><a href="${tweetURL(t.id)}">Read the whole thread: ${plural(th.size, 'tweet')}${spans} →</a></p></section>`);
    }
  }
  return out.join('\n');
}

export function monthPage(A, year, month, tweets, { prev, next }) {
  const nav = pager([
    prev && { rel: 'prev', href: `/${prev.year}/${prev.month}/`, label: `← ${monthName(prev.month)} ${prev.year}` },
    { href: `/${year}/`, label: year },
    next && { rel: 'next', href: `/${next.year}/${next.month}/`, label: `${monthName(next.month)} ${next.year} →` },
  ]);
  const body = `<h1>${monthName(month)} ${year}</h1>
<p class="kicker">${plural(tweets.length, 'tweet')}</p>
${nav}
${monthListing(A, tweets)}
${nav}`;
  return page(A, {
    title: `${monthName(month)} ${year} — ${A.site.name}’s tweets`,
    description: `The ${plural(tweets.length, 'tweet')} @${A.handle} posted in ${monthName(month)} ${year}.`,
    path: `/${year}/${month}/`,
    body,
    bodyClass: 'month-page',
  });
}

export function yearPage(A, y, { prev, next, top }) {
  const months = [...y.months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const body = `<h1>${y.year}</h1>
<p class="kicker">${plural(y.count, 'tweet')}${y.photos ? ` · <a href="/photos/${y.year}/">${plural(y.photos, 'photo')}</a>` : ''}</p>
${pager([
  prev && { rel: 'prev', href: `/${prev.year}/`, label: `← ${prev.year}` },
  { href: '/years/', label: 'All years' },
  next && { rel: 'next', href: `/${next.year}/`, label: `${next.year} →` },
])}
<ul class="months">
${months.map((m) => `  <li><a href="/${y.year}/${m.month}/">${monthName(m.month)}</a><span class="count">${num(m.count)}</span></li>`).join('\n')}
</ul>
${top.length ? `<h2>Most liked in ${y.year}</h2>\n${top.map((t) => renderTweet(t, A)).join('\n')}` : ''}`;
  return page(A, {
    title: `${y.year} — ${A.site.name}’s tweets`,
    description: `The ${plural(y.count, 'tweet')} @${A.handle} posted in ${y.year}, month by month.`,
    path: `/${y.year}/`,
    body,
    bodyClass: 'year-page',
  });
}

export function yearsPage(A) {
  const rows = A.years.map((y) => {
    const cells = MONTHS.map((_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const m = y.months.get(mm);
      return m ? `<td><a href="/${y.year}/${mm}/" title="${monthName(mm)} ${y.year}">${num(m.count)}</a></td>` : '<td class="empty">·</td>';
    });
    return `  <tr><th scope="row"><a href="/${y.year}/">${y.year}</a></th>${cells.join('')}<td class="total">${num(y.count)}</td></tr>`;
  });
  const body = `<h1>Every month</h1>
<p class="kicker">${plural(A.stats.tweets, 'tweet')} over ${A.years.length} years</p>
<div class="table-scroll"><table class="calendar">
  <thead><tr><th></th>${MONTHS.map((m) => `<th scope="col" title="${m}">${m.slice(0, 1)}</th>`).join('')}<th>Total</th></tr></thead>
  <tbody>
${rows.join('\n')}
  </tbody>
</table></div>`;
  return page(A, { title: `Every month — ${A.site.name}’s tweets`, description: 'Tweets by month and year.', path: '/years/', body, bodyClass: 'years-page' });
}

export function indexPage(A, cfg, { top, random }) {
  const s = A.stats;
  const featured = cfg.featured.map((id) => A.byId.get(id)).filter(Boolean);
  const body = `<section class="intro">
  <h1>${plural(s.tweets, 'tweet')}, ${s.first.getUTCFullYear()}–${s.last.getUTCFullYear()}</h1>
  <p>${cfg.site.intro}</p>
  <p class="stats-line">${plural(s.threads, 'thread')} · ${plural(s.replies, 'reply', 'replies')} · ${plural(s.media, 'picture')} · ${plural(s.retweets, 'retweet')} not included</p>
  <p><button type="button" class="surprise" data-ids="${random.join(' ')}">Surprise me</button></p>
</section>
${featured.length ? `<section id="featured">
  <h2>Threads worth reading</h2>
${featured.map((t) => renderTweet(t, A)).join('\n')}
  <p class="more"><a href="/threads/">All ${num(s.threads)} threads →</a></p>
</section>` : ''}
<section id="years">
  <h2>By year</h2>
  <ul class="years">
${A.years.map((y) => `    <li><a href="/${y.year}/">${y.year}</a><span class="count">${num(y.count)}</span></li>`).join('\n')}
  </ul>
  <p class="more"><a href="/years/">Every month →</a></p>
</section>
<section id="top">
  <h2>Most liked</h2>
${top.map((t) => renderTweet(t, A)).join('\n')}
</section>`;
  const scripts = `<script>
document.querySelector('.surprise').addEventListener('click', (ev) => {
  const ids = ev.currentTarget.dataset.ids.split(' ');
  location.href = '/' + ids[Math.floor(Math.random() * ids.length)] + '.html';
});
</script>`;
  return page(A, {
    title: `${A.site.name} — ${A.site.tagline}`,
    description: `Everything @${A.handle} tweeted, ${s.first.getUTCFullYear()}–${s.last.getUTCFullYear()}: ${plural(s.tweets, 'tweet')}, searchable and browsable by year.`,
    path: '/',
    body,
    bodyClass: 'home',
    scripts,
  });
}

function threadItem(A, th) {
  const t = A.byId.get(th.root);
  return `<li><a href="${tweetURL(t.id)}" class="excerpt">${esc(titleFor(t, 140))}</a><span class="meta"><time datetime="${t.date.toISOString()}">${fmtDate(t.date)}</time> · ${plural(th.size, 'tweet')}${th.likes ? ` · ♥ ${num(th.likes)}` : ''}</span></li>`;
}

export function threadsPage(A, cfg) {
  const featured = cfg.featured.map((id) => A.byId.get(id)?.thread).filter(Boolean);
  const byYear = new Map();
  for (const th of A.threads) {
    const y = A.byId.get(th.root).year;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(th);
  }
  const years = [...byYear.keys()].sort().reverse();
  const body = `<h1>Threads</h1>
<p class="kicker">${plural(A.threads.length, 'thread')} of two tweets or more, ${plural(A.stats.threadTweets, 'tweet')} in all</p>
${featured.length ? `<section><h2>Worth reading</h2><ol class="thread-list featured">${featured.map((th) => threadItem(A, th)).join('\n')}</ol></section>` : ''}
${years.map((y) => `<section><h2 id="y${y}">${y}</h2><ol class="thread-list">${byYear.get(y).slice().reverse().map((th) => threadItem(A, th)).join('\n')}</ol></section>`).join('\n')}`;
  return page(A, { title: `Threads — ${A.site.name}’s tweets`, description: `Every thread @${A.handle} wrote, by year.`, path: '/threads/', body, bodyClass: 'threads-page' });
}

export function photosIndexPage(A) {
  const years = A.years.filter((y) => y.photos);
  const body = `<h1>Photos</h1>
<p class="kicker">${plural(years.reduce((n, y) => n + y.photos, 0), 'photo')} posted with tweets</p>
<ul class="years">
${years.map((y) => `  <li><a href="/photos/${y.year}/">${y.year}</a><span class="count">${num(y.photos)}</span></li>`).join('\n')}
</ul>`;
  return page(A, { title: `Photos — ${A.site.name}’s tweets`, description: 'Every photo posted with a tweet, by year.', path: '/photos/', body, bodyClass: 'photos-page' });
}

export function photosYearPage(A, y, { prev, next }) {
  const items = [];
  for (const m of [...y.months.values()].sort((a, b) => a.month.localeCompare(b.month))) {
    for (const t of m.tweets) {
      for (const p of t.media) {
        if (p.type !== 'photo' || p.missing) continue;
        const size = p.w && p.h ? ` width="${p.w}" height="${p.h}"` : '';
        items.push(`<a href="${tweetURL(t.id)}" title="${attr(titleFor(t))}"><img src="/media/${attr(p.file)}"${size} loading="lazy" alt=""></a>`);
      }
    }
  }
  const nav = pager([
    prev && { rel: 'prev', href: `/photos/${prev.year}/`, label: `← ${prev.year}` },
    { href: '/photos/', label: 'All years' },
    next && { rel: 'next', href: `/photos/${next.year}/`, label: `${next.year} →` },
  ]);
  const body = `<h1>Photos from ${y.year}</h1>
<p class="kicker">${plural(items.length, 'photo')} · <a href="/${y.year}/">the year’s tweets</a></p>
${nav}
<div class="photo-grid">${items.join('')}</div>
${nav}`;
  return page(A, { title: `Photos from ${y.year} — ${A.site.name}’s tweets`, description: `The ${plural(items.length, 'photo')} @${A.handle} posted in ${y.year}.`, path: `/photos/${y.year}/`, body, bodyClass: 'photos-page wide' });
}

export function searchPage(A) {
  const years = A.years.map((y) => [y.year, y.count]);
  const body = `<h1>Search</h1>
<tweet-search data-years="${attr(JSON.stringify(years))}" data-name="${attr(A.site.name)}" data-handle="${attr(A.handle)}" data-profile="${attr(A.site.profile)}" data-homepage="${attr(A.site.homepage)}">
  <noscript><p>Searching needs JavaScript. You can still browse <a href="/years/">by month</a> or <a href="/threads/">by thread</a>.</p></noscript>
</tweet-search>`;
  return page(A, {
    title: `Search — ${A.site.name}’s tweets`,
    description: `Search all ${plural(A.stats.tweets, 'tweet')} in the archive.`,
    path: '/search/',
    body,
    bodyClass: 'search-page',
    scripts: '<script type="module" src="/js/search.js"></script>',
  });
}

export function notFoundPage(A) {
  const body = `<h1>Not found</h1>
<p>There is no such page in the archive. Tweet permalinks look like <code>/${'‹id›'}.html</code>; you can also <a href="/search/">search</a>, browse <a href="/years/">by month</a>, or go <a href="/">home</a>.</p>`;
  return page(A, { title: `Not found — ${A.site.name}’s tweets`, path: '/404.html', body, bodyClass: 'error-page' });
}
