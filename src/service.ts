import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from './lib/db.js';
import { DATA } from './lib/paths.js';
import { localChannels, localGuild, localTransport } from './lib/simulation.js';
import { executeCriar } from './bot/criar.js';
import { APPLICATION_ID, MODE, STORE_GUILD_ID, STORE_LAYOUT, STORE_OWNER_ID } from './store/config.js';
import { validateProduct, productMessage, type ProductInput } from './store/product.js';
import { createOrder, approveOrder, cancelOrder } from './store/orders.js';
import { sealStock, unsealStock, storeKey, stockFingerprint } from './store/crypto.js';
import { buildV2Message, validateV2Panel, type V2PanelInput } from './v2.js';
import { AntiRaidEngine, respondToRaid, validateAntiRaid, type AntiRaidSettings } from './antiRaid.js';

export class InputError extends Error {}
const requireProduct = async (id: string) => {
  const product = await prisma.digitalProduct.findFirst({ where: { id, guildId: STORE_GUILD_ID } });
  if (!product) throw new InputError('Produto não encontrado.');
  return product;
};
export async function state() {
  const [products, orders, channels, settings, messages, panels, antiRaid, incidents] = await Promise.all([
    prisma.digitalProduct.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { updatedAt: 'desc' }, take: 200, include: { _count: { select: { stock: { where: { claimedAt: null } } } } } }),
    prisma.digitalOrder.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, productId: true, userId: true, productTitle: true, priceCents: true, status: true, createdAt: true } }),
    localChannels(), prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } }),
    prisma.localMessage.count(),
    prisma.managedV2Panel.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { updatedAt: 'desc' }, take: 100, include: { buttons: { orderBy: { position: 'asc' } } } }),
    prisma.antiRaidConfig.findUnique({ where: { guildId: STORE_GUILD_ID } }),
    prisma.securityIncident.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  return { applicationId: APPLICATION_ID, guildId: STORE_GUILD_ID, mode: MODE, layout: STORE_LAYOUT,
    products: products.map(({ _count, ...p }) => ({ ...p, stock: _count.stock })), orders, channels, settings, messages,
    panels: panels.map(panel => ({ ...panel, buttons: panel.buttons.map(button => ({ ...button, url: button.url || '', roleId: button.roleId || '', emoji: button.emoji || '' })) })),
    antiRaid: antiRaid ? { ...antiRaid, quarantineRoleId: antiRaid.quarantineRoleId || '', logChannelId: antiRaid.logChannelId || '', trustedUserIds: JSON.parse(antiRaid.trustedUserIds) } : defaultAntiRaid(), incidents };
}
export async function simulateSetup(confirmed: boolean) {
  return executeCriar(await localGuild(), STORE_OWNER_ID, confirmed);
}
async function refreshProduct(id: string) {
  const lock = await prisma.digitalProduct.updateMany({ where: { id, OR: [{ publishUntil: null }, { publishUntil: { lt: new Date() } }] }, data: { publishUntil: new Date(Date.now() + 60_000) } });
  if (!lock.count) return;
  try {
    const p = await requireProduct(id);
    if (!p.channelId) return;
    const stock = await prisma.digitalStock.count({ where: { productId: id, claimedAt: null } });
    const messageId = await localTransport().publish(p.channelId, p.messageId, productMessage(p, stock));
    await prisma.digitalProduct.update({ where: { id }, data: { messageId } });
  } finally { await prisma.digitalProduct.updateMany({ where: { id }, data: { publishUntil: null } }); }
}
export async function saveProduct(body: Record<string, unknown>) {
  let data: ProductInput;
  try { data = validateProduct(body.product as ProductInput); } catch { throw new InputError('Revise título, preço em centavos, imagem HTTPS e limites dos campos.'); }
  const id = typeof body.id === 'string' ? body.id : null;
  const channelId = typeof body.channelId === 'string' && body.channelId ? body.channelId : null;
  if (channelId) await localTransport().checkChannel(channelId);
  if (id) {
    const old = await requireProduct(id);
    if (old.messageId && old.channelId !== channelId) throw new InputError('Mantenha o canal de uma publicação existente.');
  } else if (await prisma.digitalProduct.count() >= 200) throw new InputError('Limite desta versão: 200 produtos.');
  const p = id ? await prisma.digitalProduct.update({ where: { id }, data: { ...data, channelId } })
    : await prisma.digitalProduct.create({ data: { ...data, guildId: STORE_GUILD_ID, channelId } });
  try { await refreshProduct(p.id); }
  catch { return { id: p.id, message: 'Produto salvo. A prévia local precisa ser atualizada; não recadastre o produto.' }; }
  return { id: p.id, message: 'Produto salvo. Publicação simulada atualizada, sem enviar ao Discord.' };
}
export async function addStock(body: Record<string, unknown>) {
  const id = String(body.productId || '');
  await requireProduct(id);
  if (typeof body.text !== 'string' || body.text.length > 200_000) throw new InputError('Lote inválido ou muito grande.');
  const items = body.text.split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!items.length || items.length > 100 || items.some(s => s.length > 10_000)) throw new InputError('Até 100 itens, 10 mil caracteres por item, separados por linha em branco.');
  const key = await storeKey(await prisma.digitalStock.count() === 0);
  const count = await prisma.$transaction(async tx => {
    let added = 0;
    for (const item of items) {
      const fingerprint = stockFingerprint(item, key);
      if (await tx.digitalStock.findUnique({ where: { productId_fingerprint: { productId: id, fingerprint } } })) continue;
      await tx.digitalStock.create({ data: { productId: id, fingerprint, ciphertext: sealStock(item, key) } });
      added++;
    }
    return added;
  }, { timeout: 15_000 });
  try { await refreshProduct(id); } catch { return { message: `${count} itens salvos. Salve o produto para atualizar sua prévia.` }; }
  return { message: `${count} itens adicionados; duplicados ignorados.` };
}
export async function simulateOrder(body: Record<string, unknown>) {
  if (typeof body.userId !== 'string' || !/^\d{17,20}$/.test(body.userId)) throw new InputError('Informe um ID de teste com 17 a 20 dígitos.');
  const order = await createOrder(prisma, String(body.productId || ''), body.userId, randomUUID());
  return { id: order.id, message: `Pedido de teste ${order.id} criado. Nenhuma cobrança ou DM real.` };
}
export async function processOrder(body: Record<string, unknown>) {
  if (body.confirmed !== true) throw new InputError('Confirme a simulação.');
  const id = String(body.id || '');
  const order = await prisma.digitalOrder.findFirst({ where: { id, guildId: STORE_GUILD_ID } });
  if (!order) throw new InputError('Pedido não encontrado.');
  try {
    if (body.operation === 'cancel') await cancelOrder(prisma, STORE_OWNER_ID, id);
    else if (body.operation === 'approve' || body.operation === 'retry') {
      await approveOrder(prisma, STORE_OWNER_ID, id, localTransport(body.failDM === true), await storeKey(), body.operation === 'retry');
    } else throw new InputError('Operação inválida.');
  } finally { await refreshProduct(order.productId).catch(() => {}); }
  return { message: 'Simulação registrada. Nenhum pagamento, mensagem ou entrega real.' };
}
export async function saveSettings(body: Record<string, unknown>) {
  if (typeof body.paymentInstructions !== 'string' || body.paymentInstructions.length > 1000) throw new InputError('Instruções: até 1000 caracteres.');
  const salesChannelId = typeof body.salesChannelId === 'string' && body.salesChannelId ? body.salesChannelId : null;
  if (salesChannelId) await localTransport().checkChannel(salesChannelId);
  await prisma.digitalStore.upsert({ where: { guildId: STORE_GUILD_ID }, create: { guildId: STORE_GUILD_ID, paymentInstructions: body.paymentInstructions, salesChannelId }, update: { paymentInstructions: body.paymentInstructions, salesChannelId } });
  return { message: 'Configurações locais salvas.' };
}
export async function delivery(id: string) {
  const order = await prisma.digitalOrder.findFirst({ where: { id, guildId: STORE_GUILD_ID, status: 'delivered' }, include: { stock: true } });
  if (!order?.stock) throw new InputError('Não há entrega simulada concluída para este pedido.');
  return unsealStock(order.stock.ciphertext, await storeKey());
}
export async function v2(id: string) {
  const p = await requireProduct(id);
  return productMessage(p, await prisma.digitalStock.count({ where: { productId: id, claimedAt: null } }));
}

