import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ALTA_EVENT_ROLE_ID, altaEventCommand, altaEventV2, canManageAltaEvent } from '../src/alta/eventBroadcast.ts';

test('/evento oferece edição, teste privado, confirmação e status', () => {
  const command = altaEventCommand.toJSON();
  assert.equal(command.name, 'evento');
  assert.deepEqual(command.options.map(option => option.name), ['editar', 'testar', 'enviar', 'status']);
  const edit = command.options.find(option => option.name === 'editar');
  assert.deepEqual(edit.options.map(option => option.name), ['titulo', 'mensagem', 'arte', 'remover_arte']);
});

test('acesso exige exatamente o ID configurado e destinatário é o cargo informado', () => {
  const previous = process.env.ALTA_EVENT_OPERATOR_ID;
  try {
    process.env.ALTA_EVENT_OPERATOR_ID = '123456789012345678';
    assert.equal(canManageAltaEvent('123456789012345678'), true);
    assert.equal(canManageAltaEvent('123456789012345679'), false);
    assert.equal(ALTA_EVENT_ROLE_ID, '1521611615017898185');
    process.env.ALTA_EVENT_OPERATOR_ID = '';
    assert.equal(canManageAltaEvent('123456789012345678'), false);
  } finally { if (previous === undefined) delete process.env.ALTA_EVENT_OPERATOR_ID; else process.env.ALTA_EVENT_OPERATOR_ID = previous; }
});

test('prévia V2 privada inclui arte, texto e bloqueia menções', () => {
  const art = Buffer.from('arte');
  const payload = altaEventV2({ title: 'Baile da Alta', body: 'Sábado às 20h', artData: art, artMime: 'image/png', artName: 'evento-alta.png' }, true);
  assert.equal(payload.flags, 32832);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(payload.files[0].attachment.toString(), 'arte');
  const raw = JSON.stringify(payload.components);
  assert.match(raw, /attachment:\/\/evento-alta.png/);
  assert.match(raw, /Baile da Alta/);
  assert.match(raw, /Sábado às 20h/);
});

test('worker persiste destinatários, marca entregas e retoma após reinício', async () => {
  const source = await readFile(new URL('../src/alta/eventBroadcast.ts', import.meta.url), 'utf8');
  assert.match(source, /createMany\(\{ data: targets\.map/);
  assert.match(source, /status: 'SENDING'/);
  assert.match(source, /status: 'SENT'/);
  assert.match(source, /status: 'FAILED'/);
  assert.match(source, /Retomado após reinício/);
  assert.match(source, /await wait\(800\)/);
});
