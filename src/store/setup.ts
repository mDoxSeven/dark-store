import { ChannelType, OverwriteType, PermissionFlagsBits, type Guild } from "discord.js";
import { prisma } from "../lib/db.js";
import { STORE_GUILD_ID, STORE_OWNER_ID, STORE_LAYOUT, assertStoreOwner } from "./config.js";

export async function setupStore(guild: Guild, actorId: string) {
  assertStoreOwner(guild.id, actorId);
  const bot = await guild.members.fetchMe();
  if (!bot.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw new Error("O bot precisa de Gerenciar canais e cargos/permissoes, Ver canais, Enviar mensagens, Ler historico, Conectar e Falar.");
  }
  const settings = await prisma.digitalStore.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  const locked = await prisma.digitalStore.updateMany({ where: { guildId: guild.id, OR: [{ setupUntil: null }, { setupUntil: { lt: new Date() } }] }, data: { setupUntil: new Date(Date.now() + 600_000) } });
  if (!locked.count) throw new Error("A estrutura ja esta sendo criada. Aguarde; apos uma queda, espere 10 minutos.");
  const ids = JSON.parse(settings.channelsJson) as Record<string, string>;
  const channels = await guild.channels.fetch();
  const created: string[] = [];
  try {
    const roles = await guild.roles.fetch();
    let quarantine = roles.get(ids.quarantineRole);
    if (!quarantine || quarantine.managed) {
      quarantine = await guild.roles.create({ name: 'Quarentena', permissions: [], reason: 'Proteção anti-raid da dark store' });
      ids.quarantineRole = quarantine.id;
      await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
      created.push('Cargo Quarentena');
    }
    await prisma.antiRaidConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, quarantineRoleId: quarantine.id }, update: { quarantineRoleId: quarantine.id } });
    for (const group of STORE_LAYOUT) {
      const privacy = "private" in group && group.private;
      const permissions = (readOnly: boolean) => [
        { id: guild.id, type: OverwriteType.Role, deny: privacy ? [PermissionFlagsBits.ViewChannel] : readOnly ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads] : [] },
        { id: quarantine.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: bot.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: STORE_OWNER_ID, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      ];
      let category = channels.get(ids[group.key]);
      if (!category || category.type !== ChannelType.GuildCategory) {
        category = await guild.channels.create({ name: group.name, type: ChannelType.GuildCategory, permissionOverwrites: permissions(false), reason: "Estrutura da loja confirmada pelo responsavel" });
        ids[group.key] = category.id;
        await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
        created.push(group.name);
      }
      await category.permissionOverwrites.edit(quarantine.id, { ViewChannel: false, SendMessages: false, Connect: false, Speak: false }, { reason: 'Proteção anti-raid da dark store' });
      for (const item of group.channels) {
        let channel = channels.get(ids[item.key]);
        if (!channel || channel.type !== item.type) {
          channel = item.type === 2
            ? await guild.channels.create({ name: item.name, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: permissions(false), userLimit: item.key === "supportVoice" ? 2 : 0 })
            : await guild.channels.create({ name: item.name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: permissions(item.readOnly), topic: `Loja • ${item.name} | gerenciado por /criar` });
          ids[item.key] = channel.id;
          await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
          created.push(item.name);
        }
        if (channel) await channel.permissionOverwrites.edit(quarantine.id, { ViewChannel: false, SendMessages: false, Connect: false, Speak: false }, { reason: 'Proteção anti-raid da dark store' });
      }
    }
    await prisma.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: {
      ordersChannelId: settings.ordersChannelId ?? ids.orders, salesChannelId: settings.salesChannelId ?? ids.completed,
      discordChannelId: ids.discord,
      spotifyChannelId: ids.spotify,
    } });
    const channel = await guild.channels.fetch(ids.shop);
    if (channel?.isTextBased() && "send" in channel && !ids.introMessage) {
      const message = await channel.send({ flags: 32768, allowedMentions: { parse: [] }, components: [{ type: 17, accent_color: 0x89949f, components: [
        { type: 10, content: "## Bem-vindo à loja\nOs produtos serão publicados aqui pela equipe. Escolha um produto e clique em **Comprar** para abrir seu pedido." },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: "**Compra segura**\nConfira valor e disponibilidade com a equipe antes de pagar. A entrega é feita no privado, após a confirmação do pagamento.\n-# Precisa de ajuda? Utilize o canal de suporte." },
      ] }] });
      ids.introMessage = message.id;
      await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
    }
    return created;
  } finally { await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { setupUntil: null } }); }
}
