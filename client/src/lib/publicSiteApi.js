const PUBLIC_API = '/api/public/sites';

async function publicRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let response;
  try {
    response = await fetch(`${PUBLIC_API}${path}`, {
      ...options,
      headers
    });
  } catch {
    const error = new Error('網站資料連線失敗，請稍後再試。');
    error.status = 0;
    throw error;
  }

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || '網站資料載入失敗。');
    error.status = response.status;
    error.code = body?.error?.code || body?.code || '';
    error.requestId = body?.error?.requestId || '';
    throw error;
  }

  return body?.data ?? body;
}

function encodeSlug(value) {
  return encodeURIComponent(String(value || '').trim());
}

export function getPublicSite(slug) {
  return publicRequest(`/${encodeSlug(slug)}`);
}

export function getPublicProducts(slug) {
  return publicRequest(`/${encodeSlug(slug)}/products`);
}

export function getPublicProduct(slug, productSlug) {
  return publicRequest(`/${encodeSlug(slug)}/products/${encodeSlug(productSlug)}`);
}

export function getPublicPosts(slug) {
  return publicRequest(`/${encodeSlug(slug)}/posts`);
}

export function getPublicPost(slug, postSlug) {
  return publicRequest(`/${encodeSlug(slug)}/posts/${encodeSlug(postSlug)}`);
}

export function getPublicFaqs(slug) {
  return publicRequest(`/${encodeSlug(slug)}/faqs`);
}

export function createPublicInquiry(slug, payload) {
  return publicRequest(`/${encodeSlug(slug)}/inquiries`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
