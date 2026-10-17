# Dementa OS cloud (Cloudflare Worker + R2)

Storage for the Files app.

- **R2** (`dementa-os` bucket): the files, stored under `files/`.
- **Worker** (`dementa-api`): the only thing that touches R2. Dementa OS never holds Cloudflare keys.

**No sign-in yet:** everyone using Dementa OS shares one storage space, and anyone who can reach
the Worker can read, add or delete files. Don't store anything private until access control is added.

Free tier: R2 10 GB storage + free downloads, Workers 100,000 requests a day. Cloudflare asks for a
payment method before turning on R2, even on the free tier.

## Run on this computer

```
npm run cloud:dev            # uses the real R2 bucket if the R2_* keys are set in .env.local,
                             # otherwise a local folder (.dementa-dev/r2)
npm run build && npm start   # the web version forwards /api to the cloud server
```

## Put it on Cloudflare

Either `npx wrangler login`, or set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in
`.env.local` (the token needs Workers and R2 edit permissions). Check with `npm run cloud:check-keys`.

```
npm run cloud:deploy         # prints https://dementa-api.<you>.workers.dev
```

Then either keep `NEXT_PUBLIC_DEMENTA_API` empty and set `DEMENTA_CLOUD_URL` to that address (the
web server forwards to it), or set `NEXT_PUBLIC_DEMENTA_API` to it directly. Rebuild after changing.

Files can be up to 50 MB each.
