import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PASSTIME_ACCENT, PASSTIME_ACTIVITIES, PASSTIME_GUILD_ID, PASSTIME_OWNER_ID, PASSTIME_RANK_CHANNEL_ID, PASSTIME_SCHEDULE_SLOTS,
  PASSTIME_TIME_ZONE, PASSTIME_USER_SCHEDULE_LIMIT, isPasstimeCommand, isPasstimeManager,
  normalizeDay, passtimeScheduleTime, saoPauloClock, validTime,
} from '../src/passtime/config.ts';
import { PASSTIME_IMPLEMENTED_COMMANDS } from '../src/passtime/module.ts';
import {
  bankRequestMessage, editorialPasstimeMessage, identificationMessage, pointsMessage, rankResetConfirmation, rankingMessage,
  scheduleActivityPicker, scheduleDayPicker, scheduleMessage, scheduleSlotPicker, teamMessage, verificationMessage,
} from '../src/passtime/messages.ts';

const requested = [
  '!apelido', '!embed', '!logs', '!verificacao', '!clear', '!membersrole', '!anuncio', '!banca',
  '!banca_apagar', '!banca_arquivar', '!banca_desarquivar', '!cronograma', '!lembrete',
  '!atualizar_cronograma', '!limpar_cronograma', '!editar_horarios',
  '!rank_passtime', '!rank', '!pontos', '!dar_pontos', '!remover_pontos', '!resetar_rank',
];

test('módulo Passtime fica isolado no servidor e usuário autorizados', () => {
  assert.equal(PASSTIME_GUILD_ID, '1506789977927712808');
  assert.equal(PASSTIME_RANK_CHANNEL_ID, '1524346776033693716');
  assert.equal(PASSTIME_OWNER_ID, '1002774556269891694');
  assert.equal(isPasstimeManager('1002774556269891694'), true);
  assert.equal(isPasstimeManager('1516915772192985088'), true);
  assert.equal(isPasstimeManager('1516915772192985000'), false);
  for (const command of requested) assert.ok(PASSTIME_IMPLEMENTED_COMMANDS.includes(command), command);
  assert.ok(PASSTIME_IMPLEMENTED_COMMANDS.includes('!passtime'));
  assert.ok(PASSTIME_IMPLEMENTED_COMMANDS.includes('!equipe'));
  assert.equal(isPasstimeCommand('!banca'), true);
  assert.equal(isPasstimeCommand('!banca teste'), true);
  assert.equal(isPasstimeCommand('!bancaria'), false);
});

test('cronograma aceita dias em português e horário de 24 horas', () => {
  assert.equal(normalizeDay('terça-feira'), 'terça');
  assert.equal(normalizeDay('sabado'), 'sábado');
  assert.equal(validTime('23:59'), true);
  assert.equal(validTime('24:00'), false);
  assert.equal(PASSTIME_TIME_ZONE, 'America/Sao_Paulo');
  assert.deepEqual(saoPauloClock(new Date('2026-10-05T02:30:00.000Z')), {
    date: '2026-10-04', time: '23:30', day: 'domingo',
  });
  assert.equal(PASSTIME_USER_SCHEDULE_LIMIT, 2);
  assert.equal(PASSTIME_SCHEDULE_SLOTS.length, 4);
  assert.equal(passtimeScheduleTime('09:30'), '09h30 – 11h30');
});

test('cronograma oferece autoagendamento, consulta, cancelamento e atualização', () => {
  assert.ok(PASSTIME_ACTIVITIES.some(activity => activity.value === 'alta-opina'));
  assert.ok(PASSTIME_ACTIVITIES.some(activity => activity.value === 'cafe-com-fofoca'));
  const payload = scheduleMessage([{
    id: 'entry-1', guildId: PASSTIME_GUILD_ID, day: 'segunda', time: '09:30', label: 'Alta Opina',
    userId: '1002774556269891694', activityKey: 'alta-opina', reminderMinutes: 120,
    lastReminderKey: null, lastStartKey: null, position: 0, createdAt: new Date(), updatedAt: new Date(),
  }]);
  const raw = JSON.stringify(payload.components);
  assert.match(raw, /passtime:schedule:action/);
  assert.match(raw, /Agendar atividade/);
  assert.match(raw, /Meus horários/);
  assert.match(raw, /Cancelar horário/);
  assert.match(raw, /Editar cronograma/);
  assert.match(raw, /Limpar cronograma/);
  assert.match(raw, /1002774556269891694/);
  assert.match(raw, /Responsável/);
  assert.match(raw, /09h30 – 11h30/);

  const day = JSON.stringify(scheduleDayPicker([{
    id: 'entry-1', guildId: PASSTIME_GUILD_ID, day: 'segunda', time: '09:30', label: 'Alta Opina',
    userId: '1002774556269891694', activityKey: 'alta-opina', reminderMinutes: 120,
    lastReminderKey: null, lastStartKey: null, position: 0, createdAt: new Date(), updatedAt: new Date(),
  }], '123456789012345678').components);
  assert.match(day, /123456789012345678/);
  assert.match(day, /1\/2/);

  const slots = JSON.stringify(scheduleSlotPicker(0, new Set(['09:30'])).components);
  assert.doesNotMatch(slots, /09h30/);
  assert.match(slots, /12h00/);
  const activity = JSON.stringify(scheduleActivityPicker(0, 'tarde-1', PASSTIME_ACTIVITIES).components);
  assert.match(activity, /passtime:schedule:activity:0:tarde-1/);
});

