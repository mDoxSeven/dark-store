import { eventsScheduleEntries } from '../events/schedule.js';
import {
  ActionRowBuilder, ChannelType, MessageFlags, ModalBuilder, OverwriteType, PermissionFlagsBits,
  TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type CategoryChannel, type Client, type Guild, type GuildMember, type Message,
  type MessageCreateOptions, type MessageEditOptions, type ModalSubmitInteraction,
  type OverwriteResolvable, type Role, type TextChannel,
} from 'discord.js';
import type { LeadershipConfig } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  LEADERSHIP_ADMIN_ROLE_IDS, LEADERSHIP_AREAS, LEADERSHIP_DAYS, LEADERSHIP_GUILD_ID, LEADERSHIP_IDS,
  LEADERSHIP_VERIFIED_ROLE_ID, isLeadershipCommand, leadershipCommandName,
  normalizeLeadershipDay, safeLeadershipName, validLeadershipTime,
} from './config.js';
import { PASSTIME_GUILD_ID } from '../passtime/config.js';
import {
  closedReviewMessage, explanationMessage, formPanel, reviewMessage, scheduleMessage,
  verificationMessage,
} from './messages.js';

type FormKind = 'rpp' | 'justification' | 'suggestion' | 'bot' | 'evaluation' | 'report' | 'up' | 'highlight';
type ArtPair = { banner: string | null; strip: string | null };
const scheduleButtonIds = new Set<string>([LEADERSHIP_IDS.scheduleAdd, LEADERSHIP_IDS.scheduleRemove, LEADERSHIP_IDS.scheduleRefresh]);

const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 1800) : 'Ação não concluída.';
const semanticName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');

function leadershipArea(value: string) {
  const roleId = value.match(/<@&(\d{15,22})>/)?.[1] ?? value.match(/^\d{15,22}$/)?.[0];
  const semantic = semanticName(value);
  return LEADERSHIP_AREAS.find(area => area.roleId === roleId || semantic === semanticName(area.key) || semantic === semanticName(area.name)) ?? null;
}

const formSpecs: Record<FormKind, { title: string; fields: Array<[string, string, TextInputStyle, number?]> }> = {
  rpp: { title: 'Solicitar RPP', fields: [['name', 'Nome', TextInputStyle.Short], ['duration', 'Tempo em dias (7 a 30)', TextInputStyle.Short], ['reason', 'Motivo', TextInputStyle.Paragraph]] },
  justification: { title: 'Justificar ausência', fields: [['name', 'Nome', TextInputStyle.Short], ['date', 'Data', TextInputStyle.Short], ['occasion', 'Ocasião', TextInputStyle.Short], ['reason', 'Motivo', TextInputStyle.Paragraph]] },
  suggestion: { title: 'Enviar sugestão', fields: [['name', 'Nome', TextInputStyle.Short], ['suggestion', 'Sugestão construtiva', TextInputStyle.Paragraph]] },
  bot: { title: 'Solicitar função no bot', fields: [['feature', 'Nome da funcionalidade', TextInputStyle.Short], ['problem', 'Problema que ela resolve', TextInputStyle.Paragraph], ['operation', 'Como deveria funcionar', TextInputStyle.Paragraph]] },
  evaluation: { title: 'Avaliar liderança', fields: [['leadership', 'Liderança avaliada', TextInputStyle.Short], ['score', 'Nota', TextInputStyle.Short], ['comment', 'Comentário construtivo', TextInputStyle.Paragraph]] },
  report: { title: 'Enviar relatório', fields: [['area', 'Área', TextInputStyle.Short], ['period', 'Período', TextInputStyle.Short], ['activities', 'Atividades realizadas', TextInputStyle.Paragraph], ['results', 'Resultados e pendências', TextInputStyle.Paragraph]] },
  up: { title: 'Enviar upamento', fields: [['area', 'Área', TextInputStyle.Short], ['member', 'Membro promovido', TextInputStyle.Short], ['roles', 'Cargo anterior e novo cargo', TextInputStyle.Short], ['reason', 'Motivo', TextInputStyle.Paragraph]] },
  highlight: { title: 'Enviar destaque', fields: [['area', 'Área', TextInputStyle.Short], ['member', 'Membro em destaque', TextInputStyle.Short], ['result', 'Resultado alcançado', TextInputStyle.Paragraph], ['reason', 'Justificativa', TextInputStyle.Paragraph]] },
};

const fieldLabels: Record<string, string> = {
  name: 'Nome', duration: 'Tempo', reason: 'Motivo', date: 'Data', occasion: 'Ocasião',
  suggestion: 'Sugestão', feature: 'Funcionalidade', problem: 'Problema', operation: 'Funcionamento',
  leadership: 'Liderança', score: 'Nota', comment: 'Comentário', area: 'Área', period: 'Período',
  activities: 'Atividades', results: 'Resultados', member: 'Membro', roles: 'Cargos', result: 'Resultado',
};

