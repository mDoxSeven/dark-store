import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction, type Client, type Guild, type GuildMember,
  type MessageCreateOptions, type MessageEditOptions, type Role, type StringSelectMenuInteraction,
} from 'discord.js';
import type { AltaRecruitment } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { LEADERSHIP_AREAS, LEADERSHIP_GUILD_ID } from '../leadership/config.js';
import { ALTA_GUILD_ID } from './rise.js';

export const ALTA_RECRUITMENT_PREFIX = 'angel:rec:';
export const ALTA_RECRUITMENT_CHANNEL_ID = '1514841820947939508';
export const ALTA_RECRUITMENT_RECORDS_CHANNEL_ID = '1514841659194736650';
export const ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID = '1516279462931595385';
export const ALTA_RECRUITMENT_ROLE_ID = '1417338258815193219';
export const ALTA_RECRUITMENT_ACCENT = 0x7a163d;
export const ALTA_RECRUITMENT_VALIDATOR_IDS = [
  '446428192220119041',
  '1251718254729232516',
  '1002774556269891694',
] as const;

export const ALTA_RECRUITMENT_RANKS = [
  { key: 'born', name: 'Born', emoji: '🌱' },
  { key: 'featured', name: 'Featured', emoji: '⭐' },
  { key: 'purple', name: 'Purple', emoji: '💜' },
] as const;

export const ALTA_RECRUITMENT_FAMILIES = ['Turquia', 'Nyx', 'Elite', 'Dragons'] as const;

type ApiComponent = Record<string, unknown>;
const separator = { type: 14, divider: true, spacing: 1 };

function recruitmentV2(content: string, options: {
  ephemeral?: boolean;
  rows?: ApiComponent[];
  thumbnailUrl?: string;
  accentColor?: number;
  allowedUsers?: string[];
  allowedRoles?: string[];
} = {}): MessageCreateOptions {
  const children: ApiComponent[] = [];
  if (options.thumbnailUrl) {
    children.push({
      type: 9,
      components: [{ type: 10, content }],
      accessory: { type: 11, media: { url: options.thumbnailUrl }, description: 'Avatar do recrutado' },
    });
  } else children.push({ type: 10, content });
  if (options.rows?.length) children.push(separator, ...options.rows);
  children.push(separator, { type: 10, content: '-# Alta Cúpula • Recrutamento' });
  return {
    flags: 32768 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: { parse: [], users: options.allowedUsers ?? [], roles: options.allowedRoles ?? [] },
    components: [{ type: 17, accent_color: options.accentColor ?? ALTA_RECRUITMENT_ACCENT, components: children }],
  } as unknown as MessageCreateOptions;
}

const semanticName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');

function assertAlta(guildId: string | null, channelId: string) {
  if (guildId !== ALTA_GUILD_ID) throw new Error('O `/rec` funciona somente no servidor oficial da Alta.');
  if (channelId !== ALTA_RECRUITMENT_CHANNEL_ID) throw new Error(`Use o comando no canal <#${ALTA_RECRUITMENT_CHANNEL_ID}>.`);
}

function assertAltaRecruitmentRecord(guildId: string | null, channelId: string) {
  if (guildId !== ALTA_GUILD_ID) throw new Error('Esta ficha pertence ao servidor oficial da Alta.');
  if (channelId !== ALTA_RECRUITMENT_RECORDS_CHANNEL_ID) throw new Error('Use os botões somente na ficha original de recrutamento.');
}

function assertRecruiter(member: GuildMember) {
  if (!member.roles.cache.has(ALTA_RECRUITMENT_ROLE_ID)) {
    throw new Error(`Somente membros do cargo <@&${ALTA_RECRUITMENT_ROLE_ID}> podem usar o \`/rec\`.`);
  }
}

export const isAltaRecruitmentValidator = (userId: string) => ALTA_RECRUITMENT_VALIDATOR_IDS.includes(userId as typeof ALTA_RECRUITMENT_VALIDATOR_IDS[number]);

