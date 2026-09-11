import { money } from './product.js';

export const NITRO_BANNER_URL = 'https://raw.githubusercontent.com/mDoxSeven/dark-store/main/public/nitro-link-banner-dark.png';
export const NITRO_SELECT_ID = 'store:nitro:select';

type CatalogProduct = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
};

const short = (value: string, limit: number) => value.replace(/\s+/g, ' ').trim().slice(0, limit);

export function nitroCatalogMessage(products: CatalogProduct[]) {
  const available = products.filter(product => product.stock > 0).slice(0, 25);
  const options = available.length ? available.map(product => ({
    label: short(product.title, 100),
    value: product.id,
    description: short(`${money(product.priceCents)} · ${product.stock} disponível${product.stock === 1 ? '' : 'is'}`, 100),
  })) : [{ label: 'Nenhum item disponível', value: 'unavailable', description: 'Cadastre estoque pelo painel.' }];
  return {
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: 0xaeb1b6, components: [
      { type: 12, items: [{ media: { url: NITRO_BANNER_URL }, description: 'Catálogo Nitro Link da dark store' }] },
      { type: 10, content: '## Nitro Link\nEscolha abaixo um link ou benefício digital autorizado. Um atendimento privado será aberto para você revisar o item e o valor antes de confirmar.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 3, custom_id: NITRO_SELECT_ID, placeholder: available.length ? 'Selecione uma opção' : 'Sem itens disponíveis', min_values: 1, max_values: 1, disabled: !available.length, options }] },
      { type: 10, content: '-# Pagamento Pix com confirmação manual · entrega privada após aprovação.' },
    ] }],
  };
}
