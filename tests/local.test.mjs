import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { assertStoreOwner, APPLICATION_ID, DEFAULT_SUPPORT_ROLE_IDS, MODE, REVIEW_ROLE_ID, REVIEWS_CHANNEL_ID, SALES_CANCELLATION_ROLE_NAME, STORE_GUILD_ID, STORE_LAYOUT, UNVERIFIED_ROLE_ID, VERIFIED_ROLE_ID, canCancelSales, salesCancellationRoleId, supportRoleIds } from '../src/store/config.ts';
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
import { NITRO_BANNER_URL, NITRO_SELECT_ID, nitroCatalogMessage } from '../src/store/nitroMessage.ts';
import { VERIFICATION_BANNER_URL, VERIFICATION_BUTTON_ID, verificationMessage } from '../src/store/verificationMessage.ts';
import { welcomeMessage } from '../src/store/welcomeMessage.ts';
import { reviewRequestMessage } from '../src/store/reviewMessage.ts';
import { adminCancellationPrompt, cancellationPrompt, cancelledTicketMessage, confirmationTicketMessage, parseTicketButton, paymentApprovedMessage, paymentTicketMessage, ticketButtonId } from '../src/store/tickets.ts';
import { approveOrder, cancelCheckoutOrder, cancelCheckoutSale } from '../src/store/orders.ts';
import { VORTEX_GUILD_ID, VORTEX_SUPPORT_BANNER_URL, VORTEX_SUPPORT_SELECT_ID, canCloseVortexTicket, isVortexSupportSetupCommand, parseVortexSupportButton, vortexStaffMessage, vortexSupportButtonId, vortexSupportPanelMessage, vortexTicketMessage } from '../src/vortex/supportMessages.ts';

const root = resolve(import.meta.dirname, '..');
const product = { title: 'item teste', description: 'conteúdo de teste', category: 'geral', priceCents: 1000, imageUrl: '', footer: 'dark store', buttonLabel: 'comprar', accentColor: '#aeb1b6', divider: true, active: true };

