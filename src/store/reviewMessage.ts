import { money } from './product.js';

export function reviewRequestMessage(order: { id: string; productTitle: string; priceCents: number }, guildId: string, channelId: string) {
  const channelUrl = `https://discord.com/channels/${guildId}/${channelId}`;
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [{ type: 17, accent_color: 0xaeb1b6, components: [
      { type: 10, content: `## Pedido concluído\nSeu pedido **${order.productTitle}** foi encerrado com sucesso.\n${money(order.priceCents)} · pedido \`${order.id}\`` },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: 'Conte como foi sua experiência no canal de avaliações. Se gostou do atendimento, deixe seu **10/10** para a dark store.' },
      { type: 1, components: [{ type: 2, style: 5, label: 'Avaliar pedido', url: channelUrl }] },
      { type: 10, content: '-# Seu acesso ao canal de avaliações foi liberado.' },
    ] }],
  };
}
