import type { MessageCreateOptions } from 'discord.js';
import type { PasstimeConfig, PasstimeScheduleEntry } from '@prisma/client';
import { PASSTIME_ACCENT, PASSTIME_IDS, PASSTIME_DAYS } from './config.js';

type ApiComponent = Record<string, unknown>;

export type PasstimePresentation = {
  minionEmoji?: string;
  yellowEmoji?: string;
  requestBannerUrl?: string | null;
  identificationBannerUrl?: string | null;
  pointsBannerUrl?: string | null;
  teamBannerUrl?: string | null;
};

const separator = { type: 14, divider: true, spacing: 1 };
const text = (content: string) => ({ type: 10, content });
const button = (customId: string, label: string, emoji?: string) => ({
  type: 2, style: 2, custom_id: customId, label, ...(emoji ? { emoji: { name: emoji } } : {}),
});

export function passtimeV2(content: string, options: {
  banner?: boolean;
  bannerUrl?: string | null;
  footer?: string;
  components?: ApiComponent[];
  allowedRoles?: string[];
  allowedUsers?: string[];
} = {}): MessageCreateOptions {
  const children: ApiComponent[] = [];
  if (options.banner !== false && options.bannerUrl) {
    children.push({ type: 12, items: [{ media: { url: options.bannerUrl }, description: 'Passtime Alta' }] });
    children.push(separator);
  }
  children.push(text(content));
  if (options.components?.length) children.push(separator, ...options.components);
  if (options.footer) children.push(separator, text(`-# ${options.footer}`));
  return {
    flags: 32768,
    allowedMentions: {
      parse: [],
      roles: options.allowedRoles ?? [],
      users: options.allowedUsers ?? [],
    },
    components: [{ type: 17, accent_color: PASSTIME_ACCENT, components: children }],
  } as unknown as MessageCreateOptions;
}

export function bankRequestMessage(presentation: PasstimePresentation = {}) {
  const mascot = presentation.minionEmoji || '🎭';
  return passtimeV2([
    `# ${mascot} | Solicitar Banca`,
    '*Crie sua banca!*',
    '',
    'Para abrir sua banca, interaja com o botão abaixo.',
    '',
    '**Em caso de dúvida:** ao interagir, será aberto um formulário para informar um emoji de teclado e o nome desejado para a banca.',
  ].join('\n'), {
    bannerUrl: presentation.requestBannerUrl,
    footer: 'Passtime • Alta',
    components: [{ type: 1, components: [button(PASSTIME_IDS.bankOpen, 'Abrir Banca', '🧪')] }],
  });
}

export function verificationMessage() {
  return passtimeV2([
    '# ✅ | Verificação',
    '*Entre oficialmente para a equipe Passtime.*',
    '',
    'Clique no botão abaixo para receber o cargo de membro e liberar os canais da equipe.',
  ].join('\n'), {
    banner: false,
    footer: 'Passtime • Alta • Verificação automática',
    components: [{ type: 1, components: [button(PASSTIME_IDS.verify, 'Verificar', '✅')] }],
  });
}

export function identificationMessage(presentation: PasstimePresentation = {}) {
  const mascot = presentation.minionEmoji || '🔍';
  return passtimeV2([
    `# ${mascot} | Identificação`,
    '*Agilidade para identificar sua matéria.*',
    '',
    'Quando sua matéria estiver pronta, envie-a na sua banca junto com a ficha de identificação e marque um corretor para realizar a correção.',
    '',
    '### 📝 Ficha de Identificação',
    '```text\nPostagem:\nTema:\nCorretor:\nPontos: (preenchido pelo corretor)\nErros: (preenchido pelo corretor)\nDecorador: (se teve)\nVago: (se for horário vago)\n```',
    '**Orientações:**',
    '• Após a correção, atualize a ficha com os erros e a pontuação informados pelo corretor;',
    '• Apague as mensagens relacionadas à correção depois de atualizar a ficha;',
    '• Mantenha sua banca organizada e evite mensagens desnecessárias;',
    '• Bancas limpas facilitam a visualização das matérias, correções e pontuações;',
    '• Sempre realize as correções solicitadas pelo monitor e mantenha sua ficha atualizada.',
    '',
    '**Importante:** bancas desorganizadas ao final da semana poderão sofrer desconto de pontuação.',
  ].join('\n'), { bannerUrl: presentation.identificationBannerUrl, footer: 'Passtime • Alta' });
}

export function pointsMessage(presentation: PasstimePresentation = {}) {
  const mascot = presentation.minionEmoji || '🌞';
  return passtimeV2([
    `# ${mascot} | Pontuação`,
    '*Como pontuar em nossa equipe.*',
    '',
    '**Matérias:**',
    '• **Alta Opina** — 10 pts',
    '• **Alta Lifestyle** — 15 pts',
    '• **Café com Fofoca** — 20 pts',
    'A cada erro apontado pelo corretor, perde-se 1 ponto.',
    '',
    '**Extra:**',
    '• **Sugestão** — até 5 pts',
    '• **Indicação de Rec** — 10 pts',
    '• **Reações** — até 5 pts',
    '',
    '**Competição do Mural:**',
    '• **1º lugar** — 20 pts',
    '• **2º lugar** — 10 pts',
    '• **3º lugar** — 3 pts',
  ].join('\n'), { bannerUrl: presentation.pointsBannerUrl, footer: 'Passtime • Alta' });
}

