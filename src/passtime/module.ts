import {
  ChannelType, MessageFlags, ModalBuilder, OverwriteType, PermissionFlagsBits, TextInputBuilder,
  TextInputStyle, ActionRowBuilder,
  type ButtonInteraction, type CategoryChannel, type Client, type Guild, type GuildMember, type Message,
  type MessageCreateOptions, type MessageEditOptions, type ModalSubmitInteraction,
  type OverwriteResolvable, type Role, type TextChannel,
} from 'discord.js';
import type { PasstimeBank, PasstimeConfig } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  PASSTIME_ART_FALLBACKS, PASSTIME_COMMANDS, PASSTIME_GUILD_ID, PASSTIME_IDS, PASSTIME_OWNER_ID,
  isPasstimeCommand, isPasstimeManager, normalizeDay, passtimeCommandName, safeChannelName, saoPauloClock, validTime,
} from './config.js';
import {
  announcementMessage, bankRequestMessage, bankWelcomeMessage, editorLauncherMessage,
  identificationMessage, passtimeV2, pointsMessage, scheduleMessage, teamMessage, verificationMessage,
  type PasstimePresentation,
} from './messages.js';

const ACTIVE_BANK = 'ACTIVE';
const ARCHIVED_BANK = 'ARCHIVED';
const commandError = (error: unknown) => error instanceof Error ? error.message.slice(0, 1800) : 'Ação não concluída.';

const semanticName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');

const customEmoji = (animated: boolean, name: string, id: string) => `<${animated ? 'a' : ''}:${name}:${id}>`;

async function passtimePresentation(guild: Guild, config: PasstimeConfig): Promise<PasstimePresentation> {
  const emojis = await guild.emojis.fetch().catch(() => guild.emojis.cache);
  const values = [...emojis.values()];
  const minion = values.find(item => /minion|passtime/i.test(item.name ?? ''));
  const yellow = values.find(item => /vrz.?yellow13|yellow13|amarelo/i.test(item.name ?? ''));
  return {
    minionEmoji: minion?.name ? customEmoji(Boolean(minion.animated), minion.name, minion.id) : undefined,
    yellowEmoji: yellow?.name ? customEmoji(Boolean(yellow.animated), yellow.name, yellow.id) : undefined,
    requestBannerUrl: config.requestBannerUrl,
    identificationBannerUrl: config.identificationBannerUrl,
    pointsBannerUrl: config.pointsBannerUrl,
    teamBannerUrl: config.teamBannerUrl,
  };
}

function nestedMediaUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = nestedMediaUrl(item);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const media = record.media;
  if (media && typeof media === 'object' && typeof (media as Record<string, unknown>).url === 'string') {
    return (media as Record<string, string>).url;
  }
  for (const item of Object.values(record)) {
    const found = nestedMediaUrl(item);
    if (found) return found;
  }
  return null;
}

async function discoverChannelArt(channel: TextChannel, configured: string | null | undefined, fallback: string | null) {
  if (configured) return configured;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return fallback;
  for (const message of messages.values()) {
    const attachment = message.attachments.find(item => item.contentType?.startsWith('image/'));
    if (attachment) return attachment.url;
    const embedImage = message.embeds.find(item => item.image?.url)?.image?.url;
    if (embedImage) return embedImage;
    const componentUrl = nestedMediaUrl(message.components.map(component => component.toJSON()));
    if (componentUrl) return componentUrl;
  }
  return fallback;
}

const isController = (member: GuildMember | null | undefined) =>
  Boolean(member && isPasstimeManager(member.id)) || Boolean(member?.permissions.has(PermissionFlagsBits.Administrator)) || Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild));

const requireController = (member: GuildMember | null | undefined) => {
  if (!isController(member)) throw new Error('Somente a gestão do servidor pode usar este comando.');
};

const fetchText = async (guild: Guild, id: string | null | undefined) => {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
};

const fetchCategory = async (guild: Guild, id: string | null | undefined) => {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildCategory ? channel : null;
};

async function ensureRole(guild: Guild, configuredId: string | null | undefined, name: string, created: string[]) {
  const roles = await guild.roles.fetch();
  let role = configuredId ? roles.get(configuredId) : null;
  role ??= roles.find(candidate => !candidate.managed && candidate.name === name) ?? null;
  if (!role) {
    role = await guild.roles.create({ name, permissions: [], reason: 'Estrutura Passtime' });
    created.push(`cargo ${name}`);
  }
  if (role.managed || !role.editable) throw new Error(`O cargo **${name}** precisa ficar abaixo do cargo do angel.`);
  return role;
}

