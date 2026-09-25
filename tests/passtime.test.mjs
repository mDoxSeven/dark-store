import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PASSTIME_GUILD_ID, PASSTIME_OWNER_ID, isPasstimeCommand, isPasstimeManager, normalizeDay, validTime,
} from '../src/passtime/config.ts';
import { PASSTIME_IMPLEMENTED_COMMANDS } from '../src/passtime/module.ts';
import { bankRequestMessage, identificationMessage, pointsMessage, teamMessage } from '../src/passtime/messages.ts';

const requested = [
  '!apelido', '!embed', '!logs', '!verificacao', '!clear', '!membersrole', '!anuncio', '!banca',
  '!banca_apagar', '!banca_arquivar', '!banca_desarquivar', '!cronograma', '!lembrete',
  '!atualizar_cronograma', '!limpar_cronograma', '!editar_horarios',
];

test('módulo Passtime fica isolado no servidor e usuário autorizados', () => {
  assert.equal(PASSTIME_GUILD_ID, '1506789977927712808');
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
  assert.match(JSON.stringify(identificationMessage(presentation).components), /identification\.png/);
  assert.match(JSON.stringify(pointsMessage(presentation).components), /points\.png/);
  assert.match(JSON.stringify(teamMessage({ leaderId: null, deputyLeaderId: null, managerId: null, supervisorId: null }, presentation).components), /team\.png/);
});

test('integração do Angel encaminha comandos, botões, formulários e lembretes', async () => {
  const source = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(source, /handlePasstimeCommand\(message\)/);
  assert.match(source, /handlePasstimeButton\(interaction\)/);
  assert.match(source, /handlePasstimeModal\(interaction\)/);
  assert.match(source, /startPasstimeReminders\(connected\)/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  for (const model of ['PasstimeConfig', 'PasstimeBank', 'PasstimeScheduleEntry', 'PasstimeReminder']) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
});
