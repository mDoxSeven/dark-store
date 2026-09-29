import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type Message,
  type MessageCreateOptions,
} from 'discord.js';
import type { AltaMovChatConfig, AltaMovChatReport, AltaMovChatStat } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  ALTA_MOV_CHAT_GUILD_ID,
  ALTA_MOV_CHAT_REPORT_CHANNEL_ID,
  ALTA_MOV_CHAT_REPORT_GUILD_ID,
  ALTA_MOV_CHAT_REPORT_HOUR,
  ALTA_MOV_CHAT_REPORT_MINUTE,
  ALTA_MOV_CHAT_REPORT_WEEKDAY,
  ALTA_MOV_CHAT_RESET_PREFIX,
  isAltaMovChatCommand,
  movChatCommandName,
} from './movChatConfig.js';
import {
  movChatConfigMessage,
  movChatMemberMessage,
  movChatRankingMessage,
  movChatResetPrompt,
  movChatV2,
  movChatWeeklyReportMessage,
  type MovChatRankingItem,
} from './movChatMessages.js';

const mutationQueues = new Map<string, Promise<unknown>>();
const reportLocks = new Set<string>();
let reportTimerStarted = false;

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ação não concluída.';
const totalPoints = (item: Pick<AltaMovChatStat, 'chatPoints' | 'manualPoints'>) => item.chatPoints + item.manualPoints;
const asRankingItem = (item: AltaMovChatStat): MovChatRankingItem => ({
  userId: item.userId,
  messageCount: item.messageCount,
  scoredMessageCount: item.scoredMessageCount,
  chatPoints: item.chatPoints,
  manualPoints: item.manualPoints,
});