function assertRecruitmentAccess(member: GuildMember) {
  if (!member.roles.cache.has(ALTA_RECRUITMENT_ROLE_ID) && !isAltaRecruitmentValidator(member.id)) {
    throw new Error('Você não possui acesso ao sistema de recrutamento.');
  }
}

function assertValidator(userId: string) {
  if (!isAltaRecruitmentValidator(userId)) throw new Error('Somente os validadores autorizados podem usar esta função.');
}

export async function altaRecruitmentRankRoles(guild: Guild) {
  const roles = await guild.roles.fetch();
  const result: Array<{ key: typeof ALTA_RECRUITMENT_RANKS[number]['key']; name: string; emoji: string; role: Role }> = [];
  const used = new Set<string>();
  for (const rank of ALTA_RECRUITMENT_RANKS) {
    const wanted = semanticName(rank.name);
    const role = roles.find(candidate => !used.has(candidate.id) && semanticName(candidate.name) === wanted)
      ?? roles.find(candidate => !used.has(candidate.id) && semanticName(candidate.name).includes(wanted));
    if (!role) throw new Error(`O cargo inicial **${rank.name}** não foi encontrado no servidor.`);
    if (role.managed || !role.editable) throw new Error(`O cargo **${role.name}** precisa ficar abaixo do cargo do Angel.`);
    used.add(role.id);
    result.push({ ...rank, role });
  }
  return result;
}

function selectRow(customId: string, placeholder: string, options: ApiComponent[]): ApiComponent {
  return {
    type: 1,
    components: [{ type: 3, custom_id: customId, placeholder, min_values: 1, max_values: 1, options }],
  };
}

export const altaRecruitmentCommand = new SlashCommandBuilder()
  .setName('rec')
  .setDescription('Registra um novo recrutado na equipe da Alta.')
  .setDMPermission(false)
  .addUserOption(option => option
    .setName('recrutado')
    .setDescription('Membro ou ID da pessoa recrutada')
    .setRequired(true));

export const altaRecruitmentReportCommand = new SlashCommandBuilder()
  .setName('relatoriorec')
  .setDescription('Mostra os recrutamentos válidos por recrutador.')
  .setDMPermission(false)
  .addUserOption(option => option
    .setName('membro')
    .setDescription('Recrutador específico; deixe vazio para ver o ranking geral'));

export const altaRecruitmentResetCommand = new SlashCommandBuilder()
  .setName('resetrec')
  .setDescription('Reinicia as estatísticas de recrutamento preservando o histórico.')
  .setDMPermission(false)
  .addUserOption(option => option
    .setName('membro')
    .setDescription('Recrutador específico; deixe vazio para resetar todos'))
  .addBooleanOption(option => option
    .setName('confirmar')
    .setDescription('Confirma o reset das estatísticas selecionadas')
    .setRequired(true));

export async function executeAltaRecruitmentCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) throw new Error('Use este comando dentro do servidor.');
  assertAlta(interaction.guildId, interaction.channelId);
  assertRecruiter(interaction.member);
  const target = interaction.options.getMember('recrutado');
  if (!target) throw new Error('O membro recrutado não foi encontrado no servidor.');
  if (target.user.bot) throw new Error('Bots não podem ser registrados como recrutados.');
  if (target.id === interaction.user.id) throw new Error('Você não pode recrutar a si mesmo.');

  const ranks = await altaRecruitmentRankRoles(interaction.guild);
  const row = selectRow(
    `${ALTA_RECRUITMENT_PREFIX}rank:${interaction.user.id}:${target.id}`,
    'Selecione o cargo inicial',
    ranks.map(rank => ({
      label: rank.name, description: `Aplicar o cargo ${rank.role.name}`, value: rank.role.id, emoji: { name: rank.emoji },
    })),
  );
  await interaction.reply(recruitmentV2(
    `# ♡ | NOVO RECRUTAMENTO\n**Recrutado:** <@${target.id}>\nEscolha o primeiro cargo da hierarquia que será aplicado.`,
    { ephemeral: true, rows: [row] },
  ) as any);
}

