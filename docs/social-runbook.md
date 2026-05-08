# Social automation runbook

Operational notes for the social automation system (Phase 1). Things here are
either remote ops (R2 buckets, DNS) or actions a script cannot perform (custom
domain bindings done in the Cloudflare dashboard).

For architecture and ticket-by-ticket spec, see `spec/social.md`.

## Ticket 015 — R2 custom domain `assets.reduced.recipes`

### What it does

Binds `assets.reduced.recipes` to the public R2 bucket `rr-social-assets` so
Pinterest gets a stable, cleanly named origin for pin imagery and finished
video assets. URLs read as `https://assets.reduced.recipes/<key>` rather than
the default R2 dev domain.

### Buckets

Three buckets are used by the social pipeline:

| Bucket | Visibility | Contents |
|--------|------------|----------|
| `rr-social-assets` | Public via custom domain | Rendered pin PNGs, finished video MP4s |
| `rr-social-cache` | Private | Intermediate cache (Llama outputs, generated frames) |
| `rr-social-templates` | Private | Image/video templates, font assets |

Only `rr-social-assets` gets the public custom domain. The other two stay
private and are accessed via Worker R2 bindings.

### Bucket creation

Run from the repo root with the operator authenticated to Cloudflare via
`wrangler login` (OAuth — no API token required):

```sh
pnpm exec wrangler r2 bucket create rr-social-assets
pnpm exec wrangler r2 bucket create rr-social-cache
pnpm exec wrangler r2 bucket create rr-social-templates
```

If a bucket already exists, the create command returns an error you can
ignore. Verify with:

```sh
pnpm exec wrangler r2 bucket list
```

You should see all three `rr-social-*` buckets in the output.

### Custom-domain binding (dashboard step)

Wrangler does not yet expose R2 custom-domain bindings, so this step is done
once in the Cloudflare dashboard:

1. Cloudflare dashboard -> R2 -> `rr-social-assets` -> Settings -> Custom Domains
2. Click "Connect Domain"
3. Enter `assets.reduced.recipes`
4. Confirm. The dashboard creates the proxied DNS record automatically and
   provisions a Universal SSL certificate.
5. Wait a minute or two for DNS propagation and cert issuance.

`rr-social-cache` and `rr-social-templates` should NOT have a custom domain
attached. They are private buckets accessed via Worker R2 bindings only.

### Verification

After binding, verify DNS and HTTP:

```sh
# DNS resolves and is proxied through Cloudflare.
dig assets.reduced.recipes

# Upload a test object.
echo "test" | pnpm exec wrangler r2 object put rr-social-assets/test.txt --pipe

# Fetch it. Expect 200 with content-type, content-length, cache-control headers.
curl -I https://assets.reduced.recipes/test.txt

# Clean up.
pnpm exec wrangler r2 object delete rr-social-assets/test.txt
```

### Cache headers

Workers that upload to `rr-social-assets` should set:

```
Cache-Control: public, max-age=31536000, immutable
```

Asset keys are content-addressed (hash in path), so immutable is safe and
gives Cloudflare's CDN max headroom in front of R2.

### Notes

- Universal SSL handles cert provisioning automatically once the custom
  domain is connected.
- `wrangler.toml` entries for the R2 bindings live with the workers that
  consume them (image-gen, adapter, publisher) — added in their own tickets,
  not here.
- Custom-domain binding is dashboard-only today. If Cloudflare exposes it via
  Wrangler in the future, fold the step into a deploy script.

## Ticket 016 — DNS + Worker route for `r.reduced.recipes`

### What it does

Stands up `r.reduced.recipes` as the dedicated subdomain for the
`social-shortlink` Worker (ticket 010). It serves three URL patterns:

| Path | Purpose | Access |
|------|---------|--------|
| `/:draftId` | Outbound CTA from Pinterest pins, email digests, etc. Redirects to canonical recipe URL with UTM. | Public |
| `/approve/:draftId` | One-click approve from the editorial digest email. | CF Access (owner only) |
| `/reject/:draftId` | One-click reject from the editorial digest email. | CF Access (owner only) |

The Worker route binding lives in `packages/workers/wrangler.social-shortlink.toml`:

```toml
routes = [
  { pattern = "r.reduced.recipes/*", zone_name = "reduced.recipes" }
]
```

