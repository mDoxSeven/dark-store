import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/paths.js';
import { prisma } from './lib/db.js';
import { COOKIE, cookieToken, validSession, verifyPassword, newSession, deleteSession, adminExists, LoginLimiter } from './lib/auth.js';
import * as service from './service.js';
import { runtimeDiscordStatus, runtimeMode } from './runtime.js';

async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new service.InputError('Use JSON.');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256_000) throw new service.InputError('Envio muito grande.');
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new service.InputError('JSON inválido.');
  return parsed as Record<string, unknown>;
}
async function rawBody(req: IncomingMessage, limit: number) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new service.InputError('Arquivo muito grande.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function json(res: ServerResponse, code: number, value: unknown) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
export function makeServer() {
  const limiter = new LoginLimiter();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3010;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host || '')) { json(res, 403, { error: 'Host local obrigatório.' }); return; }
    const path = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
    const method = req.method || 'GET';
    try {
      if (!['GET', 'POST'].includes(method)) { json(res, 405, { error: 'Método não permitido.' }); return; }
      if (method === 'POST' && req.headers.origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Origem inválida.' }); return; }
      const token = cookieToken(req.headers.cookie);
      if (path === '/api/login' && method === 'POST') {
        if (!limiter.consume()) { res.setHeader('Retry-After', '900'); json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' }); return; }
        const input = await body(req);
        if (!await verifyPassword(input.password)) { json(res, 401, { error: 'Senha inválida ou administrador não configurado.' }); return; }
        limiter.reset();
        res.setHeader('Set-Cookie', `${COOKIE}=${await newSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        json(res, 200, { ok: true }); return;
      }
      if (path === '/api/session' && method === 'GET') { json(res, 200, { authenticated: await validSession(token), configured: await adminExists(), mode: runtimeMode() }); return; }
      if (path === '/api/health' && method === 'GET') {
        await prisma.$queryRawUnsafe('SELECT 1');
        json(res, 200, { status: 'ok', database: 'connected', discord: runtimeDiscordStatus() }); return;
      }
      if (path.startsWith('/api/')) {
        if (!await validSession(token)) { json(res, 401, { error: 'Entre no painel.' }); return; }
        if (path === '/api/logout' && method === 'POST') {
          await deleteSession(token); res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); json(res, 200, { ok: true }); return;
        }
        if (path === '/api/state' && method === 'GET') { json(res, 200, await service.state()); return; }
        if (path.startsWith('/api/v2/') && method === 'GET') { json(res, 200, await service.v2(path.slice(8))); return; }
        if (path.startsWith('/api/delivery/') && method === 'GET') {
          const payload = await service.delivery(path.slice(14));
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="entrega-simulada.txt"' }); res.end(payload); return;
        }
        if (path.startsWith('/api/assets/') && method === 'GET') {
          const asset = await service.getAsset(path.slice(12));
          res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': asset.size, 'Content-Disposition': `inline; filename="${asset.filename.replace(/["\\]/g, '-') }"` }); res.end(asset.data); return;
        }
        if (path === '/api/assets' && method === 'POST') {
          const mime = req.headers['content-type']?.split(';')[0] || '';
          const filename = decodeURIComponent(String(req.headers['x-file-name'] || 'image'));
          json(res, 200, await service.saveAsset(filename, mime, await rawBody(req, 7 * 1024 * 1024))); return;
        }
        if (method === 'POST') {
          const input = await body(req);
          let result;
          switch (path) {
            case '/api/setup': result = await service.simulateSetup(input.confirmed === true); break;
            case '/api/products': result = await service.saveProduct(input); break;
            case '/api/stock': result = await service.addStock(input); break;
            case '/api/orders': result = await service.simulateOrder(input); break;
            case '/api/order-action': result = await service.processOrder(input); break;
            case '/api/settings': result = await service.saveSettings(input); break;
            case '/api/v2-panels': result = await service.saveV2Panel(input); break;
            case '/api/v2-remove': result = await service.removeV2Panel(String(input.id || '')); break;
            case '/api/anti-raid': result = await service.saveAntiRaid(input); break;
            case '/api/anti-raid/simulate': result = await service.simulateRaid(input); break;
            default: json(res, 404, { error: 'Rota não encontrada.' }); return;
          }
          json(res, 200, result); return;
        }
        json(res, 404, { error: 'Rota não encontrada.' }); return;
      }
      const assets: Record<string, [string, string]> = {
        '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
        '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/modules.css': ['modules.css', 'text/css; charset=utf-8'], '/brand/dark.png': ['dark.png', 'image/png']
      };
      if (method !== 'GET' || !assets[path]) { json(res, 404, { error: 'Rota não encontrada.' }); return; }
      const [file, type] = assets[path];
      res.writeHead(200, { 'Content-Type': type }); res.end(await readFile(resolve(ROOT, 'public', file)));
    } catch (error) {
      const text = error instanceof Error ? error.message : '';
      // Never log body, stock, cookies, credentials or raw Prisma exception arguments.
      const known = error instanceof service.InputError || /^(Entrega nao confirmada|Este pedido ja|Pedido em processamento|Estoque esgotado|Somente pedidos pendentes|Produto indisponivel|Voce ja tem)/.test(text);
      if (!res.headersSent) json(res, known || error instanceof SyntaxError ? 400 : 500, { error: known ? text : 'Operação não concluída. Atualize e confira o resultado antes de repetir.' });
      else res.end();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3010);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT inválida.');
  const server = makeServer();
  server.listen(port, '127.0.0.1', () => console.log(`dark store — LOCAL, sem Discord: http://127.0.0.1:${port}`));
  const stop = () => { server.close(() => { void prisma.$disconnect(); }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
