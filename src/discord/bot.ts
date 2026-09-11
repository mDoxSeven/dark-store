import {
  ActivityType, Client, Events, GatewayIntentBits, MessageFlags,
  PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type Guild
} from 'discord.js';
import { prisma } from '../lib/db.js';
import { AntiRaidEngine, respondToRaid, type AntiRaidResponder } from '../antiRaid.js';
import { criarCommand, executeCriar } from '../bot/criar.js';
import { configureDiscordRuntime } from '../runtime.js';
import { APPLICATION_ID, STORE_GUILD_ID, STORE_OWNER_ID } from '../store/config.js';
import { createOrder } from '../store/orders.js';
import { getAntiRaidSettings } from '../service.js';
import { discordRuntime } from './transport.js';
import { auditActionName, parseRoleButton } from './ids.js';
import { pixQrPng } from '../store/pix.js';
const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 1500) : 'Ação não concluída.';

async function handleCriar(interaction: ChatInputCommandInteraction) {
  if (interaction.guildId !== STORE_GUILD_ID || interaction.user.id !== STORE_OWNER_ID || !interaction.guild) {
    await interaction.reply({ content: 'Este comando é exclusivo do responsável no servidor autorizado.', flags: MessageFlags.Ephemeral }); return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const confirmed = interaction.options.getBoolean('confirmar') === true;
  const result = await executeCriar(interaction.guild, interaction.user.id, confirmed);
  if (result.preview) {
    const count = result.layout.reduce((total, group) => total + group.channels.length, 0);
    await interaction.editReply(`Prévia pronta: ${result.layout.length} categorias e ${count} canais. Execute novamente marcando **confirmar: Sim**.`);
  } else {
    await interaction.editReply(result.created.length ? `Estrutura pronta. Criados: ${result.created.join(', ')}.` : 'A estrutura já estava pronta; nenhum canal foi duplicado.');
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
      else if (interaction.isButton()) {
        const role = parseRoleButton(interaction.customId);
        if (role) await handleRoleButton(interaction, role);
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
        console.log(`Discord conectado como ${connected.user.tag}; /criar registrado no servidor autorizado.`);
        resolveReady(connected);
      } catch (error) { connected.destroy(); reject(error); }
    });
  });
  client.on(Events.Error, error => console.error(`Discord: ${error.message}`));
  try { await client.login(token); return await ready; }
  catch (error) { clearTimeout(timeout!); client.destroy(); void ready.catch(() => {}); throw error; }
}
