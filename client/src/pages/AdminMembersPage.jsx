import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteAdminMember,
  getAdminMembers,
  getAdminMembersSummary,
  getAdminPendingCount,
  updateAdminMemberRole,
  updateAdminMemberStatus
} from '../lib/adminApi';

const FOUNDER_EMAIL = 'lotes.9766001@gmail.com';

const statusFilters = [
  ['all', '全部'],
  ['pending_review', '待審核'],
  ['approved', '已啟用'],
  ['suspended', '停用中'],
  ['rejected', '已拒絕'],
  ['deleted', '已刪除']
];

const statusLabels = {
  pending_review: '待審核',
  approved: '已啟用',
  active: '已啟用',
  suspended: '停用中',
  disabled: '停用中',
  rejected: '已拒絕',
  deleted: '已刪除',
  demo: 'Demo',
  founder: 'Founder',
  admin: 'Admin'
};

const roleLabels = {
  founder: 'Founder',
  admin: 'Admin',
  owner: 'Owner',
  staff: 'Staff',
  member: 'Member',
  tester: 'Tester'
};

const summaryCards = [
  ['total', '全部會員'],
  ['pending_review', '待審核'],
  ['active', '已啟用'],
  ['disabled', '停用中'],
  ['rejected', '已拒絕'],
  ['deleted', '已刪除'],
  ['admin', 'Admin'],
  ['founder', 'Founder']
];

