import type { PrismaClient } from "@prisma/client";
import { assertStoreOwner, canCancelSales, STORE_GUILD_ID, STORE_OWNER_ID } from "./config.js";
import { unsealStock } from "./crypto.js";
import type { StoreTransport } from "./transport.js";
import { buildPixPayload } from "./pix.js";
import { paymentApprovedMessage } from "./tickets.js";

export async function createOrder(db: PrismaClient, productId: string, userId: string, interactionId: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.digitalOrder.findFirst({ where: { OR: [{ interactionId }, { activeKey: `${productId}:${userId}` }] } });
    if (existing) return existing;
    if (await tx.digitalOrder.count({ where: { guildId: STORE_GUILD_ID, userId, status: "pending" } }) >= 3) throw new Error("Voce ja tem tres pedidos pendentes. Procure o suporte.");
    const product = await tx.digitalProduct.findFirst({ where: { id: productId, guildId: STORE_GUILD_ID, active: true } });
    const automaticStock = product ? await tx.digitalStock.count({ where: { productId, claimedAt: null } }) : 0;
    if (!product || automaticStock + product.manualStock < 1) throw new Error("Produto indisponivel ou sem estoque.");
    const settings = await tx.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
    const txid = interactionId.replace(/[^a-zA-Z0-9]/g, '').slice(-25) || undefined;
    const pixPayload = settings?.pixEnabled && settings.pixKey && settings.pixMerchantName && settings.pixMerchantCity && txid
      ? buildPixPayload({ key: settings.pixKey, merchantName: settings.pixMerchantName, merchantCity: settings.pixMerchantCity, amountCents: product.priceCents, txid })
      : null;
    return tx.digitalOrder.create({ data: { guildId: STORE_GUILD_ID, productId, userId, interactionId,
      activeKey: `${productId}:${userId}`, productTitle: product.title, priceCents: product.priceCents, pixPayload, pixTxId: txid || null } });
  });
}

export async function approveOrder(db: PrismaClient, actorId: string, orderId: string, transport: StoreTransport, getKey: () => Promise<Buffer>, retry = false) {
  assertStoreOwner(STORE_GUILD_ID, actorId);
  const reservation = await db.$transaction(async (tx) => {
    const record = await tx.digitalOrder.findFirst({ where: { id: orderId, guildId: STORE_GUILD_ID } });
    if (!record) throw new Error("Pedido inexistente.");
    if (record.status === "delivered") throw new Error("Este pedido ja foi entregue.");
    const stale = record.status === "delivering" && Date.now() - record.updatedAt.getTime() > 300_000;
    if (record.status !== "pending" && !(retry && (record.status === "delivery_failed" || stale))) throw new Error("Pedido em processamento ou encerrado. Confira o resultado antes de repetir.");
    let stockId = record.stockId;
    if (!stockId) {
      const stock = await tx.digitalStock.findFirst({ where: { productId: record.productId, claimedAt: null }, orderBy: { createdAt: "asc" } });
      if (!stock) {
        const claimManual = await tx.digitalProduct.updateMany({ where: { id: record.productId, manualStock: { gt: 0 } }, data: { manualStock: { decrement: 1 } } });
        if (claimManual.count !== 1) throw new Error("Estoque esgotado: nao confirme novos pagamentos.");
        const claimed = await tx.digitalOrder.updateMany({ where: { id: record.id, status: record.status, updatedAt: record.updatedAt }, data: { status: "manual_fulfillment", activeKey: null, approvedBy: actorId } });
        if (claimed.count !== 1) throw new Error("Outro processo ja alterou este pedido. Confira o resultado.");
        return { manual: true as const, firstApproval: !record.approvedBy, order: await tx.digitalOrder.findUniqueOrThrow({ where: { id: record.id }, include: { stock: true } }) };
      }
      const claim = await tx.digitalStock.updateMany({ where: { id: stock.id, claimedAt: null }, data: { claimedAt: new Date() } });
      if (claim.count !== 1) throw new Error("Item reservado por outro pedido. Tente novamente.");
      stockId = stock.id;
    }
    const claimed = await tx.digitalOrder.updateMany({ where: { id: record.id, status: record.status, updatedAt: record.updatedAt }, data: { stockId, status: "delivering", approvedBy: actorId } });
    if (claimed.count !== 1) throw new Error("Outro processo ja alterou este pedido. Confira o resultado.");
    return { manual: false as const, firstApproval: !record.approvedBy, order: await tx.digitalOrder.findUniqueOrThrow({ where: { id: record.id }, include: { stock: true } }) };
  });
  let notificationWarning = '';
  if (reservation.firstApproval) {
    try {
      const ticket = await db.checkoutTicket.findFirst({ where: { guildId: STORE_GUILD_ID, orderId, deleteAt: null } });
      if (ticket) await transport.publish(ticket.channelId, null, paymentApprovedMessage(reservation.order, reservation.manual));
    } catch { notificationWarning = ' O aviso no ticket falhou; avise o cliente manualmente. Não aprove novamente.'; }
  }
  if (reservation.manual) return "Pagamento confirmado. Uma unidade do estoque manual foi baixada; conclua a entrega no ticket." + notificationWarning;
  const order = reservation.order;
  const key = await getKey();
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
    } catch { return "Entregue. O registro publico de venda falhou; a entrega nao sera repetida." + notificationWarning; }
  }
  return "Pagamento confirmado e item entregue no privado." + notificationWarning;
}

