import test from 'node:test';
import assert from 'node:assert/strict';

import reviewWorker, {
  constantTimeEqual,
  validateReviewPayload,
} from '../worker/index.mjs';

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.arguments = [];
  }

  bind(...arguments_) {
    this.arguments = arguments_;
    return this;
  }

  async first() {
    if (this.sql.includes('WHERE idempotency_key = ?')) {
      const review = this.database.reviews.find((item) => item.idempotency_key === this.arguments[0]);
      return review ? { id: review.id } : null;
    }
    if (this.sql.includes('ORDER BY submitted_at DESC LIMIT 1')) {
      const latest = this.database.reviews
        .filter((item) => item.submitter_hash === this.arguments[0])
        .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))[0];
      return latest ? { submittedAt: latest.submitted_at } : null;
    }
    if (this.sql.includes('COUNT(*) AS count')) {
      const [hash, since] = this.arguments;
      return {
        count: this.database.reviews.filter(
          (item) => item.submitter_hash === hash && item.submitted_at >= since,
        ).length,
      };
    }
    throw new Error(`Unhandled first() SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.includes("WHERE status = 'approved'")) {
      return {
        results: this.database.reviews
          .filter((item) => item.status === 'approved')
          .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))
          .map((item) => ({
            id: item.id,
            displayName: item.display_name,
            rating: item.rating,
            reviewText: item.review_text,
            submittedAt: item.submitted_at,
            status: item.status,
          })),
      };
    }
    if (this.sql.includes('WHERE status = ?')) {
      return {
        results: this.database.reviews
          .filter((item) => item.status === this.arguments[0])
          .map((item) => ({
            id: item.id,
            displayName: item.display_name,
            email: item.email,
            rating: item.rating,
            reviewText: item.review_text,
            status: item.status,
            submittedAt: item.submitted_at,
            moderatedAt: item.moderated_at,
          })),
      };
    }
    throw new Error(`Unhandled all() SQL: ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith('INSERT INTO reviews')) {
      const [id, displayName, email, rating, reviewText, submittedAt, idempotencyKey, submitterHash] = this.arguments;
      this.database.reviews.push({
        id,
        display_name: displayName,
        email,
        rating,
        review_text: reviewText,
        status: 'pending',
        submitted_at: submittedAt,
        moderated_at: null,
        idempotency_key: idempotencyKey,
        submitter_hash: submitterHash,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith('UPDATE reviews')) {
      const [status, moderatedAt, id] = this.arguments;
      const review = this.database.reviews.find((item) => item.id === id);
      if (!review) return { meta: { changes: 0 } };
      review.status = status;
      review.moderated_at = moderatedAt;
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith('DELETE FROM reviews')) {
      const reviewIndex = this.database.reviews.findIndex((item) => item.id === this.arguments[0]);
      if (reviewIndex === -1) return { meta: { changes: 0 } };
      this.database.reviews.splice(reviewIndex, 1);
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run() SQL: ${this.sql}`);
  }
}

class FakeD1Database {
  constructor() {
    this.reviews = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function createEnvironment() {
  return {
    REVIEWS_DB: new FakeD1Database(),
    ADMIN_TOKEN: 'a-long-private-admin-token',
    IP_HASH_SALT: 'a-different-private-hash-salt',
    ASSETS: { fetch: async () => new Response('asset') },
  };
}

function createSubmission(idempotencyKey = 'submission-key-001', overrides = {}) {
  return new Request('https://jopdev.example/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      Origin: 'https://jopdev.example',
      'CF-Connecting-IP': '192.0.2.10',
    },
    body: JSON.stringify({
      name: 'Jamie',
      email: 'Jamie@Example.com',
      rating: 5,
      reviewText: 'The organization was helpful and professional.',
      ...overrides,
    }),
  });
}

test('Worker validation normalizes private input and rejects invalid fields', () => {
  const valid = validateReviewPayload({
    name: ' Jamie ', email: 'JAMIE@EXAMPLE.COM', rating: '4', reviewText: ' A useful review. ',
  });
  assert.equal(valid.isValid, true);
  assert.equal(valid.values.email, 'jamie@example.com');

  const withoutEmail = validateReviewPayload({
    name: 'Jamie', email: '', rating: 5, reviewText: 'A useful review without contact details.',
  });
  assert.equal(withoutEmail.isValid, true);
  assert.equal(withoutEmail.values.email, '');

  const invalid = validateReviewPayload({ name: '', email: 'bad', rating: 9, reviewText: 'tiny' });
  assert.deepEqual(Object.keys(invalid.errors), ['name', 'email', 'rating', 'reviewText']);
});

test('constant-time token comparison accepts only the configured token', async () => {
  assert.equal(await constantTimeEqual('same-token', 'same-token'), true);
  assert.equal(await constantTimeEqual('same-token', 'different-token'), false);
});

test('reviews remain pending and private until an authorized approval', async () => {
  const env = createEnvironment();

  const submitted = await reviewWorker.fetch(createSubmission(), env);
  assert.equal(submitted.status, 202);
  assert.equal(env.REVIEWS_DB.reviews[0].status, 'pending');
  assert.equal(env.REVIEWS_DB.reviews[0].email, 'jamie@example.com');

  const beforeApproval = await reviewWorker.fetch(
    new Request('https://jopdev.example/api/reviews?status=approved'), env,
  );
  assert.deepEqual((await beforeApproval.json()).reviews, []);

  const unauthorized = await reviewWorker.fetch(
    new Request(`https://jopdev.example/api/admin/reviews/${env.REVIEWS_DB.reviews[0].id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    }),
    env,
  );
  assert.equal(unauthorized.status, 401);

  const approved = await reviewWorker.fetch(
    new Request(`https://jopdev.example/api/admin/reviews/${env.REVIEWS_DB.reviews[0].id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    }),
    env,
  );
  assert.equal(approved.status, 200);

  const publicResponse = await reviewWorker.fetch(
    new Request('https://jopdev.example/api/reviews?status=approved'), env,
  );
  const publicReview = (await publicResponse.json()).reviews[0];
  assert.equal(publicReview.displayName, 'Jamie');
  assert.equal(publicReview.rating, 5);
  assert.equal('email' in publicReview, false);
});

test('admin queue exposes email only after bearer-token authorization', async () => {
  const env = createEnvironment();
  await reviewWorker.fetch(createSubmission(), env);

  const response = await reviewWorker.fetch(
    new Request('https://jopdev.example/api/admin/reviews?status=pending', {
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reviews[0].email, 'jamie@example.com');
});

test('authorized admins can permanently delete reviews', async () => {
  const env = createEnvironment();
  await reviewWorker.fetch(createSubmission(), env);
  const reviewId = env.REVIEWS_DB.reviews[0].id;

  const unauthorized = await reviewWorker.fetch(
    new Request(`https://jopdev.example/api/admin/reviews/${reviewId}`, { method: 'DELETE' }),
    env,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(env.REVIEWS_DB.reviews.length, 1);

  const deleted = await reviewWorker.fetch(
    new Request(`https://jopdev.example/api/admin/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}` },
    }),
    env,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { id: reviewId, deleted: true });
  assert.equal(env.REVIEWS_DB.reviews.length, 0);
});

test('submissions may omit the private email address', async () => {
  const env = createEnvironment();
  const submitted = await reviewWorker.fetch(
    createSubmission('submission-without-email', { email: '' }),
    env,
  );

  assert.equal(submitted.status, 202);
  assert.equal(env.REVIEWS_DB.reviews[0].email, '');
});

test('server rate limit blocks rapid submissions even with a new idempotency key', async () => {
  const env = createEnvironment();
  assert.equal((await reviewWorker.fetch(createSubmission('submission-key-001'), env)).status, 202);
  assert.equal((await reviewWorker.fetch(createSubmission('submission-key-002'), env)).status, 429);
});
