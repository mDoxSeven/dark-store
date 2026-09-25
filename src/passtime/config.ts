export const PASSTIME_GUILD_ID = '1506789977927712808';
export const PASSTIME_OWNER_ID = '1002774556269891694';
export const PASSTIME_MANAGER_IDS = new Set([
  PASSTIME_OWNER_ID,
  '1516915772192985088',
]);
export const isPasstimeManager = (userId: string) => PASSTIME_MANAGER_IDS.has(userId);
export const PASSTIME_ACCENT = 0xffdd19;
export const PASSTIME_TIME_ZONE = 'America/Sao_Paulo';

export const PASSTIME_ART_FALLBACKS = {
  request: process.env.PASSTIME_REQUEST_BANNER_URL?.trim() || null,
  identification: process.env.PASSTIME_IDENTIFICATION_BANNER_URL?.trim() || null,
  points: process.env.PASSTIME_POINTS_BANNER_URL?.trim() || null,
  team: process.env.PASSTIME_TEAM_BANNER_URL?.trim() || null,
} as const;

export const PASSTIME_IDS = {
  verify: 'passtime:verify',
  bankOpen: 'passtime:bank:open',
  bankModal: 'passtime:bank:modal',
  embedOpen: 'passtime:embed:open',
  embedModal: 'passtime:embed:modal',
  announcementOpen: 'passtime:announcement:open',
  announcementModal: 'passtime:announcement:modal',
  scheduleOpen: 'passtime:schedule:open',
  scheduleModal: 'passtime:schedule:modal',
} as const;

export const PASSTIME_COMMANDS = new Set([
  '!passtime', '!apelido', '!embed', '!logs', '!verificacao', '!clear', '!membersrole', '!anuncio',
  '!banca', '!banca_apagar', '!banca_arquivar', '!banca_desarquivar', '!cronograma', '!lembrete',
  '!atualizar_cronograma', '!limpar_cronograma', '!editar_horarios', '!equipe',
]);

export const PASSTIME_DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const;

const dayAliases: Record<string, string> = {
  seg: 'segunda', segunda: 'segunda', 'segunda-feira': 'segunda',
  ter: 'terça', terca: 'terça', terça: 'terça', 'terça-feira': 'terça', 'terca-feira': 'terça',
  qua: 'quarta', quarta: 'quarta', 'quarta-feira': 'quarta',
  qui: 'quinta', quinta: 'quinta', 'quinta-feira': 'quinta',
  sex: 'sexta', sexta: 'sexta', 'sexta-feira': 'sexta',
  sab: 'sábado', sábado: 'sábado', sabado: 'sábado',
  dom: 'domingo', domingo: 'domingo',
};

export const passtimeCommandName = (content: string) => content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR') ?? '';
export const isPasstimeCommand = (content: string) => PASSTIME_COMMANDS.has(passtimeCommandName(content));
export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const normalizeDay = (value: string) => dayAliases[value.trim().toLocaleLowerCase('pt-BR')] ?? null;

export function safeChannelName(value: string) {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'banca';
}

export function saoPauloClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PASSTIME_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    time: `${read('hour')}:${read('minute')}`,
  };
}
