import {
  ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits,
  type ButtonInteraction, type Client, type Guild, type GuildMember, type Message,
  type MessageCreateOptions, type MessageEditOptions, type StringSelectMenuInteraction,
} from 'discord.js';
import type { VortexSupportConfig, VortexSupportTicket } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  VORTEX_GUILD_ID, VORTEX_SUPPORT_CATEGORIES, VORTEX_SUPPORT_SELECT_ID,
  type VortexSupportCategory, canCloseVortexTicket, isVortexSupportSetupCommand, parseVortexSupportButton, vortexCategory,
  vortexClosedMessage, vortexStaffMessage, vortexSupportPanelMessage, vortexTicketMessage,
} from './supportMessages.js';

const ACTIVE_STATUSES = ['OPEN', 'CLAIMED'];
const NOTIFY_COOLDOWN_MS = 60_000;
const DELETE_DELAY_MS = 10_000;
let setupRunning = false;

const fetchText = async (guild: Guild, id: string | null) => {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
};

const isStaff = (member: GuildMember, config: VortexSupportConfig) =>
  member.permissions.has(PermissionFlagsBits.Administrator) || Boolean(config.supportRoleId && member.roles.cache.has(config.supportRoleId));

async function editTicketMessages(guild: Guild, config: VortexSupportConfig, ticket: VortexSupportTicket) {
  const ticketChannel = await fetchText(guild, ticket.channelId);
  if (ticketChannel && ticket.ticketMessageId) {
    const message = await ticketChannel.messages.fetch(ticket.ticketMessageId).catch(() => null);
    await message?.edit(vortexTicketMessage(ticket) as MessageEditOptions).catch(() => null);
  }
  const staffChannel = await fetchText(guild, config.staffChannelId);
  if (staffChannel && ticket.staffMessageId) {
    const message = await staffChannel.messages.fetch(ticket.staffMessageId).catch(() => null);
    await message?.edit(vortexStaffMessage(ticket) as MessageEditOptions).catch(() => null);
  }
}

async function publishPanel(guild: Guild, config: VortexSupportConfig) {
  const channel = await fetchText(guild, config.panelChannelId);
  if (!channel) throw new Error('O canal do painel de suporte não está disponível.');
  let message = config.panelMessageId ? await channel.messages.fetch(config.panelMessageId).catch(() => null) : null;
  if (message) await message.edit(vortexSupportPanelMessage() as MessageEditOptions);
  else message = await channel.send(vortexSupportPanelMessage() as MessageCreateOptions);
  if (message.id !== config.panelMessageId) {
    await prisma.vortexSupportConfig.update({ where: { guildId: guild.id }, data: { panelMessageId: message.id } });
  }
}