async function ensureCategory(
  guild: Guild,
  configuredId: string | null | undefined,
  name: string,
  overwrites: OverwriteResolvable[],
  created: string[],
) {
  let category = await fetchCategory(guild, configuredId);
  const semantic = semanticName(name);
  category ??= guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && semanticName(channel.name) === semantic) as CategoryChannel | undefined ?? null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Estrutura Passtime' });
    created.push(`categoria ${name}`);
  } else await category.permissionOverwrites.set(overwrites, 'Sincronização Passtime');
  return category;
}

async function ensureTextChannel(
  guild: Guild,
  configuredId: string | null | undefined,
  name: string,
  parentId: string,
  overwrites: OverwriteResolvable[],
  topic: string,
  created: string[],
) {
  let channel = await fetchText(guild, configuredId);
  const semantic = semanticName(name);
  channel ??= guild.channels.cache.find(item => item.type === ChannelType.GuildText && semanticName(item.name) === semantic) as TextChannel | undefined ?? null;
  if (!channel) {
    channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: overwrites, topic, reason: 'Estrutura Passtime' });
    created.push(`canal ${name}`);
  } else {
    await channel.permissionOverwrites.set(overwrites, 'Sincronização Passtime');
    if (channel.topic !== topic) await channel.setTopic(topic, 'Estrutura Passtime');
  }
  return channel;
}

async function publishOrUpdate(channel: TextChannel, messageId: string | null | undefined, payload: MessageCreateOptions) {
  const existing = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (existing) {
    await existing.edit(payload as MessageEditOptions);
    return existing.id;
  }
  return (await channel.send(payload)).id;
}

async function getConfig() {
  return prisma.passtimeConfig.findUnique({ where: { guildId: PASSTIME_GUILD_ID } });
}

async function requireConfig() {
  const config = await getConfig();
  if (!config) throw new Error('Execute `!passtime` primeiro para criar a estrutura.');
  return config;
}

async function logPasstime(guild: Guild, content: string) {
  const config = await getConfig();
  const channel = await fetchText(guild, config?.logsChannelId);
  await channel?.send(passtimeV2(`## Registro Passtime\n${content}`, { banner: false, footer: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) })).catch(() => null);
}

