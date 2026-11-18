// Live market board. Trending feed follows the market-source record only; the CA record only drives row #1.
import { REGISTRY as R } from './registry.js';
import { countTo, flash } from './fx.js';

const M = R.market;
const CA = R.ca.state === 'stated' ? R.ca.value : null;
const BRAND_LOGO = 'assets/img/logo-128.png';
const VISIBLE_TRENDING = 9; // rows 2-10
const DASH = '—';

const $ = id => document.getElementById(id);
const rowsEl = $('rows'), tickerEl = $('ticker'), msgEl = $('boardMsg');
const num = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : NaN; };

/* ---------- formatting ---------- */
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
export const fmtPrice = v => {
  if (!Number.isFinite(v)) return DASH;
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1) return '$' + v.toFixed(3);
  const d = Math.min(12, Math.max(4, 2 - Math.floor(Math.log10(v || 1))));
  return '$' + v.toFixed(d);
};
export const fmtPct = v => (Number.isFinite(v) ? (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '') + v.toFixed(2) + '%' : DASH);
export const fmtUsd = v => (Number.isFinite(v) ? usdCompact.format(v) : DASH);

/* ---------- network: exponential backoff, no retry on definitive 4xx ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function fetchJSON(url, { retries = 3, base = 700, timeout = 8000 } = {}) {
  let err;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
      clearTimeout(t);
      if (res.ok) return await res.json();
      err = new Error('HTTP ' + res.status);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
    } catch (e) { clearTimeout(t); err = e; if (e.fatal) throw e; }
    if (i < retries) await sleep(base * 2 ** i + Math.random() * 250);
  }
  throw err;
}

/* ---------- data shaping ---------- */
const pickPair = (pairs, addr) => {
  const list = (Array.isArray(pairs) ? pairs : []).filter(p => p && (!addr || p.baseToken?.address === addr));
  list.sort((a, b) => (num(b.volume?.h24) || 0) - (num(a.volume?.h24) || 0));
  return list[0] || null;
};
const shape = (pair, addr) => pair && ({
  addr, sym: pair.baseToken?.symbol || DASH, name: pair.baseToken?.name || DASH,
  price: num(pair.priceUsd), chg: num(pair.priceChange?.h24), vol: num(pair.volume?.h24), liq: num(pair.liquidity?.usd),
  img: pair.info?.imageUrl || null, url: pair.pairAddress ? 'https://dexscreener.com/solana/' + pair.pairAddress : null,
});

async function loadTrending() {
  const boosts = await fetchJSON(M.boosts);
  const best = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b.chainId !== 'solana' || !b.tokenAddress) continue;
    const amt = num(b.totalAmount) || 0, cur = best.get(b.tokenAddress);
    if (!cur || amt > cur.amt) best.set(b.tokenAddress, { addr: b.tokenAddress, amt, icon: b.icon || null });
  }
  const top = [...best.values()].sort((a, b) => b.amt - a.amt).slice(0, M.limit);
  if (!top.length) throw new Error('empty');
  const got = await Promise.allSettled(top.map(t => fetchJSON(M.tokens + t.addr, { retries: 2 })));
  const out = [];
  got.forEach((g, i) => {
    if (g.status !== 'fulfilled') return;
    const s = shape(pickPair(g.value, top[i].addr) || pickPair(g.value), top[i].addr);
    if (s) { s.img = s.img || top[i].icon; out.push(s); }
  });
  if (!out.length) throw new Error('no pairs');
  return out;
}

/* ---------- state ---------- */
const S = { trending: null, dex: null, pump: null, ownDexErr: false, ownPumpErr: false, status: 'loading', firstPaint: true };
const els = new Map(); // key -> row element
let ownEl = null;

