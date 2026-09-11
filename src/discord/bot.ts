import {
  ActivityType, ChannelType, Client, Events, GatewayIntentBits, MessageFlags, OverwriteType,
  PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type Guild,
  type MessageCreateOptions, type MessageEditOptions, type StringSelectMenuInteraction
} from 'discord.js';
import { prisma } from '../lib/db.js';
import { AntiRaidEngine, respondToRaid, type AntiRaidResponder } from '../antiRaid.js';
import { criarCommand, executeCriar } from '../bot/criar.js';
import { configureDiscordRuntime } from '../runtime.js';
import {
  APPLICATION_ID, STORE_GUILD_ID, STORE_OWNER_ID, UNVERIFIED_ROLE_ID, VERIFIED_ROLE_ID, supportRoleIds,
} from '../store/config.js';
import { createOrder } from '../store/orders.js';
import { getAntiRaidSettings } from '../service.js';
import { discordRuntime } from './transport.js';
import { auditActionName, parseRoleButton } from './ids.js';
import { pixQrPng } from '../store/pix.js';
import { refreshSpotifyCatalog } from '../store/spotify.js';
import { SPOTIFY_SELECT_ID } from '../store/spotifyMessage.js';
import { refreshDiscordCatalog } from '../store/discordCatalog.js';
import { DISCORD_SELECT_ID } from '../store/discordMessage.js';
import { refreshVerificationPanel } from '../store/verification.js';
import { VERIFICATION_BUTTON_ID } from '../store/verificationMessage.js';
import { confirmationTicketMessage, parseTicketButton, paymentTicketMessage } from '../store/tickets.js';
const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 1500) : 'Ação não concluída.';