test('identidade independente e estrutura prevista são fixas', () => {
  assert.equal(APPLICATION_ID, '1547707174254280794');
  assert.equal(STORE_GUILD_ID, '1547613908016038032');
  assert.equal(MODE, 'local-simulation');
  assert.equal(STORE_LAYOUT.flatMap(g => g.channels).filter(c => c.type === 2).length, 2);
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.name === 'spotify'));
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.name === 'discord'));
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.name === 'nitro-link'));
  assert.ok(STORE_LAYOUT.flatMap(g => g.channels).some(c => c.key === 'verificationChannel'));
  assert.equal(UNVERIFIED_ROLE_ID, '1547683703227154542');
  assert.equal(VERIFIED_ROLE_ID, '1548020246537830520');
  assert.equal(REVIEW_ROLE_ID, '1548068549434544159');
  assert.equal(REVIEWS_CHANNEL_ID, '1547806201604219015');
  assert.equal(STORE_LAYOUT.flatMap(g => g.channels).find(c => c.key === 'reviews').fixedId, REVIEWS_CHANNEL_ID);
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
  const nitro = nitroCatalogMessage(products);
  const nitroSelect = nitro.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(nitroSelect.custom_id, NITRO_SELECT_ID);
  assert.equal(nitroSelect.options.length, 25);
  assert.ok(nitro.components[0].components.find(component => component.type === 12).items[0].media.url.endsWith('/nitro-link-banner-dark.png'));
  assert.match(NITRO_BANNER_URL, /^https:\/\//);
  const verification = verificationMessage();
  const verificationButton = verification.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(verification.flags, 32768);
  assert.equal(verificationButton.custom_id, VERIFICATION_BUTTON_ID);
  assert.equal(verificationButton.style, 2);
  assert.ok(verification.components[0].components.find(component => component.type === 12).items[0].media.url.endsWith('/verificacao-banner-dark-v2.png'));
  assert.match(VERIFICATION_BANNER_URL, /^https:\/\//);
  const welcome = welcomeMessage({ id: '100000000000000009', displayName: 'Cliente', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png', guildName: 'dark store', memberCount: 42 });
  assert.equal(welcome.flags, 32768);
  assert.deepEqual(welcome.allowedMentions.users, ['100000000000000009']);
  assert.ok(welcome.components[0].components.find(component => component.type === 9).components[0].content.includes('<@100000000000000009>'));
  assert.ok(welcome.components[0].components.find(component => component.type === 9).accessory.media.url.startsWith('https://'));
  assert.ok(welcome.components[0].components.some(component => component.type === 10 && component.content.includes('Membro nº 42')));
  const id = ticketButtonId('confirm', 'ticket_123456');
  assert.deepEqual(parseTicketButton(id), { action: 'confirm', ticketId: 'ticket_123456' });
  assert.deepEqual(parseTicketButton(ticketButtonId('close', 'ticket_123456')), { action: 'close', ticketId: 'ticket_123456' });
  assert.equal(parseTicketButton('store:ticket:admin:ticket_123456'), null);
  const ticket = { id: 'ticket_123456', userId: '100000000000000001', productTitle: 'Gift card autorizado', priceCents: 1990 };
  const confirmation = confirmationTicketMessage(ticket);
  const buttons = confirmation.components[0].components.find(component => component.type === 1).components;
  assert.ok(buttons.every(button => button.style === 2));
  assert.ok(buttons.some(button => button.custom_id.includes(':notify:')));
  assert.ok(buttons.some(button => button.custom_id.includes(':close:')));
  const payment = paymentTicketMessage(ticket, { id: 'order_123', pixPayload: '000201PIX' });
  assert.ok(payment.components[0].components.find(component => component.type === 10).content.includes('000201PIX'));
  assert.ok(payment.components[0].components.find(component => component.type === 1).components.some(button => button.custom_id.includes(':close:')));
  const paymentButtons = payment.components[0].components.find(component => component.type === 1).components;
  assert.ok(paymentButtons.some(button => button.custom_id.includes(':cancel:')));
  assert.ok(paymentButtons.some(button => button.custom_id.includes(':admin-cancel:')));
  assert.equal(paymentButtons.length, 5);
  assert.ok(paymentButtons.every(button => button.style === 2));
  for (const action of ['cancel', 'cancel-confirm', 'cancel-back', 'admin-cancel', 'admin-cancel-confirm', 'admin-cancel-back']) {
    assert.deepEqual(parseTicketButton(ticketButtonId(action, ticket.id)), { action, ticketId: ticket.id });
  }
  const cancelPrompt = cancellationPrompt(ticket.id);
  assert.ok(cancelPrompt.content.includes('não estorna dinheiro'));
  assert.ok(cancelPrompt.components[0].components.every(button => button.style === 2));
  assert.ok(cancelPrompt.components[0].components.some(button => button.label.includes('Ainda não paguei')));
  const adminPrompt = adminCancellationPrompt(ticket.id);
  assert.ok(adminPrompt.content.includes('não estorna dinheiro'));
  assert.ok(adminPrompt.components[0].components.every(button => button.style === 2 && button.custom_id.includes(':admin-cancel-')));
  const cancelled = cancelledTicketMessage('order_123');
  assert.equal(cancelled.flags, 32768);
  assert.ok(cancelled.components[0].components[0].content.includes('Não utilize o Pix'));
  const approved = paymentApprovedMessage({ id: 'order_123', productTitle: 'Item', priceCents: 1990 }, true);
  assert.equal(approved.flags, 32768);
  assert.ok(approved.components[0].components[0].content.includes('Pagamento confirmado pela equipe'));
  assert.ok(approved.components[0].components[0].content.includes('entrega neste atendimento'));
  const review = reviewRequestMessage({ id: 'order_123', productTitle: 'Gift card autorizado', priceCents: 1990 }, STORE_GUILD_ID, REVIEWS_CHANNEL_ID);
  const reviewButton = review.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(review.flags, 32768);
  assert.equal(reviewButton.style, 5);
  assert.equal(reviewButton.url, `https://discord.com/channels/${STORE_GUILD_ID}/${REVIEWS_CHANNEL_ID}`);
  assert.ok(review.components[0].components.some(component => component.type === 10 && component.content.includes('10/10')));
});

test('cancelamento administrativo exige o ID do cargo !, salvo para o dono', () => {
  const roleId = '1548020621760274492';
  const settings = { channelsJson: JSON.stringify({ salesCancellationRole: roleId }) };
  assert.equal(SALES_CANCELLATION_ROLE_NAME, '!');
  assert.equal(salesCancellationRoleId(settings), roleId);
  assert.equal(canCancelSales('100000000000000005', [roleId], settings), true);
  assert.equal(canCancelSales('100000000000000005', [], settings), false);
  assert.equal(canCancelSales('100000000000000005', ['!'], settings), false);
  assert.equal(canCancelSales('100000000000000005', [roleId], null), false);
  assert.equal(canCancelSales('1002774556269891694', [], null), true);
  assert.equal(salesCancellationRoleId({ channelsJson: '{invalid' }), null);
  assert.equal(salesCancellationRoleId({ channelsJson: JSON.stringify({ salesCancellationRole: '!' }) }), null);
});

test('suporte Vortex usa V2 cinza, três assuntos e fechamento pelo atendente', () => {
  assert.equal(VORTEX_GUILD_ID, '1551447870358560930');
  assert.equal(isVortexSupportSetupCommand(' !CriarSuporte '), true);
  assert.equal(isVortexSupportSetupCommand('!criarsuporte agora'), false);
  const panel = vortexSupportPanelMessage();
  assert.equal(panel.flags, 32768);
  assert.match(VORTEX_SUPPORT_BANNER_URL, /^https:\/\/raw\.githubusercontent\.com\/mDoxSeven\/dark-store\/main\/public\/vortex-support-banner-v1\.png$/);
  const select = panel.components[0].components.find(component => component.type === 1).components[0];
  assert.equal(select.custom_id, VORTEX_SUPPORT_SELECT_ID);
  assert.deepEqual(select.options.map(option => option.value), ['question', 'report', 'partnership']);
  const open = { id: 'cm12345678901234567890', userId: '100000000000000001', category: 'question', status: 'OPEN', claimedBy: null, createdAt: new Date() };
  const ticket = vortexTicketMessage(open);
  const buttons = ticket.components[0].components.find(component => component.type === 1).components;
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every(button => button.style === 2));
  assert.equal(buttons.find(button => button.custom_id.includes(':close:')).disabled, true);
  assert.deepEqual(parseVortexSupportButton(vortexSupportButtonId('claim', open.id)), { action: 'claim', ticketId: open.id });
  assert.equal(parseVortexSupportButton('vortex:support:delete:cm12345678901234567890'), null);
  const claimed = { ...open, status: 'CLAIMED', claimedBy: '100000000000000002', channelId: '100000000000000003' };
  const staff = vortexStaffMessage(claimed, '100000000000000004');
  assert.ok(staff.components[0].components[0].content.includes('<@100000000000000001>'));
  assert.equal(staff.components[0].components.find(component => component.type === 1).components.find(button => button.custom_id.includes(':close:')).disabled, false);
  assert.equal(canCloseVortexTicket(claimed, { id: '100000000000000002', administrator: false, support: true }), true);
  assert.equal(canCloseVortexTicket(claimed, { id: '100000000000000004', administrator: false, support: true }), false);
  assert.equal(canCloseVortexTicket(claimed, { id: '100000000000000004', administrator: true, support: false }), true);
  assert.equal(canCloseVortexTicket(open, { id: '100000000000000004', administrator: true, support: false }), false);
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
  const db = new PrismaClient({ datasourceUrl: `file:${resolve(dataDir, 'store.db').replaceAll('\\', '/')}` });
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
    assert.ok(state.channels.some(c => c.key === 'nitro' && c.type === 0));
    assert.ok(state.channels.some(c => c.key === 'verificationChannel' && c.type === 0));
    assert.equal(state.channels.find(c => c.key === 'reviews').id, REVIEWS_CHANNEL_ID);
    assert.deepEqual(state.roles, []);
    const cancellationRoleId = salesCancellationRoleId(state.settings);
    assert.match(cancellationRoleId, /^\d{17,20}$/);
    const repeatedSetup = await call('/api/setup', { confirmed: true });
    assert.ok(!repeatedSetup.created.some(name => name.includes('cancelar vendas')));
    assert.equal(salesCancellationRoleId((await (await api('/api/state', { headers: { cookie } })).json()).settings), cancellationRoleId);
    const channelId = state.channels.find(c => c.key === 'accounts').id;
    const bindTicket = async (orderId, channelId) => {
      const order = await db.digitalOrder.findUniqueOrThrow({ where: { id: orderId } });
      return db.checkoutTicket.create({ data: {
        guildId: STORE_GUILD_ID, orderId, userId: order.userId, productId: order.productId,
        productTitle: order.productTitle, priceCents: order.priceCents, channelId,
        activeKey: `${STORE_GUILD_ID}:${order.userId}`, status: 'awaiting_payment',
      } });
    };
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
    const automaticTicket = await bindTicket(order.id, channelId);
    const qr = await api(`/api/pix/${order.id}`, { headers: { cookie } });
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    await call('/api/order-action', { id: order.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders[0].status, 'delivered');
    assert.match(state.orders[0].pixPayload, /^000201/);
    assert.equal(state.products[0].stock, 0);
    assert.ok((await db.localMessage.findMany({ where: { channelId } })).some(message => message.body.includes('Pagamento confirmado pela equipe') && message.body.includes(order.id)));
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000001', automaticTicket.id));
    assert.equal(state.panels.length, 1);
    assert.equal(state.incidents.length, 1);
    assert.equal((await api(`/api/assets/${asset.id}`, { headers: { cookie } })).status, 200);
    const delivery = await api(`/api/delivery/${order.id}`, { headers: { cookie } });
    assert.equal(await delivery.text(), 'entrega secreta de teste');
    const manualProduct = await call('/api/products', { channelId: '', product: { ...product, title: 'item manual', category: 'spotify' } });
    await call('/api/stock', { productId: manualProduct.id, text: '', quantity: 2 });
    const cancellableOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000004' });
    const cancellableTicket = await bindTicket(cancellableOrder.id, state.channels.find(c => c.key === 'discord').id);
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000005', cancellableTicket.id), /Somente o cliente/);
    assert.equal((await db.digitalOrder.findUniqueOrThrow({ where: { id: cancellableOrder.id } })).status, 'pending');
    const cancelledOrder = await cancelCheckoutOrder(db, '100000000000000004', cancellableTicket.id);
    assert.equal(cancelledOrder.orderId, cancellableOrder.id);
    const cancellationRecord = await db.digitalOrder.findUniqueOrThrow({ where: { id: cancellableOrder.id } });
    assert.equal(cancellationRecord.status, 'cancelled');
    assert.equal(cancellationRecord.activeKey, null);
    assert.equal(cancellationRecord.cancelledBy, '100000000000000004');
    assert.ok(cancellationRecord.pixPayload);
    const cancelledTicket = await db.checkoutTicket.findUniqueOrThrow({ where: { id: cancellableTicket.id } });
    assert.equal(cancelledTicket.status, 'cancelled');
    assert.equal(cancelledTicket.activeKey, null);
    assert.ok(cancelledTicket.deleteAt);
    assert.equal((await db.digitalProduct.findUniqueOrThrow({ where: { id: manualProduct.id } })).manualStock, 2);
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000004', cancellableTicket.id));
    // Even a stale ticket cannot cancel an approved or processing order.
    await db.checkoutTicket.update({ where: { id: cancellableTicket.id }, data: { status: 'awaiting_payment', deleteAt: null } });
    for (const status of ['pending', 'delivering', 'delivery_failed', 'manual_fulfillment', 'delivered']) {
      await db.digitalOrder.update({ where: { id: cancellableOrder.id }, data: { status, approvedBy: '1002774556269891694' } });
      await assert.rejects(cancelCheckoutOrder(db, '100000000000000004', cancellableTicket.id), /Pagamento aprovado/);
      await assert.rejects(cancelCheckoutSale(db, '100000000000000005', [cancellationRoleId], cancellableTicket.id), /Pagamento aprovado/);
      assert.equal((await db.digitalOrder.findUniqueOrThrow({ where: { id: cancellableOrder.id } })).status, status);
      assert.equal((await db.checkoutTicket.findUniqueOrThrow({ where: { id: cancellableTicket.id } })).status, 'awaiting_payment');
    }
    await db.digitalOrder.update({ where: { id: cancellableOrder.id }, data: { status: 'cancelled', approvedBy: null } });
    const reservedStock = await db.digitalStock.create({ data: { productId: manualProduct.id, ciphertext: 'reserved-test-only', fingerprint: 'reserved-test-only', claimedAt: new Date() } });
    await db.digitalOrder.update({ where: { id: cancellableOrder.id }, data: { status: 'pending', stockId: reservedStock.id } });
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000004', cancellableTicket.id), /Pagamento aprovado/);
    await assert.rejects(cancelCheckoutSale(db, '100000000000000005', [cancellationRoleId], cancellableTicket.id), /Pagamento aprovado/);
    assert.equal((await db.digitalStock.findUniqueOrThrow({ where: { id: reservedStock.id } })).claimedAt.getTime(), reservedStock.claimedAt.getTime());
    await db.digitalOrder.update({ where: { id: cancellableOrder.id }, data: { status: 'cancelled', stockId: null } });
    await db.digitalStock.delete({ where: { id: reservedStock.id } });
    await db.checkoutTicket.update({ where: { id: cancellableTicket.id }, data: { status: 'cancelled' } });
    // Cancellation releases the active key so the same customer can start a new purchase.
    const replacementOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000004' });
    assert.notEqual(replacementOrder.id, cancellableOrder.id);
    const administrativeTicket = await bindTicket(replacementOrder.id, state.channels.find(c => c.key === 'help').id);
    await assert.rejects(cancelCheckoutSale(db, '100000000000000004', [], administrativeTicket.id), /cargo !/);
    await assert.rejects(cancelCheckoutSale(db, '100000000000000005', ['!'], administrativeTicket.id), /cargo !/);
    // The transaction checks the current configured role, not a stale authorization.
    const originalSettings = await db.digitalStore.findUniqueOrThrow({ where: { guildId: STORE_GUILD_ID } });
    await db.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: { channelsJson: JSON.stringify({ ...JSON.parse(originalSettings.channelsJson), salesCancellationRole: '100000000000000009' }) } });
    await assert.rejects(cancelCheckoutSale(db, '100000000000000005', [cancellationRoleId], administrativeTicket.id), /cargo !/);
    assert.equal((await db.digitalOrder.findUniqueOrThrow({ where: { id: replacementOrder.id } })).status, 'pending');
    await db.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: { channelsJson: originalSettings.channelsJson } });
    await cancelCheckoutSale(db, '100000000000000005', [cancellationRoleId], administrativeTicket.id);
    const administrativeRecord = await db.digitalOrder.findUniqueOrThrow({ where: { id: replacementOrder.id } });
    assert.equal(administrativeRecord.status, 'cancelled');
    assert.equal(administrativeRecord.cancelledBy, '100000000000000005');
    assert.equal((await db.digitalProduct.findUniqueOrThrow({ where: { id: manualProduct.id } })).manualStock, 2);
    const ownerOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000004' });
    const ownerTicket = await bindTicket(ownerOrder.id, state.channels.find(c => c.key === 'logs').id);
    await cancelCheckoutSale(db, '1002774556269891694', [], ownerTicket.id);
    assert.equal((await db.digitalOrder.findUniqueOrThrow({ where: { id: ownerOrder.id } })).cancelledBy, '1002774556269891694');
    const manualOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000002' });
    const manualChannelId = state.channels.find(c => c.key === 'spotify').id;
    const manualTicket = await bindTicket(manualOrder.id, manualChannelId);
    await call('/api/order-action', { id: manualOrder.id, operation: 'approve', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders.find(item => item.id === manualOrder.id).status, 'manual_fulfillment');
    assert.equal(state.products.find(item => item.id === manualProduct.id).manualStock, 1);
    assert.equal(state.products.find(item => item.id === manualProduct.id).stock, 1);
    const approvalNotices = await db.localMessage.findMany({ where: { channelId: manualChannelId } });
    assert.equal(approvalNotices.filter(message => message.body.includes('Pagamento confirmado pela equipe') && message.body.includes(manualOrder.id)).length, 1);
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000002', manualTicket.id));
    const repeatedApproval = await api('/api/order-action', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ id: manualOrder.id, operation: 'approve', confirmed: true }) });
    assert.notEqual(repeatedApproval.status, 200);
    assert.equal((await db.localMessage.findMany({ where: { channelId: manualChannelId } })).filter(message => message.body.includes('Pagamento confirmado pela equipe') && message.body.includes(manualOrder.id)).length, 1);
    assert.deepEqual(state.settings.supportRoleIds, [...DEFAULT_SUPPORT_ROLE_IDS]);
    await call('/api/order-action', { id: manualOrder.id, operation: 'complete-manual', confirmed: true });
    state = await (await api('/api/state', { headers: { cookie } })).json();
    assert.equal(state.orders.find(item => item.id === manualOrder.id).status, 'delivered');
    assert.equal(state.orders.find(item => item.id === manualOrder.id).stockId, null);
    assert.equal((await api(`/api/delivery/${manualOrder.id}`, { headers: { cookie } })).status, 400);
    // A failed ticket notification must not undo payment approval or consume stock twice.
    const failedNoticeOrder = await call('/api/orders', { productId: manualProduct.id, userId: '100000000000000006' });
    const failedNoticeTicket = await bindTicket(failedNoticeOrder.id, state.channels.find(c => c.key === 'nitro').id);
    const failedNoticeTransport = { publish: async () => { throw Error('Ticket indisponível'); } };
    const noticeResult = await approveOrder(db, '1002774556269891694', failedNoticeOrder.id, failedNoticeTransport, async () => { throw Error('Estoque manual não usa chave'); });
    assert.match(noticeResult, /aviso no ticket falhou/);
    assert.equal((await db.digitalOrder.findUniqueOrThrow({ where: { id: failedNoticeOrder.id } })).status, 'manual_fulfillment');
    assert.equal((await db.digitalProduct.findUniqueOrThrow({ where: { id: manualProduct.id } })).manualStock, 0);
    await assert.rejects(cancelCheckoutOrder(db, '100000000000000006', failedNoticeTicket.id), /Pagamento aprovado/);
    assert.equal(stderr, '');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), new Promise(resolveDone => setTimeout(resolveDone, 3000))]);
    await db.$disconnect();
    await rm(dataDir, { recursive: true, force: true });
  }
});
