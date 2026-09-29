import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ALTA_MOV_CHAT_COMMANDS,
  ALTA_MOV_CHAT_GUILD_ID,
  ALTA_MOV_CHAT_REPORT_CHANNEL_ID,
  ALTA_MOV_CHAT_REPORT_GUILD_ID,
  isAltaMovChatCommand,
} from '../src/alta/movChatConfig.ts';
import {
  movChatConfigMessage,
  movChatMemberMessage,
  movChatResetPrompt,
  movChatWeeklyReportMessage,
} from '../src/alta/movChatMessages.ts';

test('Mov Chat usa os servidores e canal informados e mantém os comandos atuais', () => {
  assert.equal(ALTA_MOV_CHAT_GUILD_ID, '1309533710156169337');
  assert.equal(ALTA_MOV_CHAT_REPORT_GUILD_ID, '1542871650473746454');
  assert.equal(ALTA_MOV_CHAT_REPORT_CHANNEL_ID, '1554586776939794532');
  for (const command of ['!config_chat', '!chat', '!mensagens', '!dar_pontos', '!remover_pontos', '!resetar_chat', '!resetar_rank']) {
    assert.equal(ALTA_MOV_CHAT_COMMANDS.has(command), true);
    assert.equal(isAltaMovChatCommand(`${command} teste`), true);
  }
  assert.equal(isAltaMovChatCommand('!chatinho'), false);
});

test('painéis V2 mostram configuração, desempenho e confirmação unificada', () => {
  const config = JSON.stringify(movChatConfigMessage({ managerRoleId: '10', pointsCooldownSeconds: 10 }, [
    { channelId: '20', pointsPerMessage: 2 },
  ]));
  assert.match(config, /CONFIGURAÇÃO — MOV CHAT/);
  assert.match(config, /<#20>/);
  assert.match(config, /2 ponto\(s\)/);
  assert.match(config, /segunda-feira/);

  const member = JSON.stringify(movChatMemberMessage({
    userId: '30', messageCount: 20, scoredMessageCount: 10, chatPoints: 20, manualPoints: -2,
  }, new Date('2026-09-28T03:05:00.000Z')));
  assert.match(member, /20/);
  assert.match(member, /18/);

  const reset = JSON.stringify(movChatResetPrompt('40', new Date('2026-09-28T03:05:00.000Z')));
  assert.match(reset, /Mensagens e pontos serão reiniciados juntos/);
  assert.match(reset, /movchat:reset:40:/);
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
  assert.match(raw, /70 válidas/);
  assert.match(raw, /75 pts/);
});

test('Angel registra mensagens, comandos, botões e agendador do Mov Chat', async () => {
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleAltaMovChatCommand\(message\)/);
  assert.match(bot, /trackAltaMovChatMessage\(message\)/);
  assert.match(bot, /handleAltaMovChatButton\(interaction\)/);
  assert.match(bot, /startAltaMovChatReports\(connected\)/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  for (const model of ['AltaMovChatConfig', 'AltaMovChatChannel', 'AltaMovChatStat', 'AltaMovChatAdjustment', 'AltaMovChatReport']) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /entriesJson\s+String/);
  assert.match(schema, /status\s+String\s+@default\("PENDING"\)/);
});