function queueMutation<T>(guildId: string, task: () => Promise<T>) {
  const previous = mutationQueues.get(guildId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  mutationQueues.set(guildId, next);
  void next.finally(() => { if (mutationQueues.get(guildId) === next) mutationQueues.delete(guildId); }).catch(() => undefined);
  return next;
}

async function configFor(guildId = ALTA_MOV_CHAT_GUILD_ID) {
  return prisma.altaMovChatConfig.upsert({
    where: { guildId },
    create: {
      guildId,
      reportGuildId: ALTA_MOV_CHAT_REPORT_GUILD_ID,
      reportChannelId: ALTA_MOV_CHAT_REPORT_CHANNEL_ID,
    },
    update: {},
  });
}

async function managerAccess(member: GuildMember, config?: AltaMovChatConfig | null) {
  if (member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const current = config ?? await prisma.altaMovChatConfig.findUnique({ where: { guildId: member.guild.id } });
  return Boolean(current?.managerRoleId && member.roles.cache.has(current.managerRoleId));
}

async function assertManager(message: Message<true>, config?: AltaMovChatConfig | null) {
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  if (!await managerAccess(member, config)) throw new Error('Somente a gestão do Mov Chat ou administradores podem usar esta função.');
}

export function currentBrazilReportBoundary(now = new Date()) {
  // O Brasil opera em UTC-3 sem horário de verão. O deslocamento converte o relógio para o calendário de Brasília.
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const daysSinceReportDay = (local.getUTCDay() - ALTA_MOV_CHAT_REPORT_WEEKDAY + 7) % 7;
  const reportDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceReportDay);
  return new Date(reportDay + 3 * 60 * 60 * 1000
    + ALTA_MOV_CHAT_REPORT_HOUR * 60 * 60 * 1000
    + ALTA_MOV_CHAT_REPORT_MINUTE * 60 * 1000);
}

async function deliverReport(client: Client, report: AltaMovChatReport) {
  const entries = JSON.parse(report.entriesJson) as MovChatRankingItem[];
  const sorted = [...entries].sort((a, b) => totalPoints(b) - totalPoints(a) || b.messageCount - a.messageCount);
  const pages = Math.max(1, Math.ceil(sorted.length / 15));
  const guild = await client.guilds.fetch(report.reportGuildId);
  const channel = await guild.channels.fetch(report.reportChannelId);
  if (!channel?.isSendable()) throw new Error(`Canal de relatório <#${report.reportChannelId}> indisponível no servidor de Liderança.`);
  const sent = [];
  try {
    for (let index = 0; index < pages; index += 1) {
      const page = sorted.slice(index * 15, (index + 1) * 15);
      sent.push(await channel.send(movChatWeeklyReportMessage(page, {
        cycleStartedAt: report.cycleStartedAt,
        cycleEndedAt: report.cycleEndedAt,
        page: index + 1,
        pages,
        trigger: report.trigger,
        summary: {
          participants: report.participantCount,
          messages: report.totalMessages,
          scoredMessages: report.totalScoredMessages,
          points: report.totalPoints,
        },
      }) as MessageCreateOptions));
      await prisma.altaMovChatReport.update({
        where: { id: report.id },
        data: { messageIdsJson: JSON.stringify(sent.map(message => message.id)) },
      });
    }
  } catch (error) {
    await Promise.all(sent.map(message => message.delete().catch(() => null)));
    await prisma.altaMovChatReport.update({ where: { id: report.id }, data: { messageIdsJson: '[]' } }).catch(() => null);
    throw error;
  }
  return sent.map(message => message.id);
}

async function closeCycle(client: Client, trigger: 'AUTOMATIC' | 'MANUAL', triggeredBy?: string) {
  const guildId = ALTA_MOV_CHAT_GUILD_ID;
  if (reportLocks.has(guildId)) throw new Error('O ciclo do Mov Chat já está sendo encerrado. Aguarde.');
  reportLocks.add(guildId);
  try {
    return await queueMutation(guildId, async () => {
      const pending = await prisma.altaMovChatReport.findFirst({ where: { guildId, status: 'PENDING' } });
      if (pending) throw new Error('Já existe um relatório aguardando validação do Discord. O Angel tentará enviá-lo novamente.');
      const config = await configFor(guildId);
      const stats = await prisma.altaMovChatStat.findMany({ where: { guildId } });
      const endedAt = new Date();
      const entries = stats.map(asRankingItem).sort((a, b) => totalPoints(b) - totalPoints(a) || b.messageCount - a.messageCount);
      const totals = entries.reduce((result, item) => ({
        messages: result.messages + item.messageCount,
        scored: result.scored + item.scoredMessageCount,
        points: result.points + totalPoints(item),
      }), { messages: 0, scored: 0, points: 0 });
      const report = await prisma.altaMovChatReport.create({ data: {
          guildId,
          cycleStartedAt: config.cycleStartedAt,
          cycleEndedAt: endedAt,
          trigger,
          triggeredBy: triggeredBy ?? null,
          reportGuildId: config.reportGuildId,
          reportChannelId: config.reportChannelId,
          entriesJson: JSON.stringify(entries),
          participantCount: entries.length,
          totalMessages: totals.messages,
          totalScoredMessages: totals.scored,
          totalPoints: totals.points,
      } });
      try {
        const ids = await deliverReport(client, report);
        await prisma.$transaction([
          prisma.altaMovChatReport.update({ where: { id: report.id }, data: { status: 'SENT', messageIdsJson: JSON.stringify(ids) } }),
          prisma.altaMovChatStat.deleteMany({ where: { guildId } }),
          prisma.altaMovChatConfig.update({ where: { guildId }, data: { cycleStartedAt: endedAt, lastReportAt: new Date() } }),
        ]);
        return { report: { ...report, status: 'SENT', messageIdsJson: JSON.stringify(ids) }, delivered: true, messageIds: ids };
      } catch (error) {
        console.error(`relatório Mov Chat ${report.id} não validado; ciclo preservado: ${errorText(error)}`);
        return { report, delivered: false, messageIds: [] };
      }
    });
  } finally {
    reportLocks.delete(guildId);
  }
}

async function retryPendingReport(client: Client) {
  const pending = await prisma.altaMovChatReport.findFirst({
    where: { guildId: ALTA_MOV_CHAT_GUILD_ID, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });
  if (!pending) return false;
  const guild = await client.guilds.fetch(pending.reportGuildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(pending.reportChannelId).catch(() => null) : null;
  if (channel?.isTextBased()) {
    const ids = JSON.parse(pending.messageIdsJson) as string[];
    await Promise.all(ids.map(id => channel.messages.delete(id).catch(() => null)));
  }
  await prisma.altaMovChatReport.delete({ where: { id: pending.id } });
  await closeCycle(client, pending.trigger === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC', pending.triggeredBy ?? undefined);
  return true;
}

export async function sweepAltaMovChatReports(client: Client, now = new Date()) {
  if (reportLocks.has(ALTA_MOV_CHAT_GUILD_ID)) return false;
  if (await retryPendingReport(client)) return true;
  const config = await prisma.altaMovChatConfig.findUnique({ where: { guildId: ALTA_MOV_CHAT_GUILD_ID } });
  if (!config || reportLocks.has(config.guildId)) return false;
  const boundary = currentBrazilReportBoundary(now);
  if (now < boundary || config.cycleStartedAt >= boundary) return false;
  await closeCycle(client, 'AUTOMATIC');
  return true;
}

export function startAltaMovChatReports(client: Client) {
  if (reportTimerStarted) return;
  reportTimerStarted = true;
  void sweepAltaMovChatReports(client).catch(error => console.error(`agendador Mov Chat: ${errorText(error)}`));
  setInterval(() => void sweepAltaMovChatReports(client).catch(error => console.error(`agendador Mov Chat: ${errorText(error)}`)), 60_000).unref();
}

async function showConfig(message: Message<true>, config: AltaMovChatConfig) {
  const channels = await prisma.altaMovChatChannel.findMany({ where: { guildId: message.guildId }, orderBy: { createdAt: 'asc' } });
  await message.channel.send(movChatConfigMessage(config, channels));
}

async function configure(message: Message<true>) {
  const existing = await prisma.altaMovChatConfig.findUnique({ where: { guildId: message.guildId } });
  await assertManager(message, existing);
  const config = existing ?? await configFor(message.guildId);
  const args = message.content.trim().split(/\s+/).slice(1);
  let action = args[0]?.toLocaleLowerCase('pt-BR') ?? '';
  if (!action) return showConfig(message, config);
  if (message.mentions.channels.first() && !['adicionar', 'remover'].includes(action)) action = 'adicionar';
  if (action === 'adicionar') {
    const channel = message.mentions.channels.first();
    if (!channel || !('guildId' in channel) || channel.guildId !== message.guildId || !channel.isTextBased() || channel.isThread()) throw new Error('Use `!config_chat adicionar #canal 1`.');
    const mentionIndex = args.findIndex(value => value.includes(channel.id));
    const points = Number(args[mentionIndex + 1] ?? '1');
    if (!Number.isInteger(points) || points < 0 || points > 100) throw new Error('Os pontos por mensagem devem ser um número entre 0 e 100.');
    await prisma.altaMovChatChannel.upsert({
      where: { guildId_channelId: { guildId: message.guildId, channelId: channel.id } },
      create: { guildId: message.guildId, channelId: channel.id, pointsPerMessage: points },
      update: { pointsPerMessage: points },
    });
  } else if (action === 'remover') {
    const channel = message.mentions.channels.first();
    if (!channel) throw new Error('Use `!config_chat remover #canal`.');
    await prisma.altaMovChatChannel.deleteMany({ where: { guildId: message.guildId, channelId: channel.id } });
  } else if (action === 'cargo') {
    const role = message.mentions.roles.first();
    if (!role || role.guild.id !== message.guildId) throw new Error('Use `!config_chat cargo @cargo`.');
    await prisma.altaMovChatConfig.update({ where: { guildId: message.guildId }, data: { managerRoleId: role.id } });
  } else if (action === 'cooldown') {
    const seconds = Number(args[1]);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 300) throw new Error('Use um cooldown entre 0 e 300 segundos.');
    await prisma.altaMovChatConfig.update({ where: { guildId: message.guildId }, data: { pointsCooldownSeconds: seconds } });
  } else throw new Error('Opção inválida. Use `adicionar`, `remover`, `cargo` ou `cooldown`.');
  await showConfig(message, await configFor(message.guildId));
}

async function memberStats(message: Message<true>) {
  const config = await configFor(message.guildId);
  const user = message.mentions.users.first() ?? message.author;
  const stat = await prisma.altaMovChatStat.findUnique({ where: { guildId_userId: { guildId: message.guildId, userId: user.id } } });
  await message.channel.send(movChatMemberMessage(stat ? asRankingItem(stat) : {
    userId: user.id, messageCount: 0, scoredMessageCount: 0, chatPoints: 0, manualPoints: 0,
  }, config.cycleStartedAt));
}

async function ranking(message: Message<true>) {
  const config = await configFor(message.guildId);
  const stats = await prisma.altaMovChatStat.findMany({ where: { guildId: message.guildId } });
  await message.channel.send(movChatRankingMessage(stats.map(asRankingItem), config.cycleStartedAt));
}

async function adjustPoints(message: Message<true>, direction: 1 | -1) {
  const config = await configFor(message.guildId);
  await assertManager(message, config);
  const user = message.mentions.users.first();
  if (!user || user.bot) throw new Error(`Use \`${direction > 0 ? '!dar_pontos' : '!remover_pontos'} @membro quantidade motivo\`.`);
  const args = message.content.trim().split(/\s+/).slice(1);
  const mentionIndex = args.findIndex(value => value.includes(user.id));
  const amount = Number(args[mentionIndex + 1]);
  const reason = args.slice(mentionIndex + 2).join(' ').trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) throw new Error('Informe uma quantidade inteira entre 1 e 100000.');
  if (reason.length < 3 || reason.length > 200) throw new Error('Informe um motivo entre 3 e 200 caracteres para manter a auditoria.');
  const signed = amount * direction;
  const stat = await queueMutation(message.guildId, () => prisma.$transaction(async transaction => {
    const latest = await transaction.altaMovChatStat.findUnique({ where: { guildId_userId: { guildId: message.guildId, userId: user.id } } });
    if (direction < 0 && (!latest || totalPoints(latest) < amount)) throw new Error('Não é possível deixar a pontuação total negativa.');
    const saved = await transaction.altaMovChatStat.upsert({
      where: { guildId_userId: { guildId: message.guildId, userId: user.id } },
      create: { guildId: message.guildId, userId: user.id, manualPoints: signed },
      update: { manualPoints: { increment: signed } },
    });
    await transaction.altaMovChatAdjustment.create({ data: {
      guildId: message.guildId, userId: user.id, amount: signed, reason, actorId: message.author.id,
    } });
    return saved;
  }));
  await message.channel.send(movChatV2([
    `# ${direction > 0 ? '➕' : '➖'} | PONTUAÇÃO ATUALIZADA`,
    `**Membro:** <@${user.id}>`,
    `**Ajuste:** ${signed > 0 ? '+' : ''}${signed} pontos`,
    `**Motivo:** ${reason}`,
    `**Novo total:** ${totalPoints(stat)} pontos`,
    `-# Responsável: <@${message.author.id}>`,
  ].join('\n')));
}

async function requestReset(message: Message<true>) {
  const config = await configFor(message.guildId);
  await assertManager(message, config);
  await message.channel.send(movChatResetPrompt(message.author.id, config.cycleStartedAt));
}

export async function handleAltaMovChatCommand(message: Message) {
  if (!isAltaMovChatCommand(message.content) || !message.inGuild() || message.guildId !== ALTA_MOV_CHAT_GUILD_ID) return false;
  try {
    const command = movChatCommandName(message.content);
    if (command === '!config_chat') await configure(message);
    else if (command === '!chat') await memberStats(message);
    else if (command === '!mensagens') await ranking(message);
    else if (command === '!dar_pontos') await adjustPoints(message, 1);
    else if (command === '!remover_pontos') await adjustPoints(message, -1);
    else if (command === '!resetar_chat' || command === '!resetar_rank') await requestReset(message);
  } catch (error) {
    await message.reply({ content: errorText(error), allowedMentions: { repliedUser: false } }).catch(() => null);
  }
  return true;
}

export async function trackAltaMovChatMessage(message: Message) {
  if (message.author.bot || !message.inGuild() || message.guildId !== ALTA_MOV_CHAT_GUILD_ID || message.webhookId) return false;
  if (message.content.trim().startsWith('!')) return false;
  const channel = await prisma.altaMovChatChannel.findUnique({
    where: { guildId_channelId: { guildId: message.guildId, channelId: message.channelId } },
  });
  if (!channel) return false;
  await queueMutation(message.guildId, async () => {
    const config = await configFor(message.guildId);
    const current = await prisma.altaMovChatStat.findUnique({ where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } } });
    const now = new Date();
    const meaningful = message.content.trim().length >= 3 || message.attachments.size > 0;
    const outsideCooldown = !current?.lastScoredAt || now.getTime() - current.lastScoredAt.getTime() >= config.pointsCooldownSeconds * 1000;
    const scored = meaningful && outsideCooldown && channel.pointsPerMessage > 0;
    await prisma.altaMovChatStat.upsert({
      where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
      create: {
        guildId: message.guildId,
        userId: message.author.id,
        messageCount: 1,
        scoredMessageCount: scored ? 1 : 0,
        chatPoints: scored ? channel.pointsPerMessage : 0,
        lastScoredAt: scored ? now : null,
      },
      update: {
        messageCount: { increment: 1 },
        ...(scored ? {
          scoredMessageCount: { increment: 1 },
          chatPoints: { increment: channel.pointsPerMessage },
          lastScoredAt: now,
        } : {}),
      },
    });
  });
  return true;
}

