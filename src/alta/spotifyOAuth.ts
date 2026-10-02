import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DATA } from '../lib/paths.js';
import { prisma } from '../lib/db.js';
import { sealStock, unsealStock } from '../store/crypto.js';

const SPOTIFY_SCOPE = 'user-read-currently-playing';
const STATE_LIFETIME_MS = 10 * 60_000;
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const PLAYBACK_URL = 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  redirect: URL;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

class SpotifyTokenError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

interface SpotifyImage { url?: string; width?: number; height?: number }
interface SpotifyPlaybackResponse {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: {
    id?: string;
    name?: string;
    type?: string;
    duration_ms?: number;
    external_urls?: { spotify?: string };
    artists?: Array<{ name?: string }>;
    album?: { name?: string; images?: SpotifyImage[] };
    show?: { name?: string; publisher?: string };
    images?: SpotifyImage[];
  } | null;
}

export interface SpotifyPlaybackTrack {
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string | null;
  coverUrl: string | null;
  startedAt: number | null;
  endsAt: number | null;
}

export type SpotifyPlaybackResult =
  | { status: 'playing'; track: SpotifyPlaybackTrack }
  | { status: 'not_connected' | 'nothing_playing' | 'configuration_missing' | 'reauthorize' };

function configuration(): SpotifyConfig | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? '';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim() ?? '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  let redirect: URL;
  try { redirect = new URL(redirectUri); } catch { throw new Error('SPOTIFY_REDIRECT_URI inválida.'); }
  const loopback = ['127.0.0.1', '[::1]'].includes(redirect.hostname);
  if (redirect.protocol !== 'https:' && !(loopback && redirect.protocol === 'http:')) {
    throw new Error('SPOTIFY_REDIRECT_URI precisa usar HTTPS fora de loopback.');
  }
  if (redirect.search || redirect.hash) throw new Error('SPOTIFY_REDIRECT_URI não pode ter query ou fragmento.');
  return { clientId, clientSecret, redirectUri: redirect.toString(), redirect };
}

export function spotifyOAuthConfigured() {
  return Boolean(configuration());
}

export async function resetSpotifyConnection(discordUserId: string) {
  if (!/^\d{17,20}$/.test(discordUserId)) throw new Error('Usuário do Discord inválido.');
  const [connection] = await prisma.$transaction([
    prisma.spotifyConnection.deleteMany({ where: { discordUserId } }),
    prisma.spotifyOAuthState.deleteMany({ where: { discordUserId } }),
  ]);
  return connection.count > 0;
}

export function spotifyOAuthCallbackMatches(host: string, path: string) {
  const config = configuration();
  return Boolean(config && host === config.redirect.host && path === config.redirect.pathname);
}

function hashState(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function spotifyKey(create = false) {
  await mkdir(DATA, { recursive: true });
  const path = resolve(DATA, 'spotify-oauth.key');
  let value: string;
  try { value = await readFile(path, 'utf8'); }
  catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Chave privada do Spotify indisponível.');
    const generated = randomBytes(32).toString('hex');
    try {
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(generated); } finally { await file.close(); }
      value = generated;
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      value = await readFile(path, 'utf8');
    }
  }
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Chave privada do Spotify inválida.');
  return Buffer.from(value, 'hex');
}

function basicAuthorization(config: SpotifyConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
}

async function tokenRequest(config: SpotifyConfig, body: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(config),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !result.access_token || !Number.isFinite(result.expires_in)) {
    const detail = result.error_description || result.error || `HTTP ${response.status}`;
    throw new SpotifyTokenError(result.error ?? `http_${response.status}`, `Spotify recusou a autorização: ${detail}`);
  }
  return result;
}

export async function createSpotifyAuthorization(discordUserId: string) {
  if (!/^\d{17,20}$/.test(discordUserId)) throw new Error('Usuário do Discord inválido.');
  const config = configuration();
  if (!config) throw new Error('OAuth do Spotify ainda não foi configurado pelo administrador.');
  const now = new Date();
  await prisma.spotifyOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { discordUserId }] } });
  const state = randomBytes(32).toString('base64url');
  await prisma.spotifyOAuthState.create({
    data: { stateHash: hashState(state), discordUserId, expiresAt: new Date(Date.now() + STATE_LIFETIME_MS) },
  });
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state,
    scope: SPOTIFY_SCOPE,
    show_dialog: 'false',
  }).toString();
  return url.toString();
}

export interface SpotifyCallbackResult { ok: boolean; title: string; message: string }

