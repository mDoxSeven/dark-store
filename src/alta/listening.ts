import {
  ActivityType,
  type Activity,
  type Message,
  type MessageCreateOptions,
  type Presence,
} from 'discord.js';
import { ALTA_GUILD_ID } from './rise.js';
import { renderListeningCard } from './listeningCard.js';
import {
  createSpotifyAuthorization, resetSpotifyConnection, spotifyCurrentlyPlaying, spotifyOAuthConfigured,
} from './spotifyOAuth.js';

export const ALTA_LISTENING_COMMAND = 'alta!ouvindo';
export const ALTA_SPOTIFY_EMOJI = '<a:spotify:1554212340277186680>';
export const ALTA_SPOTIFY_EMOJI_ID = '1554212340277186680';
export const ALTA_SPOTIFY_ACCENT = 0x1db954;

export interface AltaSpotifyTrack {
  title: string;
  artists: string;
  album: string;
  trackId: string | null;
  spotifyUrl?: string | null;
  coverUrl: string | null;
  startedAt: number | null;
  endsAt: number | null;
}

const spotifyPresenceCache = new Map<string, { activity: Activity; seenAt: number }>();
const rawPresenceDiagnostics = new Map<string, string>();
const presenceKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function duration(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function progress(track: AltaSpotifyTrack, now: number) {
  if (track.startedAt === null || track.endsAt === null || track.endsAt <= track.startedAt) {
    return { bar: '●─────────────', elapsed: '0:00', total: '—' };
  }
  const total = track.endsAt - track.startedAt;
  const elapsed = clamp(now - track.startedAt, 0, total);
  const completed = clamp(Math.round(elapsed / total * 14), 0, 14);
  return {
    bar: completed >= 14
      ? '━━━━━━━━━━━━━━●'
      : `${'━'.repeat(completed)}●${'─'.repeat(14 - completed)}`,
    elapsed: duration(elapsed),
    total: duration(total),
  };
}

const discordText = (value: string, maximum = 100) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  const shortened = compact.length > maximum ? `${compact.slice(0, maximum - 1)}…` : compact;
  return shortened.replace(/([\\`*_~|>])/g, '\\$1');
};

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

export function rememberAltaSpotifyPresence(presence: Presence) {
  if (presence.guild?.id !== ALTA_GUILD_ID) return false;
  const activity = presence.activities.find(isSpotifyPresenceActivity);
  if (!activity) { spotifyPresenceCache.delete(presenceKey(presence.guild.id, presence.userId)); return false; }
  spotifyPresenceCache.set(presenceKey(presence.guild.id, presence.userId), { activity, seenAt: Date.now() });
  return true;
}

interface RawActivity {
  name?: string;
  type?: number;
  details?: string | null;
  state?: string | null;
  sync_id?: string | null;
  timestamps?: { start?: number | string; end?: number | string };
  assets?: { large_image?: string | null; large_text?: string | null };
}

interface RawPresencePacket {
  t?: string;
  d?: {
    guild_id?: string;
    user?: { id?: string };
    activities?: RawActivity[];
    presences?: Array<{ user?: { id?: string }; activities?: RawActivity[] }>;
  };
}

function rememberRawActivities(guildId: string, userId: string, activities: RawActivity[]) {
  const key = presenceKey(guildId, userId);
  rawPresenceDiagnostics.set(key, activities.length
    ? activities.map(item => `${item.name ?? 'sem-nome'}[${item.type ?? '?'}]`).join(', ')
    : 'nenhuma');
  const raw = activities.find(item => {
    const name = item.name?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const image = item.assets?.large_image ?? '';
    return name.includes('spotify') || image.startsWith('spotify:')
      || item.type === ActivityType.Listening && Boolean(item.sync_id && item.details && item.state);
  });
  if (!raw) { spotifyPresenceCache.delete(key); return false; }
  const largeImage = raw.assets?.large_image ?? null;
  const activity = {
    name: raw.name ?? 'Spotify',
    type: raw.type ?? ActivityType.Listening,
    details: raw.details ?? null,
    state: raw.state ?? null,
    syncId: raw.sync_id ?? null,
    timestamps: raw.timestamps ? {
      start: raw.timestamps.start ? new Date(Number(raw.timestamps.start)) : null,
      end: raw.timestamps.end ? new Date(Number(raw.timestamps.end)) : null,
    } : null,
    assets: raw.assets ? {
      largeImage,
      largeText: raw.assets.large_text ?? null,
      largeImageURL: () => largeImage?.startsWith('spotify:')
        ? `https://i.scdn.co/image/${largeImage.slice('spotify:'.length)}`
        : null,
    } : null,
  } as unknown as Activity;
  spotifyPresenceCache.set(key, { activity, seenAt: Date.now() });
  return true;
}

export function rememberRawAltaSpotifyPresence(value: unknown) {
  const packet = value as RawPresencePacket;
  const guildId = packet.d?.guild_id;
  if (guildId !== ALTA_GUILD_ID) return false;
  if (packet.t === 'PRESENCE_UPDATE') {
    const userId = packet.d?.user?.id;
    return userId ? rememberRawActivities(guildId, userId, packet.d?.activities ?? []) : false;
  }
  if (packet.t === 'GUILD_MEMBERS_CHUNK') {
    let captured = false;
    for (const presence of packet.d?.presences ?? []) {
      const userId = presence.user?.id;
      if (userId && rememberRawActivities(guildId, userId, presence.activities ?? [])) captured = true;
    }
    return captured;
  }
  return false;
}

function recentSpotifyActivity(guildId: string, userId: string, now = Date.now()) {
  const key = presenceKey(guildId, userId);
  const cached = spotifyPresenceCache.get(key);
  if (!cached) return null;
  const trackEnd = cached.activity.timestamps?.end?.getTime();
  const expiresAt = trackEnd ?? cached.seenAt + 120_000;
  if (now >= expiresAt) {
    spotifyPresenceCache.delete(key);
    return null;
  }
  return cached.activity;
}

export function altaListeningMessage(userId: string, track: AltaSpotifyTrack, now = Date.now(), spotifyEmoji = ALTA_SPOTIFY_EMOJI, card?: Buffer): MessageCreateOptions {
  const playback = progress(track, now);
  const title = discordText(track.title, 90);
  const artists = discordText(track.artists, 120);
  const album = discordText(track.album, 100);
  const trackDetails = [
    `${spotifyEmoji} **SPOTIFY  ·  TOCANDO AGORA**`,
    `## ${title}`,
    `**${artists}**`,
    `-# 💿 ${album}`,
  ].join('\n');
  const main = track.coverUrl ? {
    type: 9,
    components: [{ type: 10, content: trackDetails }],
    accessory: { type: 11, media: { url: track.coverUrl }, description: `Capa de ${discordText(track.title, 60)}` },
  } : { type: 10, content: trackDetails };
  const components: Array<Record<string, unknown>> = [
    main,
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: [
      `\`${playback.elapsed}\`  ${playback.bar}  \`${playback.total}\``,
      '-# ▶ Reproduzindo agora pelo Spotify',
    ].join('\n') },
  ];
  const spotifyUrl = track.spotifyUrl ?? (track.trackId ? `https://open.spotify.com/track/${encodeURIComponent(track.trackId)}` : null);
  if (card) return {
    flags: 32768,
    allowedMentions: { parse: [] },
    files: [{ attachment: card, name: 'alta-ouvindo.gif' }],
    components: [
      { type: 10, content: `## ${spotifyEmoji} Tocando Agora\n• **${title}**` },
      { type: 12, items: [{ media: { url: 'attachment://alta-ouvindo.gif' }, description: `${title} — ${artists}. ${playback.elapsed} / ${playback.total}` }] },
      ...(spotifyUrl ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Ouvir no Spotify', url: spotifyUrl }] }] : []),
    ],
  } as unknown as MessageCreateOptions;
  if (spotifyUrl) components.push({
    type: 14,
    divider: true,
    spacing: 1,
  }, {
    type: 1,
    components: [{
      type: 2,
      style: 5,
      label: 'Ouvir no Spotify',
      emoji: spotifyEmoji === ALTA_SPOTIFY_EMOJI
        ? { id: ALTA_SPOTIFY_EMOJI_ID, name: 'spotify', animated: true }
        : { name: '🎧' },
      url: spotifyUrl,
    }],
  });
  components.push(
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: `-# ✦ <@${userId}>  ·  Alta Cúpula  ·  Angel Music` },
  );
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [
      { type: 10, content: [
        '## 🎶  |  Tocando Agora',
        `• **${title}**`,
      ].join('\n') },
      { type: 17, accent_color: ALTA_SPOTIFY_ACCENT, components },
    ],
  } as unknown as MessageCreateOptions;
}

