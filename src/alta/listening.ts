import {
  ActivityType,
  type Activity,
  type Message,
  type MessageCreateOptions,
} from 'discord.js';
import { ALTA_GUILD_ID } from './rise.js';

export const ALTA_LISTENING_COMMAND = 'alta!ouvindo';
export const ALTA_SPOTIFY_EMOJI = '<a:spotify:1552396972013396008>';
export const ALTA_SPOTIFY_EMOJI_ID = '1552396972013396008';
export const ALTA_SPOTIFY_ACCENT = 0x1db954;

export interface AltaSpotifyTrack {
  title: string;
  artists: string;
  album: string;
  trackId: string | null;
  coverUrl: string | null;
  startedAt: number | null;
  endsAt: number | null;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function duration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function progress(track: AltaSpotifyTrack, now: number) {
  if (track.startedAt === null || track.endsAt === null || track.endsAt <= track.startedAt) {
    return { bar: '━━━━━━━━━━━━', elapsed: '0:00', total: '—' };
  }
  const total = track.endsAt - track.startedAt;
  const elapsed = clamp(now - track.startedAt, 0, total);
  const completed = clamp(Math.round(elapsed / total * 12), 0, 12);
  return {
    bar: `${'━'.repeat(completed)}${completed < 12 ? '●' : ''}${'─'.repeat(Math.max(0, 11 - completed))}`,
    elapsed: duration(elapsed),
    total: duration(total),
  };
}

export function spotifyTrackFromActivity(activity: Activity): AltaSpotifyTrack {
  return {
    title: activity.details?.trim() || 'Faixa desconhecida',
    artists: activity.state?.trim() || 'Artista desconhecido',
    album: activity.assets?.largeText?.trim() || 'Álbum não informado',
    trackId: activity.syncId?.trim() || null,
    coverUrl: activity.assets?.largeImageURL({ size: 1024 }) ?? null,
    startedAt: activity.timestamps?.start?.getTime() ?? null,
    endsAt: activity.timestamps?.end?.getTime() ?? null,
  };
}

export function isSpotifyPresenceActivity(activity: Pick<Activity, 'name' | 'type' | 'syncId' | 'details' | 'state' | 'assets'>) {
  const name = activity.name.trim().toLocaleLowerCase('pt-BR');
  const largeImage = activity.assets?.largeImage ?? '';
  return name.includes('spotify')
    || largeImage.startsWith('spotify:')
    || activity.type === ActivityType.Listening && Boolean(activity.syncId && activity.details && activity.state);
}

export function altaListeningMessage(userId: string, track: AltaSpotifyTrack, now = Date.now(), spotifyEmoji = ALTA_SPOTIFY_EMOJI): MessageCreateOptions {
  const playback = progress(track, now);
  const content = [
    `${spotifyEmoji} **SPOTIFY  ·  TOCANDO AGORA**`,
    `# ${track.title}`,
    `### ${track.artists}`,
    `💿 ${track.album}`,
    '',
    `\`${playback.elapsed}\`  ${playback.bar}  \`${playback.total}\``,
    '',
    `-# <@${userId}> está ouvindo esta faixa agora.`,
  ].join('\n');
  const main = track.coverUrl ? {
    type: 9,
    components: [{ type: 10, content }],
    accessory: { type: 11, media: { url: track.coverUrl }, description: `Capa de ${track.title}` },
  } : { type: 10, content };
  const components: Array<Record<string, unknown>> = [
    main,
    { type: 14, divider: true, spacing: 1 },
  ];
  if (track.trackId) components.push({
    type: 1,
    components: [{
      type: 2,
      style: 5,
      label: 'Ouvir no Spotify',
      emoji: { name: '🎧' },
      url: `https://open.spotify.com/track/${encodeURIComponent(track.trackId)}`,
    }],
  }, { type: 14, divider: true, spacing: 1 });
  components.push({ type: 10, content: '-# Alta Cúpula  ·  Angel Music' });
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [{ type: 17, accent_color: ALTA_SPOTIFY_ACCENT, components }],
  } as unknown as MessageCreateOptions;
}

export function isAltaListeningCommand(content: string) {
  return content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR') === ALTA_LISTENING_COMMAND;
}

export async function handleAltaListeningCommand(message: Message) {
  if (!isAltaListeningCommand(message.content)) return false;
  if (!message.inGuild() || message.guildId !== ALTA_GUILD_ID) {
    await message.reply({ content: 'O `alta!ouvindo` funciona somente no servidor oficial da Alta.', allowedMentions: { repliedUser: false } });
    return true;
  }
  if (message.content.trim().split(/\s+/).length !== 1) {
    await message.reply({ content: 'Use apenas `alta!ouvindo` para mostrar a música que você está escutando.', allowedMentions: { repliedUser: false } });
    return true;
  }
  if (process.env.DARK_SPOTIFY_PRESENCE_ENABLED !== 'true') {
    await message.reply({ content: 'A leitura do Spotify ainda não foi ativada no Angel.', allowedMentions: { repliedUser: false } });
    return true;
  }
  const presence = message.guild.presences.cache.get(message.author.id) ?? message.member?.presence;
  const activities = presence?.activities ?? [];
  const activity = activities.find(isSpotifyPresenceActivity);
  const spotifyEmoji = message.client.emojis.cache.has(ALTA_SPOTIFY_EMOJI_ID) ? ALTA_SPOTIFY_EMOJI : '🟢';
  if (!activity) {
    const received = activities.length
      ? activities.map(item => `${item.name}[${item.type}]`).join(', ')
      : 'nenhuma';
    console.warn(`[alta!ouvindo] Spotify não localizado para ${message.author.id}; status=${presence?.status ?? 'ausente'}; atividades=${received}`);
    await message.reply({
      content: `${spotifyEmoji} O Discord ainda não entregou sua atividade do Spotify ao Angel. Confirme se ela aparece para **outro membro** deste servidor e tente novamente em alguns segundos.`,
      allowedMentions: { repliedUser: false },
    });
    return true;
  }
  await message.channel.send(altaListeningMessage(message.author.id, spotifyTrackFromActivity(activity), Date.now(), spotifyEmoji));
  return true;
}
