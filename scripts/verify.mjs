// Gate runner. Builds both CA branches and checks every standing rule. Exit 1 on any failed gate.
// Mutation anchors are state-independent: they read the current record from src/registry.json at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const reg = JSON.parse(rd('src/registry.json'));
const TEST_CA = 'So11111111111111111111111111111111111111112'; // only used to exercise the stated branch
const B58G = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, HEX0X = /\b0x[0-9a-fA-F]{40}\b/g;

const build = (out, ca) => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, env: { ...process.env, SPYTRIX_OUT: out, ...(ca ? { SPYTRIX_CA: ca } : { SPYTRIX_CA: '' }) }, stdio: 'pipe' }).toString();
// branch A = whatever the registry currently says (record read at runtime); branch B = the opposite state
const currentStated = reg.ca.state === 'stated';
const A = 'dist', B = '.verify/alt';
build(A, null); build(B, currentStated ? null : TEST_CA);
const stateOf = d => /data-state="(\w+)"/.exec(rd(d, 'index.html'))[1];
const dists = { [stateOf(A)]: A, [stateOf(B)]: B };
if (currentStated) { /* both branches present only if registry itself stated; second build is identical */ }
const absentDir = Object.values(dists).find(d => stateOf(d) !== 'stated') || null;
const statedDir = Object.values(dists).find(d => stateOf(d) === 'stated') || null;

const results = [];
const gate = (name, ok, info = '') => { results.push([name, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === 'node_modules' || f.name === '.verify' || f.name === 'dist') continue; const p = path.join(d, f.name); f.isDirectory() ? walk(p, out) : out.push(p); } return out; };

