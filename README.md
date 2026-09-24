# tweets.berjon.com

The archive of my tweets: a static site generated from the Twitter export,
published to the supramundane server with an rsync.

```
archive.json      where the export lives, site settings, featured threads
build/            the generator
  index.js          builds site/ (pages, search index, media)
  archive.js        loads the export into a model: tweets, threads, quotes, media
  render.js         a tweet → HTML (entities, media, quotes, replies)
  templates.js      the pages
  bundle.js         esbuild for the search app
  serve.js          local preview server, with the same URL rules as production
  publish.js        build + rsync to the server
web/              the search app (Lit + refrakt), bundled to site/js/search.js
public/           static assets copied as-is (css, fonts)
deploy/           the `sm` service (Dockerfile, Caddyfile, service.json, compose)
site/             build output (git-ignored: 42k pages and 375MB of media)
```

## Building

The Twitter export is not in the repo (it contains DMs and other things that
must never be published). Point `source` in `archive.json`, or the
`TWITTER_ARCHIVE` environment variable, at the unzipped export directory.

```sh
npm install
npm run build        # site/ — about ten seconds, media copied incrementally
npm run serve        # http://localhost:4320/
npm run dev          # both
```

## What it makes

- **One page per tweet**, at `/<id>.html` (and `/<id>`), so that any old
  `twitter.com/robinberjon/status/<id>` link maps onto the archive. A tweet in
  a thread redirects into the thread's page, at its anchor, as before.
- **Threads**: any tweet with self-replies gets its whole thread on its page,
  in order, including threads that start as a reply to someone else.
- **Quote tweets** of my own tweets are embedded; quotes of other people's
  link out, since their content is not in the export.
- **Replies** show who they were replying to, and the leading @mentions move
  out of the text and into that line, as Twitter displays them.
- **Media**: photos in a grid (all of them, even when several share one link),
  GIFs playing inline, videos with controls. Emoji before a link no longer
  shift the markup: entity indices count code points, and so does the renderer.
- **Browsing**: months (`/2020/01/`), years, a month-by-month table, all
  threads, photos by year, most-liked, previous/next between tweets, and a
  "surprise me" button.
- **Search** (`/search/`): every word must match, `"quoted phrases"`, `-word`
  to exclude, filters by year, pictures, and replies, three sort orders,
  shareable URLs. The index is one JSON shard per year, fetched on demand, and
  results appear as shards arrive. State is a refrakt store; the element is a
  light-DOM Lit component so the site stylesheet applies.
- Dark mode, Open Graph tags, and a 404 page.

Retweets (including the old manual `RT @user` form) are left out. The four
featured threads in `archive.json` get pride of place on the home page.

## Publishing (supramundane / `sm`)

`deploy/` is an `sm` static service named `tweets-berjon-com` whose Caddy
serves `/data`, the service's data volume, rather than files baked into the
image. Set up once (and again only if `deploy/` changes):

```sh
export SUPRAMUNDANE=<server> SM_REMOTE_USER=root   # as for sm itself
npm run sm:deploy          # = cd deploy && sm deploy
npm run publish:site       # build, then rsync site/ into the data volume
```

`build/publish.js` reads the same environment (`SUPRAMUNDANE`,
`SM_REMOTE_USER`, `SM_DATA_ROOT`) and rsyncs `site/` to
`$SM_DATA_ROOT/tweets-berjon-com/`; `--no-build` skips the build. The first
push moves about 400MB; later ones only what changed.

DNS for `tweets.berjon.com` has to point at the supramundane server for the
front proxy to obtain its certificate.
