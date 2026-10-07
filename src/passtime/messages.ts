import type { MessageCreateOptions } from 'discord.js';
import type { PasstimeConfig, PasstimeScheduleEntry } from '@prisma/client';
import { basename, resolve } from 'node:path';
import {
  PASSTIME_ACCENT, PASSTIME_DAYS, PASSTIME_IDS, PASSTIME_SCHEDULE_SLOTS,
  PASSTIME_USER_SCHEDULE_LIMIT, passtimeScheduleSlot, passtimeScheduleTime,
} from './config.js';
import { passtimeButtonEmoji, passtimeEmoji } from './emojis.js';

type ApiComponent = Record<string, unknown>;

export type PasstimePresentation = {
  minionEmoji?: string;
  yellowEmoji?: string;
  requestBannerUrl?: string | null;
  identificationBannerUrl?: string | null;
  pointsBannerUrl?: string | null;
  teamBannerUrl?: string | null;
};

export type PasstimeRankItem = { userId: string; points: number };
export type PasstimeEditorialPanelKey = 'notices' | 'guide' | 'server-decoration' | 'tutorials' | 'warnings' | 'management-drafts';

const separator = { type: 14, divider: true, spacing: 1 };
const text = (content: string) => ({ type: 10, content });
const button = (customId: string, label: string, emoji?: string | { id?: string; name: string; animated?: boolean }) => ({
  type: 2, style: 2, custom_id: customId, label,
  ...(emoji ? { emoji: typeof emoji === 'string' ? { name: emoji } : emoji } : {}),
});

export function passtimeV2(content: string, options: {
  banner?: boolean;
  bannerUrl?: string | null;
  bannerFile?: string;
  footer?: string;
  components?: ApiComponent[];
  allowedRoles?: string[];
  allowedUsers?: string[];
} = {}): MessageCreateOptions {
  const children: ApiComponent[] = [];
  const bannerName = options.bannerFile ? basename(options.bannerFile) : null;
  const bannerUrl = bannerName ? `attachment://${bannerName}` : options.bannerUrl;
  if (options.banner !== false && bannerUrl) {
    children.push({ type: 12, items: [{ media: { url: bannerUrl }, description: 'Passtime Alta' }] });
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
    ...(options.bannerFile ? { files: [{ attachment: resolve(process.cwd(), 'assets', 'passtime', options.bannerFile), name: bannerName! }] } : {}),
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
    `# ${passtimeEmoji('heartPulse')}﹒Verificação Passtime`,
    '*Seu cantinho criativo começa por aqui!*',
    '',
    '୨ৎ Clique no botão abaixo para receber o cargo de membro e liberar os canais internos da equipe.',
    '',
    '♡ Ao entrar, você concorda em manter o respeito, a organização e o cuidado com as matérias da Alta.',
  ].join('\n'), {
    bannerFile: 'verification.png',
    footer: 'Passtime Alta • verificação automática',
    components: [{ type: 1, components: [button(PASSTIME_IDS.verify, 'Entrar no Passtime', passtimeButtonEmoji('heart'))] }],
  });
}

