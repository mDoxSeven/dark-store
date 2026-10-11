import {
  ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits,
  type ButtonInteraction, type CategoryChannel, type ChatInputCommandInteraction,
  type Guild, type GuildMember, type MessageCreateOptions, type TextChannel,
} from 'discord.js';
import {
  ADD1CTION_COMMAND_NAMES, ADD1CTION_GUILD_ID, ADD1CTION_VERIFIED_ROLE_ID,
  ADD1CTION_VERIFY_BUTTON_ID, ADD1CTION_VERIFY_CATEGORY_NAME, ADD1CTION_VERIFY_CHANNEL_NAME,
  ADD1CTION_VISITOR_ROLE_NAME, add1ctionDurationMs,
} from './config.js';
import { add1ctionEphemeral, add1ctionVerificationMessage } from './messages.js';

const semantic = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');

const requireGuild = (guildId: string | null) => {
  if (guildId !== ADD1CTION_GUILD_ID) throw new Error('Este comando é exclusivo do servidor add1ction.');
};

const requirePermission = (interaction: ChatInputCommandInteraction, permission: bigint) => {
  if (!interaction.memberPermissions?.has(permission)) throw new Error('Você não possui permissão para usar este comando.');
};

async function visitorRole(guild: Guild) {
  const roles = await guild.roles.fetch();
  return roles.find(role => !role.managed && semantic(role.name) === semantic(ADD1CTION_VISITOR_ROLE_NAME)) ?? null;
}

async function ensureVisitorRole(guild: Guild) {
  const existing = await visitorRole(guild);
  if (existing) return existing;
  const role = await guild.roles.create({
    name: ADD1CTION_VISITOR_ROLE_NAME,
    color: 0x202020,
    permissions: [],
    hoist: false,
    mentionable: false,
    reason: 'Acesso inicial add1ction',
  });
  if (!role.editable) throw new Error('Coloque o cargo da Angel acima do cargo Visitante.');
  return role;
}

async function verifiedRole(guild: Guild) {
  const role = await guild.roles.fetch(ADD1CTION_VERIFIED_ROLE_ID).catch(() => null);
  if (!role) throw new Error(`O cargo verificado ${ADD1CTION_VERIFIED_ROLE_ID} não existe.`);
  if (!role.editable) throw new Error('Coloque o cargo da Angel acima do cargo Verificado.');
  return role;
}

async function verificationChannel(guild: Guild) {
  await guild.channels.fetch();
  return guild.channels.cache.find(channel => channel.type === ChannelType.GuildText
    && semantic(channel.name) === semantic(ADD1CTION_VERIFY_CHANNEL_NAME)) as TextChannel | undefined ?? null;
}

async function ensureVerificationChannel(guild: Guild, visitorId: string, verifiedId: string) {
  const existing = await verificationChannel(guild);
  if (existing) return existing;
  let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory
    && semantic(channel.name) === semantic(ADD1CTION_VERIFY_CATEGORY_NAME)) as CategoryChannel | undefined;
  category ??= await guild.channels.create({
    name: ADD1CTION_VERIFY_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: 'Entrada add1ction',
  });
  return guild.channels.create({
    name: ADD1CTION_VERIFY_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: 'Verificação oficial do servidor add1ction.',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
      { id: visitorId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.UseApplicationCommands], deny: [PermissionFlagsBits.SendMessages] },
      { id: verifiedId, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    ],
    reason: 'Verificação add1ction',
  });
}

async function syncPermissions(guild: Guild) {
  const [visitor, verified] = await Promise.all([ensureVisitorRole(guild), verifiedRole(guild)]);
  const channel = await ensureVerificationChannel(guild, visitor.id, verified.id);
  await guild.channels.fetch();
  let updated = 0;
  for (const target of guild.channels.cache.values()) {
    if (target.isThread() || target.id === channel.id || target.id === channel.parentId) continue;
    await target.permissionOverwrites.edit(visitor.id, { ViewChannel: false }, { reason: 'Visitantes acessam somente a verificação' });
    updated++;
  }
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
  await channel.permissionOverwrites.edit(visitor.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, UseApplicationCommands: true });
  await channel.permissionOverwrites.edit(verified.id, { ViewChannel: false });
  if (channel.parent) {
    await channel.parent.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
    await channel.parent.permissionOverwrites.edit(visitor.id, { ViewChannel: true, ReadMessageHistory: true });
    await channel.parent.permissionOverwrites.edit(verified.id, { ViewChannel: false });
  }
  return { visitor, verified, channel, updated };
}

