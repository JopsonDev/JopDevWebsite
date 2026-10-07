const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected']);
const MODERATION_STATUSES = new Set(['approved', 'rejected']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBMISSIONS_PER_HOUR = 5;
const MIN_SUBMISSION_INTERVAL_MS = 30_000;

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function cleanText(value) {
  return String(value ?? '').replaceAll('\0', '').trim();
}

export function validateReviewPayload(input) {
  const values = {
    name: cleanText(input?.name),
    email: cleanText(input?.email).toLowerCase(),
    rating: Number(input?.rating),
    reviewText: cleanText(input?.reviewText),
  };
  const errors = {};

  if (!values.name) errors.name = 'Enter your name.';
  else if (values.name.length > 80) errors.name = 'Name must be 80 characters or fewer.';

  if (!values.email) errors.email = 'Enter your email address.';
  else if (values.email.length > 254 || !EMAIL_PATTERN.test(values.email)) {
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

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(left))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(right))),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(leftHash, rightHash);
  }

  // Node's Web Crypto does not expose the Workers timingSafeEqual extension.
  // Both SHA-256 digests are fixed length, so this non-short-circuit fallback
  // preserves the same comparison shape in the Node-based unit tests.
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function isAuthorized(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  return constantTimeEqual(authorization.slice(7), env.ADMIN_TOKEN);
}

async function parseJson(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('Content-Type must be application/json.'), { status: 415 });
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 12_000) {
    throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  }

  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

async function listPublicReviews(env) {
  const { results } = await env.REVIEWS_DB.prepare(`
    SELECT
      id,
      display_name AS displayName,
      rating,
      review_text AS reviewText,
      submitted_at AS submittedAt,
      status
    FROM reviews
    WHERE status = 'approved'
    ORDER BY submitted_at DESC
    LIMIT 100
  `).all();

  return json({ reviews: results });
}

async function enforceRateLimit(request, env, now) {
  if (!env.IP_HASH_SALT) {
    throw Object.assign(new Error('The review service is not fully configured.'), { status: 503 });
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || 'local-development';
  const submitterHash = await sha256(`${env.IP_HASH_SALT}:${clientIp}`);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const [latest, hourly] = await Promise.all([
    env.REVIEWS_DB.prepare(`
      SELECT submitted_at AS submittedAt
      FROM reviews
      WHERE submitter_hash = ?
      ORDER BY submitted_at DESC
      LIMIT 1
    `).bind(submitterHash).first(),
    env.REVIEWS_DB.prepare(`
      SELECT COUNT(*) AS count
      FROM reviews
      WHERE submitter_hash = ? AND submitted_at >= ?
    `).bind(submitterHash, hourAgo).first(),
  ]);

  if (latest?.submittedAt) {
    const elapsed = now.getTime() - new Date(latest.submittedAt).getTime();
    if (elapsed < MIN_SUBMISSION_INTERVAL_MS) {
      throw Object.assign(new Error('Please wait before submitting another review.'), { status: 429 });
    }
  }
  if (Number(hourly?.count || 0) >= MAX_SUBMISSIONS_PER_HOUR) {
    throw Object.assign(new Error('Too many reviews were submitted recently. Please try again later.'), { status: 429 });
  }

  return submitterHash;
}

async function createReview(request, env, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Cross-origin submissions are not allowed.' }, 403);

  const idempotencyKey = cleanText(request.headers.get('Idempotency-Key'));
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    return json({ error: 'A valid Idempotency-Key header is required.' }, 400);
  }

  const payload = await parseJson(request);
  const validation = validateReviewPayload(payload);
  if (!validation.isValid) return json({ error: 'Review details are invalid.', fields: validation.errors }, 400);

  const existing = await env.REVIEWS_DB.prepare(
    'SELECT id FROM reviews WHERE idempotency_key = ? LIMIT 1',
  ).bind(idempotencyKey).first();
  if (existing) return json({ error: 'This review was already submitted.' }, 409);

  const now = new Date();
  const submitterHash = await enforceRateLimit(request, env, now);
  const reviewId = crypto.randomUUID();

  await env.REVIEWS_DB.prepare(`
    INSERT INTO reviews (
      id, display_name, email, rating, review_text, status,
      submitted_at, idempotency_key, submitter_hash
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(
    reviewId,
    validation.values.name,
    validation.values.email,
    validation.values.rating,
    validation.values.reviewText,
    now.toISOString(),
    idempotencyKey,
    submitterHash,
  ).run();

  return json({ id: reviewId, status: 'pending' }, 202);
}

async function listAdminReviews(request, env, url) {
  if (!(await isAuthorized(request, env))) return json({ error: 'Unauthorized.' }, 401);

  const status = url.searchParams.get('status') || 'pending';
  if (!REVIEW_STATUSES.has(status)) return json({ error: 'Invalid review status.' }, 400);

  const { results } = await env.REVIEWS_DB.prepare(`
    SELECT
      id,
      display_name AS displayName,
      email,
      rating,
      review_text AS reviewText,
      status,
      submitted_at AS submittedAt,
      moderated_at AS moderatedAt
    FROM reviews
    WHERE status = ?
    ORDER BY submitted_at DESC
    LIMIT 200
  `).bind(status).all();

  return json({ reviews: results });
}

async function moderateReview(request, env, reviewId) {
  if (!(await isAuthorized(request, env))) return json({ error: 'Unauthorized.' }, 401);
  const payload = await parseJson(request);
  const status = cleanText(payload?.status);
  if (!MODERATION_STATUSES.has(status)) return json({ error: 'Status must be approved or rejected.' }, 400);

  const result = await env.REVIEWS_DB.prepare(`
    UPDATE reviews
    SET status = ?, moderated_at = ?
    WHERE id = ?
  `).bind(status, new Date().toISOString(), reviewId).run();

  if (!result.meta?.changes) return json({ error: 'Review not found.' }, 404);
  return json({ id: reviewId, status });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/reviews' && request.method === 'GET') {
    return listPublicReviews(env);
  }
  if (url.pathname === '/api/reviews' && request.method === 'POST') {
    return createReview(request, env, url);
  }
  if (url.pathname === '/api/admin/reviews' && request.method === 'GET') {
    return listAdminReviews(request, env, url);
  }

  const moderationMatch = url.pathname.match(/^\/api\/admin\/reviews\/([a-zA-Z0-9-]+)$/);
  if (moderationMatch && request.method === 'PATCH') {
    return moderateReview(request, env, moderationMatch[1]);
  }

  if (url.pathname.startsWith('/api/')) {
    return json({ error: 'Not found.' }, 404);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (!error.status || error.status >= 500) {
        console.error(JSON.stringify({
          message: 'Review Worker error',
          error: error instanceof Error ? error.message : String(error),
          path: new URL(request.url).pathname,
        }));
      }
      return json({ error: error.message || 'Unexpected server error.' }, error.status || 500);
    }
  },
};
