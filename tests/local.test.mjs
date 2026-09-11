import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { assertStoreOwner, APPLICATION_ID, DEFAULT_SUPPORT_ROLE_IDS, MODE, STORE_GUILD_ID, STORE_LAYOUT, UNVERIFIED_ROLE_ID, VERIFIED_ROLE_ID, supportRoleIds } from '../src/store/config.ts';
import { validateProduct, productMessage } from '../src/store/product.ts';
import { sealStock, unsealStock } from '../src/store/crypto.ts';
import { randomBytes } from 'node:crypto';
import { buildV2Message, validateV2Panel } from '../src/v2.ts';
import { AntiRaidEngine, validateAntiRaid } from '../src/antiRaid.ts';
import { AuditLogEvent } from 'discord.js';
import { auditActionName, parseRoleButton } from '../src/discord/ids.ts';
import { buildPixPayload, crc16, pixQrPng, validatePixSettings } from '../src/store/pix.ts';
import { SPOTIFY_SELECT_ID, spotifyCatalogMessage } from '../src/store/spotifyMessage.ts';
import { DISCORD_BANNER_URL, DISCORD_SELECT_ID, discordCatalogMessage } from '../src/store/discordMessage.ts';
import { VERIFICATION_BANNER_URL, VERIFICATION_BUTTON_ID, verificationMessage } from '../src/store/verificationMessage.ts';
import { confirmationTicketMessage, parseTicketButton, paymentTicketMessage, ticketButtonId } from '../src/store/tickets.ts';

const root = resolve(import.meta.dirname, '..');
const product = { title: 'item teste', description: 'conteúdo de teste', category: 'geral', priceCents: 1000, imageUrl: '', footer: 'dark store', buttonLabel: 'comprar', accentColor: '#aeb1b6', divider: true, active: true };

test('identidade independente e estrutura prevista são fixas', () => {
  assert.equal(APPLICATION_ID, '1547707174254280794');
  assert.equal(STORE_GUILD_ID, '1547613908016038032');
  assert.equal(MODE, 'local-simulation');
  assert.equal(STORE_LAYOUT.flatMap(g => g.channels).filter(c => c.type === 2).length, 2);
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.name === 'spotify'));
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.name === 'discord'));
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.key === 'verificationChannel'));
  assert.equal(UNVERIFIED_ROLE_ID, '1547683703227154542');
  assert.equal(VERIFIED_ROLE_ID, '1548020246537830520');
  assert.ok(STORE_LAYOUT.some(g => g.key === 'tickets' && 'private' in g));
  assert.deepEqual(supportRoleIds(null), [...DEFAULT_SUPPORT_ROLE_IDS]);
  assert.deepEqual(DEFAULT_SUPPORT_ROLE_IDS, ['1548020621760274492', '1548020929962180658']);
  assert.doesNotThrow(() => assertStoreOwner(STORE_GUILD_ID, '1002774556269891694'));
  assert.throws(() => assertStoreOwner('outro', '1002774556269891694'));
});

