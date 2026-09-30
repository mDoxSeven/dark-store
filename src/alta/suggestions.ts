import { ChannelType, MessageFlags, PermissionFlagsBits as P, escapeMarkdown,
  type Client, type Message, type MessageCreateOptions,
  type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import type { AltaSuggestion } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';
import { ALTA_GUILD_ID } from './rise.js';

export const SUGGESTION_CHANNEL = '1553375936970490026';
export const SUGGESTION_ROLES = ['1375095425324814476', '1428094473904193628', '1428093853453389925', '1464375014903255182'];
export const SUGGESTION_CATEGORIES = [
  { key: 'family', label: 'Família', description: 'Convivência, organização e comunidade' },
  { key: 'internal', label: 'Servidor interno', description: 'Canais, cargos e organização interna' },
  { key: 'ideas', label: 'Ideias e eventos', description: 'Atividades e novas experiências para a Alta' },
  { key: 'bot', label: 'Melhorias no bot', description: 'Funções e melhorias para os bots' },
  { key: 'other', label: 'Outros', description: 'Sua sugestão não se encaixa nas demais opções' },
];
const icons = new Map<string, { id: string; name: string }>();
const icon = (name: string) => { const emoji = icons.get(name); return emoji ? `<:${emoji.name}:${emoji.id}>` : '◇'; };
const label = (key: string) => SUGGESTION_CATEGORIES.find(item => item.key === key)?.label ?? 'Outros';
export const canReviewSuggestion = (roles: Iterable<string>) => [...roles].some(role => SUGGESTION_ROLES.includes(role));
export function suggestionText(text: string) {
  const value = text.trim();
  if (value.length < 10 || value.length > 1500) throw new Error('Escreva entre 10 e 1500 caracteres.');
  return value;
}
function v2(text: string, rows: Record<string, unknown>[] = []): MessageCreateOptions {
  return { flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }, components: [{
    type: 17, accent_color: 0xb9c0ca, components: [
      { type: 10, content: text }, ...rows,
      { type: 14, divider: true, spacing: 1 }, { type: 10, content: '-# Alta Cúpula • Sua voz faz parte da nossa história' },
    ],
  }] } as unknown as MessageCreateOptions;
}
export function suggestionPanel() {
  return v2(`# ${icon('alta')} | SUGESTÕES — ALTA\n${icon('bulb')} **Uma boa ideia pode transformar a nossa família.**\n\nEscolha abaixo o tipo de sugestão e escreva sua proposta neste chat.\n\n${icon('arrow')} Você terá **10 minutos** para enviar um texto de **10 a 1500 caracteres**. Use \`cancelar\` para desistir.\n${icon('clock')} A equipe analisa antes de publicar. Após o encaminhamento, o bot remove sua mensagem original do chat.\n\n*Seja claro, respeitoso e conte como sua ideia pode ajudar.*`, [{ type: 1, components: [{
    type: 3, custom_id: 'alta:suggestion:category', placeholder: 'Qual é a sua sugestão?', min_values: 1, max_values: 1,
    options: SUGGESTION_CATEGORIES.map(item => ({ label: item.label, description: item.description, value: item.key, emoji: icons.get(item.key) })),
  }] }]);
}
export function suggestionCard(item: Pick<AltaSuggestion, 'id' | 'authorId' | 'category' | 'body' | 'status' | 'reviewerId'>, review = false) {
  const rows = review && item.status === 'PENDING' ? [{ type: 1, components: [
    { type: 2, style: 2, custom_id: `alta:suggestion:approve:${item.id}`, label: 'Aprovar', emoji: icons.get('check') },
    { type: 2, style: 2, custom_id: `alta:suggestion:reject:${item.id}`, label: 'Reprovar', emoji: icons.get('cross') },
  ] }] : [];
  return v2(`### ${icon('bulb')} | ${review ? 'ANÁLISE DE SUGESTÃO' : 'SUGESTÃO APROVADA'}\n${icon(item.category)} **${label(item.category)}** • Por <@${item.authorId}>\n\n${escapeMarkdown(item.body)}${review ? `\n\n${icon('clock')} **Status:** ${item.status === 'PENDING' ? 'Aguardando análise' : item.status === 'APPROVED' ? 'Aprovada' : 'Reprovada'}${item.reviewerId ? ` • <@${item.reviewerId}>` : ''}` : ''}`, rows);
}
const inFlight = new Set<string>();
let starting: Promise<void> | undefined;
export function startAltaSuggestions(client: Client) {
  return starting ??= setup(client).finally(() => { starting = undefined; });
}
async function setup(client: Client) {
  const guild = await client.guilds.fetch(ALTA_GUILD_ID);
  const publicChannel = await guild.channels.fetch(SUGGESTION_CHANNEL);
  if (!publicChannel || publicChannel.type !== ChannelType.GuildText) throw new Error('Canal público de sugestões indisponível.');
  const me = await guild.members.fetchMe();
  if (!publicChannel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages])) throw new Error('Sugestões: faltam permissões para ver, enviar, ler histórico e gerenciar mensagens no canal público.');
  const roles = await guild.roles.fetch();
  if (SUGGESTION_ROLES.some(id => !roles.has(id))) throw new Error('Um cargo de análise de sugestões não existe na Alta.');
  let config = await prisma.altaSuggestionConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  const overwrites = [
    { id: guild.id, deny: [P.ViewChannel] },
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages] },
    ...SUGGESTION_ROLES.map(id => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
  ];
  let reviewChannel = config.reviewChannelId ? await guild.channels.fetch(config.reviewChannelId).catch(() => null) : null;
  if (!reviewChannel) {
    reviewChannel = await guild.channels.create({ name: 'analise-sugestoes-alta', type: ChannelType.GuildText, permissionOverwrites: overwrites,
      topic: 'Análise privada das sugestões da Alta', reason: 'Fluxo de sugestões aprovado pela gestão' });
    config = await prisma.altaSuggestionConfig.update({ where: { guildId: guild.id }, data: { reviewChannelId: reviewChannel.id } });
  } else {
    if (reviewChannel.type !== ChannelType.GuildText) throw new Error('Canal de análise inválido.');
    await reviewChannel.permissionOverwrites.set(overwrites);
  }
  // Emojis são cadastrados diretamente na Alta para evitar dependência de emojis externos.
  const existing = await guild.emojis.fetch();
  for (const key of ['alta', 'bulb', 'family', 'internal', 'ideas', 'bot', 'other', 'arrow', 'clock', 'check', 'cross']) {
    const name = key === 'alta' ? 'alta_sug_chrome_alta_v2' : `alta_sug_chrome_${key}`;
    try {
      const emoji = existing.find(item => item.name === name) ?? await guild.emojis.create({ name,
        attachment: fileURLToPath(new URL(`../../public/suggestion-emojis/${key}.png`, import.meta.url)), reason: 'Painel cromado de sugestões da Alta' });
      icons.set(key, { id: emoji.id, name });
    } catch (error) { console.error(`Emoji sugestões ${name}:`, error instanceof Error ? error.message : error); break; }
  }
  const panel = config.panelMessageId ? await publicChannel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  if (panel) await panel.edit(suggestionPanel() as any);
  else {
    const sent = await publicChannel.send(suggestionPanel());
    await prisma.altaSuggestionConfig.update({ where: { guildId: guild.id }, data: { panelMessageId: sent.id } });
  }
}

