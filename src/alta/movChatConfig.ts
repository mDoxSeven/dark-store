import { ALTA_GUILD_ID } from './rise.js';

export const ALTA_MOV_CHAT_GUILD_ID = ALTA_GUILD_ID;
export const ALTA_MOV_CHAT_REPORT_GUILD_ID = '1542871650473746454';
export const ALTA_MOV_CHAT_REPORT_CHANNEL_ID = '1554586776939794532';
export const ALTA_MOV_CHAT_RANK_CHANNEL_ID = '1531287345725313216';
export const ALTA_MOV_CHAT_RANK_REFRESH_MS = 5_000;
export const ALTA_MOV_CHAT_LEADER_ROLE_ID = '1514152283380781157';
export const ALTA_MOV_CHAT_ACCENT = 0xef1717;
export const ALTA_MOV_CHAT_REPORT_WEEKDAY = 6;
export const ALTA_MOV_CHAT_REPORT_HOUR = 16;
export const ALTA_MOV_CHAT_REPORT_MINUTE = 0;
export const ALTA_MOV_CHAT_RESET_PREFIX = 'movchat:reset:';
export const ALTA_MOV_CHAT_CLEANUP_INTERVAL_MS = 2_000;

export const ALTA_MOV_CHAT_COMMANDS = new Set([
  '!config_chat', '!chat', '!mensagens', '!dar_pontos', '!remover_pontos', '!resetar_chat', '!resetar_rank', '!limpeza_chat',
]);

export const movChatCommandName = (content: string) => content.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase('pt-BR') ?? '';
export const isAltaMovChatCommand = (content: string) => ALTA_MOV_CHAT_COMMANDS.has(movChatCommandName(content));
