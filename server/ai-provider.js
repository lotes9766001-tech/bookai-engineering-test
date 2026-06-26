const DEFAULT_DISCLAIMER = 'AI 內容僅供輔助判斷，請以實際資料與人工確認為準。';
const MAX_INPUT_LENGTH = 2000;
const DEFAULT_OLLAMA_MODEL = 'llama3.2:1b';
const DEFAULT_AI_TIMEOUT_MS = 20000;
const MAX_SUMMARY_LENGTH = 700;
const MAX_ITEM_LENGTH = 420;

const USE_CASE_TITLES = {
  engineering_estimate_draft: '工程估價草稿',
  tender_summary: '標案摘要草稿',
  cms_copy_draft: '官網文案草稿',
  commerce_product_copy: '商品文案草稿',
  business_summary: '經營摘要草稿'
};

const INTERNAL_FIELD_LABELS = new Set([
  'name',
  'description',
  'currency',
  'type',
  'duration',
  'price',
  'amount',
  'cost',
  'id',
  'key'
]);

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
    ollamaBaseUrl: String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim(),
    ollamaModel: String(env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL,
    timeoutMs: normalizeTimeout(env.AI_TIMEOUT_MS)
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
    return runOllamaProvider({ config, useCase, useCaseConfig, sanitized, company, user });
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

function buildResponse({ ok, provider, model = '', useCase, useCaseConfig, sanitized, draft, status }) {
  return {
    ok,
    provider,
    mode: provider,
    model,
    status,
    useCase,
    purpose: useCaseConfig.purpose,
    disclaimer: useCaseConfig.disclaimer,
    inputLength: sanitized.originalLength,
    sanitizedInputLength: sanitized.sanitizedLength,
    draft: normalizeDraft(draft, useCase, useCaseConfig),
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

async function runOllamaProvider({ config, useCase, useCaseConfig, sanitized }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: buildOllamaMessages({ useCase, useCaseConfig, sanitized }),
        stream: false
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throwOllamaHttpError(response.status, data);
    }

    const content = safeText(data?.message?.content || data?.response || '');
    return buildResponse({
      ok: true,
      provider: 'ollama',
      model: data?.model || config.ollamaModel,
      useCase,
      useCaseConfig,
      sanitized,
      draft: parseOllamaDraft(content, useCase, useCaseConfig, sanitized),
      status: 'ok'
    });
  } catch (error) {
    if (error?.status && error?.code) {
      throw error;
    }

    const isTimeout = error?.name === 'AbortError';
    const providerError = new Error(
      isTimeout
        ? '本機 AI 模型回應逾時，請稍後再試或確認 Ollama 是否正常執行。'
        : '本機 AI 模型尚未啟動，請確認 Ollama 是否執行中。'
    );
    providerError.status = 503;
    providerError.code = isTimeout ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE';
    providerError.cause = error;
    throw providerError;
  } finally {
    clearTimeout(timer);
  }
}

function buildOllamaMessages({ useCase, useCaseConfig, sanitized }) {
  const template = getPromptTemplate(useCase, useCaseConfig);
  return [
    {
      role: 'system',
      content: [
        '你是 BookAI 的本機草稿助手，只能協助整理草稿。',
        '請使用繁體中文。',
        '僅產生草稿，不可宣稱為正式結果。',
        '不可要求使用者提供電話、Email、地址、身分證字號、銀行帳號或其他敏感資料。',
        '不可輸出法律、財務、合約或報價的確定性結論。',
        '不可指示系統自動建立、刪除或發布正式資料。',
        '必須提醒使用者人工確認。',
        '請盡量只回傳 JSON object，欄位為 title、summary、items、warnings、nextSteps。',
        '不要使用 Markdown 粗體、# 標題、英文 FAQ 或程式欄位名稱。',
        'items 內請使用一般使用者看得懂的中文欄位，不要輸出 name、description、currency、type、duration。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        template,
        '',
        '以下是已清洗與遮蔽的輸入內容，請勿假設其中被遮蔽的敏感資料：',
        sanitized.text || '未提供具體內容'
      ].join('\n')
    }
  ];
}

function getPromptTemplate(useCase, useCaseConfig) {
  const templates = {
    engineering_estimate_draft: [
      '用途：工程估價草稿。',
      '請依已清洗的工程描述整理初步範圍、可能工項、風險提醒與下一步。',
      '不得輸出正式報價、合約承諾或施工保證。',
      'items 請整理為建議工項，每項包含「工項名稱、建議單位、建議數量、說明」。'
    ],
    tender_summary: [
      '用途：標案摘要。',
      '請整理標案重點、待確認期限、資格條件風險與追蹤建議。',
      '不得宣稱已完成投標資格判定，也不得做法律或合約確定性解讀。',
      'items 請整理為重點整理。'
    ],
    cms_copy_draft: [
      '用途：官網文案草稿。',
      '請產生品牌官網草稿，可包含 Banner、首頁區塊、FAQ、SEO 摘要方向。',
      '不得宣稱內容已可發布，發布前必須人工確認品牌、法規與事實。',
      'items 請依序包含「Banner 標題建議、首頁區塊文案、FAQ 草稿、SEO 描述」。'
    ],
    commerce_product_copy: [
      '用途：商品文案草稿。',
      '請產生商品標題、賣點、描述、FAQ 與社群文案方向。',
      '不得確認價格、庫存、保固、配送或付款條件。',
      'items 請依序包含「商品標題建議、商品賣點、商品描述、FAQ 草稿、社群文案」。',
      '除非輸入內容主要是英文，否則不要輸出英文 FAQ。'
    ],
    business_summary: [
      '用途：經營摘要。',
      '請整理營運重點、風險、優先事項與下一步行動。',
      '不得輸出財務、稅務或投資的確定性結論。',
      'items 請整理為風險提醒與優先處理事項。'
    ]
  };

  return [
    ...(templates[useCase] || [`用途：${useCaseConfig.purpose}`]),
    '回覆格式請結構化，items、warnings、nextSteps 請使用陣列。',
    '最後必須提醒此內容需人工確認。'
  ].join('\n');
}

function throwOllamaHttpError(status, data) {
  const rawMessage = safeText(data?.error || data?.message || '');
  const normalized = rawMessage.toLowerCase();

  if (status === 404 || normalized.includes('model') || normalized.includes('not found')) {
    const error = new Error('找不到指定的本機 AI 模型，請確認 Ollama 模型是否已下載。');
    error.status = 503;
    error.code = 'AI_MODEL_NOT_FOUND';
    throw error;
  }

  const error = new Error('本機 AI 模型暫時無法產生草稿，請稍後再試。');
  error.status = 503;
  error.code = 'AI_PROVIDER_UNAVAILABLE';
  throw error;
}

function parseOllamaDraft(content, useCase, useCaseConfig, sanitized) {
  const text = cleanText(content, { preferChinese: hasCjk(sanitized?.text) });
  if (!text) {
    return formatDraftForUseCase(useCase, textFallbackDraft('Ollama 回傳空內容。', useCaseConfig), useCaseConfig, sanitized);
  }

  const parsed = parseJsonObject(text);
  if (parsed) {
    return formatDraftForUseCase(useCase, {
      title: parsed.title || useCaseConfig.label,
      summary: parsed.summary || parsed.description || text,
      items: Array.isArray(parsed.items) ? parsed.items : draftItemsFromObject(parsed),
      warnings: ensureHumanReviewWarning(parsed.warnings),
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : []
    }, useCaseConfig, sanitized);
  }

  return formatDraftForUseCase(useCase, textFallbackDraft(text, useCaseConfig), useCaseConfig, sanitized);
}

function parseJsonObject(text) {
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to wrapping the model text as a normal draft.
    }
  }

  return null;
}

function draftItemsFromObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([key, item]) => !['title', 'summary', 'warnings', 'nextSteps', 'disclaimer'].includes(key))
    .filter(([, item]) => item != null && item !== '')
    .map(([key, item]) => ({
      section: readableSectionLabel(key),
      text: Array.isArray(item) ? item.map((entry) => cleanText(entry)).filter(Boolean).join('\n') : cleanText(item)
    }))
    .filter((item) => item.text);
}

function readableSectionLabel(key) {
  const normalized = String(key || '').trim();
  const labels = {
    banner: 'Banner 標題建議',
    bannerTitle: 'Banner 標題建議',
    headline: 'Banner 標題建議',
    home: '首頁區塊文案',
    homepage: '首頁區塊文案',
    faq: 'FAQ 草稿',
    faqs: 'FAQ 草稿',
    seo: 'SEO 描述',
    seoDescription: 'SEO 描述',
    productTitle: '商品標題建議',
    sellingPoints: '商品賣點',
    productDescription: '商品描述',
    socialCopy: '社群文案',
    risks: '風險提醒',
    priorities: '優先處理事項'
  };
  return labels[normalized] || normalized.replace(/[_-]+/g, ' ');
}

function textFallbackDraft(text, useCaseConfig) {
  const cleaned = cleanText(text);
  const parts = splitTextItems(cleaned);
  return {
    title: useCaseConfig.label,
    summary: (parts.shift() || cleaned).slice(0, MAX_SUMMARY_LENGTH),
    items: parts,
    warnings: ['此內容為 AI 草稿，需由人工確認後才能使用。'],
    nextSteps: ['人工檢查草稿內容、事實、金額與適用情境。']
  };
}

