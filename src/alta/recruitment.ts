import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction, type Guild, type GuildMember, type MessageCreateOptions,
  type Role, type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../lib/db.js';
import { LEADERSHIP_AREAS, LEADERSHIP_GUILD_ID } from '../leadership/config.js';
import { ALTA_GUILD_ID } from './rise.js';

export const ALTA_RECRUITMENT_PREFIX = 'angel:rec:';
export const ALTA_RECRUITMENT_CHANNEL_ID = '1514841820947939508';
export const ALTA_RECRUITMENT_RECORDS_CHANNEL_ID = '1514841659194736650';
export const ALTA_RECRUITMENT_ROLE_ID = '1417338258815193219';
export const ALTA_RECRUITMENT_ACCENT = 0x7a163d;

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
    allowedMentions: { parse: [], users: options.allowedUsers ?? [], roles: [] },
    components: [{ type: 17, accent_color: options.accentColor ?? ALTA_RECRUITMENT_ACCENT, components: children }],
  } as unknown as MessageCreateOptions;
}

const semanticName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');

function assertAlta(guildId: string | null, channelId: string) {
  if (guildId !== ALTA_GUILD_ID) throw new Error('O `/rec` funciona somente no servidor oficial da Alta.');
  if (channelId !== ALTA_RECRUITMENT_CHANNEL_ID) throw new Error(`Use o comando no canal <#${ALTA_RECRUITMENT_CHANNEL_ID}>.`);
}

function assertRecruiter(member: GuildMember) {
  if (!member.roles.cache.has(ALTA_RECRUITMENT_ROLE_ID)) {
    throw new Error(`Somente membros do cargo <@&${ALTA_RECRUITMENT_ROLE_ID}> podem usar o \`/rec\`.`);
  }
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
  recruiterId: string;
  targetId: string;
  rankDisplay: string;
  cameFromFamily: boolean;
  previousFamily: string | null;
  avatarUrl?: string;
  mirrored?: boolean;
}) {
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
    ...(options.mirrored ? ['', '-# Registro espelhado automaticamente do servidor oficial da Alta.'] : []),
  ].join('\n'), { thumbnailUrl: options.avatarUrl, allowedUsers: options.mirrored ? [] : [options.targetId] });
}

async function mirrorRecruitmentToLeadership(interaction: StringSelectMenuInteraction, options: {
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
  const channel = await interaction.client.channels.fetch(configured.reportChannelId).catch(() => null);
  if (!channel?.isSendable()) return false;
  await channel.send(buildAltaRecruitmentRecord({
    recruiterId: interaction.user.id,
    targetId: options.target.id,
    rankDisplay: options.rankName,
    cameFromFamily: options.cameFromFamily,
    previousFamily: options.previousFamily,
    avatarUrl: options.target.displayAvatarURL({ extension: 'png', size: 256 }),
    mirrored: true,
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
  const me = await interaction.guild!.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('O Angel precisa da permissão **Gerenciar cargos**.');

  await interaction.deferUpdate();
  const hadSelected = target.roles.cache.has(selected.role.id);
  const oldRanks = ranks.filter(rank => rank.role.id !== selected.role.id && target.roles.cache.has(rank.role.id));
  try {
    if (!hadSelected) await target.roles.add(selected.role, `Recrutado por ${interaction.user.tag}`);
    if (oldRanks.length) await target.roles.remove(oldRanks.map(rank => rank.role), 'Atualização do cargo inicial pelo /rec');
    await records.send(buildAltaRecruitmentRecord({
      recruiterId: interaction.user.id,
      targetId: target.id,
      rankDisplay: `<@&${selected.role.id}>`,
      cameFromFamily,
      previousFamily,
      avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
    }));
  } catch (error) {
    if (!hadSelected) await target.roles.remove(selected.role, 'Reversão de ficha REC não publicada').catch(() => {});
    if (oldRanks.length) await target.roles.add(oldRanks.map(rank => rank.role), 'Reversão de ficha REC não publicada').catch(() => {});
    throw error;
  }

  const mirrored = await mirrorRecruitmentToLeadership(interaction, {
    target, rankName: selected.name, cameFromFamily, previousFamily,
  }).catch(error => {
    console.error(`espelho REC Liderança: ${error instanceof Error ? error.message : error}`);
    return false;
  });
  const done = recruitmentV2(
    `# ✅ | RECRUTAMENTO CONCLUÍDO\nA ficha de <@${target.id}> foi publicada em <#${ALTA_RECRUITMENT_RECORDS_CHANNEL_ID}> e o cargo <@&${selected.role.id}> foi aplicado.${mirrored ? '\nO registro também foi espelhado no relatório de Recrutamento da Liderança.' : '\nO espelho da Liderança será ativado após executar `!criarlideranca` naquele servidor.'}`,
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
