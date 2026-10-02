import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ALTA_LISTENING_COMMAND, ALTA_SPOTIFY_EMOJI, altaListeningMessage, altaSpotifyConnectMessage, isAltaListeningCommand,
  isSpotifyPresenceActivity, rememberRawAltaSpotifyPresence, sendAltaListeningCard,
} from '../src/alta/listening.ts';
import { spotifyOAuthCallbackMatches } from '../src/alta/spotifyOAuth.ts';

test('ouvindo apaga o comando antes de enviar o card sem referência à mensagem original', async () => {
  const calls = [];
  const payload = altaListeningMessage('123', { title: 'Faixa', artists: 'Artista', album: 'Álbum', trackId: null, coverUrl: null, startedAt: null, endsAt: null });
  await sendAltaListeningCard({ inGuild: () => true, guildId: '1309533710156169337',
    delete: async () => { calls.push('delete'); },
    channel: { send: async value => { calls.push('send'); assert.equal(value, payload); assert.equal(value.reply, undefined); } },
  }, payload);
  assert.deepEqual(calls, ['delete', 'send']);
});

test('ouvindo mantém envio do card quando não pode apagar; não apaga fora da Alta', async () => {
  const calls = [];
  const message = { id: 'command', inGuild: () => true, guildId: '1309533710156169337',
    delete: async () => { calls.push('delete'); throw new Error('Missing Permissions'); },
    channel: { send: async () => { calls.push('send'); } },
  };
  await sendAltaListeningCard(message, {});
  assert.deepEqual(calls, ['delete', 'send']);
  await sendAltaListeningCard({ ...message, guildId: 'other' }, {});
  assert.equal(calls.length, 2);
});

test('comando alta!ouvindo é reconhecido sem capturar textos parecidos', () => {
  assert.equal(ALTA_LISTENING_COMMAND, 'alta!ouvindo');
  assert.equal(ALTA_SPOTIFY_EMOJI, '<a:spotify:1554212340277186680>');
  assert.equal(isAltaListeningCommand('alta!ouvindo'), true);
  assert.equal(isAltaListeningCommand('  ALTA!OUVINDO  '), true);
  assert.equal(isAltaListeningCommand('alta!ouvindoagora'), false);
});

test('captura bruta reconhece Spotify antes do processamento do discord.js', () => {
  assert.equal(rememberRawAltaSpotifyPresence({
    t: 'PRESENCE_UPDATE',
    d: {
      guild_id: '1309533710156169337',
      user: { id: '1002774556269891694' },
      activities: [{
        name: 'Spotify', type: 2, details: 'Redes Sociais', state: 'MC Luan da BS', sync_id: 'track-id',
        timestamps: { start: 1_000, end: 198_000 },
        assets: { large_image: 'spotify:cover-id', large_text: 'Redes Sociais' },
      }],
    },
  }), true);
  assert.equal(rememberRawAltaSpotifyPresence({
    t: 'GUILD_MEMBERS_CHUNK',
    d: {
      guild_id: '1309533710156169337',
      presences: [{
        user: { id: '1524414021674205224' },
        activities: [{
          name: 'Spotify', type: 2, details: 'Outra Música', state: 'Outro Artista', sync_id: 'track-id-2',
          assets: { large_image: 'spotify:cover-id-2', large_text: 'Outro Álbum' },
        }],
      }],
    },
  }), true);
});

test('detector aceita as variações de atividade Spotify entregues pelo Discord', () => {
  assert.equal(isSpotifyPresenceActivity({
    name: 'Spotify', type: 0, syncId: null, details: null, state: null, assets: null,
  }), true);
  assert.equal(isSpotifyPresenceActivity({
    name: 'Música', type: 0, syncId: 'track-id', details: 'Faixa', state: 'Artista',
    assets: { largeImage: 'spotify:ab12' },
  }), true);
  assert.equal(isSpotifyPresenceActivity({
    name: 'Visual Studio Code', type: 0, syncId: null, details: 'Editando', state: null, assets: null,
  }), false);
});

