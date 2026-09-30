import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ALTA_MOV_CHAT_COMMANDS,
  ALTA_MOV_CHAT_GUILD_ID,
  ALTA_MOV_CHAT_LEADER_ROLE_ID,
  ALTA_MOV_CHAT_REPORT_CHANNEL_ID,
  ALTA_MOV_CHAT_REPORT_GUILD_ID,
  isAltaMovChatCommand,
} from '../src/alta/movChatConfig.ts';
import { currentBrazilReportBoundary } from '../src/alta/movChat.ts';
import {
  movChatConfigMessage,
  movChatCleanupMessage,
  movChatMemberMessage,
  movChatResetPrompt,
  movChatWeeklyReportMessage,
} from '../src/alta/movChatMessages.ts';

test('Mov Chat usa os servidores e canal informados e mantém os comandos atuais', () => {
  assert.equal(ALTA_MOV_CHAT_GUILD_ID, '1309533710156169337');
  assert.equal(ALTA_MOV_CHAT_REPORT_GUILD_ID, '1542871650473746454');
  assert.equal(ALTA_MOV_CHAT_REPORT_CHANNEL_ID, '1554586776939794532');
  assert.equal(ALTA_MOV_CHAT_LEADER_ROLE_ID, '1514152283380781157');
  for (const command of ['!config_chat', '!chat', '!mensagens', '!dar_pontos', '!remover_pontos', '!resetar_chat', '!resetar_rank', '!limpeza_chat']) {
    assert.equal(ALTA_MOV_CHAT_COMMANDS.has(command), true);
    assert.equal(isAltaMovChatCommand(`${command} teste`), true);
  }
  assert.equal(isAltaMovChatCommand('!chatinho'), false);
});

test('fechamento semanal ocorre sábado às 16:00 no horário de Brasília', () => {
  const boundary = currentBrazilReportBoundary(new Date('2026-10-03T18:59:00.000Z'));
  assert.equal(boundary.toISOString(), '2026-10-03T19:00:00.000Z');
  assert.equal(currentBrazilReportBoundary(new Date('2026-10-03T19:30:00.000Z')).toISOString(), '2026-10-03T19:00:00.000Z');
});

test('painéis V2 mostram configuração, desempenho e confirmação unificada', () => {
  const config = JSON.stringify(movChatConfigMessage({ managerRoleId: '10', pointsCooldownSeconds: 10 }, [
    { channelId: '20', pointsPerMessage: 2 },
  ]));
  assert.match(config, /MOV CHAT — ALTA/);
  assert.match(config, /<#20>/);
  assert.match(config, /pontuação de participação é adicionada pela Líder/);
  assert.match(config, /sábado/);
  assert.match(config, /16:00/);
  assert.match(config, /!chat/);
  assert.match(config, /!mensagens/);
  assert.doesNotMatch(config, /!resetar_rank/);

  const member = JSON.stringify(movChatMemberMessage({
    userId: '30', messageCount: 20, scoredMessageCount: 10, chatPoints: 20, manualPoints: -2,
  }, new Date('2026-09-28T03:05:00.000Z')));
  assert.match(member, /20/);
  assert.match(member, /18/);
  assert.doesNotMatch(member, /Mensagens pontuadas/);
  assert.doesNotMatch(member, /Pontos do chat/);

  const reset = JSON.stringify(movChatResetPrompt('40', new Date('2026-09-28T03:05:00.000Z')));
  assert.match(reset, /só serão reiniciados depois que o Discord confirmar/);
  assert.match(reset, /movchat:reset:40:/);

  const cleanup = JSON.stringify(movChatCleanupMessage([{
    channelId: '20', status: 'RUNNING', deletedCount: 12, skippedPinnedCount: 2, skippedOtherCount: 1,
    cutoffAt: new Date('2026-10-03T19:00:00.000Z'), lastError: null,
  }]));
  assert.match(cleanup, /LIMPEZA SEGURA — MOV CHAT/);
  assert.match(cleanup, /uma mensagem antiga.*cada 2 segundos/i);
  assert.match(cleanup, /fixadas preservadas/);
});

test('relatório semanal lista métricas individuais e usa Components V2', () => {
  const report = movChatWeeklyReportMessage([{
    userId: '50', messageCount: 100, scoredMessageCount: 70, chatPoints: 70, manualPoints: 5,
  }], {
    cycleStartedAt: new Date('2026-09-21T03:05:00.000Z'),
    cycleEndedAt: new Date('2026-09-28T03:05:00.000Z'),
    page: 1,
    pages: 1,
    trigger: 'AUTOMATIC',
  });
  assert.equal(report.flags, 32768);
  const raw = JSON.stringify(report);
  assert.match(raw, /RELATÓRIO SEMANAL — MOV CHAT/);
  assert.match(raw, /100 mensagens/);
  assert.match(raw, /75 pontos/);
});

test('Angel registra mensagens, comandos, botões e agendador do Mov Chat', async () => {
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleAltaMovChatCommand\(message\)/);
  assert.match(bot, /trackAltaMovChatMessage\(message\)/);
  assert.match(bot, /handleAltaMovChatButton\(interaction\)/);
  assert.match(bot, /startAltaMovChatReports\(connected\)/);
  assert.match(bot, /startAltaMovChatCleanup\(connected\)/);
  assert.match(bot, /applyAltaMovChatPolicy\(\)/);
  const module = await readFile(new URL('../src/alta/movChat.ts', import.meta.url), 'utf8');
  assert.match(module, /member\.roles\.cache\.has\(ALTA_MOV_CHAT_LEADER_ROLE_ID\)/);
  assert.doesNotMatch(module, /PermissionFlagsBits\.Administrator/);
  assert.match(module, /const user = message\.author/);
  assert.match(module, /command === '!mensagens'\) await memberStats\(message\)/);
  assert.match(module, /data: \{ scoredMessageCount: 0, chatPoints: 0, lastScoredAt: null \}/);
  assert.match(module, /item => !item\.pinned && item\.deletable/);
  assert.match(module, /SnowflakeUtil\.generate/);
  assert.match(module, /before: job\.scanBeforeId/);
  assert.match(module, /orderBy: \[\{ createdAt: 'asc' \}/);
  assert.match(module, /ALTA_MOV_CHAT_CLEANUP_INTERVAL_MS/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  for (const model of ['AltaMovChatConfig', 'AltaMovChatChannel', 'AltaMovChatStat', 'AltaMovChatAdjustment', 'AltaMovChatReport', 'AltaMovChatCleanup', 'AltaMovChatCleanupItem']) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /entriesJson\s+String/);
  assert.match(schema, /status\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /pointsPerMessage\s+Int\s+@default\(0\)/);
});
