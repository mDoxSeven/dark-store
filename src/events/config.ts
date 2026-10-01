export const EVENTS_GUILD = '1443601058311176304';
export const EVENTS_VERIFIED = '1555273152848863364';
export const EVENTS_UNVERIFIED = '1555273066706112552';
export const EVENTS_VERIFIER = '1555273338941743205';
export const EVENTS_MANAGER_ROLES = ['1443603327337369651', '928355723329564692', '1443603328008454304', '1505968563712692257'];
export const CHANNEL_DEFAULTS: Record<string, string> = {
  verificacao: '1443605183392120923', regras: '1443601654829289686',
  funcoes: '1443602084279881920', pontos: '1443602732308107457', cronograma: '1443601963198582915',
  guia: '1443601757644259369', banca: '1443603227525255260', relatorios: '1444032550413533295',
  lideranca: '1542886994441408603', justificativas: '1555280070900326531', aulinha: '1555280334004687018', roteiro: '1555280646677594142',
};
export const CHANNEL_KEYS = ['verificacao', 'regras', 'guia', 'funcoes', 'banca', 'aulinha', 'pontos', 'cronograma', 'roteiro', 'relatorios', 'justificativas', 'analise', 'verificadores', 'lideranca'];
export type EventFunction = { key: string; name: string; points: number };
export function parseFunction(input: string): EventFunction {
  const [key, name, raw, ...extra] = input.split('|').map(s => s.trim());
  const points = Number(raw);
  if (!/^[a-z0-9_-]{1,25}$/.test(key ?? '') || !name || name.length > 80 || raw === undefined || raw === '' || !Number.isInteger(points) || points < 0 || points > 10000 || extra.length) throw new Error('Use chave|Nome da função|pontos (0 a 10000).');
  return { key, name, points };
}
export function parseEventDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) throw new Error('Use AAAA-MM-DD HH:MM, horário de Brasília.');
  const date = new Date(value.replace(' ', 'T') + ':00-03:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() - 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ') !== value) throw new Error('Data inválida.');
  return date;
}
export function attendanceOpen(event: { status: string; startsAt: Date | null; endsAt: Date | null }, now = new Date()) {
  return event.status === 'APPROVED' && !!event.startsAt && !!event.endsAt && now >= event.startsAt && now <= event.endsAt;
}
