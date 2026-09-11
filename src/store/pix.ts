import QRCode from 'qrcode';

export type PixSettings = {
  enabled: boolean;
  key: string;
  merchantName: string;
  merchantCity: string;
};

const ascii = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const bytes = (value: string) => Buffer.byteLength(value, 'utf8');
const tlv = (id: string, value: string) => {
  const length = bytes(value);
  if (length > 99) throw new Error(`Campo Pix ${id} excede 99 bytes.`);
  return `${id}${String(length).padStart(2, '0')}${value}`;
};

export function validatePixSettings(input: PixSettings): PixSettings {
  if (!input || typeof input.enabled !== 'boolean') throw new Error('Configuração Pix inválida.');
  const key = typeof input.key === 'string' ? input.key.trim() : '';
  const merchantName = ascii(typeof input.merchantName === 'string' ? input.merchantName : '');
  const merchantCity = ascii(typeof input.merchantCity === 'string' ? input.merchantCity : '');
  if (key && (bytes(key) > 77 || /[\x00-\x20\x7f]/.test(key))) throw new Error('Chave Pix inválida ou muito longa.');
  if (merchantName.length > 25) throw new Error('Nome Pix: no máximo 25 caracteres sem acentos.');
  if (merchantCity.length > 15) throw new Error('Cidade Pix: no máximo 15 caracteres sem acentos.');
  if (input.enabled && (!key || !merchantName || !merchantCity)) throw new Error('Para ativar o Pix, informe chave, nome do recebedor e cidade.');
  return { enabled: input.enabled, key, merchantName, merchantCity };
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixPayload(input: { key: string; merchantName: string; merchantCity: string; amountCents: number; txid: string }) {
  const settings = validatePixSettings({ enabled: true, key: input.key, merchantName: input.merchantName, merchantCity: input.merchantCity });
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 100_000_000) throw new Error('Valor Pix inválido.');
  const txid = input.txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', settings.key);
  const additional = tlv('05', txid);
  const partial = tlv('00', '01') + tlv('01', '12') + tlv('26', merchantAccount) + tlv('52', '0000') + tlv('53', '986')
    + tlv('54', (input.amountCents / 100).toFixed(2)) + tlv('58', 'BR') + tlv('59', settings.merchantName)
    + tlv('60', settings.merchantCity) + tlv('62', additional) + '6304';
  return partial + crc16(partial);
}

export function pixQrPng(payload: string) {
  return QRCode.toBuffer(payload, {
    type: 'png', errorCorrectionLevel: 'M', width: 640, margin: 3,
    color: { dark: '#050505', light: '#FFFFFF' }
  });
}
