import type { PrismaClient } from "@prisma/client";
import { assertStoreOwner, STORE_GUILD_ID } from "./config.js";
import { unsealStock } from "./crypto.js";
import type { StoreTransport } from "./transport.js";
import { buildPixPayload } from "./pix.js";

export async function createOrder(db: PrismaClient, productId: string, userId: string, interactionId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.digitalOrder.findFirst({ where: { OR: [{ interactionId }, { activeKey: `${productId}:${userId}` }] } });
    if (existing) return existing;
    if (await tx.digitalOrder.count({ where: { guildId: STORE_GUILD_ID, userId, status: "pending" } }) >= 3) throw new Error("Voce ja tem tres pedidos pendentes. Procure o suporte.");
    const product = await tx.digitalProduct.findFirst({ where: { id: productId, guildId: STORE_GUILD_ID, active: true } });
    if (!product || !await tx.digitalStock.count({ where: { productId, claimedAt: null } })) throw new Error("Produto indisponivel ou sem estoque.");
    const settings = await tx.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
    const txid = interactionId.replace(/[^a-zA-Z0-9]/g, '').slice(-25) || undefined;
    const pixPayload = settings?.pixEnabled && settings.pixKey && settings.pixMerchantName && settings.pixMerchantCity && txid
      ? buildPixPayload({ key: settings.pixKey, merchantName: settings.pixMerchantName, merchantCity: settings.pixMerchantCity, amountCents: product.priceCents, txid })
      : null;
    return tx.digitalOrder.create({ data: { guildId: STORE_GUILD_ID, productId, userId, interactionId,
      activeKey: `${productId}:${userId}`, productTitle: product.title, priceCents: product.priceCents, pixPayload, pixTxId: txid || null } });
  });
}

export async function approveOrder(db: PrismaClient, actorId: string, orderId: string, transport: StoreTransport, key: Buffer, retry = false) {
  assertStoreOwner(STORE_GUILD_ID, actorId);
  const order = await db.$transaction(async (tx) => {
    const record = await tx.digitalOrder.findFirst({ where: { id: orderId, guildId: STORE_GUILD_ID } });
    if (!record) throw new Error("Pedido inexistente.");
    if (record.status === "delivered") throw new Error("Este pedido ja foi entregue.");
    const stale = record.status === "delivering" && Date.now() - record.updatedAt.getTime() > 300_000;
    if (record.status !== "pending" && !(retry && (record.status === "delivery_failed" || stale))) throw new Error("Pedido em processamento ou encerrado. Confira o resultado antes de repetir.");
    let stockId = record.stockId;
    if (!stockId) {
      const stock = await tx.digitalStock.findFirst({ where: { productId: record.productId, claimedAt: null }, orderBy: { createdAt: "asc" } });
      if (!stock) throw new Error("Estoque esgotado: nao confirme novos pagamentos.");
      const claim = await tx.digitalStock.updateMany({ where: { id: stock.id, claimedAt: null }, data: { claimedAt: new Date() } });
      if (claim.count !== 1) throw new Error("Item reservado por outro pedido. Tente novamente.");
      stockId = stock.id;
    }
    const claimed = await tx.digitalOrder.updateMany({ where: { id: record.id, status: record.status, updatedAt: record.updatedAt }, data: { stockId, status: "delivering", approvedBy: actorId } });
    if (claimed.count !== 1) throw new Error("Outro processo ja alterou este pedido. Confira o resultado.");
    return tx.digitalOrder.findUniqueOrThrow({ where: { id: record.id }, include: { stock: true } });
  });
  let messageId: string;
  try {
    messageId = await transport.deliver(order.userId, order.id, unsealStock(order.stock!.ciphertext, key));
  } catch {
    await db.digitalOrder.update({ where: { id: order.id }, data: { status: "delivery_failed" } });
    throw new Error("Entrega nao confirmada. O item permanece reservado para este pedido. Confira a DM antes de reenviar o MESMO item.");
  }
  // If this write fails after Discord accepted the DM, leave delivering for manual review.
  await db.digitalOrder.update({ where: { id: order.id }, data: { status: "delivered", activeKey: null, deliveryMessageId: messageId } });
  const settings = await db.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  if (settings?.salesChannelId) {
    try {
      const salesMessageId = await transport.sale(settings.salesChannelId, order);
      await db.digitalOrder.update({ where: { id: order.id }, data: { salesMessageId } });
    } catch { return "Entregue. O registro publico de venda falhou; a entrega nao sera repetida."; }
  }
  return "Pagamento confirmado e item entregue no privado.";
}

export async function cancelOrder(db: PrismaClient, actorId: string, orderId: string) {
  assertStoreOwner(STORE_GUILD_ID, actorId);
  const result = await db.digitalOrder.updateMany({ where: { id: orderId, guildId: STORE_GUILD_ID, status: "pending", stockId: null }, data: { status: "cancelled", activeKey: null } });
  if (!result.count) throw new Error("Somente pedidos pendentes, sem item reservado, podem ser cancelados aqui.");
}