function ensureHumanReviewWarning(warnings) {
  const list = Array.isArray(warnings)
    ? warnings.map((item) => cleanText(item)).filter(Boolean)
    : [];
  if (!list.some((item) => item.includes('人工'))) {
    list.push('此內容為 AI 草稿，需由人工確認後才能使用。');
  }
  return list;
}

function formatDraftForUseCase(useCase, draft, useCaseConfig, sanitized = {}) {
  const preferChinese = hasCjk(sanitized?.text);
  const source = draft && typeof draft === 'object' ? draft : {};
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const summary = cleanText(source.summary || '', { preferChinese });
  const fallbackItems = splitTextItems(summary, { preferChinese });
  const title = USE_CASE_TITLES[useCase] || useCaseConfig.label || 'AI 草稿';

  if (useCase === 'engineering_estimate_draft') {
    return {
      title,
      summary: conciseSummary(summary, '依已清洗內容整理工程範圍與估價注意事項。'),
      items: normalizeEngineeringItems(rawItems.length ? rawItems : fallbackItems),
      warnings: normalizeWarnings(source.warnings, ['實際價格、數量、施工限制與追加項目需由人工確認。']),
      nextSteps: normalizeNextSteps(source.nextSteps, ['安排現場勘查', '補齊尺寸、照片與施工條件', '人工確認單價與毛利後再建立正式報價'])
    };
  }

  if (useCase === 'tender_summary') {
    return {
      title,
      summary: conciseSummary(summary, '依已清洗內容整理標案重點與追蹤方向。'),
      items: normalizeSimpleItems(rawItems.length ? rawItems : fallbackItems, '重點整理'),
      warnings: normalizeWarnings(source.warnings, ['截止時間、資格條件與附件版本需以公告原文為準。']),
      nextSteps: normalizeNextSteps(source.nextSteps, ['人工核對公告與附件', '確認資格與投標文件', '建立追蹤提醒與負責人'])
    };
  }

  if (useCase === 'cms_copy_draft') {
    return {
      title,
      summary: conciseSummary(summary, '依已清洗內容整理官網文案草稿。'),
      items: normalizeSectionItems(rawItems, fallbackItems, [
        'Banner 標題建議',
        '首頁區塊文案',
        'FAQ 草稿',
        'SEO 描述'
      ], { preferChinese }),
      warnings: normalizeWarnings(source.warnings, ['發布官網前需人工確認品牌語氣、法規聲明與事實資訊。']),
      nextSteps: normalizeNextSteps(source.nextSteps, ['由品牌負責人審稿', '補上真實案例、圖片與聯絡資訊', '確認後再手動貼到 CMS'])
    };
  }

  if (useCase === 'commerce_product_copy') {
    return {
      title,
      summary: conciseSummary(summary, '依已清洗內容整理商品文案草稿。'),
      items: normalizeSectionItems(rawItems, fallbackItems, [
        '商品標題建議',
        '商品賣點',
        '商品描述',
        'FAQ 草稿',
        '社群文案'
      ], { preferChinese }),
      warnings: normalizeWarnings(source.warnings, ['商品價格、庫存、保固、配送與付款條件需人工確認。']),
      nextSteps: normalizeNextSteps(source.nextSteps, ['補上實際規格與圖片', '確認庫存、售價與出貨條件', '人工審核後再上架或發布'])
    };
  }

  if (useCase === 'business_summary') {
    return {
      title,
      summary: conciseSummary(summary, '依已清洗內容整理經營重點、風險與優先事項。'),
      items: normalizeSectionItems(rawItems, fallbackItems, [
        '風險提醒',
        '優先處理事項'
      ], { preferChinese }),
      warnings: normalizeWarnings(source.warnings, ['經營判斷需以系統正式報表、會計資料與人工確認為準。']),
      nextSteps: normalizeNextSteps(source.nextSteps, ['核對正式報表', '確認前三項優先處理事項', '安排負責人與期限'])
    };
  }

  return {
    title,
    summary: conciseSummary(summary, useCaseConfig.purpose),
    items: normalizeSimpleItems(rawItems.length ? rawItems : fallbackItems, '草稿內容'),
    warnings: normalizeWarnings(source.warnings),
    nextSteps: normalizeNextSteps(source.nextSteps)
  };
}

