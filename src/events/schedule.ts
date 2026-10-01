import { prisma } from '../lib/db.js';
import { EVENTS_GUILD } from './config.js';
export async function eventsScheduleEntries() {
  const now = new Date();
  const entries = await prisma.eventsRecord.findMany({ where: { guildId: EVENTS_GUILD, kind: { in: ['event', 'class'] }, status: 'APPROVED', endsAt: { gte: now }, startsAt: { lte: new Date(now.getTime() + 7 * 86400000) } }, orderBy: { startsAt: 'asc' }, take: 30 });
  const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return entries.map((entry, position) => {
    const local = new Date(entry.startsAt!.getTime() - 3 * 3600000);
    const data = JSON.parse(entry.body) as { title: string };
    return { id: `eventos:${entry.id}`, day: days[local.getUTCDay()]!, time: local.toISOString().slice(11, 16), label: `${entry.kind === 'class' ? 'Aulinha' : 'Evento'}: ${data.title.replace(/[@*_`~<>]/g, '')} (${local.toISOString().slice(8,10)}/${local.toISOString().slice(5,7)})`, roleId: '1542873765069856868', position: 20000 + position };
  });
}