function parseCustomId(customId: string) {
  const parts = customId.split(':');
  return { step: parts[2] ?? '', recruiterId: parts[3] ?? '', targetId: parts[4] ?? '', rankRoleId: parts[5] ?? '' };
}

async function validateStep(interaction: StringSelectMenuInteraction) {
  if (!interaction.inCachedGuild()) throw new Error('Interação fora do servidor.');
  assertAlta(interaction.guildId, interaction.channelId);
  assertRecruiter(interaction.member);
  const parsed = parseCustomId(interaction.customId);
  if (parsed.recruiterId !== interaction.user.id) throw new Error('Esta ficha pertence a outro recrutador.');
  const target = await interaction.guild.members.fetch(parsed.targetId).catch(() => null);
  if (!target || target.user.bot) throw new Error('O recrutado não está mais disponível no servidor.');
  return { ...parsed, target };
}

export function buildAltaRecruitmentRecord(options: {
  recruitmentId?: string;
  recruiterId: string;
  targetId: string;
  rankDisplay: string;
  cameFromFamily: boolean;
  previousFamily: string | null;
  avatarUrl?: string;
  mirrored?: boolean;
  status?: string;
  reviewerId?: string | null;
}) {
  const status = options.status ?? 'PENDING';
  const statusText = status === 'APPROVED' ? '✅ Validado' : status === 'REJECTED' ? '❌ Recusado' : status === 'RESET' ? '🔄 Resetado' : '⏳ Aguardando validação';
  const rows = status === 'PENDING' && options.recruitmentId ? [{
    type: 1,
    components: [
      { type: 2, style: 3, custom_id: `${ALTA_RECRUITMENT_PREFIX}review:approve:${options.recruitmentId}`, label: 'Validar recrutamento', emoji: { name: '✅' } },
      { type: 2, style: 4, custom_id: `${ALTA_RECRUITMENT_PREFIX}review:reject:${options.recruitmentId}`, label: 'Recusar recrutamento', emoji: { name: '❌' } },
    ],
  }] as ApiComponent[] : [];
  return recruitmentV2([
    '# °♡° | FICHA DE RECRUTAMENTO',
    '> Um novo integrante foi registrado pela equipe de Recrutamento da Alta.',
    '',
    `°♡° **recrutador:** <@${options.recruiterId}>`,
    `°♡° **recrutado:** <@${options.targetId}>`,
    `°♡° **id:** \`${options.targetId}\``,
    `°♡° **cargo inicial:** ${options.rankDisplay}`,
    `°♡° **saiu de alguma família?** ${options.cameFromFamily ? 'Sim' : 'Não'}`,
    `°♡° **se sim, qual?** ${options.previousFamily ?? '—'}`,
    `°♡° **status:** ${statusText}`,
    ...(options.reviewerId ? [`°♡° **analisado por:** <@${options.reviewerId}>`] : []),
    ...(options.mirrored ? ['', '-# Registro espelhado automaticamente do servidor oficial da Alta.'] : []),
  ].join('\n'), {
    thumbnailUrl: options.avatarUrl,
    allowedUsers: options.mirrored ? [] : [options.targetId],
    rows,
    accentColor: status === 'APPROVED' ? 0x57f287 : status === 'REJECTED' ? 0xed4245 : status === 'RESET' ? 0x89949f : ALTA_RECRUITMENT_ACCENT,
  });
}

async function mirrorRecruitmentToLeadership(client: Client, options: {
  recruiterId: string;
  target: GuildMember;
  rankName: string;
  cameFromFamily: boolean;
  previousFamily: string | null;
}) {
  const area = LEADERSHIP_AREAS.find(item => item.key === 'recrutamento')!;
  const configured = await prisma.leadershipArea.findUnique({
    where: { guildId_roleId: { guildId: LEADERSHIP_GUILD_ID, roleId: area.roleId } },
  });
  if (!configured?.reportChannelId) return false;
  const channel = await client.channels.fetch(configured.reportChannelId).catch(() => null);
  if (!channel?.isSendable()) return false;
  await channel.send(buildAltaRecruitmentRecord({
    recruiterId: options.recruiterId,
    targetId: options.target.id,
    rankDisplay: options.rankName,
    cameFromFamily: options.cameFromFamily,
    previousFamily: options.previousFamily,
    avatarUrl: options.target.displayAvatarURL({ extension: 'png', size: 256 }),
    mirrored: true,
    status: 'APPROVED',
  }));
  return true;
}