export async function selectSuggestion(interaction: StringSelectMenuInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.guildId !== ALTA_GUILD_ID || interaction.channelId !== SUGGESTION_CHANNEL) throw new Error('Use o painel original da Alta.');
  const config = await prisma.altaSuggestionConfig.findUnique({ where: { guildId: ALTA_GUILD_ID } });
  if (config?.panelMessageId !== interaction.message.id) throw new Error('Este painel está desatualizado.');
  const category = interaction.values[0];
  if (!SUGGESTION_CATEGORIES.some(item => item.key === category)) throw new Error('Categoria inválida.');
  if (await prisma.altaSuggestion.count({ where: { authorId: interaction.user.id, status: 'PENDING' } }) >= 3) throw new Error('Você já tem três sugestões em análise. Aguarde a equipe.');
  await prisma.altaSuggestionDraft.upsert({ where: { userId: interaction.user.id },
    create: { userId: interaction.user.id, category, expiresAt: new Date(Date.now() + 600_000) },
    update: { category, expiresAt: new Date(Date.now() + 600_000) } });
  await interaction.editReply(`Categoria: **${label(category)}**. Escreva a sugestão neste chat nos próximos 10 minutos. Para desistir, envie cancelar. A mensagem ficará visível brevemente até o bot encaminhá-la e removê-la.`);
}

