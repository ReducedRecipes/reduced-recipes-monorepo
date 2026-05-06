export interface PinterestEnv { RR_SOCIAL_TOKENS: KVNamespace }

export interface CreatePinInput {
  boardId: string;
  description: string;
  link: string;
  imageUrl: string;
}

export async function createPin(_env: PinterestEnv, _input: CreatePinInput) {
  throw new Error('Not implemented; see ticket 009');
}
