export const LEADERSHIP_GUILD_ID = '1542871650473746454';
export const LEADERSHIP_VERIFIED_ROLE_ID = '1542876488729108480';
export const LEADERSHIP_ADMIN_ROLE_IDS = [
  '1542873754823032883',
  '1542876909405216889',
  '1542873757792731176',
  '1542873759885820037',
] as const;

export const LEADERSHIP_AREAS = [
  { key: 'mov-chat', name: 'Mov Chat', roleId: '1554853588285788251' },
  { key: 'passtime', name: 'Passtime', roleId: '1542876176773681314' },
  { key: 'design', name: 'Design', roleId: '1542876173875286086' },
  { key: 'recrutamento', name: 'Recrutamento', roleId: '1542873767926173878' },
  { key: 'eventos', name: 'Eventos', roleId: '1542873765069856868' },
] as const;

export const LEADERSHIP_ACCENT = 0xffef94;

export const LEADERSHIP_IDS = {
  verify: 'leadership:verify',
  open: 'leadership:open',
  modal: 'leadership:modal',
  review: 'leadership:review',
  scheduleAdd: 'leadership:schedule:add',
  scheduleRemove: 'leadership:schedule:remove',
  scheduleRefresh: 'leadership:schedule:refresh',
  scheduleModal: 'leadership:schedule:modal',
} as const;

export const LEADERSHIP_COMMANDS = new Set([
  '!criarlideranca',
  '!lideranca',
  '!lideranca_area',
  '!lideranca_cronograma',
]);

export const LEADERSHIP_DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const;

const aliases: Record<string, typeof LEADERSHIP_DAYS[number]> = {
  seg: 'segunda', segunda: 'segunda', 'segunda-feira': 'segunda',
  ter: 'terça', terca: 'terça', terça: 'terça', 'terça-feira': 'terça', 'terca-feira': 'terça',
  qua: 'quarta', quarta: 'quarta', 'quarta-feira': 'quarta',
  qui: 'quinta', quinta: 'quinta', 'quinta-feira': 'quinta',
  sex: 'sexta', sexta: 'sexta', 'sexta-feira': 'sexta',
  sab: 'sábado', sábado: 'sábado', sabado: 'sábado',
  dom: 'domingo', domingo: 'domingo',
};

export const leadershipCommandName = (content: string) => content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR') ?? '';
export const isLeadershipCommand = (content: string) => LEADERSHIP_COMMANDS.has(leadershipCommandName(content));
export const normalizeLeadershipDay = (value: string) => aliases[value.trim().toLocaleLowerCase('pt-BR')] ?? null;
export const validLeadershipTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function safeLeadershipName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'area';
}
