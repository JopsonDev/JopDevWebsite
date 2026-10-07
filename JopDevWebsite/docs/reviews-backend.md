# Reviews backend integration

The Reviews page is complete on the frontend, but this static site does not
currently have a database, API, authentication, or administration interface.
Production review submissions therefore remain unavailable until a backend is
configured. The UI does not claim that an unconfigured submission was saved.

## Browser configuration

Before the webpack bundle loads, set:

```html
<script>
  window.JOPDEV_REVIEWS_CONFIG = {
    apiBaseUrl: "https://api.example.com"
  };
</script>
```

The service expects these endpoints:

- `GET /reviews?status=approved` returns `{ "reviews": [...] }`. Each public
  item contains only `id`, `displayName`, `rating`, `reviewText`, `submittedAt`,
  and `status: "approved"`. It must never return email addresses.
- `POST /reviews` accepts `name`, `email`, `rating`, and `reviewText`, then
  creates a review with `status: "pending"`. A successful response should use
  a 2xx status. The browser sends an `Idempotency-Key` header.

Only approved records should be returned publicly. The browser calculates the
visible average and count from those approved records as a defensive measure,
but authorization and moderation must be enforced on the server.

## Required backend work

1. Store submissions in a database with pending, approved, and rejected states.
2. Add an authenticated moderation interface or workflow.
3. Enforce server-side validation, output encoding, rate limiting, spam checks,
   and idempotency-key deduplication. Client-side controls are not a security boundary.
4. Keep email private, encrypt or otherwise protect it at rest as appropriate,
   and define retention/deletion practices.
5. Configure CORS for the production site origin and set `apiBaseUrl`.
6. Add monitoring and a process for abuse reports/removal requests.

## Development preview

Append `?mockReviews=1` to `/reviews/` to see clearly labeled sample approved
reviews and exercise a successful pending-submission flow. Mock submissions
exist only in memory, are not published, and disappear on page reload.
