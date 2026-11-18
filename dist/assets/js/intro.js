// Opening sequence (timings from the reference engine): letters rise 0.06s apart from 0.55s, bar fills 2.05s linear,
// auto-dismiss at 2150ms, 0.55s fade-out. Sits below the sticky header so the CA slot and socials stay visible.
import { REDUCED } from './fx.js';

export function initIntro() {
  let seen = false;
  try { seen = sessionStorage.getItem('spytrix.intro') === '1'; } catch {}
  if (REDUCED || seen) return;
  const el = document.createElement('div');
  el.className = 'intro'; el.setAttribute('aria-hidden', 'true');
  const letters = [...'SPYTRIX'].map((c, i) => `<span style="animation-delay:${(0.55 + i * 0.06).toFixed(2)}s">${c}</span>`).join('');
  el.innerHTML = `<div class="intro-stage"><img class="intro-logo" src="assets/img/logo-128.png" alt="" width="72" height="72"><div class="intro-word">${letters}</div><div class="intro-sub">Quiet money, open chain</div><div class="intro-bar"></div></div><div class="intro-skip">tap to skip</div>`;
  document.body.append(el);
  document.documentElement.classList.add('intro-lock');
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    try { sessionStorage.setItem('spytrix.intro', '1'); } catch {}
    document.documentElement.classList.remove('intro-lock');
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 580);
  };
  el.addEventListener('click', finish);
  document.addEventListener('keydown', finish, { once: true });
  setTimeout(finish, 2150);
}
