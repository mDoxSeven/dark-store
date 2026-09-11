import { prisma } from '../lib/db.js';
import { runtimeTransport } from '../runtime.js';
import { STORE_GUILD_ID } from './config.js';
import { discordCatalogMessage } from './discordMessage.js';

export async function refreshDiscordCatalog() {
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  if (!settings?.discordChannelId) return;
  const lock = await prisma.digitalStore.updateMany({
    where: { guildId: STORE_GUILD_ID, OR: [{ discordPublishUntil: null }, { discordPublishUntil: { lt: new Date() } }] },
    data: { discordPublishUntil: new Date(Date.now() + 60_000) },
  });
  if (!lock.count) return;
  try {
    const records = await prisma.digitalProduct.findMany({
      where: { guildId: STORE_GUILD_ID, active: true },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { stock: { where: { claimedAt: null } } } } },
    });
    const products = records
      .filter(product => product.category.trim().toLocaleLowerCase('pt-BR') === 'discord')
      .map(product => ({ ...product, stock: product._count.stock + product.manualStock }));
    const messageId = await runtimeTransport().publish(settings.discordChannelId, settings.discordMessageId, discordCatalogMessage(products));
    await prisma.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: { discordMessageId: messageId } });
  } finally {
    await prisma.digitalStore.updateMany({ where: { guildId: STORE_GUILD_ID }, data: { discordPublishUntil: null } });
  }
}