function cleanText(value, { preferChinese = false } = {}) {
  const text = safeText(value)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[>\s]*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\b(undefined|null|\[object Object\])\b/gi, '')
    .trim();

  return text
    .split('\n')
    .map((line) => cleanLine(line, { preferChinese }))
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(line, { preferChinese = false } = {}) {
  const value = String(line || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\s*[-–—:：]+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';
  if (value === DEFAULT_DISCLAIMER) return '';
  if (/^(system|assistant|user)\s*:/i.test(value)) return '';
  if (/只回傳|JSON object|sanitized input|schema|format/i.test(value)) return '';
  if (preferChinese && isMostlyEnglishFaq(value)) return '';
  return value;
}

function splitTextItems(text, { preferChinese = false } = {}) {
  const cleaned = cleanText(text, { preferChinese });
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\n+/)
    .map((line) => cleanText(line, { preferChinese }))
    .filter(Boolean);

  if (lines.length > 1) return lines.slice(0, 10);

  return cleaned
    .split(/(?<=[。！？!?])\s+/)
    .map((item) => cleanText(item, { preferChinese }))
    .filter(Boolean)
    .slice(0, 8);
}

function conciseSummary(value, fallback) {
  const text = cleanText(value || fallback);
  const firstLines = splitTextItems(text);
  const summary = firstLines.length > 1 ? firstLines.slice(0, 2).join(' ') : text;
  return cleanText(summary || fallback).slice(0, MAX_SUMMARY_LENGTH);
}

function normalizeEngineeringItems(items) {
  const normalized = asArray(items)
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          workItem: cleanText(item.workItem || item.item || item.title || item.name || item.section || '待確認工項').slice(0, 80),
          unit: cleanText(item.unit || item.suggestedUnit || '待確認').slice(0, 40),
          quantity: cleanText(item.quantity || item.suggestedQuantity || item.qty || '待確認').slice(0, 60),
          note: cleanText(item.note || item.description || item.text || item.detail || item.summary || '').slice(0, MAX_ITEM_LENGTH)
        };
      }
      const text = cleanText(item).slice(0, MAX_ITEM_LENGTH);
      return text ? { workItem: text, unit: '待確認', quantity: '待確認', note: '需依現場條件與實際數量人工確認。' } : null;
    })
    .filter((item) => item && item.workItem);

  return normalized.length ? normalized.slice(0, 8) : [
    { workItem: '現場丈量與需求確認', unit: '式', quantity: '1', note: '確認坪數、樓層、施工限制與保護範圍。' },
    { workItem: '主要施工工項', unit: '坪/式', quantity: '待確認', note: '依實際材質、工法與數量拆分。' },
    { workItem: '材料與耗材', unit: '批', quantity: '待確認', note: '品牌、規格與替代品需人工確認。' }
  ];
}

function normalizeSectionItems(rawItems, fallbackItems, sections, options = {}) {
  const sourceItems = asArray(rawItems).length ? asArray(rawItems) : asArray(fallbackItems);
  const bySection = new Map();
  const loose = [];

  sourceItems.forEach((item) => {
    const normalized = normalizeSectionItem(item, options);
    if (!normalized.text) return;
    const matched = matchSection(normalized.section, sections) || matchSection(normalized.text, sections);
    if (matched && !bySection.has(matched)) {
      bySection.set(matched, normalized.text);
    } else {
      loose.push(normalized.text);
    }
  });

  return sections.map((section, index) => ({
    section,
    text: cleanText(bySection.get(section) || loose[index] || defaultSectionText(section), options).slice(0, MAX_ITEM_LENGTH)
  }));
}

function normalizeSectionItem(item, options = {}) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return {
      section: cleanText(item.section || item.title || item.category || item.label || item.name || '', options),
      text: cleanText(item.text || item.content || item.copy || item.description || item.summary || item.value || '', options)
    };
  }
  return { section: '', text: cleanText(item, options) };
}

function normalizeSimpleItems(items, fallbackSection) {
  const normalized = asArray(items)
    .flatMap((item) => splitTextItems(item))
    .map((item) => cleanText(stripInternalFieldPrefix(item)).slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean);

  return (normalized.length ? normalized : [fallbackSection])
    .slice(0, 8)
    .map((text) => ({ section: fallbackSection, text }));
}