async function handleCriar(interaction: ChatInputCommandInteraction) {
  if (interaction.guildId !== STORE_GUILD_ID || interaction.user.id !== STORE_OWNER_ID || !interaction.guild) {
    await interaction.reply({ content: 'Este comando é exclusivo do responsável no servidor autorizado.', flags: MessageFlags.Ephemeral }); return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const confirmed = interaction.options.getBoolean('confirmar') === true;
  const result = await executeCriar(interaction.guild, interaction.user.id, confirmed);
  if (!result.preview) await Promise.all([refreshSpotifyCatalog(), refreshDiscordCatalog(), refreshVerificationPanel()]);
  if (result.preview) {
    const count = result.layout.reduce((total, group) => total + group.channels.length, 0);
    await interaction.editReply(`Prévia pronta: ${result.layout.length} categorias e ${count} canais. Execute novamente marcando **confirmar: Sim**.`);
  } else {
    await interaction.editReply(result.created.length ? `Estrutura pronta. Criados ou ajustados: ${result.created.join(', ')}.` : 'Estrutura validada: canais, cargos, permissões e painéis já estavam prontos.');
  }
}

async function handleCatalogSelection(interaction: StringSelectMenuInteraction, category: 'spotify' | 'discord') {
  if (interaction.guildId !== STORE_GUILD_ID || !interaction.guild) throw new Error('Catálogo fora do servidor autorizado.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const productId = interaction.values[0];
  if (!productId || productId === 'unavailable') throw new Error('Este item não está disponível.');
  const product = await prisma.digitalProduct.findFirst({ where: { id: productId, guildId: STORE_GUILD_ID, active: true } });
  const automaticStock = product ? await prisma.digitalStock.count({ where: { productId, claimedAt: null } }) : 0;
  if (!product || product.category.trim().toLocaleLowerCase('pt-BR') !== category || automaticStock + product.manualStock < 1) throw new Error('Produto indisponível ou sem estoque.');
  const existing = await prisma.checkoutTicket.findFirst({ where: { guildId: STORE_GUILD_ID, userId: interaction.user.id, status: { in: ['awaiting_confirmation', 'awaiting_payment'] } } });
  if (existing) {
    const existingChannel = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
    if (existingChannel) {
      await interaction.editReply(`Você já possui um atendimento aberto: <#${existing.channelId}>.`);
      return;
    }
    await prisma.checkoutTicket.update({ where: { id: existing.id }, data: { status: 'closed', activeKey: null } });
  }
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const ids = JSON.parse(settings?.channelsJson || '{}') as Record<string, string>;
  const overwrites = [
    { id: interaction.guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.client.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] },
    { id: STORE_OWNER_ID, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  for (const roleId of supportRoleIds(settings)) {
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (role) overwrites.push({ id: role.id, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const safeName = interaction.user.username.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 28) || 'cliente';
  const channel = await interaction.guild.channels.create({
    name: `${category}-${safeName}-${interaction.user.id.slice(-4)}`,
    type: ChannelType.GuildText,
    parent: ids.tickets || null,
    permissionOverwrites: overwrites,
    topic: `Atendimento privado · ${product.title} · ${interaction.user.id}`,
    reason: `Seleção no catálogo ${category} da dark store`,
  });
  try {
    const ticket = await prisma.checkoutTicket.create({ data: {
      guildId: STORE_GUILD_ID, userId: interaction.user.id, productId: product.id,
      productTitle: product.title, priceCents: product.priceCents, channelId: channel.id,
      activeKey: `${STORE_GUILD_ID}:${interaction.user.id}`,
    } });
    await channel.send({ ...confirmationTicketMessage(ticket), allowedMentions: { users: [ticket.userId] } } as MessageCreateOptions);
    await interaction.editReply(`Atendimento criado: <#${channel.id}>.`);
  } catch (error) {
    await channel.delete('Falha ao registrar atendimento').catch(() => {});
    throw error;
  }
}

async function handleTicketButton(interaction: ButtonInteraction, parsed: NonNullable<ReturnType<typeof parseTicketButton>>, notifyCooldowns: Map<string, number>) {
  if (interaction.guildId !== STORE_GUILD_ID || !interaction.guild) throw new Error('Atendimento fora do servidor autorizado.');
  const ticket = await prisma.checkoutTicket.findFirst({ where: { id: parsed.ticketId, guildId: STORE_GUILD_ID } });
  if (!ticket) throw new Error('Atendimento não encontrado.');
  if (ticket.userId !== interaction.user.id && interaction.user.id !== STORE_OWNER_ID) throw new Error('Somente o cliente deste atendimento pode usar esse botão.');
  if (ticket.channelId !== interaction.channelId) throw new Error('Este botão não pertence a este atendimento.');
  const ticketChannel = interaction.channel;
  if (!ticketChannel?.isSendable()) throw new Error('Canal do atendimento indisponível.');

  if (parsed.action === 'confirm') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (ticket.status === 'awaiting_payment' && ticket.orderId) {
      const existingOrder = await prisma.digitalOrder.findUnique({ where: { id: ticket.orderId } });
      if (!existingOrder) throw new Error('Pedido vinculado não encontrado.');
      await interaction.message.edit({ components: paymentTicketMessage(ticket, existingOrder).components } as MessageEditOptions);
      await interaction.editReply('Os dados do pagamento foram restaurados no atendimento.');
      return;
    }
    if (ticket.status !== 'awaiting_confirmation') throw new Error('Este atendimento já foi processado.');
    const order = await createOrder(prisma, ticket.productId, ticket.userId, interaction.id);
    const changed = await prisma.checkoutTicket.updateMany({ where: { id: ticket.id, status: 'awaiting_confirmation' }, data: { status: 'awaiting_payment', orderId: order.id } });
    if (!changed.count) throw new Error('Este atendimento já foi processado.');
    await interaction.message.edit({ components: paymentTicketMessage(ticket, order).components } as MessageEditOptions);
    await interaction.editReply(order.pixPayload ? 'Pix gerado. Use o código exibido no atendimento ou abra o QR Code.' : 'Pedido confirmado. Aguarde as instruções da equipe.');
    return;
  }
  if (parsed.action === 'refuse') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const changed = await prisma.checkoutTicket.updateMany({ where: { id: ticket.id, status: 'awaiting_confirmation' }, data: { status: 'refused', activeKey: null, deleteAt: new Date(Date.now() + 8_000) } });
    if (!changed.count) throw new Error('Este atendimento já foi processado.');
    await ticketChannel.send('Compra recusada. Este canal será removido em alguns segundos.');
    await interaction.editReply('Compra recusada e fechamento agendado.');
    return;
  }
  if (parsed.action === 'qr') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const order = ticket.orderId ? await prisma.digitalOrder.findUnique({ where: { id: ticket.orderId } }) : null;
    if (!order?.pixPayload) throw new Error('Este pedido não possui QR Code Pix.');
    await interaction.editReply({ content: `QR Code do pedido \`${order.id}\`.`, files: [{ attachment: await pixQrPng(order.pixPayload), name: `pix-${order.id}.png` }] });
    return;
  }
  const now = Date.now();
  if ((notifyCooldowns.get(ticket.id) || 0) > now) throw new Error('O administrador já foi notificado. Aguarde dois minutos.');
  notifyCooldowns.set(ticket.id, now + 120_000);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const supportRoles = (await Promise.all(supportRoleIds(settings).map(id => interaction.guild!.roles.fetch(id).catch(() => null)))).filter(role => role !== null);
  const mention = supportRoles.length ? supportRoles.map(role => `<@&${role.id}>`).join(' ') : `<@${STORE_OWNER_ID}>`;
  await ticketChannel.send({ content: `${mention}, <@${ticket.userId}> solicitou atendimento neste ticket.`, allowedMentions: supportRoles.length ? { roles: supportRoles.map(role => role.id), users: [ticket.userId] } : { users: [STORE_OWNER_ID, ticket.userId] } });
  await interaction.editReply('Administrador notificado.');
}

async function sweepClosedTickets(client: Client) {
  const due = await prisma.checkoutTicket.findMany({ where: { guildId: STORE_GUILD_ID, deleteAt: { lte: new Date() } }, take: 20 });
  for (const ticket of due) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel && 'delete' in channel) await channel.delete('Atendimento recusado pelo cliente').catch(() => {});
    await prisma.checkoutTicket.update({ where: { id: ticket.id }, data: { status: 'closed', activeKey: null, deleteAt: null } });
  }
}

