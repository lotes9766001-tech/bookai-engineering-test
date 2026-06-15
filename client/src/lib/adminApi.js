import { api } from './api';

export function getAdminMembers(status = 'all') {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return api(`/admin/members${query}`);
}

export function getAdminMembersSummary() {
  return api('/admin/members/summary');
}

export function getAdminPendingCount() {
  return api('/admin/members/pending-count');
}

export function updateAdminMemberStatus(id, status) {
  return api(`/admin/members/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export function updateAdminMemberRole(id, role) {
  return api(`/admin/members/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role })
  });
}

export function deleteAdminMember(id) {
  return api(`/admin/members/${id}`, {
    method: 'DELETE'
  });
}
