// Encoding/size normalization for Discord; does not redraw the generated artwork.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const input = process.argv[2];
if (!input) throw new Error('Informe o caminho da imagem Miku gerada.');
await sharp(input).resize(128,128,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile(fileURLToPath(new URL('../public/events/emoji-miku.png',import.meta.url)));