export function defaultAntiRaid(): AntiRaidSettings {
  return { enabled: false, joinLimit: 8, joinWindowSeconds: 10, minAccountAgeHours: 24, destructiveLimit: 3, destructiveWindowSeconds: 15, action: 'QUARANTINE', quarantineRoleId: '', logChannelId: '', trustedUserIds: [] };
}
export async function saveV2Panel(body: Record<string, unknown>) {
  let panel: V2PanelInput;
  try { panel = validateV2Panel(body.panel as V2PanelInput); } catch (error) { throw new InputError(error instanceof Error ? error.message : 'Painel inválido.'); }
  await localTransport().checkChannel(panel.channelId);
  if (panel.assetId && !await prisma.mediaAsset.findUnique({ where: { id: panel.assetId } })) throw new InputError('Anexo local não encontrado.');
  const id = typeof body.id === 'string' ? body.id : null;
  const old = id ? await prisma.managedV2Panel.findFirst({ where: { id, guildId: STORE_GUILD_ID } }) : null;
  if (id && !old) throw new InputError('Painel V2 não encontrado.');
  if (!id && await prisma.managedV2Panel.count({ where: { guildId: STORE_GUILD_ID } }) >= 100) throw new InputError('Limite desta versão: 100 painéis V2.');
  const saved = await prisma.$transaction(async tx => {
    const data = { guildId: STORE_GUILD_ID, name: panel.name, channelId: panel.channelId, title: panel.title || null, description: panel.description || null, color: panel.color, imageUrl: panel.imageUrl || null, assetId: panel.assetId || null, thumbnailUrl: panel.thumbnailUrl || null, footer: panel.footer || null, imagePosition: panel.imagePosition, showDivider: panel.showDivider, spacing: panel.spacing };
    const result = id ? await tx.managedV2Panel.update({ where: { id }, data }) : await tx.managedV2Panel.create({ data });
    await tx.managedV2Button.deleteMany({ where: { panelId: result.id } });
    if (panel.buttons.length) await tx.managedV2Button.createMany({ data: panel.buttons.map((button, position) => ({ panelId: result.id, label: button.label, type: button.type, url: button.url || null, roleId: button.roleId || null, roleMode: button.roleMode, style: button.style, emoji: button.emoji || null, position })) });
    return result;
  });
  if (old?.messageId && old.channelId !== panel.channelId) await prisma.localMessage.deleteMany({ where: { id: old.messageId } });
  const messageId = await localTransport().publish(panel.channelId, old?.channelId === panel.channelId ? old.messageId : null, buildV2Message(panel, panel.assetId ? `/api/assets/${panel.assetId}` : ''));
  await prisma.managedV2Panel.update({ where: { id: saved.id }, data: { messageId } });
  return { id: saved.id, message: 'Painel V2 salvo e publicação local sincronizada.' };
}
export async function removeV2Panel(id: string) {
  const panel = await prisma.managedV2Panel.findFirst({ where: { id, guildId: STORE_GUILD_ID } });
  if (!panel) throw new InputError('Painel V2 não encontrado.');
  await prisma.$transaction([prisma.localMessage.deleteMany({ where: { id: panel.messageId || '' } }), prisma.managedV2Panel.delete({ where: { id } })]);
  return { message: 'Painel V2 e publicação local removidos.' };
}
const assetsDir = resolve(DATA, 'assets');
export async function saveAsset(filename: string, mime: string, value: Buffer) {
  const types: Record<string, (b: Buffer) => boolean> = {
    'image/png': b => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9,
    'image/webp': b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
    'image/gif': b => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())
  };
  if (!value.length || value.length > 7 * 1024 * 1024 || !types[mime]?.(value)) throw new InputError('Imagem inválida. Use PNG, JPEG, WEBP ou GIF de até 7 MB.');
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'image';
  await mkdir(assetsDir, { recursive: true });
  const record = await prisma.mediaAsset.create({ data: { filename: safe, mime, size: value.length } });
  try { await writeFile(resolve(assetsDir, record.id), value, { flag: 'wx', mode: 0o600 }); }
  catch { await prisma.mediaAsset.delete({ where: { id: record.id } }).catch(() => {}); throw new Error('Falha ao guardar imagem.'); }
  return { id: record.id, url: `/api/assets/${record.id}`, message: 'Imagem anexada ao laboratório local.' };
}
export async function getAsset(id: string) {
  if (!/^[a-z\d]{20,32}$/i.test(id)) throw new InputError('Anexo inválido.');
  const record = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!record) throw new InputError('Anexo não encontrado.');
  return { ...record, data: await readFile(resolve(assetsDir, record.id)) };
}
export async function saveAntiRaid(body: Record<string, unknown>) {
  let input: AntiRaidSettings;
  try { input = validateAntiRaid(body.settings as AntiRaidSettings); } catch (error) { throw new InputError(error instanceof Error ? error.message : 'Configuração inválida.'); }
  if (input.logChannelId) await localTransport().checkChannel(input.logChannelId);
  await prisma.antiRaidConfig.upsert({ where: { guildId: STORE_GUILD_ID }, create: { guildId: STORE_GUILD_ID, ...input, trustedUserIds: JSON.stringify(input.trustedUserIds), quarantineRoleId: input.quarantineRoleId || null, logChannelId: input.logChannelId || null }, update: { ...input, trustedUserIds: JSON.stringify(input.trustedUserIds), quarantineRoleId: input.quarantineRoleId || null, logChannelId: input.logChannelId || null } });
  return { message: 'Anti-raid salvo no laboratório. Nenhuma ação externa foi ativada.' };
}
const raidEngine = new AntiRaidEngine();
export async function simulateRaid(body: Record<string, unknown>) {
  const record = await prisma.antiRaidConfig.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const settings = record ? validateAntiRaid({ ...record, quarantineRoleId: record.quarantineRoleId || '', logChannelId: record.logChannelId || '', trustedUserIds: JSON.parse(record.trustedUserIds) } as AntiRaidSettings) : defaultAntiRaid();
  if (!settings.enabled) throw new InputError('Ative e salve o anti-raid antes de simular.');
  const count = Number(body.count);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new InputError('Quantidade de simulação inválida.');
  const responder = { quarantine: async () => {}, kick: async () => {}, ban: async () => {}, log: async () => {} };
  let detected = false, reasons: string[] = [];
  if (body.type === 'join') {
    const age = Number(body.accountAgeHours);
    if (!Number.isFinite(age) || age < 0 || age > 100_000) throw new InputError('Idade da conta inválida.');
    for (let i = 0; i < count; i++) { const result = raidEngine.join(settings, Date.now() - age * 3600_000, Date.now() + i); detected ||= result.detected; reasons = [...new Set([...reasons, ...result.reasons])]; }
  } else if (body.type === 'destructive') {
    const actorId = String(body.actorId || '');
    if (!/^\d{17,20}$/.test(actorId)) throw new InputError('Ator inválido.');
    for (let i = 0; i < count; i++) { const result = raidEngine.audit(settings, actorId, String(body.auditAction || ''), Date.now() + i); detected ||= result.detected; reasons = [...new Set([...reasons, ...result.reasons])]; }
    if (detected) await respondToRaid(prisma, settings, actorId, 'DESTRUCTIVE_BURST', reasons, responder);
  } else throw new InputError('Tipo de simulação inválido.');
  if (body.type === 'join' && detected) await respondToRaid(prisma, settings, String(body.targetId || '100000000000000001'), 'JOIN_BURST', reasons, responder);
  return { detected, reasons, message: detected ? `Raid detectado na simulação: ${reasons.join('; ')}.` : 'Nenhum raid detectado com esses dados.' };
}
