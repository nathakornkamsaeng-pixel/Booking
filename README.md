# Booking Calendar

React, Vite, and Supabase booking calendar. Cloudflare Workers serves the built
single-page app; authentication, database access, and the `setup-admin` function
remain on Supabase.

## Configure Supabase

Copy `.env.example` to `.env.local` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are build-time, browser-visible settings. Do not put a Supabase service-role
key in a `VITE_` variable or in this frontend. Keep the service-role key only in
the Supabase Edge Function's server-side secrets.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

Run `npm run lint` and `npm run typecheck` before deploying. To preview the
Cloudflare Worker locally, run:

```sh
npm run preview:worker
```

## Deploy to Cloudflare Workers

1. Install Node.js and npm, then authenticate with Wrangler using
   `npx wrangler@4.152.0 login`.
2. Make sure the Supabase variables above are available to the build. For a
   local deploy, put them in `.env.local`; for CI, configure them as build
   environment variables in the CI provider.
3. Run `npm run deploy`.

The Wrangler config publishes `dist/` as Worker static assets and falls back to
`index.html` for client-side routes. The Worker does not replace the Supabase
database or Supabase Edge Functions.
