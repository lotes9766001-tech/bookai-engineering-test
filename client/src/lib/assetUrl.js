import { API_ASSET_BASE_URL } from './api';

function getAssetBaseUrl() {
  const apiBaseUrl = String(API_ASSET_BASE_URL || '').replace(/\/+$/, '');
  const assetBaseUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;

  return assetBaseUrl;
}

export function resolveAssetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${getAssetBaseUrl()}${url}`;
  return url;
}
