import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { assertStoreOwner, APPLICATION_ID, MODE, STORE_GUILD_ID, STORE_LAYOUT } from '../src/store/config.ts';
import { validateProduct, productMessage } from '../src/store/product.ts';
import { sealStock, unsealStock } from '../src/store/crypto.ts';
import { randomBytes } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const product = { title: 'item teste', description: 'conteúdo de teste', category: 'geral', priceCents: 1000, imageUrl: '', footer: 'dark store', buttonLabel: 'comprar', accentColor: '#aeb1b6', divider: true, active: true };

test('identidade independente e estrutura prevista são fixas', () => {
  assert.equal(APPLICATION_ID, '1547707174254280794');
  assert.equal(STORE_GUILD_ID, '1547613908016038032');
  assert.equal(MODE, 'local-simulation');
  assert.equal(STORE_LAYOUT.flatMap(g => g.channels).filter(c => c.type === 2).length, 2);
  assert.doesNotThrow(() => assertStoreOwner(STORE_GUILD_ID, '1002774556269891694'));
  assert.throws(() => assertStoreOwner('outro', '1002774556269891694'));
});

test('produto V2 é validado e estoque criptografado é autenticado', () => {
  assert.deepEqual(validateProduct(product), product);
  assert.throws(() => validateProduct({ ...product, imageUrl: 'http://inseguro.test/a.png' }));
  const v2 = productMessage({ ...product, id: 'teste' }, 0);
  assert.equal(v2.flags, 32768);
  assert.equal(v2.components[0].components.find(c => c.type === 1).components[0].disabled, true);
  const key = randomBytes(32), sealed = sealStock('segredo', key);
  assert.equal(unsealStock(sealed, key), 'segredo');
  assert.throws(() => unsealStock(sealed, randomBytes(32)));
});

test('painel local executa fluxo completo sem OAuth, token ou Discord', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dark-store-local-'));
  const port = 32000 + Math.floor(Math.random() * 5000);
  const env = { ...process.env, DARK_STORE_DATA_DIR: dataDir, PORT: String(port) };
  const setup = spawnSync(process.execPath, [resolve(root, 'scripts/setup.mjs')], { cwd: root, env, encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  const admin = spawnSync(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'scripts/admin.ts')], { cwd: root, env, encoding: 'utf8' });
  assert.equal(admin.status, 0, admin.stdout + admin.stderr);
  const password = admin.stdout.match(/\n([\w-]{24})\r?\n/)?.[1];
  assert.ok(password, admin.stdout);
  const child = spawn(process.execPath, [resolve(root, 'dist/server.js')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', d => stderr += d);
  try {
    const origin = `http://127.0.0.1:${port}`;
    const api = async (path, init = {}) => fetch(origin + path, init);
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null) throw Error(`servidor encerrou: ${stderr}`);
      try { const ping = await api('/api/session'); if (ping.ok) { ready = true; break; } } catch {}
      await new Promise(resolveDone => setTimeout(resolveDone, 100));
    }
    assert.equal(ready, true, `servidor não iniciou: ${stderr}`);
    assert.equal((await api('/api/state')).status, 401);
    assert.equal((await api('/api/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'errada' }) })).status, 401);
    const login = await api('/api/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const call = async (path, value) => {
      const r = await api(path, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(value) });
      const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result;
    };
    const preview = await call('/api/setup', { confirmed: false });
    assert.equal(preview.preview, true);
    assert.equal((await call('/api/setup', { confirmed: true })).preview, false);
    let state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.mode, 'local-simulation');
    assert.equal(state.channels.filter(c => c.type === 2).length, 2);
    const channelId = state.channels.find(c => c.key === 'accounts').id;
    const saved = await call('/api/products', { channelId, product });
    await call('/api/stock', { productId: saved.id, text: 'entrega secreta de teste' });
    const order = await call('/api/orders', { productId: saved.id, userId: '100000000000000001' });
    await call('/api/order-action', { id: order.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders[0].status, 'delivered');
    assert.equal(state.products[0].stock, 0);
    const delivery = await api(`/api/delivery/${order.id}`, { headers: { cookie } });
    assert.equal(await delivery.text(), 'entrega secreta de teste');
    assert.equal(stderr, '');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolveDone => setTimeout(resolveDone, 3000))]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