const hasVerificationButton = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasVerificationButton);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.custom_id === ADD1CTION_VERIFY_BUTTON_ID || Object.values(record).some(hasVerificationButton);
};

async function publishPanel(channel: TextChannel) {
  const payload = add1ctionVerificationMessage();
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = messages?.find(message => message.author.id === channel.client.user.id
    && hasVerificationButton(message.components.map(component => component.toJSON())));
  if (existing) {
    await existing.edit({ components: payload.components });
    return existing.id;
  }
  return (await channel.send(payload)).id;
}

async function syncMembers(guild: Guild, visitorId: string) {
  const members = await guild.members.fetch();
  let count = 0;
  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(ADD1CTION_VERIFIED_ROLE_ID)
      || member.roles.cache.has(visitorId) || member.permissions.has(PermissionFlagsBits.Administrator)) continue;
    const applied = await member.roles.add(visitorId, 'Sincronização de visitantes add1ction').then(() => true).catch(() => false);
    if (applied) count++;
  }
  return count;
}

async function entranceCommand(interaction: ChatInputCommandInteraction) {
  requirePermission(interaction, PermissionFlagsBits.Administrator);
  const guild = interaction.guild;
  if (!guild) throw new Error('Servidor indisponível.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const action = interaction.options.getSubcommand();
  if (action === 'status') {
    const [visitor, channel, verified] = await Promise.all([
      visitorRole(guild), verificationChannel(guild), guild.roles.fetch(ADD1CTION_VERIFIED_ROLE_ID).catch(() => null),
    ]);
    const me = guild.members.me;
    const hierarchy = Boolean(me && verified && verified.position < me.roles.highest.position && (!visitor || visitor.position < me.roles.highest.position));
    await interaction.editReply(`**Status add1ction**\n• Visitante: ${visitor ? `<@&${visitor.id}>` : 'não criado'}\n• Verificado: ${verified ? `<@&${verified.id}>` : 'não encontrado'}\n• Canal: ${channel ? `<#${channel.id}>` : 'não criado'}\n• Hierarquia: ${hierarchy ? 'correta' : 'corrija a posição da Angel'}`);
    return;
  }
  if (action === 'painel') {
    const state = await syncPermissions(guild);
    const messageId = await publishPanel(state.channel);
    await interaction.editReply(`Painel V2 publicado em <#${state.channel.id}>: \`${messageId}\`.`);
    return;
  }
  if (action === 'configurar' && !interaction.options.getBoolean('confirmar', true)) {
    await interaction.editReply('Configuração cancelada. Use `confirmar: Sim` para continuar.');
    return;
  }
  const state = await syncPermissions(guild);
  const members = interaction.options.getBoolean('membros') ? await syncMembers(guild, state.visitor.id) : 0;
  const panel = action === 'configurar' ? await publishPanel(state.channel) : null;
  await interaction.editReply(`Entrada sincronizada.\n• Canal: <#${state.channel.id}>\n• Visitante: <@&${state.visitor.id}>\n• Verificado: <@&${state.verified.id}>\n• Canais protegidos: **${state.updated}**\n• Membros atualizados: **${members}**${panel ? `\n• V2: \`${panel}\`` : ''}`);
}

async function moderationCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) throw new Error('Servidor indisponível.');
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: `🏹 Angel respondeu em **${interaction.client.ws.ping} ms**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === 'help') {
    await interaction.reply(add1ctionEphemeral('## Comandos add1ction\n`/ping` — latência da Angel\n`/help` — esta ajuda\n`/clear` — limpar mensagens\n`/mute` — silenciar membro\n`/kick` — expulsar membro\n`/ban` — banir membro\n`/entrada` — configuração administrativa'));
    return;
  }
  if (interaction.commandName === 'clear') {
    requirePermission(interaction, PermissionFlagsBits.ManageMessages);
    const amount = interaction.options.getInteger('quantidade', true);
    if (!interaction.channel || !('bulkDelete' in interaction.channel)) throw new Error('Use este comando em um canal de texto.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = await interaction.channel.bulkDelete(amount, true);
    await interaction.editReply(`🖤 **${removed.size}** mensagem(ns) removida(s).`);
    return;
  }
  const user = interaction.options.getUser('usuario', true);
  if (user.id === interaction.user.id || user.id === interaction.client.user.id) throw new Error('Escolha outro membro.');
  const reason = interaction.options.getString('motivo')?.trim() || `Ação de ${interaction.user.tag}`;
  if (interaction.commandName === 'ban') {
    requirePermission(interaction, PermissionFlagsBits.BanMembers);
    await guild.members.ban(user, { reason, deleteMessageSeconds: 0 });
    await interaction.reply({ content: `🔨 **${user.tag}** foi banido(a). Motivo: ${reason}`, flags: MessageFlags.Ephemeral });
    return;
  }
  const target = await guild.members.fetch(user.id).catch(() => null);
  if (!target) throw new Error('Esse usuário não está no servidor.');
  if (interaction.commandName === 'kick') {
    requirePermission(interaction, PermissionFlagsBits.KickMembers);
    if (!target.kickable) throw new Error('Não consigo expulsar esse membro. Confira a hierarquia.');
    await target.kick(reason);
    await interaction.reply({ content: `👢 **${user.tag}** foi expulso(a). Motivo: ${reason}`, flags: MessageFlags.Ephemeral });
    return;
  }
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
  if (!target.moderatable) throw new Error('Não consigo silenciar esse membro. Confira a hierarquia.');
  const duration = interaction.options.getString('duracao', true);
  await target.timeout(add1ctionDurationMs(duration), reason);
  await interaction.reply({ content: `🔇 **${user.tag}** foi silenciado(a) por **${duration}**. Motivo: ${reason}`, flags: MessageFlags.Ephemeral });
}

export async function handleAdd1ctionCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.guildId !== ADD1CTION_GUILD_ID || !ADD1CTION_COMMAND_NAMES.has(interaction.commandName)) return false;
  requireGuild(interaction.guildId);
  if (interaction.commandName === 'entrada') await entranceCommand(interaction);
  else await moderationCommand(interaction);
  return true;
}

