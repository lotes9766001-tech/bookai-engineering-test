import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

const statusOptions = [
  { value: 'new', label: '新案源' },
  { value: 'contacted', label: '已聯絡' },
  { value: 'site_visit', label: '已場勘' },
  { value: 'quoted', label: '已報價' },
  { value: 'won', label: '已簽約' },
  { value: 'lost', label: '未成交' },
  { value: 'converted', label: '已轉案場' }
];

const projectTypes = [
  '冷氣工程',
  '水電工程',
  '油漆工程',
  '泥作工程',
  '木作工程',
  '防水工程',
  '拆除工程',
  '弱電工程',
  '裝潢工程',
  '道路工程',
  '交通工程',
  '機電工程',
  '統包工程',
  '其他'
];

const sourceTypes = [
  '手動新增',
  '朋友介紹',
  'LINE 詢價',
  '官方網站詢價',
  '政府 / 地方標案',
  '社群平台',
  '舊客戶回購',
  '其他'
];

const agencyTypes = [
  '全部機關',
  '中央部會',
  '地方政府',
  '局處單位',
  '公營事業',
  '學校機關',
  '其他機關'
];

const regions = [
  '全部地區',
  '台北市',
  '新北市',
  '桃園市',
  '台中市',
  '台南市',
  '高雄市',
  '基隆市',
  '新竹縣市',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義縣市',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '台東縣',
  '澎湖 / 金門 / 連江',
  '全國'
];

const tenderRadarItems = [
  {
    id: 'TDR-001',
    title: '校舍教室油漆整修工程',
    agency: '宜蘭縣政府教育處 / 縣立國小',
    agencyType: '地方政府',
    region: '宜蘭縣',
    projectType: '油漆工程',
    budget: 820000,
    estimatedCost: 590000,
    deadline: '2026-07-12',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '校舍教室牆面、走廊與部分公共空間油漆整修，適合油漆、修繕與小型統包廠商評估。',
    fitScore: 86,
    reason: '地區明確、工程類型清楚、案值適中，適合工程行作為政府案源測試標的。'
  },
  {
    id: 'TDR-002',
    title: '市區道路標線與交通安全設施改善工程',
    agency: '台中市政府交通局',
    agencyType: '局處單位',
    region: '台中市',
    projectType: '交通工程',
    budget: 1850000,
    estimatedCost: 1380000,
    deadline: '2026-07-18',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '道路標線、交通標誌、反光設施與局部交通安全改善，適合交通工程與道路施工廠商。',
    fitScore: 78,
    reason: '案值較高且機關明確，但需要特定交通工程資格，建議檢查投標資格。'
  },
  {
    id: 'TDR-003',
    title: '辦公廳舍水電設備汰換與維修',
    agency: '交通部公路局',
    agencyType: '中央部會',
    region: '全國',
    projectType: '水電工程',
    budget: 960000,
    estimatedCost: 710000,
    deadline: '2026-07-20',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '辦公區照明、配電、插座與老舊水電設備汰換維修，適合水電工程廠商追蹤。',
    fitScore: 82,
    reason: '中央機關案源穩定、需求明確，若符合資格可列入優先追蹤。'
  },
  {
    id: 'TDR-004',
    title: '抽水站機電設備定期保養與改善',
    agency: '新北市政府水利局',
    agencyType: '局處單位',
    region: '新北市',
    projectType: '機電工程',
    budget: 2400000,
    estimatedCost: 1880000,
    deadline: '2026-07-25',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '抽水站機電設備保養、零件更換與故障改善，適合機電、水電與設備維護廠商。',
    fitScore: 74,
    reason: '案值高但專業門檻較高，適合有機電維護經驗的廠商。'
  },
  {
    id: 'TDR-005',
    title: '校園排水溝與防水修繕工程',
    agency: '台南市政府教育局 / 市立國中',
    agencyType: '學校機關',
    region: '台南市',
    projectType: '防水工程',
    budget: 680000,
    estimatedCost: 470000,
    deadline: '2026-07-16',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '校園排水溝、防水層與局部牆面滲漏修繕，適合防水與泥作修繕廠商。',
    fitScore: 84,
    reason: '地點、需求與工程類型明確，案值適中，可優先追蹤。'
  },
  {
    id: 'TDR-006',
    title: '營業所冷氣空調設備汰換',
    agency: '台灣電力股份有限公司',
    agencyType: '公營事業',
    region: '高雄市',
    projectType: '冷氣工程',
    budget: 1250000,
    estimatedCost: 930000,
    deadline: '2026-07-22',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '營業所冷氣主機、室內機與相關管線汰換，適合冷氣空調工程廠商。',
    fitScore: 80,
    reason: '案值佳、需求明確，但需確認設備品牌、保固與投標資格。'
  },
  {
    id: 'TDR-007',
    title: '鄉公所辦公室天花板與照明改善工程',
    agency: '南投縣某鄉公所',
    agencyType: '地方政府',
    region: '南投縣',
    projectType: '裝潢工程',
    budget: 760000,
    estimatedCost: 540000,
    deadline: '2026-07-14',
    source: '政府電子採購網公開標案資料',
    sourceUrl: 'https://web.pcc.gov.tw',
    summary: '辦公室輕鋼架天花板、照明與局部裝修改善，適合裝潢、水電與統包廠商。',
    fitScore: 81,
    reason: '需求明確且可轉成案場估價，適合小型工程團隊評估。'
  }
];