export function altaSpotifyConnectMessage(authorizeUrl: string, spotifyEmoji = ALTA_SPOTIFY_EMOJI, reconnect = false): MessageCreateOptions {
  return {
    flags: 32768,
    allowedMentions: { parse: [] },
    components: [{
      type: 17,
      accent_color: ALTA_SPOTIFY_ACCENT,
      components: [
        { type: 10, content: [
          `${spotifyEmoji} # CONECTAR SPOTIFY`,
          reconnect
            ? 'Sua autorização expirou ou foi revogada. Conecte novamente para renovar o acesso.'
            : 'Conecte sua conta uma única vez para o Angel consultar diretamente o que está tocando.',
          '',
          '> O Angel solicitará somente permissão para **ler a faixa atual**. Ele não poderá controlar sua conta, playlists ou reprodução.',
        ].join('\n') },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 5, label: reconnect ? 'Reconectar Spotify' : 'Conectar Spotify', emoji: { name: '🎧' }, url: authorizeUrl }] },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: '-# Alta Cúpula  ·  Conexão segura pelo Spotify OAuth' },
      ],
    }],
  } as unknown as MessageCreateOptions;
}

export function isAltaListeningCommand(content: string) {
  return content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR') === ALTA_LISTENING_COMMAND;
}

export async function sendAltaListeningCard(message: Message, payload: MessageCreateOptions) {
  if (!message.inGuild() || message.guildId !== ALTA_GUILD_ID) return;
  try {
    await message.delete();
  } catch (error) {
    console.warn(`[alta!ouvindo] Não foi possível apagar o comando ${message.id}: ${error instanceof Error ? error.message : error}`);
  }
  // Send independently: the original command may already have been deleted.
  await message.channel.send(payload);
}

