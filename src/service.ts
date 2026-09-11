import { randomUUID } from 'node:crypto';
import { prisma } from './lib/db.js';
import { localChannels, localGuild, localTransport } from './lib/simulation.js';
import { executeCriar } from './bot/criar.js';
import { APPLICATION_ID, MODE, STORE_GUILD_ID, STORE_LAYOUT, STORE_OWNER_ID } from './store/config.js';
import { validateProduct, productMessage, type ProductInput } from './store/product.js';
import { createOrder, approveOrder, cancelOrder } from './store/orders.js';
import { sealStock, unsealStock, storeKey, stockFingerprint } from './store/crypto.js';

export class InputError extends Error {}
const requireProduct = async (id: string) => {
  const product = await prisma.digitalProduct.findFirst({ where: { id, guildId: STORE_GUILD_ID } });
  if (!product) throw new InputError('Produto não encontrado.');
  return product;
};
export async function state() {
  const [products, orders, channels, settings, messages] = await Promise.all([
    prisma.digitalProduct.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { updatedAt: 'desc' }, take: 200, include: { _count: { select: { stock: { where: { claimedAt: null } } } } } }),
    prisma.digitalOrder.findMany({ where: { guildId: STORE_GUILD_ID }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, productId: true, userId: true, productTitle: true, priceCents: true, status: true, createdAt: true } }),
    localChannels(), prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } }),
    prisma.localMessage.count()
  ]);
  return { applicationId: APPLICATION_ID, guildId: STORE_GUILD_ID, mode: MODE, layout: STORE_LAYOUT,
    products: products.map(({ _count, ...p }) => ({ ...p, stock: _count.stock })), orders, channels, settings, messages };
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