test('painéis Passtime usam Components V2, botão cinza e artes configuráveis', () => {
  const presentation = {
    minionEmoji: '<:minion:123>',
    yellowEmoji: '<:vrz_yellow13:456>',
    requestBannerUrl: 'https://cdn.discordapp.com/request.png',
    identificationBannerUrl: 'https://cdn.discordapp.com/identification.png',
    pointsBannerUrl: 'https://cdn.discordapp.com/points.png',
    teamBannerUrl: 'https://cdn.discordapp.com/team.png',
  };
  const request = bankRequestMessage(presentation);
  assert.equal(request.flags, 32768);
  const raw = JSON.stringify(request.components);
  assert.match(raw, /request\.png/);
  assert.match(raw, /"style":2/);
  assert.match(raw, /passtime:bank:open/);
  assert.match(JSON.stringify(verificationMessage().components), /attachment:\/\/verification\.png/);
  assert.match(JSON.stringify(identificationMessage(presentation).components), /attachment:\/\/bank-organization\.png/);
  assert.match(JSON.stringify(pointsMessage(presentation).components), /points\.png/);
  assert.match(JSON.stringify(teamMessage({ leaderId: null, deputyLeaderId: null, managerId: null, supervisorId: null }, presentation).components), /attachment:\/\/team\.png/);
  assert.equal(PASSTIME_ACCENT, 0xff8f9b);
});

test('reformulação cute usa cada arte no painel V2 correspondente', () => {
  const config = {
    requestChannelId: '1', scheduleChannelId: '2', identificationChannelId: '3', pointsChannelId: '4',
    rankChannelId: '5', teamChannelId: '6',
  };
  const expected = new Map([
    ['notices', 'notices.png'], ['guide', 'guide.png'], ['server-decoration', 'server-decoration.png'],
    ['tutorials', 'tutorials.png'], ['warnings', 'warnings.png'], ['management-drafts', 'management-drafts.png'],
  ]);
  for (const [key, file] of expected) {
    const payload = editorialPasstimeMessage(key, config);
    assert.match(JSON.stringify(payload.components), new RegExp(`attachment://.*${file.replace('.', '\\.')}"`));
    assert.equal(payload.files?.[0]?.name, file);
  }
  assert.equal(rankingMessage([], new Date()).files?.[0]?.name, 'highlights.png');
  assert.equal(verificationMessage().files?.[0]?.name, 'verification.png');
  assert.equal(identificationMessage().files?.[0]?.name, 'bank-organization.png');
  assert.equal(teamMessage({ leaderId: null, deputyLeaderId: null, managerId: null, supervisorId: null }).files?.[0]?.name, 'team.png');
});

test('ranking Passtime exibe colocação, consulta individual e reset protegido', () => {
  const payload = rankingMessage([
    { userId: '1002774556269891694', points: 40 },
    { userId: '1516915772192985088', points: 25 },
  ], new Date('2026-10-05T12:00:00.000Z'));
  const raw = JSON.stringify(payload.components);
  assert.match(raw, /Destaques Passtime/);
  assert.match(raw, /1002774556269891694/);
  assert.match(raw, /40 pts/);
  assert.match(raw, /passtime:rank:mine/);
  assert.match(raw, /passtime:rank:refresh/);

  const reset = JSON.stringify(rankResetConfirmation('1002774556269891694', 2, 65).components);
  assert.match(reset, /passtime:rank:reset-confirm:1002774556269891694/);
  assert.match(reset, /65 ponto/);
});

test('integração do Angel encaminha comandos, botões, formulários e lembretes', async () => {
  const source = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(source, /handlePasstimeCommand\(message\)/);
  assert.match(source, /handlePasstimeButton\(interaction\)/);
  assert.match(source, /handlePasstimeModal\(interaction\)/);
  assert.match(source, /handlePasstimeSelect\(interaction\)/);
  assert.match(source, /startPasstimeReminders\(connected\)/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  for (const model of ['PasstimeConfig', 'PasstimeBank', 'PasstimeScheduleEntry', 'PasstimeReminder', 'PasstimeScore', 'PasstimePointLog', 'PasstimePanel']) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /lastReminderKey\s+String\?/);
  assert.match(schema, /lastStartKey\s+String\?/);
  assert.match(schema, /rankCycleStartedAt\s+DateTime/);
});

test('agendamento atualiza o painel e dispara alertas automáticos', async () => {
  const source = await readFile(new URL('../src/passtime/module.ts', import.meta.url), 'utf8');
  assert.match(source, /await refreshSchedule\(interaction\.guild\)/);
  assert.match(source, /dispatchPasstimeScheduleAlerts/);
  assert.match(source, /entry\.reminderMinutes \* 60_000/);
  assert.match(source, /lastReminderKey/);
  assert.match(source, /lastStartKey/);
  assert.match(source, /scheduleEditModal/);
  assert.match(source, /scheduleClearConfirm/);
  assert.match(source, /await refreshLinkedLeadershipSchedule\(guild\.client\)/);
  assert.match(source, /Digite CONFIRMO para reservar/);
  assert.match(source, /PASSTIME_USER_SCHEDULE_LIMIT/);
  assert.match(source, /scheduleBookingLocks/);
  assert.match(source, /if \(running\) return/);
});

test('ranking persiste pontos, histórico e sincroniza o painel', async () => {
  const source = await readFile(new URL('../src/passtime/module.ts', import.meta.url), 'utf8');
  assert.match(source, /prisma\.passtimeScore/);
  assert.match(source, /prisma\.passtimePointLog/);
  assert.match(source, /changePasstimePoints/);
  assert.match(source, /refreshRank/);
  assert.match(source, /rankResetConfirm/);
  assert.match(source, /PASSTIME_EDITORIAL_PANELS/);
  assert.match(source, /prisma\.passtimePanel/);
});
