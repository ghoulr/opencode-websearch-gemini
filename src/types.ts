import type { Auth as ProviderAuth } from '@opencode-ai/sdk';

export type GetAuth = () => Promise<ProviderAuth | undefined>;

export interface WebsearchClient {
  search(query: string, abortSignal: AbortSignal, getAuth: GetAuth): Promise<string>;
}
