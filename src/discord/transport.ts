import { ChannelType, type Client, type Guild, type MessageCreateOptions, type MessageEditOptions } from 'discord.js';
import type { StoreFile, StoreTransport } from '../store/transport.js';
import { money } from '../store/product.js';

function payload(body: object, files: StoreFile[], editing: boolean) {
  const value = { ...(body as Record<string, unknown>) } as Record<string, unknown>;
  delete value.allowed_mentions;
  if (editing) delete value.flags;
  value.allowedMentions = { parse: [] };
  if (files.length) value.files = files.map(file => ({ attachment: file.data, name: file.name }));
  if (editing) value.attachments = [];
  return value;
}
function unknownMessage(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 10008;
}

export function createDiscordTransport(client: Client, guild: Guild): StoreTransport {
  const textChannel = async (channelId: string) => {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !channel.isSendable()) throw new Error('Escolha um canal de texto acessível ao bot.');
    return channel;
  };
  return {
    async checkChannel(channelId) { await textChannel(channelId); },
    async publish(channelId, messageId, body, files = []) {
      const channel = await textChannel(channelId);
      if (messageId) {
        try {
          const message = await channel.messages.fetch(messageId);
          await message.edit(payload(body, files, true) as MessageEditOptions);
          return message.id;
        } catch (error) {
          if (!unknownMessage(error)) throw error;
        }
      }
      const message = await channel.send(payload(body, files, false) as MessageCreateOptions);
      return message.id;
    },
    async delete(channelId, messageId) {
      const channel = await textChannel(channelId);
      try { await (await channel.messages.fetch(messageId)).delete(); }
      catch (error) { if (!unknownMessage(error)) throw error; }
    },
    async deliver(userId, orderId, delivery) {
      const user = await client.users.fetch(userId);
      const message = await user.send({
        content: `O pagamento do seu pedido \`${orderId}\` foi confirmado pela equipe. O item está no arquivo privado anexado.`,
        allowedMentions: { parse: [] },
        files: [{ attachment: Buffer.from(delivery, 'utf8'), name: `entrega-${orderId}.txt` }]
      });
      return message.id;
    },
    async sale(channelId, order) {
      return this.publish(channelId, null, { flags: 32768, allowed_mentions: { parse: [] }, components: [
        { type: 17, accent_color: 0xaeb1b6, components: [{ type: 10, content: `## Venda concluída\n${order.productTitle} · ${money(order.priceCents)}\n-# Pedido ${order.id}` }] }
      ] });
    }
  };
}

export function discordRuntime(client: Client, guild: Guild) {
  return {
    transport: createDiscordTransport(client, guild),
    async channels() {
      const channels = await guild.channels.fetch();
      return [...channels.values()].filter(channel => channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement)
        .map(channel => ({ id: channel!.id, name: channel!.name, type: 0 }));
    },
    async roles() {
      const roles = await guild.roles.fetch();
      return [...roles.values()].filter(role => role.id !== guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .map(role => ({ id: role.id, name: role.name, position: role.position, editable: role.editable }));
    },
    async guild() { return guild; },
    connected() { return client.isReady(); }
  };
}
