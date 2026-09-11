import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { DATA } from './paths.js';
import { prisma } from './db.js';

const derive = promisify(scrypt);
const adminPath = resolve(DATA, 'admin.json');
export const COOKIE = 'dark_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function createAdmin(password: string) {
  if (password.length < 16 || password.length > 256) throw new Error('Senha deve ter de 16 a 256 caracteres.');
  await mkdir(DATA, { recursive: true });
  const salt = randomBytes(24).toString('hex');
  const hash = (await derive(password, salt, 64) as Buffer).toString('hex');
  // Never replace an existing administrator silently.
  await writeFile(adminPath, JSON.stringify({ salt, hash }), { flag: 'wx', mode: 0o600 });
}
export async function adminExists() {
  try { await readFile(adminPath); return true; } catch { return false; }
}
export async function verifyPassword(password: unknown) {
  if (typeof password !== 'string' || password.length > 256) return false;
  try {
    const saved = JSON.parse(await readFile(adminPath, 'utf8')) as { salt: string; hash: string };
    const candidate = await derive(password, saved.salt, 64) as Buffer;
    const expected = Buffer.from(saved.hash, 'hex');
    return expected.length === candidate.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}
export async function newSession() {
  const token = randomBytes(32).toString('base64url');
  await prisma.webSession.deleteMany({ where: { expires: { lt: new Date() } } });
  const old = await prisma.webSession.findMany({ orderBy: { createdAt: 'desc' }, skip: 15 });
  if (old.length) await prisma.webSession.deleteMany({ where: { hash: { in: old.map(s => s.hash) } } });
  await prisma.webSession.create({ data: { hash: hashToken(token), expires: new Date(Date.now() + 8 * 3600_000) } });
  return token;
}
export function cookieToken(cookie?: string) {
  return cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
export async function validSession(token: string) {
  if (!/^[\w-]{43}$/.test(token)) return false;
  const session = await prisma.webSession.findUnique({ where: { hash: hashToken(token) } });
  return !!session && session.expires.getTime() > Date.now();
}
export async function deleteSession(token: string) {
  await prisma.webSession.deleteMany({ where: { hash: hashToken(token) } });
}
// Loopback-only app: one bounded shared bucket, independent of spoofed headers.
export class LoginLimiter {
  private window = 0;
  private count = 0;
  consume(now = Date.now()) {
    if (now >= this.window) { this.window = now + 15 * 60_000; this.count = 0; }
    return ++this.count <= 10;
  }
  reset() { this.count = 0; }
}
