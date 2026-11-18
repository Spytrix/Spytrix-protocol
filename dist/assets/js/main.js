import { initReveal, initProgress, initParallax, initScrollSpy, initSpotlight, initNav, initCA } from './fx.js';
import { initMarket } from './market.js';
import { initVeil } from './veil.js';
import { initIntro } from './intro.js';

initProgress();
initNav();
initScrollSpy();
initCA();
initSpotlight();
initParallax();
initReveal();
initMarket();
initVeil();
initIntro();

// theme-color is read from the token so no colour literal lives outside tokens.css
try {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim();
  const m = document.createElement('meta'); m.name = 'theme-color'; m.content = c; document.head.append(m);
} catch {}