export function identificationMessage(presentation: PasstimePresentation = {}) {
  return passtimeV2([
    `# ${passtimeEmoji('bow')}﹒Organização das Bancas`,
    '*Uma banca bonita também precisa ser fácil de entender.*',
    '',
    '୨ৎ Quando sua matéria estiver pronta, publique a ficha abaixo na sua banca e marque um corretor.',
    '',
    '### ✎﹒Ficha de identificação',
    '```text\nPostagem:\nTema:\nCorretor:\nPontos: (preenchido pelo corretor)\nErros: (preenchido pelo corretor)\nDecorador: (se teve)\nVago: (se for horário vago)\n```',
    '### ♡﹒Checklist da banca',
    '• Atualize a ficha com erros e pontuação depois da correção;',
    '• Apague conversas de correção após registrar o resultado;',
    '• Separe rascunho, versão corrigida e postagem final;',
    '• Evite mensagens soltas que dificultem a conferência;',
    '• Realize todos os ajustes pedidos pelo corretor.',
    '',
    '-# Bancas desorganizadas ao fim da semana poderão sofrer desconto de pontuação.',
  ].join('\n'), { bannerFile: 'bank-organization.png', footer: 'Passtime Alta • organização, carinho e criatividade' });
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

export function rankingMessage(items: PasstimeRankItem[], cycleStartedAt: Date) {
  const medals = ['🥇', '🥈', '🥉'];
  const ranking = items.length
    ? items.slice(0, 20).map((item, index) => `${medals[index] ?? `**${index + 1}º**`} <@${item.userId}> — **${item.points} pts**`).join('\n')
    : '*O ranking deste ciclo ainda está vazio.*';
  const cycle = Math.floor(cycleStartedAt.getTime() / 1000);
  return passtimeV2([
    `# ${passtimeEmoji('starTwinkle')}﹒Destaques Passtime`,
    '*Criatividade, presença e dedicação que merecem brilhar.*',
    '',
    ranking,
    '',
    `-# Ciclo iniciado em <t:${cycle}:d> às <t:${cycle}:t>.`,
  ].join('\n'), {
    bannerFile: 'highlights.png',
    footer: 'Passtime Alta • atualização automática',
    components: [{ type: 1, components: [
      button(PASSTIME_IDS.rankMine, 'Meus pontos', passtimeButtonEmoji('star')),
      button(PASSTIME_IDS.rankRefresh, 'Atualizar ranking', '🔄'),
    ] }],
  });
}

export function rankResetConfirmation(userId: string, members: number, points: number) {
  return passtimeV2([
    '## ⚠️ Resetar ranking?',
    `Esta ação zerará **${points} ponto(s)** de **${members} membro(s)** e iniciará um novo ciclo.`,
    '',
    '**O histórico de alterações será preservado para auditoria.**',
  ].join('\n'), {
    banner: false,
    footer: 'Controle exclusivo da gestão',
    components: [{ type: 1, components: [
      { type: 2, style: 4, custom_id: `${PASSTIME_IDS.rankResetConfirm}:${userId}`, label: 'Confirmar reset', emoji: { name: '🗑️' } },
      button(`${PASSTIME_IDS.rankResetCancel}:${userId}`, 'Cancelar', '✖️'),
    ] }],
  });
}

const member = (id: string | null) => id ? `<@${id}>` : '*Não definido*';

export function teamMessage(config: Pick<PasstimeConfig, 'leaderId' | 'deputyLeaderId' | 'managerId' | 'supervisorId'>, presentation: PasstimePresentation = {}) {
  return passtimeV2([
    `# ${passtimeEmoji('heart')}﹒Equipe Passtime`,
    '*As pessoas que cuidam para cada ideia ganhar vida.*',
    '',
    `🌷 **Líder**﹒${member(config.leaderId)}`,
    `🎀 **Sub-líder**﹒${member(config.deputyLeaderId)}`,
    `🧁 **Gerente**﹒${member(config.managerId)}`,
    `🌸 **Supervisor**﹒${member(config.supervisorId)}`,
    '',
    '୨ৎ Em caso de dúvida, procure a gestão com respeito e explique a situação com clareza.',
  ].join('\n'), {
    bannerFile: 'team.png',
    footer: 'Passtime Alta • juntas criamos momentos especiais',
  });
}

const channelMention = (id: string | null) => id ? `<#${id}>` : '*canal em configuração*';

export function editorialPasstimeMessage(key: PasstimeEditorialPanelKey, config: PasstimeConfig) {
  const panels: Record<PasstimeEditorialPanelKey, { file: string; content: string; footer: string }> = {
    notices: {
      file: 'notices.png',
      content: [
        `# ${passtimeEmoji('heart')}﹒Avisos Passtime`,
        '*Fique por dentro de tudo que movimenta nossa equipe.*',
        '',
        '୨ৎ Aqui serão publicados mudanças de cronograma, lembretes, metas, novidades e comunicados da gestão.',
        '',
        '### 🌷﹒Para não perder nada',
        '• Mantenha as notificações deste canal ativadas;',
        '• Leia o aviso completo antes de tirar dúvidas;',
        '• Observe datas e horários — seguimos o horário de Brasília;',
        '• Evite conversas neste canal para manter os comunicados organizados.',
      ].join('\n'),
      footer: 'Passtime Alta • informação também é cuidado',
    },
    guide: {
      file: 'guide.png',
      content: [
        `# ${passtimeEmoji('star')}﹒Guia Passtime`,
        '*Um mapa delicado para você começar sem se perder.*',
        '',
        `🎀 **Abra sua banca** em ${channelMention(config.requestChannelId)}`,
        `🗓️ **Reserve sua matéria** em ${channelMention(config.scheduleChannelId)}`,
        `✎ **Organize e identifique** seguindo ${channelMention(config.identificationChannelId)}`,
        `💗 **Confira a pontuação** em ${channelMention(config.pointsChannelId)}`,
        `✨ **Acompanhe os destaques** em ${channelMention(config.rankChannelId)}`,
        `🌷 **Conheça a gestão** em ${channelMention(config.teamChannelId)}`,
        '',
        '୨ৎ Produza com antecedência, peça correção, faça os ajustes e registre a versão final na sua banca.',
      ].join('\n'),
      footer: 'Passtime Alta • seu guia para criar com confiança',
    },
    'server-decoration': {
      file: 'server-decoration.png',
      content: [
        `# ${passtimeEmoji('bow')}﹒Decoração do Servidor`,
        '*Detalhes fofinhos deixam tudo especial — sem perder a leitura.*',
        '',
        '### 🧁﹒Nossa identidade',
        '• Paleta principal em rosa, branco e tons suaves;',
        '• Elementos cute e anime combinando com o Passtime;',
        '• Títulos curtos, divisórias leves e emojis coerentes;',
        '• Contraste e legibilidade vêm antes do excesso de decoração.',
        '',
        '୨ৎ Precisa de ajuda em uma matéria? Marque a equipe de decoração na sua banca e explique o que deseja.',
      ].join('\n'),
      footer: 'Passtime Alta • criatividade com identidade',
    },
    tutorials: {
      file: 'tutorials.png',
      content: [
        `# ${passtimeEmoji('note')}﹒Tutoriais de Matérias`,
        '*Como construir cada matéria da equipe Passtime.*',
        '',
        '୨ৎ Os modelos abaixo mostram a **estrutura** esperada. Emojis, símbolos, barrinhas e estilo continuam livres para a criatividade de vocês.',
        '',
        '💗 **Alta Opina**﹒enquete com participação por reações',
        '🌷 **Alta Lifestyle**﹒blog, cotidiano ou entrevista',
        '☕ **Café com Fofoca**﹒assuntos públicos de fora do Discord ou da web',
        '',
        `Antes de produzir, reserve seu horário em ${channelMention(config.scheduleChannelId)} e organize tudo na sua banca.`,
      ].join('\n'),
      footer: 'Passtime Alta • criar, revisar e brilhar',
    },
    warnings: {
      file: 'warnings.png',
      content: [
        `# ${passtimeEmoji('note')}﹒Advertências`,
        '*Registro interno e responsável da gestão Passtime.*',
        '',
        '### 🎀﹒Antes de registrar',
        '• Confirme os fatos e reúna o contexto necessário;',
        '• Descreva a situação de forma objetiva, sem exposição desnecessária;',
        '• Informe membro, motivo, evidências, responsável e medida aplicada;',
        '• Preserve a privacidade: este espaço é exclusivo da gestão.',
        '',
        '୨ৎ Toda decisão deve seguir as regras da Alta e manter tratamento respeitoso.',
      ].join('\n'),
      footer: 'Passtime Alta • gestão responsável e transparente',
    },
    'management-drafts': {
      file: 'management-drafts.png',
      content: [
        `# ${passtimeEmoji('note')}﹒Rascunhos da Gestão`,
        '*Um espaço seguro para preparar tudo antes de publicar.*',
        '',
        '### 🌷﹒Use este canal para',
        '• Revisar avisos, campanhas, metas e comunicados;',
        '• Testar textos e artes antes da publicação oficial;',
        '• Organizar decisões e dividir tarefas da gestão;',
        '• Conferir ortografia, menções, datas e horários.',
        '',
        '୨ৎ Use `!embed` para montar uma V2 e `!anuncio` para preparar um comunicado.',
      ].join('\n'),
      footer: 'Passtime Alta • bastidores da gestão',
    },
  };
  const panel = panels[key];
  return passtimeV2(panel.content, { bannerFile: panel.file, footer: panel.footer });
}

export function tutorialPasstimeMessages() {
  const bannerFile = 'tutorials.png';
  return [
    {
      key: 'tutorials-alta-opina',
      payload: passtimeV2([
        `# ${passtimeEmoji('heartPulse')}﹒Alta Opina`,
        '*Enquete curta, clara e gostosa de participar.*',
        '',
        '### 01﹒Introdução',
        'Cumprimente o público, apresente o tema da enquete e explique como votar pelas reações.',
        '> Exemplo: “Na enquete de hoje queremos saber qual é a fruta favorita de vocês. Reajam nas opções abaixo para participar!”',
        '',
        '### 02﹒Opções',
        'Prepare **no mínimo 5 opções**. Envie cada opção separadamente no chat e adicione os emojis de votação em cada mensagem.',
        '> Exemplo: Banana • Maçã • Tangerina • Goiaba • Melancia',
        '',
        '### 03﹒Encerramento',
        'Agradeça a participação, convide o público para acompanhar **Giro Semanal**, **Alta Lifestyle**, **Café com Fofoca** e **Mural Alta**, e finalize com sua barrinha.',
        '',
        '୨ৎ Use no máximo **2 emojis de reação** por opção para manter a enquete simples.',
      ].join('\n'), { bannerFile, footer: 'Passtime Alta • modelo de estrutura, decoração livre' }),
    },
    {
      key: 'tutorials-alta-lifestyle',
      payload: passtimeV2([
        `# ${passtimeEmoji('bow')}﹒Alta Lifestyle`,
        '*Blog, cotidiano e entrevistas com leitura leve.*',
        '',
        '### 01﹒Introdução',
        'Apresente o assunto, explique por que ele é interessante e diga o que o público encontrará na matéria.',
        '> Exemplo: um texto sobre hábitos saudáveis pode começar mostrando que pequenas atitudes já fazem diferença.',
        '',
        '### 02﹒Desenvolvimento',
        'Divida o conteúdo em blocos curtos e conectados. Matérias extensas podem ter **até 4 desenvolvimentos**.',
        '• Traga informações úteis, exemplos e contexto;',
        '• Em entrevistas, identifique as falas e tenha autorização;',
        '• Revise fontes, ortografia e clareza antes da correção.',
        '',
        '### 03﹒Encerramento',
        'Retome a ideia principal, despeça-se e mencione **Giro Semanal**, **Alta Opina**, **Café com Fofoca** e **Mural Alta** antes da barrinha final.',
      ].join('\n'), { bannerFile, footer: 'Passtime Alta • modelo de estrutura, decoração livre' }),
    },
    {
      key: 'tutorials-cafe-fofoca',
      payload: passtimeV2([
        `# ${passtimeEmoji('heart')}﹒Café com Fofoca`,
        '*Novidades públicas de fora do Discord ou assuntos da web.*',
        '',
        '### 01﹒Introdução',
        'Apresente a história sem entregar tudo de imediato e convide o público a acompanhar os detalhes.',
        '',
        '### 02﹒Desenvolvimento',
        'Conte o que aconteceu em ordem, diferencie fatos de rumores e use apenas informações públicas ou autorizadas.',
        '• Confira a fonte antes de publicar;',
        '• Não exponha conversas privadas, dados pessoais ou pessoas sem consentimento;',
        '• Prints do Discord exigem autorização e devem ter nome e foto borrados quando necessário;',
        '• Evite acusações, humilhações ou conteúdo que possa causar perseguição.',
        '',
        '### 03﹒Encerramento',
        'Feche com uma pergunta leve e mencione **Giro Semanal**, **Alta Opina**, **Alta Lifestyle** e **Mural Alta** antes da barrinha final.',
      ].join('\n'), { bannerFile, footer: 'Passtime Alta • informação com responsabilidade' }),
    },
    {
      key: 'tutorials-rules',
      payload: passtimeV2([
        `# ${passtimeEmoji('starTwinkle')}﹒Regras rápidas das matérias`,
        '*Liberdade para decorar, responsabilidade para publicar.*',
        '',
        '🎀 **Alta Opina:** mínimo de 5 opções, enviadas separadamente;',
        '🎀 **Textos extensos:** máximo de 4 blocos de desenvolvimento;',
        '🎀 **Encerramento:** sempre mencionar os outros canais da área;',
        '🎀 **Finalização:** a barrinha final é obrigatória;',
        '🎀 **Paleta:** mantenha as cores combinando do início ao fim;',
        '🎀 **Reações:** use no máximo 2 emojis por opção ou chamada;',
        '🎀 **Privacidade:** peça autorização e proteja nomes, fotos e conversas;',
        '🎀 **Correção:** envie a matéria com antecedência e aplique todos os ajustes solicitados.',
        '',
        '୨ৎ Os exemplos ensinam a estrutura; símbolos, emojis e barrinhas podem ter a sua identidade.',
      ].join('\n'), { bannerFile, footer: 'Passtime Alta • organização também vale pontos' }),
    },
  ];
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
    const visible = items.slice(0, 25);
    const remaining = items.length - visible.length;
    return [
      `**${day[0].toUpperCase()}${day.slice(1)}:**`,
      ...visible.map(item => [
        `• **${passtimeScheduleSlot(item.time)?.label ?? 'Horário'}** · \`${passtimeScheduleTime(item.time)}\` — **${item.label}**`,
        item.userId ? `  ↳ Responsável: <@${item.userId}>` : '  ↳ Responsável: *não registrado*',
      ].join('\n')),
      ...(remaining ? [`-# e mais ${remaining} horário(s)`] : []),
    ].join('\n');
  });
  const menu = { type: 1, components: [{
      type: 3,
      custom_id: PASSTIME_IDS.scheduleAction,
      placeholder: 'Selecione uma opção do cronograma',
      min_values: 1,
      max_values: 1,
      options: [
        { label: 'Agendar atividade', description: 'Escolher dia, atividade e horário', value: 'book', emoji: { name: '🗓️' } },
        { label: 'Meus horários', description: 'Consultar minhas reservas', value: 'mine', emoji: { name: '🔎' } },
        { label: 'Cancelar horário', description: 'Remover uma reserva minha', value: 'cancel', emoji: { name: '🗑️' } },
        { label: 'Atualizar cronograma', description: 'Sincronizar o painel agora', value: 'refresh', emoji: { name: '🔄' } },
      ],
    }] };
  const management = { type: 1, components: [
    button(PASSTIME_IDS.scheduleEditOpen, 'Editar cronograma', '✏️'),
    button(PASSTIME_IDS.scheduleClearOpen, 'Limpar cronograma', '🧹'),
  ] };
  return {
    flags: 32768,
    allowedMentions: { parse: [], roles: [], users: [] },
    components: [{
      type: 17,
      accent_color: PASSTIME_ACCENT,
      components: [
        text('# 🗓️ | Cronograma\n*Horários e atividades da equipe.*\n\nEscolha uma opção abaixo para reservar, consultar ou cancelar seus horários.'),
        separator,
        ...sections.map(section => text(section)),
        separator,
        menu,
        management,
        separator,
        text('-# Passtime • Alta • Horário de Brasília • Atualização automática'),
      ],
    }],
  } as unknown as MessageCreateOptions;
}