const member = (id: string | null) => id ? `<@${id}>` : '*Não definido*';

export function teamMessage(config: Pick<PasstimeConfig, 'leaderId' | 'deputyLeaderId' | 'managerId' | 'supervisorId'>, presentation: PasstimePresentation = {}) {
  const mascot = presentation.minionEmoji || '🌟';
  return passtimeV2([
    `# ${mascot} | Equipe`,
    '*Conheça nossa gestão.*',
    '',
    `**Líder:** ${member(config.leaderId)}`,
    `**Sub-líder:** ${member(config.deputyLeaderId)}`,
    `**Gerente:** ${member(config.managerId)}`,
    `**Supervisor:** ${member(config.supervisorId)}`,
  ].join('\n'), {
    bannerUrl: presentation.teamBannerUrl,
    footer: 'Passtime • Alta',
  });
}

export function bankWelcomeMessage(userId: string, config: Pick<PasstimeConfig, 'identificationChannelId' | 'correctorRoleId' | 'decoratorRoleId'>, presentation: PasstimePresentation = {}) {
  const identification = config.identificationChannelId ? `<#${config.identificationChannelId}>` : 'o canal de identificação';
  const corrector = config.correctorRoleId ? `<@&${config.correctorRoleId}>` : '**Minion • Corretor**';
  const decorator = config.decoratorRoleId ? `<@&${config.decoratorRoleId}>` : '**Minion • Decorador**';
  const mascot = presentation.minionEmoji || '🎭';
  const yellow = presentation.yellowEmoji || '💛';
  return passtimeV2([
    `# ${mascot} | Bem-vindo(a), <@${userId}>`,
    '*à sua banca!*',
    '',
    'Aqui é seu espaço para desenvolver suas matérias e atividades. Sinta-se à vontade!',
    '',
    `• ${yellow} Mantenha sua banca organizada de acordo com ${identification}.`,
    '• As matérias devem ser enviadas para correção no máximo **2 horas antes** do horário.',
    `• Ao finalizar sua matéria, mencione ${corrector}. Ela não poderá ser publicada sem correção.`,
    `• Depois da correção, apague as mensagens do corretor e envie a ficha de ${identification} atualizada.`,
    `• Para ajuda com decoração, marque ${decorator} e atualize a ficha.`,
    '• Não se esqueça de registrar a matéria publicada para garantir seus pontos.',
  ].join('\n'), {
    banner: false,
    footer: 'Passtime • Alta',
    allowedUsers: [userId],
  });
}

export function scheduleMessage(entries: PasstimeScheduleEntry[]) {
  const grouped = new Map(PASSTIME_DAYS.map(day => [day, [] as PasstimeScheduleEntry[]]));
  for (const entry of entries) grouped.get(entry.day as typeof PASSTIME_DAYS[number])?.push(entry);
  const sections = PASSTIME_DAYS.map(day => {
    const items = grouped.get(day)!.sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position);
    if (!items.length) return `**${day[0].toUpperCase()}${day.slice(1)}:** *sem horários cadastrados*`;
    return `**${day[0].toUpperCase()}${day.slice(1)}:**\n${items.map(item => `• \`${item.time}\` — ${item.label}`).join('\n')}`;
  });
  return passtimeV2([
    '# 🗓️ | Cronograma',
    '*Horários e atividades da equipe.*',
    '',
    ...sections,
  ].join('\n\n'), { banner: false, footer: 'Passtime • Alta • Horário de Brasília' });
}

export function announcementMessage(content: string, title = 'Anúncio') {
  return passtimeV2(`## 📣 ${title}\n${content}`, { banner: false, footer: 'Passtime • Alta' });
}

export function editorLauncherMessage(kind: 'embed' | 'announcement' | 'schedule', userId: string) {
  const data = kind === 'embed'
    ? { title: 'Editor V2', body: 'Abra o formulário para montar uma mensagem V2 no canal atual.', id: `${PASSTIME_IDS.embedOpen}:${userId}`, label: 'Montar V2' }
    : kind === 'announcement'
      ? { title: 'Novo anúncio', body: 'Abra o formulário para escrever e publicar um anúncio.', id: `${PASSTIME_IDS.announcementOpen}:${userId}`, label: 'Escrever anúncio' }
      : { title: 'Editar horários', body: 'Abra o formulário para adicionar um horário ao cronograma.', id: `${PASSTIME_IDS.scheduleOpen}:${userId}`, label: 'Adicionar horário' };
  return passtimeV2(`## ${data.title}\n${data.body}`, {
    banner: false,
    footer: `Controle solicitado por <@${userId}>`,
    allowedUsers: [userId],
    components: [{ type: 1, components: [button(data.id, data.label)] }],
  });
}
