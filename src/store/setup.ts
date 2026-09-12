import { ChannelType, OverwriteType, PermissionFlagsBits, type Guild } from "discord.js";
import { prisma } from "../lib/db.js";
import {
  REVIEW_ROLE_ID, SALES_CANCELLATION_ROLE_NAME, STORE_GUILD_ID, STORE_OWNER_ID, STORE_LAYOUT, UNVERIFIED_ROLE_ID, VERIFIED_ROLE_ID, assertStoreOwner,
} from "./config.js";

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
    const unverified = roles.get(UNVERIFIED_ROLE_ID);
    const verified = roles.get(VERIFIED_ROLE_ID);
    const reviewer = roles.get(REVIEW_ROLE_ID);
    if (!unverified || unverified.managed || !unverified.editable) {
      throw new Error(`O cargo inicial ${UNVERIFIED_ROLE_ID} não existe ou está acima do cargo do bot.`);
    }
    if (!verified || verified.managed || !verified.editable) {
      throw new Error(`O cargo verificado ${VERIFIED_ROLE_ID} não existe ou está acima do cargo do bot.`);
    }
    if (!reviewer || reviewer.managed || !reviewer.editable) {
      throw new Error(`O cargo de avaliação ${REVIEW_ROLE_ID} não existe ou está acima do cargo do bot.`);
    }
    if (unverified.id === verified.id) throw new Error('Os cargos inicial e verificado precisam ser diferentes.');
    if (unverified.permissions.bitfield !== 0n) {
      await unverified.setPermissions([], 'Cargo inicial sem permissões até a verificação');
      created.push(`Permissões do cargo ${unverified.name}`);
    }
    if (reviewer.permissions.bitfield !== 0n) {
      await reviewer.setPermissions([], 'Cargo usado somente para liberar o canal de avaliações');
      created.push(`Permissões do cargo ${reviewer.name}`);
    }
    let cancellationRole = roles.get(ids.salesCancellationRole);
    if (!cancellationRole) {
      cancellationRole = await guild.roles.create({ name: SALES_CANCELLATION_ROLE_NAME, permissions: [], reason: 'Permissão de cancelar vendas pendentes da dark store' });
      ids.salesCancellationRole = cancellationRole.id;
      await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
      created.push(`Cargo ${SALES_CANCELLATION_ROLE_NAME} (cancelar vendas)`);
    }
    if (cancellationRole.managed || !cancellationRole.editable) throw new Error('O cargo de cancelamento precisa estar abaixo do cargo do bot e não pode ser gerenciado por uma integração.');
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
      const verification = "verification" in group && group.verification;
      const permissions = (readOnly: boolean, reviewOnly = false) => [
        { id: guild.id, type: OverwriteType.Role,
          allow: verification ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] : [],
          deny: verification ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] : [PermissionFlagsBits.ViewChannel] },
        { id: unverified.id, type: OverwriteType.Role,
          allow: verification ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] : [],
          deny: verification ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: verified.id, type: OverwriteType.Role,
          allow: verification || privacy || reviewOnly ? [] : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          deny: verification || privacy || reviewOnly ? [PermissionFlagsBits.ViewChannel] : readOnly ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads] : [] },
        { id: reviewer.id, type: OverwriteType.Role,
          allow: reviewOnly ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] : [],
          deny: [] },
        { id: quarantine.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: cancellationRole.id, type: OverwriteType.Role, allow: group.key === 'tickets' ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] : [], deny: [] },
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
      await category.permissionOverwrites.set(permissions(false), 'Permissões de entrada e verificação da dark store');
      for (const item of group.channels) {
        const fixedId = 'fixedId' in item ? item.fixedId : null;
        let channel = fixedId ? channels.get(fixedId) : channels.get(ids[item.key]);
        if (fixedId && !channel) throw new Error(`O canal configurado ${fixedId} não foi encontrado no servidor.`);
        if (!channel || channel.type !== item.type) {
          if (fixedId) throw new Error(`O canal configurado ${fixedId} não é um canal de texto válido.`);
          channel = item.type === 2
            ? await guild.channels.create({ name: item.name, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: permissions(false), userLimit: item.key === "supportVoice" ? 2 : 0 })
            : await guild.channels.create({ name: item.name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: permissions(item.readOnly), topic: `Loja • ${item.name} | gerenciado por /criar` });
          ids[item.key] = channel.id;
          await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
          created.push(item.name);
        }
        if (channel) {
          if (ids[item.key] !== channel.id) {
            ids[item.key] = channel.id;
            await prisma.digitalStore.update({ where: { guildId: guild.id }, data: { channelsJson: JSON.stringify(ids) } });
          }
          if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false, reason: 'Estrutura da dark store' });
          const reviewOnly = 'reviewOnly' in item && item.reviewOnly;
          await channel.permissionOverwrites.set(permissions(item.readOnly, reviewOnly), 'Permissões de entrada, verificação e avaliações da dark store');
        }
      }
    }
    const openTickets = await prisma.checkoutTicket.findMany({ where: { guildId: guild.id, deleteAt: null, status: { in: ['awaiting_confirmation', 'awaiting_payment', 'manual_fulfillment', 'delivered', 'delivery_failed'] } } });
    for (const ticket of openTickets) {
      const ticketChannel = channels.get(ticket.channelId);
      if (ticketChannel?.type === ChannelType.GuildText) await ticketChannel.permissionOverwrites.edit(cancellationRole.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: 'Acesso do cargo de cancelamento de vendas' });
    }
    await prisma.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: {
      ordersChannelId: settings.ordersChannelId ?? ids.orders, salesChannelId: settings.salesChannelId ?? ids.completed,
      verificationChannelId: ids.verificationChannel,
      discordChannelId: ids.discord,
      spotifyChannelId: ids.spotify,
      nitroChannelId: ids.nitro,
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