/* ---------- row construction ---------- */
function tile(candidates, sym) {
  const t = document.createElement('div'); t.className = 'tile';
  const list = candidates.filter(Boolean);
  const letter = () => { t.textContent = (sym && sym !== DASH ? sym[0] : '?').toUpperCase(); };
  const next = () => {
    const src = list.shift();
    if (!src) { t.replaceChildren(); letter(); return; }
    const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
    im.onerror = next; im.onload = () => t.replaceChildren(im);
    im.src = src;
  };
  letter(); next();
  return t;
}
function cell(cls) { const d = document.createElement('div'); d.className = cls; return d; }
function buildRow(tag) {
  const row = document.createElement(tag); row.className = 'row';
  const rk = cell('rk'), tok = cell('tok'), tt = cell('tok-t');
  const sym = document.createElement('span'), nm = document.createElement('span');
  sym.className = 'sym'; nm.className = 'nm'; tt.append(sym, nm);
  tok.append(cell('tile'), tt);
  const price = cell('num c-price'), chg = cell('num chg c-chg r'), vol = cell('num c-vol r'), liq = cell('num c-liq r');
  row.append(rk, tok, price, chg, vol, liq);
  row._ = { rk, tok, sym, nm, price, chg, vol, liq };
  return row;
}
function setSkeleton(row) {
  const c = row._;
  c.tok.querySelector('.tile').replaceChildren(); c.tok.querySelector('.tile').className = 'tile skel';
  c.sym.className = 'sym skel skel-line l'; c.sym.textContent = ''; c.nm.textContent = '';
  for (const k of ['price', 'chg', 'vol', 'liq']) { c[k].textContent = ''; c[k].classList.add('skel', 'skel-line'); delete c[k].dataset.v; }
}
function clearSkeleton(row) {
  const c = row._;
  c.sym.className = 'sym'; for (const k of ['price', 'chg', 'vol', 'liq']) c[k].classList.remove('skel', 'skel-line');
}
function setNum(el, val, fmt, isChg) {
  const prev = el.dataset.v === undefined ? NaN : +el.dataset.v;
  if (!Number.isFinite(val)) { el.textContent = DASH; el.dataset.v = ''; if (isChg) el.classList.remove('up', 'down'); return; }
  if (el.dataset.v === '' || Number.isNaN(prev)) { el.textContent = fmt(val); }
  else if (prev !== val) { countTo(el, prev, val, fmt); flash(el, val > prev ? 1 : -1); }
  el.dataset.v = String(val);
  if (isChg) { el.classList.toggle('up', val > 0); el.classList.toggle('down', val < 0); }
}
function fill(row, rank, d, tileSources) {
  clearSkeleton(row);
  const c = row._;
  c.rk.textContent = String(rank);
  const key = d.sym + '|' + (tileSources || []).join('|');
  if (row.dataset.tk !== key) {
    row.dataset.tk = key;
    const old = c.tok.firstElementChild, nw = tile(tileSources || [d.img], d.sym);
    old.replaceWith(nw);
  }
  c.sym.firstChild && c.sym.firstChild.nodeType === 3 ? (c.sym.firstChild.nodeValue = d.sym) : (c.sym.textContent = d.sym);
  c.nm.textContent = d.name;
  setNum(c.price, d.price, fmtPrice); setNum(c.chg, d.chg, fmtPct, true);
  setNum(c.vol, d.vol, fmtUsd); setNum(c.liq, d.liq, fmtUsd);
}
function fillDash(row, rank, label, tileSources) {
  clearSkeleton(row);
  const c = row._;
  c.rk.textContent = String(rank); c.sym.textContent = DASH; c.nm.textContent = label;
  const old = c.tok.firstElementChild; old.replaceWith(tile(tileSources || [], DASH));
  for (const k of ['price', 'chg', 'vol', 'liq']) { c[k].textContent = DASH; c[k].dataset.v = ''; }
  c.chg.classList.remove('up', 'down');
}

