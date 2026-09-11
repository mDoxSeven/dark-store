import { prisma } from '../lib/db.js';
import { runtimeTransport } from '../runtime.js';
import { STORE_GUILD_ID } from './config.js';
import { verificationMessage } from './verificationMessage.js';

export async function refreshVerificationPanel() {
  const settings = await prisma.digitalStore.findUnique({ where: { guildId: STORE_GUILD_ID } });
  if (!settings?.verificationChannelId) return;
  const lock = await prisma.digitalStore.updateMany({
    where: { guildId: STORE_GUILD_ID, OR: [{ verificationPublishUntil: null }, { verificationPublishUntil: { lt: new Date() } }] },
    data: { verificationPublishUntil: new Date(Date.now() + 60_000) },
  });
  if (!lock.count) return;
  try {
    const messageId = await runtimeTransport().publish(settings.verificationChannelId, settings.verificationMessageId, verificationMessage());
    await prisma.digitalStore.update({ where: { guildId: STORE_GUILD_ID }, data: { verificationMessageId: messageId } });
  } finally {
    await prisma.digitalStore.updateMany({ where: { guildId: STORE_GUILD_ID }, data: { verificationPublishUntil: null } });
  }
}
