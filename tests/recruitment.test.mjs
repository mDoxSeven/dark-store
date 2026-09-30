import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ALTA_GUILD_ID } from '../src/alta/rise.ts';
import {
  ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID, ALTA_RECRUITMENT_CHANNEL_ID, ALTA_RECRUITMENT_FAMILIES,
  ALTA_RECRUITMENT_RANKS, ALTA_RECRUITMENT_RECORDS_CHANNEL_ID, ALTA_RECRUITMENT_ROLE_ID,
  ALTA_RECRUITMENT_VALIDATOR_IDS, altaRecruitmentCommand, altaRecruitmentReportCommand,
  altaRecruitmentResetCommand, buildAltaRecruitmentAnnouncement, buildAltaRecruitmentRecord,
  recruitmentStaffAreas,
} from '../src/alta/recruitment.ts';
import { syncRecruitmentEmojis, recEmoji } from '../src/alta/recruitmentEmojis.ts';

test('staff aceita várias áreas e rejeita valores desconhecidos ou duplicados', () => {
  assert.deepEqual(recruitmentStaffAreas(['mov-chat', 'design']), ['Mov Chat', 'Design']);
  for (const values of [[], ['admin'], ['design', 'design']]) assert.throws(() => recruitmentStaffAreas(values));
});

test('ficha distingue interesse, ausência de interesse e registros antigos', () => {
  const base = { recruiterId: '1', targetId: '2', rankDisplay: 'Born', cameFromFamily: false, previousFamily: null };
  const yes = JSON.stringify(buildAltaRecruitmentRecord({ ...base, staffInterest: true, staffAreas: ['Design', 'Eventos'], status: 'APPROVED', reviewerId: '3' }));
  assert.match(yes, /Design, Eventos/);
  assert.match(yes, /Validado/);
  assert.match(yes, /<@3>/);
  const no = JSON.stringify(buildAltaRecruitmentRecord({ ...base, staffInterest: false }));
  assert.match(no, /interesse na staff\?\*\* Não/);
  assert.doesNotMatch(no, /áreas de interesse/);
  assert.match(JSON.stringify(buildAltaRecruitmentRecord(base)), /Não informado/);
});

test('emojis são criados uma vez na Liderança e reutilizados nas fichas', async () => {
  const emojis = [];
  let created = 0;
  const guild = { emojis: {
    fetch: async () => emojis,
    create: async ({ name }) => {
      const id = String(1000 + created++);
      const emoji = { name, toString: () => `<:${name}:${id}>` };
      emojis.push(emoji);
      return emoji;
    },
  } };
  const client = { guilds: { fetch: async id => { assert.equal(id, '1542871650473746454'); return guild; } } };
  await syncRecruitmentEmojis(client);
  await syncRecruitmentEmojis(client);
  assert.equal(created, 6);
  assert.match(recEmoji('clipboard'), /^<:alta_rec_chrome_clipboard:/);
});

test('/rec do Angel fica restrito ao servidor, canal e cargo de Recrutamento da Alta', () => {
  assert.equal(ALTA_GUILD_ID, '1309533710156169337');
  assert.equal(ALTA_RECRUITMENT_CHANNEL_ID, '1514841820947939508');
  assert.equal(ALTA_RECRUITMENT_RECORDS_CHANNEL_ID, '1514841659194736650');
  assert.equal(ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID, '1516279462931595385');
  assert.equal(ALTA_RECRUITMENT_ROLE_ID, '1417338258815193219');
  assert.deepEqual([...ALTA_RECRUITMENT_VALIDATOR_IDS], [
    '446428192220119041', '1251718254729232516', '1002774556269891694',
  ]);
  assert.deepEqual(ALTA_RECRUITMENT_RANKS.map(rank => rank.name), ['Born', 'Featured', 'Purple']);
  assert.deepEqual([...ALTA_RECRUITMENT_FAMILIES], ['Turquia', 'Nyx', 'Elite', 'Dragons']);
  const command = altaRecruitmentCommand.toJSON();
  assert.equal(command.name, 'rec');
  assert.equal(command.options?.[0]?.name, 'recrutado');
  assert.equal(command.options?.[0]?.required, true);
  assert.equal(altaRecruitmentReportCommand.toJSON().name, 'relatoriorec');
  const reset = altaRecruitmentResetCommand.toJSON();
  assert.equal(reset.name, 'resetrec');
  assert.equal(reset.options?.[0]?.name, 'confirmar');
  assert.equal(reset.options?.[0]?.required, true);
  assert.equal(reset.options?.[1]?.name, 'membro');
  assert.notEqual(reset.options?.[1]?.required, true);
});

test('ficha REC pendente usa Components V2, avatar e botões de análise', () => {
  const payload = buildAltaRecruitmentRecord({
    recruitmentId: 'rec-123',
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
  assert.match(raw, /Aguardando validação/);
  assert.match(raw, /angel:rec:review:approve:rec-123/);
  assert.match(raw, /angel:rec:review:reject:rec-123/);
});

test('aviso V2 apresenta o fluxo e menciona somente o cargo de recrutamento', () => {
  const payload = buildAltaRecruitmentAnnouncement();
  const raw = JSON.stringify(payload);
  assert.match(raw, /NOVO SISTEMA DE RECRUTAMENTO/);
  assert.match(raw, /\/relatoriorec/);
  assert.match(raw, /\/resetrec/);
  assert.deepEqual(payload.allowedMentions?.roles, [ALTA_RECRUITMENT_ROLE_ID]);
});

test('Angel valida antes de aplicar cargo, contabiliza aprovados e integra a Liderança', async () => {
  const source = await readFile(new URL('../src/alta/recruitment.ts', import.meta.url), 'utf8');
  assert.match(source, /roles\.cache\.has\(ALTA_RECRUITMENT_ROLE_ID\)/);
  assert.match(source, /assertValidator\(interaction\.user\.id\)/);
  assert.match(source, /status: 'PENDING'/);
  assert.match(source, /status === 'APPROVED'/);
  assert.match(source, /status: 'APPROVED', active: true/);
  assert.match(source, /data: \{ active: false \}/);
  assert.match(source, /target\.roles\.add\(selected\.role/);
  assert.match(source, /target\.roles\.remove\(oldRanks/);
  assert.match(source, /channels\.fetch\(ALTA_RECRUITMENT_RECORDS_CHANNEL_ID\)/);
  assert.match(source, /prisma\.leadershipArea\.findUnique/);
  assert.match(source, /item\.key === 'recrutamento'/);
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /executeAltaRecruitmentCommand\(interaction\)/);
  assert.match(bot, /executeAltaRecruitmentReport\(interaction\)/);
  assert.match(bot, /executeAltaRecruitmentReset\(interaction\)/);
  assert.match(bot, /handleAltaRecruitmentButton\(interaction\)/);
  assert.match(bot, /handleAltaRecruitmentSelect\(interaction\)/);
  assert.match(bot, /altaRecruitmentCommand\.toJSON\(\)/);
  assert.match(bot, /altaRecruitmentReportCommand\.toJSON\(\)/);
  assert.match(bot, /altaRecruitmentResetCommand\.toJSON\(\)/);
  assert.match(bot, /refreshAltaRecruitmentAnnouncement\(connected\)/);

  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model AltaRecruitmentConfig/);
  assert.match(schema, /model AltaRecruitment/);
  assert.match(schema, /status\s+String\s+@default\("PENDING"\)/);
  assert.match(schema, /active\s+Boolean\s+@default\(true\)/);
});