test('verificação, catálogos e ticket usam Components V2 e botões cinza', () => {
  const products = Array.from({ length: 30 }, (_, index) => ({ id: `produto${index}`, title: `Item ${index}`, description: '', priceCents: 1990, stock: index === 0 ? 0 : 2 }));
  const catalog = spotifyCatalogMessage(products);
  assert.equal(catalog.flags, 32768);
  const select = catalog.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(select.custom_id, SPOTIFY_SELECT_ID);
  assert.equal(select.options.length, 25);
  assert.ok(select.options.every(option => option.value !== 'produto0'));
  const discord = discordCatalogMessage(products);
  const discordSelect = discord.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(discordSelect.custom_id, DISCORD_SELECT_ID);
  assert.ok(discord.components[0].components.find(component => component.type === 12).items[0].media.url.endsWith('/contas-discord-banner-dark.png'));
  assert.match(DISCORD_BANNER_URL, /^https:\/\//);
  const verification = verificationMessage();
  const verificationButton = verification.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(verification.flags, 32768);
  assert.equal(verificationButton.custom_id, VERIFICATION_BUTTON_ID);
  assert.equal(verificationButton.style, 2);
  assert.ok(verification.components[0].components.find(component => component.type === 12).items[0].media.url.endsWith('/verificacao-banner-dark.png'));
  assert.match(VERIFICATION_BANNER_URL, /^https:\/\//);
  const id = ticketButtonId('confirm', 'ticket_123456');
  assert.deepEqual(parseTicketButton(id), { action: 'confirm', ticketId: 'ticket_123456' });
  assert.equal(parseTicketButton('store:ticket:admin:ticket_123456'), null);
  const ticket = { id: 'ticket_123456', userId: '100000000000000001', productTitle: 'Gift card autorizado', priceCents: 1990 };
  const confirmation = confirmationTicketMessage(ticket);
  const buttons = confirmation.components[0].components.find(component => component.type === 1).components;
  assert.ok(buttons.every(button => button.style === 2));
  assert.ok(buttons.some(button => button.custom_id.includes(':notify:')));
  const payment = paymentTicketMessage(ticket, { id: 'order_123', pixPayload: '000201PIX' });
  assert.ok(payment.components[0].components.find(component => component.type === 10).content.includes('000201PIX'));
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

test('integração interpreta somente botões e auditorias autorizados', () => {
  assert.deepEqual(parseRoleButton('v2role:toggle:100000000000000002'), { mode: 'toggle', roleId: '100000000000000002' });
  assert.equal(parseRoleButton('v2role:admin:100000000000000002'), null);
  assert.equal(parseRoleButton('v2role:add:123'), null);
  assert.equal(auditActionName(AuditLogEvent.ChannelDelete), 'CHANNEL_DELETE');
  assert.equal(auditActionName(AuditLogEvent.MessageDelete), null);
});

test('Pix gera BR Code com valor, txid, CRC e QR legível', async () => {
  const settings = validatePixSettings({ enabled: true, key: 'pix@example.com', merchantName: 'Loja Dárk', merchantCity: 'São Paulo' });
  assert.deepEqual(settings, { enabled: true, key: 'pix@example.com', merchantName: 'LOJA DARK', merchantCity: 'SAO PAULO' });
  const payload = buildPixPayload({ ...settings, amountCents: 1990, txid: 'pedido-ABC_123' });
  assert.match(payload, /^00020101021226/);
  assert.ok(payload.includes('540519.90'));
  assert.ok(payload.includes('62160512pedidoABC123'));
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  const png = await pixQrPng(payload);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.throws(() => validatePixSettings({ enabled: true, key: '', merchantName: '', merchantCity: '' }));
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
    assert.deepEqual(await (await api('/api/health')).json(), { status: 'ok', database: 'connected', discord: 'disabled' });
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
    assert.ok(state.channels.some(c => c.key === 'discord' && c.type === 0));
    assert.ok(state.channels.some(c => c.key === 'spotify' && c.type === 0));
    assert.ok(state.channels.some(c => c.key === 'verificationChannel' && c.type === 0));
    assert.deepEqual(state.roles, []);
    const channelId = state.channels.find(c => c.key === 'accounts').id;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploadResponse = await api('/api/assets', { method: 'POST', headers: { origin, cookie, 'content-type': 'image/png', 'x-file-name': encodeURIComponent('teste.png') }, body: png });
    assert.equal(uploadResponse.status, 200);
    const asset = await uploadResponse.json();
    const v2 = await call('/api/v2-panels', { panel: { name: 'painel teste', channelId, title: 'dark', description: '**teste local**', color: '#aeb1b6', imageUrl: '', assetId: asset.id, thumbnailUrl: '', footer: 'dark store', imagePosition: 'top', showDivider: true, spacing: 'small', buttons: [{ label: 'site', type: 'LINK', url: 'https://example.com/', roleId: '', roleMode: 'ADD', style: 'SECONDARY', emoji: '' }] } });
    assert.ok(v2.id);
    await call('/api/settings', { paymentInstructions: 'Confira o valor antes de pagar.', salesChannelId: '', pixEnabled: true, pixKey: 'pix@example.com', pixMerchantName: 'Dark Store', pixMerchantCity: 'Sao Paulo' });
    await call('/api/anti-raid', { settings: { enabled: true, joinLimit: 3, joinWindowSeconds: 10, minAccountAgeHours: 0, destructiveLimit: 2, destructiveWindowSeconds: 15, action: 'QUARANTINE', quarantineRoleId: '100000000000000003', logChannelId: channelId, trustedUserIds: [] } });
    const raid = await call('/api/anti-raid/simulate', { type: 'join', count: 3, accountAgeHours: 100, targetId: '100000000000000006' });
    assert.equal(raid.detected, true);
    const saved = await call('/api/products', { channelId, product });
    await call('/api/stock', { productId: saved.id, text: 'entrega secreta de teste' });
    const order = await call('/api/orders', { productId: saved.id, userId: '100000000000000001' });
    const qr = await api(`/api/pix/${order.id}`, { headers: { cookie } });
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    await call('/api/order-action', { id: order.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders[0].status, 'delivered');
    assert.match(state.orders[0].pixPayload, /^000201/);
    assert.equal(state.products[0].stock, 0);
    assert.equal(state.panels.length, 1);
    assert.equal(state.incidents.length, 1);
    assert.equal((await api(`/api/assets/${asset.id}`, { headers: { cookie } })).status, 200);
    const delivery = await api(`/api/delivery/${order.id}`, { headers: { cookie } });
    assert.equal(await delivery.text(), 'entrega secreta de teste');
    const manualProduct = await call('/api/products', { channelId: '', product: { ...product, title: 'item manual', category: 'spotify' } });
    await call('/api/stock', { productId: manualProduct.id, text: '', quantity: 2 });
    const manualOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000002' });
    await call('/api/order-action', { id: manualOrder.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders.find(item => item.id === manualOrder.id).status, 'manual_fulfillment');
    assert.equal(state.products.find(item => item.id === manualProduct.id).manualStock, 1);
    assert.equal(state.products.find(item => item.id === manualProduct.id).stock, 1);
    assert.deepEqual(state.settings.supportRoleIds, [...DEFAULT_SUPPORT_ROLE_IDS]);
    await call('/api/order-action', { id: manualOrder.id, operation: 'complete-manual', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders.find(item => item.id === manualOrder.id).status, 'delivered');
    assert.equal(state.orders.find(item => item.id === manualOrder.id).stockId, null);
    assert.equal((await api(`/api/delivery/${manualOrder.id}`, { headers: { cookie } })).status, 400);
    assert.equal(stderr, '');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolveDone => setTimeout(resolveDone, 3000))]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
