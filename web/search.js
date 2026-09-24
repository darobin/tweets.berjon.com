// <tweet-search>: the search page. Renders into the light DOM so the site's
// stylesheet applies; state lives in ./store.js.
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';
import { effect } from 'refrakt/signal.js';
import { app, results, paramsToState, stateToParams, wantsResults, segments, PAGE } from './store.js';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const num = (n) => n.toLocaleString('en-GB');
const plural = (n, word, words = `${word}s`) => `${num(n)} ${n === 1 ? word : words}`;

class TweetSearch extends SignalWatcher(LitElement) {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const d = this.dataset;
    this.who = { name: d.name, handle: d.handle, profile: d.profile, homepage: d.homepage };
    const years = JSON.parse(d.years || '[]');
    app.send({ type: 'init', patch: { years, ...paramsToState(new URLSearchParams(location.search)) } });
    // Keep the URL shareable, and follow back/forward.
    this.stopSync = effect(() => {
      const params = stateToParams(app.get());
      const url = params ? `${location.pathname}?${params}` : location.pathname;
      if (url !== location.pathname + location.search) history.replaceState(null, '', url);
    });
    this.onPop = () => app.send({ type: 'set', patch: paramsToState(new URLSearchParams(location.search)) });
    window.addEventListener('popstate', this.onPop);
  }

  disconnectedCallback() {
    this.stopSync?.();
    window.removeEventListener('popstate', this.onPop);
    super.disconnectedCallback();
  }

  firstUpdated() {
    const input = this.querySelector('input[type=search]');
    if (input && !app.get().q) input.focus();
  }

  set(patch) {
    app.send({ type: 'set', patch });
  }

  render() {
    const s = app.get();
    const r = results.get();
    const total = s.years.reduce((n, y) => n + y[1], 0);
    return html`
      <form class="search-controls" @submit=${(e) => e.preventDefault()}>
        <input type="search" .value=${s.q} placeholder="Search ${num(total)} tweets…" aria-label="Search tweets" autocomplete="off"
          @input=${(e) => this.set({ q: e.target.value })} @focus=${() => app.send({ type: 'prefetch' })}>
        <div class="filters">
          <label>Year
            <select .value=${s.year} @change=${(e) => this.set({ year: e.target.value })}>
              <option value="">all</option>
              ${s.years.map(([y, n]) => html`<option value=${y} ?selected=${y === s.year}>${y} (${num(n)})</option>`)}
            </select>
          </label>
          <label>Sort
            <select .value=${s.sort} @change=${(e) => this.set({ sort: e.target.value })}>
              <option value="newest" ?selected=${s.sort === 'newest'}>newest first</option>
              <option value="oldest" ?selected=${s.sort === 'oldest'}>oldest first</option>
              <option value="liked" ?selected=${s.sort === 'liked'}>most liked</option>
            </select>
          </label>
          <label><input type="checkbox" .checked=${s.media} @change=${(e) => this.set({ media: e.target.checked })}> only with pictures</label>
          <label><input type="checkbox" .checked=${s.replies} @change=${(e) => this.set({ replies: e.target.checked })}> include replies</label>
        </div>
      </form>
      ${this.renderStatus(s, r)}
      ${r.hits.length ? html`<ol class="results">${r.hits.slice(0, s.shown).map((row) => this.renderHit(row, r.terms))}</ol>` : nothing}
      ${r.hits.length > s.shown
        ? html`<p class="more"><button type="button" @click=${() => app.send({ type: 'more' })}>Show ${num(Math.min(PAGE, r.hits.length - s.shown))} more of ${num(r.hits.length - s.shown)}</button></p>`
        : nothing}
    `;
  }

  renderStatus(s, r) {
    if (!wantsResults(s)) {
      return html`<p class="search-status hint">Every word must appear; put <code>"a phrase"</code> in quotes; <code>-word</code> leaves tweets out. Or pick a year to page through it.</p>`;
    }
    const where = s.year ? ` in ${s.year}` : '';
    const parts = [];
    if (r.pending) parts.push(`loading ${r.ready}/${r.total} years…`);
    parts.push(`${plural(r.hits.length, 'tweet')}${where}${r.pending ? ' so far' : ''}`);
    return html`<p class="search-status${r.pending ? ' pending' : ''}">
      ${parts.join(' · ')}
      ${r.errors ? html` · ${plural(r.errors, 'year')} failed to load. <button type="button" class="link" @click=${() => app.send({ type: 'retry' })}>Retry</button>` : nothing}
    </p>`;
  }

  renderHit(row, terms) {
    const d = new Date(row.ts * 1000);
    const url = `/${row.id}.html`;
    const w = this.who;
    return html`<li class="tweet result" id="r-${row.id}">
      <div class="avatar"><a href=${w.profile}><img src="/media/avatar.jpg" alt="" width="48" height="48"></a></div>
      <div class="post">
        <div class="meta">
          <a class="name" href=${w.homepage}>${w.name}</a>
          <a class="handle" href=${w.profile}>@${w.handle}</a>
          <span class="sep">·</span>
          <a class="date" href=${url}><time datetime=${d.toISOString()}>${dateFmt.format(d)}</time></a>
        </div>
        <div class="content">${segments(row, terms).map((seg) => (seg.hit ? html`<mark>${seg.text}</mark>` : seg.text))}</div>
        <div class="stats">
          ${row.l ? html`<span class="likes">♥ ${num(row.l)}</span>` : nothing}
          ${row.r ? html`<span class="rts">↺ ${num(row.r)}</span>` : nothing}
          ${row.m & 2 ? html`<span class="flag">reply</span>` : nothing}
          ${row.m & 1 ? html`<a class="flag" href=${url}>with pictures</a>` : nothing}
          ${row.m & 4 ? html`<a class="thread-link" href=${url}>in a thread</a>` : nothing}
        </div>
      </div>
    </li>`;
  }
}

customElements.define('tweet-search', TweetSearch);
