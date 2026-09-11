import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA = resolve(process.env.DARK_STORE_DATA_DIR || resolve(ROOT, 'data'));
export const DATABASE_URL = `file:${resolve(DATA, 'store.db').replaceAll('\\', '/')}`;
