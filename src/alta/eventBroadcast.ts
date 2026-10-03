import {
  MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction,
  type Client, type InteractionReplyOptions, type MessageCreateOptions,
} from 'discord.js';
import type { AltaEventBroadcast, AltaEventDraft } from '@prisma/client';
import sharp from 'sharp';
import { prisma } from '../lib/db.js';
import { ALTA_GUILD_ID } from './rise.js';

export const ALTA_EVENT_ROLE_ID = '1521611615017898185';
export const ALTA_EVENT_PREFIX = 'alta:evento:';
const ACCENT = 0x8d1745;
const running = new Set<string>();
const confirming = new Set<string>();

export const altaEventCommand = new SlashCommandBuilder()
  .setName('evento')
  .setDescription('Edita, testa e envia o anúncio V2 de evento da Alta.')
  .setDMPermission(false)
  .addSubcommand(command => command.setName('editar').setDescription('Edita o rascunho do anúncio.')
    .addStringOption(option => option.setName('titulo').setDescription('Novo título do anúncio').setMaxLength(120))
    .addStringOption(option => option.setName('mensagem').setDescription('Nova mensagem do anúncio').setMaxLength(3000))
    .addAttachmentOption(option => option.setName('arte').setDescription('Arte PNG, JPG, WEBP ou GIF de até 8 MB'))
    .addBooleanOption(option => option.setName('remover_arte').setDescription('Remove a arte atual do rascunho')))
  .addSubcommand(command => command.setName('testar').setDescription('Mostra a prévia somente para você.'))
  .addSubcommand(command => command.setName('enviar').setDescription('Revisa e confirma o disparo para membros online do cargo.'))
  .addSubcommand(command => command.setName('status').setDescription('Mostra o rascunho e os últimos disparos.'));

export function altaEventOperatorId() { return process.env.ALTA_EVENT_OPERATOR_ID?.trim() ?? ''; }
export function canManageAltaEvent(userId: string) { const allowed = altaEventOperatorId(); return /^\d{17,20}$/.test(allowed) && userId === allowed; }

function assertAccess(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  if (interaction.guildId !== ALTA_GUILD_ID) throw new Error('O `/evento` funciona somente no servidor oficial da Alta.');
  if (!/^\d{17,20}$/.test(altaEventOperatorId())) throw new Error('Configure `ALTA_EVENT_OPERATOR_ID` no `.env` do Angel.');
  if (!canManageAltaEvent(interaction.user.id)) throw new Error('Somente a pessoa autorizada pode usar o editor e os disparos de evento.');
}

function normalized(value: string, label: string, maximum: number) {
  const text = value.trim().replace(/\r\n/g, '\n');
  if (!text || text.length > maximum) throw new Error(`${label} precisa ter entre 1 e ${maximum} caracteres.`);
  return text;
}

type EventVisual = Pick<AltaEventDraft, 'title' | 'body' | 'artData' | 'artMime' | 'artName'>
  | Pick<AltaEventBroadcast, 'title' | 'body' | 'artData' | 'artMime' | 'artName'>;

export function altaEventV2(item: EventVisual, ephemeral = false, rows: Record<string, unknown>[] = []): MessageCreateOptions {
  const title = normalized(item.title, 'O título', 120);
  const body = normalized(item.body, 'A mensagem', 3000);
  const hasArt = Boolean(item.artData?.length && item.artName);
  const components: Record<string, unknown>[] = [
    ...(hasArt ? [{ type: 12, items: [{ media: { url: `attachment://${item.artName}` }, description: `Arte do evento: ${title}` }] }] : []),
    { type: 10, content: `# 🎉 | ${title}\n\n${body}` },
    ...(rows.length ? [{ type: 14, divider: true, spacing: 1 }, ...rows] : []),
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: '-# Alta Cúpula • Eventos · Angel' },
  ];
  return {
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: { parse: [] },
    ...(hasArt ? { files: [{ attachment: Buffer.from(item.artData!), name: item.artName! }] } : {}),
    components: [{ type: 17, accent_color: ACCENT, components }],
  } as unknown as MessageCreateOptions;
}

export function altaEventStatusV2(content: string) {
  return { attachments: [], components: [{ type: 17, accent_color: ACCENT, components: [
    { type: 10, content }, { type: 14, divider: true, spacing: 1 },
    { type: 10, content: '-# Alta Cúpula • Eventos · Angel' },
  ] }] } as const;
}