async function handleRoleButton(interaction: ButtonInteraction, parsed: NonNullable<ReturnType<typeof parseRoleButton>>) {
  if (interaction.guildId !== STORE_GUILD_ID || !interaction.guild) throw new Error('Botão fora do servidor autorizado.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const role = await interaction.guild.roles.fetch(parsed.roleId);
  if (!role || role.managed || !role.editable) throw new Error('O cargo não existe ou está acima do cargo do bot.');
  const hasRole = member.roles.cache.has(role.id);
  if (parsed.mode === 'add' && !hasRole) await member.roles.add(role, 'Botão Components V2 da loja');
  if (parsed.mode === 'remove' && hasRole) await member.roles.remove(role, 'Botão Components V2 da loja');
  if (parsed.mode === 'toggle') await (hasRole ? member.roles.remove(role, 'Botão Components V2 da loja') : member.roles.add(role, 'Botão Components V2 da loja'));
  const nowHasRole = parsed.mode === 'add' || (parsed.mode === 'toggle' && !hasRole);
  await interaction.editReply(nowHasRole ? `Cargo **${role.name}** adicionado.` : `Cargo **${role.name}** removido.`);
}

async function handleVerification(interaction: ButtonInteraction) {
  if (interaction.guildId !== STORE_GUILD_ID || !interaction.guild) throw new Error('Verificação fora do servidor autorizado.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.user.bot) throw new Error('Bots não utilizam a verificação de membros.');
  const [unverified, verified, antiRaid] = await Promise.all([
    interaction.guild.roles.fetch(UNVERIFIED_ROLE_ID),
    interaction.guild.roles.fetch(VERIFIED_ROLE_ID),
    prisma.antiRaidConfig.findUnique({ where: { guildId: STORE_GUILD_ID } }),
  ]);
  if (!unverified || unverified.managed || !unverified.editable) throw new Error('O cargo inicial não existe ou está acima do cargo do bot.');
  if (!verified || verified.managed || !verified.editable) throw new Error('O cargo verificado não existe ou está acima do cargo do bot.');
  if (antiRaid?.quarantineRoleId && member.roles.cache.has(antiRaid.quarantineRoleId)) {
    throw new Error('Sua entrada está em análise pela proteção do servidor.');
  }
  if (!member.roles.cache.has(verified.id)) await member.roles.add(verified, 'Verificação concluída na dark store');
  if (member.roles.cache.has(unverified.id)) await member.roles.remove(unverified, 'Verificação concluída na dark store');
  await interaction.editReply('Verificação concluída. O acesso à loja foi liberado.');
}

async function handlePurchase(interaction: ButtonInteraction) {
  if (interaction.guildId !== STORE_GUILD_ID) throw new Error('Compra fora do servidor autorizado.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const productId = interaction.customId.slice('store:buy:'.length);
  const order = await createOrder(prisma, productId, interaction.user.id, interaction.id);
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const pix = order.pixPayload
    ? `\n**Pix copia e cola:**\n\`\`\`\n${order.pixPayload}\n\`\`\`\nO QR Code está anexado. O pedido só será entregue após a equipe conferir o pagamento.`
    : `\n${settings?.paymentInstructions || 'Aguarde as instruções da equipe antes de realizar qualquer pagamento.'}`;
  const files = order.pixPayload ? [{ attachment: await pixQrPng(order.pixPayload), name: `pix-${order.id}.png` }] : [];
  await interaction.editReply({ content: `Pedido \`${order.id}\` criado · ${order.productTitle}.${pix}`.slice(0, 1900), files, allowedMentions: { parse: [] } });
  if (settings?.ordersChannelId) {
    const channel = await interaction.guild?.channels.fetch(settings.ordersChannelId).catch(() => null);
    if (channel?.isSendable()) await channel.send({ content: `Novo pedido \`${order.id}\` · <@${interaction.user.id}> · ${order.productTitle}`, allowedMentions: { users: [interaction.user.id] } }).catch(() => {});
  }
}

function responder(guild: Guild): AntiRaidResponder {
  const member = async (userId: string) => {
    if ([STORE_OWNER_ID, guild.ownerId, guild.members.me?.id].includes(userId)) throw new Error('Membro protegido.');
    return guild.members.fetch(userId);
  };
  return {
    async quarantine(userId, roleId) {
      const target = await member(userId); const role = await guild.roles.fetch(roleId);
      if (!role?.editable) throw new Error('Cargo de quarentena inacessível.');
      const removable = target.roles.cache.filter(item => item.id !== guild.id && item.id !== role.id && !item.managed && item.editable);
      if (removable.size) await target.roles.remove(removable, 'Proteção anti-raid');
      await target.roles.add(role, 'Proteção anti-raid');
    },
    async kick(userId) { const target = await member(userId); if (!target.kickable) throw new Error('Membro não expulsável.'); await target.kick('Proteção anti-raid'); },
    async ban(userId) { const target = await member(userId); if (!target.bannable) throw new Error('Membro não banível.'); await target.ban({ reason: 'Proteção anti-raid', deleteMessageSeconds: 0 }); },
    async log(channelId, message) {
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isSendable()) throw new Error('Canal de log inacessível.');
      await channel.send({ content: message, allowedMentions: { parse: [] } });
    }
  };
}

export async function startDiscord(token: string) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration] });
  const raid = new AntiRaidEngine();
  const notifyCooldowns = new Map<string, number>();
  const responseCooldowns = new Map<string, number>();
  const claimResponse = (key: string, duration: number) => {
    const now = Date.now();
    if ((responseCooldowns.get(key) || 0) > now) return false;
    responseCooldowns.set(key, now + duration);
    if (responseCooldowns.size > 5000) {
      for (const [id, until] of responseCooldowns) if (until <= now) responseCooldowns.delete(id);
      while (responseCooldowns.size > 5000) responseCooldowns.delete(responseCooldowns.keys().next().value as string);
    }
    return true;
  };
  client.on(Events.InteractionCreate, interaction => {
    void (async () => {
      if (interaction.isChatInputCommand() && interaction.commandName === 'criar') await handleCriar(interaction);
      else if (interaction.isStringSelectMenu() && interaction.customId === SPOTIFY_SELECT_ID) await handleCatalogSelection(interaction, 'spotify');
      else if (interaction.isStringSelectMenu() && interaction.customId === DISCORD_SELECT_ID) await handleCatalogSelection(interaction, 'discord');
      else if (interaction.isButton()) {
        const role = parseRoleButton(interaction.customId);
        const ticket = parseTicketButton(interaction.customId);
        if (interaction.customId === VERIFICATION_BUTTON_ID) await handleVerification(interaction);
        else if (role) await handleRoleButton(interaction, role);
        else if (ticket) await handleTicketButton(interaction, ticket, notifyCooldowns);
        else if (interaction.customId.startsWith('store:buy:')) await handlePurchase(interaction);
      }
    })().catch(async error => {
      const message = errorText(error);
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, components: [] }).catch(() => {});
        else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
  });
  client.on(Events.GuildMemberAdd, joined => {
    void (async () => {
      if (joined.guild.id !== STORE_GUILD_ID || joined.user.bot) return;
      const unverified = await joined.guild.roles.fetch(UNVERIFIED_ROLE_ID);
      if (!unverified || unverified.managed || !unverified.editable) throw new Error('Cargo inicial ausente ou acima do bot. Execute /criar após corrigir a hierarquia.');
      await joined.roles.add(unverified, 'Entrada na dark store: verificação pendente');
      const settings = await getAntiRaidSettings();
      const result = raid.join(settings, joined.user.createdTimestamp);
      if (result.detected) await respondToRaid(prisma, settings, joined.id, 'JOIN_ALERT', result.reasons, responder(joined.guild));
    })().catch(error => console.error(`anti-raid entrada: ${errorText(error)}`));
  });
  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    void (async () => {
      if (guild.id !== STORE_GUILD_ID || !entry.executorId || [client.user?.id, STORE_OWNER_ID, guild.ownerId].includes(entry.executorId)) return;
      const action = auditActionName(entry.action); if (!action) return;
      const settings = await getAntiRaidSettings();
      const result = raid.audit(settings, entry.executorId, action, entry.createdTimestamp);
      if (result.detected && claimResponse(`audit:${entry.executorId}`, settings.destructiveWindowSeconds * 1000)) {
        await respondToRaid(prisma, settings, entry.executorId, 'DESTRUCTIVE_BURST', result.reasons, responder(guild));
      }
    })().catch(error => console.error(`anti-raid auditoria: ${errorText(error)}`));
  });
  let timeout: NodeJS.Timeout;
  const ready = new Promise<Client<true>>((resolveReady, reject) => {
    timeout = setTimeout(() => { client.destroy(); reject(new Error('Tempo esgotado ao conectar o Discord.')); }, 30_000);
    client.once(Events.ClientReady, async connected => {
      clearTimeout(timeout);
      try {
        if (connected.user.id !== APPLICATION_ID) throw new Error('O token não pertence à aplicação configurada.');
        const guild = await connected.guilds.fetch(STORE_GUILD_ID);
        const owner = await guild.members.fetch(STORE_OWNER_ID).catch(() => null);
        if (!owner) throw new Error('DARK_OWNER_ID não pertence ao servidor configurado.');
        const me = await guild.members.fetchMe();
        const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewAuditLog,
          PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers];
        const missing = me.permissions.missing(required);
        if (missing.length) throw new Error(`Permissões ausentes no servidor: ${missing.join(', ')}.`);
        await guild.commands.set([criarCommand.toJSON()]);
        connected.user.setPresence({ status: 'online', activities: [{ name: 'a dark store', type: ActivityType.Watching }] });
        configureDiscordRuntime(discordRuntime(connected, guild));
        await sweepClosedTickets(connected);
        setInterval(() => void sweepClosedTickets(connected).catch(error => console.error(`tickets: ${errorText(error)}`)), 15_000).unref();
        console.log(`Discord conectado como ${connected.user.tag}; /criar registrado no servidor autorizado.`);
        resolveReady(connected);
      } catch (error) { connected.destroy(); reject(error); }
    });
  });
  client.on(Events.Error, error => console.error(`Discord: ${error.message}`));
  try { await client.login(token); return await ready; }
  catch (error) { clearTimeout(timeout!); client.destroy(); void ready.catch(() => {}); throw error; }
}