export async function setupPasstime(message: Message<true>) {
  if (message.guildId !== PASSTIME_GUILD_ID) throw new Error('Este comando funciona somente no servidor Passtime.');
  if (!isPasstimeManager(message.author.id) && message.guild.ownerId !== message.author.id) {
    throw new Error('Somente o responsável autorizado pode montar a estrutura Passtime.');
  }
  const guild = message.guild;
  const me = await guild.members.fetchMe();
  const missing = me.permissions.missing([
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames,
  ]);
  if (missing.length) throw new Error(`Permissões ausentes no angel: ${missing.join(', ')}.`);

  let config = await prisma.passtimeConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ownerId: PASSTIME_OWNER_ID },
    update: { ownerId: PASSTIME_OWNER_ID },
  });
  const created: string[] = [];
  const memberRole = await ensureRole(guild, config.memberRoleId, 'Passtime • Membro', created);
  const decoratorRole = await ensureRole(guild, config.decoratorRoleId, 'Minion • Decorador', created);
  const correctorRole = await ensureRole(guild, config.correctorRoleId, 'Minion • Corretor', created);
  const managementRole = await ensureRole(guild, config.managementRoleId, 'Passtime • Gestão', created);

  const everyone = guild.roles.everyone.id;
  const bot = me.id;
  const memberOnly: OverwriteResolvable[] = [
    { id: everyone, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: managementRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: bot, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  const bankPrivate: OverwriteResolvable[] = [
    { id: everyone, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: correctorRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: decoratorRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: managementRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
    { id: bot, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  const logsPrivate: OverwriteResolvable[] = [
    { id: everyone, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: managementRole.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: bot, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
  ];

  const startCategory = await ensureCategory(guild, undefined, 'PASSTIME • INÍCIO', memberOnly, created);
  const bankCategory = await ensureCategory(guild, config.bankCategoryId, 'BANCAS • PASSTIME', bankPrivate, created);
  const archiveCategory = await ensureCategory(guild, config.archiveCategoryId, 'BANCAS • ARQUIVADAS', bankPrivate, created);
  const importantCategory = await ensureCategory(guild, undefined, 'IMPORTANTE • PASSTIME', memberOnly, created);
  const managementCategory = await ensureCategory(guild, undefined, 'GESTÃO • PASSTIME', logsPrivate, created);

  const verificationOverwrites: OverwriteResolvable[] = [
    { id: everyone, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: bot, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
  ];
  const verification = await ensureTextChannel(guild, config.verificationChannelId, 'verificação', startCategory.id, verificationOverwrites, 'Receba o cargo de membro da equipe Passtime.', created);
  const request = await ensureTextChannel(guild, config.requestChannelId, 'solicitar-banca', startCategory.id, memberOnly, 'Abra sua banca individual.', created);
  const identification = await ensureTextChannel(guild, config.identificationChannelId, 'identificação', startCategory.id, memberOnly, 'Ficha e regras de identificação das matérias.', created);
  const schedule = await ensureTextChannel(guild, config.scheduleChannelId, 'cronograma', startCategory.id, memberOnly, 'Cronograma oficial da equipe Passtime.', created);
  const points = await ensureTextChannel(guild, config.pointsChannelId, 'pontuação', importantCategory.id, memberOnly, 'Tabela oficial de pontuação.', created);
  const team = await ensureTextChannel(guild, config.teamChannelId, 'equipe', importantCategory.id, memberOnly, 'Hierarquia da equipe Passtime.', created);
  const logs = await ensureTextChannel(guild, config.logsChannelId, 'logs-passtime', managementCategory.id, logsPrivate, 'Ações administrativas do módulo Passtime.', created);

  config = await prisma.passtimeConfig.update({ where: { guildId: guild.id }, data: {
    memberRoleId: memberRole.id, decoratorRoleId: decoratorRole.id, correctorRoleId: correctorRole.id,
    managementRoleId: managementRole.id, bankCategoryId: bankCategory.id, archiveCategoryId: archiveCategory.id,
    verificationChannelId: verification.id, requestChannelId: request.id, identificationChannelId: identification.id,
    scheduleChannelId: schedule.id, pointsChannelId: points.id, teamChannelId: team.id, logsChannelId: logs.id,
  } });
  const [requestBannerUrl, identificationBannerUrl, pointsBannerUrl, teamBannerUrl] = await Promise.all([
    discoverChannelArt(request, config.requestBannerUrl, PASSTIME_ART_FALLBACKS.request),
    discoverChannelArt(identification, config.identificationBannerUrl, PASSTIME_ART_FALLBACKS.identification),
    discoverChannelArt(points, config.pointsBannerUrl, PASSTIME_ART_FALLBACKS.points),
    discoverChannelArt(team, config.teamBannerUrl, PASSTIME_ART_FALLBACKS.team),
  ]);
  config = await prisma.passtimeConfig.update({ where: { guildId: guild.id }, data: {
    requestBannerUrl, identificationBannerUrl, pointsBannerUrl, teamBannerUrl,
  } });
  const presentation = await passtimePresentation(guild, config);
  const entries = await prisma.passtimeScheduleEntry.findMany({ where: { guildId: guild.id }, orderBy: [{ day: 'asc' }, { time: 'asc' }] });
  const [verificationMessageId, requestMessageId, identificationMessageId, pointsMessageId, teamMessageId, scheduleMessageId] = await Promise.all([
    publishOrUpdate(verification, config.verificationMessageId, verificationMessage()),
    publishOrUpdate(request, config.requestMessageId, bankRequestMessage(presentation)),
    publishOrUpdate(identification, config.identificationMessageId, identificationMessage(presentation)),
    publishOrUpdate(points, config.pointsMessageId, pointsMessage(presentation)),
    publishOrUpdate(team, config.teamMessageId, teamMessage(config, presentation)),
    publishOrUpdate(schedule, config.scheduleMessageId, scheduleMessage(entries)),
  ]);
  config = await prisma.passtimeConfig.update({ where: { guildId: guild.id }, data: {
    verificationMessageId, requestMessageId, identificationMessageId, pointsMessageId, teamMessageId, scheduleMessageId,
  } });
  await logPasstime(guild, `Estrutura sincronizada por <@${message.author.id}>. ${created.length ? `Criado: ${created.join(', ')}.` : 'Nenhum item duplicado.'}`);
  return { config, created };
}

async function currentText(message: Message<true>) {
  if (message.channel.type !== ChannelType.GuildText) throw new Error('Use este comando em um canal de texto comum.');
  return message.channel;
}

async function refreshSchedule(guild: Guild, config?: PasstimeConfig | null, fallback?: TextChannel) {
  config ??= await requireConfig();
  const channel = fallback ?? await fetchText(guild, config.scheduleChannelId);
  if (!channel) throw new Error('Canal do cronograma não está disponível.');
  const entries = await prisma.passtimeScheduleEntry.findMany({ where: { guildId: guild.id } });
  const id = await publishOrUpdate(channel, channel.id === config.scheduleChannelId ? config.scheduleMessageId : null, scheduleMessage(entries));
  await prisma.passtimeConfig.update({ where: { guildId: guild.id }, data: { scheduleChannelId: channel.id, scheduleMessageId: id } });
  return id;
}

async function refreshTeam(guild: Guild, config?: PasstimeConfig | null, fallback?: TextChannel) {
  config ??= await requireConfig();
  const channel = fallback ?? await fetchText(guild, config.teamChannelId);
  if (!channel) throw new Error('Canal da equipe não está disponível.');
  const id = await publishOrUpdate(channel, channel.id === config.teamChannelId ? config.teamMessageId : null, teamMessage(config, await passtimePresentation(guild, config)));
  await prisma.passtimeConfig.update({ where: { guildId: guild.id }, data: { teamChannelId: channel.id, teamMessageId: id } });
  return id;
}

async function resolveBank(message: Message<true>, raw?: string) {
  let bank = await prisma.passtimeBank.findFirst({ where: { guildId: message.guild.id, channelId: message.channelId } });
  if (bank) return bank;
  const userId = message.mentions.users.first()?.id ?? raw?.match(/^<@!?(\d{17,20})>$/)?.[1] ?? raw?.match(/^(\d{17,20})$/)?.[1];
  if (userId) bank = await prisma.passtimeBank.findUnique({ where: { guildId_userId: { guildId: message.guild.id, userId } } });
  if (!bank) throw new Error('Use o comando dentro da banca ou informe o membro/ID responsável.');
  return bank;
}

async function bankChannel(guild: Guild, bank: PasstimeBank) {
  const channel = await fetchText(guild, bank.channelId);
  if (!channel) throw new Error('O canal dessa banca não existe mais.');
  return channel;
}

async function createBank(guild: Guild, userId: string, emoji: string, name: string) {
  const config = await requireConfig();
  const category = await fetchCategory(guild, config.bankCategoryId);
  if (!category || !config.correctorRoleId || !config.decoratorRoleId || !config.managementRoleId) throw new Error('Execute `!passtime` novamente para reparar a estrutura.');
  const existing = await prisma.passtimeBank.findUnique({ where: { guildId_userId: { guildId: guild.id, userId } } });
  const existingChannel = existing ? await fetchText(guild, existing.channelId) : null;
  if (existingChannel && existing?.status !== 'DELETED') throw new Error(`Você já possui uma banca em <#${existingChannel.id}>.`);
  const me = await guild.members.fetchMe();
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
    { id: config.correctorRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: config.decoratorRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
    { id: config.managementRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
    { id: me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  const safe = safeChannelName(name);
  const channel = await guild.channels.create({
    name: `${emoji}・${safe}`.slice(0, 95), type: ChannelType.GuildText, parent: category.id,
    permissionOverwrites: overwrites, topic: `Passtime Banca • ${userId}`, reason: `Banca Passtime de ${userId}`,
  });
  const bank = await prisma.passtimeBank.upsert({
    where: { guildId_userId: { guildId: guild.id, userId } },
    create: { guildId: guild.id, userId, channelId: channel.id, name, emoji, status: ACTIVE_BANK },
    update: { channelId: channel.id, name, emoji, status: ACTIVE_BANK },
  });
  await channel.send(bankWelcomeMessage(userId, config, await passtimePresentation(guild, config)));
  await logPasstime(guild, `Banca ${channel} criada para <@${userId}>.`);
  return { bank, channel };
}

async function syncMemberRole(message: Message<true>, role?: Role | null) {
  const config = await requireConfig();
  role ??= config.memberRoleId ? await message.guild.roles.fetch(config.memberRoleId).catch(() => null) : null;
  if (!role || role.managed || !role.editable) throw new Error('Cargo de membro ausente ou acima do angel. Execute `!passtime`.');
  if (role.id !== config.memberRoleId) await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { memberRoleId: role.id } });
  const members = await message.guild.members.fetch();
  const targets = [...members.values()].filter(member => !member.user.bot && !member.roles.cache.has(role!.id));
  const progress = await message.reply({ content: `Sincronizando <@&${role.id}> para **${targets.length}** membro(s)...`, allowedMentions: { roles: [] } });
  let added = 0;
  let failed = 0;
  for (const member of targets) {
    await member.roles.add(role, 'Sincronização !membersrole').then(() => { added += 1; }).catch(() => { failed += 1; });
  }
  await progress.edit(`Sincronização concluída: **${added}** adicionados e **${failed}** falhas.`);
  await logPasstime(message.guild, `Sincronização de <@&${role.id}>: ${added} adicionados, ${failed} falhas.`);
}

const parseTargetUser = (message: Message<true>, raw?: string) =>
  message.mentions.users.first()?.id ?? raw?.match(/^<@!?(\d{17,20})>$/)?.[1] ?? raw?.match(/^(\d{17,20})$/)?.[1] ?? null;

async function handleTeamCommand(message: Message<true>, args: string[]) {
  let config = await requireConfig();
  if (!args.length) {
    await refreshTeam(message.guild, config, await currentText(message));
    await message.reply({ content: 'Painel da equipe publicado/atualizado.', allowedMentions: { repliedUser: false } });
    return;
  }
  const key = args[0].toLocaleLowerCase('pt-BR').replace(/[-_\s]/g, '');
  const fields = new Map<string, 'leaderId' | 'deputyLeaderId' | 'managerId' | 'supervisorId'>([
    ['lider', 'leaderId'], ['leader', 'leaderId'], ['sublider', 'deputyLeaderId'], ['vice', 'deputyLeaderId'],
    ['gerente', 'managerId'], ['manager', 'managerId'], ['supervisor', 'supervisorId'],
  ]);
  const field = fields.get(key);
  const userId = parseTargetUser(message, args[1]);
  if (!field || !userId) throw new Error('Use `!equipe lider|sublider|gerente|supervisor @membro`.');
  config = await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { [field]: userId } });
  await refreshTeam(message.guild, config);
  await message.reply({ content: `Hierarquia atualizada: **${args[0]}** → <@${userId}>.`, allowedMentions: { users: [] } });
  await logPasstime(message.guild, `Hierarquia **${args[0]}** definida como <@${userId}> por <@${message.author.id}>.`);
}

async function handleReminder(message: Message<true>, args: string[]) {
  if (!args.length || args[0].toLocaleLowerCase('pt-BR') === 'listar') {
    const reminders = await prisma.passtimeReminder.findMany({ where: { guildId: message.guild.id }, orderBy: { time: 'asc' } });
    const body = reminders.length
      ? reminders.map(item => `• \`${item.id}\` · **${item.time}** · <#${item.channelId}> · ${item.message}${item.enabled ? '' : ' *(pausado)*'}`).join('\n')
      : '*Nenhum lembrete cadastrado.*';
    await message.channel.send(passtimeV2(`## ⏰ Lembretes diários\n${body}`, { banner: false, footer: 'Horário de Brasília' }));
    return;
  }
  if (args[0].toLocaleLowerCase('pt-BR') === 'apagar') {
    const id = args[1];
    if (!id) throw new Error('Use `!lembrete apagar ID`.');
    const removed = await prisma.passtimeReminder.deleteMany({ where: { id, guildId: message.guild.id } });
    if (!removed.count) throw new Error('Lembrete não encontrado.');
    await message.reply({ content: 'Lembrete removido.', allowedMentions: { repliedUser: false } });
    return;
  }
  const [time, ...words] = args;
  const content = words.join(' ').trim();
  if (!validTime(time) || !content) throw new Error('Use `!lembrete HH:MM mensagem` ou `!lembrete listar`.');
  const reminder = await prisma.passtimeReminder.create({ data: {
    guildId: message.guild.id, channelId: message.channelId, time, message: content, createdBy: message.author.id,
  } });
  await message.reply({ content: `Lembrete diário criado para **${time}**. ID: \`${reminder.id}\`.`, allowedMentions: { repliedUser: false } });
  await logPasstime(message.guild, `Lembrete \`${reminder.id}\` criado para ${time} por <@${message.author.id}>.`);
}

async function runPasstimeCommand(message: Message<true>) {
  const raw = message.content.trim();
  const [rawCommand, ...args] = raw.split(/\s+/);
  const command = rawCommand.toLocaleLowerCase('pt-BR');
  if (command !== '!passtime') requireController(message.member);

  if (command === '!passtime') {
    const result = await setupPasstime(message);
    await message.reply({
      content: result.created.length ? `Estrutura Passtime pronta. Criado: ${result.created.join(', ')}.` : 'Estrutura Passtime sincronizada; nenhum canal ou cargo foi duplicado.',
      allowedMentions: { repliedUser: false },
    });
    return;
  }
  if (command === '!apelido') {
    const nickname = raw.slice(rawCommand.length).trim();
    if (nickname.length > 32) throw new Error('O apelido pode ter no máximo 32 caracteres.');
    const me = message.guild.members.me ?? await message.guild.members.fetchMe();
    await me.setNickname(nickname || null, `Comando de ${message.author.tag}`);
    await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { nickname: nickname || null } });
    await message.reply({ content: nickname ? `Apelido alterado para **${nickname}**.` : 'Apelido removido.', allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!logs') {
    const channel = message.mentions.channels.first() ?? await currentText(message);
    if (channel.type !== ChannelType.GuildText) throw new Error('Escolha um canal de texto comum.');
    await requireConfig();
    await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { logsChannelId: channel.id } });
    await message.reply({ content: `Logs configurados em <#${channel.id}>.`, allowedMentions: { parse: [] } });
    await logPasstime(message.guild, `Canal de logs definido por <@${message.author.id}>.`);
    return;
  }
  if (command === '!verificacao') {
    const config = await requireConfig();
    const channel = await currentText(message);
    const id = await publishOrUpdate(channel, channel.id === config.verificationChannelId ? config.verificationMessageId : null, verificationMessage());
    await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { verificationChannelId: channel.id, verificationMessageId: id } });
    await message.reply({ content: 'Painel de verificação publicado/atualizado.', allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!clear') {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages) && !isPasstimeManager(message.author.id)) throw new Error('Você precisa de **Gerenciar mensagens**.');
    const count = Number.parseInt(args[0] ?? '', 10);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Use `!clear 1` até `!clear 100`.');
    const channel = await currentText(message);
    const deleted = await channel.bulkDelete(Math.min(count + 1, 100), true);
    await logPasstime(message.guild, `<@${message.author.id}> apagou ${deleted.size} mensagem(ns) em <#${channel.id}>.`);
    return;
  }
  if (command === '!membersrole') {
    const selected = message.mentions.roles.first() ?? (args[0] ? await message.guild.roles.fetch(args[0]).catch(() => null) : null);
    await syncMemberRole(message, selected);
    return;
  }
  if (command === '!embed') {
    const content = raw.slice(rawCommand.length).trim();
    if (!content) await message.channel.send(editorLauncherMessage('embed', message.author.id));
    else {
      const [title, description, imageUrl, footer] = content.split('|').map(item => item.trim());
      if (!title || !description) throw new Error('Use `!embed título | descrição | URL da imagem (opcional) | rodapé (opcional)`.');
      const payload = passtimeV2(`## ${title}\n${description}`, { banner: false, footer: footer || 'Passtime • Alta' });
      if (imageUrl) ((payload.components as any[])[0].components as any[]).unshift({ type: 12, items: [{ media: { url: imageUrl } }] }, { type: 14, divider: true, spacing: 1 });
      await message.channel.send(payload);
    }
    return;
  }
  if (command === '!anuncio') {
    const content = raw.slice(rawCommand.length).trim();
    if (!content) await message.channel.send(editorLauncherMessage('announcement', message.author.id));
    else await message.channel.send(announcementMessage(content));
    return;
  }
  if (command === '!banca') {
    let config = await requireConfig();
    const channel = await currentText(message);
    const suppliedArt = message.attachments.find(item => item.contentType?.startsWith('image/'))?.url;
    const requestBannerUrl = suppliedArt ?? await discoverChannelArt(channel, config.requestBannerUrl, PASSTIME_ART_FALLBACKS.request);
    if (requestBannerUrl !== config.requestBannerUrl) {
      config = await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { requestBannerUrl } });
    }
    const id = await publishOrUpdate(channel, channel.id === config.requestChannelId ? config.requestMessageId : null, bankRequestMessage(await passtimePresentation(message.guild, config)));
    await prisma.passtimeConfig.update({ where: { guildId: message.guild.id }, data: { requestChannelId: channel.id, requestMessageId: id, requestBannerUrl } });
    await message.reply({ content: 'Painel de solicitação de banca publicado/atualizado.', allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!banca_apagar') {
    const bank = await resolveBank(message, args[0]);
    const channel = await bankChannel(message.guild, bank);
    await prisma.passtimeBank.update({ where: { id: bank.id }, data: { status: 'DELETED', channelId: null } });
    await logPasstime(message.guild, `Banca de <@${bank.userId}> apagada por <@${message.author.id}>.`);
    if (message.channelId !== channel.id) await message.reply({ content: `Banca de <@${bank.userId}> apagada.`, allowedMentions: { parse: [] } });
    await channel.delete(`Banca apagada por ${message.author.tag}`);
    return;
  }
  if (command === '!banca_arquivar' || command === '!banca_desarquivar') {
    const bank = await resolveBank(message, args[0]);
    const config = await requireConfig();
    const archive = command === '!banca_arquivar';
    const parent = await fetchCategory(message.guild, archive ? config.archiveCategoryId : config.bankCategoryId);
    if (!parent) throw new Error('Categoria de destino indisponível. Execute `!passtime`.');
    const channel = await bankChannel(message.guild, bank);
    await channel.setParent(parent.id, { lockPermissions: false, reason: `${archive ? 'Arquivada' : 'Desarquivada'} por ${message.author.tag}` });
    await channel.permissionOverwrites.edit(bank.userId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: !archive });
    await prisma.passtimeBank.update({ where: { id: bank.id }, data: { status: archive ? ARCHIVED_BANK : ACTIVE_BANK } });
    await message.reply({ content: `Banca ${archive ? 'arquivada' : 'desarquivada'}: <#${channel.id}>.`, allowedMentions: { parse: [] } });
    await logPasstime(message.guild, `Banca de <@${bank.userId}> ${archive ? 'arquivada' : 'desarquivada'} por <@${message.author.id}>.`);
    return;
  }
  if (command === '!cronograma') {
    await refreshSchedule(message.guild, await requireConfig(), await currentText(message));
    await message.reply({ content: 'Cronograma publicado/atualizado.', allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!atualizar_cronograma') {
    const [rawDay, time, ...labelParts] = args;
    const day = normalizeDay(rawDay ?? '');
    const label = labelParts.join(' ').trim();
    if (!day || !validTime(time ?? '') || !label) throw new Error('Use `!atualizar_cronograma dia HH:MM atividade`.');
    await requireConfig();
    await prisma.passtimeScheduleEntry.create({ data: { guildId: message.guild.id, day, time, label } });
    await refreshSchedule(message.guild);
    await message.reply({ content: `Horário adicionado: **${day} ${time}** — ${label}.`, allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!limpar_cronograma') {
    await requireConfig();
    const removed = await prisma.passtimeScheduleEntry.deleteMany({ where: { guildId: message.guild.id } });
    await refreshSchedule(message.guild);
    await message.reply({ content: `Cronograma limpo: **${removed.count}** horário(s) removido(s).`, allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!editar_horarios') {
    await message.channel.send(editorLauncherMessage('schedule', message.author.id));
    return;
  }
  if (command === '!lembrete') {
    await requireConfig();
    await handleReminder(message, args);
    return;
  }
  if (command === '!equipe') {
    await handleTeamCommand(message, args);
    return;
  }
  throw new Error(`Comando não implementado: ${command}.`);
}

export async function handlePasstimeCommand(message: Message) {
  if (!isPasstimeCommand(message.content)) return false;
  if (!message.inGuild() || message.guildId !== PASSTIME_GUILD_ID) return false;
  try {
    await runPasstimeCommand(message as Message<true>);
  } catch (error) {
    await message.reply({ content: commandError(error), allowedMentions: { repliedUser: false } }).catch(() => null);
  }
  return true;
}

const modalField = (id: string, label: string, style: TextInputStyle, required = true, value?: string) => {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (value) input.setValue(value);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
};

const encodedUser = (customId: string) => customId.split(':').at(-1) ?? '';

export async function handlePasstimeButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('passtime:') || !interaction.inCachedGuild() || interaction.guildId !== PASSTIME_GUILD_ID) return false;
  if (interaction.customId === PASSTIME_IDS.verify) {
    const config = await requireConfig();
    if (!config.memberRoleId) throw new Error('Cargo de membro não configurado.');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(config.memberRoleId)) {
      await interaction.reply({ content: 'Você já está verificado.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await member.roles.add(config.memberRoleId, 'Verificação Passtime');
    await interaction.reply({ content: 'Verificação concluída. Seu acesso foi liberado!', flags: MessageFlags.Ephemeral });
    await logPasstime(interaction.guild, `<@${interaction.user.id}> concluiu a verificação.`);
    return true;
  }
  if (interaction.customId === PASSTIME_IDS.bankOpen) {
    const modal = new ModalBuilder().setCustomId(PASSTIME_IDS.bankModal).setTitle('Criar sua banca')
      .addComponents(
        modalField('emoji', 'Emoji de teclado', TextInputStyle.Short, true, '🧪'),
        modalField('name', 'Nome da banca', TextInputStyle.Short),
      );
    await interaction.showModal(modal);
    return true;
  }

  const ownerId = encodedUser(interaction.customId);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Este editor pertence a outro membro.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!isController(await interaction.guild.members.fetch(interaction.user.id))) throw new Error('Somente a gestão pode usar este editor.');
  if (interaction.customId.startsWith(`${PASSTIME_IDS.embedOpen}:`)) {
    await interaction.showModal(new ModalBuilder().setCustomId(`${PASSTIME_IDS.embedModal}:${ownerId}`).setTitle('Montar mensagem V2').addComponents(
      modalField('title', 'Título', TextInputStyle.Short),
      modalField('description', 'Descrição', TextInputStyle.Paragraph),
      modalField('image', 'URL da imagem (opcional)', TextInputStyle.Short, false),
      modalField('footer', 'Rodapé (opcional)', TextInputStyle.Short, false, 'Passtime • Alta'),
    ));
    return true;
  }
  if (interaction.customId.startsWith(`${PASSTIME_IDS.announcementOpen}:`)) {
    await interaction.showModal(new ModalBuilder().setCustomId(`${PASSTIME_IDS.announcementModal}:${ownerId}`).setTitle('Publicar anúncio').addComponents(
      modalField('title', 'Título', TextInputStyle.Short, true, 'Anúncio'),
      modalField('message', 'Mensagem', TextInputStyle.Paragraph),
    ));
    return true;
  }
  if (interaction.customId.startsWith(`${PASSTIME_IDS.scheduleOpen}:`)) {
    await interaction.showModal(new ModalBuilder().setCustomId(`${PASSTIME_IDS.scheduleModal}:${ownerId}`).setTitle('Adicionar horário').addComponents(
      modalField('day', 'Dia da semana', TextInputStyle.Short),
      modalField('time', 'Horário (HH:MM)', TextInputStyle.Short),
      modalField('label', 'Atividade', TextInputStyle.Paragraph),
    ));
    return true;
  }
  return false;
}

export async function handlePasstimeModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('passtime:') || !interaction.inCachedGuild() || interaction.guildId !== PASSTIME_GUILD_ID) return false;
  if (interaction.customId === PASSTIME_IDS.bankModal) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const emoji = interaction.fields.getTextInputValue('emoji').trim().slice(0, 16);
    const name = interaction.fields.getTextInputValue('name').trim().slice(0, 70);
    if (!emoji || !name) throw new Error('Informe o emoji e o nome da banca.');
    const result = await createBank(interaction.guild, interaction.user.id, emoji, name);
    await interaction.editReply(`Sua banca foi criada em <#${result.channel.id}>.`);
    return true;
  }
  const ownerId = encodedUser(interaction.customId);
  if (ownerId !== interaction.user.id) throw new Error('Este formulário pertence a outro membro.');
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isController(member)) throw new Error('Somente a gestão pode usar este formulário.');
  if (!interaction.channel?.isSendable()) throw new Error('Canal de destino indisponível.');

  if (interaction.customId.startsWith(`${PASSTIME_IDS.embedModal}:`)) {
    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const image = interaction.fields.getTextInputValue('image').trim();
    const footer = interaction.fields.getTextInputValue('footer').trim();
    let payload = passtimeV2(`## ${title}\n${description}`, { banner: false, footer: footer || undefined });
    if (image) ((payload.components as any[])[0].components as any[]).unshift({ type: 12, items: [{ media: { url: image } }] }, { type: 14, divider: true, spacing: 1 });
    await interaction.channel.send(payload);
    await interaction.reply({ content: 'Mensagem V2 publicada.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.customId.startsWith(`${PASSTIME_IDS.announcementModal}:`)) {
    await interaction.channel.send(announcementMessage(
      interaction.fields.getTextInputValue('message').trim(),
      interaction.fields.getTextInputValue('title').trim() || 'Anúncio',
    ));
    await interaction.reply({ content: 'Anúncio publicado.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.customId.startsWith(`${PASSTIME_IDS.scheduleModal}:`)) {
    const day = normalizeDay(interaction.fields.getTextInputValue('day'));
    const time = interaction.fields.getTextInputValue('time').trim();
    const label = interaction.fields.getTextInputValue('label').trim();
    if (!day || !validTime(time) || !label) throw new Error('Dia, horário ou atividade inválidos. Use HH:MM.');
    await requireConfig();
    await prisma.passtimeScheduleEntry.create({ data: { guildId: interaction.guild.id, day, time, label } });
    await refreshSchedule(interaction.guild);
    await interaction.reply({ content: `Horário adicionado: **${day} ${time}** — ${label}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}

async function dispatchPasstimeReminders(client: Client) {
  const guild = client.guilds.cache.get(PASSTIME_GUILD_ID);
  if (!guild) return;
  const clock = saoPauloClock();
  const reminders = await prisma.passtimeReminder.findMany({ where: {
    guildId: PASSTIME_GUILD_ID, enabled: true, time: clock.time,
    OR: [{ lastSentDate: null }, { lastSentDate: { not: clock.date } }],
  } });
  for (const reminder of reminders) {
    const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
    if (!channel?.isSendable()) continue;
    await channel.send(announcementMessage(reminder.message, `Lembrete · ${reminder.time}`));
    await prisma.passtimeReminder.update({ where: { id: reminder.id }, data: { lastSentDate: clock.date } });
  }
}

export function startPasstimeReminders(client: Client) {
  const run = () => void dispatchPasstimeReminders(client).catch(error => console.error(`passtime lembretes: ${commandError(error)}`));
  run();
  const timer = setInterval(run, 30_000);
  timer.unref();
  return timer;
}

export const PASSTIME_IMPLEMENTED_COMMANDS = [...PASSTIME_COMMANDS].sort();
