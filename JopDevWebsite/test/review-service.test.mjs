import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReviewService,
  ReviewServiceError,
  validateReview,
} from '../js/review-service.mjs';

const validReview = {
  name: '  Jamie  ',
  email: 'jamie@example.com',
  rating: '5',
  reviewText: '  A genuinely useful experience.  ',
};

test('validateReview trims values and accepts a complete review', () => {
  const result = validateReview(validReview);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.name, 'Jamie');
  assert.equal(result.values.reviewText, 'A genuinely useful experience.');
  assert.equal(result.values.rating, 5);
});

test('validateReview accepts a blank optional email', () => {
  const result = validateReview({ ...validReview, email: '   ' });

  assert.equal(result.isValid, true);
  assert.equal(result.values.email, '');
  assert.equal(result.errors.email, undefined);
});

test('validateReview returns clear errors for every required field', () => {
  const result = validateReview({ name: '', email: 'not-an-email', rating: 0, reviewText: 'short' });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.name, 'Enter your name.');
  assert.equal(result.errors.email, 'Enter a valid email address.');
  assert.equal(result.errors.rating, 'Choose a rating from 1 to 5 stars.');
  assert.equal(result.errors.reviewText, 'Review must be at least 10 characters.');
});

test('public reviews include only approved, valid fields and are newest first', async () => {
  const fetchImplementation = async () => ({
    ok: true,
    async json() {
      return {
        reviews: [
          {
            id: 'older', displayName: 'Older', email: 'private@example.com', rating: 4,
            reviewText: 'Older approved review.', submittedAt: '2026-01-01T00:00:00.000Z', status: 'approved',
          },
          {
            id: 'pending', displayName: 'Pending', rating: 5,
            reviewText: 'This must not be public.', submittedAt: '2026-03-01T00:00:00.000Z', status: 'pending',
          },
          {
            id: 'newer', displayName: 'Newer', rating: 5,
            reviewText: 'Newer approved review.', submittedAt: '2026-02-01T00:00:00.000Z', status: 'approved',
          },
        ],
      };
    },
  });
  const service = createReviewService({ apiBaseUrl: 'https://reviews.example', fetchImplementation });

  const result = await service.getApprovedReviews();

  assert.deepEqual(result.reviews.map((review) => review.id), ['newer', 'older']);
  assert.equal('email' in result.reviews[1], false);
  assert.deepEqual(result.summary, { averageRating: 4.5, totalReviews: 2 });
});

test('unconfigured production service returns an honest empty state and rejects submissions', async () => {
  const service = createReviewService({ apiBaseUrl: '', mockMode: false });

  assert.deepEqual(await service.getApprovedReviews(), {
    reviews: [],
    summary: { averageRating: null, totalReviews: 0 },
  });
  await assert.rejects(
    service.submitReview(validReview, { idempotencyKey: 'test-key' }),
    (error) => error instanceof ReviewServiceError && error.code === 'NOT_CONFIGURED',
  );
});

test('submissions use the pending endpoint and idempotency header', async () => {
  let request;
  const fetchImplementation = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 202 };
  };
  const service = createReviewService({ apiBaseUrl: 'https://reviews.example/', fetchImplementation });

  const result = await service.submitReview(validReview, { idempotencyKey: 'submission-123' });

  assert.deepEqual(result, { status: 'pending', persisted: true, developmentMode: false });
  assert.equal(request.url, 'https://reviews.example/reviews');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Idempotency-Key'], 'submission-123');
  assert.deepEqual(JSON.parse(request.options.body), {
    name: 'Jamie',
    email: 'jamie@example.com',
    rating: 5,
    reviewText: 'A genuinely useful experience.',
  });
});
