/**
 * GET /oauth/pinterest/callback
 *
 * Thin wrapper around `callback` from `@rr/social-shared`. Exchanges the
 * authorization code for a token bundle, persists it to RR_SOCIAL_TOKENS.
 */

import { callback, type OauthEnv } from '@rr/social-shared/platforms/pinterest-auth';

export const onRequestGet: PagesFunction<OauthEnv> = async ({ env, request }) => {
  return callback(request, env);
};