async function downloadArt(attachment: { url: string; size: number; contentType: string | null; name: string }) {
  const allowed = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]);
  const extension = allowed.get(attachment.contentType ?? '');
  if (!extension) throw new Error('A arte precisa ser PNG, JPG, WEBP ou GIF.');
  if (attachment.size <= 0 || attachment.size > 8_000_000) throw new Error('A arte precisa ter no máximo 8 MB.');
  const url = new URL(attachment.url);
  if (!['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('Anexo do Discord inválido.');
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'error' });
  if (!response.ok) throw new Error('Não consegui baixar a arte enviada.');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 8_000_000) throw new Error('A arte ultrapassou 8 MB.');
  const metadata = await sharp(data, { animated: true, limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000) throw new Error('Dimensões da arte inválidas.');
  return { artData: data, artMime: attachment.contentType, artName: `evento-alta.${extension}` };
}

async function draft() {
  return prisma.altaEventDraft.findUnique({ where: { guildId: ALTA_GUILD_ID } });
}

function assertComplete(item: AltaEventDraft | null): asserts item is AltaEventDraft {
  if (!item?.title.trim() || !item.body.trim()) throw new Error('Edite o título e a mensagem antes de testar ou enviar.');
}

export async function executeAltaEventCommand(interaction: ChatInputCommandInteraction) {
  assertAccess(interaction);
  if (!interaction.inCachedGuild()) throw new Error('Use o comando dentro do servidor da Alta.');
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'editar') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const current = await draft();
    const titleInput = interaction.options.getString('titulo');
    const bodyInput = interaction.options.getString('mensagem');
    const attachment = interaction.options.getAttachment('arte');
    const removeArt = interaction.options.getBoolean('remover_arte') === true;
    if (!titleInput && !bodyInput && !attachment && !removeArt) throw new Error('Informe um título, mensagem, arte ou `remover_arte`.');
    if (attachment && removeArt) throw new Error('Escolha anexar ou remover a arte, não os dois.');
    const art = attachment ? await downloadArt(attachment) : removeArt ? { artData: null, artMime: null, artName: null } : {};
    await prisma.altaEventDraft.upsert({
      where: { guildId: ALTA_GUILD_ID },
      create: { guildId: ALTA_GUILD_ID, title: titleInput ? normalized(titleInput, 'O título', 120) : '', body: bodyInput ? normalized(bodyInput, 'A mensagem', 3000) : '', updatedBy: interaction.user.id, ...art },
      update: { ...(titleInput ? { title: normalized(titleInput, 'O título', 120) } : {}), ...(bodyInput ? { body: normalized(bodyInput, 'A mensagem', 3000) } : {}), updatedBy: interaction.user.id, ...art },
    });
    await interaction.editReply('Rascunho atualizado. Use `/evento testar` para conferir o V2.');
    return;
  }
  if (subcommand === 'testar') {
    const item = await draft(); assertComplete(item);
    await interaction.reply(altaEventV2(item, true) as unknown as InteractionReplyOptions);
    return;
  }
  if (subcommand === 'status') {
    const item = await draft();
    const recent = await prisma.altaEventBroadcast.findMany({ where: { guildId: ALTA_GUILD_ID }, orderBy: { createdAt: 'desc' }, take: 5 });
    const history = recent.length ? recent.map(job => `\`${job.id}\` • ${job.status} • ${job.sentCount}/${job.targetCount} enviados • ${job.failedCount} falhas`).join('\n') : 'Nenhum disparo registrado.';
    await interaction.reply({ content: `**Rascunho:** ${item?.title || 'sem título'}${item?.artData ? ' • com arte' : ' • sem arte'}\n\n**Últimos disparos**\n${history}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }
  const item = await draft(); assertComplete(item);
  const stamp = item.updatedAt.getTime();
  const rows = [{ type: 1, components: [
    { type: 2, style: 4, custom_id: `${ALTA_EVENT_PREFIX}confirm:${stamp}`, label: 'Confirmar disparo' },
    { type: 2, style: 2, custom_id: `${ALTA_EVENT_PREFIX}cancel`, label: 'Cancelar' },
  ] }];
  await interaction.reply(altaEventV2(item, true, rows) as unknown as InteractionReplyOptions);
}

export async function handleAltaEventButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith(ALTA_EVENT_PREFIX)) return false;
  assertAccess(interaction);
  if (!interaction.inCachedGuild()) throw new Error('Use esta ação no servidor da Alta.');
  if (interaction.customId === `${ALTA_EVENT_PREFIX}cancel`) {
    await interaction.update(altaEventStatusV2('### Disparo cancelado\nNenhuma mensagem foi enviada.') as never);
    return true;
  }
  const stamp = Number(interaction.customId.slice(`${ALTA_EVENT_PREFIX}confirm:`.length));
  const item = await draft(); assertComplete(item);
  if (!Number.isSafeInteger(stamp) || item.updatedAt.getTime() !== stamp) throw new Error('O rascunho mudou depois da prévia. Use `/evento enviar` novamente.');
  const confirmationKey = `${interaction.user.id}:${stamp}`;
  if (confirming.has(confirmationKey)) throw new Error('Este disparo já está sendo preparado.');
  confirming.add(confirmationKey);
  try {
  const role = await interaction.guild.roles.fetch(ALTA_EVENT_ROLE_ID);
  if (!role) throw new Error('O cargo destinatário do evento não existe.');
  const members = await interaction.guild.members.fetch({ withPresences: true });
  const roleMembers = members.filter(member => !member.user.bot && member.roles.cache.has(role.id));
  const targets = roleMembers
    .filter(member => member.presence && member.presence.status !== 'offline')
    .map(member => member.id);
  if (!targets.length) throw new Error('Nenhum membro online possui o cargo destinatário.');
  await interaction.deferUpdate();
  const job = await prisma.$transaction(async tx => {
    const created = await tx.altaEventBroadcast.create({ data: {
      guildId: ALTA_GUILD_ID, roleId: role.id, title: item.title, body: item.body,
      artData: item.artData, artMime: item.artMime, artName: item.artName,
      requestedBy: interaction.user.id, targetCount: targets.length,
    } });
    await tx.altaEventDelivery.createMany({ data: targets.map(userId => ({ broadcastId: created.id, userId })) });
    return created;
  });
  const offlineCount = roleMembers.size - targets.length;
  await interaction.editReply(altaEventStatusV2(`### Disparo iniciado\nProtocolo: \`${job.id}\`\nDestinatários: **${targets.length} membros online** do cargo configurado.\nIgnorados por estarem offline ou invisíveis: **${offlineCount}**.\n\nA conclusão chegará no seu privado.`) as never);
  void runBroadcast(interaction.client, job.id);
  } finally { confirming.delete(confirmationKey); }
  return true;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function runBroadcast(client: Client, id: string) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await prisma.altaEventBroadcast.updateMany({ where: { id, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'RUNNING' } });
    const job = await prisma.altaEventBroadcast.findUnique({ where: { id } });
    if (!job || !['PENDING', 'RUNNING'].includes(job.status)) return;
    while (true) {
      const delivery = await prisma.altaEventDelivery.findFirst({ where: { broadcastId: id, status: 'PENDING' }, orderBy: { id: 'asc' } });
      if (!delivery) break;
      const claimed = await prisma.altaEventDelivery.updateMany({ where: { id: delivery.id, status: 'PENDING' }, data: { status: 'SENDING', lastError: null } });
      if (!claimed.count) continue;
      try {
        const user = await client.users.fetch(delivery.userId);
        await user.send(altaEventV2(job));
        await prisma.$transaction([
          prisma.altaEventDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT' } }),
          prisma.altaEventBroadcast.update({ where: { id }, data: { sentCount: { increment: 1 } } }),
        ]);
      } catch (error) {
        const detail = error instanceof Error ? error.message.slice(0, 500) : 'Falha ao enviar DM';
        await prisma.$transaction([
          prisma.altaEventDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', lastError: detail } }),
          prisma.altaEventBroadcast.update({ where: { id }, data: { failedCount: { increment: 1 } } }),
        ]);
      }
      await wait(800);
    }
    const counts = await prisma.altaEventDelivery.groupBy({ by: ['status'], where: { broadcastId: id }, _count: { _all: true } });
    const sent = counts.find(row => row.status === 'SENT')?._count._all ?? 0;
    const failed = counts.find(row => row.status === 'FAILED')?._count._all ?? 0;
    await prisma.altaEventBroadcast.update({ where: { id }, data: { status: 'COMPLETED', sentCount: sent, failedCount: failed, completedAt: new Date() } });
    const operator = await client.users.fetch(job.requestedBy).catch(() => null);
    await operator?.send({ content: `Disparo de evento \`${id}\` concluído: **${sent} enviados** e **${failed} falhas**.`, allowedMentions: { parse: [] } }).catch(() => {});
  } catch (error) {
    console.error(`Disparo de evento ${id}: ${error instanceof Error ? error.stack ?? error.message : error}`);
    await prisma.altaEventBroadcast.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'PENDING' } }).catch(() => {});
  } finally { running.delete(id); }
}

export async function startAltaEventBroadcasts(client: Client) {
  await prisma.altaEventDelivery.updateMany({ where: { status: 'SENDING' }, data: { status: 'PENDING', lastError: 'Retomado após reinício' } });
  const pending = await prisma.altaEventBroadcast.findMany({ where: { guildId: ALTA_GUILD_ID, status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true } });
  for (const job of pending) void runBroadcast(client, job.id);
}
