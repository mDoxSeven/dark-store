import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeServer } from './server.js';
import { prisma } from './lib/db.js';
import { startDiscord } from './discord/bot.js';

export async function startApplication() {
  const token = process.env.DARK_DISCORD_TOKEN?.trim();
  if (!token && process.env.DARK_REQUIRE_DISCORD === 'true') throw new Error('DARK_DISCORD_TOKEN ausente.');
  const client = token ? await startDiscord(token) : null;
  const port = Number(process.env.PORT || 3010);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT inválida.');
  const server = makeServer();
  try {
    await new Promise<void>((resolveReady, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolveReady());
    });
  } catch (error) { client?.destroy(); throw error; }
  console.log(`dark store · ${client ? 'Discord conectado' : 'modo local'} · http://127.0.0.1:${port}`);
  const stop = () => server.close(() => { client?.destroy(); void prisma.$disconnect(); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return { server, client };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startApplication().catch(error => { console.error(error instanceof Error ? error.message : 'Falha ao iniciar.'); process.exitCode = 1; });
}