### DNS record (dashboard step)

Wrangler does not manage zone DNS records, so this is done once in the
Cloudflare dashboard:

1. Cloudflare dashboard -> `reduced.recipes` -> DNS -> Records
2. Add record:
   - Type: `AAAA`
   - Name: `r`
   - IPv6: `100::` (the reserved discard prefix; the Worker route intercepts before this is ever resolved)
   - Proxy status: Proxied (orange cloud) — required so the Worker route binding actually fires
3. Save. DNS is live within seconds inside Cloudflare's network.

A `CNAME r -> reduced.recipes` (proxied) works equivalently. `AAAA 100::` is
the convention used elsewhere in the zone for proxy-only records that have
no real origin.

Verify with `dig`:

```sh
dig r.reduced.recipes
# Expect an answer (A or AAAA) once the dashboard step is complete.
# Until then: NXDOMAIN.
```

### CF Access setup (dashboard step)

The `/approve/*` and `/reject/*` paths must be locked down so only the owner
can act on a digest email. The bare `/:draftId` redirect stays public.

1. Cloudflare Zero Trust -> Access -> Applications -> Add an application
2. Select **Self-hosted**
3. Application configuration:
   - Application name: `rr-social-shortlink approve`
   - Session duration: 24 hours (or shorter if preferred)
   - Application domain: `r.reduced.recipes`
   - Path: `approve/*`
4. Identity providers: One-time PIN (or Google, if preferred)
5. Add a policy:
   - Policy name: `Owner only`
   - Action: Allow
   - Configure rules: Include -> Emails -> owner email (see GitHub secrets / 1Password for the canonical owner address)
6. Save.
7. Repeat steps 1-6 for the reject path:
   - Application name: `rr-social-shortlink reject`
   - Path: `reject/*`
   - Same Allow policy.

Do **not** create an Access app on the bare `r.reduced.recipes` host or on
`/*` — the public outbound CTA path must stay open.

### Verification

After ticket 010's Worker is deployed AND the DNS record is in place:

```sh
# 1. DNS resolves through Cloudflare.
dig r.reduced.recipes

# 2. Public bare-path: hits the Worker, which 404s for an unknown draftId.
#    Crucial: the response must come from the Worker, not the Cloudflare
#    placeholder page that appears when the route binding hasn't activated.
curl -I https://r.reduced.recipes/nonexistent-draft-id
# Expect: HTTP/2 404
#         server: cloudflare
#         cf-ray: <id>
# Look for any `x-` header set by the Worker (e.g. cache-control from the
# Worker handler) to confirm Worker execution. A generic Cloudflare 1xxx
# error page or the orange-cloud placeholder means the route binding has
# not bound — fix wrangler config or zone before continuing.

# 3. Protected path: should bounce to the CF Access login page, not the
#    Worker's handler.
curl -IL https://r.reduced.recipes/approve/test
# Expect: 302 -> https://<team>.cloudflareaccess.com/cdn-cgi/access/login/...

# 4. Optional: tail the Worker while curling to confirm execution.
pnpm exec wrangler tail rr-social-shortlink &
curl -I https://r.reduced.recipes/
```

### Per-environment shortlink domains (future)

Production uses `r.reduced.recipes`. When preview environments are added,
mirror this setup with a separate subdomain — e.g. `r.preview.reduced.recipes`
— and wire it via a `[env.preview]` block in
`packages/workers/wrangler.social-shortlink.toml`:

```toml
[env.preview]
routes = [
  { pattern = "r.preview.reduced.recipes/*", zone_name = "reduced.recipes" }
]
```

Repeat the DNS + CF Access dashboard steps for the preview hostname (the
owner email policy on `/approve/*` and `/reject/*` should match prod).

### Notes

- One-time ops setup; no application code changes after the Worker (ticket 010) is deployed.
- The wrangler config is already in place. Validation via `pnpm exec wrangler deploy --config packages/workers/wrangler.social-shortlink.toml --dry-run` only fails on the placeholder D1 `database_id` (intentional until deploy time); the route binding parses cleanly.
- If `curl -I` returns a Cloudflare branded HTML page (1016, 522, etc.) instead of a Worker response, the DNS record is likely not proxied. Re-check the orange cloud in the DNS dashboard.