function normalizeStatus(status) {
  if (status === 'active') return 'approved';
  if (status === 'disabled') return 'suspended';
  return status || 'pending_review';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isFounder(member) {
  return Boolean(
    member?.isFounder ||
    String(member?.role || '').toLowerCase() === 'founder' ||
    String(member?.email || '').toLowerCase() === FOUNDER_EMAIL
  );
}

function isAdmin(member) {
  return Boolean(
    member?.isAdmin ||
    String(member?.role || '').toLowerCase() === 'admin' ||
    isFounder(member)
  );
}

function memberStatus(member) {
  return normalizeStatus(member?.approval_status || member?.status || member?.review_status);
}

export default function AdminMembersPage({ me }) {
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const currentUser = me?.user || {};
  const currentIsFounder = Boolean(currentUser.isFounder);
  const currentIsAdmin = Boolean(currentUser.isAdmin || currentUser.isFounder);

  async function loadData(nextStatus = status) {
    setError('');
    setLoading(true);

    try {
      const [memberRows, summaryData, pendingData] = await Promise.all([
        getAdminMembers(nextStatus),
        getAdminMembersSummary(),
        getAdminPendingCount()
      ]);

      setMembers(Array.isArray(memberRows) ? memberRows : []);
      setSummary(summaryData?.summary || {});
      setPendingCount(Number(pendingData?.count || 0));
    } catch (err) {
      setError(err.message || '會員資料載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(status);
  }, [status]);

  async function runAction(member, label, action) {
    setMessage('');
    setError('');
    setSavingId(member.id);

    try {
      const result = await action();
      await loadData(status);
      setMessage(result?.message || `${label}完成`);
    } catch (err) {
      setError(err.message || `${label}失敗`);
    } finally {
      setSavingId(null);
    }
  }

  function confirmAndRun(member, label, question, action) {
    if (!window.confirm(question)) return;
    runAction(member, label, action);
  }

  function changeRole(member) {
    const currentRole = String(member.role || (isFounder(member) ? 'founder' : 'member')).toLowerCase();
    const allowedRoles = currentIsFounder
      ? ['founder', 'admin', 'owner', 'staff', 'member', 'tester']
      : ['owner', 'staff', 'member', 'tester'];
    const nextRole = window.prompt(`輸入新角色：${allowedRoles.join(' / ')}`, currentRole);

    if (!nextRole) return;

    const normalizedRole = nextRole.trim().toLowerCase();
    if (!allowedRoles.includes(normalizedRole)) {
      setError('不支援的角色，或目前權限不可指派此角色。');
      return;
    }

    confirmAndRun(
      member,
      '會員角色更新',
      `確定要將 ${member.email} 的角色改為 ${roleLabels[normalizedRole] || normalizedRole}？`,
      () => updateAdminMemberRole(member.id, normalizedRole)
    );
  }

  const visibleSummary = useMemo(() => summary || {}, [summary]);

  if (!currentIsAdmin) {
    return (
      <div className="admin-members-page">
        <div className="admin-error">您目前沒有 Admin Console 權限。</div>
      </div>
    );
  }

  return (
    <div className="admin-members-page">
      <section className="admin-members-hero">
        <div>
          <span className="admin-pill">{currentIsFounder ? 'Founder Control Center' : 'Admin Console'}</span>
          <h1>會員管理</h1>
          <p>審核會員、調整狀態與角色，並保護 Founder / Admin 最高權限帳號。</p>
        </div>
        <div className="admin-pending-card">
          <span>待審核</span>
          <strong>{pendingCount}</strong>
        </div>
      </section>

      <section className="admin-summary-grid">
        {summaryCards.map(([key, label]) => (
          <div key={key} className="admin-summary-card">
            <span>{label}</span>
            <strong>{Number(visibleSummary[key] || 0).toLocaleString()}</strong>
          </div>
        ))}
      </section>

      <section className="admin-control-panel admin-members-panel">
        <div className="admin-panel-head">
          <div>
            <h2>
              會員列表
              {pendingCount > 0 && <span className="admin-title-badge">{pendingCount}</span>}
            </h2>
            <p>前端會隱藏不允許的操作，後端仍會強制檢查 Admin / Founder 權限。</p>
          </div>
          <div className="admin-member-filters">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusFilters.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" onClick={() => loadData(status)} disabled={loading}>
              重新整理
            </button>
          </div>
        </div>

        {message && <div className="admin-message">{message}</div>}
        {error && <div className="admin-error">{error}</div>}

        {loading ? (
          <div className="admin-empty-state">會員資料載入中...</div>
        ) : (
          <div className="admin-customer-table admin-members-table">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>公司 / 品牌</th>
                  <th>建立時間</th>
                  <th>最後登入</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      <div className="admin-empty-state">目前沒有符合條件的會員。</div>
                    </td>
                  </tr>
                ) : members.map((member) => (
                  <AdminMemberRow
                    key={member.id}
                    member={member}
                    currentUser={currentUser}
                    currentIsFounder={currentIsFounder}
                    saving={savingId === member.id}
                    onApprove={() => runAction(member, '會員審核通過', () => updateAdminMemberStatus(member.id, 'approved'))}
                    onReject={() => confirmAndRun(member, '會員拒絕', `確定要拒絕 ${member.email}？`, () => updateAdminMemberStatus(member.id, 'rejected'))}
                    onSuspend={() => confirmAndRun(member, '會員停用', `確定要停用 ${member.email}？`, () => updateAdminMemberStatus(member.id, 'suspended'))}
                    onRestore={() => runAction(member, '會員啟用', () => updateAdminMemberStatus(member.id, 'approved'))}
                    onRole={() => changeRole(member)}
                    onDelete={() => confirmAndRun(member, '會員刪除', `確定要刪除 ${member.email}？此操作會 soft delete。`, () => deleteAdminMember(member.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AdminMemberRow({
  member,
  currentUser,
  currentIsFounder,
  saving,
  onApprove,
  onReject,
  onSuspend,
  onRestore,
  onRole,
  onDelete
}) {
  const status = memberStatus(member);
  const founder = isFounder(member);
  const admin = isAdmin(member);
  const self = Number(member.id) === Number(currentUser.id);
  const protectedTarget = founder || self || (!currentIsFounder && admin);
  const canDelete = !protectedTarget && status !== 'deleted';
  const canSuspend = !protectedTarget && !['suspended', 'deleted', 'rejected'].includes(status);
  const canRestore = !founder && status !== 'approved' && status !== 'deleted';
  const canReject = !protectedTarget && !['rejected', 'deleted'].includes(status);
  const canApprove = !founder && status === 'pending_review';
  const canRole = !founder && !self && (currentIsFounder || !admin);

  return (
    <tr>
      <td>
        <strong>{member.name || member.contact_name || '-'}</strong>
        {self && <small>目前登入帳號</small>}
      </td>
      <td>
        {member.email}
        {founder && <small className="admin-protected-label">Founder 受保護</small>}
      </td>
      <td>
        <span className={`admin-status-chip role-${String(member.role || '').toLowerCase()}`}>
          {roleLabels[String(member.role || '').toLowerCase()] || member.role || (founder ? 'Founder' : 'Member')}
        </span>
      </td>
      <td>
        <span className={`admin-status-chip status-${status}`}>
          {statusLabels[status] || status}
        </span>
      </td>
      <td>
        {member.company_name || '-'}
        {member.tax_id && <small>統編 {member.tax_id}</small>}
      </td>
      <td>{formatDate(member.created_at)}</td>
      <td>{formatDate(member.last_login_at)}</td>
      <td>
        <div className="admin-member-actions">
          {canApprove && <button type="button" disabled={saving} onClick={onApprove}>通過</button>}
          {canReject && <button type="button" disabled={saving} onClick={onReject}>拒絕</button>}
          {canSuspend && <button type="button" disabled={saving} onClick={onSuspend}>停用</button>}
          {canRestore && <button type="button" disabled={saving} onClick={onRestore}>啟用</button>}
          {canRole && <button type="button" disabled={saving} onClick={onRole}>調整角色</button>}
          {canDelete && <button type="button" className="admin-danger-button" disabled={saving} onClick={onDelete}>刪除</button>}
          {protectedTarget && <span className="admin-action-note">受保護</span>}
        </div>
      </td>
    </tr>
  );
}
