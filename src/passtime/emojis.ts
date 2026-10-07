import type { Client } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { PASSTIME_GUILD_ID } from './config.js';

const definitions = {
  heart: { name: 'passtime_heart', file: 'passtime-heart.png', fallback: '💗' },
  bow: { name: 'passtime_bow', file: 'passtime-bow.png', fallback: '🎀' },
  star: { name: 'passtime_star', file: 'passtime-star.png', fallback: '🌟' },
  note: { name: 'passtime_note', file: 'passtime-note.png', fallback: '📝' },
  heartPulse: { name: 'passtime_heart_pulse', file: 'passtime-heart-pulse.gif', fallback: '💕' },
  starTwinkle: { name: 'passtime_star_twinkle', file: 'passtime-star-twinkle.gif', fallback: '✨' },
} as const;

export type PasstimeEmojiKey = keyof typeof definitions;
const emojis = new Map<PasstimeEmojiKey, { id: string; name: string; animated: boolean; mention: string }>();

export const passtimeEmoji = (key: PasstimeEmojiKey) => emojis.get(key)?.mention ?? definitions[key].fallback;
export const passtimeButtonEmoji = (key: PasstimeEmojiKey) => {
  const emoji = emojis.get(key);
  return emoji ? { id: emoji.id, name: emoji.name, animated: emoji.animated } : { name: definitions[key].fallback };
};

export async function syncPasstimeEmojis(client: Client) {
  const guild = await client.guilds.fetch(PASSTIME_GUILD_ID);
  const existing = await guild.emojis.fetch();
  for (const [key, definition] of Object.entries(definitions) as Array<[PasstimeEmojiKey, typeof definitions[PasstimeEmojiKey]]>) {
    const emoji = existing.find(item => item.name === definition.name) ?? await guild.emojis.create({
      name: definition.name,
      attachment: fileURLToPath(new URL(`../../assets/passtime/emojis/${definition.file}`, import.meta.url)),
      reason: 'Identidade rosa e cute do Passtime Alta',
    });
    emojis.set(key, {
      id: emoji.id,
      name: emoji.name ?? definition.name,
      animated: Boolean(emoji.animated),
      mention: emoji.toString(),
    });
  }
  return emojis.size;
}
