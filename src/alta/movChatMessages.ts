import type { MessageCreateOptions } from 'discord.js';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALTA_MOV_CHAT_ACCENT } from './movChatConfig.js';

type ApiComponent = Record<string, unknown>;
const separator = { type: 14, divider: true, spacing: 1 };
const rankBannerPath = fileURLToPath(new URL('../../assets/alta/rank-mov-chat.png', import.meta.url));

export function movChatV2(content: string, options: {
  rows?: ApiComponent[];
  footer?: string;
  allowedUsers?: string[];
  allowedRoles?: string[];
  bannerFile?: string;
  bannerDescription?: string;
} = {}): MessageCreateOptions {
  const bannerName = options.bannerFile ? basename(options.bannerFile) : null;
  const children: ApiComponent[] = [];
  if (bannerName) {
    children.push(
      { type: 12, items: [{ media: { url: `attachment://${bannerName}` }, description: options.bannerDescription ?? 'Arte do Mov Chat' }] },
      separator,
    );
  }
  children.push({ type: 10, content });
  if (options.rows?.length) children.push(separator, ...options.rows);
  children.push(separator, { type: 10, content: `-# ${options.footer ?? 'Alta Cúpula • Mov Chat'}` });
  return {
    flags: 32768,
    allowedMentions: { parse: [], users: options.allowedUsers ?? [], roles: options.allowedRoles ?? [] },
    components: [{ type: 17, accent_color: ALTA_MOV_CHAT_ACCENT, components: children }],
    ...(options.bannerFile ? { files: [{ attachment: options.bannerFile, name: bannerName! }] } : {}),
  } as unknown as MessageCreateOptions;
}

export function movChatConfigMessage(config: {
  managerRoleId: string | null;
}, channels: Array<{ channelId: string }>) {
  const channelLines = channels.length
    ? channels.map(item => `• <#${item.channelId}>`).join('\n')
    : '*Nenhum canal configurado.*';
  return movChatV2([
    '# 💬 | MOV CHAT — ALTA',
    '*O Angel contabiliza as mensagens. A pontuação de participação é adicionada pela Líder depois da conferência da meta.*',
    '',
    `**Gestão exclusiva:** ${config.managerRoleId ? `<@&${config.managerRoleId}>` : 'Líder'}`,
    '**Relatório automático:** sábado, `16:00` • horário de Brasília',
    '**Destino:** servidor Liderança Alta',
    '',
    '### Canais monitorados',
    channelLines,
    '',
    '### Comandos dos membros',
    '`!chat` — consultar suas mensagens e sua pontuação',
    '`!mensagens` — consultar suas mensagens e sua pontuação',
  ].join('\n'), { footer: 'Alta Cúpula • Mov Chat • consulta individual' });
}

export type MovChatRankingItem = {
  userId: string;
  messageCount: number;
  scoredMessageCount: number;
  chatPoints: number;
  manualPoints: number;
};

export function movChatCleanupMessage(jobs: Array<{
  channelId: string;
  status: string;
  deletedCount: number;
  skippedPinnedCount: number;
  skippedOtherCount: number;
  cutoffAt: Date;
  lastError: string | null;
}>) {
  const status: Record<string, string> = {
    PENDING: '🕒 aguardando', SCANNING: '🗂️ mapeando histórico', RUNNING: '🧹 limpando', PAUSED: '⏸️ pausada', ERROR: '⚠️ aguardando nova tentativa', COMPLETED: '✅ concluída',
  };
  const lines = jobs.map(job => [
    `**<#${job.channelId}> — ${status[job.status] ?? job.status}**`,
    `└ apagadas: **${job.deletedCount}** • fixadas preservadas: **${job.skippedPinnedCount}** • outras preservadas: **${job.skippedOtherCount}**`,
    `└ limite: <t:${Math.floor(job.cutoffAt.getTime() / 1000)}:f>${job.lastError ? ` • último erro: ${job.lastError.slice(0, 120)}` : ''}`,
  ].join('\n'));
  return movChatV2([
    '# 🧹 | LIMPEZA SEGURA — MOV CHAT',
    '*Uma mensagem antiga é removida a cada 2 segundos. Fixadas e mensagens do novo ciclo são preservadas.*',
    '',
    lines.join('\n\n') || '*Nenhuma limpeza foi agendada. A primeira começará depois de um relatório validado.*',
    '',
    '`!limpeza_chat pausar` • `!limpeza_chat retomar`',
  ].join('\n'), { footer: 'Alta Cúpula • Mov Chat • limpeza incremental' });
}

