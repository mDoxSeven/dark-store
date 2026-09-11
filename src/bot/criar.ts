import { SlashCommandBuilder, PermissionFlagsBits, type Guild } from 'discord.js';
import { STORE_LAYOUT, assertStoreOwner } from '../store/config.js';
import { setupStore } from '../store/setup.js';
export const criarCommand = new SlashCommandBuilder().setName('criar')
  .setDescription('Prepara categorias e canais da dark store sem apagar canais existentes.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false)
  .addBooleanOption(o => o.setName('confirmar').setDescription('Confirmar montagem da estrutura'));
export async function executeCriar(guild: Guild, ownerId: string, confirmed: boolean) {
  assertStoreOwner(guild.id, ownerId);
  if (!confirmed) return { preview: true, layout: STORE_LAYOUT, created: [] as string[] };
  return { preview: false, layout: STORE_LAYOUT, created: await setupStore(guild, ownerId) };
}
// No Client.login(), command registration, token handling, or remote launcher.
