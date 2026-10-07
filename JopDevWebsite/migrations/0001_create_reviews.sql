CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL CHECK (length(review_text) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL,
  moderated_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  submitter_hash TEXT NOT NULL
);

CREATE INDEX reviews_public_listing
  ON reviews (status, submitted_at DESC);

CREATE INDEX reviews_rate_limit
  ON reviews (submitter_hash, submitted_at DESC);