function textField(id: string, label: string, style: TextInputStyle, maxLength = 1000) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(maxLength),
  );
}

const isAdmin = (member: GuildMember | null | undefined, guild: Guild) => Boolean(member && (
  member.id === guild.ownerId
  || member.permissions.has(PermissionFlagsBits.Administrator)
  || member.permissions.has(PermissionFlagsBits.ManageGuild)
  || LEADERSHIP_ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId))
));

function requireAdmin(member: GuildMember | null | undefined, guild: Guild) {
  if (!isAdmin(member, guild)) throw new Error('Somente a administração da Liderança pode usar esta função.');
}

async function fetchText(guild: Guild, id: string | null | undefined) {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

function matchesName(name: string, aliases: string[]) {
  const value = semanticName(name);
  return aliases.some(alias => {
    const wanted = semanticName(alias);
    return value === wanted || value.endsWith(wanted) || value.includes(wanted);
  });
}

async function findText(guild: Guild, configuredId: string | null | undefined, aliases: string[]) {
  const configured = await fetchText(guild, configuredId);
  if (configured) return configured;
  return guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && matchesName(channel.name, aliases)) as TextChannel | undefined ?? null;
}

function findCategory(guild: Guild, aliases: string[], fallbackChannel?: TextChannel | null) {
  const parent = fallbackChannel?.parent;
  if (parent?.type === ChannelType.GuildCategory) return parent;
  return guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && matchesName(channel.name, aliases)) as CategoryChannel | undefined ?? null;
}

async function ensureCategory(guild: Guild, aliases: string[], name: string, overwrites: OverwriteResolvable[], created: string[], fallbackChannel?: TextChannel | null) {
  let category = findCategory(guild, aliases, fallbackChannel);
  if (!category) {
    category = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: 'Estrutura Liderança Alta' });
    created.push(`categoria ${name}`);
  } else await category.permissionOverwrites.set(overwrites, 'Sincronização Liderança Alta');
  return category;
}