export async function setupVortexSupport(message: Message) {
  if (!message.inGuild() || message.guildId !== VORTEX_GUILD_ID) throw new Error('Este comando funciona somente no servidor Vortex.');
  const guild = message.guild;
  const member = await guild.members.fetch({ user: message.author.id, force: true });
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Somente administradores podem criar a central de suporte.');
  const me = await guild.members.fetchMe();
  const missing = me.permissions.missing([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]);
  if (missing.length) throw new Error(`O bot precisa destas permissões: ${missing.join(', ')}.`);

  let config = await prisma.vortexSupportConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  const created: string[] = [];
  const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  let role = config.supportRoleId ? roles.get(config.supportRoleId) : null;
  if (!role || role.managed || !role.editable) role = roles.find(candidate => !candidate.managed && candidate.editable && candidate.name.toLocaleLowerCase('pt-BR') === 'suporte') ?? null;
  if (!role) {
    role = await guild.roles.create({ name: 'Suporte', permissions: [], reason: `Estrutura criada por ${message.author.tag}` });
    created.push('cargo Suporte');
  }
  if (!role.editable) throw new Error('O cargo Suporte precisa ficar abaixo do cargo do bot.');

  const everyone = guild.roles.everyone.id;
  const botId = me.id;
  const publicPermissions = [
    { id: everyone, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: role.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: botId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  const privatePermissions = [
    { id: everyone, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: role.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    { id: botId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  let publicCategory = config.publicCategoryId ? channels.get(config.publicCategoryId) : null;
  publicCategory ??= channels.find(channel => channel?.type === ChannelType.GuildCategory && channel.name === 'SUPORTE • VORTEX') ?? null;
  if (publicCategory?.type !== ChannelType.GuildCategory) {
    publicCategory = await guild.channels.create({ name: 'SUPORTE • VORTEX', type: ChannelType.GuildCategory, permissionOverwrites: publicPermissions, reason: 'Central de suporte Vortex' });
    created.push('categoria SUPORTE • VORTEX');
  } else await publicCategory.permissionOverwrites.set(publicPermissions, 'Sincronização da central de suporte Vortex');

  let ticketCategory = config.ticketCategoryId ? channels.get(config.ticketCategoryId) : null;
  ticketCategory ??= channels.find(channel => channel?.type === ChannelType.GuildCategory && channel.name === 'TICKETS • VORTEX') ?? null;
  if (ticketCategory?.type !== ChannelType.GuildCategory) {
    ticketCategory = await guild.channels.create({ name: 'TICKETS • VORTEX', type: ChannelType.GuildCategory, permissionOverwrites: privatePermissions, reason: 'Tickets privados Vortex' });
    created.push('categoria TICKETS • VORTEX');
  } else await ticketCategory.permissionOverwrites.set(privatePermissions, 'Sincronização dos tickets Vortex');

  let panel = await fetchText(guild, config.panelChannelId);
  panel ??= channels.find(channel => channel?.type === ChannelType.GuildText && channel.name === 'abrir-ticket' && channel.parentId === publicCategory.id) as Awaited<ReturnType<typeof fetchText>>;
  if (!panel) {
    panel = await guild.channels.create({ name: 'abrir-ticket', type: ChannelType.GuildText, parent: publicCategory.id, permissionOverwrites: publicPermissions, topic: 'Abra um atendimento privado com a equipe Vortex.', reason: 'Central de suporte Vortex' });
    created.push('canal abrir-ticket');
  } else {
    if (panel.parentId !== publicCategory.id) await panel.setParent(publicCategory.id, { lockPermissions: false, reason: 'Central de suporte Vortex' });
    await panel.permissionOverwrites.set(publicPermissions, 'Sincronização da central de suporte Vortex');
  }

  let staff = await fetchText(guild, config.staffChannelId);
  staff ??= channels.find(channel => channel?.type === ChannelType.GuildText && channel.name === 'fila-suporte' && channel.parentId === publicCategory.id) as Awaited<ReturnType<typeof fetchText>>;
  if (!staff) {
    staff = await guild.channels.create({ name: 'fila-suporte', type: ChannelType.GuildText, parent: publicCategory.id, permissionOverwrites: privatePermissions, topic: 'Fila privada da equipe de suporte Vortex.', reason: 'Central de suporte Vortex' });
    created.push('canal fila-suporte');
  } else {
    if (staff.parentId !== publicCategory.id) await staff.setParent(publicCategory.id, { lockPermissions: false, reason: 'Central de suporte Vortex' });
    await staff.permissionOverwrites.set(privatePermissions, 'Sincronização da equipe de suporte Vortex');
  }

  config = await prisma.vortexSupportConfig.update({ where: { guildId: guild.id }, data: {
    supportRoleId: role.id, publicCategoryId: publicCategory.id, ticketCategoryId: ticketCategory.id,
    panelChannelId: panel.id, staffChannelId: staff.id,
  } });
  await publishPanel(guild, config);
  const openTickets = await prisma.vortexSupportTicket.findMany({ where: { guildId: guild.id, status: { in: ACTIVE_STATUSES } } });
  for (const ticket of openTickets) {
    const channel = await fetchText(guild, ticket.channelId);
    if (channel) await channel.permissionOverwrites.edit(role.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true }, { reason: 'Cargo de suporte Vortex' });
  }
  return { config, roleId: role.id, created };
}

export async function handleVortexSupportCommand(message: Message) {
  if (!isVortexSupportSetupCommand(message.content)) return false;
  if (setupRunning) {
    await message.reply({ content: 'A central de suporte já está sendo sincronizada. Aguarde alguns segundos.', allowedMentions: { repliedUser: false } });
    return true;
  }
  setupRunning = true;
  try {
    const result = await setupVortexSupport(message);
    await message.reply({ content: result.created.length
      ? `Central de suporte pronta. Criado: ${result.created.join(', ')}. Atribua <@&${result.roleId}> à equipe autorizada.`
      : `A central já estava pronta e foi sincronizada. Cargo da equipe: <@&${result.roleId}>.`, allowedMentions: { roles: [] } });
  } catch (error) {
    await message.reply({ content: error instanceof Error ? error.message : 'Não foi possível criar a central de suporte.', allowedMentions: { repliedUser: false } });
  } finally { setupRunning = false; }
  return true;
}

async function createTicket(interaction: StringSelectMenuInteraction<'cached'>, category: VortexSupportCategory) {
  const config = await prisma.vortexSupportConfig.findUnique({ where: { guildId: VORTEX_GUILD_ID } });
  if (!config?.supportRoleId || !config.ticketCategoryId || !config.staffChannelId) throw new Error('Execute !criarsuporte antes de abrir atendimentos.');
  const existing = await prisma.vortexSupportTicket.findFirst({ where: { guildId: VORTEX_GUILD_ID, userId: interaction.user.id, status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: 'desc' } });
  if (existing) {
    const channel = await fetchText(interaction.guild, existing.channelId);
    if (channel) {
      await interaction.reply({ content: `Você já possui um atendimento ativo em <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await prisma.vortexSupportTicket.update({ where: { id: existing.id }, data: { status: 'CLOSED', activeKey: null, closedAt: new Date(), deleteAt: null } });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticket = await prisma.vortexSupportTicket.create({ data: { guildId: VORTEX_GUILD_ID, userId: interaction.user.id, category, activeKey: `${VORTEX_GUILD_ID}:${interaction.user.id}` } });
  const me = await interaction.guild.members.fetchMe();
  const safeName = interaction.user.username.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 35) || 'membro';
  let channel;
  try {
    channel = await interaction.guild.channels.create({ name: `${category}-${safeName}-${interaction.user.id.slice(-4)}`, type: ChannelType.GuildText, parent: config.ticketCategoryId, topic: `Vortex Support • ${ticket.id} • ${interaction.user.id}`, permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      { id: config.supportRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      { id: me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
    ], reason: `Ticket Vortex aberto por ${interaction.user.tag}` });
    let updated = await prisma.vortexSupportTicket.update({ where: { id: ticket.id }, data: { channelId: channel.id } });
    const ticketMessage = await channel.send({ ...vortexTicketMessage(updated), allowedMentions: { users: [updated.userId] } } as MessageCreateOptions);
    updated = await prisma.vortexSupportTicket.update({ where: { id: ticket.id }, data: { ticketMessageId: ticketMessage.id } });
    const staff = await fetchText(interaction.guild, config.staffChannelId);
    if (!staff) throw new Error('Canal da equipe indisponível.');
    const staffMessage = await staff.send({ ...vortexStaffMessage(updated, config.supportRoleId), allowedMentions: { roles: [config.supportRoleId], users: [updated.userId] } } as MessageCreateOptions);
    await prisma.vortexSupportTicket.update({ where: { id: ticket.id }, data: { staffMessageId: staffMessage.id } });
    await interaction.editReply(`Seu ticket de **${VORTEX_SUPPORT_CATEGORIES[category].label}** foi criado em <#${channel.id}>. A equipe foi comunicada.`);
  } catch (error) {
    if (channel) await channel.delete('Falha ao concluir ticket Vortex').catch(() => null);
    await prisma.vortexSupportTicket.delete({ where: { id: ticket.id } }).catch(() => null);
    throw error;
  }
}

export async function handleVortexSupportSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.inCachedGuild() || interaction.guildId !== VORTEX_GUILD_ID || interaction.customId !== VORTEX_SUPPORT_SELECT_ID) return false;
  const category = interaction.values[0];
  if (!vortexCategory(category)) throw new Error('Tipo de atendimento inválido.');
  await createTicket(interaction, category as VortexSupportCategory);
  return true;
}

export async function handleVortexSupportButton(interaction: ButtonInteraction) {
  const parsed = parseVortexSupportButton(interaction.customId);
  if (!parsed || !interaction.inCachedGuild() || interaction.guildId !== VORTEX_GUILD_ID) return false;
  const config = await prisma.vortexSupportConfig.findUnique({ where: { guildId: VORTEX_GUILD_ID } });
  if (!config?.supportRoleId) throw new Error('Central de suporte não configurada.');
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  if (!isStaff(member, config)) throw new Error('Somente a equipe de suporte pode usar este controle.');
  const ticket = await prisma.vortexSupportTicket.findFirst({ where: { id: parsed.ticketId, guildId: VORTEX_GUILD_ID } });
  if (!ticket || ticket.channelId !== interaction.channelId && ticket.staffMessageId !== interaction.message.id) throw new Error('Este controle não pertence ao ticket informado.');

  if (parsed.action === 'claim') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const changed = await prisma.vortexSupportTicket.updateMany({ where: { id: ticket.id, status: 'OPEN', claimedBy: null }, data: { status: 'CLAIMED', claimedBy: member.id, claimedAt: new Date() } });
    if (!changed.count) throw new Error('Outro atendente assumiu este ticket primeiro.');
    const updated = await prisma.vortexSupportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    await editTicketMessages(interaction.guild, config, updated);
    const channel = await fetchText(interaction.guild, updated.channelId);
    await channel?.send({ content: `<@${updated.userId}>, seu ticket foi assumido por <@${member.id}>.`, allowedMentions: { users: [updated.userId, member.id] } });
    const user = await interaction.client.users.fetch(updated.userId).catch(() => null);
    await user?.send(`Seu ticket no **${interaction.guild.name}** foi assumido por **${member.displayName}**.${channel ? ` Acesse: https://discord.com/channels/${interaction.guild.id}/${channel.id}` : ''}`).catch(() => null);
    await interaction.editReply(`Atendimento assumido. <@${updated.userId}> foi marcado no ticket.`);
    return true;
  }

  if (parsed.action === 'notify') {
    if (!ACTIVE_STATUSES.includes(ticket.status)) throw new Error('Este ticket já foi encerrado.');
    const elapsed = ticket.notifiedAt ? Date.now() - ticket.notifiedAt.getTime() : NOTIFY_COOLDOWN_MS;
    if (elapsed < NOTIFY_COOLDOWN_MS) throw new Error(`Aguarde ${Math.ceil((NOTIFY_COOLDOWN_MS - elapsed) / 1000)} segundo(s) para notificar novamente.`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    const sent = await user?.send(`Seu ticket no **${interaction.guild.name}** recebeu uma atualização da equipe. Acesse: https://discord.com/channels/${interaction.guild.id}/${ticket.channelId}`).then(() => true).catch(() => false);
    if (!sent) throw new Error('Não consegui enviar a mensagem privada; o membro pode estar com as DMs fechadas.');
    await prisma.vortexSupportTicket.update({ where: { id: ticket.id }, data: { notifiedAt: new Date() } });
    await interaction.editReply('Membro notificado no privado.');
    return true;
  }

  const authorization = { id: member.id, administrator: member.permissions.has(PermissionFlagsBits.Administrator), support: member.roles.cache.has(config.supportRoleId) };
  if (!canCloseVortexTicket(ticket, authorization)) throw new Error('Somente quem assumiu este atendimento pode fechar o ticket.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const where = authorization.administrator ? { id: ticket.id, status: 'CLAIMED' } : { id: ticket.id, status: 'CLAIMED', claimedBy: member.id };
  const changed = await prisma.vortexSupportTicket.updateMany({ where, data: { status: 'CLOSED', activeKey: null, closedBy: member.id, closedAt: new Date(), deleteAt: new Date(Date.now() + DELETE_DELAY_MS) } });
  if (!changed.count) throw new Error('Este ticket já foi encerrado ou alterado.');
  const updated = await prisma.vortexSupportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  await editTicketMessages(interaction.guild, config, updated);
  const channel = await fetchText(interaction.guild, updated.channelId);
  await channel?.send({ ...vortexClosedMessage(updated), allowedMentions: { users: [updated.userId] } } as MessageCreateOptions);
  const user = await interaction.client.users.fetch(updated.userId).catch(() => null);
  await user?.send(`Seu ticket no **${interaction.guild.name}** foi encerrado por **${member.displayName}**.`).catch(() => null);
  await interaction.editReply('Ticket encerrado. O canal será excluído automaticamente em alguns segundos.');
  return true;
}

export async function sweepVortexSupportTickets(client: Client) {
  const due = await prisma.vortexSupportTicket.findMany({ where: { guildId: VORTEX_GUILD_ID, status: 'CLOSED', deleteAt: { lte: new Date() } }, take: 25 });
  if (!due.length) return;
  const guild = await client.guilds.fetch(VORTEX_GUILD_ID).catch(() => null);
  if (!guild) return;
  for (const ticket of due) {
    const channel = await guild.channels.fetch(ticket.channelId || '').catch(() => null);
    if (channel && 'delete' in channel) await channel.delete(`Ticket ${ticket.id} encerrado`).catch(() => null);
    await prisma.vortexSupportTicket.update({ where: { id: ticket.id }, data: { status: 'DELETED', deleteAt: null } });
  }
}
