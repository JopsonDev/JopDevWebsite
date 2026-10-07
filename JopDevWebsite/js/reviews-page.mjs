import { createReviewService, validateReview } from './review-service.mjs';

const RECENT_SUBMISSION_KEY = 'jopdev-review-last-submission';
const SUBMISSION_COOLDOWN_MS = 30_000;

function createStars(rating) {
  const element = document.createElement('span');
  element.className = 'review-stars';
  element.setAttribute('aria-label', `${rating} out of 5 stars`);
  const stars = document.createElement('span');
  stars.setAttribute('aria-hidden', 'true');
  stars.textContent = `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
  element.append(stars);
  return element;
}

function createReviewCard(review) {
  const article = document.createElement('article');
  article.className = 'review-card';

  const heading = document.createElement('div');
  heading.className = 'review-card-heading';

  const reviewer = document.createElement('h3');
  reviewer.textContent = review.displayName;

  const date = document.createElement('time');
  date.dateTime = review.submittedAt;
  date.textContent = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(review.submittedAt));

  const text = document.createElement('p');
  // textContent is intentional: user-authored content is never interpreted as HTML.
  text.textContent = review.reviewText;

  heading.append(reviewer, date);
  article.append(heading, createStars(review.rating), text);
  return article;
}

function getRecentSubmission() {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_SUBMISSION_KEY) || 'null');
  } catch {
    return null;
  }
}

async function createFingerprint(review) {
  const data = new TextEncoder().encode(
    `${review.email.toLowerCase()}|${review.rating}|${review.reviewText.toLowerCase()}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderFieldErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    const fieldName = element.dataset.errorFor;
    const message = errors[fieldName] || '';
    element.textContent = message;
    const field = form.elements[fieldName];
    if (field instanceof RadioNodeList) {
      Array.from(field).forEach((radio) => radio.setAttribute('aria-invalid', message ? 'true' : 'false'));
    } else if (field) {
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  });
}

export function initReviewsPage() {
  const page = document.querySelector('[data-reviews-page]');
  if (!page) return;

  const service = createReviewService();
  const dialog = document.querySelector('[data-review-dialog]');
  const form = dialog.querySelector('[data-review-form]');
  const success = dialog.querySelector('[data-review-success]');
  const successMessage = dialog.querySelector('[data-review-success-message]');
  const submitError = form.querySelector('[data-submit-error]');
  const submitButton = form.querySelector('[data-submit-review]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const reviewText = form.elements.reviewText;
  const characterCount = form.querySelector('[data-character-count]');
  const ratingOptions = form.querySelector('[data-rating-options]');
  const openedAt = { value: 0 };

  if (service.isMockMode) document.querySelector('[data-development-notice]').hidden = false;

  const resetForm = () => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    submitError.hidden = true;
    submitError.textContent = '';
    renderFieldErrors(form, {});
    characterCount.textContent = '0 / 1,000';
    ratingOptions.dataset.rating = '0';
  };

  const openForm = () => {
    resetForm();
    openedAt.value = Date.now();
    dialog.showModal();
    form.elements.name.focus();
  };

  const closeForm = () => dialog.close();
  document.querySelectorAll('[data-open-review-form]').forEach((button) => button.addEventListener('click', openForm));
  document.querySelectorAll('[data-close-review-form]').forEach((button) => button.addEventListener('click', closeForm));

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeForm();
  });

  reviewText.addEventListener('input', () => {
    characterCount.textContent = `${reviewText.value.length.toLocaleString()} / 1,000`;
  });

  ratingOptions.addEventListener('change', () => {
    ratingOptions.dataset.rating = form.elements.rating.value;
    form.querySelector('[data-error-for="rating"]').textContent = '';
    Array.from(form.elements.rating).forEach((radio) => radio.setAttribute('aria-invalid', 'false'));
  });

  ['name', 'email', 'reviewText'].forEach((name) => {
    form.elements[name].addEventListener('input', () => {
      const error = form.querySelector(`[data-error-for="${name}"]`);
      error.textContent = '';
      form.elements[name].setAttribute('aria-invalid', 'false');
    });
  });

  const renderReviews = async () => {
    const loading = page.querySelector('[data-reviews-loading]');
    const error = page.querySelector('[data-reviews-error]');
    const empty = page.querySelector('[data-reviews-empty]');
    const list = page.querySelector('[data-review-list]');
    loading.hidden = false;
    error.hidden = true;
    empty.hidden = true;
    list.hidden = true;

    try {
      const { reviews, summary } = await service.getApprovedReviews();
      list.replaceChildren(...reviews.map(createReviewCard));
      page.querySelector('[data-rating-value]').textContent =
        summary.averageRating === null ? 'Not rated yet' : `${summary.averageRating.toFixed(1)} / 5`;
      page.querySelector('[data-review-count]').textContent =
        summary.totalReviews === 1 ? '1 approved review' : `${summary.totalReviews} approved reviews`;
      const summaryStars = page.querySelector('[data-summary-stars]');
      summaryStars.dataset.rating = summary.averageRating === null ? '0' : String(summary.averageRating);
      summaryStars.style.setProperty(
        '--rating-percent',
        `${summary.averageRating === null ? 0 : (summary.averageRating / 5) * 100}%`,
      );
      summaryStars.setAttribute(
        'aria-label',
        summary.averageRating === null ? 'No approved reviews yet' : `${summary.averageRating} out of 5 stars`,
      );
      loading.hidden = true;
      if (reviews.length) list.hidden = false;
      else empty.hidden = false;
    } catch {
      loading.hidden = true;
      error.hidden = false;
      page.querySelector('[data-rating-value]').textContent = 'Unavailable';
      page.querySelector('[data-review-count]').textContent = 'Review totals unavailable';
    }
  };

  page.querySelector('[data-retry-reviews]').addEventListener('click', renderReviews);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitError.hidden = true;

    const input = Object.fromEntries(new FormData(form));
    const validation = validateReview(input);
    renderFieldErrors(form, validation.errors);
    if (!validation.isValid) {
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    // The hidden field and minimum completion time are lightweight bot friction.
    // Real rate limiting must also be enforced by the eventual API.
    if (input.website || Date.now() - openedAt.value < 1500) {
      submitError.textContent = 'Please wait a moment, then try submitting again.';
      submitError.hidden = false;
      return;
    }

    const fingerprint = await createFingerprint(validation.values);
    const recent = getRecentSubmission();
    if (recent?.fingerprint === fingerprint && Date.now() - recent.timestamp < SUBMISSION_COOLDOWN_MS) {
      submitError.textContent = 'This review was just submitted. Please wait before trying again.';
      submitError.hidden = false;
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitLabel.textContent = 'Submitting…';

    try {
      const idempotencyKey = crypto.randomUUID();
      const result = await service.submitReview(validation.values, { idempotencyKey });
      sessionStorage.setItem(
        RECENT_SUBMISSION_KEY,
        JSON.stringify({ fingerprint, timestamp: Date.now() }),
      );
      form.hidden = true;
      success.hidden = false;
      successMessage.textContent = result.developmentMode
        ? 'Development preview only: the review is pending in memory and was not permanently saved or published.'
        : 'Your review was submitted and is pending approval. It will not appear publicly until approved.';
      success.focus();
    } catch (error) {
      submitError.textContent = error.message || 'Your review could not be submitted. Please try again.';
      submitError.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitLabel.textContent = 'Submit Review';
    }
  });

  renderReviews();
}
