export const VERIFICATION_BANNER_URL = 'https://raw.githubusercontent.com/mDoxSeven/dark-store/main/public/verificacao-banner-dark.png';
export const VERIFICATION_BUTTON_ID = 'store:verify';

export function verificationMessage() {
  return {
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: 0xaeb1b6, components: [
      { type: 12, items: [{ media: { url: VERIFICATION_BANNER_URL }, description: 'Verificação da dark store' }] },
      { type: 10, content: '## Verificação\nPara acessar a loja, os catálogos e a comunidade, confirme sua entrada pelo botão abaixo.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 2, custom_id: VERIFICATION_BUTTON_ID, label: 'Verificar' }] },
      { type: 10, content: '-# A verificação libera automaticamente os canais disponíveis para membros.' },
    ] }],
  };
}
