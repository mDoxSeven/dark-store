import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createAdmin } from '../src/lib/auth.js';
import { prisma } from '../src/lib/db.js';
const password = randomBytes(18).toString('base64url');
try {
  await createAdmin(password);
  console.log('Administrador local criado. Guarde esta senha em seu gerenciador:');
  console.log(password);
  console.log('Ela não será exibida novamente. Login sem Discord em http://127.0.0.1:3010');
} catch (error) {
  console.error((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'Administrador já existe; nenhuma senha foi alterada.' : 'Não foi possível criar o administrador.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
