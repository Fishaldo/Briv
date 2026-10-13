# Briv

Everyday spending in pounds: see where your pay went, with as little typing as possible, and find real UK deals before the next spend.

Briv is the working name and may change. It rebuilds the first app, Pence (Fishaldo/Pence), on a foundation that can grow. The plan, decisions and screens live in the plan doc.

## What is here

| Folder | What it is |
|---|---|
| `apps/app` | The phone app (iPhone and Android) and the website, one codebase. Expo with Expo Router. |
| `apps/api` | The server. Hono, sign-in with Better Auth, the database through Drizzle. |
| `packages/core` | Briv's own logic: categories, pay periods, reading alerts and statements, shop matching, offers rules. No network, no database. Carried over from the first app with its tests. |
| `packages/db` | The database tables and their migrations. |

## Rules the code keeps

- Money is whole pence with a currency. Britain first.
- Name and email live only in the sign-in tables. Everything about money points at a random person number.
- Never stored: bank logins, account numbers, photos, emails, voice, exact location, the names of people paid.
- An offer shows a price, code or end date only when a public page states it.
- Savings, investments and transfers are kept, but never counted as spending.

## Working on it

Needs Node 22.18 or later and pnpm 10.

```sh
pnpm install
pnpm dev:api        # server on http://localhost:8787, with a local database in apps/api/.pglite
pnpm dev:app        # the app; press w for the website
pnpm check          # typecheck, tests and build, as GitHub runs them
```

Without `RESEND_API_KEY`, sign-in codes are printed by the server instead of emailed.

### Changing the database

1. Edit `packages/db/src/schema.ts`.
2. `pnpm db:generate` writes a new migration in `packages/db/migrations`. Commit it.
3. Staging and live apply it with `pnpm db:migrate` (needs `DATABASE_URL`).

### Settings for the server

Set these in the hosting dashboard, never in the code. Only `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SEAL_KEY` and `RESEND_API_KEY` are needed to start.

| Name | What it is |
|---|---|
| `DATABASE_URL` | Postgres in a UK or EU region (Neon). |
| `BETTER_AUTH_URL` | The server's own address. |
| `BETTER_AUTH_SECRET` | 32+ random characters. |
| `SEAL_KEY` | 32 random bytes, base64. Seals statement text. |
| `APP_ORIGINS` | The website addresses allowed to call the server. |
| `PASSKEY_RP_ID` | The domain passkeys belong to. |
| `RESEND_API_KEY`, `MAIL_FROM` | For emailing sign-in codes. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google, when set. |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | Sign in with Apple, when set. |

For the app: `EXPO_PUBLIC_API_URL` (the server's address) and `EXPO_PUBLIC_SIGN_IN_PROVIDERS` (`apple,google` once those are set up).

### Changing the name

Briv is a working name. It lives in one place in the code, `packages/core/src/brand.ts`, plus the app's own details in `apps/app/app.json` (name, slug, scheme, web names and the location wording). The package names (`@briv/...`) are internal and can stay. The store IDs, when they are set, use a neutral name, because the App Store and Google Play cannot change them after launch.
