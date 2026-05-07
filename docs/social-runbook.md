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
