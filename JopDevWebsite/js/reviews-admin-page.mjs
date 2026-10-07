function getApiBaseUrl() {
  return String(window.JOPDEV_REVIEWS_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
}

function createDetail(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function createAdminReviewCard(review, onModerate) {
  const article = document.createElement('article');
  article.className = 'admin-review-card';

  const heading = document.createElement('div');
  heading.className = 'review-card-heading';
  const reviewer = document.createElement('h2');
  reviewer.textContent = review.displayName;
  const date = document.createElement('time');
  date.dateTime = review.submittedAt;
  date.textContent = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(review.submittedAt));
  heading.append(reviewer, date);

  const details = document.createElement('dl');
  details.className = 'admin-review-details';
  details.append(
    createDetail('Email (private)', review.email),
    createDetail('Rating', `${review.rating} out of 5 stars`),
    createDetail('Status', review.status),
  );

  const reviewText = document.createElement('p');
  reviewText.className = 'admin-review-text';
  // All submitted content remains plain text; it is never interpreted as HTML.
  reviewText.textContent = review.reviewText;

  article.append(heading, details, reviewText);

  if (review.status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'admin-review-actions';
    const reject = document.createElement('button');
    reject.className = 'secondary-button danger-button';
    reject.type = 'button';
    reject.textContent = 'Reject';
    const approve = document.createElement('button');
    approve.className = 'primary-button';
    approve.type = 'button';
    approve.textContent = 'Approve';

    reject.addEventListener('click', () => onModerate(review.id, 'rejected', [reject, approve]));
    approve.addEventListener('click', () => onModerate(review.id, 'approved', [reject, approve]));
    actions.append(reject, approve);
    article.append(actions);
  }

  return article;
}

export function initReviewsAdminPage() {
  const page = document.querySelector('[data-reviews-admin-page]');
  if (!page) return;

  const apiBaseUrl = getApiBaseUrl();
  const login = page.querySelector('[data-admin-login]');
  const loginForm = page.querySelector('[data-admin-login-form]');
  const loginError = page.querySelector('[data-admin-login-error]');
  const dashboard = page.querySelector('[data-admin-dashboard]');
  const filter = page.querySelector('[data-review-status-filter]');
  const loading = page.querySelector('[data-admin-loading]');
  const error = page.querySelector('[data-admin-error]');
  const empty = page.querySelector('[data-admin-empty]');
  const list = page.querySelector('[data-admin-review-list]');
  let adminToken = '';

  const adminFetch = async (path, options = {}) => {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${adminToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    };
    return fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  };

  const showLogin = (message = '') => {
    adminToken = '';
    dashboard.hidden = true;
    login.hidden = false;
    loginError.textContent = message;
    loginError.hidden = !message;
    loginForm.elements.token.value = '';
    loginForm.elements.token.focus();
  };

  const loadReviews = async () => {
    loading.hidden = false;
    error.hidden = true;
    empty.hidden = true;
    list.hidden = true;

    try {
      const response = await adminFetch(`/admin/reviews?status=${encodeURIComponent(filter.value)}`);
      if (response.status === 401) {
        showLogin('That moderation token was not accepted.');
        return false;
      }
      if (!response.ok) throw new Error('The moderation queue could not be loaded.');

      const payload = await response.json();
      const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      list.replaceChildren(...reviews.map((review) => createAdminReviewCard(review, moderateReview)));
      loading.hidden = true;
      if (reviews.length) list.hidden = false;
      else empty.hidden = false;
      return true;
    } catch (loadError) {
      loading.hidden = true;
      error.textContent = loadError.message || 'The moderation queue could not be loaded.';
      error.hidden = false;
      return false;
    }
  };

  async function moderateReview(reviewId, status, buttons) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    error.hidden = true;

    try {
      const response = await adminFetch(`/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (response.status === 401) {
        showLogin('Your moderation session is no longer authorized.');
        return;
      }
      if (!response.ok) throw new Error(`The review could not be ${status}.`);
      await loadReviews();
    } catch (moderationError) {
      error.textContent = moderationError.message || 'The review could not be updated.';
      error.hidden = false;
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    adminToken = loginForm.elements.token.value.trim();
    if (!adminToken) return;

    submitButton.disabled = true;
    loginError.hidden = true;
    login.hidden = true;
    dashboard.hidden = false;
    const loaded = await loadReviews();
    if (loaded) loginForm.elements.token.value = '';
    submitButton.disabled = false;
  });

  filter.addEventListener('change', loadReviews);
  page.querySelector('[data-refresh-admin-reviews]').addEventListener('click', loadReviews);
  page.querySelector('[data-lock-admin]').addEventListener('click', () => showLogin());
}