export async function handleAdd1ctionButton(interaction: ButtonInteraction) {
  if (interaction.customId !== ADD1CTION_VERIFY_BUTTON_ID) return false;
  requireGuild(interaction.guildId);
  if (!interaction.guild) throw new Error('Servidor indisponível.');
  const [visitor, verified] = await Promise.all([visitorRole(interaction.guild), verifiedRole(interaction.guild)]);
  const member = interaction.member as GuildMember;
  if (!member.roles.cache.has(verified.id)) await member.roles.add(verified, 'Verificação add1ction');
  if (visitor && member.roles.cache.has(visitor.id)) await member.roles.remove(visitor, 'Verificação add1ction concluída');
  await interaction.reply(add1ctionEphemeral('## Acesso liberado 🖤\nVocê foi verificado(a) com sucesso. Bem-vindo(a) à **add1ction**.'));
  return true;
}

export async function handleAdd1ctionJoin(member: GuildMember) {
  if (member.guild.id !== ADD1CTION_GUILD_ID || member.user.bot || member.roles.cache.has(ADD1CTION_VERIFIED_ROLE_ID)) return false;
  const visitor = await visitorRole(member.guild);
  if (!visitor) return false;
  if (!visitor.editable) throw new Error('Cargo Visitante acima da Angel.');
  await member.roles.add(visitor, 'Entrada automática add1ction');
  return true;
}