function normalizeWarnings(warnings, fallback = ['此內容為 AI 草稿，需由人工確認後才能使用。']) {
  const list = asArray(warnings)
    .flatMap((item) => splitTextItems(item))
    .map((item) => cleanText(item).slice(0, MAX_ITEM_LENGTH))
    .filter((item) => item && item !== DEFAULT_DISCLAIMER);
  const merged = list.length ? list : fallback;
  return ensureHumanReviewWarning(merged).slice(0, 6);
}

function normalizeNextSteps(nextSteps, fallback = ['人工檢查草稿內容後，再手動套用到正式流程。']) {
  const list = asArray(nextSteps)
    .flatMap((item) => splitTextItems(item))
    .map((item) => cleanText(item).slice(0, MAX_ITEM_LENGTH))
    .filter(Boolean);
  return (list.length ? list : fallback).slice(0, 6);
}

function stripInternalFieldPrefix(value) {
  const text = cleanText(value);
  const match = text.match(/^([A-Za-z_]+)\s*[:：]\s*(.+)$/);
  if (match && INTERNAL_FIELD_LABELS.has(match[1].toLowerCase())) {
    return match[2];
  }
  return text;
}

function matchSection(value, sections) {
  const text = cleanText(value).toLowerCase();
  if (!text) return '';
  return sections.find((section) => {
    const key = section.toLowerCase();
    return text.includes(key) ||
      (section.includes('Banner') && /banner|標題/.test(text)) ||
      (section.includes('首頁') && /首頁|區塊/.test(text)) ||
      (section.includes('FAQ') && /faq|問答|常見/.test(text)) ||
      (section.includes('SEO') && /seo|描述/.test(text)) ||
      (section.includes('商品標題') && /商品標題|標題/.test(text)) ||
      (section.includes('商品賣點') && /賣點|特色/.test(text)) ||
      (section.includes('商品描述') && /描述|介紹/.test(text)) ||
      (section.includes('社群') && /社群|貼文/.test(text)) ||
      (section.includes('風險') && /風險|提醒/.test(text)) ||
      (section.includes('優先') && /優先|處理/.test(text));
  }) || '';
}

function defaultSectionText(section) {
  const defaults = {
    'Banner 標題建議': '請依品牌定位撰寫一句清楚、可信、可人工審核的主標題。',
    '首頁區塊文案': '整理服務價值、流程與客戶可理解的重點。',
    'FAQ 草稿': '整理常見問題與回答方向，發布前需人工確認。',
    'SEO 描述': '整理搜尋摘要方向，避免誇大或未確認資訊。',
    '商品標題建議': '請依商品特性整理清楚的標題方向。',
    '商品賣點': '整理可人工確認的商品特色與使用情境。',
    '商品描述': '以規格、用途與注意事項整理商品介紹。',
    '社群文案': '整理適合人工審核後發布的短文案。',
    '風險提醒': '整理需優先關注的營運風險。',
    '優先處理事項': '整理近期可執行且需人工確認的處理事項。'
  };
  return defaults[section] || '請人工補充與確認內容。';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function hasCjk(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function isMostlyEnglishFaq(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const ascii = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return ascii > 20 && ascii > cjk * 2 && /\b(faq|question|answer|q:|a:|what|how|why)\b/i.test(text);
}

function normalizeTimeout(value) {
  const timeout = Number(value || DEFAULT_AI_TIMEOUT_MS);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_AI_TIMEOUT_MS;
  return Math.min(Math.max(timeout, 1000), 60000);
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

function normalizeDraft(draft, useCase = '', useCaseConfig = {}) {
  const formatted = formatDraftForUseCase(useCase, draft, useCaseConfig);
  const value = draft && typeof draft === 'object' ? draft : {};
  const source = formatted && typeof formatted === 'object' ? formatted : value;
  return {
    title: cleanText(source.title || 'AI 草稿').slice(0, 200),
    summary: cleanText(source.summary || '').slice(0, MAX_SUMMARY_LENGTH),
    items: Array.isArray(source.items) ? source.items.map(normalizeDraftItem).filter(Boolean) : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => cleanText(item)).filter(Boolean) : [],
    nextSteps: Array.isArray(source.nextSteps) ? source.nextSteps.map((item) => cleanText(item)).filter(Boolean) : []
  };
}

function normalizeDraftItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const entries = Object.entries(item)
      .filter(([key]) => !INTERNAL_FIELD_LABELS.has(String(key).toLowerCase()))
      .map(([key, value]) => [key, cleanText(value).slice(0, MAX_ITEM_LENGTH)])
      .filter(([, value]) => value);
    return entries.length ? Object.fromEntries(entries) : null;
  }
  const text = cleanText(stripInternalFieldPrefix(item)).slice(0, MAX_ITEM_LENGTH);
  return text || null;
}
