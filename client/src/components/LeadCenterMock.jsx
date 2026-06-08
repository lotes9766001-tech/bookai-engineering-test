import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'bookai_lead_center_mock_v4_0';

const statusOptions = [
  { value: 'new', label: '新案源' },
  { value: 'reviewing', label: '評估中' },
  { value: 'contacted', label: '已聯絡' },
  { value: 'quoted', label: '已報價' },
  { value: 'waiting', label: '等待回覆' },
  { value: 'won', label: '已成交' },
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
  '統包工程',
  '其他'
];

const sourceTypes = [
  '手動新增',
  '朋友介紹',
  'LINE 詢價',
  '官方網站詢價',
  '政府標案',
  '社群平台',
  '舊客戶回購',
  '其他'
];

const defaultLeads = [
  {
    id: 1,
    title: '南屯舊屋油漆與壁癌處理',
    clientName: '陳先生',
    phone: '0912-345-678',
    location: '台中市南屯區',
    projectType: '油漆工程',
    sourceType: 'LINE 詢價',
    estimatedAmount: 120000,
    estimatedCost: 78000,
    rawContent: '客戶家中約 25 坪舊屋要重新油漆，牆面有壁癌，希望下週可以現場估價。',
    aiSummary: '台中南屯舊屋油漆案，約 25 坪，包含牆面重新油漆與壁癌處理，客戶希望下週安排現場估價。',
    aiScore: 88,
    aiScoreReason: '地點、工程類型、需求與聯絡方式完整，預估毛利率良好，建議優先聯絡。',
    status: 'new',
    nextFollowUpDate: '',
    converted: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    title: '北屯套房水電修繕',
    clientName: '林小姐',
    phone: '',
    location: '台中市北屯區',
    projectType: '水電工程',
    sourceType: '朋友介紹',
    estimatedAmount: 35000,
    estimatedCost: 24000,
    rawContent: '套房水電有幾處需要修，細節還不清楚。',
    aiSummary: '北屯套房水電修繕案，目前需求描述較少，需補齊施工範圍與聯絡方式。',
    aiScore: 54,
    aiScoreReason: '工程類型與地點明確，但缺少聯絡電話與詳細施工內容，建議先補資料。',
    status: 'reviewing',
    nextFollowUpDate: '',
    converted: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 3,
    title: '宜蘭民宿冷氣安裝案',
    clientName: '張老闆',
    phone: '0988-123-456',
    location: '宜蘭縣五結鄉',
    projectType: '冷氣工程',
    sourceType: '官方網站詢價',
    estimatedAmount: 260000,
    estimatedCost: 185000,
    rawContent: '民宿需要安裝多台冷氣，想先估價，可能分兩階段施工。',
    aiSummary: '宜蘭民宿冷氣安裝案，客戶需求明確，案值較高，可能分階段施工。',
    aiScore: 82,
    aiScoreReason: '案值較高、聯絡資訊完整、需求清楚，建議優先安排現場評估。',
    status: 'contacted',
    nextFollowUpDate: '',
    converted: false,
    createdAt: new Date().toISOString()
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

  if (amount >= 200000) {
    score += 22;
    reasons.push('案值高');
  } else if (amount >= 100000) {
    score += 18;
    reasons.push('案值良好');
  } else if (amount >= 50000) {
    score += 12;
    reasons.push('案值中等');
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

  if (lead.nextFollowUpDate) {
    score += 4;
    reasons.push('已有追蹤日期');
  }

  if (['quoted', 'waiting', 'won'].includes(lead.status)) {
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

function safeLoadLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLeads;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultLeads;
  } catch {
    return defaultLeads;
  }
}

export default function LeadCenterMock() {
  const [leads, setLeads] = useState(safeLoadLeads);
  const [form, setForm] = useState(emptyForm);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
  }, [leads]);

  const stats = useMemo(() => {
    const total = leads.length;
    const highScore = leads.filter((lead) => Number(lead.aiScore || 0) >= 80).length;
    const quoted = leads.filter((lead) => ['quoted', 'waiting'].includes(lead.status)).length;
    const converted = leads.filter((lead) => lead.status === 'converted' || lead.converted).length;
    const totalAmount = leads.reduce((sum, lead) => sum + Number(lead.estimatedAmount || 0), 0);
    const totalProfit = leads.reduce(
      (sum, lead) => sum + (Number(lead.estimatedAmount || 0) - Number(lead.estimatedCost || 0)),
      0
    );
    const conversionRate = total ? Math.round((converted / total) * 1000) / 10 : 0;

    return { total, highScore, quoted, converted, totalAmount, totalProfit, conversionRate };
  }, [leads]);

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

  function addLead() {
    if (!form.title.trim()) {
      window.alert('請先輸入案源名稱');
      return;
    }

    const baseLead = {
      id: Date.now(),
      ...form,
      estimatedAmount: Number(form.estimatedAmount || 0),
      estimatedCost: Number(form.estimatedCost || 0),
      status: 'new',
      converted: false,
      createdAt: new Date().toISOString()
    };

    const result = calculateLeadScore(baseLead);

    setLeads((old) => [
      {
        ...baseLead,
        aiSummary: result.summary,
        aiScore: result.score,
        aiScoreReason: result.reason
      },
      ...old
    ]);

    setForm(emptyForm);
  }

  function scoreLead(id) {
    setLeads((old) =>
      old.map((lead) => {
        if (lead.id !== id) return lead;
        const result = calculateLeadScore(lead);
        return {
          ...lead,
          aiSummary: result.summary,
          aiScore: result.score,
          aiScoreReason: result.reason
        };
      })
    );
  }

  function changeStatus(id, status) {
    setLeads((old) =>
      old.map((lead) => {
        if (lead.id !== id) return lead;
        const next = { ...lead, status };
        const result = calculateLeadScore(next);
        return {
          ...next,
          aiSummary: result.summary,
          aiScore: result.score,
          aiScoreReason: result.reason
        };
      })
    );
  }

  function convertLead(id) {
    setLeads((old) =>
      old.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              status: 'converted',
              converted: true,
              aiScoreReason: `${lead.aiScoreReason || ''} 此案源已模擬轉成正式案場。正式版會同步新增到案場工作台。`
            }
          : lead
      )
    );

    window.alert('已模擬轉成案場。正式版會同步新增到案場工作台。');
  }

  function deleteLead(id) {
    if (!window.confirm('確定要刪除此案源嗎？')) return;
    setLeads((old) => old.filter((lead) => lead.id !== id));
  }

  function resetMockData() {
    if (!window.confirm('要重置接案中心 Mock 資料嗎？')) return;
    setLeads(defaultLeads);
    setKeyword('');
    setStatusFilter('all');
    setScoreFilter('all');
  }

  return (
    <section className="lead-page">
      <div className="lead-hero">
        <div>
          <div className="lead-kicker">v4.0 Mock Plus</div>
          <h1>BookAI 接案中心</h1>
          <p>集中管理潛在案源，AI 協助摘要、評分、追蹤，成交後一鍵轉成正式案場。</p>
        </div>

        <button type="button" className="lead-soft-btn" onClick={resetMockData}>
          重置模擬資料
        </button>
      </div>

      <div className="lead-stats-grid">
        <div className="lead-stat-card">
          <span>總案源</span>
          <strong>{stats.total}</strong>
          <small>目前追蹤中的案源</small>
        </div>
        <div className="lead-stat-card">
          <span>高分案源</span>
          <strong>{stats.highScore}</strong>
          <small>AI 分數 80 以上</small>
        </div>
        <div className="lead-stat-card">
          <span>已報價 / 等待</span>
          <strong>{stats.quoted}</strong>
          <small>進入成交追蹤</small>
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

      <div className="lead-layout">
        <div className="lead-panel lead-form-panel">
          <div className="lead-panel-head">
            <h2>新增案源</h2>
            <p>可以貼上 LINE 詢價、朋友介紹、網站詢問或標案摘要。</p>
          </div>

          <div className="lead-form-grid">
            <label>
              <span>案源名稱</span>
              <input value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="例：南屯舊屋油漆案" />
            </label>

            <label>
              <span>客戶 / 業主</span>
              <input value={form.clientName} onChange={(e) => updateForm('clientName', e.target.value)} placeholder="例：陳先生" />
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

          <button type="button" className="lead-primary-btn lead-sticky-cta" onClick={addLead}>
            新增案源並 AI 評分
          </button>
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
                目前沒有符合條件的案源。可以清除搜尋或新增一筆案源。
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
                    <strong>AI 摘要</strong>
                    <p>{lead.aiSummary || '尚未產生 AI 摘要'}</p>
                    <strong>AI 評分理由</strong>
                    <p>{lead.aiScoreReason || '尚未評分'}</p>
                  </div>

                  <div className="lead-actions">
                    <select value={lead.status} onChange={(e) => changeStatus(lead.id, e.target.value)}>
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>

                    <button type="button" onClick={() => scoreLead(lead.id)}>重新評分</button>
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
