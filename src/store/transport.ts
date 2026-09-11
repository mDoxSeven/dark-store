// Port for local simulation; no Discord REST client or credentials are used.
export interface StoreTransport {
  checkChannel(channelId: string): Promise<void>;
  publish(channelId: string, messageId: string | null, body: object): Promise<string>;
  deliver(userId: string, orderId: string, payload: string): Promise<string>;
  sale(channelId: string, order: { id: string; productTitle: string; priceCents: number }): Promise<string>;
}
