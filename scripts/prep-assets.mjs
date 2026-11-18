// One-off asset prep: reads brand/ files, writes src/assets/img/*. Run: npm run prep
import sharp from 'sharp';
import fs from 'node:fs';
const SRC = 'brand/LOGO SPYTRIX PNG...png';      // RGBA, transparent bg (colortype 6)
const OUT = 'src/assets/img';
fs.mkdirSync(OUT, { recursive: true });

// 1. raw RGBA, bbox of alpha>8
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
let x0 = W, y0 = H, x1 = 0, y1 = 0, blackT = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4;
  if (data[o+3] === 0 && !data[o] && !data[o+1] && !data[o+2]) blackT++;
  if (data[o+3] > 8) { if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y; }
}
console.log('size', W, H, 'pure-black transparent px', blackT, 'bbox', x0, y0, x1, y1);

// 2. exact palette: mode of exact RGB inside quantised buckets (alpha>=250)
const cnt = new Map();
for (let i = 0; i < W*H; i++) { const o=i*4; if (data[o+3] < 250) continue; const k=(data[o]<<16)|(data[o+1]<<8)|data[o+2]; cnt.set(k,(cnt.get(k)||0)+1); }
const hex = k => '#'+k.toString(16).padStart(6,'0');
console.log('top exact colours:'); [...cnt.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([k,n])=>console.log(hex(k),n));

// 3. square crop around eye with padding. Premultiplied resize: sharp premultiplies alpha
//    internally before the kernel when resizing RGBA, so pure-black transparent texels cannot bleed dark fringes.
const bw = x1-x0+1, bh = y1-y0+1, side = Math.round(bw*1.08);
const cx = Math.round((x0+x1)/2), cy = Math.round((y0+y1)/2);
const left = Math.max(0, cx-Math.round(side/2)), top = Math.max(0, cy-Math.round(side/2));
const sq = sharp(SRC).ensureAlpha().extract({ left, top, width: Math.min(side, W-left), height: Math.min(side, H-top) });
for (const s of [512, 128]) await sq.clone().resize(s, s, { kernel: 'lanczos3', fit: 'contain', background: {r:0,g:0,b:0,alpha:0} }).png({ compressionLevel: 9 }).toFile(`${OUT}/logo-${s}.png`);

// 4. Favicon traced from a real 32x32 pixel grid of the logo
const g = await sq.clone().resize(32, 32, { kernel: 'lanczos3', fit: 'contain', background: {r:0,g:0,b:0,alpha:0} }).raw().toBuffer();
const rects = [];
for (let y = 0; y < 32; y++) { let x = 0; while (x < 32) {
  const o=(y*32+x)*4; const a=g[o+3]; if (a < 64) { x++; continue; }
  const c=[g[o],g[o+1],g[o+2]].map(v=>Math.round(v/8)*8).map(v=>Math.min(255,v)); let n=1;
  while (x+n<32) { const p=(y*32+x+n)*4; const d=[g[p],g[p+1],g[p+2]].map(v=>Math.min(255,Math.round(v/8)*8)); if (g[p+3]<64||d.join()!==c.join()) break; n++; }
  rects.push(`<rect x="${x}" y="${y}" width="${n}" height="1" fill="#${c.map(v=>v.toString(16).padStart(2,'0')).join('')}"/>`); x+=n; } }
fs.writeFileSync(`${OUT}/favicon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">${rects.join('')}</svg>\n`);
console.log('favicon rects', rects.length);
fs.copyFileSync('reference/SAMPUL SPYTRIX JPG.jpg.jpeg', `${OUT}/banner.jpg`);

// banner palette (lavender text, bg)
const b = await sharp('reference/SAMPUL SPYTRIX JPG.jpg.jpeg').raw().toBuffer({resolveWithObject:true});
const bc = new Map(); for (let i=0;i<b.info.width*b.info.height;i++){const o=i*b.info.channels;const k=((b.data[o]>>3)<<10)|((b.data[o+1]>>3)<<5)|(b.data[o+2]>>3);bc.set(k,(bc.get(k)||0)+1);}
console.log('banner top:',[...bc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>'#'+[(k>>10)&31,(k>>5)&31,k&31].map(v=>(v*8+4).toString(16).padStart(2,'0')).join('')+' x'+n).join(' '));
