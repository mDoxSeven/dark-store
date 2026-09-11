const configuredId = (name: string, fallback: string) => {
  const value = process.env[name]?.trim() || fallback;
  if (!/^\d{17,20}$/.test(value)) throw new Error(`${name} inválido.`);
  return value;
};
export const STORE_GUILD_ID = configuredId('DARK_GUILD_ID', '1547613908016038032');
export const APPLICATION_ID = configuredId('DARK_APPLICATION_ID', '1547707174254280794');
export const MODE = process.env.DARK_DISCORD_TOKEN ? 'discord-live' as const : 'local-simulation' as const;
export const STORE_OWNER_ID = configuredId('DARK_OWNER_ID', '1002774556269891694');
export function assertStoreGuild(guildId: string) {
  if (guildId !== STORE_GUILD_ID) throw new Error("A loja nao esta habilitada neste servidor.");
}
export function assertStoreOwner(guildId: string, userId: string) {
  assertStoreGuild(guildId);
  if (userId !== STORE_OWNER_ID) throw new Error("Somente o responsavel pela loja pode executar esta acao.");
}

export const STORE_LAYOUT = [
  { key: "info", name: "INFORMAÇÕES • LOJA", channels: [
    { key: "welcome", name: "boas-vindas", type: 0, readOnly: true },
    { key: "rules", name: "regras", type: 0, readOnly: true },
    { key: "announcements", name: "avisos", type: 0, readOnly: true },
  ] },
  { key: "sales", name: "COMPRAS • CATÁLOGO", channels: [
    { key: "shop", name: "compre-aqui", type: 0, readOnly: true },
    { key: "accounts", name: "contas", type: 0, readOnly: true },
    { key: "completed", name: "vendas-realizadas", type: 0, readOnly: true },
    { key: "reviews", name: "avaliacoes", type: 0, readOnly: false },
  ] },
  { key: "community", name: "COMUNIDADE • SUPORTE", channels: [
    { key: "chat", name: "conversa", type: 0, readOnly: false },
    { key: "help", name: "suporte", type: 0, readOnly: false },
    { key: "supportVoice", name: "Suporte", type: 2, readOnly: false },
    { key: "memberVoice", name: "Convivência", type: 2, readOnly: false },
  ] },
  { key: "staff", name: "EQUIPE • PRIVADO", private: true, channels: [
    { key: "orders", name: "pedidos", type: 0, readOnly: false },
    { key: "logs", name: "registro-loja", type: 0, readOnly: false },
  ] },
];