async function ensureText(
  guild: Guild, configuredId: string | null | undefined, aliases: string[], name: string,
  parent: CategoryChannel, overwrites: OverwriteResolvable[], topic: string, created: string[],
) {
  let channel = await findText(guild, configuredId, aliases);
  if (!channel) {
    channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites, topic, reason: 'Estrutura Liderança Alta' });
    created.push(`canal ${name}`);
  } else {
    await channel.permissionOverwrites.set(overwrites, 'Sincronização Liderança Alta');
    if (channel.parentId !== parent.id) await channel.setParent(parent, { lockPermissions: false, reason: 'Organização Liderança Alta' });
    if (channel.topic !== topic) await channel.setTopic(topic, 'Estrutura Liderança Alta');
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

function nestedMediaUrls(value: unknown, urls: string[] = []) {
  if (!value || typeof value !== 'object') return urls;
  if (Array.isArray(value)) {
    for (const item of value) nestedMediaUrls(item, urls);
    return urls;
  }
  const record = value as Record<string, unknown>;
  const media = record.media;
  if (media && typeof media === 'object' && typeof (media as Record<string, unknown>).url === 'string') {
    urls.push((media as Record<string, string>).url);
  }
  for (const item of Object.values(record)) nestedMediaUrls(item, urls);
  return urls;
}

async function discoverArts(channel: TextChannel, configuredBanner?: string | null, configuredStrip?: string | null): Promise<ArtPair> {
  if (configuredBanner && configuredStrip) return { banner: configuredBanner, strip: configuredStrip };
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  let banner = configuredBanner ?? null;
  let strip = configuredStrip ?? null;
  if (!messages) return { banner, strip };
  const fallback: string[] = [];
  for (const message of messages.values()) {
    for (const attachment of message.attachments.values()) {
      if (!attachment.contentType?.startsWith('image/')) continue;
      const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 0;
      if (ratio >= 4.5 && !strip) strip = attachment.url;
      else if (!banner) banner = attachment.url;
      fallback.push(attachment.url);
    }
    for (const embed of message.embeds) {
      if (!embed.image?.url) continue;
      const ratio = embed.image.width && embed.image.height ? embed.image.width / embed.image.height : 0;
      if (ratio >= 4.5 && !strip) strip = embed.image.url;
      else if (!banner) banner = embed.image.url;
      fallback.push(embed.image.url);
    }
    fallback.push(...nestedMediaUrls(message.components.map(component => component.toJSON())));
  }
  banner ??= fallback[0] ?? null;
  strip ??= fallback.find(url => url !== banner) ?? null;
  return { banner, strip };
}

async function requireConfig() {
  const config = await prisma.leadershipConfig.findUnique({ where: { guildId: LEADERSHIP_GUILD_ID } });
  if (!config) throw new Error('Execute `!criarlideranca` primeiro para configurar a Liderança.');
  return config;
}

async function combinedScheduleEntries() {
  // Atualiza também os horários já salvos com o cargo anterior da área.
  await prisma.leadershipScheduleEntry.updateMany({
    where: { guildId: LEADERSHIP_GUILD_ID, roleId: '1542876179353051228' },
    data: { roleId: LEADERSHIP_AREAS.find(area => area.key === 'mov-chat')!.roleId },
  });
  const [leadership, passtime, events] = await Promise.all([
    prisma.leadershipScheduleEntry.findMany({ where: { guildId: LEADERSHIP_GUILD_ID } }),
    prisma.passtimeScheduleEntry.findMany({ where: { guildId: PASSTIME_GUILD_ID } }),
    eventsScheduleEntries(),
  ]);
  const passtimeArea = LEADERSHIP_AREAS.find(area => area.key === 'passtime')!;
  return [
    ...leadership,
    ...passtime.map((entry, index) => ({
      id: `passtime:${entry.id}`,
      day: entry.day,
      time: entry.time,
      label: entry.label,
      roleId: passtimeArea.roleId,
      userId: entry.userId,
      position: 10_000 + index,
    })),
    ...events,
  ];
}

function accessOverwrites(guild: Guild, botId: string): OverwriteResolvable[] {
  return [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: LEADERSHIP_VERIFIED_ROLE_ID, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    ...LEADERSHIP_ADMIN_ROLE_IDS.map(id => ({ id, type: OverwriteType.Role as const, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] })),
    { id: botId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
}

function reviewOverwrites(guild: Guild, botId: string): OverwriteResolvable[] {
  return [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    ...LEADERSHIP_ADMIN_ROLE_IDS.map(id => ({ id, type: OverwriteType.Role as const, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] })),
    { id: botId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
}

async function setupLeadership(message: Message<true>) {
  const guild = message.guild;
  requireAdmin(message.member, guild);
  const me = await guild.members.fetchMe();
  const missing = me.permissions.missing([
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages,
  ]);
  if (missing.length) throw new Error(`Permissões ausentes no Angel: ${missing.join(', ')}.`);

  const roles = await guild.roles.fetch();
  const verifiedRole = roles.get(LEADERSHIP_VERIFIED_ROLE_ID);
  if (!verifiedRole) throw new Error(`O cargo de verificado ${LEADERSHIP_VERIFIED_ROLE_ID} não existe neste servidor.`);
  if (verifiedRole.managed || !verifiedRole.editable) throw new Error('O cargo liberado após a verificação precisa ficar abaixo do cargo do Angel.');
  const missingAdmins = LEADERSHIP_ADMIN_ROLE_IDS.filter(id => !roles.has(id));
  if (missingAdmins.length) throw new Error(`Cargos administrativos não encontrados: ${missingAdmins.join(', ')}.`);
  const missingAreas = LEADERSHIP_AREAS.filter(area => !roles.has(area.roleId));
  if (missingAreas.length) throw new Error(`Cargos de área não encontrados: ${missingAreas.map(area => `${area.name} (${area.roleId})`).join(', ')}.`);

  let config = await prisma.leadershipConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, verifiedRoleId: verifiedRole.id, adminRoleIdsJson: JSON.stringify(LEADERSHIP_ADMIN_ROLE_IDS) },
    update: { verifiedRoleId: verifiedRole.id, adminRoleIdsJson: JSON.stringify(LEADERSHIP_ADMIN_ROLE_IDS) },
  });
  await guild.channels.fetch();
  const existing = {
    verification: await findText(guild, config.verificationChannelId, ['verifique-se', 'verificacao']),
    explanation: await findText(guild, config.explanationChannelId, ['explicativo']),
    schedule: await findText(guild, config.scheduleChannelId, ['cronograma']),
    rpp: await findText(guild, config.rppChannelId, ['rpp']),
    reports: await findText(guild, config.reportsChannelId, ['relatorio', 'relatorios']),
  };
  const created: string[] = [];
  const memberAccess = accessOverwrites(guild, me.id);
  const staffAccess = reviewOverwrites(guild, me.id);
  const publicRead: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    ...LEADERSHIP_ADMIN_ROLE_IDS.map(id => ({ id, type: OverwriteType.Role as const, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] })),
    { id: me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
  ];

  const welcomeCategory = await ensureCategory(guild, ['bem-vindo', 'inicio'], 'LIDERANÇA • INÍCIO', publicRead, created, existing.verification);
  const infoCategory = await ensureCategory(guild, ['infos', 'informacoes'], 'LIDERANÇA • INFORMAÇÕES', memberAccess, created, existing.explanation ?? existing.schedule);
  const utilityCategory = await ensureCategory(guild, ['utilitarios', 'solicitacoes'], 'LIDERANÇA • UTILITÁRIOS', memberAccess, created, existing.rpp);
  const submissionCategory = await ensureCategory(guild, ['geral', 'envios', 'relatorios'], 'LIDERANÇA • ENVIOS', memberAccess, created, existing.reports);
  const adminCategory = await ensureCategory(guild, ['administracao', 'staff', 'analise'], 'LIDERANÇA • ADMINISTRAÇÃO', staffAccess, created);

  const verification = await ensureText(guild, config.verificationChannelId, ['verifique-se', 'verificacao'], 'verifique-se', welcomeCategory, publicRead, 'Solicite sua verificação na Liderança Alta.', created);
  const explanation = await ensureText(guild, config.explanationChannelId, ['explicativo'], 'explicativo', infoCategory, memberAccess, 'Guia oficial do servidor de Liderança.', created);
  const schedule = await ensureText(guild, config.scheduleChannelId, ['cronograma'], 'cronograma', infoCategory, memberAccess, 'Cronograma oficial das áreas.', created);
  const rpp = await ensureText(guild, config.rppChannelId, ['rpp'], 'rpp', utilityCategory, memberAccess, 'Solicitações de RPP.', created);
  const justification = await ensureText(guild, config.justificationChannelId, ['justificativa'], 'justificativa', utilityCategory, memberAccess, 'Justificativas de ausência.', created);
  const suggestions = await ensureText(guild, config.suggestionsChannelId, ['sugestoes'], 'sugestões', utilityCategory, memberAccess, 'Sugestões construtivas.', created);
  const bot = await ensureText(guild, config.botChannelId, ['bot'], 'bot', utilityCategory, memberAccess, 'Solicitações de funções para o bot.', created);
  const evaluation = await ensureText(guild, config.evaluationChannelId, ['avaliacao'], 'avaliação', utilityCategory, memberAccess, 'Avaliações de liderança.', created);
  const reports = await ensureText(guild, config.reportsChannelId, ['relatorio', 'relatorios'], 'relatórios', submissionCategory, memberAccess, 'Modelos e envios de relatórios.', created);
  const ups = await ensureText(guild, config.upsChannelId, ['ups', 'upamentos'], 'ups', submissionCategory, memberAccess, 'Envio de upamentos.', created);
  const highlights = await ensureText(guild, config.highlightsChannelId, ['destaques'], 'destaques', submissionCategory, memberAccess, 'Envio de destaques.', created);
  const review = await ensureText(guild, config.reviewChannelId, ['solicitacoes-lideranca', 'analise-lideranca'], 'solicitações-liderança', adminCategory, staffAccess, 'Análise privada das solicitações da Liderança.', created);

  config = await prisma.leadershipConfig.update({ where: { guildId: guild.id }, data: {
    verificationChannelId: verification.id, explanationChannelId: explanation.id, scheduleChannelId: schedule.id,
    rppChannelId: rpp.id, justificationChannelId: justification.id, suggestionsChannelId: suggestions.id,
    botChannelId: bot.id, evaluationChannelId: evaluation.id, reportsChannelId: reports.id,
    upsChannelId: ups.id, highlightsChannelId: highlights.id, reviewChannelId: review.id,
  } });

  const [verificationArt, explanationArt, rppArt, justificationArt, suggestionsArt] = await Promise.all([
    discoverArts(verification, config.verificationBannerUrl, config.stripBannerUrl),
    discoverArts(explanation, config.explanationBannerUrl, config.stripBannerUrl),
    discoverArts(rpp, config.rppBannerUrl, config.stripBannerUrl),
    discoverArts(justification, config.justificationBannerUrl, config.stripBannerUrl),
    discoverArts(suggestions, config.suggestionsBannerUrl, config.stripBannerUrl),
  ]);
  const stripBannerUrl = config.stripBannerUrl ?? rppArt.strip ?? justificationArt.strip ?? suggestionsArt.strip ?? explanationArt.strip ?? verificationArt.strip;
  config = await prisma.leadershipConfig.update({ where: { guildId: guild.id }, data: {
    verificationBannerUrl: verificationArt.banner, explanationBannerUrl: explanationArt.banner,
    rppBannerUrl: rppArt.banner, justificationBannerUrl: justificationArt.banner,
    suggestionsBannerUrl: suggestionsArt.banner, stripBannerUrl,
  } });

  const movChatRoleId = LEADERSHIP_AREAS.find(area => area.key === 'mov-chat')!.roleId;
  if (!await prisma.leadershipScheduleEntry.count({ where: { guildId: guild.id } })) {
    await prisma.leadershipScheduleEntry.createMany({ data: ['segunda', 'terça', 'quinta', 'sexta'].flatMap(day => [
      { guildId: guild.id, day, time: '16:00', label: 'mov chat﹒౨ৎ˚₊‧', roleId: movChatRoleId },
      { guildId: guild.id, day, time: '22:00', label: 'mov chat﹒౨ৎ˚₊‧', roleId: movChatRoleId },
    ]) });
  }
  await prisma.leadershipScheduleEntry.updateMany({
    where: { guildId: guild.id, roleId: null, label: 'mov chat﹒౨ৎ˚₊‧' },
    data: { roleId: movChatRoleId },
  });
  for (const area of LEADERSHIP_AREAS) {
    await ensureAreaChannel(guild, roles.get(area.roleId)!, area.name, reports, config, created);
  }
  const entries = await combinedScheduleEntries();
  const channels = { schedule: schedule.id, rpp: rpp.id, justification: justification.id, suggestions: suggestions.id, bot: bot.id, reports: reports.id, ups: ups.id, highlights: highlights.id, evaluation: evaluation.id };
  const ids = await Promise.all([
    publishOrUpdate(verification, config.verificationMessageId, verificationMessage(config.verificationBannerUrl)),
    publishOrUpdate(explanation, config.explanationMessageId, explanationMessage(channels, config.explanationBannerUrl)),
    publishOrUpdate(schedule, config.scheduleMessageId, scheduleMessage(entries)),
    publishOrUpdate(rpp, config.rppMessageId, formPanel('rpp', config.rppBannerUrl, config.stripBannerUrl)),
    publishOrUpdate(justification, config.justificationMessageId, formPanel('justification', config.justificationBannerUrl, config.stripBannerUrl)),
    publishOrUpdate(suggestions, config.suggestionsMessageId, formPanel('suggestion', config.suggestionsBannerUrl, config.stripBannerUrl)),
    publishOrUpdate(bot, config.botMessageId, formPanel('bot', null, config.stripBannerUrl)),
    publishOrUpdate(evaluation, config.evaluationMessageId, formPanel('evaluation', null, config.stripBannerUrl)),
    publishOrUpdate(reports, config.reportsMessageId, formPanel('report', null, config.stripBannerUrl)),
    publishOrUpdate(ups, config.upsMessageId, formPanel('up', null, config.stripBannerUrl)),
    publishOrUpdate(highlights, config.highlightsMessageId, formPanel('highlight', null, config.stripBannerUrl)),
  ]);
  await prisma.leadershipConfig.update({ where: { guildId: guild.id }, data: {
    verificationMessageId: ids[0], explanationMessageId: ids[1], scheduleMessageId: ids[2], rppMessageId: ids[3],
    justificationMessageId: ids[4], suggestionsMessageId: ids[5], botMessageId: ids[6], evaluationMessageId: ids[7],
    reportsMessageId: ids[8], upsMessageId: ids[9], highlightsMessageId: ids[10],
  } });
  return created;
}

