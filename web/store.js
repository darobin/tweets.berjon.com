// Search state: one refrakt store, Elm-style. The component reads it through
// SignalWatcher and sends actions; loading the per-year index shards is a
// transactional effect, so a shard is fetched once no matter how fast you
// type, and results appear year by year as shards arrive.
import { store, tx } from 'refrakt/store.js';
import { computed } from 'refrakt/signal.js';
import { mergeAsync } from 'refrakt/iter.js';

export const PAGE = 50;
const SORTS = ['newest', 'oldest', 'liked'];

export const initialState = {
  q: '',
  year: '',
  media: false,
  replies: true,
  sort: 'newest',
  years: [], // [[year, count], …] from the page
  shards: {}, // year → 'loading' | 'ready' | 'error'
  rows: {}, // year → rows
  shown: PAGE,
};

export function paramsToState(params) {
  const patch = {};
  if (params.has('q')) patch.q = params.get('q');
  if (params.has('year')) patch.year = params.get('year');
  patch.media = params.get('media') === '1';
  patch.replies = params.get('replies') !== '0';
  if (SORTS.includes(params.get('sort'))) patch.sort = params.get('sort');
  return patch;
}

export function stateToParams(s) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.year) p.set('year', s.year);
  if (s.media) p.set('media', '1');
  if (!s.replies) p.set('replies', '0');
  if (s.sort !== 'newest') p.set('sort', s.sort);
  return p.toString();
}

const allYears = (s) => s.years.map((y) => y[0]);
const neededYears = (s) => (s.year ? [s.year] : allYears(s));
export const wantsResults = (s) => s.q.trim() !== '' || s.year !== '' || s.media;

// Mark the shards we need as loading and fetch them, in one transaction.
function withLoads(state, years) {
  const missing = years.filter((y) => !state.shards[y]);
  if (!missing.length) return tx(state);
  const shards = { ...state.shards };
  for (const y of missing) shards[y] = 'loading';
  return tx({ ...state, shards }, async function* () {
    yield* mergeAsync(...missing.map(fetchShard));
  });
}

async function* fetchShard(year) {
  try {
    const res = await fetch(`/search/${year}.json`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    const rows = data.rows.map((r) => ({ id: r[0], ts: r[1], t: r[2], f: fold(r[2]), m: r[3], l: r[4], r: r[5], y: year }));
    yield { type: 'loaded', year, rows };
  } catch (e) {
    yield { type: 'failed', year, error: String(e) };
  }
}

function update(state, action) {
  switch (action.type) {
    case 'init':
    case 'set': {
      const s = { ...state, ...action.patch, shown: PAGE };
      return wantsResults(s) ? withLoads(s, neededYears(s)) : tx(s);
    }
    case 'prefetch':
      return withLoads(state, neededYears(state));
    case 'loaded':
      return tx({ ...state, shards: { ...state.shards, [action.year]: 'ready' }, rows: { ...state.rows, [action.year]: action.rows } });
    case 'failed':
      return tx({ ...state, shards: { ...state.shards, [action.year]: 'error' } });
    case 'retry': {
      const shards = { ...state.shards };
      for (const [y, st] of Object.entries(shards)) if (st === 'error') delete shards[y];
      return withLoads({ ...state, shards }, neededYears(state));
    }
    case 'more':
      return tx({ ...state, shown: state.shown + PAGE });
    default:
      return tx(state);
  }
}

export const app = store(update, initialState);

// Case- and accent-insensitive, one output code unit per input code unit so
// that positions found in the folded text index straight into the original.
export function fold(s) {
  let out = '';
  for (const cp of s) {
    if (cp.length === 2) { out += cp; continue; }
    const base = cp.normalize('NFD')[0];
    const lower = base.toLowerCase();
    out += lower.length === 1 ? lower : base;
  }
  return out;
}

// Words and "quoted phrases" must all appear; a leading - excludes.
export function parseQuery(q) {
  const must = [];
  const not = [];
  const rx = /(-?)"([^"]*)"|(-?)(\S+)/g;
  let m;
  while ((m = rx.exec(q))) {
    const neg = m[1] === '-' || m[3] === '-';
    const term = (m[2] ?? m[4] ?? '').trim();
    if (!term) continue;
    (neg ? not : must).push(fold(term));
  }
  return { must, not };
}

export function search(s) {
  const { must, not } = parseQuery(s.q);
  const years = neededYears(s);
  const hits = [];
  let ready = 0;
  let pending = 0;
  let errors = 0;
  if (wantsResults(s)) {
    for (const y of years) {
      const st = s.shards[y];
      if (st !== 'ready') {
        if (st === 'loading') pending++;
        if (st === 'error') errors++;
        continue;
      }
      ready++;
      for (const r of s.rows[y]) {
        if (s.media && !(r.m & 1)) continue;
        if (!s.replies && r.m & 2) continue;
        if (!must.every((t) => r.f.includes(t))) continue;
        if (not.some((t) => r.f.includes(t))) continue;
        hits.push(r);
      }
    }
    if (s.sort === 'newest') hits.sort((a, b) => b.ts - a.ts);
    else if (s.sort === 'oldest') hits.sort((a, b) => a.ts - b.ts);
    else hits.sort((a, b) => b.l - a.l || b.ts - a.ts);
  }
  return { hits, terms: must, ready, pending, errors, total: years.length };
}

export const results = computed(() => search(app.get()));

// Split the original text into plain and matching segments.
export function segments(row, terms) {
  const ranges = [];
  for (const t of terms) {
    if (!t) continue;
    let i = row.f.indexOf(t);
    while (i !== -1) {
      ranges.push([i, i + t.length]);
      i = row.f.indexOf(t, i + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  const out = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: row.t.slice(pos, a) });
    out.push({ text: row.t.slice(a, b), hit: true });
    pos = b;
  }
  if (pos < row.t.length) out.push({ text: row.t.slice(pos) });
  return out;
}