const totalPoints = (item: MovChatRankingItem) => item.chatPoints + item.manualPoints;

export function movChatMemberMessage(item: MovChatRankingItem, cycleStartedAt: Date) {
  return movChatV2([
    '# 💬 | DESEMPENHO — MOV CHAT',
    `**Membro:** <@${item.userId}>`,
    `**Ciclo iniciado:** <t:${Math.floor(cycleStartedAt.getTime() / 1000)}:D>`,
    '',
    `💬 Mensagens enviadas: **${item.messageCount}**`,
    `🏆 Pontuação: **${totalPoints(item)}**`,
  ].join('\n'));
}

export function movChatRankingMessage(items: MovChatRankingItem[], cycleStartedAt: Date, rankBrand = '🏎️⚡', rankIcon = '🏎️') {
  const sorted = [...items].sort((a, b) => b.messageCount - a.messageCount || totalPoints(b) - totalPoints(a));
  const lines = sorted.slice(0, 25).map((item, index) =>
    `**#${index + 1}** ${rankIcon} <@${item.userId}> — **${item.messageCount}** mensagens • **${totalPoints(item)} pts**`);
  return movChatV2([
    `# ${rankBrand} | RANK — MOV CHAT`,
    `-# 🔴 Ao vivo • ciclo iniciado em <t:${Math.floor(cycleStartedAt.getTime() / 1000)}:D>`,
    '',
    '*Abaixo estão os membros com maior presença nos chats monitorados:*',
    '',
    lines.join('\n') || '*Ainda não há atividade registrada neste ciclo.*',
    sorted.length > 25 ? `\n-# Exibindo os 25 primeiros de ${sorted.length} participantes.` : '',
  ].filter(Boolean).join('\n'), {
    footer: 'Alta Cúpula • Mov Chat • atualização automática',
    bannerFile: rankBannerPath,
    bannerDescription: 'Rank Mov Chat da Alta Cúpula com tema de corrida',
  });
}

export function movChatResetPrompt(userId: string, cycleStartedAt: Date) {
  return movChatV2([
    '# ⚠️ | ENCERRAR CICLO SEMANAL',
    'Esta ação enviará o relatório completo para a Liderança e iniciará um novo ciclo.',
    '',
    '> **Mensagens e pontos só serão reiniciados depois que o Discord confirmar o envio completo do relatório.**',
  ].join('\n'), {
    footer: 'Alta Cúpula • Mov Chat • confirmação obrigatória',
    rows: [{ type: 1, components: [
      { type: 2, style: 4, custom_id: `movchat:reset:${userId}:${Math.floor(cycleStartedAt.getTime() / 1000)}`, label: 'Enviar relatório e resetar', emoji: { name: '📊' } },
    ] }],
  });
}

export function movChatWeeklyReportMessage(items: MovChatRankingItem[], options: {
  cycleStartedAt: Date;
  cycleEndedAt: Date;
  page: number;
  pages: number;
  trigger: string;
  summary?: { participants: number; messages: number; scoredMessages: number; points: number };
}) {
  const summary = options.summary ?? {
    participants: items.length,
    messages: items.reduce((sum, item) => sum + item.messageCount, 0),
    scoredMessages: items.reduce((sum, item) => sum + item.scoredMessageCount, 0),
    points: items.reduce((sum, item) => sum + totalPoints(item), 0),
  };
  const lines = items.map((item, index) => {
    const position = (options.page - 1) * 15 + index + 1;
    return [
      `**${position}º • <@${item.userId}>**`,
      `└ 💬 **${item.messageCount} mensagens** • 🏆 **${totalPoints(item)} pontos**`,
    ].join('\n');
  });
  return movChatV2([
    '# 📊 | RELATÓRIO SEMANAL — MOV CHAT',
    `**Período:** <t:${Math.floor(options.cycleStartedAt.getTime() / 1000)}:d> até <t:${Math.floor(options.cycleEndedAt.getTime() / 1000)}:d>`,
    `**Encerramento:** ${options.trigger === 'AUTOMATIC' ? 'automático' : 'realizado pela gestão'}`,
    `**Página:** ${options.page}/${options.pages}`,
    '',
    `**Participantes:** ${summary.participants}`,
    `**Mensagens enviadas:** ${summary.messages}`,
    `**Pontuação registrada pela Líder:** ${summary.points}`,
    '',
    '### Desempenho individual',
    lines.join('\n\n') || '*Nenhuma atividade registrada neste ciclo.*',
  ].join('\n'), { footer: 'Liderança Alta • Relatório oficial do Mov Chat' });
}
