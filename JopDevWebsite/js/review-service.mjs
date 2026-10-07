const MOCK_REVIEWS = Object.freeze([
  {
    id: 'sample-3',
    displayName: 'Morgan',
    rating: 5,
    reviewText: 'Thoughtful software with a refreshingly straightforward experience.',
    submittedAt: '2026-09-28T14:20:00.000Z',
    status: 'approved',
  },
  {
    id: 'sample-2',
    displayName: 'Alex',
    rating: 4,
    reviewText: 'The tools are focused, practical, and easy to get started with.',
    submittedAt: '2026-09-14T09:05:00.000Z',
    status: 'approved',
  },
  {
    id: 'sample-1',
    displayName: 'Sam',
    rating: 5,
    reviewText: 'A polished experience and clear attention to the details that matter.',
    submittedAt: '2026-08-31T18:45:00.000Z',
    status: 'approved',
  },
]);

export class ReviewServiceError extends Error {
  constructor(message, code = 'REVIEW_SERVICE_ERROR') {
    super(message);
    this.name = 'ReviewServiceError';
    this.code = code;
  }
}

export function validateReview(input) {
  const values = {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim(),
    rating: Number(input.rating),
    reviewText: String(input.reviewText || '').trim(),
  };
  const errors = {};

  if (!values.name) errors.name = 'Enter your name.';
  else if (values.name.length > 80) errors.name = 'Name must be 80 characters or fewer.';

  if (!values.email) errors.email = 'Enter your email address.';
  else if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) {
    errors.rating = 'Choose a rating from 1 to 5 stars.';
  }

  if (!values.reviewText) errors.reviewText = 'Enter your review.';
  else if (values.reviewText.length < 10) errors.reviewText = 'Review must be at least 10 characters.';
  else if (values.reviewText.length > 1000) errors.reviewText = 'Review must be 1,000 characters or fewer.';

  return { values, errors, isValid: Object.keys(errors).length === 0 };
}

function normalizePublicReview(review) {
  const rating = Number(review.rating);
  const submittedAt = new Date(review.submittedAt);
  if (
    review.status !== 'approved' ||
    !String(review.displayName || '').trim() ||
    !String(review.reviewText || '').trim() ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    Number.isNaN(submittedAt.getTime())
  ) {
    return null;
  }

  // Deliberately whitelist public fields. Email and moderation metadata never
  // cross this service boundary into the rendering layer.
  return {
    id: String(review.id || ''),
    displayName: String(review.displayName).trim(),
    rating,
    reviewText: String(review.reviewText).trim(),
    submittedAt: submittedAt.toISOString(),
  };
}

function prepareReviews(reviews) {
  return reviews
    .map(normalizePublicReview)
    .filter(Boolean)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function getSummary(reviews) {
  if (!reviews.length) return { averageRating: null, totalReviews: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    averageRating: Math.round((total / reviews.length) * 10) / 10,
    totalReviews: reviews.length,
  };
}

function readBrowserConfiguration() {
  if (typeof window === 'undefined') return {};
  const search = new URLSearchParams(window.location.search);
  const explicitMockMode = search.get('mockReviews') === '1';
  return {
    apiBaseUrl: window.JOPDEV_REVIEWS_CONFIG?.apiBaseUrl || '',
    mockMode: explicitMockMode,
  };
}

export function createReviewService(options = {}) {
  const browserConfiguration = readBrowserConfiguration();
  const apiBaseUrl = String(options.apiBaseUrl ?? browserConfiguration.apiBaseUrl ?? '').replace(/\/$/, '');
  const mockMode = Boolean(options.mockMode ?? browserConfiguration.mockMode);
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  const mockPendingReviews = [];

  return {
    isMockMode: mockMode,

    async getApprovedReviews() {
      if (mockMode) {
        const reviews = prepareReviews(MOCK_REVIEWS);
        return { reviews, summary: getSummary(reviews) };
      }

      if (!apiBaseUrl) return { reviews: [], summary: getSummary([]) };

      let response;
      try {
        response = await fetchImplementation(`${apiBaseUrl}/reviews?status=approved`, {
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw new ReviewServiceError('The review service could not be reached.', 'NETWORK_ERROR');
      }
      if (!response.ok) throw new ReviewServiceError('Reviews could not be loaded.', 'LOAD_FAILED');

      const payload = await response.json();
      const reviews = prepareReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
      return { reviews, summary: getSummary(reviews) };
    },

    async submitReview(review, { idempotencyKey } = {}) {
      const validation = validateReview(review);
      if (!validation.isValid) {
        throw new ReviewServiceError('Review details are invalid.', 'VALIDATION_ERROR');
      }

      if (mockMode) {
        mockPendingReviews.push({ ...validation.values, status: 'pending' });
        return { status: 'pending', persisted: false, developmentMode: true };
      }

      if (!apiBaseUrl) {
        throw new ReviewServiceError(
          'Review submissions are not available yet. Please try again later.',
          'NOT_CONFIGURED',
        );
      }

      let response;
      try {
        response = await fetchImplementation(`${apiBaseUrl}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': idempotencyKey || crypto.randomUUID(),
          },
          body: JSON.stringify(validation.values),
        });
      } catch {
        throw new ReviewServiceError('The review service could not be reached.', 'NETWORK_ERROR');
      }

      if (response.status === 409 || response.status === 429) {
        throw new ReviewServiceError(
          'That review may already have been submitted. Please wait before trying again.',
          'DUPLICATE_OR_RATE_LIMITED',
        );
      }
      if (!response.ok) {
        throw new ReviewServiceError('Your review could not be submitted. Please try again.', 'SUBMIT_FAILED');
      }

      return { status: 'pending', persisted: true, developmentMode: false };
    },
  };
}
