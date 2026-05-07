export interface YouTubeEnv { RR_SOCIAL_TOKENS: KVNamespace }

export interface UploadShortInput {
  channelId: string;
  title: string;
  description: string;
  videoUrl: string;
}

export async function uploadShort(_env: YouTubeEnv, _input: UploadShortInput) {
  throw new Error('Not implemented; see future YouTube adapter ticket');
}
