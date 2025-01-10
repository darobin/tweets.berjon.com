
export default function ({ id, avatarURL, date, text, entities,extendedEntities, needsCopying }) {
  const d = new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(/(\d\d:\d\d):.*/, '$1')
  ;
  return `<section id="tweet-${id}">
  <div class="avatar">
    <a href="https://robin.berjon.com/"><img src="${avatarURL}" alt="Robin Berjon"></a>
  </div>
  <div class="post">
    <div class="meta">
      <a href="https://berjon.com/">Robin Berjon</a>
      <a href="https://robin.berjon.com/">@robinberjon</a>
      ·
      <a href="#tweet-${id}"><time>${d}</time></a>
    </div>
    <div class="content">${markTextUp(id, text, entities, extendedEntities, needsCopying)}</div>

  </div>
</section>
`;
}

function markTextUp (id, text, entities, extendedEntities, needsCopying) {
  const markups = [];
  // XXX QTs
  ['hashtags', 'symbols', 'user_mentions', 'urls', 'media'].forEach(kind => {
    if (!entities[kind]) return;
    (kind === 'media' ? extendedEntities : entities)[kind].forEach(ent => markups.push({ kind, ...ent }));
  });
  markups
    .sort((a, b) => b.indices[0] - a.indices[0])
    .forEach(m => {
      const rx = new RegExp(`([\\s\\S]{${m.indices[0]}})([\\s\\S]{${m.indices[1] - m.indices[0]}})`);
      if (!rx.test(text)) console.warn(`Failed to match ${id} with ${rx}`);
      text = text.replace(rx, (_, pfx, str) => {
        // console.warn(m.indices[0], m.indices[1], `${pfx} -> ${str}`);
        if (m.kind === 'urls') {
          // https://twitter.com/robinberjon/status/1477498379047473153
          let url = m.expanded_url;
          let display = m.display_url;
          if (/https:\/\/twitter\.com\/robinberjon\/status\/\d+/.test(url)) {
            display = url.replace(/.*\//, 'https://tweets.berjon.com/').replace(/\?.*/, '').replace(/#.*/, '');
            url = display + '.html';
          }
          return `${pfx}<a href="${url}">${display}</a>`;
        }
        if (m.kind === 'hashtags') return `${pfx}<a href="https://bsky.app/hashtag/${m.text}">${str}</a>`;
        // People who xited before this archive don't show up as mentions in the export.
        // We could detect and fix.
        if (m.kind === 'user_mentions') return `${pfx}<a href="https://duckduckgo.com/?q=${encodeURIComponent(m.name)}" title="${m.name}">${str}</a>`;
        if (m.kind === 'media') {
          if (m.type === 'animated_gif') {
            const src = `${id}-${m.video_info.variants[0].url.replace(/.*\//, '')}`;
            needsCopying.push(src);
            return `${pfx}<video src="/media/${src}" width="${m.sizes.large.w}" height="${m.sizes.large.h}" autoplay preload="auto" disablepictureinpicture loop playsinline></video>`;
          }
          if (m.type === 'photo') {
            const src = `${id}-${m.media_url_https.replace(/.*\//, '')}`;
            needsCopying.push(src);
            return `${pfx}<img src="/media/${src}" width="${m.sizes.large.w}" height="${m.sizes.large.h}">`;
          }
          console.warn(`Unknown type ${m.type}`);
        }
        if (m.kind === 'symbols') console.warn(`SYMBOL\n`, JSON.stringify(m, null, 2));
        return pfx + str;
      });
    })
  ;
  return text;
}
