const DEFAULT_DISCLAIMER = 'AI 內容僅供輔助判斷，請以實際資料與人工確認為準。';
const MAX_INPUT_LENGTH = 2000;

export const AI_USE_CASES = {
  engineering_estimate_draft: {
    label: '工程估價草稿',
    purpose: '依使用者提供的工程描述整理估價草稿、工項與風險提醒。',
    disclaimer: DEFAULT_DISCLAIMER
  },
  tender_summary: {
    label: '標案摘要',
    purpose: '整理標案重點、期限、資格條件與追蹤建議。',
    disclaimer: DEFAULT_DISCLAIMER
  },
  cms_copy_draft: {
    label: '官網文案草稿',
    purpose: '產生品牌官網 Banner、首頁區塊、FAQ 與 SEO 文案草稿。',
    disclaimer: DEFAULT_DISCLAIMER
  },
  commerce_product_copy: {
    label: '商品文案草稿',
    purpose: '產生商品標題、賣點、描述、FAQ 與社群文案草稿。',
    disclaimer: DEFAULT_DISCLAIMER
  },
  business_summary: {
    label: '經營摘要',
    purpose: '整理營運摘要、風險、優先事項與下一步行動。',
    disclaimer: DEFAULT_DISCLAIMER
  }
};

export function getAiConfig(env = process.env) {
  return {
    enabled: String(env.AI_ENABLED || 'false').toLowerCase() === 'true',
    provider: String(env.AI_PROVIDER || 'mock').trim().toLowerCase() || 'mock',
    safetyMode: String(env.AI_SAFETY_MODE || 'strict').trim().toLowerCase() || 'strict',
    ollamaBaseUrl: String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim()
  };
}

export function getUseCase(useCase) {
  return AI_USE_CASES[String(useCase || '').trim()] || null;
}

export function sanitizeAiInput(input = {}) {
  const rawText = safeText(input.text || input.prompt || input.description || '');
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_INPUT_LENGTH);

  const masked = normalized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, maskEmail)
    .replace(/(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, maskPhone)
    .replace(/(?:\(?0\d{1,2}\)?[-\s]?)?\d{3,4}[-\s]?\d{4}/g, maskPhone)
    .replace(/([^\s,，。]{2,}(?:路|街|巷|弄|段)\s*\d+\s*號?)[^\s,，。]*/g, '$1[地址細節已遮蔽]');

  return {
    text: masked,
    originalLength: rawText.length,
    sanitizedLength: masked.length,
    truncated: rawText.length > MAX_INPUT_LENGTH
  };
}

function safeText(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(safeText).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${safeText(item)}`)
      .join('\n');
  }
  return String(value);
}

function maskEmail(value) {
  const [name, domain] = String(value).split('@');
  if (!domain) return '[email已遮蔽]';
  return `${name.slice(0, 2)}***@${domain.replace(/^[^.]+/, '***')}`;
}

function maskPhone(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 6) return '[電話已遮蔽]';
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

export async function generateAiDraft({ useCase, input = {}, company = {}, user = {} } = {}) {
  const config = getAiConfig();
  const useCaseConfig = getUseCase(useCase);
  if (!useCaseConfig) {
    const error = new Error('不支援的 AI use case');
    error.status = 400;
    error.code = 'AI_USE_CASE_NOT_ALLOWED';
    throw error;
  }

  const sanitized = sanitizeAiInput(input);
  if (!config.enabled) {
    return buildResponse({
      ok: false,
      provider: 'disabled',
      useCase,
      useCaseConfig,
      sanitized,
      draft: disabledDraft(useCaseConfig),
      status: 'disabled'
    });
  }

  if (config.provider === 'mock') {
    return buildResponse({
      ok: true,
      provider: 'mock',
      useCase,
      useCaseConfig,
      sanitized,
      draft: mockDraft(useCase, sanitized.text),
      status: 'ok'
    });
  }

  if (config.provider === 'ollama') {
    return runOllamaSkeleton({ config, useCase, useCaseConfig, sanitized, company, user });
  }

  if (config.provider === 'external') {
    const error = new Error('External AI provider 尚未啟用，請改用 mock provider 或完成安全 provider 設定。');
    error.status = 503;
    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    throw error;
  }

  const error = new Error('AI_PROVIDER 設定不受支援');
  error.status = 400;
  error.code = 'AI_PROVIDER_NOT_ALLOWED';
  throw error;
}

function buildResponse({ ok, provider, useCase, useCaseConfig, sanitized, draft, status }) {
  return {
    ok,
    provider,
    mode: provider,
    status,
    useCase,
    purpose: useCaseConfig.purpose,
    disclaimer: useCaseConfig.disclaimer,
    inputLength: sanitized.originalLength,
    sanitizedInputLength: sanitized.sanitizedLength,
    draft: normalizeDraft(draft),
    createdAt: new Date().toISOString()
  };
}

function disabledDraft(useCaseConfig) {
  return {
    title: 'AI 草稿助手目前未啟用',
    summary: `此環境已關閉 AI 功能。${useCaseConfig.purpose}`,
    items: [],
    warnings: ['AI_ENABLED 不是 true，因此未呼叫任何 provider，也未產生正式資料。'],
    nextSteps: ['需要測試 mock 草稿時，請在安全環境設定 AI_ENABLED=true 並使用 AI_PROVIDER=mock。']
  };
}

async function runOllamaSkeleton({ config, useCase, useCaseConfig, sanitized }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${config.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.1',
        prompt: [
          useCaseConfig.purpose,
          '只回傳草稿、建議、摘要，不得要求自動寫入正式資料。',
          sanitized.text
        ].join('\n\n'),
        stream: false
      }),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Ollama responded ${response.status}`);
    const data = await response.json().catch(() => ({}));
    return buildResponse({
      ok: true,
      provider: 'ollama',
      useCase,
      useCaseConfig,
      sanitized,
      draft: {
        title: `${useCaseConfig.label}（Ollama skeleton）`,
        summary: safeText(data.response || '').slice(0, 1200) || 'Ollama 回傳空內容。',
        items: [],
        warnings: ['此為 provider layer skeleton，正式上線前仍需安全審查與輸出格式驗證。'],
        nextSteps: ['人工檢查草稿內容後，再手動套用到表單。']
      },
      status: 'ok'
    });
  } catch (error) {
    const providerError = new Error('Ollama provider 目前不可用，系統未寫入任何資料。');
    providerError.status = 503;
    providerError.code = 'AI_PROVIDER_UNAVAILABLE';
    providerError.cause = error;
    throw providerError;
  } finally {
    clearTimeout(timer);
  }
}

