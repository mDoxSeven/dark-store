export type ProductInput = {
  title: string; description: string; category: string; priceCents: number;
  imageUrl: string; footer: string; buttonLabel: string; accentColor: string;
  divider: boolean; active: boolean;
};
export function validateProduct(input: ProductInput): ProductInput {
  if (!input || typeof input.imageUrl !== "string" || input.imageUrl.length > 2000) throw new Error("Imagem invalida.");
  const limits = { title: 100, description: 2400, category: 60, footer: 300, buttonLabel: 40 };
  for (const [field, limit] of Object.entries(limits)) {
    const value = input[field as keyof typeof limits];
    if (typeof value !== "string" || value.length > limit) throw new Error(`Campo ${field} invalido.`);
  }
  if (!input.title.trim() || !input.buttonLabel.trim()) throw new Error("Informe titulo e texto do botao.");
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 1 || input.priceCents > 100_000_000) throw new Error("Preco invalido (use centavos inteiros).");
  if (typeof input.divider !== "boolean" || typeof input.active !== "boolean" || !/^#[0-9a-f]{6}$/i.test(input.accentColor)) throw new Error("Aparencia invalida.");
  if (input.imageUrl) {
    const url = new URL(input.imageUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("A imagem precisa de URL HTTPS publica.");
  }
  return { title: input.title.trim(), description: input.description, category: input.category.trim() || "Geral",
    priceCents: input.priceCents, imageUrl: input.imageUrl, footer: input.footer, buttonLabel: input.buttonLabel.trim(),
    accentColor: input.accentColor, divider: input.divider, active: input.active };
}
export const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function productMessage(product: ProductInput & { id: string }, stock: number) {
  const components: object[] = [];
  if (product.imageUrl) components.push({ type: 12, items: [{ media: { url: product.imageUrl } }] });
  components.push({ type: 10, content: `## ${product.title}\n${product.description}\n\n**${money(product.priceCents)}** · Estoque: **${stock}**` });
  if (product.divider) components.push({ type: 14, divider: true, spacing: 1 });
  components.push({ type: 1, components: [{ type: 2, style: 2, label: product.buttonLabel,
    custom_id: `store:buy:${product.id}`, disabled: !product.active || stock < 1 }] });
  if (product.footer) components.push({ type: 10, content: `-# ${product.footer}` });
  return { flags: 32768, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: parseInt(product.accentColor.slice(1), 16), components }] };
}