async function finalizeRecruitment(
  interaction: StringSelectMenuInteraction,
  target: GuildMember,
  rankRoleId: string,
  cameFromFamily: boolean,
  previousFamily: string | null,
) {
  const ranks = await altaRecruitmentRankRoles(interaction.guild!);
  const selected = ranks.find(rank => rank.role.id === rankRoleId);
  if (!selected) throw new Error('O cargo selecionado não é um cargo inicial válido.');
  const records = await interaction.guild!.channels.fetch(ALTA_RECRUITMENT_RECORDS_CHANNEL_ID).catch(() => null);
  if (!records?.isSendable()) throw new Error('O canal de fichas de recrutamento não está disponível.');
  await interaction.deferUpdate();
  const existing = await prisma.altaRecruitment.findFirst({
    where: { guildId: interaction.guildId!, targetId: target.id, active: true, status: { in: ['PENDING', 'APPROVED'] } },
  });
  if (existing) throw new Error(existing.status === 'PENDING'
    ? 'Esse membro já possui uma ficha aguardando validação.'
    : 'Esse membro já possui um recrutamento válido no ciclo atual.');
  await prisma.altaRecruitmentConfig.upsert({
    where: { guildId: interaction.guildId! },
    create: { guildId: interaction.guildId!, announcementChannelId: ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID },
    update: { announcementChannelId: ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID },
  });
  const recruitment = await prisma.altaRecruitment.create({ data: {
    guildId: interaction.guildId!, recruiterId: interaction.user.id, targetId: target.id,
    rankRoleId: selected.role.id, rankName: selected.name, cameFromFamily, previousFamily,
    recordsChannelId: records.id,
  } });
  try {
    const sent = await records.send(buildAltaRecruitmentRecord({
      recruitmentId: recruitment.id,
      recruiterId: interaction.user.id,
      targetId: target.id,
      rankDisplay: `<@&${selected.role.id}>`,
      cameFromFamily,
      previousFamily,
      avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
      status: 'PENDING',
    }));
    await prisma.altaRecruitment.update({ where: { id: recruitment.id }, data: { recordsMessageId: sent.id } });
  } catch (error) {
    await prisma.altaRecruitment.delete({ where: { id: recruitment.id } }).catch(() => {});
    throw error;
  }
  const done = recruitmentV2(
    `# ⏳ | FICHA ENVIADA PARA VALIDAÇÃO\nA ficha de <@${target.id}> foi publicada em <#${ALTA_RECRUITMENT_RECORDS_CHANNEL_ID}>. O cargo <@&${selected.role.id}> será aplicado somente depois que um responsável validar o recrutamento.`,
  );
  await interaction.editReply({ components: done.components, allowedMentions: { parse: [] } });
}

