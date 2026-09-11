import { randomBytes, randomUUID } from 'node:crypto';
import type { Guild } from 'discord.js';
import { prisma } from './db.js';
import { APPLICATION_ID, STORE_GUILD_ID, STORE_LAYOUT } from '../store/config.js';
import type { StoreTransport } from '../store/transport.js';
import { money } from '../store/product.js';

export async function localChannels() {
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const ids = JSON.parse(settings?.channelsJson || '{}') as Record<string, string>;
  return STORE_LAYOUT.flatMap(group => [
    { id: ids[group.key], key: group.key, name: group.name, type: 4, private: 'private' in group },
    ...group.channels.map(c => ({ ...c, id: ids[c.key], private: 'private' in group }))
  ]).filter(c => c.id);
}
export function localTransport(failDM = false): StoreTransport {
  return {
    async checkChannel(id) {
      if (!(await localChannels()).some(c => c.id === id && c.type === 0)) throw new Error('Escolha um canal de texto da estrutura local.');
    },
    async publish(channelId, messageId, body, files = []) {
      await this.checkChannel(channelId);
      const id = messageId || randomUUID();
      const serialized = JSON.stringify({ ...body, localFiles: files.map(file => file.name) });
      await prisma.localMessage.upsert({ where: { id }, create: { id, channelId, body: serialized }, update: { body: serialized } });
      return id;
    },
    async delete(_channelId, messageId) { await prisma.localMessage.deleteMany({ where: { id: messageId } }); },
    async deliver(_userId, orderId, _payload) {
      if (failDM) throw new Error('Falha de DM simulada');
      // Never write private stock to messages/logs. A receipt identifies the simulation only.
      return `local-delivery-${orderId}`;
    },
    async sale(channelId, order) {
      return this.publish(channelId, null, { flags: 32768, allowed_mentions: { parse: [] }, components: [
        { type: 17, accent_color: 0xaeb1b6, components: [{ type: 10, content: `## Venda simulada\n${order.productTitle} · ${money(order.priceCents)}\nNenhum pagamento ou envio real.` }] }
      ] });
    }
  };
}
// Duck-typed Guild adapter exercising the same /criar handler, entirely in memory/SQLite.
export async function localGuild(): Promise<Guild> {
  const records = new Map((await localChannels()).map(c => [c.id, c]));
  const wrap = (c: { id: string; type: number }) => ({ ...c, isTextBased: () => c.type === 0,
    permissionOverwrites: { edit: async () => {} },
    send: async (body: object) => ({ id: await localTransport().publish(c.id, null, body) }) });
  const channels = {
    async fetch(id?: string) { return id ? (records.has(id) ? wrap(records.get(id)!) : null) : new Map([...records].map(([key, value]) => [key, wrap(value)])); },
    async create(input: { name: string; type: number }) {
      const id = (1_600_000_000_000_000_000n + BigInt('0x' + randomBytes(6).toString('hex'))).toString();
      const channel = { id, name: input.name, type: input.type, key: '', private: false };
      records.set(id, channel);
      return wrap(channel);
    }
  };
  const savedStore = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const savedIds = JSON.parse(savedStore?.channelsJson || '{}') as Record<string, string>;
  const roleRecords = new Map<string, { id: string; managed: boolean }>();
  if (savedIds.quarantineRole) roleRecords.set(savedIds.quarantineRole, { id: savedIds.quarantineRole, managed: false });
  const roles = {
    async fetch() { return roleRecords; },
    async create() {
      const id = (1_700_000_000_000_000_000n + BigInt('0x' + randomBytes(6).toString('hex'))).toString();
      const role = { id, managed: false }; roleRecords.set(id, role); return role;
    }
  };
  return { id: STORE_GUILD_ID, channels, roles, members: { fetchMe: async () => ({ id: APPLICATION_ID, permissions: { has: () => true } }) } } as unknown as Guild;
}
