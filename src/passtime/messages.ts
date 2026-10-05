import type { MessageCreateOptions } from 'discord.js';
import type { PasstimeConfig, PasstimeScheduleEntry } from '@prisma/client';
import {
  PASSTIME_ACCENT, PASSTIME_DAYS, PASSTIME_IDS, PASSTIME_SCHEDULE_SLOTS,
  PASSTIME_USER_SCHEDULE_LIMIT, passtimeScheduleSlot, passtimeScheduleTime,
} from './config.js';

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

export function rankingMessage(items: PasstimeRankItem[], cycleStartedAt: Date) {
  const medals = ['🥇', '🥈', '🥉'];
  const ranking = items.length
    ? items.slice(0, 20).map((item, index) => `${medals[index] ?? `**${index + 1}º**`} <@${item.userId}> — **${item.points} pts**`).join('\n')
    : '*O ranking deste ciclo ainda está vazio.*';
  const cycle = Math.floor(cycleStartedAt.getTime() / 1000);
  return passtimeV2([
    '# 🏆 | Ranking Passtime',
    '*Destaques do ciclo atual.*',
    '',
    ranking,
    '',
    `-# Ciclo iniciado em <t:${cycle}:d> às <t:${cycle}:t>.`,
  ].join('\n'), {
    banner: false,
    footer: 'Passtime • Alta • Atualização automática',
    components: [{ type: 1, components: [
      button(PASSTIME_IDS.rankMine, 'Meus pontos', '✨'),
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
