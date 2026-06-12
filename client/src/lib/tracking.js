const VISITOR_KEY = 'bookai_visitor_id';

function createVisitorId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `visitor_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = createVisitorId();
    localStorage.setItem(VISITOR_KEY, visitorId);
  }
  return visitorId;
}

export function getTrackingPayload() {
  const params = new URLSearchParams(window.location.search);
  return {
    visitorId: getVisitorId(),
    page: window.location.pathname || '/',
    referrer: document.referrer || '',
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || ''
  };
}

export async function trackVisit() {
  try {
    await fetch('/api/track/visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(getTrackingPayload())
    });
  } catch {
    // Tracking must never block the application.
  }
}
