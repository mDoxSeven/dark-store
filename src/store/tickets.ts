import { money } from './product.js';

type TicketAction = 'confirm' | 'refuse' | 'notify' | 'qr' | 'close' | 'cancel' | 'cancel-confirm' | 'cancel-back';
export const ticketButtonId = (action: TicketAction, ticketId: string) => `store:ticket:${action}:${ticketId}`;

export function parseTicketButton(customId: string) {
  const match = customId.match(/^store:ticket:(confirm|refuse|notify|qr|close|cancel|cancel-confirm|cancel-back):([a-zA-Z0-9_-]{10,40})$/);
  return match ? { action: match[1] as TicketAction, ticketId: match[2] } : null;
}

export function confirmationTicketMessage(ticket: { id: string; userId: string; productTitle: string; priceCents: number }) {
  return { flags: 32768, components: [{ type: 17, accent_color: 0xaeb1b6, components: [
    { type: 10, content: `## Revise sua compra\n<@${ticket.userId}>, confira os dados antes de continuar.\n\n**${ticket.productTitle}**\n${money(ticket.priceCents)}` },
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: 'Ao confirmar, o bot gera o Pix deste pedido. A entrega só acontece depois da conferência manual do pagamento.' },
    { type: 1, components: [
      { type: 2, style: 2, custom_id: ticketButtonId('confirm', ticket.id), label: 'Confirmar compra' },
      { type: 2, style: 2, custom_id: ticketButtonId('refuse', ticket.id), label: 'Recusar e fechar' },
      { type: 2, style: 2, custom_id: ticketButtonId('notify', ticket.id), label: 'Notificar administrador' },
      { type: 2, style: 2, custom_id: ticketButtonId('close', ticket.id), label: 'Encerrar pedido' },
    ] },
    { type: 10, content: `-# Atendimento ${ticket.id}` },
  ] }] };
}

export function cancellationPrompt(ticketId: string) {
  return {
    content: 'Cancelar este pedido? Confirme somente se ainda não fez o pagamento. Se já pagou, notifique o administrador para conferir o Pix. O cancelamento não estorna dinheiro nem invalida um código Pix já copiado.',
    components: [{ type: 1, components: [
      { type: 2, style: 2, custom_id: ticketButtonId('cancel-confirm', ticketId), label: 'Ainda não paguei · cancelar' },
      { type: 2, style: 2, custom_id: ticketButtonId('cancel-back', ticketId), label: 'Manter pedido' },
      { type: 2, style: 2, custom_id: ticketButtonId('notify', ticketId), label: 'Já paguei · chamar administrador' },
    ] }],
  };
}

export function cancelledTicketMessage(orderId: string) {
  return { flags: 32768, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: 0xaeb1b6, components: [
    { type: 10, content: `## Pedido cancelado\nPedido ${orderId} cancelado sem aprovação de pagamento. Não utilize o Pix deste pedido. O atendimento será removido em alguns segundos; o registro continua salvo no painel.` },
  ] }] };
}

export function paymentApprovedMessage(order: { id: string; productTitle: string; priceCents: number }, manual: boolean) {
  return { flags: 32768, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: 0xaeb1b6, components: [
    { type: 10, content: `## Pagamento confirmado pela equipe\n**${order.productTitle}** · ${money(order.priceCents)}\nPedido ${order.id}\n\n${manual ? 'A equipe realizará a entrega neste atendimento.' : 'O bot iniciará a entrega do item no seu privado. Se não receber, chame o administrador.'}\nNão faça outro Pix para este pedido.` },
  ] }] };
}

export function paymentTicketMessage(ticket: { id: string; userId: string; productTitle: string; priceCents: number }, order: { id: string; pixPayload: string | null }) {
  const payment = order.pixPayload
    ? `**Pix copia e cola**\n\`\`\`\n${order.pixPayload}\n\`\`\``
    : 'O Pix ainda não está configurado. Aguarde as instruções da equipe neste atendimento.';
  return { flags: 32768, components: [{ type: 17, accent_color: 0xaeb1b6, components: [
    { type: 10, content: `## Pedido confirmado\n<@${ticket.userId}> · **${ticket.productTitle}** · ${money(ticket.priceCents)}\n\n${payment}` },
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: 'O pagamento será conferido manualmente. Não repita o Pix nem crie outro pedido para o mesmo item.' },
    { type: 1, components: [
      { type: 2, style: 2, custom_id: ticketButtonId('qr', ticket.id), label: 'Visualizar QR Code', disabled: !order.pixPayload },
      { type: 2, style: 2, custom_id: ticketButtonId('notify', ticket.id), label: 'Notificar administrador' },
      { type: 2, style: 2, custom_id: ticketButtonId('cancel', ticket.id), label: 'Cancelar pedido' },
      { type: 2, style: 2, custom_id: ticketButtonId('close', ticket.id), label: 'Encerrar pedido' },
    ] },
    { type: 10, content: `-# Pedido ${order.id} · confirmação manual` },
  ] }] };
}
