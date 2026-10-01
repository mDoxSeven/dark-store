import { MessageFlags, escapeMarkdown, type MessageCreateOptions } from 'discord.js';
import { fileURLToPath } from 'node:url';
export const icons = new Map<string, { id: string; name: string }>();
export const icon = (key = 'miku') => { const e = icons.get(key); return e ? `<:${e.name}:${e.id}>` : key === 'star' ? '✦' : '♫'; };
export const safe = (s: string) => escapeMarkdown(s).replace(/@/g, '@\u200b');
export const button = (action: string, label: string, style = 2) => ({ type: 2, style, custom_id: `ev:${action}`, label });
export const row = (...components: Record<string, unknown>[]) => ({ type: 1, components });
export function v2(title: string, text: string, rows: Record<string, unknown>[] = [], art?: string): MessageCreateOptions {
  return {
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
    ...(art ? { files: [{ attachment: fileURLToPath(new URL(`../../public/events/${art}.png`, import.meta.url)), name: `${art}.png` }] } : {}),
    components: [{ type: 17, accent_color: 0x39c5bb, components: [
      ...(art ? [{ type: 12, items: [{ media: { url: `attachment://${art}.png` }, description: `Eventos Alta • ${title}` }] }] : []),
      { type: 10, content: `## ${icon()} ┊ ${title}\n${text}` },
      ...rows, { type: 14, divider: true, spacing: 1 },
      { type: 10, content: `-# ${icon('star')} Alta Cúpula • Eventos ⸝⸝ criatividade no palco, união nos bastidores` },
    ] }],
  } as unknown as MessageCreateOptions;
}
export const rules = () => v2('REGRAS DA EQUIPE', '*Estas regras valem no servidor interno e no externo. Violações estão sujeitas às medidas da administração.*\n\n**01 ┊ Respeito mútuo**\nTrate todos com respeito, independentemente do cargo ou da hierarquia.\n\n**02 ┊ Postura e convivência**\nOfensas, humilhações e provocações não são permitidas. Divergências devem ser resolvidas com diálogo.\n\n**03 ┊ Zero preconceito**\nRacismo, homofobia, gordofobia e qualquer forma de discriminação são inaceitáveis, inclusive em “brincadeiras”.\n\n**04 ┊ Comprometimento**\nCumpra os combinados e avise quando não puder participar. Justificar ausências é obrigatório.\n\n**05 ┊ Críticas construtivas**\nApresente melhorias com respeito e esteja aberto a ouvir. Critique a situação, não ataque a pessoa.', [], 'regras');
export const guide = () => v2('GUIA DA ÁREA', 'Bem-vindo(a) aos bastidores dos melhores momentos da Alta!\n\n**♫ Apresentação**\nCriamos entretenimento em call: eventos interativos e temáticos com um objetivo principal — **divertir os membros**.\n\n**♫ Como funciona**\n**Aulinha → organização → evento.** Cada etapa prepara a equipe, distribui responsabilidades e reduz imprevistos. As funções nos bastidores são tão importantes quanto o palco.\n\n**♫ Explore a área**\n<#1443601864066207904> • Conduta\n<#1443602084279881920> • Funções\n<#1443602692793438349> • Metas\n<#1443602732308107457> • Pontos\n<#1443602017980252181> • Organização\n<#1443601963198582915> • Calendário', [], 'guia');