async function refreshSchedule(guild: Guild, config?: LeadershipConfig) {
  config ??= await requireConfig();
  const channel = await fetchText(guild, config.scheduleChannelId);
  if (!channel) throw new Error('Canal do cronograma indisponível.');
  const entries = await combinedScheduleEntries();
  const scheduleMessageId = await publishOrUpdate(channel, config.scheduleMessageId, scheduleMessage(entries));
  await prisma.leadershipConfig.update({ where: { guildId: guild.id }, data: { scheduleMessageId } });
}

export async function refreshLinkedLeadershipSchedule(client: Client) {
  const config = await prisma.leadershipConfig.findUnique({ where: { guildId: LEADERSHIP_GUILD_ID } });
  if (!config) return false;
  const guild = client.guilds.cache.get(LEADERSHIP_GUILD_ID) ?? await client.guilds.fetch(LEADERSHIP_GUILD_ID).catch(() => null);
  if (!guild) return false;
  await refreshSchedule(guild, config);
  return true;
}

async function ensureAreaChannel(
  guild: Guild,
  role: Role,
  name: string,
  reports: TextChannel,
  config: LeadershipConfig,
  created: string[],
) {
  if (!reports.parent) throw new Error('Categoria principal de relatórios indisponível.');
  const me = await guild.members.fetchMe();
  const overwrites = reviewOverwrites(guild, me.id);
  overwrites.push({ id: role.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] });
  const prior = await prisma.leadershipArea.findUnique({ where: { guildId_roleId: { guildId: guild.id, roleId: role.id } } });
  const before = created.length;
  const channel = await ensureText(guild, prior?.reportChannelId, [`relatorio-${safeLeadershipName(name)}`], `relatório-${safeLeadershipName(name)}`, reports.parent, overwrites, `Relatórios privados da área ${name}.`, created);
  await prisma.leadershipArea.upsert({
    where: { guildId_roleId: { guildId: guild.id, roleId: role.id } },
    create: { guildId: guild.id, roleId: role.id, name, reportChannelId: channel.id },
    update: { name, reportChannelId: channel.id },
  });
  if (!prior?.reportChannelId || created.length > before) await channel.send(formPanel('report', null, config.stripBannerUrl));
  return channel;
}

