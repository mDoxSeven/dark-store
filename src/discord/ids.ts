import { AuditLogEvent } from 'discord.js';

const auditNames = new Map<AuditLogEvent, string>([
  [AuditLogEvent.ChannelCreate, 'CHANNEL_CREATE'], [AuditLogEvent.ChannelDelete, 'CHANNEL_DELETE'],
  [AuditLogEvent.RoleCreate, 'ROLE_CREATE'], [AuditLogEvent.RoleDelete, 'ROLE_DELETE'],
  [AuditLogEvent.MemberBanAdd, 'MEMBER_BAN_ADD'], [AuditLogEvent.WebhookCreate, 'WEBHOOK_CREATE'],
  [AuditLogEvent.WebhookDelete, 'WEBHOOK_DELETE']
]);
export const auditActionName = (action: AuditLogEvent) => auditNames.get(action) || null;
export function parseRoleButton(customId: string) {
  const match = customId.match(/^v2role:(add|remove|toggle):(\d{17,20})$/);
  return match ? { mode: match[1] as 'add' | 'remove' | 'toggle', roleId: match[2] } : null;
}
