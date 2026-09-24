// Turn a tweet into HTML. The text in the export is HTML-escaped (&amp; &lt;
// &gt;) and entity indices count Unicode code points over that escaped text,
// so all slicing here happens on an array of code points — never on the
// string itself, where emoji are two units long. Several media entities
// share one range (the single t.co link at the end of a multi-photo tweet),
// so media is grouped by range and rendered once, after the text.

export const AVATAR = '/media/avatar.jpg';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const fmtDate = (d) => dateFmt.format(d);
export const fmtDateTime = (d) => `${dateFmt.format(d)}, ${timeFmt.format(d)} UTC`;
export const monthName = (mm) => MONTHS[Number(mm) - 1];
export const num = (n) => n.toLocaleString('en-GB');
export const plural = (n, word, words = `${word}s`) => `${num(n)} ${n === 1 ? word : words}`;
export const tweetURL = (id) => `/${id}.html`;
export const monthURL = (t) => `/${t.year}/${t.month}/`;

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export const attr = esc;

// The export escapes exactly these three in tweet text.
export function unescapeText(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// All entities as non-overlapping ranges in code points, in text order.
function entities(t) {
  const list = [];
  for (const h of t.hashtags) list.push({ kind: 'hashtag', ...h });
  for (const s of t.symbols) list.push({ kind: 'symbol', ...s });
  for (const m of t.mentions) list.push({ kind: 'mention', ...m });
  for (const u of t.urls) list.push({ kind: 'url', ...u });
  for (const g of t.mediaGroups) list.push({ kind: 'media', ...g });
  list.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let pos = 0;
  for (const e of list) {
    if (e.start < pos) continue;
    out.push(e);
    pos = e.end;
  }
  return out;
}

export function renderContent(t, A) {
  const cps = Array.from(t.text);
  let out = '';
  let pos = t.textStart;
  for (const e of entities(t)) {
    if (e.start < pos) continue;
    out += textSegment(cps.slice(pos, e.start).join(''));
    out += renderEntity(e, cps.slice(e.start, e.end).join(''), t, A);
    pos = e.end;
  }
  out += textSegment(cps.slice(pos).join(''));
  return out.trim();
}

// Plain prose between entities. Old tweets predate t.co and carry bare URLs
// with no entity, so link those too.
function textSegment(s) {
  return s.replace(/\bhttps?:\/\/[^\s<]+/g, (m) => {
    const trail = /[.,;:!?]+$/.exec(m)?.[0] || '';
    const url = m.slice(0, m.length - trail.length);
    return `<a href="${attr(unescapeText(url))}">${url}</a>${trail}`;
  });
}

function renderEntity(e, orig, t, A) {
  switch (e.kind) {
    case 'hashtag':
      return `<a class="tag" href="/search/?q=${encodeURIComponent('#' + e.text)}">${orig}</a>`;
    case 'symbol':
      return `<a class="tag" href="/search/?q=${encodeURIComponent('$' + e.text)}">${orig}</a>`;
    case 'mention':
      // People who left before the export was made are not resolvable on
      // Twitter any more; a search for their name is the most useful link.
      return `<a class="mention" href="https://duckduckgo.com/?q=${encodeURIComponent(e.name)}" title="${attr(e.name)}">${orig}</a>`;
    case 'url': {
      if (e.hidden) return '';
      const own = /twitter\.com\/(\w+)\/status\/(\d+)/i.exec(e.expanded_url);
      if (own && own[1].toLowerCase() === A.handle.toLowerCase() && A.byId.has(own[2])) {
        const target = A.byId.get(own[2]);
        return `<a class="own-link" href="${tweetURL(own[2])}" title="${attr(titleFor(target))}">${A.site.url.replace(/^https?:\/\//, '')}/${own[2]}</a>`;
      }
      return `<a href="${attr(e.expanded_url)}" title="${attr(e.expanded_url)}">${esc(e.display_url)}</a>`;
    }
    case 'media':
      return '';
    default:
      return orig;
  }
}

export function renderMedia(t, { lazy = true } = {}) {
  const items = t.media;
  if (!items.length) return '';
  const present = items.filter((m) => !m.missing);
  const parts = present.map((m) => {
    const size = m.w && m.h ? ` width="${m.w}" height="${m.h}"` : '';
    const src = `/media/${attr(m.file)}`;
    if (m.type === 'photo') {
      return `<a class="photo" href="${src}"><img src="${src}"${size}${lazy ? ' loading="lazy"' : ''} alt=""></a>`;
    }
    if (m.type === 'gif') {
      return `<video class="gif" src="${src}"${size} autoplay muted loop playsinline preload="${lazy ? 'metadata' : 'auto'}"></video>`;
    }
    return `<video src="${src}"${size} controls playsinline preload="metadata"></video>`;
  });
  const missing = items.length - present.length;
  if (missing) parts.push(`<p class="media-missing">${plural(missing, 'image is', 'images are')} missing from the export.</p>`);
  return `<div class="media count-${present.length}">${parts.join('')}</div>`;
}

function renderQuote(t, A, depth) {
  const q = t.quote;
  if (!q) return '';
  if (q.embedded && depth < 1) {
    return `<blockquote class="quote">${renderTweet(A.byId.get(q.id), A, { quoted: true, depth: depth + 1 })}</blockquote>`;
  }
  const url = `https://x.com/${attr(q.user)}/status/${q.id}`;
  const what = q.own ? 'an earlier tweet of mine (no longer available)' : `a tweet by @${esc(q.user)}`;
  return `<a class="quote-link" href="${url}" rel="nofollow">Quoting ${what} ↗</a>`;
}

function renderReplyLine(t, A, { inThread }) {
  const r = t.replyTo;
  if (!r) return '';
  if (r.mine && inThread) return '';
  const others = t.leadingMentions.filter((u) => u.toLowerCase() !== (r.user || '').toLowerCase() && u.toLowerCase() !== A.handle.toLowerCase());
  let target;
  if (r.mine) {
    target = A.byId.has(r.id)
      ? `<a href="${tweetURL(r.id)}">an earlier tweet of mine</a>`
      : 'an earlier tweet of mine (no longer available)';
  } else {
    target = `<a href="https://x.com/${attr(r.user)}/status/${r.id}" rel="nofollow">@${esc(r.user)}</a>`;
  }
  const rest = others.length ? ` and ${others.map((u) => `@${esc(u)}`).join(', ')}` : '';
  return `<p class="reply-to">Replying to ${target}${rest}</p>`;
}

export function renderTweet(t, A, opts = {}) {
  const { quoted = false, depth = 0, inThread = false, showThreadLink = true } = opts;
  const site = A.site;
  const isMember = t.root && t.root !== t.id;
  const dateHref = inThread && isMember ? `#tweet-${t.id}` : tweetURL(t.id);
  const iso = t.date.toISOString();
  const lang = t.lang && t.lang !== 'en' ? ` lang="${t.lang}"` : '';
  const stats = [];
  if (t.likes) stats.push(`<span class="likes" title="${num(t.likes)} likes">♥ ${num(t.likes)}</span>`);
  if (t.retweets) stats.push(`<span class="rts" title="${num(t.retweets)} retweets">↺ ${num(t.retweets)}</span>`);
  if (showThreadLink && !quoted) {
    if (t.thread) stats.push(`<a class="thread-link" href="${tweetURL(t.id)}">Thread · ${plural(t.thread.size, 'tweet')}</a>`);
    else if (isMember && !inThread) stats.push(`<a class="thread-link" href="${tweetURL(t.root)}#tweet-${t.id}">Part of a thread</a>`);
  }
  const via = t.source ? ` title="via ${attr(t.source)}"` : '';
  return `<article class="tweet${quoted ? ' quoted' : ''}" id="${quoted ? 'quoted-' : 'tweet-'}${t.id}"${lang}>
  <div class="avatar"><a href="${site.profile}"><img src="${AVATAR}" alt="" width="48" height="48"></a></div>
  <div class="post">
    <div class="meta">
      <a class="name" href="${site.homepage}">${esc(site.name)}</a>
      <a class="handle" href="${site.profile}">@${esc(A.handle)}</a>
      <span class="sep">·</span>
      <a class="date" href="${dateHref}"${via}><time datetime="${iso}" title="${fmtDateTime(t.date)}">${fmtDate(t.date)}</time></a>
    </div>
    ${renderReplyLine(t, A, { inThread })}
    <div class="content">${renderContent(t, A)}</div>
    ${renderMedia(t)}
    ${quoted ? '' : renderQuote(t, A, depth)}
    ${stats.length ? `<div class="stats">${stats.join('')}</div>` : ''}
  </div>
</article>`;
}

export function renderThread(thread, A) {
  return `<div class="thread">${thread.ids.map((id) => renderTweet(A.byId.get(id), A, { inThread: true, showThreadLink: false })).join('\n')}</div>`;
}

// The tweet as text: for search, titles, and descriptions. Media links go,
// t.co links become what they point at.
export function plainText(t, { urls = 'display', leading = true } = {}) {
  const cps = Array.from(t.text);
  let out = '';
  let pos = leading ? 0 : t.textStart;
  for (const e of entities(t)) {
    if (e.start < pos) continue;
    out += cps.slice(pos, e.start).join('');
    if (e.kind === 'url') {
      if (!e.hidden) out += urls === 'expanded' ? e.expanded_url : e.display_url;
    } else if (e.kind !== 'media') {
      out += cps.slice(e.start, e.end).join('');
    }
    pos = e.end;
  }
  out += cps.slice(pos).join('');
  return unescapeText(out).trim();
}

export function titleFor(t, max = 90) {
  const line = plainText(t, { leading: false }).replace(/\s+/g, ' ').trim() || plainText(t).replace(/\s+/g, ' ').trim();
  return truncate(line, max) || `Tweet from ${fmtDate(t.date)}`;
}

export function descriptionFor(t, max = 300) {
  return truncate(plainText(t, { leading: false }).replace(/\s+/g, ' ').trim(), max);
}

export function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max / 2 ? cut.slice(0, sp) : cut) + '…';
}
