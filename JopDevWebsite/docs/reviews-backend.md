# Reviews backend: setup and mental model

The Reviews feature uses the same Cloudflare Worker that serves the static
website. Requests under `/api/*` run through `worker/index.mjs`; every other
request continues to use the compiled files in `dist/`.

## How the pieces fit together

1. A visitor submits the form to `POST /api/reviews`.
2. The Worker repeats all validation. Browser validation is only a convenience.
3. The Worker applies server-side rate limits and inserts a `pending` D1 row.
4. The private moderator page at `/reviews/admin/` requests pending records with
   a bearer token.
5. Moderators can approve, reject, or permanently delete a review.
6. `GET /api/reviews` selects only approved public fields. Its SQL does not
   select email, idempotency, or rate-limit data.

The moderation token is a Worker secret. It is never committed, embedded in the
website, or saved by the admin page. The page keeps it only in JavaScript memory
until the tab is reloaded or locked.

## One-time Cloudflare setup

Run these commands from the directory containing `wrangler.jsonc`.

### 1. Sign in

```powershell
npx wrangler login
```

### 2. Create the database

```powershell
npx wrangler d1 create jopdev-reviews
```

Wrangler prints a database ID. Replace `REPLACE_WITH_D1_DATABASE_ID` in
`wrangler.jsonc` with that ID.

### 3. Create strong secrets

Generate two different random values. A convenient PowerShell command is:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Save the first as the private moderation password:

```powershell
npx wrangler secret put ADMIN_TOKEN
```

Save the second as the salt used to hash visitor IP addresses:

```powershell
npx wrangler secret put IP_HASH_SALT
```

Do not reuse either value and do not put them in Git.

### 4. Apply the production migration

```powershell
npm run db:migrate:remote
```

The migration creates the `reviews` table and indexes. New reviews always
default to `pending`.

### 5. Deploy

```powershell
npm run deploy
```

Open `/reviews/` to submit a review and `/reviews/admin/` to approve it. Enter
the `ADMIN_TOKEN` value on the admin page.

## Local development

Copy `.dev.vars.example` to `.dev.vars` and replace both example values. This
file is ignored by Git.

Then initialize the local database and start the complete Worker:

```powershell
npm run db:migrate:local
npm run start:full
```

Wrangler prints the local URL. The ordinary `npm start` command still runs only
webpack and therefore does not provide the API.

For the frontend-only sample state, `/reviews/?mockReviews=1` remains available.
Mock submissions live only in memory and are never written to D1.

## API contract

### Public

- `GET /api/reviews` returns the newest 100 approved reviews. Email is omitted.
- `POST /api/reviews` accepts required `name`, `rating`, and `reviewText` values,
  plus optional `email` and an `Idempotency-Key` header. A valid review returns
  HTTP 202 and remains pending.

### Private moderation

- `GET /api/admin/reviews?status=pending`
- `PATCH /api/admin/reviews/:id` with `{ "status": "approved" }` or
  `{ "status": "rejected" }`
- `DELETE /api/admin/reviews/:id` permanently deletes one review

Both moderation endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

## Security notes

- Public queries whitelist fields instead of returning entire database rows.
- The Worker validates all fields and accepts same-origin submissions only.
- Idempotency keys prevent accidental replay.
- A salted IP hash enforces one submission per 30 seconds and five per hour.
  Raw IP addresses are not stored.
- User content is rendered with `textContent`, never `innerHTML`.
- The token comparison hashes both values before a fixed-length comparison.
- The admin token is intentionally not persisted in localStorage or cookies.
- For a larger moderation team, replace the shared token with Cloudflare Access
  or another identity provider so every moderator has an individual account.

Cloudflare documents the static-assets binding, D1 migrations, and encrypted
Worker secrets here:

- <https://developers.cloudflare.com/workers/static-assets/binding/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
- <https://developers.cloudflare.com/workers/configuration/secrets/>