export async function collectSuggestion(message: Message) {
  if (message.guildId !== ALTA_GUILD_ID || message.channelId !== SUGGESTION_CHANNEL || message.author.bot || message.webhookId) return false;
  const draft = await prisma.altaSuggestionDraft.findUnique({ where: { userId: message.author.id } });
  if (!draft) return false;
  if (inFlight.has(message.author.id)) return true;
  inFlight.add(message.author.id);
  try {
    if (draft.expiresAt.getTime() < Date.now() || message.content.trim().toLowerCase() === 'cancelar') {
      await prisma.altaSuggestionDraft.deleteMany({ where: { userId: message.author.id } });
      await message.reply({ content: 'Envio encerrado. Selecione uma categoria no painel para começar novamente.', allowedMentions: { parse: [] } });
      return true;
    }
    let body: string;
    try {
      if (message.attachments.size) throw new Error('Envie apenas texto, sem anexos.');
      body = suggestionText(message.content);
    } catch (error) {
      await message.reply({ content: (error as Error).message, allowedMentions: { parse: [] } }); return true;
    }
    const config = await prisma.altaSuggestionConfig.findUnique({ where: { guildId: ALTA_GUILD_ID } });
    const review = config?.reviewChannelId ? await message.guild!.channels.fetch(config.reviewChannelId) : null;
    if (!review?.isSendable()) throw new Error('Canal de análise indisponível.');
    const item = await prisma.altaSuggestion.create({ data: { authorId: message.author.id, category: draft.category, body, sourceMessageId: message.id } });
    let sent;
    try { sent = await review.send(suggestionCard(item, true)); }
    catch (error) { await prisma.altaSuggestion.delete({ where: { id: item.id } }); throw error; }
    await prisma.altaSuggestion.update({ where: { id: item.id }, data: { reviewMessageId: sent.id } });
    await prisma.altaSuggestionDraft.deleteMany({ where: { userId: message.author.id, category: draft.category, expiresAt: draft.expiresAt } });
    await message.delete().catch(error => console.error('Remover sugestão original:', error));
    await message.author.send('Sua sugestão foi encaminhada para análise da Alta. Você será avisado após a decisão.').catch(() => {});
    return true;
  } catch (error) {
    console.error('Coleta de sugestão:', error);
    await message.reply({ content: 'Não consegui confirmar o encaminhamento. Aguarde a equipe conferir antes de reenviar.', allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } finally { inFlight.delete(message.author.id); }
}

export async function reviewSuggestion(interaction: ButtonInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.guildId !== ALTA_GUILD_ID) throw new Error('Esta análise pertence à Alta.');
  const member = await interaction.guild!.members.fetch({ user: interaction.user.id, force: true });
  if (!canReviewSuggestion(member.roles.cache.keys())) throw new Error('Somente os quatro cargos autorizados podem analisar sugestões.');
  const config = await prisma.altaSuggestionConfig.findUnique({ where: { guildId: ALTA_GUILD_ID } });
  if (interaction.channelId !== config?.reviewChannelId) throw new Error('Use a ficha no canal de análise.');
  const [, , action, id] = interaction.customId.split(':');
  if (!['approve', 'reject'].includes(action)) throw new Error('Ação inválida.');
  const record = await prisma.altaSuggestion.findUnique({ where: { id } });
  if (!record || record.reviewMessageId !== interaction.message.id) throw new Error('Ficha inválida.');
  const claimed = await prisma.altaSuggestion.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REVIEWING', reviewerId: member.id } });
  if (!claimed.count) throw new Error('Esta sugestão já foi analisada ou está sendo processada.');
  const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
  let publicMessageId: string | null = null;
  if (action === 'approve') {
    try {
      const channel = await interaction.guild!.channels.fetch(SUGGESTION_CHANNEL);
      if (!channel?.isSendable()) throw new Error('Canal de publicação indisponível.');
      const sent = await channel.send(suggestionCard({ ...record, status, reviewerId: member.id }));
      publicMessageId = sent.id;
    } catch (error) {
      // Uma falha de rede pode ocorrer após o Discord aceitar o envio. Não reenviar automaticamente.
      await prisma.altaSuggestion.update({ where: { id }, data: { status: 'DELIVERY_ERROR' } });
      throw new Error('Falha ao confirmar publicação. A equipe deve conferir o canal antes de reenviar; a ficha foi preservada.');
    }
  }
  const updated = await prisma.altaSuggestion.update({ where: { id }, data: { status, reviewerId: member.id, publicMessageId } });
  await interaction.message.edit(suggestionCard(updated, true) as any).catch(error => console.error('Atualizar análise:', error));
  const author = await interaction.client.users.fetch(record.authorId).catch(() => null);
  await author?.send(`Sua sugestão de **${label(record.category)}** foi ${status === 'APPROVED' ? `aprovada e publicada em <#${SUGGESTION_CHANNEL}>` : 'reprovada pela equipe da Alta'}.`).catch(() => {});
  await interaction.editReply(status === 'APPROVED' ? 'Sugestão aprovada e publicada.' : 'Sugestão reprovada. Não foi publicada.');
}
