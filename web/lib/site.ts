/** Everything that changes between launches lives here: links, contact, legal entity. */
export const site = {
  name: "Larea",
  tagline: "Talk to the people right where you are.",
  description:
    "Larea opens a group chat for every real place: the library, the station, the square, the stadium. Join when you're within 200 m, 18+ only, moderated before anyone sees a message.",
  /** Production URL; Vercel provides it at build time, set NEXT_PUBLIC_SITE_URL for a custom domain. */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  email: "dogukangundogan5@gmail.com",
  /** Store links: null shows "Coming soon". */
  links: {
    ios: null as string | null,
    android: null as string | null,
    solanaDappStore: null as string | null,
  },
  /** Responsible for the site and the apps (Impressum / GDPR controller). */
  owner: {
    name: "Dogukan Al Gündogan",
    street: "Thomas-Dehler-Straße 21",
    city: "81737 München",
    country: "Germany",
  },
  legalUpdated: "October 2, 2026",
} as const;