async function sendRenderedListeningCard(message: Message, track: AltaSpotifyTrack, spotifyEmoji: string) {
  const now = Date.now();
  let card: Buffer | undefined;
  try {
    card = await renderListeningCard(track, message.member?.displayName ?? message.author.displayName,
      message.author.displayAvatarURL({ extension: 'png', size: 64 }), now);
  } catch (error) {
    console.warn(`[alta!ouvindo] Card visual indisponível: ${error instanceof Error ? error.message : error}`);
  }
  await sendAltaListeningCard(message, altaListeningMessage(message.author.id, track, now, spotifyEmoji, card));
}

export async function findAltaSpotifyActivity(message: Message, refresh = false): Promise<Activity | null> {
  if (!message.inGuild() || message.guildId !== ALTA_GUILD_ID || process.env.DARK_SPOTIFY_PRESENCE_ENABLED !== 'true') return null;
  const current = () => {
    const presence = message.guild.presences.cache.get(message.author.id) ?? message.guild.members.cache.get(message.author.id)?.presence ?? message.member?.presence;
    const activity = presence?.activities.find(isSpotifyPresenceActivity);
    // Don't reuse an ended track as "playing now".
    if (activity && (!activity.timestamps?.end || activity.timestamps.end.getTime() > Date.now())) return activity;
    return recentSpotifyActivity(message.guildId, message.author.id);
  };
  const cached = current();
  if (cached || !refresh) return cached;
  await message.guild.members.fetch({ user: [message.author.id], withPresences: true, time: 8_000 })
    .catch(error => console.warn(`[alta!ouvindo] atualização forçada falhou para ${message.author.id}: ${error instanceof Error ? error.message : error}`));
  return current();
}

