import type { Client } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { LEADERSHIP_GUILD_ID } from '../leadership/config.js';

const fallback = { clipboard: '▣', arrow: '»', dot: '•', check: '✓', cross: '×', clock: '◷' };
type RecIcon = keyof typeof fallback;
const icons = new Map<RecIcon, string>();
export const recEmoji = (key: RecIcon) => icons.get(key) ?? fallback[key];
export function recButtonEmoji(key: RecIcon) {
  const custom = icons.get(key)?.match(/<(a?):([^:]+):(\d+)>/);
  return custom ? { name: custom[2], id: custom[3], animated: custom[1] === 'a' } : undefined;
}

export async function syncRecruitmentEmojis(client: Client) {
  const guild = await client.guilds.fetch(LEADERSHIP_GUILD_ID);
  const existing = await guild.emojis.fetch();
  for (const key of Object.keys(fallback) as RecIcon[]) {
    const name = `alta_rec_chrome_${key}`;
    const emoji = existing.find(item => item.name === name) ?? await guild.emojis.create({
      name,
      attachment: fileURLToPath(new URL(`../../public/rec-emojis/${key}.png`, import.meta.url)),
      reason: 'Emojis cromados das fichas de recrutamento da Alta',
    });
    icons.set(key, emoji.toString());
  }
}
