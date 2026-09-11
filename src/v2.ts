export type V2ButtonInput = {
  label: string; type: 'LINK' | 'ROLE'; url: string; roleId: string;
  roleMode: 'ADD' | 'REMOVE' | 'TOGGLE'; style: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER'; emoji: string;
};
export type V2PanelInput = {
  name: string; channelId: string; title: string; description: string; color: string;
  imageUrl: string; assetId: string; thumbnailUrl: string; footer: string;
  imagePosition: 'top' | 'bottom'; showDivider: boolean; spacing: 'small' | 'large'; buttons: V2ButtonInput[];
};
const snowflake = /^\d{17,20}$/;
function https(value: string, field: string) {
  if (!value) return '';
  if (value.length > 2000) throw new Error(`${field} muito longa.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${field} inválida.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field} precisa ser HTTPS pública.`);
  return url.toString();
}
function emoji(input: string) {
  const value = input.trim();
  if (!value) return undefined;
  const custom = value.match(/^<(a)?:(\w{2,32}):(\d{17,20})>$/);
  if (custom) return { animated: !!custom[1], name: custom[2], id: custom[3] };
  if (value.length > 16 || /[<>]/.test(value)) throw new Error('Emoji inválido.');
  return { name: value };
}
export function validateV2Panel(raw: V2PanelInput): V2PanelInput {
  if (!raw || typeof raw !== 'object') throw new Error('Painel inválido.');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description : '';
  const footer = typeof raw.footer === 'string' ? raw.footer : '';
  if (!name || name.length > 60) throw new Error('Nome interno obrigatório, até 60 caracteres.');
  if (title.length > 200 || description.length > 3700 || footer.length > 500 || (!title && !description)) throw new Error('Revise os limites de título, conteúdo e rodapé.');
  if (!/^#[\da-f]{6}$/i.test(raw.color)) throw new Error('Cor inválida.');
  if (raw.channelId && !snowflake.test(raw.channelId)) throw new Error('Canal inválido.');
  if (raw.assetId && !/^[a-z\d]{20,32}$/i.test(raw.assetId)) throw new Error('Anexo inválido.');
  if (!['top', 'bottom'].includes(raw.imagePosition) || !['small', 'large'].includes(raw.spacing) || typeof raw.showDivider !== 'boolean') throw new Error('Layout inválido.');
  if (!Array.isArray(raw.buttons) || raw.buttons.length > 5) throw new Error('Use no máximo cinco botões.');
  const buttons = raw.buttons.map((b, index) => {
    if (!b || typeof b.label !== 'string' || !b.label.trim() || b.label.trim().length > 80) throw new Error(`Botão ${index + 1}: texto inválido.`);
    if (!['LINK', 'ROLE'].includes(b.type) || !['ADD', 'REMOVE', 'TOGGLE'].includes(b.roleMode) || !['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER'].includes(b.style)) throw new Error(`Botão ${index + 1}: configuração inválida.`);
    emoji(typeof b.emoji === 'string' ? b.emoji : '');
    if (b.type === 'LINK' && !https(b.url, `Botão ${index + 1}`)) throw new Error(`Botão ${index + 1}: URL obrigatória.`);
    if (b.type === 'ROLE' && !snowflake.test(b.roleId)) throw new Error(`Botão ${index + 1}: cargo inválido.`);
    return { label: b.label.trim(), type: b.type, url: b.type === 'LINK' ? https(b.url, `Botão ${index + 1}`) : '', roleId: b.type === 'ROLE' ? b.roleId : '', roleMode: b.roleMode, style: b.style, emoji: b.emoji.trim() };
  });
  return { name, channelId: raw.channelId || '', title, description, color: raw.color.toLowerCase(), imageUrl: https(raw.imageUrl, 'Imagem'), assetId: raw.assetId || '', thumbnailUrl: https(raw.thumbnailUrl, 'Thumbnail'), footer, imagePosition: raw.imagePosition, showDivider: raw.showDivider, spacing: raw.spacing, buttons };
}
export function buildV2Message(panel: V2PanelInput, localAssetUrl = '') {
  const content = [panel.title ? `## ${panel.title}` : '', panel.description].filter(Boolean).join('\n');
  const children: Record<string, unknown>[] = [];
  const separator = () => ({ type: 14, divider: panel.showDivider, spacing: panel.spacing === 'large' ? 2 : 1 });
  const mediaUrl = localAssetUrl || panel.imageUrl;
  const media = mediaUrl ? { type: 12, items: [{ media: { url: mediaUrl } }] } : null;
  const textBlock = panel.thumbnailUrl ? { type: 9, components: [{ type: 10, content }], accessory: { type: 11, media: { url: panel.thumbnailUrl } } } : { type: 10, content };
  if (media && panel.imagePosition === 'top') children.push(media, separator());
  children.push(textBlock);
  if (media && panel.imagePosition === 'bottom') children.push(separator(), media);
  if (panel.footer) children.push(separator(), { type: 10, content: `-# ${panel.footer}` });
  if (panel.buttons.length) children.push(separator(), { type: 1, components: panel.buttons.map(b => b.type === 'LINK'
    ? { type: 2, style: 5, label: b.label, url: b.url, emoji: emoji(b.emoji) }
    : { type: 2, style: ({ PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 })[b.style], label: b.label, custom_id: `v2role:${b.roleMode.toLowerCase()}:${b.roleId}`, emoji: emoji(b.emoji) }) });
  return { flags: 32768, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: parseInt(panel.color.slice(1), 16), components: children }] };
}
