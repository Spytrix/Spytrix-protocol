// Motion + interaction layer. Every effect checks REDUCED and falls back to the final state instantly.
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Damped spring solver (semi-implicit Euler, fixed 1/240s substeps). Drives p from 0 to 1 with natural overshoot. */
export function spring(onUpdate, { stiffness = 170, damping = 20, mass = 1 } = {}) {
  return new Promise(resolve => {
    let x = 0, v = 0, last = performance.now();
    const step = now => {
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        v += ((-stiffness * (x - 1) - damping * v) / mass) * h;
        x += v * h; dt -= h;
      }
      onUpdate(x);
      if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.002) { onUpdate(1); resolve(); } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function initReveal() {
  const els = [...document.querySelectorAll('.reveal')];
  const show = el => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('in'); };
  if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(show); return; }
  els.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translate3d(0,20px,0)'; });
  document.documentElement.classList.remove('anim'); // inline styles now own the pre-state
  const queue = new Map();
  const io = new IntersectionObserver(entries => {
    const hits = entries.filter(e => e.isIntersecting);
    hits.forEach((e, i) => {
      io.unobserve(e.target);
      const t = setTimeout(() => {
        const el = e.target;
        spring(p => { el.style.opacity = String(Math.min(1, Math.max(0, p))); el.style.transform = `translate3d(0,${(1 - p) * 20}px,0)`; })
          .then(() => show(el));
      }, Math.min(i, 3) * 60);
      queue.set(e.target, t);
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => io.observe(el));
}

export function initProgress() {
  const top = document.getElementById('top');
  const bar = document.querySelector('.progress');
  const on = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    bar.style.setProperty('--sp', String(Math.min(1, scrollY / max)));
    top.classList.toggle('scrolled', scrollY > 10);
  };
  on(); addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
  // keep --hdr-h in sync with the real sticky header height
  const sync = () => document.documentElement.style.setProperty('--hdr-h', top.offsetHeight + 'px');
  sync(); if ('ResizeObserver' in window) new ResizeObserver(sync).observe(top); else addEventListener('resize', sync);
}

export function initParallax() {
  const layers = [...document.querySelectorAll('.layer[data-depth]')];
  const hero = document.getElementById('hero');
  if (REDUCED || !layers.length) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, raf = 0;
  const tick = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    const r = hero.getBoundingClientRect();
    sy = Math.max(0, -r.top);
    for (const el of layers) {
      const d = +el.dataset.depth;
      el.style.setProperty('--px', (cx * d * 18).toFixed(2) + 'px');
      el.style.setProperty('--py', (cy * d * 14 + sy * d * 0.12).toFixed(2) + 'px');
    }
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 || r.bottom > 0) ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('pointermove', e => { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; kick(); }, { passive: true });
  addEventListener('scroll', kick, { passive: true });
  kick();
}

export function initSpotlight() {
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('.spot, a.row');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

export function initScrollSpy() {
  const links = [...document.querySelectorAll('#navlinks a')];
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a === map.get(e.target.id))); }), { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

export function initNav() {
  const top = document.getElementById('top'), burger = document.getElementById('burger');
  burger.addEventListener('click', () => { const o = top.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
  document.querySelectorAll('#navlinks a').forEach(a => a.addEventListener('click', () => { top.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));
}

let toastT;
export function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500);
}

export function initCA() {
  const bar = document.getElementById('caBar'), btn = document.getElementById('caCopy'), addr = document.getElementById('caAddr');
  if (bar.dataset.state !== 'stated') return; // inert until the CA record is stated
  const value = addr.textContent.trim();
  const doCopy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch {} ta.remove();
    }
    btn.textContent = ok ? 'Copied' : 'Copy failed'; btn.classList.toggle('done', ok);
    toast(ok ? 'Contract address copied' : 'Could not copy - select it manually');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
  };
  btn.addEventListener('click', doCopy); addr.addEventListener('click', doCopy);
}

/* count-up between numeric values with a flash on change */
export function countTo(el, from, to, fmt, ms = 700) {
  if (REDUCED || !isFinite(from) || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const run = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(run); else el.textContent = fmt(to);
  };
  requestAnimationFrame(run);
}
export function flash(el, dir) {
  if (REDUCED) return;
  const c = dir > 0 ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(c);
  el.addEventListener('animationend', () => el.classList.remove(c), { once: true });
}