export async function handleAltaMovChatButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith(ALTA_MOV_CHAT_RESET_PREFIX)) return false;
  if (!interaction.inCachedGuild() || interaction.guildId !== ALTA_MOV_CHAT_GUILD_ID) throw new Error('Este controle pertence ao servidor oficial da Alta.');
  const [, , ownerId, cycleSeconds] = interaction.customId.split(':');
  if (ownerId !== interaction.user.id) throw new Error('Somente quem solicitou o encerramento pode confirmar este botão.');
  const config = await configFor(interaction.guildId);
  if (!await managerAccess(interaction.member, config)) throw new Error('Você não possui acesso à gestão do Mov Chat.');
  if (Math.floor(config.cycleStartedAt.getTime() / 1000) !== Number(cycleSeconds)) throw new Error('Este botão pertence a um ciclo que já foi encerrado.');
  await interaction.deferUpdate();
  const result = await closeCycle(interaction.client, 'MANUAL', interaction.user.id);
  await interaction.editReply(movChatV2([
    '# ✅ | CICLO ENCERRADO',
    `**Participantes:** ${result.report.participantCount}`,
    `**Mensagens:** ${result.report.totalMessages}`,
    `**Pontos:** ${result.report.totalPoints}`,
    '',
    result.delivered
      ? `Relatório enviado para <#${result.report.reportChannelId}> e novo ciclo iniciado.`
      : 'O Discord não validou o envio completo. Mensagens e pontos foram preservados; o Angel tentará novamente automaticamente.',
  ].join('\n')) as any);
  return true;
}
