type WelcomeMember = {
  id: string;
  displayName: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
};

export function welcomeMessage(member: WelcomeMember) {
  return {
    flags: 32768,
    allowedMentions: { parse: [], users: [member.id] },
    components: [{ type: 17, accent_color: 0xaeb1b6, components: [
      { type: 9, components: [{ type: 10, content: `## Bem-vindo(a), <@${member.id}>\nSua verificação foi concluída e o acesso à **${member.guildName}** está liberado.` }], accessory: { type: 11, media: { url: member.avatarUrl }, description: `Avatar de ${member.displayName}` } },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: 'Confira os catálogos, leia as regras e, se precisar, chame a equipe pelo suporte. Boas compras!' },
      { type: 10, content: `-# Membro nº ${member.memberCount.toLocaleString('pt-BR')} · dark store` },
    ] }],
  };
}
