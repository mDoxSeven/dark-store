import { MessageFlags, type MessageCreateOptions } from 'discord.js';
import { ADD1CTION_BANNER_URL, ADD1CTION_VERIFY_BUTTON_ID } from './config.js';

export function add1ctionVerificationMessage(): MessageCreateOptions {
  return {
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    components: [{ type: 17, accent_color: 0xffffff, components: [
      { type: 12, items: [{ media: { url: ADD1CTION_BANNER_URL }, description: 'Verificação add1ction' }] },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: '## 𓆩♡𓆪 VERIFICAÇÃO\nEntre no universo **add1ction**. Confirme seu acesso no botão abaixo.\n\n-# Ao continuar, você declara que leu e aceita as regras da comunidade.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 2, custom_id: ADD1CTION_VERIFY_BUTTON_ID, label: 'Verificar', emoji: { name: '🖤' } }] },
      { type: 10, content: '-# add1ction • born to die, verified to stay' },
    ] }],
  } as MessageCreateOptions;
}

export function add1ctionEphemeral(content: string, danger = false) {
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
    components: [{ type: 17, accent_color: danger ? 0x8b0000 : 0xffffff, components: [
      { type: 10, content },
    ] }],
  } as const;
}

