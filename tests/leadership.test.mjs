import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LEADERSHIP_ADMIN_ROLE_IDS, LEADERSHIP_GUILD_ID, LEADERSHIP_VERIFIED_ROLE_ID,
  isLeadershipCommand, normalizeLeadershipDay, validLeadershipTime,
} from '../src/leadership/config.ts';
import { explanationMessage, formPanel, scheduleMessage, verificationMessage } from '../src/leadership/messages.ts';

test('módulo Liderança usa o servidor, cargo liberado e cargos administrativos informados', () => {
  assert.equal(LEADERSHIP_GUILD_ID, '1542871650473746454');
  assert.equal(LEADERSHIP_VERIFIED_ROLE_ID, '1542876488729108480');
  assert.deepEqual([...LEADERSHIP_ADMIN_ROLE_IDS], [
    '1542873754823032883', '1542876909405216889', '1542873757792731176', '1542873759885820037',
  ]);
  assert.equal(isLeadershipCommand('!criarlideranca'), true);
  assert.equal(isLeadershipCommand('!lideranca_area @Cargo Pass'), true);
  assert.equal(isLeadershipCommand('!liderancada'), false);
});

test('cronograma valida os dias e horários em português', () => {
  assert.equal(normalizeLeadershipDay('terça-feira'), 'terça');
  assert.equal(normalizeLeadershipDay('sabado'), 'sábado');
  assert.equal(validLeadershipTime('22:00'), true);
  assert.equal(validLeadershipTime('25:00'), false);
  const payload = scheduleMessage([{
    id: 'entry', guildId: LEADERSHIP_GUILD_ID, day: 'sábado', time: '16:00', label: 'mov chat',
    roleId: null, position: 0, createdAt: new Date(), updatedAt: new Date(),
  }]);
  const raw = JSON.stringify(payload.components);
  assert.match(raw, /Sábado/);
  assert.doesNotMatch(raw, /Sábado-Feira/);
});

test('painéis Liderança usam Components V2, artes e botões de fluxo', () => {
  const verification = verificationMessage('https://cdn.discordapp.com/verifique.png');
  assert.equal(verification.flags, 32768);
  assert.match(JSON.stringify(verification.components), /leadership:verify/);
  assert.match(JSON.stringify(verification.components), /verifique\.png/);
  assert.match(JSON.stringify(formPanel('rpp').components), /leadership:open:rpp/);
  const explanation = explanationMessage({
    schedule: '1', rpp: '2', justification: '3', suggestions: '4', bot: '5', reports: '6', ups: '7', highlights: '8', evaluation: '9',
  });
  assert.match(JSON.stringify(explanation.components), /<\#1>/);
  assert.match(JSON.stringify(explanation.components), /relatórios, upamentos e destaques/);
});

test('Angel encaminha comandos, botões e formulários da Liderança', async () => {
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleLeadershipCommand\(message\)/);
  assert.match(bot, /handleLeadershipButton\(interaction\)/);
  assert.match(bot, /handleLeadershipModal\(interaction\)/);
  assert.match(bot, /LEADERSHIP_GUILD_ID/);
  const module = await readFile(new URL('../src/leadership/module.ts', import.meta.url), 'utf8');
  assert.match(module, /discoverArts/);
  assert.match(module, /publishOrUpdate/);
  assert.match(module, /target\.roles\.add\(config\.verifiedRoleId/);
  assert.match(module, /duration < 7 \|\| duration > 30/);
});

test('banco mantém configuração, solicitações, áreas e cronograma da Liderança', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  for (const model of ['LeadershipConfig', 'LeadershipRequest', 'LeadershipArea', 'LeadershipScheduleEntry']) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /verifiedRoleId\s+String/);
  assert.match(schema, /adminRoleIdsJson\s+String/);
});
