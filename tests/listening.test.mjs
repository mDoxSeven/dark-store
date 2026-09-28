import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ALTA_LISTENING_COMMAND, ALTA_SPOTIFY_EMOJI, altaListeningMessage, isAltaListeningCommand,
} from '../src/alta/listening.ts';

test('comando alta!ouvindo é reconhecido sem capturar textos parecidos', () => {
  assert.equal(ALTA_LISTENING_COMMAND, 'alta!ouvindo');
  assert.equal(ALTA_SPOTIFY_EMOJI, '<a:spotify:1552396972013396008>');
  assert.equal(isAltaListeningCommand('alta!ouvindo'), true);
  assert.equal(isAltaListeningCommand('  ALTA!OUVINDO  '), true);
  assert.equal(isAltaListeningCommand('alta!ouvindoagora'), false);
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
  assert.match(raw, /1552396972013396008/);
  assert.match(raw, /Redes Sociais/);
  assert.match(raw, /MC Luan da BS/);
  assert.match(raw, /cover\.jpg/);
  assert.match(raw, /0:38/);
  assert.match(raw, /3:17/);
  assert.match(raw, /https:\/\/open\.spotify\.com\/track\/spotify-track-id/);
});

test('Angel encaminha o prefixo e habilita presença somente por configuração', async () => {
  const bot = await readFile(new URL('../src/discord/bot.ts', import.meta.url), 'utf8');
  assert.match(bot, /handleAltaListeningCommand\(message\)/);
  assert.match(bot, /DARK_SPOTIFY_PRESENCE_ENABLED === 'true'/);
  assert.match(bot, /GatewayIntentBits\.GuildPresences/);
});