export function scheduleEditPicker(entries: PasstimeScheduleEntry[], userId: string) {
  return passtimeV2('## ✏️ Editar cronograma\nEscolha o horário que deseja corrigir. Você poderá alterar dia, horário, atividade e responsável.', {
    banner: false,
    footer: 'Controle exclusivo da gestão • Horário de Brasília',
    components: [{ type: 1, components: [{
      type: 3,
      custom_id: `${PASSTIME_IDS.scheduleEditSelect}:${userId}`,
      placeholder: 'Selecione um horário',
      min_values: 1,
      max_values: 1,
      options: entries.slice(0, 25).map(entry => ({
        label: `${entry.day} ${passtimeScheduleTime(entry.time)}`.slice(0, 100),
        description: `${entry.label}${entry.userId ? ' • com responsável' : ' • sem responsável'}`.slice(0, 100),
        value: entry.id,
        emoji: { name: '✏️' },
      })),
    }] }],
  });
}

export function scheduleClearConfirmation(userId: string, count: number) {
  return passtimeV2([
    '## ⚠️ Limpar cronograma?',
    `Esta ação removerá **${count} horário(s)** do Passtime e atualizará o painel da Liderança.`,
    '',
    '**Essa ação não poderá ser desfeita.**',
  ].join('\n'), {
    banner: false,
    footer: 'Controle exclusivo da gestão',
    components: [{ type: 1, components: [
      { type: 2, style: 4, custom_id: `${PASSTIME_IDS.scheduleClearConfirm}:${userId}`, label: 'Confirmar limpeza', emoji: { name: '🗑️' } },
      button(`${PASSTIME_IDS.scheduleClearCancel}:${userId}`, 'Cancelar', '✖️'),
    ] }],
  });
}