async function runRecruitmentSelect(interaction: StringSelectMenuInteraction) {
  const parsed = await validateStep(interaction);
  if (parsed.step === 'rank') {
    const ranks = await altaRecruitmentRankRoles(interaction.guild!);
    const rankRoleId = interaction.values[0] ?? '';
    if (!ranks.some(rank => rank.role.id === rankRoleId)) throw new Error('Cargo inicial inválido.');
    const row = selectRow(
      `${ALTA_RECRUITMENT_PREFIX}origin:${interaction.user.id}:${parsed.target.id}:${rankRoleId}`,
      'Veio de outra família?',
      [
        { label: 'Não', value: 'no', emoji: { name: '❌' } },
        { label: 'Sim', value: 'yes', emoji: { name: '✅' } },
      ],
    );
    const payload = recruitmentV2(`# ♡ | FAMÍLIA ANTERIOR\n**Recrutado:** <@${parsed.target.id}>\n**Cargo selecionado:** <@&${rankRoleId}>\n\nO membro saiu de alguma família?`, { rows: [row] });
    await interaction.update({ components: payload.components, allowedMentions: { parse: [] } });
    return;
  }
  if (parsed.step === 'origin') {
    const answer = interaction.values[0];
    if (answer === 'no') return finalizeRecruitment(interaction, parsed.target, parsed.rankRoleId, false, null);
    if (answer !== 'yes') throw new Error('Resposta sobre a família anterior inválida.');
    const row = selectRow(
      `${ALTA_RECRUITMENT_PREFIX}family:${interaction.user.id}:${parsed.target.id}:${parsed.rankRoleId}`,
      'Selecione a família anterior',
      ALTA_RECRUITMENT_FAMILIES.map(family => ({ label: family, value: family.toLocaleLowerCase('pt-BR') })),
    );
    const payload = recruitmentV2(`# ♡ | QUAL ERA A FAMÍLIA?\nSelecione a família anterior de <@${parsed.target.id}>.`, { rows: [row] });
    await interaction.update({ components: payload.components, allowedMentions: { parse: [] } });
    return;
  }
  if (parsed.step === 'family') {
    const value = interaction.values[0] ?? '';
    const family = ALTA_RECRUITMENT_FAMILIES.find(item => item.toLocaleLowerCase('pt-BR') === value);
    if (!family) throw new Error('Família anterior inválida.');
    return finalizeRecruitment(interaction, parsed.target, parsed.rankRoleId, true, family);
  }
  throw new Error('Etapa do recrutamento inválida.');
}

