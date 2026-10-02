import sharp from 'sharp';
import type { AltaSpotifyTrack } from './listening.js';

const WIDTH = 960, HEIGHT = 324, FRAMES = 12;
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const label = (value: string, max: number) => xml(value.replace(/[\x00-\x1f]/g, ' ').length > max ? value.slice(0, max - 1) + '…' : value);
const clock = (ms: number) => { const seconds = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; };
const uri = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

async function image(url: string | null, size: number): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['i.scdn.co', 'mosaic.scdn.co', 'image-cdn-ak.spotifycdn.com', 'cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname)) return null;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 3_000_000) { await reader.cancel(); return null; } chunks.push(part.value); } } finally { reader.releaseLock(); }
    const source = Buffer.concat(chunks);
    const meta = await sharp(source, { limitInputPixels: 16_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? '')) return null;
    return await sharp(source, { limitInputPixels: 16_000_000 }).resize(size,size).png().toBuffer();
  } catch { return null; }
}

export function listeningCardSvg(track: AltaSpotifyTrack, name: string, now: number, frame: number, cover?: string, avatar?: string, background?: string) {
  const total = track.startedAt !== null && track.endsAt !== null ? Math.max(0,track.endsAt-track.startedAt) : 0;
  const elapsed = total ? Math.min(total,Math.max(0,now-track.startedAt!)) : 0;
  const ratio = total ? elapsed/total : 0;
  const bars = Array.from({length:9},(_,index)=>{
    const height = 18 + 48 * (0.5+0.5*Math.sin(frame*2*Math.PI/FRAMES+index*0.9));
    return `<rect x="${794+index*12}" y="${140-height/2}" width="7" height="${height}" rx="3.5" fill="#1ed760"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#152a23"/><stop offset=".55" stop-color="#15191e"/><stop offset="1" stop-color="#202b30"/></linearGradient><clipPath id="card"><rect x="1" y="1" width="958" height="322" rx="24"/></clipPath><clipPath id="cover"><rect x="20" y="20" width="284" height="284" rx="16"/></clipPath><clipPath id="avatar"><circle cx="354" cy="277" r="19"/></clipPath></defs>
    <g clip-path="url(#card)"><rect width="960" height="324" fill="url(#bg)"/>
    ${background ? `<image href="${background}" width="960" height="324" opacity=".24"/><rect width="960" height="324" fill="#0b1117" opacity=".54"/>` : ''}
    <rect x="20" y="20" width="284" height="284" rx="16" fill="#244d42"/>
    ${cover ? `<image href="${cover}" x="20" y="20" width="284" height="284" clip-path="url(#cover)"/>` : '<text x="108" y="183" fill="#1ed760" font-size="84">♫</text>'}
    <g font-family="DejaVu Sans,Segoe UI,sans-serif">
      <circle cx="346" cy="44" r="12" fill="#1ed760"/><path d="M339 41q7-3 14 1M340 45q6-2 12 1M341 49q5-1 9 1" fill="none" stroke="#11251a" stroke-width="2.3" stroke-linecap="round"/>
      <text x="368" y="49" font-size="11" letter-spacing="3" fill="#1ed760" font-weight="700">SPOTIFY  |  TOCANDO AGORA</text>
      <text x="334" y="104" fill="#fff" font-size="${track.title.length>27?32:40}" font-weight="700">${label(track.title,35)}</text>
      <text x="335" y="139" fill="#d5d8da" font-size="24">${label(track.artists,32)}</text>
      <text x="335" y="168" fill="#879690" font-size="16">${label(track.album,49)}</text>
      ${bars}
      <rect x="335" y="208" width="584" height="4" rx="2" fill="#67746d" opacity=".6"/>
      <rect x="335" y="208" width="${584*ratio}" height="4" rx="2" fill="#1ed760"/>
      <circle cx="${335+584*ratio}" cy="210" r="6" fill="#1ed760"/>
      <text x="335" y="236" fill="#d0d8d2" font-size="13">${clock(elapsed)}</text><text x="919" y="236" text-anchor="end" fill="#a5b1ac" font-size="13">${total?clock(total):'—'}</text>
      <circle cx="354" cy="277" r="19" fill="#33473d"/>${avatar?`<image href="${avatar}" x="335" y="258" width="38" height="38" clip-path="url(#avatar)"/>`:''}
      <text x="386" y="275" fill="#fff" font-size="17" font-weight="700">${label(name,36)}</text>
      <text x="386" y="295" fill="#8b9c94" font-size="12">está ouvindo no Spotify</text>
      <text x="919" y="292" text-anchor="end" fill="#72837c" font-size="10" letter-spacing="2">ALTA · ANGEL</text>
    </g></g><rect x="1" y="1" width="958" height="322" rx="24" fill="none" stroke="#3b7258" stroke-opacity=".6"/>
  </svg>`;
}

let active = 0;
export async function renderListeningCard(track: AltaSpotifyTrack, name: string, avatarUrl: string | null, now = Date.now()) {
  if (active >= 2) throw new Error('Renderização de cards ocupada.');
  active++;
  try {
    const [cover,avatar] = await Promise.all([image(track.coverUrl,284),image(avatarUrl,48)]);
    const background = cover ? await sharp(cover).resize(WIDTH,HEIGHT,{fit:'cover'}).blur(28).png().toBuffer() : null;
    const pages: Buffer[] = [];
    for (let frame=0;frame<FRAMES;frame++) pages.push(await sharp(Buffer.from(listeningCardSvg(track,name,now,frame,cover?uri(cover):undefined,avatar?uri(avatar):undefined,background?uri(background):undefined))).ensureAlpha().raw().toBuffer());
    return await sharp(Buffer.concat(pages),{raw:{width:WIDTH,height:HEIGHT*FRAMES,channels:4,pageHeight:HEIGHT}}).gif({loop:0,delay:Array(FRAMES).fill(90),colours:128,dither:0,effort:3}).toBuffer();
  } finally { active--; }
}
