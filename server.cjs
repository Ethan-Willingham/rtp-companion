const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 4317);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip'};
const cache = new Map();
const pending = new Map();
async function publicMap(kind) {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.time < 3600000) return hit.body;
  if (pending.has(kind)) return pending.get(kind);
  const task = (async () => {
    const endpoint = kind === 'heatmap' ? 'rtp/heatmap' : 'regions';
    const r = await fetch(`https://api.donut.auction/v1/${endpoint}?dimension=overworld`, {signal: AbortSignal.timeout(25000)});
    if (!r.ok) throw new Error(`Map provider returned ${r.status}`);
    const data = await r.json();
    if (!data.grid || !Array.isArray(data.cells)) throw new Error('Map data unavailable');
    const body = JSON.stringify(data);
    cache.set(kind, {body, time: Date.now()});
    return body;
  })();
  pending.set(kind, task);
  try { return await task; } finally { pending.delete(kind); }
}
function createServer({mapProvider=publicMap}={}) {
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const activePort = server.address()?.port;
  if (![`127.0.0.1:${activePort}`, `localhost:${activePort}`].includes(req.headers.host)) {
    res.writeHead(403); return res.end('Local access only');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/heatmap' || url.pathname === '/api/regions') {
      const body = await mapProvider(url.pathname.split('/').pop());
      res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'max-age=3600'});
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(502, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error: e.message}));
  }
});
return server;
}
module.exports = {createServer};
if (require.main === module) {
const server = createServer();
server.listen(port, '127.0.0.1', () => {
  const url=`http://localhost:${port}`;
  console.log(`RTP Companion: ${url}\nKeep this terminal open. Ctrl+C stops the program.`);
  if (process.argv.includes('--open')) {
    const {spawn}=require('node:child_process');
    const command=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open';
    const args=process.platform==='win32'?['/c','start','',url]:[url];
    const child=spawn(command,args,{stdio:'ignore'});
    child.on('error',()=>console.log(`Open ${url} in Chrome or Edge.`));
  }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
}