export async function handleAltaRecruitmentSelect(interaction: StringSelectMenuInteraction) {
  try {
    await runRecruitmentSelect(interaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível concluir o recrutamento.';
    if (interaction.deferred) {
      const payload = recruitmentV2(`# ❌ | RECRUTAMENTO NÃO CONCLUÍDO\n${message}`, { accentColor: 0xed4245 });
      await interaction.editReply({ components: payload.components }).catch(() => {});
    } else if (interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

export async function handleAltaRecruitmentButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith(`${ALTA_RECRUITMENT_PREFIX}review:`) || !interaction.inCachedGuild()) return false;
  try {
    assertAltaRecruitmentRecord(interaction.guildId, interaction.channelId);
    assertValidator(interaction.user.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [, , , action, recruitmentId] = interaction.customId.split(':');
    if (!['approve', 'reject'].includes(action) || !recruitmentId) throw new Error('Ação de validação inválida.');
    const record = await prisma.altaRecruitment.findUnique({ where: { id: recruitmentId } });
    if (!record || record.guildId !== interaction.guildId || record.recordsMessageId !== interaction.message.id) throw new Error('Ficha de recrutamento não encontrada.');
    if (!record.active) throw new Error('Esta ficha pertence a um ciclo já resetado.');
    if (record.status !== 'PENDING') throw new Error('Esta ficha já foi analisada.');
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const claimed = await prisma.altaRecruitment.updateMany({
      where: { id: record.id, status: 'PENDING', active: true },
      data: { status, reviewedBy: interaction.user.id, reviewedAt: new Date() },
    });
    if (!claimed.count) throw new Error('Esta ficha já foi analisada.');

    const target = await interaction.guild.members.fetch(record.targetId).catch(() => null);
    try {
      if (status === 'APPROVED') {
        if (!target) throw new Error('O recrutado não está mais no servidor.');
        const me = await interaction.guild.members.fetchMe();
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('O Angel precisa da permissão **Gerenciar cargos**.');
        const ranks = await altaRecruitmentRankRoles(interaction.guild);
        const selected = ranks.find(rank => rank.role.id === record.rankRoleId);
        if (!selected) throw new Error('O cargo inicial salvo não está mais disponível.');
        if (!target.roles.cache.has(selected.role.id)) await target.roles.add(selected.role, `Recrutamento validado por ${interaction.user.tag}`);
        const oldRanks = ranks.filter(rank => rank.role.id !== selected.role.id && target.roles.cache.has(rank.role.id));
        if (oldRanks.length) await target.roles.remove(oldRanks.map(rank => rank.role), 'Cargo inicial atualizado após validação REC');
      }
    } catch (error) {
      await prisma.altaRecruitment.update({ where: { id: record.id }, data: { status: 'PENDING', reviewedBy: null, reviewedAt: null } });
      throw error;
    }

    const closed = buildAltaRecruitmentRecord({
      recruiterId: record.recruiterId,
      targetId: record.targetId,
      rankDisplay: `<@&${record.rankRoleId}>`,
      cameFromFamily: record.cameFromFamily,
      previousFamily: record.previousFamily,
      avatarUrl: target?.displayAvatarURL({ extension: 'png', size: 256 }),
      status,
      reviewerId: interaction.user.id,
    });
    await interaction.message.edit(closed as MessageEditOptions).catch(error => console.error(`atualiza ficha REC: ${error instanceof Error ? error.message : error}`));

    let mirrored = false;
    if (status === 'APPROVED' && target) {
      mirrored = await mirrorRecruitmentToLeadership(interaction.client, {
        recruiterId: record.recruiterId,
        target,
        rankName: record.rankName,
        cameFromFamily: record.cameFromFamily,
        previousFamily: record.previousFamily,
      }).catch(error => {
        console.error(`espelho REC Liderança: ${error instanceof Error ? error.message : error}`);
        return false;
      });
    }
    const recruiter = await interaction.client.users.fetch(record.recruiterId).catch(() => null);
    await recruiter?.send(`Sua ficha REC de <@${record.targetId}> foi **${status === 'APPROVED' ? 'validada' : 'recusada'}** por ${interaction.user.tag}.`).catch(() => {});
    await interaction.editReply(status === 'APPROVED'
      ? `Recrutamento validado, cargo aplicado e ficha encerrada.${mirrored ? ' Registro espelhado na Liderança.' : ''}`
      : 'Recrutamento recusado. Nenhum cargo foi aplicado.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível analisar esta ficha.';
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return true;
}

export function buildAltaRecruitmentAnnouncement() {
  return recruitmentV2([
    `<@&${ALTA_RECRUITMENT_ROLE_ID}>`,
    '# 💗 | NOVO SISTEMA DE RECRUTAMENTO',
    '*A equipe de Recrutamento da Alta agora possui um fluxo completo pelo Angel.*',
    '',
    '### Como funciona',
    `1. Use \`/rec\` no canal <#${ALTA_RECRUITMENT_CHANNEL_ID}> e escolha o membro recrutado.`,
    '2. Selecione **Born**, **Featured** ou **Purple**.',
    '3. Informe se ele veio de outra família e, quando necessário, escolha **Turquia**, **Nyx**, **Elite** ou **Dragons**.',
    `4. A ficha será publicada em <#${ALTA_RECRUITMENT_RECORDS_CHANNEL_ID}> aguardando validação.`,
    '5. O cargo só será aplicado depois que um responsável clicar em **Validar recrutamento**.',
    '',
    '### Novos comandos',
    '• `/relatoriorec` — mostra os recrutamentos válidos de cada recrutador.',
    '• `/resetrec` — inicia um novo ciclo de estatísticas sem apagar o histórico.',
    '',
    '> Recrutamentos recusados não somam no relatório. As fichas validadas também são espelhadas no servidor de Liderança.',
  ].join('\n'), { allowedRoles: [ALTA_RECRUITMENT_ROLE_ID] });
}

export async function refreshAltaRecruitmentAnnouncement(client: Client) {
  const guild = client.guilds.cache.get(ALTA_GUILD_ID) ?? await client.guilds.fetch(ALTA_GUILD_ID).catch(() => null);
  if (!guild) return false;
  const channel = await guild.channels.fetch(ALTA_RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID).catch(() => null);
  if (!channel?.isSendable()) return false;
  let config = await prisma.altaRecruitmentConfig.upsert({
    where: { guildId: ALTA_GUILD_ID },
    create: { guildId: ALTA_GUILD_ID, announcementChannelId: channel.id },
    update: { announcementChannelId: channel.id },
  });
  const existing = config.announcementMessageId ? await channel.messages.fetch(config.announcementMessageId).catch(() => null) : null;
  const messageId = existing
    ? (await existing.edit(buildAltaRecruitmentAnnouncement() as MessageEditOptions)).id
    : (await channel.send(buildAltaRecruitmentAnnouncement())).id;
  if (messageId !== config.announcementMessageId) {
    config = await prisma.altaRecruitmentConfig.update({ where: { guildId: ALTA_GUILD_ID }, data: { announcementMessageId: messageId } });
  }
  return Boolean(config.announcementMessageId);
}

function reportLine(record: AltaRecruitment) {
  const family = record.previousFamily ? ` • veio da ${record.previousFamily}` : '';
  return `• <@${record.targetId}> — **${record.rankName}**${family} • <t:${Math.floor(record.createdAt.getTime() / 1000)}:d>`;
}

export async function executeAltaRecruitmentReport(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) throw new Error('Use este comando dentro do servidor.');
  assertAlta(interaction.guildId, interaction.channelId);
  assertRecruitmentAccess(interaction.member);
  const member = interaction.options.getUser('membro');
  if (member) {
    const records = await prisma.altaRecruitment.findMany({
      where: { guildId: interaction.guildId, recruiterId: member.id, active: true },
      orderBy: { createdAt: 'desc' },
    });
    const approved = records.filter(item => item.status === 'APPROVED');
    const pending = records.filter(item => item.status === 'PENDING').length;
    const rejected = records.filter(item => item.status === 'REJECTED').length;
    const content = [
      `# 📊 | RELATÓRIO REC — ${member.displayName}`,
      `**Recrutamentos válidos:** ${approved.length}`,
      `**Aguardando validação:** ${pending}`,
      `**Recusados:** ${rejected}`,
      '',
      '### Últimos recrutamentos válidos',
      approved.length ? approved.slice(0, 15).map(reportLine).join('\n') : '*Nenhum recrutamento validado no ciclo atual.*',
    ].join('\n');
    await interaction.reply(recruitmentV2(content) as any);
    return;
  }
  const approved = await prisma.altaRecruitment.findMany({
    where: { guildId: interaction.guildId, status: 'APPROVED', active: true },
    orderBy: { createdAt: 'desc' },
  });
  const counts = new Map<string, number>();
  for (const item of approved) counts.set(item.recruiterId, (counts.get(item.recruiterId) ?? 0) + 1);
  const ranking = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const content = [
    '# 🏆 | RELATÓRIO GERAL DE RECRUTAMENTO',
    '*Somente fichas validadas entram nesta classificação.*',
    '',
    ranking.length ? ranking.map(([userId, count], index) => `**${index + 1}º** <@${userId}> — **${count}** recrutamento(s) válido(s)`).join('\n') : '*Ainda não existem recrutamentos válidos neste ciclo.*',
    '',
    `**Total válido da equipe:** ${approved.length}`,
  ].join('\n');
  await interaction.reply(recruitmentV2(content) as any);
}

export async function executeAltaRecruitmentReset(interaction: ChatInputCommandInteraction) {
  if (!interaction.inCachedGuild()) throw new Error('Use este comando dentro do servidor.');
  assertAlta(interaction.guildId, interaction.channelId);
  assertValidator(interaction.user.id);
  if (!interaction.options.getBoolean('confirmar', true)) throw new Error('Marque **confirmar: Sim** para realizar o reset.');
  const member = interaction.options.getUser('membro');
  const result = await prisma.altaRecruitment.updateMany({
    where: { guildId: interaction.guildId, active: true, ...(member ? { recruiterId: member.id } : {}) },
    data: { active: false },
  });
  await interaction.reply(recruitmentV2(
    `# 🔄 | ESTATÍSTICAS REC RESETADAS\n${member ? `O ciclo de <@${member.id}> foi reiniciado.` : 'O ciclo de toda a equipe foi reiniciado.'}\n\n**Registros retirados do ciclo atual:** ${result.count}\n-# O histórico foi preservado e os cargos dos membros não foram removidos.`,
    { ephemeral: true },
  ) as any);
}
