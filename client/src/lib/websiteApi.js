import { api } from './api';

function unwrap(result) {
  return result?.data ?? result;
}

export async function getWebsiteSettings() {
  return unwrap(await api('/website/settings'));
}

export async function saveWebsiteSettings(payload) {
  return unwrap(await api('/website/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  }));
}

export async function listWebsiteResource(resource) {
  return unwrap(await api(`/website/${resource}`));
}

export async function createWebsiteResource(resource, payload) {
  return unwrap(await api(`/website/${resource}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }));
}

export async function updateWebsiteResource(resource, id, payload) {
  return unwrap(await api(`/website/${resource}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }));
}

export async function deleteWebsiteResource(resource, id) {
  return unwrap(await api(`/website/${resource}/${id}`, {
    method: 'DELETE'
  }));
}

export async function listWebsiteInquiries() {
  return unwrap(await api('/website/inquiries'));
}

export async function updateWebsiteInquiryStatus(id, status) {
  return unwrap(await api(`/website/inquiries/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }));
}

export async function listWebsiteAssets() {
  return unwrap(await api('/website/assets'));
}

export async function createWebsiteAsset(payload) {
  return unwrap(await api('/website/assets', {
    method: 'POST',
    body: JSON.stringify(payload)
  }));
}

export async function deleteWebsiteAsset(id) {
  return unwrap(await api(`/website/assets/${id}`, {
    method: 'DELETE'
  }));
}
