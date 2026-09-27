import type { MessageCreateOptions } from 'discord.js';
import type { LeadershipScheduleEntry } from '@prisma/client';
import { LEADERSHIP_ACCENT, LEADERSHIP_DAYS, LEADERSHIP_IDS } from './config.js';

type ApiComponent = Record<string, unknown>;
const separator = { type: 14, divider: true, spacing: 1 };
const text = (content: string) => ({ type: 10, content });
const button = (customId: string, label: string, emoji?: string) => ({
  type: 2, style: 2, custom_id: customId, label, ...(emoji ? { emoji: { name: emoji } } : {}),
});

export type LeadershipChannels = {
  schedule: string;
  rpp: string;
  justification: string;
  suggestions: string;
  bot: string;
  reports: string;
  ups: string;
  highlights: string;
  evaluation: string;
};

export type LeadershipArt = {
  verification?: string | null;
  explanation?: string | null;
  rpp?: string | null;
  justification?: string | null;
  suggestions?: string | null;
  strip?: string | null;
};

export function leadershipV2(content: string, options: {
  bannerUrl?: string | null;
  footer?: string;
  components?: ApiComponent[];
  allowedRoles?: string[];
  allowedUsers?: string[];
} = {}): MessageCreateOptions {
  const children: ApiComponent[] = [];
  if (options.bannerUrl) children.push({ type: 12, items: [{ media: { url: options.bannerUrl }, description: 'Liderança Alta' }] }, separator);
  children.push(text(content));
  if (options.components?.length) children.push(separator, ...options.components);
  if (options.footer) children.push(separator, text(`-# ${options.footer}`));
  return {
    flags: 32768,
    allowedMentions: { parse: [], roles: options.allowedRoles ?? [], users: options.allowedUsers ?? [] },
    components: [{ type: 17, accent_color: LEADERSHIP_ACCENT, components: children }],
  } as unknown as MessageCreateOptions;
}

export function verificationMessage(bannerUrl?: string | null) {
  return leadershipV2([
    '# ✅ | VERIFIQUE-SE',
    '*Seja bem-vindo(a)!*',
    '',
    'Para ter acesso ao servidor, clique no botão abaixo e aguarde a análise da administração.',
    '',
    '**Somente integrantes da administração da Alta ou da gestão de alguma área serão verificados.**',
  ].join('\n'), {
    bannerUrl,
    footer: 'Liderança - Alta',
    components: [{ type: 1, components: [button(LEADERSHIP_IDS.verify, 'Solicitar verificação', '✅')] }],
  });
}

export function explanationMessage(channels: LeadershipChannels, bannerUrl?: string | null) {
  return leadershipV2([
    '# 🧸 | EXPLICATIVO',
    '*Este servidor foi criado para facilitar a comunicação entre gestões e administração.*',
    '',
    `➜ Para saber as atividades das áreas: <#${channels.schedule}>`,
    `➜ Solicitar um RPP: <#${channels.rpp}>`,
    `➜ Justificar ausência: <#${channels.justification}>`,
    `➜ Sugerir coisas novas: <#${channels.suggestions}>`,
    `➜ Solicitar funcionalidade no bot: <#${channels.bot}>`,
    `➜ Modelo e envio de relatório: <#${channels.reports}>`,
    `➜ Enviar upamentos: <#${channels.ups}>`,
    `➜ Enviar destaques: <#${channels.highlights}>`,
    `➜ Avaliação de liderança: <#${channels.evaluation}>`,
    '',
    '⊹₊˚‧︵‿₊୨୧₊‿︵‧˚₊⊹',
    '',
    '> **Os relatórios, upamentos e destaques são obrigatórios.**',
    '**Cada área terá seu canal para o envio do relatório.**',
  ].join('\n'), { bannerUrl, footer: 'Liderança - Alta' });
}

