import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'dist');
const port = +(process.argv[3] || 4173);
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((q, s) => {
  let p = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  if (p.endsWith(path.sep)) p += 'index.html';
  if (!p.startsWith(dir) || !fs.existsSync(p)) { s.writeHead(404); return s.end('not found'); }
  s.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(s);
}).listen(port, () => console.log('serving', dir, port));
