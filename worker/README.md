# Dementa OS cloud (Cloudflare Worker + R2)

Storage for the Files app.

- **R2** (`dementa-os` bucket): the files, stored under `files/`.
- **Worker** (`dementa-api`): the only thing that touches R2. Dementa OS never holds Cloudflare keys.

- **D1** (`dementa-accounts` database): accounts and sign-ins, through Better Auth (`src/auth.ts`).

**Sign-in:** people must be signed in to use the Files API, and each account only sees its own
files, kept under `users/<account id>/files/` in R2. Dementa OS shows a sign-in screen after
starting up. Files from before sign-in existed (under `files/` in R2) are not shown to anyone; they
are still in the bucket.

Free tier: R2 10 GB storage + free downloads, Workers 100,000 requests a day. Cloudflare asks for a
payment method before turning on R2, even on the free tier.

## Run on this computer

```
npm run cloud:dev            # uses the real R2 bucket if the R2_* keys are set in .env.local,
                             # otherwise a local folder (.dementa-dev/r2-local).
                             # Accounts go in .dementa-dev/accounts.sqlite, made automatically.
DEMENTA_CLOUD_STORAGE=local npm run cloud:dev   # local files even with R2 keys set (for testing)
npm run build && npm start   # the web version forwards /api to the cloud server
```

## Put it on Cloudflare

Either `npx wrangler login`, or set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in
`.env.local` (the token needs Workers and R2 edit permissions). Check with `npm run cloud:check-keys`.

The first time, make the accounts database and set the sign-in secret:

```
npx wrangler d1 create dementa-accounts      # paste the id it prints into worker/wrangler.jsonc
npx wrangler d1 migrations apply dementa-accounts --remote -c worker/wrangler.jsonc
npx wrangler secret put BETTER_AUTH_SECRET -c worker/wrangler.jsonc   # any long random text
npx wrangler secret put BETTER_AUTH_URL -c worker/wrangler.jsonc      # the Worker's address
npx wrangler secret put APP_ORIGINS -c worker/wrangler.jsonc          # where Dementa OS runs, comma-separated
```

Then:

```
npm run cloud:deploy         # prints https://dementa-api.<you>.workers.dev
```

Then either keep `NEXT_PUBLIC_DEMENTA_API` empty and set `DEMENTA_CLOUD_URL` to that address (the
web server forwards to it), or set `NEXT_PUBLIC_DEMENTA_API` to it directly. Rebuild after changing.

Files can be up to 50 MB each.
