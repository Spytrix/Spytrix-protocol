// Hero canvas: Halton-scattered "watcher" glyphs (almond eye + iris) drifting on the reference's -9..-21 degree volley.
// Outside the band they are solid; inside the band they turn into wireframe ghosts. Colours come from CSS tokens.
import { REDUCED } from './fx.js';

export function initVeil() {
  const canvas = document.getElementById('veil');
  const band = document.getElementById('band');
  if (!canvas || !band) return;
  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const IVORY = css.getPropertyValue('--c-ivory').trim();
  const AMBER = css.getPropertyValue('--c-amber').trim();
  let W = 0, H = 0, eyes = [], raf = 0, visible = true;

  const halton = (index, base) => { let r = 0, f = 1 / base, i = index; while (i > 0) { r += f * (i % base); i = Math.floor(i / base); f /= base; } return r; };

  function seed() {
    eyes = [];
    const count = W < 760 ? 11 : 19;
    for (let i = 1; i <= count; i++) {
      const ux = halton(i + 3, 2), uy = halton(i + 3, 3), uz = halton(i + 3, 5);
      const rad = ((-9 - uz * 12 + ((i % 3) - 1) * 2.5) * Math.PI) / 180;
      const x = W * (0.04 + ux * 0.94), y = H * (0.07 + uy * 0.86);
      const leftZone = x < W * 0.46 && y > H * 0.16 && y < H * 0.84;
      eyes.push({ x, y, cos: Math.cos(rad), sin: Math.sin(rad), rad, len: 46 + uz * 70, speed: (0.22 + uz * 0.46) * (REDUCED ? 0 : 1), alpha: leftZone ? 0.12 + uz * 0.1 : 0.28 + uz * 0.34 });
    }
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(320, r.width); H = Math.max(420, r.height);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(); draw();
  }
  function draw(ghost) {
    ctx.clearRect(0, 0, W, H);
    const b = band.getBoundingClientRect(), p = canvas.getBoundingClientRect();
    const vx0 = b.left - p.left, vx1 = vx0 + b.width;
    for (const pass of [false, true]) {
      ctx.save(); ctx.beginPath();
      if (!pass) { ctx.rect(0, 0, vx0, H); ctx.rect(vx1, 0, W - vx1, H); } else ctx.rect(vx0, 0, vx1 - vx0, H);
      ctx.clip();
      for (const e of eyes) {
        const h = e.len * 0.28;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rad); ctx.globalAlpha = e.alpha;
        ctx.beginPath(); ctx.moveTo(-e.len / 2, 0); ctx.quadraticCurveTo(0, -h * 1.6, e.len / 2, 0); ctx.quadraticCurveTo(0, h * 1.6, -e.len / 2, 0); ctx.closePath();
        if (!pass) {
          ctx.fillStyle = IVORY; ctx.fill();
          ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(0, 0, h * 0.8, 0, Math.PI * 2); ctx.fill();
        } else { ctx.strokeStyle = IVORY; ctx.globalAlpha = Math.min(0.5, e.alpha + 0.12); ctx.lineWidth = 1.35; ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore();
    }
  }
  function step() {
    draw();
    for (const e of eyes) {
      e.x += e.cos * e.speed; e.y += e.sin * e.speed;
      if (e.x - e.len > W + 90 || e.y + e.len < -70) {
        if (Math.random() < 0.58) { e.x = -e.len - Math.random() * 140; e.y = H * (0.1 + Math.random() * 0.88); }
        else { e.x = Math.random() * W; e.y = H + e.len + Math.random() * 80; }
      }
    }
    raf = visible ? requestAnimationFrame(step) : 0;
  }
  resize(); addEventListener('resize', resize);
  if (REDUCED) return; // static single frame, zero motion
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting && !document.hidden; if (visible && !raf) raf = requestAnimationFrame(step); }).observe(canvas.parentElement);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible && !raf) raf = requestAnimationFrame(step); });
  raf = requestAnimationFrame(step);
}