const emptyForm = {
  title: '',
  clientName: '',
  phone: '',
  location: '',
  projectType: '油漆工程',
  sourceType: '手動新增',
  estimatedAmount: '',
  estimatedCost: '',
  nextFollowUpDate: '',
  rawContent: ''
};

function money(n) {
  return `NT$ ${Number(n || 0).toLocaleString('zh-TW')}`;
}

function getStatusLabel(status) {
  return statusOptions.find((item) => item.value === status)?.label || status;
}

function getScoreLevel(score) {
  const value = Number(score || 0);
  if (value >= 80) return { label: '高優先', key: 'high' };
  if (value >= 60) return { label: '可追蹤', key: 'mid' };
  if (value >= 40) return { label: '需補資料', key: 'low' };
  return { label: '低優先', key: 'bad' };
}

function calculateLeadScore(lead) {
  const amount = Number(lead.estimatedAmount || 0);
  const cost = Number(lead.estimatedCost || 0);
  const profit = amount - cost;
  const margin = amount > 0 ? profit / amount : 0;

  let score = 18;
  const reasons = [];

  if (amount >= 2000000) {
    score += 24;
    reasons.push('案值高');
  } else if (amount >= 800000) {
    score += 20;
    reasons.push('案值良好');
  } else if (amount >= 100000) {
    score += 16;
    reasons.push('案值適中');
  } else if (amount > 0) {
    score += 6;
    reasons.push('案值較小');
  }

  if (margin >= 0.35) {
    score += 24;
    reasons.push('毛利率良好');
  } else if (margin >= 0.25) {
    score += 16;
    reasons.push('毛利率可接受');
  } else if (margin >= 0.15) {
    score += 8;
    reasons.push('毛利率偏低');
  } else if (amount > 0) {
    score -= 4;
    reasons.push('毛利率風險高');
  }

  if (String(lead.location || '').trim()) {
    score += 9;
    reasons.push('地點明確');
  }

  if (String(lead.phone || '').trim()) {
    score += 10;
    reasons.push('有聯絡方式');
  }

  if (String(lead.projectType || '').trim()) {
    score += 9;
    reasons.push('工程類型明確');
  }

  if (String(lead.rawContent || '').trim().length >= 20) {
    score += 8;
    reasons.push('需求內容較完整');
  }

  if (lead.sourceType === '政府 / 地方標案') {
    score += 4;
    reasons.push('公開標案資料來源');
  }

  if (lead.nextFollowUpDate) {
    score += 4;
    reasons.push('已有追蹤日期');
  }

  if (['site_visit', 'quoted', 'won'].includes(lead.status)) {
    score += 5;
    reasons.push('已進入成交追蹤階段');
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  const level = getScoreLevel(score);
  const summary = `${lead.location || '未填地點'}｜${lead.projectType || '未填工程類型'}，預估案值 ${money(amount)}，預估毛利 ${money(profit)}，目前狀態為「${getStatusLabel(lead.status)}」。`;

  const reason = reasons.length
    ? `${reasons.join('、')}，系統建議列為「${level.label}」。`
    : '目前資料不足，建議補齊地點、電話、工程類型、預估金額與需求內容後再評估。';

  return { score, summary, reason };
}

function getRiskLevel(score) {
  const value = Number(score || 0);
  if (value >= 80) return 'low';
  if (value < 45) return 'high';
  return 'medium';
}

function normalizeLead(lead) {
  const result = calculateLeadScore({
    ...lead,
    aiScore: lead.aiScore ?? lead.fitScore,
    sourceType: lead.sourceType || lead.source || '手動新增',
    location: lead.location || lead.region || '',
    phone: lead.phone || lead.clientPhone || '',
    rawContent: lead.rawContent || lead.note || ''
  });

  return {
    ...lead,
    clientName: lead.clientName || lead.client_name || '',
    phone: lead.phone || lead.clientPhone || lead.client_phone || '',
    location: lead.location || lead.region || '',
    projectType: lead.projectType || lead.project_type || '',
    sourceType: lead.sourceType || lead.source || '手動新增',
    estimatedAmount: Number(lead.estimatedAmount ?? lead.estimated_amount ?? 0),
    estimatedCost: Number(lead.estimatedCost ?? lead.estimated_cost ?? 0),
    fitScore: Number(lead.fitScore ?? lead.fit_score ?? lead.aiScore ?? result.score),
    aiScore: Number(lead.aiScore ?? lead.fitScore ?? lead.fit_score ?? result.score),
    aiSummary: lead.aiSummary || result.summary,
    aiScoreReason: lead.aiScoreReason || result.reason,
    rawContent: lead.rawContent || lead.note || '',
    nextAction: lead.nextAction || lead.next_action || '',
    tenderId: lead.tenderId || lead.tenderRef || lead.tender_ref || '',
    tenderRef: lead.tenderRef || lead.tender_ref || lead.tenderId || '',
    converted: lead.converted || lead.status === 'converted' || Boolean(lead.convertedJobSiteId)
  };
}

function toPayload(data) {
  const scored = calculateLeadScore(data);

  return {
    title: data.title,
    clientName: data.clientName,
    phone: data.phone,
    sourceType: data.sourceType,
    location: data.location,
    agencyType: data.agencyType || '私人客戶',
    projectType: data.projectType,
    estimatedAmount: Number(data.estimatedAmount || 0),
    estimatedCost: Number(data.estimatedCost || 0),
    expectedMargin: Number(data.estimatedAmount || 0) - Number(data.estimatedCost || 0),
    riskLevel: getRiskLevel(scored.score),
    fitScore: scored.score,
    status: data.status || 'new',
    nextAction: data.nextAction || data.nextFollowUpDate || '',
    rawContent: data.rawContent || '',
    tenderSource: data.tenderSource || '',
    tenderRef: data.tenderRef || data.tenderId || ''
  };
}

export default function LeadCenterMock({ companyId }) {
  const formPanelRef = useRef(null);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editingLeadTitle, setEditingLeadTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');

  const [tenderKeyword, setTenderKeyword] = useState('');
  const [tenderRegion, setTenderRegion] = useState('全部地區');
  const [tenderAgencyType, setTenderAgencyType] = useState('全部機關');
  const [tenderProjectType, setTenderProjectType] = useState('全部工程');

  async function loadLeads() {
    if (!companyId) {
      setLeads([]);
      setLoading(false);
      setError('找不到公司 ID，請重新登入或重新整理頁面。');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const rows = await api(`/companies/${companyId}/leads`);
      setLeads(Array.isArray(rows) ? rows.map(normalizeLead) : []);
    } catch (err) {
      setError(err.message || '讀取案源失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads();
  }, [companyId]);

  const stats = useMemo(() => {
    const total = leads.length;
    const highScore = leads.filter((lead) => Number(lead.aiScore || 0) >= 80).length;
    const quoted = leads.filter((lead) => ['site_visit', 'quoted'].includes(lead.status)).length;
    const converted = leads.filter((lead) => lead.status === 'converted' || lead.converted).length;
    const tenderCount = leads.filter((lead) => lead.sourceType === '政府 / 地方標案').length;
    const totalAmount = leads.reduce((sum, lead) => sum + Number(lead.estimatedAmount || 0), 0);
    const totalProfit = leads.reduce(
      (sum, lead) => sum + (Number(lead.estimatedAmount || 0) - Number(lead.estimatedCost || 0)),
      0
    );
    const conversionRate = total ? Math.round((converted / total) * 1000) / 10 : 0;

    return { total, highScore, quoted, converted, tenderCount, totalAmount, totalProfit, conversionRate };
  }, [leads]);

  const filteredTenders = useMemo(() => {
    const q = tenderKeyword.trim().toLowerCase();

    return tenderRadarItems.filter((item) => {
      const text = [item.title, item.agency, item.region, item.projectType, item.summary].join(' ').toLowerCase();

      const keywordMatched = !q || text.includes(q);
      const regionMatched = tenderRegion === '全部地區' || item.region === tenderRegion || item.region.includes(tenderRegion);
      const agencyMatched = tenderAgencyType === '全部機關' || item.agencyType === tenderAgencyType;
      const projectMatched = tenderProjectType === '全部工程' || item.projectType === tenderProjectType;

      return keywordMatched && regionMatched && agencyMatched && projectMatched;
    });
  }, [tenderKeyword, tenderRegion, tenderAgencyType, tenderProjectType]);

  const filteredLeads = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return leads.filter((lead) => {
      const level = getScoreLevel(lead.aiScore).key;
      const text = [
        lead.title,
        lead.clientName,
        lead.phone,
        lead.location,
        lead.projectType,
        lead.sourceType,
        lead.rawContent
      ].join(' ').toLowerCase();

      const matchKeyword = !q || text.includes(q);
      const matchStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchScore = scoreFilter === 'all' || level === scoreFilter;

      return matchKeyword && matchStatus && matchScore;
    });
  }, [leads, keyword, statusFilter, scoreFilter]);

  function updateForm(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function addLead() {
    if (!form.title.trim()) {
      window.alert('請先輸入案源名稱');
      return;
    }

    const payload = toPayload({
      ...form,
      status: editingId ? form.status : 'new'
    });

    try {
      setSaving(true);
      setError('');

      if (editingId) {
        const updated = await api(`/companies/${companyId}/leads/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        setLeads((old) => old.map((lead) => (lead.id === editingId ? normalizeLead(updated) : lead)));
      } else {
        const created = await api(`/companies/${companyId}/leads`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setLeads((old) => [normalizeLead(created), ...old]);
      }

      setEditingId(null);
      setEditingLeadTitle('');
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || '儲存案源失敗');
    } finally {
      setSaving(false);
    }
  }

  async function importTenderToLeads(tender) {
    const exists = leads.some((lead) => lead.tenderId === tender.id || lead.tenderRef === tender.id);

    if (exists) {
      window.alert('這筆標案已經匯入接案中心。');
      return;
    }

    const payload = toPayload({
      tenderId: tender.id,
      tenderRef: tender.id,
      title: tender.title,
      clientName: tender.agency,
      phone: '',
      location: tender.region,
      projectType: tender.projectType,
      sourceType: '政府 / 地方標案',
      agencyType: tender.agencyType,
      estimatedAmount: tender.budget,
      estimatedCost: tender.estimatedCost,
      nextAction: `投標截止日：${tender.deadline}`,
      rawContent: `${tender.summary}\n\n機關：${tender.agency}\n機關類型：${tender.agencyType}\n地區：${tender.region}\n預算：${money(tender.budget)}\n投標截止日：${tender.deadline}\n資料來源：${tender.source}`,
      tenderSource: tender.source,
      status: 'new',
      fitScore: tender.fitScore
    });

    payload.fitScore = Math.max(payload.fitScore, tender.fitScore);
    payload.riskLevel = getRiskLevel(payload.fitScore);

    try {
      setSaving(true);
      setError('');
      const created = await api(`/companies/${companyId}/leads`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setLeads((old) => [normalizeLead(created), ...old]);
      window.alert('已匯入接案中心，可繼續追蹤與轉案場。');
    } catch (err) {
      setError(err.message || '匯入標案失敗');
    } finally {
      setSaving(false);
    }
  }

  async function scoreLead(id) {
    const lead = leads.find((item) => item.id === id);
    if (!lead) return;

    const result = calculateLeadScore(lead);

    try {
      const updated = await api(`/companies/${companyId}/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...toPayload(lead),
          fitScore: result.score,
          riskLevel: getRiskLevel(result.score)
        })
      });
      setLeads((old) => old.map((item) => (item.id === id ? normalizeLead(updated) : item)));
    } catch (err) {
      setError(err.message || '重新評分失敗');
    }
  }

  async function changeStatus(id, status) {
    const lead = leads.find((item) => item.id === id);
    if (!lead) return;

    try {
      const updated = await api(`/companies/${companyId}/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...toPayload({ ...lead, status }),
          status
        })
      });
      setLeads((old) => old.map((item) => (item.id === id ? normalizeLead(updated) : item)));
    } catch (err) {
      setError(err.message || '更新案源狀態失敗');
    }
  }

  async function convertLead(id) {
    try {
      setError('');
      const result = await api(`/companies/${companyId}/leads/${id}/convert-to-jobsite`, {
        method: 'POST'
      });
      setLeads((old) => old.map((lead) => (lead.id === id ? normalizeLead(result.lead) : lead)));
      window.alert('已轉成案場，可到案場工作台查看。');
    } catch (err) {
      setError(err.message || '轉成案場失敗');
    }
  }

  async function deleteLead(id) {
    if (!window.confirm('確定要刪除此案源嗎？')) return;

    try {
      setError('');
      await api(`/companies/${companyId}/leads/${id}`, {
        method: 'DELETE'
      });
      setLeads((old) => old.filter((lead) => lead.id !== id));
    } catch (err) {
      setError(err.message || '刪除案源失敗');
    }
  }

  function editLead(lead) {
    setEditingId(lead.id);
    setEditingLeadTitle(lead.title || '未命名案源');
    setForm({
      title: lead.title || '',
      clientName: lead.clientName || '',
      phone: lead.phone || '',
      location: lead.location || '',
      projectType: lead.projectType || '油漆工程',
      sourceType: lead.sourceType || '手動新增',
      estimatedAmount: lead.estimatedAmount || '',
      estimatedCost: lead.estimatedCost || '',
      nextFollowUpDate: lead.nextAction || '',
      rawContent: lead.rawContent || '',
      status: lead.status || 'new'
    });

    requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingLeadTitle('');
    setForm(emptyForm);
  }

  return (
    <section className="lead-page">
      <div className="lead-hero">
        <div>
          <div className="lead-kicker">正式資料庫版</div>
          <h1>BookAI 接案中心</h1>
          <p>集中管理潛在案源，新增政府 / 地方標案雷達，涵蓋中央部會、地方政府、交通局、工務局、公營事業與學校機關。</p>
        </div>

        <button type="button" className="lead-soft-btn" onClick={loadLeads}>
          重新整理案源
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="notice">正在讀取接案中心資料...</div>}

      <div className="lead-stats-grid">
        <div className="lead-stat-card">
          <span>總案源</span>
          <strong>{stats.total}</strong>
          <small>目前追蹤中的案源</small>
        </div>
        <div className="lead-stat-card">
          <span>政府標案</span>
          <strong>{stats.tenderCount}</strong>
          <small>已匯入的公開標案</small>
        </div>
        <div className="lead-stat-card">
          <span>高分案源</span>
          <strong>{stats.highScore}</strong>
          <small>系統評估分數 80 以上</small>
        </div>
        <div className="lead-stat-card">
          <span>已轉案場</span>
          <strong>{stats.converted}</strong>
          <small>轉換率 {stats.conversionRate}%</small>
        </div>
        <div className="lead-stat-card wide">
          <span>預估總案值</span>
          <strong>{money(stats.totalAmount)}</strong>
          <small>所有案源預估金額</small>
        </div>
        <div className="lead-stat-card wide">
          <span>預估總毛利</span>
          <strong>{money(stats.totalProfit)}</strong>
          <small>預估金額 - 預估成本</small>
        </div>
      </div>

      <div className="lead-panel tender-panel">
        <div className="lead-panel-head">
          <h2>政府 / 地方標案雷達 Beta</h2>
          <p>
            先以公開標案格式資料展示中央與地方案源，下一階段可正式串接政府電子採購網或開放資料 API。
            此區塊適合用來吸引工程業測試者：找案、評估、匯入、追蹤、轉案場。
          </p>
        </div>

        <div className="tender-source-note">
          資料來源方向：政府電子採購網公開標案資料。正式商用前需確認開放資料授權、欄位格式、快取與 API 穩定性。
        </div>

        <div className="tender-toolbar">
          <input
            value={tenderKeyword}
            onChange={(e) => setTenderKeyword(e.target.value)}
            placeholder="搜尋標案、機關、地區、工程類型"
          />

          <select value={tenderRegion} onChange={(e) => setTenderRegion(e.target.value)}>
            {regions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          <select value={tenderAgencyType} onChange={(e) => setTenderAgencyType(e.target.value)}>
            {agencyTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          <select value={tenderProjectType} onChange={(e) => setTenderProjectType(e.target.value)}>
            <option value="全部工程">全部工程</option>
            {projectTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="tender-grid">
          {filteredTenders.map((tender) => {
            const level = getScoreLevel(tender.fitScore);
            const imported = leads.some((lead) => lead.tenderId === tender.id || lead.tenderRef === tender.id);

            return (
              <article className="tender-card" key={tender.id}>
                <div className="tender-card-head">
                  <div>
                    <span className="tender-tag">{tender.agencyType}</span>
                    <h3>{tender.title}</h3>
                    <p>{tender.agency}</p>
                  </div>

                  <div className={`lead-score-badge ${level.key}`}>
                    <strong>{tender.fitScore}</strong>
                    <span>{level.label}</span>
                  </div>
                </div>

                <div className="tender-meta">
                  <span>{tender.region}</span>
                  <span>{tender.projectType}</span>
                  <span>截止：{tender.deadline}</span>
                </div>

                <div className="lead-money-grid">
                  <div>
                    <span>預算金額</span>
                    <strong>{money(tender.budget)}</strong>
                  </div>
                  <div>
                    <span>預估成本</span>
                    <strong>{money(tender.estimatedCost)}</strong>
                  </div>
                  <div>
                    <span>預估毛利</span>
                    <strong>{money(tender.budget - tender.estimatedCost)}</strong>
                  </div>
                  <div>
                    <span>來源</span>
                    <strong>公開標案</strong>
                  </div>
                </div>

                <div className="lead-ai-box">
                  <strong>標案摘要</strong>
                  <p>{tender.summary}</p>
                  <strong>系統適合度理由</strong>
                  <p>{tender.reason}</p>
                </div>

                <div className="tender-actions">
                  <button
                    type="button"
                    className="lead-primary-btn"
                    disabled={imported || saving}
                    onClick={() => importTenderToLeads(tender)}
                  >
                    {imported ? '已匯入接案中心' : '匯入接案中心'}
                  </button>

                  <a href={tender.sourceUrl} target="_blank" rel="noreferrer">
                    前往資料來源
                  </a>
                </div>
              </article>
            );
          })}

          {filteredTenders.length === 0 && (
            <div className="lead-empty">
              目前沒有符合條件的標案，可調整地區、機關類型或工程類型。
            </div>
          )}
        </div>
      </div>

      <div className="lead-layout">
        <div className="lead-panel lead-form-panel" ref={formPanelRef}>
          <div className="lead-panel-head">
            <h2>{editingId ? '編輯案源' : '新增案源'}</h2>
            <p>{editingId ? `正在編輯：${editingLeadTitle || form.title || '未命名案源'}` : '可以貼上 LINE 詢價、朋友介紹、網站詢問或標案摘要。'}</p>
          </div>

          {editingId && (
            <div className="notice">
              目前正在編輯既有案源。修改完成後請按「儲存案源」，或按「取消編輯」回到新增模式。
            </div>
          )}

          <div className="lead-form-grid">
            <label>
              <span>案源名稱</span>
              <input value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="例：南屯舊屋油漆案" />
            </label>

            <label>
              <span>客戶 / 業主</span>
              <input value={form.clientName} onChange={(e) => updateForm('clientName', e.target.value)} placeholder="例：陳先生 / 某機關" />
            </label>

            <label>
              <span>電話</span>
              <input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} placeholder="例：0912-345-678" />
            </label>

            <label>
              <span>地點</span>
              <input value={form.location} onChange={(e) => updateForm('location', e.target.value)} placeholder="例：台中市南屯區" />
            </label>

            <label>
              <span>工程類型</span>
              <select value={form.projectType} onChange={(e) => updateForm('projectType', e.target.value)}>
                {projectTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span>案源來源</span>
              <select value={form.sourceType} onChange={(e) => updateForm('sourceType', e.target.value)}>
                {sourceTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span>預估金額</span>
              <input type="number" value={form.estimatedAmount} onChange={(e) => updateForm('estimatedAmount', e.target.value)} placeholder="例：120000" />
            </label>

            <label>
              <span>預估成本</span>
              <input type="number" value={form.estimatedCost} onChange={(e) => updateForm('estimatedCost', e.target.value)} placeholder="例：78000" />
            </label>

            <label>
              <span>下次追蹤日</span>
              <input type="date" value={form.nextFollowUpDate} onChange={(e) => updateForm('nextFollowUpDate', e.target.value)} />
            </label>
          </div>

          <label className="lead-full-field">
            <span>原始內容 / 備註</span>
            <textarea
              value={form.rawContent}
              onChange={(e) => updateForm('rawContent', e.target.value)}
              rows={4}
              placeholder="可以貼上客戶詢價內容、LINE 訊息、標案摘要或備註。"
            />
          </label>

          <button type="button" className="lead-primary-btn lead-sticky-cta" onClick={addLead} disabled={saving}>
            {saving ? '儲存中...' : editingId ? '儲存案源' : '新增案源並系統評估'}
          </button>

          {editingId && (
            <button type="button" className="lead-soft-btn" onClick={cancelEdit}>
              取消編輯
            </button>
          )}
        </div>

        <div className="lead-panel">
          <div className="lead-panel-head">
            <h2>案源追蹤</h2>
            <p>先看高分案源，再追報價與等待回覆的案子。</p>
          </div>

          <div className="lead-toolbar">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋案源、客戶、電話、地點、工程類型"
            />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">全部狀態</option>
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
              <option value="all">全部分數</option>
              <option value="high">高優先</option>
              <option value="mid">可追蹤</option>
              <option value="low">需補資料</option>
              <option value="bad">低優先</option>
            </select>
          </div>

          <div className="lead-list">
            {filteredLeads.length === 0 && (
              <div className="lead-empty">
                目前沒有符合條件的案源。可以清除搜尋或新增一筆案源；正式資料會儲存在 SQLite。
              </div>
            )}

            {filteredLeads.map((lead) => {
              const amount = Number(lead.estimatedAmount || 0);
              const cost = Number(lead.estimatedCost || 0);
              const profit = amount - cost;
              const margin = amount > 0 ? Math.round((profit / amount) * 1000) / 10 : 0;
              const level = getScoreLevel(lead.aiScore);

              return (
                <article className="lead-card" key={lead.id}>
                  <div className="lead-card-top">
                    <div>
                      <h3>{lead.title}</h3>
                      <p>{lead.location || '未填地點'}｜{lead.projectType || '未填工程類型'}｜{lead.sourceType}</p>
                    </div>

                    <div className={`lead-score-badge ${level.key}`}>
                      <strong>{lead.aiScore || 0}</strong>
                      <span>{level.label}</span>
                    </div>
                  </div>

                  <div className="lead-meta-row">
                    <span>{lead.clientName || '未填客戶'}</span>
                    <span>{lead.phone || '未填電話'}</span>
                    <span>{getStatusLabel(lead.status)}</span>
                    <span>{lead.nextFollowUpDate ? `追蹤：${lead.nextFollowUpDate}` : '未設追蹤日'}</span>
                  </div>

                  <div className="lead-money-grid">
                    <div>
                      <span>預估金額</span>
                      <strong>{money(amount)}</strong>
                    </div>
                    <div>
                      <span>預估成本</span>
                      <strong>{money(cost)}</strong>
                    </div>
                    <div>
                      <span>預估毛利</span>
                      <strong>{money(profit)}</strong>
                    </div>
                    <div>
                      <span>毛利率</span>
                      <strong>{margin}%</strong>
                    </div>
                  </div>

                  <div className="lead-ai-box">
                    <strong>系統摘要</strong>
                    <p>{lead.aiSummary || '尚未產生系統摘要'}</p>
                    <strong>系統評分理由</strong>
                    <p>{lead.aiScoreReason || '尚未評分'}</p>
                  </div>

                  <div className="lead-actions">
                    <select value={lead.status} onChange={(e) => changeStatus(lead.id, e.target.value)}>
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>

                    <button type="button" onClick={() => scoreLead(lead.id)}>重新評分</button>
                    <button type="button" onClick={() => editLead(lead)}>編輯</button>
                    <button type="button" onClick={() => changeStatus(lead.id, 'contacted')}>已聯絡</button>
                    <button type="button" onClick={() => changeStatus(lead.id, 'quoted')}>已報價</button>

                    <button
                      type="button"
                      className="lead-primary-btn"
                      disabled={lead.converted}
                      onClick={() => convertLead(lead.id)}
                    >
                      {lead.converted ? '已轉案場' : '一鍵轉案場'}
                    </button>

                    <button type="button" className="lead-danger-btn" onClick={() => deleteLead(lead.id)}>
                      刪除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
