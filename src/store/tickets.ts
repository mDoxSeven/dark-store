import { money } from './product.js';

export const ticketButtonId = (action: 'confirm' | 'refuse' | 'notify' | 'qr', ticketId: string) => `store:ticket:${action}:${ticketId}`;

export function parseTicketButton(customId: string) {
  const match = customId.match(/^store:ticket:(confirm|refuse|notify|qr):([a-zA-Z0-9_-]{10,40})$/);
  return match ? { action: match[1] as 'confirm' | 'refuse' | 'notify' | 'qr', ticketId: match[2] } : null;
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
    ] },
    { type: 10, content: `-# Atendimento ${ticket.id}` },
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
    ] },
    { type: 10, content: `-# Pedido ${order.id} · confirmação manual` },
  ] }] };
}
