import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ALTA_LISTENING_COMMAND, ALTA_SPOTIFY_EMOJI, altaListeningMessage, isAltaListeningCommand,
  isSpotifyPresenceActivity, rememberRawAltaSpotifyPresence,
} from '../src/alta/listening.ts';

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

test('Angel encaminha o prefixo e habilita presença somente por configuração', async () => {
  const listening = await readFile(new URL('../src/alta/listening.ts', import.meta.url), 'utf8');
  assert.match(listening, /withPresences: true/);
  assert.match(listening, /recentSpotifyActivity/);
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleAltaListeningCommand\(message\)/);
  assert.match(bot, /Events\.PresenceUpdate/);
  assert.match(bot, /rememberAltaSpotifyPresence\(newPresence\)/);
  assert.match(bot, /Events\.Raw/);
  assert.match(bot, /rememberRawAltaSpotifyPresence\(packet\)/);
  assert.match(bot, /DARK_SPOTIFY_PRESENCE_ENABLED === 'true'/);
  assert.match(bot, /GatewayIntentBits\.GuildPresences/);
});
