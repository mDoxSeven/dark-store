import { ActionRowBuilder, ChannelType, MessageFlags, ModalBuilder, PermissionFlagsBits as P, TextInputBuilder, TextInputStyle,
  type Client, type Guild, type GuildMember, type Interaction, type Message, type MessageEditOptions, type TextChannel } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';
import { LEADERSHIP_GUILD_ID } from '../leadership/config.js';
import { refreshLinkedLeadershipSchedule } from '../leadership/module.js';
import { CHANNEL_DEFAULTS, CHANNEL_KEYS, EVENTS_GUILD, EVENTS_MANAGER_ROLES, EVENTS_UNVERIFIED, EVENTS_VERIFIED, EVENTS_VERIFIER, attendanceOpen, parseEventDate, parseFunction, type EventFunction } from './config.js';
import { button, guide, icons, row, rules, safe, v2 } from './messages.js';

async function settings() {
  const s = await prisma.eventsSettings.upsert({ where: { guildId: EVENTS_GUILD }, create: { guildId: EVENTS_GUILD, managerRolesJson: JSON.stringify(EVENTS_MANAGER_ROLES) }, update: {} });
  return { ...s, channels: { ...CHANNEL_DEFAULTS, ...JSON.parse(s.channelsJson) } as Record<string, string>, managers: JSON.parse(s.managerRolesJson) as string[], functions: JSON.parse(s.functionsJson) as EventFunction[] };
}
type Settings = Awaited<ReturnType<typeof settings>>;
const locks = new Set<string>();
async function locked<T>(key: string, work: () => Promise<T>): Promise<T> {
  if (locks.has(key)) throw new Error('Esta solicitação já está sendo processada. Aguarde.');
  locks.add(key); try { return await work(); } finally { locks.delete(key); }
}
const isManager = (m: GuildMember, s: Settings) => s.managers.some(id => m.roles.cache.has(id));
async function textChannel(guild: Guild, id?: string) {
  if (!id) throw new Error('Canal ainda não configurado. Peça à administração para usar !eventos canal.');
  const c = await guild.channels.fetch(id);
  if (!c || c.type !== ChannelType.GuildText) throw new Error(`O canal ${id} precisa ser um canal de texto deste servidor.`);
  return c;
}
async function publish(guild: Guild, key: string, channelId: string, payload: ReturnType<typeof v2>) {
  return locked(`publish:${key}`, async () => {
  const channel = await textChannel(guild, channelId);
  const saved = await prisma.eventsRecord.findUnique({ where: { key: `panel:${EVENTS_GUILD}:${key}` } });
  const previous = saved?.channelId === channelId && saved.messageId ? await channel.messages.fetch(saved.messageId).catch(e => { if (e.code === 10008) return null; throw e; }) : null;
  const message = previous ? await previous.edit({ ...payload, attachments: [] } as MessageEditOptions) : await channel.send(payload);
  await prisma.eventsRecord.upsert({ where: { key: `panel:${EVENTS_GUILD}:${key}` }, create: { guildId: EVENTS_GUILD, kind: 'panel', userId: guild.client.user.id, key: `panel:${EVENTS_GUILD}:${key}`, body: key, channelId, messageId: message.id }, update: { channelId, messageId: message.id } });
  });
}
async function panels(guild: Guild, s: Settings) {
  const items: [string, ReturnType<typeof v2>][] = [
    ['verificacao', v2('VERIFIQUE-SE', 'Seu acesso aos bastidores começa aqui!\n\nClique abaixo para solicitar a verificação. Um integrante com o cargo de **Verificador** analisará seu pedido. O acesso só será liberado após a aprovação.', [row(button('verify', 'Solicitar verificação'))], 'verificacao')],
    ['regras', rules()], ['guia', guide()],
    ['banca', v2('CRIE SUA BANCA', '**Sua criatividade merece um espaço!**\nDesenvolva propostas, roteiros e ideias de eventos para a Alta.\n\nClique abaixo, escolha um emoji e dê um nome à sua banca. Seu tópico fica visível a quem tem acesso a este canal. Uma banca por integrante.', [row(button('bank', 'Criar minha banca'))], 'banca')],
    ['funcoes', v2('FUNÇÕES • BASTIDORES', 'Escolha sua função e abra um tópico para organizar sua atuação. Os tópicos ficam visíveis a quem tem acesso ao canal.\n\n' + (s.functions.length ? s.functions.map(f => `**${safe(f.name)}** — ${f.points} pontos por presença validada`).join('\n') : '*A gestão ainda precisa cadastrar as funções e seus valores.*'), s.functions.length ? [row({ type: 3, custom_id: 'ev:function', placeholder: 'Qual é sua função?', options: s.functions.map(f => ({ label: f.name, value: f.key })) })] : [], 'funcoes')],
    ['aulinha', v2('SOLICITE AULINHA', 'Vamos preparar seu evento juntos? Informe tema, data e duração desejados.\n\nA solicitação depende de aprovação da gestão. Horários de Brasília. Ao aprovar, a aulinha entra no cronograma de Eventos e no da Liderança.', [row(button('class', 'Solicitar agendamento'))], 'aulinha')],
    ['justificativas', v2('JUSTIFICATIVAS', 'Não poderá participar? Informe o evento, a data e um motivo breve. Evite detalhes pessoais sensíveis: sua justificativa será encaminhada à gestão.', [row(button('absence', 'Justificar ausência'))], 'justificativas')],
    ['pontos', v2('PONTUAÇÃO • EVENTOS', 'Sua participação faz a diferença!\n\nA presença é registrada **durante o horário do evento**, na função escolhida, e só gera pontos após validação da gestão. Cada pessoa pode registrar uma presença por evento.\n\nUse o botão para consultar seus pontos. Os valores das funções ficam no painel de funções.', [row(button('points', 'Meus pontos'))], 'pontos')],
    ['roteiro', v2('ROTEIRO DE EVENTOS', '**1 ┊ Ideia** — desenvolva sua proposta na banca.\n**2 ┊ Aulinha** — solicite preparação com a equipe.\n**3 ┊ Organização** — distribua funções e confirme o cronograma.\n**4 ┊ Evento** — siga o roteiro e registre sua presença.\n**5 ┊ Fechamento** — a gestão valida participações e envia o relatório.', [], 'roteiro')],
    ['relatorios', v2('RELATÓRIOS DE EVENTOS', '**Modelo da Liderança**\n• Área: Eventos\n• Período\n• Atividades realizadas\n• Resultados e pendências\n\nA gestão preenche o relatório no botão abaixo. O Angel inclui as presenças validadas e os pontos do período e envia uma cópia à Liderança.\n\n`!eventos relatorio` consulta o acumulado. Não há reset automático neste módulo.', [row(button('report','Preencher relatório'))], 'relatorios')],
  ];
  for (const [key, payload] of items) if (s.channels[key]) await publish(guild, key, s.channels[key]!, payload);
  await calendar(guild, s);
}
async function calendar(guild: Guild, s: Settings) {
  const upcoming = await prisma.eventsRecord.findMany({ where: { guildId: EVENTS_GUILD, kind: { in: ['event', 'class'] }, status: 'APPROVED', endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 20 });
  const lines = upcoming.map(e => `**${e.kind === 'class' ? 'Aulinha' : 'Evento'} ┊ ${safe(JSON.parse(e.body).title)}**\n<t:${Math.floor(e.startsAt!.getTime() / 1000)}:f> • ID: \`${e.id}\``);
  await publish(guild, 'cronograma', s.channels.cronograma!, v2('CRONOGRAMA', lines.join('\n\n') || 'Nenhuma atividade agendada. Acompanhe este painel para as próximas novidades!'));
  await refreshLinkedLeadershipSchedule(guild.client);
}
async function ensureReview(guild: Guild, s: Settings, verification = false) {
  const key = verification ? 'verificadores' : 'analise';
  if (s.channels[key]) {
    const channel = await textChannel(guild, s.channels[key]);
    if (channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)) throw new Error('O canal de análise deve permanecer privado.');
    return channel;
  }
  const marker = `Angel Eventos • ${key} privada • ${EVENTS_GUILD}`;
  await guild.channels.fetch();
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === marker);
  const channel = existing ?? await guild.channels.create({ name: verification ? '🎧・verificadores-eventos' : '🎧・analise-eventos', type: ChannelType.GuildText, topic: marker,
    permissionOverwrites: [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
      ...[...new Set(verification ? [EVENTS_VERIFIER] : s.managers)].map(id => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
    ], reason: 'Análises de verificação, aulinhas e presenças de Eventos' });
  s.channels[key] = channel.id;
  await prisma.eventsSettings.update({ where: { guildId: EVENTS_GUILD }, data: { channelsJson: JSON.stringify(s.channels) } });
  return textChannel(guild, channel.id);
}
async function sendReview(guild: Guild, recordId: string, s: Settings) {
  const r = await prisma.eventsRecord.findUniqueOrThrow({ where: { id: recordId } });
  if (r.messageId) return;
  const review = await ensureReview(guild, s, r.kind === 'verify');
  const data = JSON.parse(r.body) as { title?: string; details?: string };
  const msg = await review.send(v2('SOLICITAÇÃO • ANÁLISE', `**Tipo:** ${r.kind}\n**Integrante:** <@${r.userId}>\n${data.title ? `**Tema:** ${safe(data.title)}\n` : ''}${data.details ? safe(data.details) : ''}${r.startsAt ? `\n**Agendamento:** <t:${Math.floor(r.startsAt.getTime()/1000)}:f>` : ''}\n**Status:** aguardando análise\n-# ID: ${r.id}`, [row(button(`approve:${r.id}`, 'Aprovar', 3), button(`reject:${r.id}`, 'Recusar', 4))]));
  await prisma.eventsRecord.update({ where: { id: r.id }, data: { channelId: review.id, messageId: msg.id } });
}
export async function eventsJoin(member: GuildMember) {
  if (member.guild.id !== EVENTS_GUILD || member.user.bot || member.roles.cache.has(EVENTS_VERIFIED)) return;
  await member.roles.add(EVENTS_UNVERIFIED, 'Eventos Alta: aguardando verificação autorizada');
}
function modal(action: string, title: string, fields: [string, string, number][]) {
  return new ModalBuilder().setCustomId(`ev:${action}`).setTitle(title).addComponents(fields.map(([id, label, max]) => new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(max > 200 ? TextInputStyle.Paragraph : TextInputStyle.Short).setMaxLength(max).setRequired(true))));
}
async function createThread(guild: Guild, member: GuildMember, s: Settings, kind: 'bank' | 'function', name: string, functionKey = '') {
  const key = `thread:${EVENTS_GUILD}:${kind}:${member.id}:${functionKey}`;
  return locked(key, async () => {
    const parent = await textChannel(guild, s.channels[kind === 'bank' ? 'banca' : 'funcoes']);
    if (!parent.permissionsFor(member)?.has(P.ViewChannel)) throw new Error('Você não tem acesso ao canal de tópicos.');
    const old = await prisma.eventsRecord.findUnique({ where: { key } });
    if (old?.threadId) {
      const thread = await guild.channels.fetch(old.threadId).catch(e => { if (e.code === 10003) return null; throw e; });
      if (thread?.isThread()) { if (thread.archived && !thread.locked) await thread.setArchived(false); return thread.id; }
    }
    const entry = await prisma.eventsRecord.upsert({ where: { key }, create: { guildId: EVENTS_GUILD, userId: member.id, kind, key, body: name }, update: { body: name } });
    // Persist immediately after creation, before sending the welcome message.
    const thread = await parent.threads.create({ name: name.slice(0,100), type: ChannelType.PublicThread, autoArchiveDuration: 1440, reason: `Eventos: ${kind} de ${member.id}` });
    await prisma.eventsRecord.update({ where: { id: entry.id }, data: { threadId: thread.id, status: 'OPEN' } });
    await thread.members.add(member.id);
    await thread.send(v2(kind === 'bank' ? 'SUA BANCA ESTÁ ABERTA' : 'TÓPICO DE FUNÇÃO', `**Responsável:** <@${member.id}>\n**${safe(name)}**\n\n${kind === 'bank' ? 'Descreva a ideia, objetivo, dinâmica, recursos e equipe necessária. Este espaço é seu caderno criativo!' : 'Organize tarefas, materiais e combinados da sua função aqui.'}\n\nEste tópico é visível aos membros com acesso ao canal.`, [row(button(`close:${entry.id}`, 'Encerrar tópico'))]));
    return thread.id;
  });
}
async function eventCard(guild: Guild, id: string, s: Settings) {
  const e = await prisma.eventsRecord.findUniqueOrThrow({ where: { id } });
  const data = JSON.parse(e.body) as { title: string; functions?: EventFunction[] };
  const functions = data.functions ?? [];
  const channel = await textChannel(guild, s.channels.cronograma);
  const payload = v2(e.kind === 'class' ? 'AULINHA AGENDADA' : 'PRESENÇA • EVENTO', `**${safe(data.title)}**\n<t:${Math.floor(e.startsAt!.getTime()/1000)}:f> até <t:${Math.floor(e.endsAt!.getTime()/1000)}:t>\n**Responsável:** <@${e.userId}>\n\n${e.kind === 'class' ? 'Agendamento confirmado pela gestão.' : 'Durante o evento, selecione sua função. A gestão validará sua participação antes de pontuar.'}\n-# ID: ${e.id}`, e.kind === 'event' && functions.length ? [row({ type: 3, custom_id: `ev:attendance:${e.id}`, placeholder: 'Registrar presença na minha função', options: functions.map(f => ({ label: f.name, value: f.key })) })] : []);
  await publish(guild, `event:${id}`, channel.id, payload);
}
export async function handleEventsInteraction(i: Interaction) {
  if (!(i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) || !i.customId.startsWith('ev:')) return false;
  if (i.guildId !== EVENTS_GUILD || !i.guild) throw new Error('Esta função pertence ao servidor de Eventos da Alta.');
  const guild = i.guild;
  const [_, action, id] = i.customId.split(':');
  const s = await settings();
  const member = await guild.members.fetch({ user: i.user.id, force: true });
  if (action !== 'verify' && action !== 'approve' && action !== 'reject' && !member.roles.cache.has(EVENTS_VERIFIED) && !isManager(member, s)) throw new Error('Você precisa estar verificado para usar esta função.');
  if (action === 'report' && i.isButton()) {
    if (!isManager(member,s)) throw new Error('Somente a gestão de Eventos pode enviar relatórios.');
    await i.showModal(modal('report','Relatório de Eventos', [['start','Início do período: AAAA-MM-DD',10],['end','Fim do período: AAAA-MM-DD',10],['activities','Atividades realizadas',650],['results','Resultados e pendências',650]]));
    return true;
  }
  if (i.isButton() && ['bank', 'class', 'absence'].includes(action!)) {
    await i.showModal(action === 'bank' ? modal('bank', 'Crie sua banca', [['name','Nome da banca',70],['emoji','Emoji da banca (ex.: 🎧)',20]]) : action === 'class' ? modal('class','Solicitar aulinha',[['title','Tema da aulinha',100],['date','Data: AAAA-MM-DD HH:MM (Brasília)',16],['duration','Duração em minutos (15 a 240)',3],['details','O que você quer aprender?',1000]]) : modal('absence','Justificar ausência',[['title','Evento e data',150],['details','Motivo breve (sem detalhes sensíveis)',1000]]));
    return true;
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === 'verify' && i.isButton()) {
    if (member.roles.cache.has(EVENTS_VERIFIED)) { await i.editReply('Você já está verificado.'); return true; }
    await locked(`verify:${member.id}`, async () => {
      const key = `verify:${EVENTS_GUILD}:${member.id}`;
      let r = await prisma.eventsRecord.findUnique({ where: { key } });
      if (!r) r = await prisma.eventsRecord.create({ data: { guildId: EVENTS_GUILD, kind: 'verify', userId: member.id, body: '{}', key } });
      await sendReview(guild, r.id, s);
    });
    await i.editReply('Pedido encaminhado. Aguarde a aprovação de um verificador.');
  } else if (action === 'bank' && i.isModalSubmit()) {
    const emoji = i.fields.getTextInputValue('emoji').trim();
    if (!/\p{Extended_Pictographic}/u.test(emoji) || /[<>@\r\n]/.test(emoji)) throw new Error('Use um emoji comum do teclado, como 🎧.');
    const thread = await createThread(guild, member, s, 'bank', `${emoji}・${i.fields.getTextInputValue('name').trim()}`);
    await i.editReply(`Sua banca: <#${thread}>`);
  } else if (action === 'function' && i.isStringSelectMenu()) {
    const f = s.functions.find(f => f.key === i.values[0]);
    if (!f) throw new Error('Função não cadastrada. Atualize o painel.');
    const thread = await createThread(guild, member, s, 'function', `🎧・${f.name}・${member.displayName}`, f.key);
    await i.editReply(`Seu tópico: <#${thread}>`);
  } else if ((action === 'class' || action === 'absence') && i.isModalSubmit()) {
    let startsAt: Date | undefined, endsAt: Date | undefined;
    if (action === 'class') {
      startsAt = parseEventDate(i.fields.getTextInputValue('date'));
      const duration = Number(i.fields.getTextInputValue('duration'));
      if (startsAt <= new Date() || !Number.isInteger(duration) || duration < 15 || duration > 240) throw new Error('Escolha uma data futura e duração entre 15 e 240 minutos.');
      endsAt = new Date(startsAt.getTime() + duration * 60000);
    }
    await locked(`request:${member.id}:${action}`, async () => {
      const key = `request:${EVENTS_GUILD}:${member.id}:${action}`;
      if (await prisma.eventsRecord.findUnique({ where: { key } })) throw new Error('Você já possui uma solicitação desse tipo aguardando análise.');
      const r = await prisma.eventsRecord.create({ data: { guildId: EVENTS_GUILD, userId: member.id, kind: action, key, body: JSON.stringify({ title: i.fields.getTextInputValue('title'), details: i.fields.getTextInputValue('details') }), startsAt, endsAt } });
      await sendReview(guild, r.id, s);
    });
    await i.editReply('Solicitação salva e enviada para análise.');
  } else if ((action === 'approve' || action === 'reject') && i.isButton() && id) {
    await locked(`review:${id}`, async () => {
      const r = await prisma.eventsRecord.findFirstOrThrow({ where: { id, guildId: EVENTS_GUILD, kind: { in: ['verify','class','absence'] } } });
      if (r.kind === 'verify' ? !member.roles.cache.has(EVENTS_VERIFIER) : !isManager(member, s)) throw new Error('Você não possui o cargo autorizado para esta análise.');
      if (r.status !== 'PENDING') throw new Error('Solicitação já analisada.');
      if (r.messageId !== i.message.id || r.channelId !== i.channelId) throw new Error('Mensagem de análise inválida.');
      if (action === 'approve' && r.kind === 'class' && (!r.startsAt || r.startsAt <= new Date())) throw new Error('O horário solicitado já passou. Recuse e solicite novo agendamento.');
      if (action === 'approve' && r.kind === 'verify') {
        const target = await guild.members.fetch({ user: r.userId, force: true });
        const roles = await guild.roles.fetch();
        if (![EVENTS_VERIFIED, EVENTS_UNVERIFIED].every(id => roles.get(id)?.editable)) throw new Error('Coloque o cargo do Angel acima dos cargos de verificação.');
        await target.roles.add(EVENTS_VERIFIED, `Verificado por ${member.id}`);
        await target.roles.remove(EVENTS_UNVERIFIED, `Verificado por ${member.id}`);
      }
      await prisma.eventsRecord.update({ where: { id }, data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', reviewerId: member.id, key: null } });
      await i.message.edit(v2('SOLICITAÇÃO ANALISADA', `**Integrante:** <@${r.userId}>\n**Tipo:** ${r.kind}\n**Resultado:** ${action === 'approve' ? 'Aprovada' : 'Recusada'}\n**Analisado por:** <@${member.id}>\n-# ID: ${id}`) as MessageEditOptions);
      if (action === 'approve' && r.kind === 'class') { await eventCard(guild, id, s); await calendar(guild, s); }
    });
    await i.editReply('Análise registrada.');
  } else if (action === 'attendance' && i.isStringSelectMenu() && id) {
    const e = await prisma.eventsRecord.findFirstOrThrow({ where: { id, guildId: EVENTS_GUILD, kind: 'event' } });
    if (!attendanceOpen(e)) throw new Error('O registro de presença só fica disponível durante o horário do evento.');
    const f = (JSON.parse(e.body).functions as EventFunction[]).find(f => f.key === i.values[0]);
    if (!f) throw new Error('Função inválida para este evento.');
    await locked(`attendance:${id}:${member.id}`, async () => {
      const a = await prisma.eventsAttendance.upsert({ where: { eventId_userId: { eventId: id, userId: member.id } }, create: { guildId: EVENTS_GUILD, eventId: id, userId: member.id, functionKey: f.key, functionName: f.name, points: f.points }, update: {} });
      await sendAttendanceReview(guild, a.id, s);
    });
    await i.editReply('Presença registrada. Seus pontos dependem da validação da gestão.');
  } else if ((action === 'attapprove' || action === 'attreject') && i.isButton() && id) {
    if (!isManager(member, s)) throw new Error('Somente a gestão de Eventos pode validar presença.');
    const a = await prisma.eventsAttendance.findFirstOrThrow({ where: { id, guildId: EVENTS_GUILD } });
    if (a.messageId !== i.message.id || i.channelId !== s.channels.analise) throw new Error('Mensagem de análise inválida.');
    const result = await prisma.eventsAttendance.updateMany({ where: { id, status: 'PENDING' }, data: { status: action === 'attapprove' ? 'APPROVED' : 'REJECTED', reviewerId: member.id } });
    if (!result.count) throw new Error('Presença já analisada.');
    await i.message.edit(v2('PRESENÇA ANALISADA', `<@${a.userId}> • **${safe(a.functionName)}**\n${action === 'attapprove' ? `Aprovada: **${a.points} pontos**` : 'Recusada: nenhum ponto atribuído'}\n**Gestão:** <@${member.id}>\n-# Evento: ${a.eventId}`) as MessageEditOptions);
    await i.editReply('Presença analisada.');
  } else if (action === 'report' && i.isModalSubmit()) {
    if (!isManager(member,s)) throw new Error('Somente a gestão de Eventos pode enviar relatórios.');
    const start = parseEventDate(i.fields.getTextInputValue('start')+' 00:00');
    const end = new Date(parseEventDate(i.fields.getTextInputValue('end')+' 00:00').getTime()+86400000);
    if (end <= start || end.getTime()-start.getTime()>366*86400000) throw new Error('Informe um período válido de até 366 dias.');
    await report(guild,s,member.id,undefined,{ start,end,activities:i.fields.getTextInputValue('activities'),results:i.fields.getTextInputValue('results') });
    await i.editReply('Relatório no padrão da Liderança enviado aos dois canais.');
  } else if (action === 'points') {
    const rows = await prisma.eventsAttendance.findMany({ where: { guildId: EVENTS_GUILD, userId: member.id, status: 'APPROVED' } });
    await i.editReply(`Você tem **${rows.reduce((n,a) => n+a.points,0)} pontos** em **${rows.length} presenças validadas**.`);
  } else if (action === 'close' && i.isButton() && id) {
    const r = await prisma.eventsRecord.findFirstOrThrow({ where: { id, guildId: EVENTS_GUILD, kind: { in: ['bank','function'] } } });
    if (r.userId !== member.id && !isManager(member,s)) throw new Error('Somente o responsável ou a gestão pode encerrar.');
    if (!i.channel?.isThread() || i.channel.id !== r.threadId) throw new Error('Tópico inválido.');
    await i.editReply('Tópico encerrado e preservado no histórico.');
    await i.channel.setLocked(true);
    await i.channel.setArchived(true);
    await prisma.eventsRecord.update({ where: { id }, data: { status: 'CLOSED' } });
  } else throw new Error('Ação desconhecida. Atualize o painel.');
  return true;
}
async function sendAttendanceReview(guild: Guild, id: string, s: Settings) {
  const a = await prisma.eventsAttendance.findUniqueOrThrow({ where: { id } });
  if (a.messageId || a.status !== 'PENDING') return;
  const c = await ensureReview(guild, s);
  const e = await prisma.eventsRecord.findUniqueOrThrow({ where: { id: a.eventId } });
  const msg = await c.send(v2('VALIDAR PRESENÇA', `**Evento:** ${safe(JSON.parse(e.body).title)}\n**Integrante:** <@${a.userId}>\n**Função:** ${safe(a.functionName)}\n**Pontuação prevista:** ${a.points}\n\nValide somente após conferir a participação.`, [row(button(`attapprove:${id}`,'Validar',3),button(`attreject:${id}`,'Recusar',4))]));
  await prisma.eventsAttendance.update({ where: { id }, data: { messageId: msg.id } });
}

export async function handleEventsCommand(message: Message) {
  if (message.guildId !== EVENTS_GUILD || !message.guild || !/^!eventos(?:\s|$)/i.test(message.content)) return false;
  const guild = message.guild;
  const member = await guild.members.fetch({ user: message.author.id, force: true });
  const s = await settings();
  const [command = 'ajuda', ...parts] = message.content.trim().split(/\s+/).slice(1);
  const args = parts.join(' ');
  try {
    if (['canal','gestao','funcao','publicar'].includes(command)) {
      if (command === 'funcao' ? !isManager(member,s) : !member.permissions.has(P.Administrator)) throw new Error(command === 'funcao' ? 'Somente a gestão de Eventos pode definir funções e pontuação.' : 'Somente administradores podem configurar o módulo.');
      if (command === 'canal') {
        const [key,id] = parts;
        if (!CHANNEL_KEYS.includes(key!) || !/^\d{17,20}$/.test(id ?? '')) throw new Error(`Use !eventos canal NOME ID. Nomes: ${CHANNEL_KEYS.join(', ')}.`);
        const targetGuild = key === 'lideranca' ? await guild.client.guilds.fetch(LEADERSHIP_GUILD_ID) : guild;
        const channel = await textChannel(targetGuild,id);
        if (['analise','verificadores'].includes(key!) && channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)) throw new Error('O canal de análise precisa ser privado.');
        s.channels[key!] = id!;
        await prisma.eventsSettings.update({ where: { guildId: EVENTS_GUILD }, data: { channelsJson: JSON.stringify(s.channels) } });
      } else if (command === 'gestao') {
        const roles = args.split(/[ ,]+/).filter(Boolean);
        if (!roles.length || roles.some(id => !/^\d{17,20}$/.test(id) || id === guild.id || id === EVENTS_VERIFIED || id === EVENTS_UNVERIFIED)) throw new Error('Informe apenas IDs dos cargos de gestão, separados por espaço.');
        const all = await guild.roles.fetch();
        if (roles.some(id => !all.has(id))) throw new Error('Um cargo não existe neste servidor.');
        const previousManagers = s.managers;
        s.managers = [...new Set(roles)];
        await prisma.eventsSettings.update({ where: { guildId: EVENTS_GUILD }, data: { managerRolesJson: JSON.stringify(s.managers) } });
        const channel = await ensureReview(guild,s);
        // Revoke only access previously granted by this module.
        for (const oldId of previousManagers) if (!s.managers.includes(oldId)) await channel.permissionOverwrites.delete(oldId);
        for (const id of s.managers) await channel.permissionOverwrites.edit(id,{ ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      } else if (command === 'funcao') {
        const f = parseFunction(args);
        s.functions = [...s.functions.filter(x => x.key !== f.key),f];
        if (s.functions.length > 25) throw new Error('Máximo de 25 funções por seletor.');
        await prisma.eventsSettings.update({ where: { guildId: EVENTS_GUILD }, data: { functionsJson: JSON.stringify(s.functions) } });
      }
      if (command === 'publicar') await panels(guild,s);
      await message.reply({ content: command === 'publicar' ? 'Painéis publicados/atualizados sem apagar o histórico.' : 'Configuração salva. Use !eventos publicar para atualizar os painéis.', allowedMentions: { parse: [] } });
    } else if (['agendar','cancelar','relatorio'].includes(command)) {
      if (!isManager(member,s)) throw new Error('Somente os cargos configurados de gestão de Eventos podem usar este comando.');
      if (command === 'agendar') {
        const [title,date,rawDuration,...extra] = args.split('|').map(x=>x.trim());
        if (!title || title.length > 100 || !date || extra.length) throw new Error('Use !eventos agendar Título|AAAA-MM-DD HH:MM|minutos');
        if (!s.functions.length) throw new Error('Cadastre as funções e pontos antes de abrir um evento.');
        const startsAt = parseEventDate(date), duration = Number(rawDuration);
        if (startsAt <= new Date() || !Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error('Informe data futura e duração de 1 a 1440 minutos.');
        const e = await prisma.eventsRecord.create({ data: { guildId: EVENTS_GUILD, userId: member.id, kind: 'event', status: 'APPROVED', reviewerId: member.id, startsAt, endsAt: new Date(startsAt.getTime()+duration*60000), body: JSON.stringify({ title, functions: s.functions }) } });
        await eventCard(guild,e.id,s); await calendar(guild,s);
        await message.reply(`Evento agendado. ID: ${e.id}`);
      } else if (command === 'cancelar') {
        const e = await prisma.eventsRecord.findFirstOrThrow({ where: { id: args, guildId: EVENTS_GUILD, kind: { in: ['event','class'] }, status: 'APPROVED' } });
        await prisma.eventsRecord.update({ where: { id:e.id },data:{ status:'CANCELLED' } });
        await publish(guild,`event:${e.id}`,s.channels.cronograma!,v2('ATIVIDADE CANCELADA',`**${safe(JSON.parse(e.body).title)}**\nCancelada por <@${member.id}>. Presenças já analisadas permanecem no histórico.`));
        await calendar(guild,s); await message.reply('Atividade cancelada.');
      } else await report(guild,s,member.id,message);
    } else {
      await message.reply(v2('CENTRAL • EVENTOS', '**Membros:** use os painéis de verificação, bancas, funções, aulinhas, justificativas e pontos.\n\n**Configuração — administradores**\n`!eventos canal nome ID`\n`!eventos gestao ID_DO_CARGO [OUTRO_ID]`\n`!eventos publicar`\n\n**Gestão cadastrada**\n`!eventos funcao chave|Nome|pontos`\n`!eventos agendar Título|AAAA-MM-DD HH:MM|minutos`\n`!eventos cancelar ID_DA_ATIVIDADE`\n`!eventos relatorio`\n\nDatas no horário de Brasília. Os pontos por função são congelados no agendamento; alterações valem para novos eventos.'));
    }
  } catch (error) { await message.reply({ content: error instanceof Error ? error.message : 'Falha no módulo de Eventos.', allowedMentions: { parse: [] } }); }
  return true;
}
async function report(guild: Guild,s:Settings,actorId:string,message?:Message,details?:{start:Date;end:Date;activities:string;results:string}) {
  await locked('events-report',async()=>{
    const local = await textChannel(guild,s.channels.relatorios);
    const leadership = await guild.client.guilds.fetch(LEADERSHIP_GUILD_ID);
    const area = await prisma.leadershipArea.findFirst({where:{guildId:LEADERSHIP_GUILD_ID,roleId:'1542873765069856868'}});
    const remote = await textChannel(leadership,s.channels.lideranca ?? area?.reportChannelId ?? undefined);
    const entries = await prisma.eventsAttendance.findMany({ where:{guildId:EVENTS_GUILD,status:'APPROVED',...(details?{createdAt:{gte:details.start,lt:details.end}}:{})},orderBy:{createdAt:'asc'} });
    const users = new Map<string,{count:number;points:number;functions:Map<string,number>}>();
    for(const a of entries){const u=users.get(a.userId)??{count:0,points:0,functions:new Map<string,number>()};u.count++;u.points+=a.points;u.functions.set(a.functionName,(u.functions.get(a.functionName)??0)+1);users.set(a.userId,u);}
    const lines=[...users].sort((a,b)=>b[1].points-a[1].points).map(([id,u])=>`<@${id}> — **${u.points} pontos** • ${u.count} presenças\n${[...u.functions].map(([f,n])=>`${safe(f)}: ${n}`).join(' · ')}`);
    const pages:string[]=[];let page=''; for(const line of lines){if((page+line).length>2800){pages.push(page);page='';}page+=line+'\n\n';} if(page||!pages.length)pages.push(page||'Nenhuma presença validada.');
    const period=details ? `<t:${Math.floor(details.start.getTime()/1000)}:d> a <t:${Math.floor((details.end.getTime()-1)/1000)}:d>` : `Acumulado até <t:${Math.floor(Date.now()/1000)}:f>`;
    if(details){const payload=v2('RELATÓRIO • EVENTOS',`**Área:** Eventos\n**Período:** ${period}\n**Responsável:** <@${actorId}>\n\n**Atividades realizadas**\n${safe(details.activities)}\n\n**Resultados e pendências**\n${safe(details.results)}`,[],'relatorios');await local.send(payload);await remote.send(payload);}
    for(const [index,body] of pages.entries()){const payload=v2('RELATÓRIO • PARTICIPAÇÃO',`**Área:** Eventos\n**Período:** ${period}\nEmitido por <@${actorId}> • Parte ${index+1}/${pages.length}\n\n${body}\n*Somente presenças validadas. Sem reset de histórico.*`);await local.send(payload);await remote.send(payload);}
    await message?.reply('Relatório enviado em Eventos e Liderança. Nenhuma pontuação foi resetada.');
  });
}
let timer: ReturnType<typeof setInterval> | undefined;
export async function startEvents(client: Client) {
  if (locks.has('events-start')) return;
  return locked('events-start',async()=>{
  const guild=await client.guilds.fetch(EVENTS_GUILD).catch(()=>null); if(!guild)return;
  const s=await settings();
  const existing=await guild.emojis.fetch();
  for(const key of ['miku']){
    const name=`alta_miku_${key}`;
    try { const e=existing.find(e=>e.name===name)??await guild.emojis.create({name,attachment:fileURLToPath(new URL(`../../public/events/emoji-${key}.png`,import.meta.url)),reason:'Identidade Miku • Eventos Alta'});icons.set(key,{id:e.id,name}); }
    catch(error){console.error(`Emoji Eventos ${key}:`,error);}
  }
  if(!timer) timer=setInterval(()=>void reconcile(client).catch(e=>console.error('Eventos sincronização:',e)),60000).unref();
  await ensureReview(guild,s,true);
  await ensureReview(guild,s);
  await panels(guild,s);
  await reconcile(client);
  });
}
async function reconcile(client: Client) {
  if(locks.has('events-sync'))return;
  await locked('events-sync',async()=>{
    const guild=await client.guilds.fetch(EVENTS_GUILD);const s=await settings();
    const pending=await prisma.eventsRecord.findMany({where:{guildId:EVENTS_GUILD,kind:{in:['verify','class','absence']},status:'PENDING',messageId:null},take:20});
    for(const r of pending)if(!locks.has(`verify:${r.userId}`)&&!locks.has(`request:${r.userId}:${r.kind}`))await sendReview(guild,r.id,s);
    const attendance=await prisma.eventsAttendance.findMany({where:{guildId:EVENTS_GUILD,status:'PENDING',messageId:null},take:20});
    for(const a of attendance)if(!locks.has(`attendance:${a.eventId}:${a.userId}`))await sendAttendanceReview(guild,a.id,s);
    // Restore missing event cards after a failed send/restart; do not duplicate existing cards.
    const active=await prisma.eventsRecord.findMany({where:{guildId:EVENTS_GUILD,kind:{in:['event','class']},status:'APPROVED',endsAt:{gte:new Date()}}});
    for(const e of active)if(!await prisma.eventsRecord.findUnique({where:{key:`panel:${EVENTS_GUILD}:event:${e.id}`}}))await eventCard(guild,e.id,s);
    await calendar(guild,s);
  });
}