function mockDraft(useCase, text) {
  const context = text || '未提供具體內容';
  const commonWarnings = ['此內容為 AI 草稿，不能直接視為正式報價、請款、收款或發布內容。'];

  const drafts = {
    engineering_estimate_draft: {
      title: '工程估價草稿',
      summary: `依輸入內容整理初步工程範圍：${context}`,
      items: [
        { name: '現場丈量與需求確認', quantity: 1, unit: '式', note: '確認坪數、樓層、施工限制與保護範圍。' },
        { name: '主要施工工項', quantity: '待確認', unit: '坪/式', note: '依實際材質、工法與數量拆分。' },
        { name: '材料與耗材', quantity: '待確認', unit: '批', note: '建議保留品牌、規格與替代品欄位。' }
      ],
      warnings: [...commonWarnings, '樓層、搬運、夜間施工、保護工程與追加項目可能影響成本。'],
      nextSteps: ['安排現場勘查', '補齊尺寸與照片', '由負責人確認單價與毛利後再建立正式報價']
    },
    tender_summary: {
      title: '標案摘要草稿',
      summary: `標案重點初稿：${context}`,
      items: [
        '整理招標機關、履約地點、預算、截止日與押標金資訊。',
        '檢查資格條件、實績限制、文件格式與投標方式。',
        '建議列入追蹤清單，並指派負責人複核。'
      ],
      warnings: [...commonWarnings, '截止時間、資格條件與附件版本需以政府採購公告原文為準。'],
      nextSteps: ['人工核對公告連結', '確認是否符合資格', '建立內部追蹤提醒']
    },
    cms_copy_draft: {
      title: '官網文案草稿',
      summary: `依品牌資料產生官網草稿：${context}`,
      items: [
        { section: 'Banner 標題', text: '讓專業服務被看見，讓客戶快速理解你的價值' },
        { section: '首頁區塊', text: '從需求確認、流程管理到售後追蹤，建立清楚可信的服務體驗。' },
        { section: 'FAQ', text: '服務流程如何開始？請先提供需求、照片或現場資訊，我們會安排初步評估。' },
        { section: 'SEO 描述', text: '提供專業服務、案例展示與需求諮詢，協助客戶快速找到合適解決方案。' }
      ],
      warnings: [...commonWarnings, '發布官網前需人工確認品牌語氣、法規聲明與聯絡資訊。'],
      nextSteps: ['由品牌負責人審稿', '補上真實案例與圖片', '確認後再手動貼到 CMS']
    },
    commerce_product_copy: {
      title: '商品文案草稿',
      summary: `依商品資料產生文案草稿：${context}`,
      items: [
        { section: '商品標題', text: '實用耐用的精選商品，適合日常與專業場景' },
        { section: '商品賣點', text: '清楚規格、穩定品質、容易搭配既有使用流程。' },
        { section: '商品描述', text: '以實際規格與使用情境為主，協助買家快速理解差異。' },
        { section: 'FAQ', text: '下單前請確認尺寸、材質、庫存與配送範圍。' },
        { section: '社群文案', text: '把常用需求一次準備好，今天就更新你的採購清單。' }
      ],
      warnings: [...commonWarnings, '商品價格、庫存、保固與配送條件需人工確認。'],
      nextSteps: ['補上實際規格', '確認庫存與售價', '人工審核後再上架']
    },
    business_summary: {
      title: '經營摘要草稿',
      summary: `營運摘要初稿：${context}`,
      items: [
        '本月應優先檢查營收、毛利、未收款與高風險案件。',
        '將逾期應收、低毛利工項與庫存異常列為追蹤清單。',
        '每週檢視待辦負責人與完成狀態。'
      ],
      warnings: [...commonWarnings, '經營判斷需以系統正式報表與會計資料為準。'],
      nextSteps: ['核對正式報表', '確認前三項優先處理事項', '安排負責人與期限']
    }
  };

  return drafts[useCase] || {
    title: 'AI 草稿',
    summary: context,
    items: [],
    warnings: commonWarnings,
    nextSteps: ['人工確認後再使用']
  };
}

function normalizeDraft(draft) {
  const value = draft && typeof draft === 'object' ? draft : {};
  return {
    title: safeText(value.title || 'AI 草稿').slice(0, 200),
    summary: safeText(value.summary || '').slice(0, 2000),
    items: Array.isArray(value.items) ? value.items.map(normalizeDraftItem) : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map((item) => safeText(item)).filter(Boolean) : [],
    nextSteps: Array.isArray(value.nextSteps) ? value.nextSteps.map((item) => safeText(item)).filter(Boolean) : []
  };
}

function normalizeDraftItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, safeText(value).slice(0, 500)])
    );
  }
  return safeText(item).slice(0, 500);
}
