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
import { buildV2Message, validateV2Panel } from '../src/v2.ts';
import { AntiRaidEngine, validateAntiRaid } from '../src/antiRaid.ts';

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

test('editor V2 completo valida URLs, cargos e gera componentes nativos', () => {
  const panel = validateV2Panel({ name: 'regras', channelId: '100000000000000001', title: 'regras', description: '**leia**', color: '#aeb1b6', imageUrl: 'https://example.com/banner.webp', assetId: '', thumbnailUrl: 'https://example.com/icon.png', footer: 'dark store', imagePosition: 'top', showDivider: true, spacing: 'large', buttons: [
    { label: 'site', type: 'LINK', url: 'https://example.com/', roleId: '', roleMode: 'ADD', style: 'SECONDARY', emoji: '🔗' },
    { label: 'cliente', type: 'ROLE', url: '', roleId: '100000000000000002', roleMode: 'TOGGLE', style: 'SUCCESS', emoji: '' }
  ] });
  const message = buildV2Message(panel);
  assert.equal(message.flags, 32768);
  assert.deepEqual(message.allowed_mentions.parse, []);
  const row = message.components[0].components.find(c => c.type === 1);
  assert.equal(row.components[0].style, 5);
  assert.equal(row.components[1].custom_id, 'v2role:toggle:100000000000000002');
  assert.throws(() => validateV2Panel({ ...panel, imageUrl: 'http://inseguro.test' }));
  assert.throws(() => validateV2Panel({ ...panel, buttons: Array(6).fill(panel.buttons[0]) }));
});

test('anti-raid detecta rajadas, respeita confiança e valida limites', () => {
  const settings = validateAntiRaid({ enabled: true, joinLimit: 3, joinWindowSeconds: 10, minAccountAgeHours: 0, destructiveLimit: 2, destructiveWindowSeconds: 15, action: 'QUARANTINE', quarantineRoleId: '100000000000000003', logChannelId: '', trustedUserIds: ['100000000000000004'] });
  const engine = new AntiRaidEngine(), now = Date.now();
  assert.equal(engine.join(settings, now - 100 * 3600_000, now).detected, false);
  assert.equal(engine.join(settings, now - 100 * 3600_000, now + 1).detected, false);
  assert.equal(engine.join(settings, now - 100 * 3600_000, now + 2).detected, true);
  assert.equal(engine.audit(settings, '100000000000000004', 'CHANNEL_DELETE').detected, false);
  assert.equal(engine.audit(settings, '100000000000000005', 'CHANNEL_DELETE', now).detected, false);
  assert.equal(engine.audit(settings, '100000000000000005', 'ROLE_DELETE', now + 1).detected, true);
  assert.throws(() => validateAntiRaid({ ...settings, joinLimit: 2 }));
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
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploadResponse = await api('/api/assets', { method: 'POST', headers: { origin, cookie, 'content-type': 'image/png', 'x-file-name': encodeURIComponent('teste.png') }, body: png });
    assert.equal(uploadResponse.status, 200);
    const asset = await uploadResponse.json();
    const v2 = await call('/api/v2-panels', { panel: { name: 'painel teste', channelId, title: 'dark', description: '**teste local**', color: '#aeb1b6', imageUrl: '', assetId: asset.id, thumbnailUrl: '', footer: 'dark store', imagePosition: 'top', showDivider: true, spacing: 'small', buttons: [{ label: 'site', type: 'LINK', url: 'https://example.com/', roleId: '', roleMode: 'ADD', style: 'SECONDARY', emoji: '' }] } });
    assert.ok(v2.id);
    await call('/api/anti-raid', { settings: { enabled: true, joinLimit: 3, joinWindowSeconds: 10, minAccountAgeHours: 0, destructiveLimit: 2, destructiveWindowSeconds: 15, action: 'QUARANTINE', quarantineRoleId: '100000000000000003', logChannelId: channelId, trustedUserIds: [] } });
    const raid = await call('/api/anti-raid/simulate', { type: 'join', count: 3, accountAgeHours: 100, targetId: '100000000000000006' });
    assert.equal(raid.detected, true);
    const saved = await call('/api/products', { channelId, product });
    await call('/api/stock', { productId: saved.id, text: 'entrega secreta de teste' });
    const order = await call('/api/orders', { productId: saved.id, userId: '100000000000000001' });
    await call('/api/order-action', { id: order.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders[0].status, 'delivered');
    assert.equal(state.products[0].stock, 0);
    assert.equal(state.panels.length, 1);
    assert.equal(state.incidents.length, 1);
    assert.equal((await api(`/api/assets/${asset.id}`, { headers: { cookie } })).status, 200);
    const delivery = await api(`/api/delivery/${order.id}`, { headers: { cookie } });
    assert.equal(await delivery.text(), 'entrega secreta de teste');
    assert.equal(stderr, '');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolveDone => setTimeout(resolveDone, 3000))]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