async function addArea(message: Message<true>, args: string[]) {
  requireAdmin(message.member, message.guild);
  const config = await requireConfig();
  const roleId = args.join(' ').match(/<@&(\d{15,22})>/)?.[1] ?? args[0]?.match(/^\d{15,22}$/)?.[0];
  if (!roleId) throw new Error('Use `!lideranca_area @Cargo Nome da Área`.');
  const role = await message.guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error('Cargo da área não encontrado.');
  const roleArg = args.findIndex(value => value.includes(roleId));
  const name = args.slice(roleArg + 1).join(' ').trim() || role.name;
  const reports = await fetchText(message.guild, config.reportsChannelId);
  if (!reports) throw new Error('Canal principal de relatórios indisponível.');
  const channel = await ensureAreaChannel(message.guild, role, name, reports, config, []);
  await message.reply({ content: `Área **${name}** vinculada ao cargo <@&${role.id}> em <#${channel.id}>.`, allowedMentions: { parse: [] } });
}

async function editSchedule(message: Message<true>, args: string[]) {
  requireAdmin(message.member, message.guild);
  await requireConfig();
  if (!args.length) {
    await refreshSchedule(message.guild);
    await message.reply({ content: 'Cronograma sincronizado.', allowedMentions: { repliedUser: false } });
    return;
  }
  const removing = ['apagar', 'remover', 'excluir'].includes(args[0].toLocaleLowerCase('pt-BR'));
  const offset = removing ? 1 : 0;
  const day = normalizeLeadershipDay(args[offset] ?? '');
  const time = args[offset + 1] ?? '';
  if (!day || !validLeadershipTime(time)) throw new Error('Use `!lideranca_cronograma dia HH:MM @Cargo atividade` ou `!lideranca_cronograma apagar dia HH:MM @Cargo`.');
  if (removing) {
    const roleId = args.slice(offset + 2).join(' ').match(/<@&(\d{15,22})>/)?.[1];
    if (!roleId) throw new Error('Mencione o cargo da área que terá o horário removido.');
    const removed = await prisma.leadershipScheduleEntry.deleteMany({ where: { guildId: message.guild.id, day, time, roleId } });
    const area = LEADERSHIP_AREAS.find(item => item.roleId === roleId);
    if (!removed.count && area?.key === 'passtime') throw new Error('Esse horário deve ser removido no servidor Passtime; a Liderança será atualizada automaticamente.');
    if (!removed.count) throw new Error('Nenhuma atividade dessa área foi encontrada nesse dia e horário.');
  } else {
    const rest = args.slice(offset + 2).join(' ').trim();
    const roleId = rest.match(/<@&(\d{15,22})>/)?.[1] ?? null;
    const label = rest.replace(/<@&\d{15,22}>/, '').trim() || (roleId ? 'Atividade da área' : '');
    if (!label && !roleId) throw new Error('Informe a atividade ou mencione o cargo da área.');
    if (roleId && await prisma.leadershipScheduleEntry.findFirst({ where: { guildId: message.guild.id, day, time, roleId } })) {
      throw new Error('Essa área já possui uma atividade nesse dia e horário.');
    }
    await prisma.leadershipScheduleEntry.create({ data: { guildId: message.guild.id, day, time, label: label || 'Atividade da área', roleId } });
  }
  await refreshSchedule(message.guild);
  await message.reply({ content: removing ? 'Horário removido e cronograma atualizado.' : 'Atividade adicionada e cronograma atualizado.', allowedMentions: { repliedUser: false } });
}

