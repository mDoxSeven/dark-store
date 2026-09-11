import type { PrismaClient } from '@prisma/client';
import { STORE_GUILD_ID } from './store/config.js';

export type RaidAction = 'QUARANTINE' | 'KICK' | 'BAN';
export type AntiRaidSettings = {
  enabled: boolean; joinLimit: number; joinWindowSeconds: number; minAccountAgeHours: number;
  destructiveLimit: number; destructiveWindowSeconds: number; action: RaidAction;
  quarantineRoleId: string; logChannelId: string; trustedUserIds: string[];
};
const destructive = new Set(['CHANNEL_CREATE', 'CHANNEL_DELETE', 'ROLE_CREATE', 'ROLE_DELETE', 'MEMBER_BAN_ADD', 'WEBHOOK_CREATE', 'WEBHOOK_DELETE']);
export function validateAntiRaid(raw: AntiRaidSettings): AntiRaidSettings {
  const integer = (value: number, min: number, max: number, label: string) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} inválido.`); return value;
  };
  if (!raw || typeof raw.enabled !== 'boolean' || !['QUARANTINE', 'KICK', 'BAN'].includes(raw.action)) throw new Error('Configuração anti-raid inválida.');
  const ids = [...new Set((raw.trustedUserIds || []).map(String))];
  if (ids.length > 100 || ids.some(id => !/^\d{17,20}$/.test(id))) throw new Error('Lista de confiança inválida.');
  for (const id of [raw.quarantineRoleId, raw.logChannelId]) if (id && !/^\d{17,20}$/.test(id)) throw new Error('Cargo/canal inválido.');
  if (raw.action === 'QUARANTINE' && raw.enabled && !raw.quarantineRoleId) throw new Error('Informe o cargo de quarentena antes de ativar essa ação.');
  return { enabled: raw.enabled, joinLimit: integer(raw.joinLimit, 3, 100, 'Limite de entradas'), joinWindowSeconds: integer(raw.joinWindowSeconds, 5, 300, 'Janela de entradas'), minAccountAgeHours: integer(raw.minAccountAgeHours, 0, 8760, 'Idade mínima'), destructiveLimit: integer(raw.destructiveLimit, 2, 20, 'Limite destrutivo'), destructiveWindowSeconds: integer(raw.destructiveWindowSeconds, 5, 300, 'Janela destrutiva'), action: raw.action, quarantineRoleId: raw.quarantineRoleId, logChannelId: raw.logChannelId, trustedUserIds: ids };
}
export class AntiRaidEngine {
  private joins: number[] = [];
  private audits = new Map<string, number[]>();
  join(settings: AntiRaidSettings, accountCreatedAt: number, now = Date.now()) {
    if (!settings.enabled) return { detected: false, reasons: [] as string[] };
    const window = settings.joinWindowSeconds * 1000;
    this.joins = this.joins.filter(time => now - time < window); this.joins.push(now);
    const reasons: string[] = [];
    if (this.joins.length >= settings.joinLimit) reasons.push(`${this.joins.length} entradas em ${settings.joinWindowSeconds}s`);
    if (settings.minAccountAgeHours && now - accountCreatedAt < settings.minAccountAgeHours * 3600_000) reasons.push('conta recém-criada');
    return { detected: reasons.length > 0, reasons };
  }
  audit(settings: AntiRaidSettings, actorId: string, action: string, now = Date.now()) {
    if (!settings.enabled || settings.trustedUserIds.includes(actorId) || !destructive.has(action)) return { detected: false, reasons: [] as string[] };
    const window = settings.destructiveWindowSeconds * 1000;
    if (!this.audits.has(actorId) && this.audits.size >= 5000) {
      const oldestActorId = this.audits.keys().next().value as string | undefined;
      if (oldestActorId) this.audits.delete(oldestActorId);
    }
    const entries = (this.audits.get(actorId) || []).filter(time => now - time < window); entries.push(now); this.audits.set(actorId, entries);
    return { detected: entries.length >= settings.destructiveLimit, reasons: entries.length >= settings.destructiveLimit ? [`${entries.length} ações destrutivas em ${settings.destructiveWindowSeconds}s`] : [] };
  }
}
export interface AntiRaidResponder {
  quarantine(userId: string, roleId: string): Promise<void>;
  kick(userId: string): Promise<void>;
  ban(userId: string): Promise<void>;
  log(channelId: string, message: string): Promise<void>;
}
export async function respondToRaid(db: PrismaClient, settings: AntiRaidSettings, targetId: string, kind: string, reasons: string[], responder: AntiRaidResponder) {
  const detail = reasons.join('; ').slice(0, 500);
  let status = 'APPLIED';
  try {
    if (settings.action === 'QUARANTINE') await responder.quarantine(targetId, settings.quarantineRoleId);
    else if (settings.action === 'KICK') await responder.kick(targetId);
    else await responder.ban(targetId);
  } catch { status = 'FAILED'; }
  await db.securityIncident.create({ data: { guildId: STORE_GUILD_ID, kind, targetId, action: settings.action, status, details: detail } });
  if (settings.logChannelId) await responder.log(settings.logChannelId, `Anti-raid: ${kind} · ${settings.action} · ${status} · ${detail}`).catch(() => {});
  return status;
}