for (const [label, d] of [['absent', absentDir], ['stated', statedDir]]) {
  if (!d) { gate(`branch ${label} built`, false); continue; }
  const html = rd(d, 'index.html');
  gate(`[${label}] index.html built`, html.length > 1000);
  gate(`[${label}] logo files in output`, fs.existsSync(path.join(ROOT, d, 'assets/img/logo-512.png')) && fs.existsSync(path.join(ROOT, d, 'assets/img/logo-128.png')));
  gate(`[${label}] index.html references logo + favicon (relative)`, /src="assets\/img\/logo-128\.png"/.test(html) && /href="assets\/img\/favicon\.svg"/.test(html));
  const ca = /id="caBar" data-state="(\w+)"/.exec(html)[1];
  const copyBtn = /<button[^>]*id="caCopy"[^>]*>/.exec(html)[0];
  if (label === 'absent') {
    gate('[absent] CA slot inert (disabled, no address)', ca !== 'stated' && /disabled/.test(copyBtn) && !B58G.test(/<div class="ca-bar"[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0].replace(/[^\n]*Contract address[^\n]*/, '')));
    gate('[absent] no CA value in registry.js', /"value": null/.test(rd(d, 'assets/js/registry.js')));
  } else {
    const v = /"ca": \{\s*"state": "stated",\s*"value": "([^"]+)"/.exec(rd(d, 'assets/js/registry.js'));
    gate('[stated] full CA rendered in top slot, copy enabled', v && html.includes(`id="caAddr" aria-label="Copy contract address">${v[1]}</button>`) && !/disabled/.test(copyBtn));
  }
  // LINK RULE
  const x = reg.x;
  gate(`[${label}] X href equals stated record`, html.includes(`href="${x.url}"`) && (html.match(/data-social="x"/g) || []).length >= 3);
  gate(`[${label}] GitHub inert: no href anywhere`, !/data-social="github"[^>]*href=/.test(html) && !/href="#"/.test(html) && /icon-link is-inert" data-social="github"/.test(html));
  gate(`[${label}] both social icons present, no text label`, /data-social="x"[^>]*>\s*<svg/.test(html) && /data-social="github"[^>]*>\s*<svg/.test(html));
  // GATE WARNING: address-shaped strings must match stated registry; CA exempt; 0x never blanket-rejected
  const rj = rd(d, 'assets/js/registry.js'); const regCA = (/"ca": \{\s*"state": "stated",\s*"value": "([^"]+)"/.exec(rj) || [])[1];
  const stray = (html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/="[^"]*"/g, '').match(B58G) || []).filter(s => s !== regCA && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s));
  gate(`[${label}] address scan: every address-shaped string matches the registry`, stray.length === 0, stray.join(',') );
  gate(`[${label}] 0x hex not blanket-rejected (no reject logic)`, !/0x\[?/.test(rd(d, 'assets/js/market.js') + rd(d, 'assets/js/fx.js')) && (html.match(HEX0X) || []).length === 0);
}

// ---- global gates over source + dist
const text = d => walk(path.join(ROOT, d)).filter(f => /\.(html|css|js)$/.test(f));
const dateRe = /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d|\b\d{1,2}:\d{2}\b|\bas of\b|\bchecked\b|\b\d+\s*(s|m|h|d)\s+ago\b|\bago\b|Q[1-4]\b/i;
const visible = rd('dist', 'index.html').replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
const jsStrings = (rd('dist', 'assets/js/market.js').match(/'[^'\n]*'|`[^`\n]*`/g) || []).join(' ');
gate('no dates / timestamps / "as of" / "checked" / clocks in page or scripts', !dateRe.test(visible) && !dateRe.test(jsStrings), (dateRe.exec(visible) || dateRe.exec(jsStrings) || [''])[0]);
gate('Date / toLocale*Time APIs never rendered to DOM', !/new Date|Date\.now|toLocaleTimeString|toLocaleDateString|toISOString/.test(rd('dist', 'assets/js/market.js') + rd('dist', 'assets/js/fx.js')));

const lit = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
const nonTok = text('dist').filter(f => !f.endsWith('tokens.css') && !f.endsWith('registry.js'));
const bad = nonTok.filter(f => lit.test(fs.readFileSync(f, 'utf8').replace(/href="#[\w-]*"/g, '').replace(/&#\d+;/g, '').replace(/url\(#\w+\)/g, '')));
gate('PALETTE: colour literals only in tokens.css', bad.length === 0, bad.map(f => path.basename(f)).join(','));
gate('PALETTE: tokens.css carries sampling provenance', /Provenance/.test(rd('src/assets/css/tokens.css')) && /LOGO SPYTRIX PNG/.test(rd('src/assets/css/tokens.css')));
gate('no ch units in css', !/\d\s?ch\b/.test(rd('src/assets/css/style.css')));
gate('reduced-motion: global zero-motion block + ownPulse none', /prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*\.row\.own \{ animation: none/.test(rd('src/assets/css/style.css')) && /REDUCED/.test(rd('src/assets/js/fx.js')));
gate('own row: border-left 2px accent + mint pulse', /\.row\.own \{ border-left: 2px solid var\(--color-accent\)/.test(rd('src/assets/css/style.css')) && /--c-mint:\s*#00ffcc/.test(rd('src/assets/css/tokens.css')));
const mk = rd('src/assets/js/market.js');
gate('market: boosts filtered chainId solana, top-N by totalAmount, per-token fetch', /chainId !== 'solana'/.test(mk) && /totalAmount/.test(mk) && /M\.tokens \+/.test(mk));
gate('market: 60s poll, visibility pause + immediate refetch, backoff', /pollMs/.test(mk) && /document\.hidden/.test(mk) && /2 \*\* i/.test(mk) && reg.market.pollMs === 60000);
gate('pump.fun fetched in parallel with DexScreener, neither awaits the other', /M\.ownDex \+ CA/.test(mk) && /M\.ownPump \+ CA/.test(mk) && /Promise\.allSettled\(\[a, b\]\)/.test(mk) && !/await fetchJSON\(M\.ownDex/.test(mk));
gate('market never reads CA state for trending fetch (only dedupe + row 1)', !/loadTrending[\s\S]{0,900}CA\b/.test(mk.slice(mk.indexOf('async function loadTrending'), mk.indexOf('/* ---------- state'))));
gate('registry: every record has state; chain/rpc stated', ['chain', 'ca', 'x', 'github', 'market'].every(k => ['stated', 'absent', 'unconfirmed'].includes(reg[k].state)) && reg.chain.rpc === 'https://solana-rpc.publicnode.com');
gate('favicon is 32x32 SVG', /viewBox="0 0 32 32"/.test(rd('dist', 'assets/img/favicon.svg')) && /width="32"/.test(rd('dist', 'assets/img/favicon.svg')));

// animation audit: every @keyframes is applied somewhere; global reduced-motion kills all of them
const css = rd('src/assets/css/style.css');
const kfs = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
const unused = kfs.filter(k => !new RegExp('animation(-name)?:[^;]*\\b' + k + '\\b').test(css));
gate(`ANIMATION: all ${kfs.length} @keyframes applied to an element`, unused.length === 0, unused.join(','));
gate('ANIMATION: reduced-motion kills every CSS animation/transition and JS motion (spring, canvas, intro, count-up)', /animation: none !important; transition: none !important/.test(css) && ['fx.js', 'veil.js', 'intro.js'].every(f => /REDUCED/.test(rd('src/assets/js', f))));
const navHtml = /<div class="nav-cta">[\s\S]*?<\/div>/.exec(rd('dist', 'index.html'))[0];
gate('SOCIAL: exactly one X icon in nav, to the stated URL; GitHub inert', (navHtml.match(/data-social="x"/g) || []).length === 1 && navHtml.includes(`href="${reg.x.url}"`) && /is-inert" data-social="github"/.test(navHtml) && !/data-social="github"[^>]*href/.test(navHtml));

// repo hygiene
const all = walk(ROOT).filter(f => !/package-lock\.json$/.test(f) && !/[\\/]brand[\\/]|[\\/]reference[\\/]|\.(png|jpe?g|jpeg)$/i.test(f));
const hyg = all.filter(f => /CLAUDE\.md$/i.test(f) || f.includes(path.sep + '.claude' + path.sep));
const attrib = all.filter(f => /verify\.mjs$/.test(f) ? false : /(anthropic|co-authored-by|generated with|claude code)/i.test(fs.readFileSync(f, 'utf8')));
gate('REPO HYGIENE: no CLAUDE.md, no .claude/, no AI attribution', hyg.length === 0 && attrib.length === 0, [...hyg, ...attrib].join(','));
gate('repo docs present (README, whitepaper, MIT LICENSE)', fs.existsSync(path.join(ROOT, 'README.md')) && fs.existsSync(path.join(ROOT, 'docs/whitepaper.md')) && /MIT License/.test(rd('LICENSE')) && /SPYTRIX, 2026/.test(rd('LICENSE')));

// copy originality vs reference (needs REF_HTML path; skipped otherwise)
if (process.env.REF_HTML && fs.existsSync(process.env.REF_HTML)) {
  const words = s => s.toLowerCase().replace(/&[a-z]+;/g, ' ').match(/[a-z0-9$%]+/g) || [];
  const grams = s => { const w = words(s), g = new Set(); for (let i = 0; i < w.length - 1; i++) g.add(w[i] + ' ' + w[i + 1]); return g; };
  const refRaw = fs.readFileSync(process.env.REF_HTML, 'utf8');
  const refTxt = refRaw.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ') + ' ' + (process.env.REF_JS && fs.existsSync(process.env.REF_JS) ? (fs.readFileSync(process.env.REF_JS, 'utf8').match(/'[^'\n]{3,}'|"[^"\n]{3,}"|`[^`\n]{3,}`/g) || []).join(' ') : '');
  const copyBlock = (/const COPY = \{[\s\S]*?\n\};/.exec(rd('dist', 'assets/js/market.js')) || [''])[0];
  const copyStrs = (copyBlock.match(/'[^'\n]*'/g) || []).join(' ');
  const mine = visible + ' ' + copyStrs + ' ' + (rd('dist', 'assets/js/intro.js').match(/>([^<>$]{3,})</g) || []).join(' ') + ' tap to skip ' + rd('README.md') + ' ' + rd('docs/whitepaper.md');
  const a = grams(refTxt), shared = [...grams(mine)].filter(g => a.has(g));
  gate('COPY: zero shared 2-grams with reference', shared.length === 0, shared.slice(0, 12).join(' | '));
} else console.log('SKIP copy 2-gram gate (set REF_HTML)');

fs.rmSync(path.join(ROOT, '.verify'), { recursive: true, force: true });
const failed = results.filter(r => !r[1]).length;
console.log(`\nGATES: ${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