test('V2 do Spotify mostra faixa, capa, progresso e botão externo', () => {
  const payload = altaListeningMessage('1002774556269891694', {
    title: 'Redes Sociais',
    artists: 'MC Luan da BS, DJ Marcus Vinicius',
    album: 'Redes Sociais',
    trackId: 'spotify-track-id',
    coverUrl: 'https://i.scdn.co/image/cover.jpg',
    startedAt: 1_000,
    endsAt: 198_000,
  }, 39_000);
  assert.equal(payload.flags, 32768);
  const raw = JSON.stringify(payload);
  assert.match(raw, /1554212340277186680/);
  assert.match(raw, /Redes Sociais/);
  assert.match(raw, /MC Luan da BS/);
  assert.match(raw, /cover\.jpg/);
  assert.match(raw, /0:38/);
  assert.match(raw, /3:17/);
  assert.match(raw, /https:\/\/open\.spotify\.com\/track\/spotify-track-id/);
});

test('OAuth gera painel de conexão e limita o callback ao host configurado', () => {
  const panel = altaSpotifyConnectMessage('https://accounts.spotify.com/authorize?state=teste');
  const raw = JSON.stringify(panel);
  assert.match(raw, /CONECTAR SPOTIFY/);
  assert.match(raw, /ler a faixa atual/);
  assert.match(raw, /https:\/\/accounts\.spotify\.com\/authorize\?state=teste/);
  const previous = {
    id: process.env.SPOTIFY_CLIENT_ID,
    secret: process.env.SPOTIFY_CLIENT_SECRET,
    redirect: process.env.SPOTIFY_REDIRECT_URI,
  };
  process.env.SPOTIFY_CLIENT_ID = 'client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'client-secret';
  process.env.SPOTIFY_REDIRECT_URI = 'https://angel.exemplo.com/spotify/callback';
  try {
    assert.equal(spotifyOAuthCallbackMatches('angel.exemplo.com', '/spotify/callback'), true);
    assert.equal(spotifyOAuthCallbackMatches('evil.exemplo.com', '/spotify/callback'), false);
    assert.equal(spotifyOAuthCallbackMatches('angel.exemplo.com', '/outra-rota'), false);
  } finally {
    if (previous.id === undefined) delete process.env.SPOTIFY_CLIENT_ID; else process.env.SPOTIFY_CLIENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.SPOTIFY_CLIENT_SECRET; else process.env.SPOTIFY_CLIENT_SECRET = previous.secret;
    if (previous.redirect === undefined) delete process.env.SPOTIFY_REDIRECT_URI; else process.env.SPOTIFY_REDIRECT_URI = previous.redirect;
  }
});

test('Angel encaminha o prefixo e habilita presença somente por configuração', async () => {
  const listening = await readFile(new URL('../src/alta/listening.ts', import.meta.url), 'utf8');
  assert.match(listening, /withPresences: true/);
  assert.match(listening, /recentSpotifyActivity/);
  assert.match(listening, /spotifyCurrentlyPlaying\(message\.author\.id\)/);
  assert.match(listening, /createSpotifyAuthorization\(message\.author\.id\)/);
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleAltaListeningCommand\(message\)/);
  assert.match(bot, /Events\.PresenceUpdate/);
  assert.match(bot, /rememberAltaSpotifyPresence\(newPresence\)/);
  assert.match(bot, /Events\.Raw/);
  assert.match(bot, /rememberRawAltaSpotifyPresence\(packet\)/);
  assert.match(bot, /DARK_SPOTIFY_PRESENCE_ENABLED === 'true'/);
  assert.match(bot, /GatewayIntentBits\.GuildPresences/);
  const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(server, /completeSpotifyAuthorization/);
  assert.match(server, /spotifyOAuthCallbackMatches/);
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model SpotifyOAuthState/);
  assert.match(schema, /model SpotifyConnection/);
  assert.match(schema, /accessTokenEnc\s+String/);
  assert.match(schema, /refreshTokenEnc\s+String/);
});