async function runCommand(message: Message<true>) {
  const [, ...args] = message.content.trim().split(/\s+/);
  const command = leadershipCommandName(message.content);
  if (command === '!criarlideranca' || command === '!lideranca') {
    const created = await setupLeadership(message);
    await message.reply({ content: created.length ? `Liderança sincronizada. Criados: ${created.join(', ')}.` : 'Liderança sincronizada; canais, permissões, artes e painéis já estavam configurados.', allowedMentions: { repliedUser: false } });
    return;
  }
  if (command === '!lideranca_area') return addArea(message, args);
  if (command === '!lideranca_cronograma') return editSchedule(message, args);
}

export async function handleLeadershipCommand(message: Message) {
  if (!isLeadershipCommand(message.content) || !message.inGuild() || message.guildId !== LEADERSHIP_GUILD_ID) return false;
  try { await runCommand(message as Message<true>); }
  catch (error) { await message.reply({ content: errorText(error), allowedMentions: { repliedUser: false } }).catch(() => null); }
  return true;
}

async function createRequest(guild: Guild, userId: string, type: string, fields: Record<string, string>) {
  const config = await requireConfig();
  const review = await fetchText(guild, config.reviewChannelId);
  if (!review) throw new Error('Canal administrativo de análise indisponível. Execute `!criarlideranca`.');
  const request = await prisma.leadershipRequest.create({ data: { guildId: guild.id, userId, type, fieldsJson: JSON.stringify(fields), reviewChannelId: review.id } });
  try {
    const sent = await review.send(reviewMessage({ id: request.id, userId, type, fields }));
    return await prisma.leadershipRequest.update({ where: { id: request.id }, data: { reviewMessageId: sent.id } });
  } catch (error) {
    await prisma.leadershipRequest.delete({ where: { id: request.id } }).catch(() => null);
    throw error;
  }
}

