/**
 * GET /oauth/pinterest/start
 *
 * Thin wrapper around `startOauth` from `@rr/social-shared`. Generates the
 * PKCE state, stashes the verifier in RR_SOCIAL_OAUTH_STATE, redirects to
 * the Pinterest authorize endpoint. CF Access fronts the route.
 */

import { startOauth, type OauthEnv } from '@rr/social-shared/platforms/pinterest-auth';

export const onRequestGet: PagesFunction<OauthEnv> = async ({ env }) => {
  return startOauth(env);
};
