import { PermissionFlagsBits, type Message, type MessageCreateOptions } from 'discord.js';

export const ALTA_GUILD_ID = '1309533710156169337';
export const RISE_GUIDE_GUILD_ID = '1161745657976062042';
export const RISE_GUIDE_CHANNEL_ID = '1551676932444397649';
export const RISE_GUIDE_URL = `https://discord.com/channels/${RISE_GUIDE_GUILD_ID}/${RISE_GUIDE_CHANNEL_ID}`;
export const RISE_MEDIA_URL = 'https://i.imgur.com/SCz54lv.jpeg';

const COMMANDS = new Set(['!avisorise', '!riseaviso']);

export interface RiseRoleArgument {
  roleId: string;
  notifyInAnnouncement: boolean;
}

export function isAltaRiseCommand(content: string) {
  const command = content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR');
  return COMMANDS.has(command);
}

export function parseRiseRoleArgument(value?: string): RiseRoleArgument | null {
  const raw = value?.trim();
  if (!raw) return null;
  const id = raw.match(/^(\d{17,20})$/)?.[1];
  if (id) return { roleId: id, notifyInAnnouncement: true };
  const mention = raw.match(/^<@&(\d{17,20})>$/)?.[1];
  return mention ? { roleId: mention, notifyInAnnouncement: false } : null;
}

export function riseAnnouncement(roleId?: string, notifyRole = Boolean(roleId)): MessageCreateOptions {
  const notification = roleId ? `<@&${roleId}>\n\n` : '';
  const text = [
    `${notification}# Recompensa Disponível`,
    '## `/rise` — suba ao topo da Pureza!',
    '',
    `Acesse <#${RISE_GUIDE_CHANNEL_ID}> e siga o passo a passo informado no canal.`,
    '',
    'Conheça a nova **permissão/tag exclusiva**, posicionada **acima de todos os cargos**. E o melhor: **é grátis!**',
    '',
    '> **10 minutos de jogo para conquistar seu `/rise`!**',
    '',
    "A Pureza se juntou ao jogo **DON'T PRESS THE BUTTON** para chegar às finais da Game Jam. Jogue e, se gostar, indique o jogo para receber seu destaque no servidor!",
    '',
    'Ao final, você pode usar o botão dourado **Nominate** para apoiar o jogo na **Game Jam**. O apoio é opcional e fica por sua conta.',
    '',
    '### Recompensa: `@/rise`',
  ].join('\n');

  return {
    flags: 32768,
    allowedMentions: roleId && notifyRole ? { parse: [], roles: [roleId] } : { parse: [] },
    components: [{
      type: 17,
      accent_color: 0x89949f,
      components: [
        { type: 12, items: [{ media: { url: RISE_MEDIA_URL } }] },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: text },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 5, label: 'Ver passo a passo', url: RISE_GUIDE_URL }] },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: '-# Alta Cúpula · Recompensa gratuita' },
      ],
    }],
  } as MessageCreateOptions;
}

export async function handleAltaRiseCommand(message: Message) {
  if (!isAltaRiseCommand(message.content)) return false;
  if (!message.inGuild() || message.guildId !== ALTA_GUILD_ID) {
    await message.reply({ content: 'Este anúncio funciona somente no servidor Alta Cúpula.', allowedMentions: { repliedUser: false } });
    return true;
  }
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ content: 'Você precisa da permissão **Gerenciar servidor**.', allowedMentions: { repliedUser: false } });
    return true;
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const roleArgument = parseRiseRoleArgument(args[0]);
  if (args.length > 1 || args.length === 1 && !roleArgument) {
    await message.reply({ content: 'Use `!avisorise` ou `!avisorise ID_DO_CARGO`. Também aceito uma menção de cargo.', allowedMentions: { repliedUser: false } });
    return true;
  }

  const role = roleArgument
    ? message.guild.roles.cache.get(roleArgument.roleId) ?? await message.guild.roles.fetch(roleArgument.roleId).catch(() => null)
    : null;
  if (roleArgument && !role) {
    await message.reply({ content: 'Não encontrei esse cargo no servidor.', allowedMentions: { repliedUser: false } });
    return true;
  }

  if (roleArgument?.notifyInAnnouncement) {
    const me = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
    if (!me || !message.channel.permissionsFor(me)?.has(PermissionFlagsBits.MentionEveryone)) {
      await message.reply({ content: 'O bot precisa da permissão **Mencionar @everyone, @here e todos os cargos** para notificar esse cargo.', allowedMentions: { repliedUser: false } });
      return true;
    }
  }

  await message.channel.send(riseAnnouncement(role?.id, roleArgument?.notifyInAnnouncement));
  return true;
}
