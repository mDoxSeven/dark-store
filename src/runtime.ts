import type { Guild } from 'discord.js';
import { localChannels, localGuild, localTransport } from './lib/simulation.js';
import type { StoreTransport } from './store/transport.js';

export type RuntimeChannel = { id: string; key?: string; name: string; type: number; private?: boolean };
export type RuntimeRole = { id: string; name: string; position: number; editable: boolean };
export type DiscordRuntime = {
  transport: StoreTransport;
  channels(): Promise<RuntimeChannel[]>;
  roles(): Promise<RuntimeRole[]>;
  guild(): Promise<Guild>;
  connected(): boolean;
};

let discordRuntime: DiscordRuntime | null = null;

export function configureDiscordRuntime(runtime: DiscordRuntime) {
  if (discordRuntime) throw new Error('Runtime do Discord já configurado.');
  discordRuntime = runtime;
}
export const runtimeMode = () => discordRuntime ? 'discord-live' as const : 'local-simulation' as const;
export const runtimeDiscordStatus = () => !discordRuntime ? 'disabled' as const : discordRuntime.connected() ? 'connected' as const : 'disconnected' as const;
export const runtimeTransport = (failLocalDelivery = false) => discordRuntime?.transport || localTransport(failLocalDelivery);
export const runtimeChannels = () => discordRuntime?.channels() || localChannels();
export const runtimeRoles = () => discordRuntime?.roles() || Promise.resolve([]);
export const runtimeGuild = () => discordRuntime?.guild() || localGuild();