export async function handleAltaListeningCommand(message: Message) {
  if (!isAltaListeningCommand(message.content)) return false;
  if (!message.inGuild() || message.guildId !== ALTA_GUILD_ID) {
    await message.reply({ content: 'O `alta!ouvindo` funciona somente no servidor oficial da Alta.', allowedMentions: { repliedUser: false } });
    return true;
  }
  const parts = message.content.trim().toLocaleLowerCase('pt-BR').split(/\s+/);
  if (parts.length > 2 || (parts.length === 2 && !['reconectar', 'resetar'].includes(parts[1]!))) {
    await message.reply({ content: 'Use `alta!ouvindo` para mostrar a música ou `alta!ouvindo reconectar` para refazer sua conexão.', allowedMentions: { repliedUser: false } });
    return true;
  }
  const spotifyEmoji = message.client.emojis.cache.has(ALTA_SPOTIFY_EMOJI_ID) ? ALTA_SPOTIFY_EMOJI : '🟢';
  if (parts.length === 2) {
    if (!spotifyOAuthConfigured()) {
      await message.reply({ content: 'O Spotify OAuth ainda não foi configurado no Angel.', allowedMentions: { repliedUser: false } });
      return true;
    }
    const authorizeUrl = await createSpotifyAuthorization(message.author.id);
    const delivered = await message.author.send(altaSpotifyConnectMessage(authorizeUrl, spotifyEmoji, true)).then(() => true).catch(() => false);
    if (!delivered) {
      await message.reply({ content: 'Não consegui enviar o novo botão. Libere mensagens diretas deste servidor e tente novamente.', allowedMentions: { repliedUser: false } });
      return true;
    }
    const removed = await resetSpotifyConnection(message.author.id);
    await message.delete().catch(() => {});
    await message.channel.send({ content: `${spotifyEmoji} <@${message.author.id}>, ${removed ? 'sua conexão antiga foi removida e o novo botão está' : 'o botão de conexão está'} no seu privado.`, allowedMentions: { users: [message.author.id] } });
    return true;
  }
  let refreshedPresence = false;
  const sendFromDiscord = async (refresh: boolean) => {
    if (refresh && refreshedPresence) return false;
    if (refresh) refreshedPresence = true;
    const activity = await findAltaSpotifyActivity(message, refresh);
    if (!activity) return false;
    console.log(`[alta!ouvindo] fonte=discord usuario=${message.author.id}`);
    await sendRenderedListeningCard(message, spotifyTrackFromActivity(activity), spotifyEmoji);
    return true;
  };
  // Visible activity works independently of Spotify's app allowlist.
  if (await sendFromDiscord(false)) return true;
  if (spotifyOAuthConfigured()) {
    try {
      const playback = await spotifyCurrentlyPlaying(message.author.id);
      if (playback.status === 'playing') {
        await sendRenderedListeningCard(message, {
          ...playback.track,
          trackId: null,
        }, spotifyEmoji);
        return true;
      }
      if (await sendFromDiscord(true)) return true;
      if (playback.status === 'not_connected' || playback.status === 'reauthorize') {
        const authorizeUrl = await createSpotifyAuthorization(message.author.id);
        const delivered = await message.author.send(altaSpotifyConnectMessage(authorizeUrl, spotifyEmoji, playback.status === 'reauthorize'))
          .then(() => true).catch(() => false);
        await message.reply({
          content: delivered
            ? `${spotifyEmoji} Enviei o botão seguro de conexão no seu privado.`
            : 'Não consegui enviar o botão no seu privado. Libere mensagens diretas deste servidor e tente novamente.',
          allowedMentions: { repliedUser: false },
        });
        return true;
      }
      await message.reply({
        content: `${spotifyEmoji} Sua conta está conectada, mas o Spotify não informou nenhuma faixa tocando agora. Dê play e tente novamente.`,
        allowedMentions: { repliedUser: false },
      });
      return true;
    } catch (error) {
      console.error(`alta!ouvindo OAuth: ${error instanceof Error ? error.message : error}`);
      if (await sendFromDiscord(true)) return true;
      const blocked = error instanceof Error && error.message.includes('recusou o acesso à reprodução');
      await message.channel.send({ content: blocked
        ? 'O Spotify bloqueou a consulta desta conta no aplicativo do Angel. A administração precisa autorizar sua conta em Users Management. Também tente compartilhar sua atividade do Spotify no Discord para usar a captura alternativa.'
        : 'Não consegui consultar ou exibir o Spotify agora. Aguarde um pouco e tente novamente.', allowedMentions: { parse: [] } });
      return true;
    }
  }
  if (process.env.DARK_SPOTIFY_PRESENCE_ENABLED !== 'true') {
    await message.reply({ content: 'O Spotify OAuth ainda não foi configurado no Angel.', allowedMentions: { repliedUser: false } });
    return true;
  }
  if (await sendFromDiscord(true)) return true;
  {
    const presence = message.guild.presences.cache.get(message.author.id) ?? message.member?.presence;
    const activities = presence?.activities ?? [];
    const received = activities.length
      ? activities.map(item => `${item.name}[${item.type}]`).join(', ')
      : 'nenhuma';
    const rawReceived = rawPresenceDiagnostics.get(presenceKey(message.guildId, message.author.id)) ?? 'nenhum pacote recebido';
    console.warn(`[alta!ouvindo] Spotify não localizado para ${message.author.id}; status=${presence?.status ?? 'ausente'}; atividades=${received}; bruto=${rawReceived}`);
    await message.reply({
      content: `${spotifyEmoji} O Discord ainda não entregou sua atividade do Spotify ao Angel. Confirme se ela aparece para **outro membro** deste servidor e tente novamente em alguns segundos.`,
      allowedMentions: { repliedUser: false },
    });
    return true;
  }
}
