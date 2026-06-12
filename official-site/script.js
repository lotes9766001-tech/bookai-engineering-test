const body = document.body;
const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navMenu = document.querySelector('[data-nav-menu]');
const backTop = document.querySelector('[data-back-top]');
const BOOKAI_APP_URL = 'https://bookai-engineering-app.onrender.com';
const VISITOR_KEY = 'bookai_visitor_id';

function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = crypto?.randomUUID
      ? crypto.randomUUID()
      : `visitor_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(VISITOR_KEY, visitorId);
  }
  return visitorId;
}

function trackOfficialVisit() {
  const params = new URLSearchParams(window.location.search);
  fetch(`${BOOKAI_APP_URL}/api/track/visit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      visitorId: getVisitorId(),
      page: window.location.pathname || '/',
      referrer: document.referrer || '',
      utm_source: params.get('utm_source') || 'official_website',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || ''
    })
  }).catch(() => {});
}

trackOfficialVisit();

function closeNav() {
  body.classList.remove('nav-open');
  navToggle?.setAttribute('aria-expanded', 'false');
}

navToggle?.addEventListener('click', () => {
  const isOpen = body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeNav);
});

window.addEventListener('scroll', () => {
  const scrolled = window.scrollY > 24;
  nav?.classList.toggle('scrolled', scrolled);
  backTop?.classList.toggle('show', window.scrollY > 680);
});

backTop?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.16,
    rootMargin: '0px 0px -40px'
  }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

function animateCount(el) {
  if (el.dataset.counted === 'true') return;

  const target = Number(el.dataset.count || 0);
  const duration = 1100;
  const start = performance.now();

  el.dataset.counted = 'true';

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString('zh-TW');

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

document.querySelectorAll('[data-count]').forEach((el) => countObserver.observe(el));

const screenTitle = document.querySelector('[data-screen-title]');
const tabs = document.querySelectorAll('[data-view]');
const panels = document.querySelectorAll('[data-panel]');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;

    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === target));

    if (screenTitle) {
      screenTitle.textContent = tab.textContent.trim();
    }

    document
      .querySelectorAll(`[data-panel="${target}"] [data-count]`)
      .forEach((el) => animateCount(el));
  });
});

document.querySelectorAll('.faq-item button').forEach((button) => {
  button.addEventListener('click', () => {
    const item = button.closest('.faq-item');
    const isOpen = item.classList.contains('open');

    document.querySelectorAll('.faq-item').forEach((faq) => faq.classList.remove('open'));

    if (!isOpen) {
      item.classList.add('open');
    }
  });
});