export function scheduleMessage(entries: LeadershipScheduleEntry[]) {
  const grouped = new Map(LEADERSHIP_DAYS.map(day => [day, [] as LeadershipScheduleEntry[]]));
  for (const entry of entries) grouped.get(entry.day as typeof LEADERSHIP_DAYS[number])?.push(entry);
  const dayLabels: Record<typeof LEADERSHIP_DAYS[number], string> = {
    segunda: 'Segunda-Feira', terça: 'Terça-Feira', quarta: 'Quarta-Feira', quinta: 'Quinta-Feira',
    sexta: 'Sexta-Feira', sábado: 'Sábado', domingo: 'Domingo',
  };
  const blocks = LEADERSHIP_DAYS.map(day => {
    const items = grouped.get(day)!.sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position);
    const title = `**${dayLabels[day]}**`;
    if (!items.length) return `${title}\n\`Nenhuma atividade marcada\``;
    return `${title}\n${items.map(item => `\`${item.time}\` - **${item.roleId ? `<@&${item.roleId}>` : item.label}**`).join('\n')}`;
  });
  return leadershipV2([
    '# ⌛ | CRONOGRAMA',
    '*Aqui teremos o cronograma de atividades de todas as áreas.*',
    '',
    blocks.join('\n\n**⊹₊˚‧︵‿₊୨୧₊‿︵‧˚₊⊹**\n\n'),
  ].join('\n'), { footer: 'Liderança - Alta', allowedRoles: entries.flatMap(entry => entry.roleId ? [entry.roleId] : []) });
}

type FormKind = 'rpp' | 'justification' | 'suggestion' | 'bot' | 'evaluation' | 'report' | 'up' | 'highlight';

const formCopy: Record<FormKind, { title: string; subtitle: string; body: string; button: string; emoji: string }> = {
  rpp: {
    title: 'SOLICITAR RPP', subtitle: 'Faça a solicitação do seu RPP.', emoji: '🔒', button: 'Solicitar RPP',
    body: '> O RPP concede uma pausa das atividades por problemas pessoais, estudo, trabalho ou situações semelhantes. Ele pode durar de **7 a 30 dias**.\n\n**Ficha RPP**\n• Nome\n• Tempo\n• Motivo',
  },
  justification: {
    title: 'JUSTIFICATIVA', subtitle: 'Justifique sua ausência em uma atividade.', emoji: '📏', button: 'Enviar justificativa',
    body: '**Ficha Ausência**\n• Nome\n• Data\n• Ocasião\n• Motivo',
  },
  suggestion: {
    title: 'SUGESTÕES', subtitle: 'Envie uma sugestão de melhoria ou ideia.', emoji: '💡', button: 'Enviar sugestão',
    body: '> A sugestão deve ser uma crítica construtiva e não pode atacar diretamente uma pessoa ou área.\n\n**Ficha Sugestão**\n• Nome\n• Sugestão',
  },
  bot: {
    title: 'SOLICITAR FUNCIONALIDADE', subtitle: 'Peça uma função nova para o bot.', emoji: '🚧', button: 'Solicitar função',
    body: '**Informe:**\n• Nome da funcionalidade\n• Problema que ela resolve\n• Como deveria funcionar',
  },
  evaluation: {
    title: 'AVALIAÇÃO DE LIDERANÇA', subtitle: 'Registre sua avaliação com respeito e objetividade.', emoji: '🏆', button: 'Enviar avaliação',
    body: '**Informe:**\n• Liderança avaliada\n• Nota\n• Comentário construtivo',
  },
  report: {
    title: 'RELATÓRIO', subtitle: 'Envie o relatório obrigatório da sua área.', emoji: '📁', button: 'Enviar relatório',
    body: '**Modelo:**\n• Área\n• Período\n• Atividades realizadas\n• Resultados e pendências',
  },
  up: {
    title: 'UPAMENTOS', subtitle: 'Registre os upamentos realizados.', emoji: '🎉', button: 'Enviar upamento',
    body: '**Modelo:**\n• Área\n• Membro promovido\n• Cargo anterior e novo cargo\n• Motivo',
  },
  highlight: {
    title: 'DESTAQUES', subtitle: 'Registre os destaques da sua área.', emoji: '🎊', button: 'Enviar destaque',
    body: '**Modelo:**\n• Área\n• Membro em destaque\n• Resultado alcançado\n• Justificativa',
  },
};

export function formPanel(kind: FormKind, bannerUrl?: string | null, stripUrl?: string | null) {
  const copy = formCopy[kind];
  const components: ApiComponent[] = [{ type: 1, components: [button(`${LEADERSHIP_IDS.open}:${kind}`, copy.button, copy.emoji)] }];
  if (stripUrl) components.unshift(text('**🧸 Utilize o padrão obrigatório nas informações enviadas:**'), { type: 12, items: [{ media: { url: stripUrl }, description: 'Liderança Alta' }] });
  return leadershipV2([`# ${copy.emoji} | ${copy.title}`, `*${copy.subtitle}*`, '', copy.body].join('\n'), {
    bannerUrl,
    footer: 'Liderança - Alta',
    components,
  });
}

export function reviewMessage(request: { id: string; userId: string; type: string; fields: Record<string, string> }) {
  const details = Object.entries(request.fields).map(([key, value]) => `**${key}:** ${value}`).join('\n');
  return leadershipV2(`## 📥 Solicitação de liderança\n**Tipo:** ${request.type}\n**Membro:** <@${request.userId}>\n**Protocolo:** \`${request.id}\`\n\n${details}`, {
    footer: 'Aguardando análise administrativa',
    allowedUsers: [request.userId],
    components: [{ type: 1, components: [
      button(`${LEADERSHIP_IDS.review}:approve:${request.id}`, 'Aprovar', '✅'),
      button(`${LEADERSHIP_IDS.review}:reject:${request.id}`, 'Recusar', '❌'),
    ] }],
  });
}

export function closedReviewMessage(request: { id: string; userId: string; type: string; status: string; reviewerId: string | null }) {
  return leadershipV2(`## ${request.status === 'APPROVED' ? '✅ Aprovado' : '❌ Recusado'}\n**Tipo:** ${request.type}\n**Membro:** <@${request.userId}>\n**Protocolo:** \`${request.id}\`\n**Analisado por:** ${request.reviewerId ? `<@${request.reviewerId}>` : 'administração'}`, {
    footer: 'Liderança - Alta • Solicitação encerrada',
    allowedUsers: [request.userId, ...(request.reviewerId ? [request.reviewerId] : [])],
  });
}
