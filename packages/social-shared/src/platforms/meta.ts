export interface MetaEnv { RR_SOCIAL_TOKENS: KVNamespace }

export interface CreateInstagramPostInput {
  igUserId: string;
  caption: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'REELS';
}

export async function createInstagramPost(_env: MetaEnv, _input: CreateInstagramPostInput) {
  throw new Error('Not implemented; see future Meta adapter ticket');
}