/* ---------- own row (#1) ---------- */
function ensureOwn() {
  if (ownEl) return ownEl;
  ownEl = buildRow(CA ? 'a' : 'div'); ownEl.classList.add('own', 'enter'); ownEl.style.setProperty('--i', 0);
  rowsEl.prepend(ownEl);
  return ownEl;
}
function renderOwn() {
  const row = ensureOwn(), c = row._;
  if (!CA) {
    // placeholder: brand logo tile (not a letter tile), inert, ownPulse still runs via .own
    row.classList.add('placeholder'); row.setAttribute('aria-disabled', 'true');
    clearSkeleton(row); c.rk.textContent = '1';
    const t = document.createElement('div'); t.className = 'tile'; const im = new Image(); im.src = BRAND_LOGO; im.alt = 'Spytrix eye mark'; t.append(im);
    c.tok.firstElementChild.replaceWith(t);
    c.sym.textContent = 'SPYTRIX'; const tg = document.createElement('span'); tg.className = 'own-tag'; tg.textContent = 'OURS'; c.sym.append(tg);
    c.nm.textContent = 'Awaiting launch';
    for (const k of ['price', 'chg', 'vol', 'liq']) c[k].textContent = '· · · · ·';
    return;
  }
  const dex = S.dex, pump = S.pump;
  if (!dex && !pump) {
    if (S.ownDexErr && S.ownPumpErr) fillDash(row, 1, 'No data yet', [BRAND_LOGO]); else if (!row.dataset.sk) { row.dataset.sk = 1; setSkeleton(row); }
    return;
  }
  const d = {
    sym: dex?.sym && dex.sym !== DASH ? dex.sym : (pump?.symbol || DASH),
    name: dex?.name && dex.name !== DASH ? dex.name : (pump?.name || DASH),
    price: dex ? dex.price : NaN, chg: dex ? dex.chg : NaN, vol: dex ? dex.vol : NaN, liq: dex ? dex.liq : NaN,
  };
  fill(row, 1, d, [pump?.image_uri, dex?.img, BRAND_LOGO]);
  c.sym.querySelector('.own-tag') || c.sym.append(Object.assign(document.createElement('span'), { className: 'own-tag', textContent: 'OURS' }));
  row.href = dex?.url || 'https://dexscreener.com/solana/' + CA; row.target = '_blank'; row.rel = 'noopener noreferrer';
}

/* ---------- trending rows ---------- */
function renderTrending() {
  const list = (S.trending || []).filter(d => d.addr !== CA).slice(0, VISIBLE_TRENDING); // dedupe against own row
  const seen = new Set(); let i = 0;
  for (const d of list) {
    seen.add(d.addr); i++;
    let row = els.get(d.addr);
    if (!row) {
      row = buildRow(d.url ? 'a' : 'div'); row.classList.add('enter'); els.set(d.addr, row);
    } else row.classList.remove('enter');
    if (!row.classList.contains('enter')) row.style.removeProperty('--i'); else row.style.setProperty('--i', i);
    fill(row, i + 1, d, [d.img]);
    if (d.url) { row.href = d.url; row.target = '_blank'; row.rel = 'noopener noreferrer'; }
    rowsEl.append(row); // append in order (re-appending reorders)
  }
  for (const [k, row] of els) if (!seen.has(k)) { els.delete(k); row.remove(); }
  for (const s of rowsEl.querySelectorAll('.row.sk, .row.err')) s.remove();
}
function renderSkeleton() {
  for (let i = 0; i < VISIBLE_TRENDING; i++) {
    const row = buildRow('div'); row.classList.add('sk'); row._.rk.textContent = String(i + 2); setSkeleton(row); rowsEl.append(row);
  }
}
function renderErrorRows() {
  for (const s of rowsEl.querySelectorAll('.row.sk, .row.err')) s.remove();
  for (let i = 0; i < VISIBLE_TRENDING; i++) {
    const row = buildRow('div'); row.classList.add('err', 'fade-in'); row.style.setProperty('--i', i);
    fillDash(row, i + 2, 'Source unreachable', []); rowsEl.append(row);
  }
}