export async function handleLeadershipButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('leadership:') || !interaction.inCachedGuild() || interaction.guildId !== LEADERSHIP_GUILD_ID) return false;
  if (scheduleButtonIds.has(interaction.customId)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    requireAdmin(member, interaction.guild);
    if (interaction.customId === LEADERSHIP_IDS.scheduleRefresh) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await refreshSchedule(interaction.guild);
      await interaction.editReply('Cronograma sincronizado com o Passtime e com as atividades da Liderança.');
      return true;
    }
    const action = interaction.customId === LEADERSHIP_IDS.scheduleAdd ? 'add' : 'remove';
    const modal = new ModalBuilder()
      .setCustomId(`${LEADERSHIP_IDS.scheduleModal}:${action}:${interaction.user.id}`)
      .setTitle(action === 'add' ? 'Adicionar atividade' : 'Remover atividade')
      .addComponents(
        textField('day', 'Dia da semana', TextInputStyle.Short, 20),
        textField('time', 'Horário em Brasília (HH:MM)', TextInputStyle.Short, 5),
        textField('area', 'Área (ex.: Passtime ou Mov Chat)', TextInputStyle.Short, 40),
      );
    if (action === 'add') modal.addComponents(textField('activity', 'Nome da atividade', TextInputStyle.Short, 100));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.customId === LEADERSHIP_IDS.verify) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const config = await requireConfig();
    if (member.roles.cache.has(config.verifiedRoleId)) {
      await interaction.editReply('Você já possui o acesso verificado.');
      return true;
    }
    const pending = await prisma.leadershipRequest.findFirst({ where: { guildId: interaction.guild.id, userId: interaction.user.id, type: 'verification', status: 'PENDING' } });
    if (pending) {
      await interaction.editReply(`Sua solicitação já está aguardando análise. Protocolo: \`${pending.id}\`.`);
      return true;
    }
    const request = await createRequest(interaction.guild, interaction.user.id, 'verification', { Usuário: interaction.user.tag, ID: interaction.user.id });
    await interaction.editReply(`Solicitação enviada à administração. Protocolo: \`${request.id}\`.`);
    return true;
  }
  if (interaction.customId.startsWith(`${LEADERSHIP_IDS.open}:`)) {
    const kind = interaction.customId.split(':')[2] as FormKind;
    const spec = formSpecs[kind];
    if (!spec) throw new Error('Formulário inválido.');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const config = await requireConfig();
    if (!member.roles.cache.has(config.verifiedRoleId) && !isAdmin(member, interaction.guild)) throw new Error('Você precisa estar verificado para enviar esta solicitação.');
    const modal = new ModalBuilder().setCustomId(`${LEADERSHIP_IDS.modal}:${kind}:${interaction.user.id}`).setTitle(spec.title)
      .addComponents(...spec.fields.map(([id, label, style, max]) => textField(id, label, style, max)));
    await interaction.showModal(modal);
    return true;
  }
  if (interaction.customId.startsWith(`${LEADERSHIP_IDS.review}:`)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [, , action, requestId] = interaction.customId.split(':');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    requireAdmin(member, interaction.guild);
    if (!['approve', 'reject'].includes(action) || !requestId) throw new Error('Ação administrativa inválida.');
    const request = await prisma.leadershipRequest.findUnique({ where: { id: requestId } });
    if (!request || request.guildId !== interaction.guild.id) throw new Error('Solicitação não encontrada.');
    if (request.status !== 'PENDING') throw new Error('Esta solicitação já foi analisada.');
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const claimed = await prisma.leadershipRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status, reviewerId: interaction.user.id, resolvedAt: new Date() } });
    if (!claimed.count) throw new Error('Esta solicitação já foi analisada.');
    try {
      if (status === 'APPROVED' && request.type === 'verification') {
        const config = await requireConfig();
        const target = await interaction.guild.members.fetch(request.userId);
        await target.roles.add(config.verifiedRoleId, `Verificação aprovada por ${interaction.user.tag}`);
      }
    } catch (error) {
      await prisma.leadershipRequest.update({ where: { id: request.id }, data: { status: 'PENDING', reviewerId: null, resolvedAt: null } });
      throw error;
    }
    const resolved = { ...request, status, reviewerId: interaction.user.id };
    await interaction.message.edit(closedReviewMessage(resolved) as MessageEditOptions).catch(() => null);
    const target = await interaction.client.users.fetch(request.userId).catch(() => null);
    const dmSent = await target?.send(`Sua solicitação de **${request.type}** na Liderança Alta foi **${status === 'APPROVED' ? 'aprovada' : 'recusada'}**. Protocolo: \`${request.id}\`.`).then(() => true).catch(() => false) ?? false;
    await interaction.editReply(`Solicitação ${status === 'APPROVED' ? 'aprovada' : 'recusada'}.${dmSent ? ' O membro foi avisado no privado.' : ' O privado do membro está fechado.'}`);
    return true;
  }
  return false;
}

