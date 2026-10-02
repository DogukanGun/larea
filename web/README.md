# Larea website

Marketing site plus the legal pages the stores need: `/` (landing), `/privacy`, `/terms`, `/support`, `/imprint`.
Next.js 16 (App Router), every page prerendered as static HTML. No cookies, no analytics; fonts are
self-hosted through `next/font`.

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # static production build
```

## Deploy on Vercel

1. Import the repository in Vercel and set **Root Directory** to `web` (framework: Next.js, defaults are fine).
2. Optional: set `NEXT_PUBLIC_SITE_URL` to your custom domain (used for canonical URLs, the sitemap and social previews);
   without it the Vercel production URL is used.
3. Add the custom domain in the Vercel project settings.

## What to edit

- `lib/site.ts`: store links (App Store, Google Play, dApp Store; `null` shows "Coming soon"), contact email, the legal
  entity for the imprint and privacy policy, and the "last updated" date.
- `app/privacy`, `app/terms`, `app/support`, `app/imprint`: the texts. Keep them in line with what the apps and the
  backend actually do (retention periods, providers).
