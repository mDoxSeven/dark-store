import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ALTA_GUILD_ID } from '../src/alta/rise.ts';
import {
  ALTA_RECRUITMENT_CHANNEL_ID, ALTA_RECRUITMENT_FAMILIES, ALTA_RECRUITMENT_RANKS,
  ALTA_RECRUITMENT_RECORDS_CHANNEL_ID, ALTA_RECRUITMENT_ROLE_ID,
  altaRecruitmentCommand, buildAltaRecruitmentRecord,
} from '../src/alta/recruitment.ts';

test('/rec do Angel fica restrito ao servidor, canal e cargo de Recrutamento da Alta', () => {
  assert.equal(ALTA_GUILD_ID, '1309533710156169337');
  assert.equal(ALTA_RECRUITMENT_CHANNEL_ID, '1514841820947939508');
  assert.equal(ALTA_RECRUITMENT_RECORDS_CHANNEL_ID, '1514841659194736650');
  assert.equal(ALTA_RECRUITMENT_ROLE_ID, '1417338258815193219');
  assert.deepEqual(ALTA_RECRUITMENT_RANKS.map(rank => rank.name), ['Born', 'Featured', 'Purple']);
  assert.deepEqual([...ALTA_RECRUITMENT_FAMILIES], ['Turquia', 'Nyx', 'Elite', 'Dragons']);
  const command = altaRecruitmentCommand.toJSON();
  assert.equal(command.name, 'rec');
  assert.equal(command.options?.[0]?.name, 'recrutado');
  assert.equal(command.options?.[0]?.required, true);
});

test('ficha REC usa Components V2, avatar e o modelo informado', () => {
  const payload = buildAltaRecruitmentRecord({
    recruiterId: '1002774556269891694', targetId: '969594840063037450', rankDisplay: 'Born',
    cameFromFamily: true, previousFamily: 'Nyx', avatarUrl: 'https://cdn.discordapp.com/avatar.png',
  });
  assert.equal(payload.flags, 32768);
  const raw = JSON.stringify(payload.components);
  assert.match(raw, /FICHA DE RECRUTAMENTO/);
  assert.match(raw, /1002774556269891694/);
  assert.match(raw, /969594840063037450/);
  assert.match(raw, /Born/);
  assert.match(raw, /Nyx/);
  assert.match(raw, /avatar\.png/);
});

test('Angel aplica o cargo, publica a ficha e espelha no relatório de Recrutamento', async () => {
  const source = await readFile(new URL('../src/alta/recruitment.ts', import.meta.url), 'utf8');
  assert.match(source, /roles\.cache\.has\(ALTA_RECRUITMENT_ROLE_ID\)/);
  assert.match(source, /target\.roles\.add\(selected\.role/);
  assert.match(source, /target\.roles\.remove\(oldRanks/);
  assert.match(source, /channels\.fetch\(ALTA_RECRUITMENT_RECORDS_CHANNEL_ID\)/);
  assert.match(source, /prisma\.leadershipArea\.findUnique/);
  assert.match(source, /item\.key === 'recrutamento'/);
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /executeAltaRecruitmentCommand\(interaction\)/);
  assert.match(bot, /handleAltaRecruitmentSelect\(interaction\)/);
  assert.match(bot, /altaRecruitmentCommand\.toJSON\(\)/);
});