export async function completeManualOrder(db: PrismaClient, actorId: string, orderId: string, transport: StoreTransport) {
  assertStoreOwner(STORE_GUILD_ID, actorId);
  const changed = await db.digitalOrder.updateMany({ where: { id: orderId, guildId: STORE_GUILD_ID, status: "manual_fulfillment" }, data: { status: "delivered", activeKey: null } });
  if (!changed.count) throw new Error("Somente entregas manuais pendentes podem ser concluídas aqui.");
  const order = await db.digitalOrder.findUniqueOrThrow({ where: { id: orderId } });
  const settings = await db.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  if (settings?.salesChannelId) {
    try {
      const salesMessageId = await transport.sale(settings.salesChannelId, order);
      await db.digitalOrder.update({ where: { id: order.id }, data: { salesMessageId } });
    } catch { return "Entrega manual concluída. O registro público da venda falhou."; }
  }
  return "Entrega manual marcada como concluída.";
}

export async function cancelOrder(db: PrismaClient, actorId: string, orderId: string) {
  assertStoreOwner(STORE_GUILD_ID, actorId);
  const result = await db.digitalOrder.updateMany({ where: { id: orderId, guildId: STORE_GUILD_ID, status: "pending", stockId: null, approvedBy: null }, data: { status: "cancelled", activeKey: null, cancelledBy: actorId } });
  if (!result.count) throw new Error("Somente pedidos pendentes, sem item reservado, podem ser cancelados aqui.");
}

export async function cancelCheckoutOrder(db: PrismaClient, actorId: string, ticketId: string) {
  return cancelCheckout(db, actorId, ticketId);
}

export async function cancelCheckoutSale(db: PrismaClient, actorId: string, actorRoleIds: readonly string[], ticketId: string) {
  return cancelCheckout(db, actorId, ticketId, actorRoleIds);
}

async function cancelCheckout(db: PrismaClient, actorId: string, ticketId: string, administrativeRoleIds?: readonly string[]) {
  return db.$transaction(async tx => {
    if (administrativeRoleIds !== undefined) {
      const settings = await tx.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
      if (!canCancelSales(actorId, administrativeRoleIds, settings)) throw new Error('Somente membros com o cargo ! ou o responsável pela loja podem cancelar vendas.');
    }
    const ticket = await tx.checkoutTicket.findFirst({ where: { id: ticketId, guildId: STORE_GUILD_ID } });
    if (!ticket || (administrativeRoleIds === undefined && ticket.userId !== actorId && actorId !== STORE_OWNER_ID)) throw new Error('Somente o cliente deste atendimento ou o responsável pela loja pode cancelar o pedido.');
    if (ticket.status !== 'awaiting_payment' || !ticket.orderId || ticket.deleteAt) throw new Error('Este pedido não está aguardando pagamento ou já foi encerrado.');
    const cancelled = await tx.digitalOrder.updateMany({
      where: { id: ticket.orderId, guildId: STORE_GUILD_ID, userId: ticket.userId, productId: ticket.productId, status: 'pending', stockId: null, approvedBy: null },
      data: { status: 'cancelled', activeKey: null, cancelledBy: actorId },
    });
    if (cancelled.count !== 1) throw new Error('Pagamento aprovado ou pedido em processamento. Procure o administrador; este pedido não pode mais ser cancelado pelo cliente.');
    const closed = await tx.checkoutTicket.updateMany({
      where: { id: ticket.id, status: 'awaiting_payment', orderId: ticket.orderId, deleteAt: null },
      data: { status: 'cancelled', activeKey: null, deleteAt: new Date(Date.now() + 10_000) },
    });
    if (closed.count !== 1) throw new Error('O atendimento já foi alterado. Confira o resultado antes de repetir.');
    return { orderId: ticket.orderId };
  });
}
