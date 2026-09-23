import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import {
  ALTA_GUILD_ID, RISE_GUIDE_GUILD_ID, RISE_GUIDE_CHANNEL_ID, RISE_GUIDE_URL, RISE_MEDIA_URL, altaRiseCommand,
  isAltaRiseCommand, parseRiseRoleArgument, riseAnnouncement,
} from '../src/alta/rise.ts';

test('aviso rise fica restrito a Alta e usa os links informados', () => {
  assert.equal(ALTA_GUILD_ID, '1309533710156169337');
  assert.equal(RISE_GUIDE_GUILD_ID, '1161745657976062042');
  assert.equal(RISE_GUIDE_CHANNEL_ID, '1551676932444397649');
  assert.equal(RISE_GUIDE_URL, 'https://discord.com/channels/1161745657976062042/1551676932444397649');
  assert.equal(RISE_MEDIA_URL, 'https://i.imgur.com/SCz54lv.jpeg');
  const serialized = JSON.stringify(riseAnnouncement());
  assert.match(serialized, /SCz54lv\.jpeg/);
  assert.match(serialized, /Ver passo a passo/);
  assert.match(serialized, /1551676932444397649/);
});

test('slash avisorise exige gerenciar servidor e oferece cargo opcional', () => {
  const command = altaRiseCommand.toJSON();
  assert.equal(command.name, 'avisorise');
  assert.equal(command.dm_permission, false);
  assert.equal(command.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.deepEqual(command.options?.map(option => [option.name, option.required ?? false]), [['cargo', false]]);
});

test('reconhece somente os comandos rise completos', () => {
  assert.equal(isAltaRiseCommand('!avisorise'), true);
  assert.equal(isAltaRiseCommand('  !RISEAVISO  123456789012345678 '), true);
  assert.equal(isAltaRiseCommand('!avisoriseagora'), false);
  assert.equal(isAltaRiseCommand('avisorise'), false);
});

test('cargo por ID notifica no V2 e mencao digitada nao duplica o ping', () => {
  const roleId = '123456789012345678';
  assert.deepEqual(parseRiseRoleArgument(roleId), { roleId, notifyInAnnouncement: true });
  assert.deepEqual(parseRiseRoleArgument(`<@&${roleId}>`), { roleId, notifyInAnnouncement: false });
  assert.equal(parseRiseRoleArgument('invalido'), null);
  assert.deepEqual(riseAnnouncement(roleId).allowedMentions, { parse: [], roles: [roleId] });
  assert.deepEqual(riseAnnouncement(roleId, false).allowedMentions, { parse: [] });
});
