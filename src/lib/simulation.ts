import { randomBytes, randomUUID } from 'node:crypto';
import type { Guild } from 'discord.js';
import { prisma } from './db.js';
import { APPLICATION_ID, REVIEW_ROLE_ID, REVIEWS_CHANNEL_ID, STORE_GUILD_ID, STORE_LAYOUT, UNVERIFIED_ROLE_ID, VERIFIED_ROLE_ID } from '../store/config.js';
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
  if (!records.has(REVIEWS_CHANNEL_ID)) records.set(REVIEWS_CHANNEL_ID, { id: REVIEWS_CHANNEL_ID, key: 'reviews', name: 'avaliacoes', type: 0, readOnly: false, private: false });
  const wrap = (c: { id: string; type: number; parentId?: string | null }) => ({ ...c, isTextBased: () => c.type === 0,
    permissionOverwrites: { edit: async () => {}, set: async () => {} },
    setParent: async (parentId: string) => { c.parentId = parentId; return wrap(c); },
    send: async (body: object) => ({ id: await localTransport().publish(c.id, null, body) }) });
  const channels = {
    async fetch(id?: string) { return id ? (records.has(id) ? wrap(records.get(id)!) : null) : new Map([...records].map(([key, value]) => [key, wrap(value)])); },
    async create(input: { name: string; type: number; parent?: string }) {
      const id = (1_600_000_000_000_000_000n + BigInt('0x' + randomBytes(6).toString('hex'))).toString();
      const channel = { id, name: input.name, type: input.type, key: '', private: false, parentId: input.parent || null };
      records.set(id, channel);
      return wrap(channel);
    }
  };
  const savedStore = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  const savedIds = JSON.parse(savedStore?.channelsJson || '{}') as Record<string, string>;
  type LocalRole = { id: string; name: string; managed: boolean; editable: boolean; permissions: { bitfield: bigint }; setPermissions(value: unknown): Promise<LocalRole> };
  const makeRole = (id: string, name: string): LocalRole => {
    const role: LocalRole = { id, name, managed: false, editable: true, permissions: { bitfield: 0n }, async setPermissions() { role.permissions.bitfield = 0n; return role; } };
    return role;
  };
  const roleRecords = new Map<string, LocalRole>();
  roleRecords.set(UNVERIFIED_ROLE_ID, makeRole(UNVERIFIED_ROLE_ID, 'Entrada'));
  roleRecords.set(VERIFIED_ROLE_ID, makeRole(VERIFIED_ROLE_ID, 'Verificado'));
  roleRecords.set(REVIEW_ROLE_ID, makeRole(REVIEW_ROLE_ID, 'Cliente'));
  if (savedIds.quarantineRole) roleRecords.set(savedIds.quarantineRole, makeRole(savedIds.quarantineRole, 'Quarentena'));
  const roles = {
    async fetch() { return roleRecords; },
    async create(input?: { name?: string }) {
      const id = (1_700_000_000_000_000_000n + BigInt('0x' + randomBytes(6).toString('hex'))).toString();
      const role = makeRole(id, input?.name || 'Cargo'); roleRecords.set(id, role); return role;
    }
  };
  return { id: STORE_GUILD_ID, channels, roles, members: { fetchMe: async () => ({ id: APPLICATION_ID, permissions: { has: () => true } }) } } as unknown as Guild;
}
