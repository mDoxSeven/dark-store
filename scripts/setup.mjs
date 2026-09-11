import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const data = resolve(process.env.DARK_STORE_DATA_DIR || resolve(root, 'data'));
await mkdir(data, { recursive: true });
const env = { ...process.env, DATABASE_URL: `file:${resolve(data, 'store.db').replaceAll('\\', '/')}` };
const cli = resolve(root, 'node_modules/prisma/build/index.js');
for (const args of [['generate']]) {
  const result = spawnSync(process.execPath, [cli, ...args, '--schema', resolve(root, 'prisma/schema.prisma')], { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
// On Windows, initialize the SQLite file before schema-engine sees a path with spaces.
const { PrismaClient } = await import('@prisma/client');
const client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
await client.$queryRawUnsafe('SELECT 1');
await client.$disconnect();
const result = spawnSync(process.execPath, [cli, 'db', 'push', '--skip-generate', '--schema', resolve(root, 'prisma/schema.prisma')], { cwd: root, env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log('Banco local próprio pronto. Nenhum dado do empty foi copiado.');
