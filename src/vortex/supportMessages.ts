export const VORTEX_GUILD_ID = '1551447870358560930';
export const VORTEX_SUPPORT_SELECT_ID = 'vortex:support:open';
export const VORTEX_SUPPORT_BANNER_URL = 'https://raw.githubusercontent.com/mDoxSeven/dark-store/main/public/vortex-support-banner-v1.png';

export const VORTEX_SUPPORT_CATEGORIES = {
  question: { label: 'Dúvidas', description: 'Dúvidas sobre o servidor ou seu funcionamento.' },
  report: { label: 'Denúncia', description: 'Denuncie uma situação de forma privada à equipe.' },
  partnership: { label: 'Parceria', description: 'Converse com a equipe sobre uma possível parceria.' },
} as const;

export type VortexSupportCategory = keyof typeof VORTEX_SUPPORT_CATEGORIES;
type TicketState = { id: string; userId: string; category: string; status: string; claimedBy: string | null; closedBy?: string | null; channelId?: string | null; createdAt: Date };

export const vortexSupportButtonId = (action: 'claim' | 'notify' | 'close', ticketId: string) => `vortex:support:${action}:${ticketId}`;

export function parseVortexSupportButton(customId: string) {
  const match = customId.match(/^vortex:support:(claim|notify|close):([a-z0-9]{20,32})$/i);
  return match ? { action: match[1] as 'claim' | 'notify' | 'close', ticketId: match[2] } : null;
}

export const vortexCategory = (value: string) => VORTEX_SUPPORT_CATEGORIES[value as VortexSupportCategory] ?? null;
export const isVortexSupportSetupCommand = (content: string) => content.trim().toLocaleLowerCase('pt-BR') === '!criarsuporte';
export const canCloseVortexTicket = (ticket: Pick<TicketState, 'status' | 'claimedBy'>, member: { id: string; administrator: boolean; support: boolean }) =>
  ticket.status === 'CLAIMED' && (member.administrator || (member.support && ticket.claimedBy === member.id));

const controls = (ticket: TicketState) => ({ type: 1, components: [
  { type: 2, style: 2, custom_id: vortexSupportButtonId('claim', ticket.id), label: ticket.status === 'OPEN' ? 'Assumir atendimento' : 'Atendimento assumido', disabled: ticket.status !== 'OPEN' },
  { type: 2, style: 2, custom_id: vortexSupportButtonId('notify', ticket.id), label: 'Notificar membro', disabled: ticket.status === 'CLOSED' },
  { type: 2, style: 2, custom_id: vortexSupportButtonId('close', ticket.id), label: 'Fechar ticket', disabled: ticket.status !== 'CLAIMED' },
] });

export function vortexSupportPanelMessage() {
  return { flags: 32768, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: 0x7c3aed, components: [
    { type: 12, items: [{ media: { url: VORTEX_SUPPORT_BANNER_URL }, description: 'Central de suporte Vortex' }] },
    { type: 10, content: '## Central de Suporte\nAbra um atendimento privado com a equipe da **Vortex X Competition**. Escolha o assunto correto para agilizar seu suporte.' },
    { type: 14, divider: true, spacing: 1 },
    { type: 1, components: [{ type: 3, custom_id: VORTEX_SUPPORT_SELECT_ID, placeholder: 'Selecione o tipo de atendimento', min_values: 1, max_values: 1, options: Object.entries(VORTEX_SUPPORT_CATEGORIES).map(([value, item]) => ({ label: item.label, description: item.description, value })) }] },
    { type: 10, content: '-# Um ticket privado será criado e a equipe de suporte será comunicada.' },
  ] }] };
}

export function vortexTicketMessage(ticket: TicketState) {
  const category = vortexCategory(ticket.category);
  const state = ticket.status === 'CLAIMED' && ticket.claimedBy ? `Assumido por <@${ticket.claimedBy}>` : ticket.status === 'CLOSED' ? 'Encerrado' : 'Aguardando atendimento';
  return { flags: 32768, allowed_mentions: { users: [ticket.userId, ...(ticket.claimedBy ? [ticket.claimedBy] : [])] }, components: [{ type: 17, accent_color: 0x7c3aed, components: [
    { type: 10, content: `## Ticket de ${category?.label ?? 'Suporte'}\n<@${ticket.userId}>, seu atendimento privado foi criado.\n\n**Status:** ${state}\n**Aberto:** <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>` },
    { type: 14, divider: true, spacing: 1 },
    controls(ticket),
    { type: 10, content: `-# Ticket ${ticket.id}` },
  ] }] };
}

export function vortexStaffMessage(ticket: TicketState, supportRoleId?: string | null) {
  const category = vortexCategory(ticket.category);
  const state = ticket.status === 'CLAIMED' && ticket.claimedBy ? `Assumido por <@${ticket.claimedBy}>` : ticket.status === 'CLOSED' ? `Encerrado${ticket.closedBy ? ` por <@${ticket.closedBy}>` : ''}` : 'Aguardando um atendente';
  return { flags: 32768, allowed_mentions: { users: [ticket.userId, ...(ticket.claimedBy ? [ticket.claimedBy] : [])] }, components: [{ type: 17, accent_color: 0x7c3aed, components: [
    { type: 10, content: `${supportRoleId && ticket.status === 'OPEN' ? `<@&${supportRoleId}>\n` : ''}## Novo atendimento\n**Membro:** <@${ticket.userId}> (\`${ticket.userId}\`)\n**Assunto:** ${category?.label ?? 'Suporte'}\n**Status:** ${state}\n${ticket.channelId ? `**Canal:** <#${ticket.channelId}>` : ''}` },
    { type: 14, divider: true, spacing: 1 },
    controls(ticket),
  ] }] };
}

export function vortexClosedMessage(ticket: TicketState) {
  return { flags: 32768, allowed_mentions: { users: [ticket.userId] }, components: [{ type: 17, accent_color: 0x5d626b, components: [
    { type: 10, content: `## Atendimento encerrado\n<@${ticket.userId}>, este ticket foi finalizado pela equipe. O canal será excluído automaticamente em alguns segundos.\n\n-# Ticket ${ticket.id}` },
  ] }] };
}