export function scheduleDayPicker(entries: PasstimeScheduleEntry[] = [], bankChannelId?: string | null) {
  const current = entries.length
    ? entries.map(entry => `• **${entry.day}** · ${passtimeScheduleTime(entry.time)} — ${entry.label}`).join('\n')
    : '*Nenhuma matéria reservada.*';
  return passtimeV2([
    '## 🗓️ Escolha o dia',
    bankChannelId ? `Sua banca vinculada: <#${bankChannelId}>.` : 'Sua reserva será vinculada automaticamente ao seu usuário.',
    '',
    `**Suas matérias (${entries.length}/${PASSTIME_USER_SCHEDULE_LIMIT}):**`,
    current,
    '',
    'Selecione o dia para visualizar somente os horários disponíveis.',
  ].join('\n'), {
    banner: false,
    footer: 'Passtime • Alta • Etapa 1 de 4 • Horário de Brasília',
    components: [{ type: 1, components: [{
      type: 3,
      custom_id: PASSTIME_IDS.scheduleDay,
      placeholder: 'Escolha o dia da semana',
      min_values: 1,
      max_values: 1,
      options: PASSTIME_DAYS.map((day, index) => ({
        label: `${day[0].toUpperCase()}${day.slice(1)}`,
        value: String(index),
        emoji: { name: '📅' },
      })),
    }] }],
  });
}

