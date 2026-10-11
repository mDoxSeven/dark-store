import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const ADD1CTION_GUILD_ID = '1546562808190345246';
export const ADD1CTION_VERIFIED_ROLE_ID = '1558434234140467211';
export const ADD1CTION_VISITOR_ROLE_NAME = 'visitante';
export const ADD1CTION_VERIFY_CATEGORY_NAME = 'INÍCIO';
export const ADD1CTION_VERIFY_CHANNEL_NAME = '・verifique-se';
export const ADD1CTION_VERIFY_BUTTON_ID = 'add1ction:verify';
export const ADD1CTION_BANNER_URL = 'https://raw.githubusercontent.com/mDoxSeven/dark-store/main/public/add1ction-verificacao.png';

const durationChoices = [
  { name: '5 minutos', value: '5m' },
  { name: '10 minutos', value: '10m' },
  { name: '1 hora', value: '1h' },
  { name: '1 dia', value: '1d' },
  { name: '7 dias', value: '7d' },
] as const;

export const add1ctionCommands = [
  new SlashCommandBuilder()
    .setName('entrada')
    .setDescription('Configura e mantém a entrada do servidor.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('configurar').setDescription('Cria a verificação e protege os canais.')
      .addBooleanOption(option => option.setName('confirmar').setDescription('Confirma as alterações.').setRequired(true))
      .addBooleanOption(option => option.setName('membros').setDescription('Aplica Visitante aos membros não verificados.')))
    .addSubcommand(sub => sub.setName('sincronizar').setDescription('Protege novamente todos os canais.')
      .addBooleanOption(option => option.setName('membros').setDescription('Sincroniza membros não verificados.')))
    .addSubcommand(sub => sub.setName('painel').setDescription('Publica ou atualiza o painel V2.'))
    .addSubcommand(sub => sub.setName('status').setDescription('Confere canal, cargos e hierarquia.')),
  new SlashCommandBuilder().setName('ban').setDescription('Bane um membro do servidor.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option => option.setName('usuario').setDescription('Membro que será banido.').setRequired(true))
    .addStringOption(option => option.setName('motivo').setDescription('Motivo do banimento.').setMaxLength(500)),
  new SlashCommandBuilder().setName('kick').setDescription('Expulsa um membro do servidor.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option => option.setName('usuario').setDescription('Membro que será expulso.').setRequired(true))
    .addStringOption(option => option.setName('motivo').setDescription('Motivo da expulsão.').setMaxLength(500)),
  new SlashCommandBuilder().setName('mute').setDescription('Silencia temporariamente um membro.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('usuario').setDescription('Membro que será silenciado.').setRequired(true))
    .addStringOption(option => {
      option.setName('duracao').setDescription('Tempo do silêncio.').setRequired(true);
      for (const choice of durationChoices) option.addChoices(choice);
      return option;
    })
    .addStringOption(option => option.setName('motivo').setDescription('Motivo do silêncio.').setMaxLength(500)),
  new SlashCommandBuilder().setName('clear').setDescription('Apaga mensagens recentes do canal.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option => option.setName('quantidade').setDescription('De 1 a 100 mensagens.').setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência da Angel.').setDMPermission(false),
  new SlashCommandBuilder().setName('help').setDescription('Mostra os comandos básicos do servidor.').setDMPermission(false),
];

export const ADD1CTION_COMMAND_NAMES = new Set(add1ctionCommands.map(command => command.name));

export const add1ctionDurationMs = (value: string) => ({
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
} as Record<string, number>)[value] ?? 10 * 60_000;