/* ---------- ticker ---------- */
function renderTicker() {
  const items = S.trending;
  tickerEl.replaceChildren();
  if (!items) {
    for (let i = 0; i < 8; i++) { const s = document.createElement('span'); s.innerHTML = '<i class="skel skel-chip"></i>'; tickerEl.append(s); }
    return;
  }
  if (!items.length) return;
  const mk = d => {
    const s = document.createElement('span');
    s.innerHTML = '<b class="sym"></b><em></em><em class="ch"></em>';
    s.querySelector('.sym').textContent = d.sym; s.children[1].textContent = fmtPrice(d.price);
    const ch = s.querySelector('.ch'); ch.textContent = fmtPct(d.chg); ch.className = 'ch ' + (d.chg > 0 ? 'up' : d.chg < 0 ? 'down' : '');
    s.querySelectorAll('em').forEach(e => { e.style.fontStyle = 'normal'; });
    s.style.gap = '14px';
    return s;
  };
  // two identical halves so translateX(-50%) loops seamlessly
  for (let k = 0; k < 2; k++) for (const d of items) tickerEl.append(mk(d));
}
function renderTickerError() {
  tickerEl.replaceChildren();
  for (let k = 0; k < 8; k++) { const s = document.createElement('span'); s.textContent = DASH + ' market source offline'; tickerEl.append(s); }
}

/* ---------- status ---------- */
const COPY = {
  loading: ['Loading', 'Connecting to the market', 'Pulling live data'],
  live: ['Live', 'Streaming from mainnet', 'Refreshes each minute while this tab is in view'],
  retry: ['Retrying', 'Reconnecting to the feed', 'Holding the last good data while we retry'],
  offline: ['Source offline', 'Market feed offline', 'Market source unreachable, retrying'],
};
function setStatus(s) {
  S.status = s; const [a, b, c] = COPY[s];
  for (const [id, txt] of [['boardPill', a], ['heroPill', b]]) { $(id).dataset.state = s; }
  $('boardPillText').textContent = a; $('heroPillText').textContent = b; msgEl.textContent = c;
  document.documentElement.dataset.market = s;
}

/* ---------- loops ---------- */
async function trendingCycle() {
  try {
    S.trending = await loadTrending();
    renderTrending(); renderTicker(); setStatus('live');
  } catch {
    if (S.trending) { setStatus('retry'); } // keep last good data on refresh failure
    else { renderErrorRows(); renderTickerError(); setStatus('offline'); }
  }
}
function ownCycle() {
  // pump.fun and DexScreener run in parallel; neither awaits the other, each paints on its own arrival
  const a = fetchJSON(M.ownDex + CA).then(j => { const p = pickPair(j?.pairs, CA) || pickPair(j?.pairs); if (p) { S.dex = shape(p, CA); S.ownDexErr = false; } else if (!S.dex) S.ownDexErr = true; })
    .catch(() => { if (!S.dex) S.ownDexErr = true; }).finally(renderOwn);
  const b = fetchJSON(M.ownPump + CA, { retries: 1 }).then(j => { if (j && typeof j === 'object') { S.pump = j; S.ownPumpErr = false; } })
    .catch(() => { if (!S.pump) S.ownPumpErr = true; }).finally(renderOwn);
  return Promise.allSettled([a, b]);
}

let timer = 0, busy = false;
async function cycle() {
  if (busy) return; busy = true;
  try { await Promise.allSettled([trendingCycle(), CA ? ownCycle() : null]); } finally { busy = false; schedule(); }
}
function schedule() { clearTimeout(timer); if (!document.hidden) timer = setTimeout(cycle, M.pollMs); }

export function initMarket() {
  setStatus('loading');
  renderOwn(); renderSkeleton(); renderTicker();
  cycle();
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else cycle(); });
}