export async function completeSpotifyAuthorization(callbackUrl: URL): Promise<SpotifyCallbackResult> {
  const config = configuration();
  if (!config) return { ok: false, title: 'Spotify não configurado', message: 'As credenciais do Spotify ainda não foram configuradas no Angel.' };
  const state = callbackUrl.searchParams.get('state') ?? '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(state)) return { ok: false, title: 'Conexão inválida', message: 'O código de segurança está ausente ou é inválido.' };
  const stored = await prisma.spotifyOAuthState.findUnique({ where: { stateHash: hashState(state) } });
  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    if (stored) await prisma.spotifyOAuthState.delete({ where: { stateHash: stored.stateHash } }).catch(() => {});
    return { ok: false, title: 'Conexão expirada', message: 'Volte ao Discord e use alta!ouvindo para gerar um novo botão.' };
  }
  await prisma.spotifyOAuthState.delete({ where: { stateHash: stored.stateHash } });
  if (callbackUrl.searchParams.get('error')) return { ok: false, title: 'Permissão recusada', message: 'O Spotify não foi conectado. Você pode tentar novamente pelo Discord.' };
  const code = callbackUrl.searchParams.get('code') ?? '';
  if (!code || code.length > 2_048) return { ok: false, title: 'Código inválido', message: 'O Spotify não enviou um código de autorização válido.' };
  try {
    const token = await tokenRequest(config, new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }));
    if (!token.refresh_token) throw new Error('O Spotify não enviou um refresh token.');
    const key = await spotifyKey(true);
    await prisma.spotifyConnection.upsert({
      where: { discordUserId: stored.discordUserId },
      create: {
        discordUserId: stored.discordUserId,
        accessTokenEnc: sealStock(token.access_token!, key),
        refreshTokenEnc: sealStock(token.refresh_token, key),
        accessExpiresAt: new Date(Date.now() + token.expires_in! * 1000),
        scope: token.scope ?? SPOTIFY_SCOPE,
      },
      update: {
        accessTokenEnc: sealStock(token.access_token!, key),
        refreshTokenEnc: sealStock(token.refresh_token, key),
        accessExpiresAt: new Date(Date.now() + token.expires_in! * 1000),
        scope: token.scope ?? SPOTIFY_SCOPE,
      },
    });
    return { ok: true, title: 'Spotify conectado!', message: 'Volte ao Discord e use alta!ouvindo para mostrar sua música.' };
  } catch (error) {
    console.error(`OAuth Spotify: ${error instanceof Error ? error.message : error}`);
    return { ok: false, title: 'Falha ao conectar', message: 'O Spotify recusou a conexão. Confira as configurações do aplicativo e tente novamente.' };
  }
}

async function refreshAccessToken(discordUserId: string) {
  const config = configuration();
  if (!config) return null;
  const connection = await prisma.spotifyConnection.findUnique({ where: { discordUserId } });
  if (!connection) return null;
  const key = await spotifyKey();
  try {
    const token = await tokenRequest(config, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: unsealStock(connection.refreshTokenEnc, key),
    }));
    await prisma.spotifyConnection.update({
      where: { discordUserId },
      data: {
        accessTokenEnc: sealStock(token.access_token!, key),
        ...(token.refresh_token ? { refreshTokenEnc: sealStock(token.refresh_token, key) } : {}),
        accessExpiresAt: new Date(Date.now() + token.expires_in! * 1000),
        scope: token.scope ?? connection.scope,
      },
    });
    return token.access_token!;
  } catch (error) {
    console.error(`Refresh Spotify ${discordUserId}: ${error instanceof Error ? error.message : error}`);
    if (error instanceof SpotifyTokenError && error.code === 'invalid_grant') {
      await prisma.spotifyConnection.delete({ where: { discordUserId } }).catch(() => {});
      return null;
    }
    throw error;
  }
}

async function accessToken(discordUserId: string, forceRefresh = false) {
  const connection = await prisma.spotifyConnection.findUnique({ where: { discordUserId } });
  if (!connection) return null;
  if (!forceRefresh && connection.accessExpiresAt.getTime() > Date.now() + 30_000) {
    return unsealStock(connection.accessTokenEnc, await spotifyKey());
  }
  return refreshAccessToken(discordUserId);
}

async function requestPlayback(discordUserId: string, retry = true): Promise<Response | null> {
  const token = await accessToken(discordUserId);
  if (!token) return null;
  const response = await fetch(PLAYBACK_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 && retry) {
    const refreshed = await accessToken(discordUserId, true);
    if (!refreshed) return null;
    return fetch(PLAYBACK_URL, {
      headers: { Authorization: `Bearer ${refreshed}` },
      signal: AbortSignal.timeout(10_000),
    });
  }
  return response;
}

export async function spotifyCurrentlyPlaying(discordUserId: string): Promise<SpotifyPlaybackResult> {
  if (!configuration()) return { status: 'configuration_missing' };
  const exists = await prisma.spotifyConnection.findUnique({ where: { discordUserId }, select: { discordUserId: true } });
  if (!exists) return { status: 'not_connected' };
  const response = await requestPlayback(discordUserId);
  if (!response) return { status: 'reauthorize' };
  if (response.status === 204) return { status: 'nothing_playing' };
  if (response.status === 401) return { status: 'reauthorize' };
  if (response.status === 403) throw new Error('O Spotify recusou o acesso à reprodução. Confira se sua conta foi liberada no aplicativo Spotify do Angel.');
  if (response.status === 429) throw new Error('O Spotify limitou as consultas. Aguarde um pouco e tente novamente.');
  if (!response.ok) throw new Error(`O Spotify não respondeu corretamente (HTTP ${response.status}).`);
  const playback = await response.json() as SpotifyPlaybackResponse;
  const item = playback.item;
  if (!playback.is_playing || !item?.name) return { status: 'nothing_playing' };
  const progress = Math.max(0, playback.progress_ms ?? 0);
  const duration = Math.max(progress, item.duration_ms ?? progress);
  const startedAt = Date.now() - progress;
  const isEpisode = item.type === 'episode';
  const artists = isEpisode
    ? item.show?.publisher || item.show?.name || 'Podcast'
    : item.artists?.map(artist => artist.name).filter(Boolean).join(', ') || 'Artista desconhecido';
  const images = isEpisode ? item.images : item.album?.images;
  const cover = images?.filter(image => image.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
  return {
    status: 'playing',
    track: {
      title: item.name,
      artists,
      album: isEpisode ? item.show?.name || 'Podcast' : item.album?.name || 'Álbum não informado',
      spotifyUrl: item.external_urls?.spotify ?? null,
      coverUrl: cover,
      startedAt,
      endsAt: duration ? startedAt + duration : null,
    },
  };
}