export async function handleLeadershipModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('leadership:') || !interaction.inCachedGuild() || interaction.guildId !== LEADERSHIP_GUILD_ID) return false;
  if (interaction.customId.startsWith(`${LEADERSHIP_IDS.scheduleModal}:`)) {
    const [, , , action, ownerId] = interaction.customId.split(':');
    if (ownerId !== interaction.user.id || !['add', 'remove'].includes(action)) throw new Error('Este editor de cronograma é inválido.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    requireAdmin(member, interaction.guild);
    const day = normalizeLeadershipDay(interaction.fields.getTextInputValue('day'));
    const time = interaction.fields.getTextInputValue('time').trim();
    const area = leadershipArea(interaction.fields.getTextInputValue('area').trim());
    if (!day || !validLeadershipTime(time) || !area) {
      throw new Error('Dia, horário ou área inválidos. Áreas: Mov Chat, Passtime, Design, Recrutamento e Eventos.');
    }
    if (action === 'add') {
      const label = interaction.fields.getTextInputValue('activity').trim();
      if (!label) throw new Error('Informe o nome da atividade.');
      const duplicate = await prisma.leadershipScheduleEntry.findFirst({ where: { guildId: interaction.guild.id, day, time, roleId: area.roleId } });
      if (duplicate) throw new Error(`${area.name} já possui uma atividade em ${day}, às ${time}.`);
      await prisma.leadershipScheduleEntry.create({ data: { guildId: interaction.guild.id, day, time, label, roleId: area.roleId } });
      await refreshSchedule(interaction.guild);
      await interaction.editReply(`Atividade de **${area.name}** adicionada em **${day}, ${time}**. O cronograma foi atualizado.`);
      return true;
    }
    const removed = await prisma.leadershipScheduleEntry.deleteMany({ where: { guildId: interaction.guild.id, day, time, roleId: area.roleId } });
    if (!removed.count && area.key === 'passtime') throw new Error('Esse horário veio do Passtime. Remova-o pelo cronograma do servidor Passtime para sincronizar os dois painéis.');
    if (!removed.count) throw new Error('Nenhuma atividade dessa área foi encontrada nesse dia e horário.');
    await refreshSchedule(interaction.guild);
    await interaction.editReply(`Atividade de **${area.name}** removida. O cronograma foi atualizado.`);
    return true;
  }
  if (!interaction.customId.startsWith(`${LEADERSHIP_IDS.modal}:`)) return false;
  const [, , kindValue, ownerId] = interaction.customId.split(':');
  const kind = kindValue as FormKind;
  const spec = formSpecs[kind];
  if (!spec || ownerId !== interaction.user.id) throw new Error('Este formulário não pertence a você.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const config = await requireConfig();
  if (!member.roles.cache.has(config.verifiedRoleId) && !isAdmin(member, interaction.guild)) throw new Error('Você precisa estar verificado.');
  const fields = Object.fromEntries(spec.fields.map(([id]) => [fieldLabels[id] ?? id, interaction.fields.getTextInputValue(id).trim()]));
  if (kind === 'rpp') {
    const duration = Number(fields.Tempo.match(/\d+/)?.[0]);
    if (!Number.isInteger(duration) || duration < 7 || duration > 30) throw new Error('O RPP precisa durar de 7 a 30 dias.');
  }
  const request = await createRequest(interaction.guild, interaction.user.id, kind, fields);
  await interaction.editReply(`Solicitação enviada à administração. Protocolo: \`${request.id}\`.`);
  return true;
}