export function scheduleSlotPicker(dayIndex: number, occupiedTimes: ReadonlySet<string>) {
  const day = PASSTIME_DAYS[dayIndex];
  const available = PASSTIME_SCHEDULE_SLOTS.filter(slot => !occupiedTimes.has(slot.start));
  return passtimeV2(`## ⏰ Escolha o horário\nDia selecionado: **${day?.[0].toUpperCase()}${day?.slice(1)}**.\n\nOs horários ocupados não aparecem na lista.`, {
    banner: false,
    footer: 'Passtime • Alta • Etapa 2 de 4 • Horário de Brasília',
    components: [{ type: 1, components: [{
      type: 3,
      custom_id: `${PASSTIME_IDS.scheduleSlot}:${dayIndex}`,
      placeholder: 'Selecione um horário disponível',
      min_values: 1,
      max_values: 1,
      options: available.map(slot => ({
        label: `${slot.start.replace(':', 'h')} – ${slot.end.replace(':', 'h')} · ${slot.label}`,
        value: slot.key,
        emoji: { name: slot.emoji },
      })),
    }] }],
  });
}

export function scheduleActivityPicker(dayIndex: number, slotKey: string, activities: ReadonlyArray<{ value: string; label: string; description: string; emoji: string }>) {
  const day = PASSTIME_DAYS[dayIndex];
  const slot = passtimeScheduleSlot(slotKey);
  return passtimeV2(`## 📝 Escolha a matéria\n**Dia:** ${day?.[0].toUpperCase()}${day?.slice(1)}\n**Horário:** ${slot ? `${slot.start.replace(':', 'h')} – ${slot.end.replace(':', 'h')} · ${slot.label}` : 'inválido'}`, {
    banner: false,
    footer: 'Passtime • Alta • Etapa 3 de 4',
    components: [{ type: 1, components: [{
      type: 3,
      custom_id: `${PASSTIME_IDS.scheduleActivity}:${dayIndex}:${slotKey}`,
      placeholder: 'Escolha a matéria',
      min_values: 1,
      max_values: 1,
      options: activities.map(activity => ({
        label: activity.label,
        description: activity.description,
        value: activity.value,
        emoji: { name: activity.emoji },
      })),
    }] }],
  });
}

export function scheduleCancelPicker(entries: PasstimeScheduleEntry[]) {
  return passtimeV2('## 🗑️ Cancelar horário\nEscolha uma das suas reservas para removê-la.', {
    banner: false,
    footer: 'O cronograma será atualizado automaticamente',
    components: [{ type: 1, components: [{
      type: 3,
      custom_id: PASSTIME_IDS.scheduleCancel,
      placeholder: 'Selecione o horário que deseja cancelar',
      min_values: 1,
      max_values: 1,
      options: entries.slice(0, 25).map(entry => ({
        label: `${entry.day} ${passtimeScheduleTime(entry.time)}`.slice(0, 100),
        description: entry.label.slice(0, 100),
        value: entry.id,
        emoji: { name: '🗑️' },
      })),
    }] }],
  });
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
