# Briv

Everyday spending in pounds: see where your pay went, with as little typing as possible, and find real UK deals before the next spend.

Briv is the working name and may change. It is the app being built for launch, and it sets the standard. Pence (Fishaldo/Pence) is the first version, kept as a test bed: it copies Briv's logic rather than having its own. The plan, decisions and screens live in the plan doc.

## What is here

| Folder | What it is |
|---|---|
| `apps/app` | The phone app (iPhone and Android) and the website, one codebase. Expo with Expo Router. |
| `apps/api` | The server. Hono, sign-in with Better Auth, the database through Drizzle. |
| `packages/core` | Briv's own logic: categories, UK dates and paydays, pay periods, reading alerts and statements, shops and money sent to people, the budget, offers rules. No network, no database, every rule tested. Pence copies this folder as it is. |
| `packages/contract` | What the app and the server say to each other: request checks and answer types, written once and used by both. |
| `packages/db` | The database tables and their migrations. |

Inside the server:

| Folder | What it is |
|---|---|
| `apps/api/src/routes` | The web routes. They never touch tables: a lint rule stops them. |
| `apps/api/src/data` | All reads and writes of private data. `forPerson(db, keys, personId)` only ever sees that one person's rows. |
| `apps/api/src/jobs` | Jobs the host runs on a schedule, such as retention. |

## Rules the code keeps

- Money is whole pence with a currency. Britain first.
- Name and email live only in the sign-in tables. Everything about money points at a random person number.
- Never stored: bank logins, account numbers, photos, emails, voice, exact location, the names of people paid. A payment to a person is kept as money sent, with no name and no statement text. A location becomes a town, then the point is dropped.
- Statement text and notes are sealed (AES-256-GCM) with a key the database never sees.
- An offer shows a price, code or end date only when a public page states it.
- Savings, investments and transfers are kept, but never counted as spending.
- Logs and error reports carry the route, the status, timings and a request id. Never what someone typed, a name, an email or an amount.

## Working on it

Needs Node 22.18 or later and pnpm 10.

```sh
pnpm install
pnpm dev:api        # server on http://localhost:8787, with a local database in apps/api/.pglite
pnpm dev:app        # the app; press w for the website
pnpm check          # lint, typecheck, tests and build, as GitHub runs them
```

`pnpm dev:api` runs with `NODE_ENV=development`. Without `RESEND_API_KEY`, sign-in codes are printed by the server instead of emailed.

GitHub also runs the server's tests against a real Postgres, checks that every schema change has a migration, and fails on known high-risk security problems in anything live runs (`pnpm audit --prod`). Two findings in Expo's build tools are listed as accepted in `pnpm-workspace.yaml`, with the reason; they never run on the server or in the app.

### Changing the database

1. Edit `packages/db/src/schema.ts`.
2. `pnpm db:generate` writes a new migration in `packages/db/migrations`. Commit it.
3. Staging and live apply it with `pnpm db:migrate` (needs `DATABASE_URL`), as a release step before the new server starts.

### Changing the logic

Pure logic goes in `packages/core`, with a test next to it. Pence picks it up with its `scripts/sync-core.mjs`, pinned to a Briv commit, and its checks fail if its copy drifts.

## Running live

The server fails closed: unless `NODE_ENV` is `development` or `test`, it runs as live and will not start without the settings live needs. A host that forgets `NODE_ENV` gets live safety, not laptop defaults.

### Settings for the server

Set these in the hosting dashboard, never in the code.

| Name | Live needs it | What it is |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres in a UK or EU region (Neon). |
| `BETTER_AUTH_URL` | Yes | The server's own address. |
| `BETTER_AUTH_SECRET` | Yes | 32+ random characters. Also keys the hashed limit counters. |
| `SEAL_KEYS` | Yes | Keys that seal statement text and notes: `id:base64` pairs, current first, such as `k2:…,k1:…`. Each is 32 random bytes (`openssl rand -base64 32`). To rotate, put a new key first and keep the old ones listed. `SEAL_KEY` (one key) still works and is read as `k1`. |
| `APP_ORIGINS` | Yes | The website addresses allowed to call the server, comma separated. |
| `CLIENT_IP_HEADER` | Yes | The header the host puts the visitor's own address in, such as `cf-connecting-ip` or `fly-client-ip`. Sign-in limits count by it, so it must be one a visitor cannot set. |
| `RESEND_API_KEY`, `MAIL_FROM` | Yes | For emailing sign-in and delete codes. |
| `SENTRY_DSN` | Recommended | Error monitoring: server errors, job failures and app crashes. Only the kind of error and where it happened are sent. |
| `SENTRY_ENVIRONMENT`, `RELEASE` | No | `staging` or `live`, and the git commit, to label error reports. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | Sign in with Google, when set. |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | No | Sign in with Apple, when set. |

For the app: `EXPO_PUBLIC_API_URL` (the server's address) and `EXPO_PUBLIC_SIGN_IN_PROVIDERS` (`apple,google` once those are set up).

### What the host runs

| When | Command |
|---|---|
| Each release, before the new server starts | `pnpm db:migrate` |
| Always on | `node dist/server.js` (from `apps/api`, after `pnpm build`) |
| Once a day | `node dist/jobs.js retention`: payments older than two years become monthly totals; spent codes and old counters are cleared. |
| Health check | `GET /health` |

### Once, when the database is set up

Stop any one query from running away with the database, for the role the server uses:

```sql
alter role briv_app set statement_timeout = '15s';
alter role briv_app set idle_in_transaction_session_timeout = '30s';
```

### Limits and safety in the server

- Sign-in: 3 code requests a minute from one address, 5 an hour for one email; 5 tries a minute to enter a code; 3 wrong tries end a code. Codes are stored hashed and last 5 minutes. Counted in the database, so every server shares them.
- Deleting an account needs a fresh code from the person's email.
- Changes must come as JSON from a listed origin or the phone app. Nothing sent can be bigger than 64 KB.
- Every request gets an id, sent back as `X-Request-Id` and shown to the person with any error, so support can find it in the log.

### Changing the name

Briv is a working name. It lives in one place in the code, `packages/core/src/brand.ts`, plus the app's own details in `apps/app/app.json` (name, slug, scheme, web names and the location wording). The package names (`@briv/...`) are internal and can stay. The store IDs, when they are set, use a neutral name, because the App Store and Google Play cannot change them after launch.

## Not done yet

- Agreeing to the Terms and Privacy notice, by version, at sign-up (needs the final legal text).
- Editing a saved spend in the app, and saving spends while offline.
- Choosing a payday rule (last working day, last Friday) in the app; the server already understands them.
- An outside security review before launch.
