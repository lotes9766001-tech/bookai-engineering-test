import { api } from './api';

function toQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  return query.toString();
}

export function getBusinessBiReport(companyId, params = {}) {
  const query = toQuery(params);
  return api(`/companies/${companyId}/reports/business-bi${query ? `?${query}` : ''}`);
}
