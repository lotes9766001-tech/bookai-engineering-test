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

const PLACEHOLDER_TEXTS = new Set([
  '賣點',
  '商品描述',
  'faq',
  'faq草稿',
  '社群文案',
  '標題',
  '摘要',
  '說明',
  '下一步',
  '注意事項',
  '商品標題建議',
  '商品賣點',
  '官網文案',
  'banner標題',
  '首頁區塊文案',
  '工項名稱',
  '建議數量',
  '建議單位',
  'producttitle',
  'productdescription',
  'keysellingpoints',
  'animalwaterbottle',
  'productname',
  'description',
  'socialpost'
]);

const ENGLISH_PLACEHOLDER_PATTERNS = [
  /\bProduct Title\b/i,
  /\bProduct Description\b/i,
  /\bKey Selling Points\b/i,
  /\bAnimal Water Bottle\b/i,
  /\bProduct Name\b/i,
  /\bSocial Post\b/i
];

const IRRELEVANT_PATTERNS = [
  /水果配方/,
  /營養成分/,
  /寬容的營養成分/,
  /醫療功效/,
  /保證療效/,
  /保健品/,
  /不存在的食材/
];

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
    workflowId: safeText(input.workflowId || input.workflow_id || '').trim(),
    taskId: safeText(input.taskId || input.task_id || '').trim(),
    taskLabel: safeText(input.taskLabel || input.task_label || '').trim(),
    edition: safeText(input.edition || '').trim(),
    originalLength: rawText.length,
    sanitizedLength: masked.length,
    truncated: rawText.length > MAX_INPUT_LENGTH
  };
}

function getUseCaseStructure(useCase, sanitized = {}) {
  const taskId = String(sanitized.taskId || '').trim();
  const workflowId = String(sanitized.workflowId || '').trim();
  const edition = String(sanitized.edition || '').trim();
  const isRestaurant = workflowId === 'restaurant' || ['menu-copy', 'campaign-copy', 'store-copy'].includes(taskId) || edition === 'restaurant';
  const businessMode = edition === 'engineering'
    ? 'engineering'
    : edition === 'restaurant'
      ? 'restaurant'
      : 'commerce';

  const commonOutput = [
    '只輸出可整理成 title, summary, items, warnings, nextSteps 的草稿。',
    '內容必須貼近使用者輸入，不得編造未提供的價格、規格、療效或保證。',
    '若資訊不足，不要硬寫完整草稿。'
  ];

  if (useCase === 'engineering_estimate_draft') {
    return {
      mode: 'engineering',
      title: '工程估價草稿',
      skeleton: ['案場基本資訊', '施工範圍', '現況問題', '可能工項', '材料 / 耗材', '人工與施工條件', '數量與單位待確認項', '報價前需確認問題', '風險提醒', '下一步'],
      required: [
        { key: 'location', label: '施工地點或區域', patterns: [/台中|台北|高雄|新北|桃園|台南|市|區|縣|鄉|鎮|路|街/] },
        { key: 'scope', label: '坪數或施工範圍', patterns: [/\d+\s*(坪|m2|㎡|平方|間|房|廳|衛)/, /施工範圍|範圍|客廳|房間|走廊|天花板|牆面|地板/] },
        { key: 'access', label: '樓層與是否有電梯', patterns: [/\d+\s*樓|電梯|無電梯|有電梯/] },
        { key: 'condition', label: '牆面 / 現場狀況', patterns: [/壁癌|剝落|釘孔|裂縫|漏水|修補|批土|現況|家具/] },
        { key: 'material', label: '材料或施工要求', patterns: [/乳膠漆|油漆|防水|材料|白色|灰色|指定|要求|保護/] }
      ],
      suggestions: ['施工地點或區域', '坪數或施工範圍', '樓層與是否有電梯', '牆面 / 現場狀況', '材料或施工要求', '是否有家具保護或施工限制'],
      minimumSignals: 3,
      outputRules: [
        ...commonOutput,
        '案場名稱、地區、地址、樓層、坪數、房型、施工範圍只能作為 basicInfo 或摘要，不可當成主要工項 item。',
        '主要 items 只能列真正估價工項，例如現場保護、修補、批土研磨、底漆、面漆、天花板油漆、完工清潔、搬運動線。',
        '不得自行新增使用者未提供的案場類型或業態，例如酒店、飯店、店面、辦公室、商業空間或商辦。'
      ]
    };
  }

  if (useCase === 'tender_summary') {
    return {
      mode: 'engineering',
      title: '標案摘要',
      skeleton: ['標案名稱', '機關', '預算', '截止日', '工作範圍', '資格條件', '文件準備', '風險提醒', '是否值得追蹤', '下一步'],
      required: [
        { key: 'name', label: '標案名稱', patterns: [/標案|工程|採購|修繕|案名|名稱/] },
        { key: 'agency', label: '機關名稱', patterns: [/機關|學校|市府|公所|局|處|院|中心/] },
        { key: 'budget', label: '預算金額', patterns: [/\d+\s*(元|萬|千|億)|預算/] },
        { key: 'deadline', label: '截止日期', patterns: [/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}|截止|期限|投標/] },
        { key: 'scope', label: '工程或採購範圍', patterns: [/範圍|粉刷|修補|清潔|供應|維護|施工|採購/] }
      ],
      suggestions: ['標案名稱', '機關名稱', '預算金額', '截止日期', '工程或採購範圍', '資格條件', '公告連結或案號，若有'],
      minimumSignals: 3,
      outputRules: commonOutput
    };
  }

  if (useCase === 'commerce_product_copy' && isRestaurant) {
    return {
      mode: 'restaurant',
      title: '餐飲文案草稿',
      skeleton: ['店名或餐點名稱', '餐點特色', '價格或份量，若有', '目標客群', '使用情境：內用、外帶、外送、活動', '菜單文案', '活動文案', '店家介紹', '外送平台描述', '社群文案', '注意事項'],
      required: [
        { key: 'name', label: '餐點名稱或店家名稱', patterns: [/餐點|店家|店名|牛肉麵|飲品|套餐|咖啡|便當|小吃|招牌/] },
        { key: 'feature', label: '口味特色', patterns: [/湯頭|口味|香|辣|濃郁|清爽|軟嫩|酥脆|特色|熬煮|食材/] },
        { key: 'price', label: '份量或價格', patterns: [/\d+\s*(元|人份|碗|份|杯)|份量|加麵|大份|小份/] },
        { key: 'audience', label: '目標客群', patterns: [/上班族|學生|家庭|親子|客群|附近|外送|內用|午餐|晚餐/] }
      ],
      suggestions: ['餐點名稱或店家名稱', '口味特色', '份量或價格', '目標客群', '活動內容', '外帶 / 外送限制'],
      minimumSignals: 3,
      outputRules: [...commonOutput, '餐飲文案不得宣稱療效，不得亂編食材或價格，不得暗示已新增菜單或發布活動。']
    };
  }

  if (useCase === 'commerce_product_copy') {
    return {
      mode: 'commerce',
      title: '商品文案草稿',
      skeleton: ['商品名稱', '商品特色', '適用對象', '使用情境', '主打賣點', '注意限制', '商品標題建議', '商品賣點', '商品描述', 'FAQ', '社群 / LINE 文案', '下一步'],
      required: [
        { key: 'name', label: '商品名稱', patterns: [/商品|名稱|飲水機|外出包|水壺|背包|貓砂墊|用品/] },
        { key: 'feature', label: '商品特色', patterns: [/特色|靜音|循環|容量|防潑水|可拆洗|透明|濾芯|輕量|收納/] },
        { key: 'audience', label: '適用對象', patterns: [/適用|貓|狗|小型犬|家庭|族群|對象|上班族/] },
        { key: 'spec', label: '材質 / 規格 / 容量', patterns: [/\d+(\.\d+)?\s*(L|ml|公升|cm|公斤|kg)|材質|規格|容量|尺寸/] },
        { key: 'scenario', label: '使用情境或主打賣點', patterns: [/情境|主打|賣點|使用|省電|好清洗|便利|安全|外出|日常/] }
      ],
      suggestions: ['商品名稱', '商品特色', '適用對象', '材質 / 規格 / 容量', '使用情境', '主打賣點', '不可宣稱或需避免的內容'],
      minimumSignals: 4,
      outputRules: [
        ...commonOutput,
        '使用繁體中文；除非使用者明確要求英文，不要輸出英文商品標題。',
        '寵物用品不得寫成食品、水果、保健品、營養品或醫療用品。',
        '不得輸出 placeholder，例如：賣點、商品描述、FAQ 草稿。'
      ]
    };
  }

  if (useCase === 'cms_copy_draft') {
    return {
      mode: isRestaurant ? 'restaurant' : 'commerce',
      title: isRestaurant ? '餐飲店家 / 活動文案' : '官網文案草稿',
      skeleton: isRestaurant
        ? ['店名或活動名稱', '店家特色', '活動內容', '目標客群', '店家介紹', '外送平台描述', '社群文案', '下一步']
        : ['品牌名稱', '品牌定位', '服務 / 商品內容', '目標客群', '品牌語氣', 'Banner 標題', '副標', '品牌介紹', '首頁區塊文案', 'FAQ', 'SEO 描述', '下一步'],
      required: [
        { key: 'brand', label: isRestaurant ? '店家或活動名稱' : '品牌名稱', patterns: [/品牌|店家|店名|名稱|活動/] },
        { key: 'offer', label: isRestaurant ? '活動內容或店家特色' : '服務或商品類型', patterns: [/服務|商品|活動|套餐|優惠|內容|特色|類型/] },
        { key: 'audience', label: '目標客群', patterns: [/客群|對象|上班族|學生|家庭|企業|族群/] },
        { key: 'positioning', label: '品牌定位或主要優勢', patterns: [/定位|語氣|專業|溫暖|優勢|主打|差異/] }
      ],
      suggestions: isRestaurant
        ? ['店家或活動名稱', '活動內容或店家特色', '目標客群', '外帶 / 外送限制', '想呈現的語氣']
        : ['品牌名稱', '服務或商品類型', '目標客群', '品牌定位', '想呈現的語氣', '主要優勢'],
      minimumSignals: 3,
      outputRules: commonOutput
    };
  }

  if (useCase === 'business_summary') {
    const skeletons = {
      engineering: ['本月案場', '報價金額', '已收款 / 未收款', '材料成本', '人工成本', '毛利風險', '收款風險', '優先處理事項', '下一步'],
      restaurant: ['營業額', '熱銷餐點', '食材成本', '尖峰時段', '客訴', '出餐流程', '活動建議', '下一步'],
      commerce: ['訂單', '銷售額', '熱銷商品', '庫存', '退貨', '官網詢問', '客服回覆', '銷售機會', '下一步']
    };
    return {
      mode: businessMode,
      title: '經營摘要',
      skeleton: skeletons[businessMode] || skeletons.commerce,
      required: [
        { key: 'revenue', label: '營收或銷售額', patterns: [/營收|銷售額|營業額|訂單|\d+\s*(元|萬|筆)/] },
        { key: 'cost', label: '成本', patterns: [/成本|材料|人工|食材|毛利/] },
        { key: 'inventory', label: '收款 / 庫存 / 食材', patterns: [/收款|未收|庫存|食材|剩|逾期/] },
        { key: 'topItems', label: '熱銷項目', patterns: [/熱銷|品項|商品|餐點|案場|飲水機|外出包/] },
        { key: 'problem', label: '目前問題', patterns: [/問題|風險|退貨|客訴|慢|不足|延誤|偏高|偏低/] },
        { key: 'period', label: '想分析的期間', patterns: [/本月|這月|上月|本週|期間|202\d|月/] }
      ],
      suggestions: ['營收或銷售額', '成本', '收款 / 庫存 / 食材', '熱銷項目', '目前問題', '想分析的期間'],
      minimumSignals: 4,
      outputRules: commonOutput
    };
  }

  return {
    mode: 'general',
    title: 'AI 草稿',
    skeleton: ['摘要', '主要內容', '注意事項', '下一步'],
    required: [],
    suggestions: ['需求背景', '目標對象', '主要內容', '限制或注意事項'],
    minimumSignals: 1,
    outputRules: commonOutput
  };
}

function extractInputSignals(text = '', structure = {}) {
  const source = String(text || '');
  const found = [];
  const missing = [];
  for (const field of structure.required || []) {
    const matched = (field.patterns || []).some((pattern) => pattern.test(source));
    if (matched) found.push(field.label);
    else missing.push(field.label);
  }
  return {
    found,
    missing,
    signalCount: found.length,
    length: source.trim().length
  };
}

function getMissingInfoSuggestions(structure = {}, signals = {}) {
  const missing = signals.missing || [];
  const suggestions = structure.suggestions || [];
  const seen = new Set();
  return [...missing, ...suggestions]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 7);
}

function buildGuidedPrompt(useCase, sanitized = {}, context = {}) {
  const structure = getUseCaseStructure(useCase, sanitized, context);
  const signals = extractInputSignals(sanitized.text, structure);
  const missingInfo = getMissingInfoSuggestions(structure, signals);
  const enoughLength = String(sanitized.text || '').trim().length >= 18;
  const enoughSignals = signals.signalCount >= (structure.minimumSignals || 1);
  const taskLine = [sanitized.taskLabel, sanitized.taskId, sanitized.workflowId].filter(Boolean).join(' / ');

  return {
    ...structure,
    taskLine,
    signals,
    missingInfo,
    enough: enoughLength && enoughSignals,
    prompt: [
      `任務：${structure.title}`,
      taskLine ? `前端任務語境：${taskLine}` : '',
      `固定整理骨架：${structure.skeleton.join('、')}`,
      signals.found.length ? `已偵測到的資訊：${signals.found.join('、')}` : '已偵測到的資訊：不足',
      missingInfo.length ? `若需要補充，優先提示：${missingInfo.join('、')}` : '',
      '請依固定骨架整理，不要把骨架原樣當空表格輸出。',
      ...structure.outputRules
    ].filter(Boolean).join('\n')
  };
}

function shouldAskForMoreInfo(structure = {}) {
  return !structure.enough;
}

function shouldAskForMoreDraftInfo(useCase, sanitized = {}, structure = {}) {
  if (useCase === 'commerce_product_copy' && structure?.mode !== 'restaurant') {
    return shouldAskForMoreCommerceInfo(useCase, sanitized, structure);
  }
  if (useCase === 'cms_copy_draft' && structure?.mode !== 'restaurant') {
    return shouldAskForMoreCmsInfo(sanitized);
  }
  return shouldAskForMoreInfo(structure);
}

function shouldAskForMoreCommerceInfo(useCase, sanitized = {}, structure = {}) {
  if (useCase !== 'commerce_product_copy') return false;
  if (structure?.mode === 'restaurant') return false;
  const text = cleanText(sanitized.text || '');
  if (!text || text.length < 18) return true;
  const hasSpecificName = /商品名稱|品名|名稱|飲水機|外出包|貓砂墊|收納|服飾|配件|保養|食品|3C|PET-|Mori/i.test(text);
  const hasFeature = /特色|賣點|容量|尺寸|規格|低噪音|靜音|可拆洗|濾芯|水位|材質|適合|使用情境|上班族|多寵|貓|犬|限制|注意/i.test(text);
  const tooGeneric = /^(寵物用品|商品文案|幫我寫文案|請幫我寫商品文案)[，,。.\s]*$/i.test(text);
  return tooGeneric || !(hasSpecificName && hasFeature);
}

function shouldAskForMoreCmsInfo(sanitized = {}) {
  const text = cleanText(sanitized.text || '');
  if (!text || text.length < 20) return true;
  const hasBrand = /品牌|品牌名稱|Mori|摩理|Pet Life|店名/i.test(text);
  const hasOffer = /商品|服務|定位|飲水機|外出包|貓砂墊|收納|用品|語氣|SEO|Banner/i.test(text);
  return !(hasBrand && hasOffer);
}

function buildInsufficientInfoDraft(structure = {}) {
  const commerceSuggestions = ['商品名稱', '商品特色', '規格 / 尺寸 / 容量', '適用對象', '使用情境', '注意限制'];
  return {
    title: '需要補充更多資訊',
    summary: '目前資訊不足，請補充商品名稱、特色、適用對象、規格、使用情境或主打賣點後再產生草稿。',
    needsMoreInfo: true,
    missingInfo: commerceSuggestions,
    items: commerceSuggestions.map((item) => ({ section: '建議補充', text: item })),
    warnings: ['資訊不足時，AI 不會推測完整商品文案。', 'AI 不會直接新增、修改、刪除或發布正式資料。'],
    nextSteps: ['請補充商品名稱、特色、規格、適用對象、使用情境或注意限制。', '補充後再重新產生草稿。']
  };
  const suggestions = getMissingInfoSuggestions(structure, structure.signals || {});
  return {
    title: '需要補充更多資訊',
    summary: '目前資訊仍不足，BookAI 可以先協助整理方向，但建議補充以下資料後再產生較完整草稿。',
    needsMoreInfo: true,
    missingInfo: suggestions,
    items: suggestions.map((item) => ({
      section: '建議補充',
      text: item
    })),
    warnings: [
      '資訊不足時不建議直接使用 AI 草稿。',
      '正式資料仍需人工確認。'
    ],
    nextSteps: [
      '補充建議資料後重新產生。',
      '若只是初步想法，可先複製方向草稿作為備忘。'
    ]
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
  const structure = buildGuidedPrompt(useCase, sanitized, { company, user });
  const guidedSanitized = { ...sanitized, structure };
  if (!config.enabled) {
    return buildResponse({
      ok: false,
      provider: 'disabled',
      useCase,
      useCaseConfig,
      sanitized: guidedSanitized,
      draft: disabledDraft(useCaseConfig),
      status: 'disabled'
    });
  }
  if (shouldAskForMoreDraftInfo(useCase, sanitized, structure)) {
    return buildResponse({
      ok: true,
      provider: config.provider,
      model: config.provider === 'ollama' ? config.ollamaModel : '',
      useCase,
      useCaseConfig,
      sanitized: guidedSanitized,
      draft: buildInsufficientInfoDraft(structure),
      status: 'needs_more_info'
    });
  }

  if (config.provider === 'mock') {
    return buildResponse({
      ok: true,
      provider: 'mock',
      useCase,
      useCaseConfig,
      sanitized: guidedSanitized,
      draft: mockDraft(useCase, sanitized.text, structure),
      status: 'ok'
    });
  }

  if (config.provider === 'ollama') {
    return runOllamaProvider({ config, useCase, useCaseConfig, sanitized: guidedSanitized, company, user });
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
    draft: status === 'disabled' ? normalizeDisabledDraft(draft) : normalizeDraft(draft, useCase, useCaseConfig, sanitized),
    createdAt: new Date().toISOString()
  };
}

function normalizeDisabledDraft(draft = {}) {
  return {
    title: 'AI 草稿功能尚未啟用',
    summary: '目前環境尚未啟用 AI 草稿服務，因此不會產生商品文案、官網文案或社群草稿。',
    items: [],
    warnings: Array.isArray(draft.warnings) && draft.warnings.length
      ? draft.warnings
      : ['AI_ENABLED 不是 true，因此未呼叫 provider，也未產生草稿內容。', 'AI 不會直接新增、修改、刪除或發布正式資料。'],
    nextSteps: Array.isArray(draft.nextSteps) && draft.nextSteps.length
      ? draft.nextSteps
      : ['請系統管理者在測試環境設定 AI_ENABLED=true。', '雲端測試環境請使用 AI_PROVIDER=mock。'],
    needsMoreInfo: false,
    missingInfo: []
  };
}

function disabledDraft(useCaseConfig) {
  return {
    title: 'AI 草稿功能尚未啟用',
    summary: '目前環境尚未啟用 AI 草稿服務，因此不會產生商品文案、官網文案或社群草稿。',
    items: [],
    warnings: ['AI_ENABLED 不是 true，因此未呼叫 provider，也未產生草稿內容。', 'AI 不會直接新增、修改、刪除或發布正式資料。'],
    nextSteps: ['請系統管理者在測試環境設定 AI_ENABLED=true。', '雲端測試環境請使用 AI_PROVIDER=mock。']
  };
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
        sanitized.structure?.prompt ? `\nBookAI Smart Structure:\n${sanitized.structure.prompt}` : '',
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
      '請使用繁體中文；除非使用者明確要求英文，禁止輸出英文商品標題。',
      '禁止輸出 placeholder 或只有欄位名稱的內容，例如：賣點、商品描述、FAQ 草稿、Product Title、Product Description。',
      '商品文案必須貼近使用者輸入的商品資訊，不可改成其他品類。',
      '不可把寵物飲水機、寵物外出包等寵物用品寫成食品、水果、保健品或營養產品。',
      '不可編造不存在的材質、醫療功效、營養宣稱、保證療效或法規宣稱。',
      '如果資訊不足，請在 title 或 summary 說明「需要補充資訊」，不要亂寫。',
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

function normalizeEngineeringDraft(draft, useCaseConfig = {}, sanitized = {}) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const input = normalizeText(sanitized?.text || '');
  const basicInfo = extractEngineeringBasicInfo(input);
  const modelItems = asArray(source.items)
    .map((item) => normalizeEngineeringWorkItem(item, sanitized))
    .filter(Boolean)
    .filter((item) => !isEngineeringBasicInfoItem(item))
    .filter((item) => !isSceneHallucination(Object.values(item).join(' '), sanitized, 'engineering_estimate_draft'));
  const inferredItems = inferEngineeringWorkItems(input);
  const items = mergeEngineeringWorkItems([...inferredItems, ...modelItems]).slice(0, 11);
  const summaryParts = [
    basicInfo.site ? `案場：${basicInfo.site}` : '',
    basicInfo.area ? `地區：${basicInfo.area}` : '',
    basicInfo.floor ? `樓層：${basicInfo.floor}` : '',
    basicInfo.size ? `坪數：${basicInfo.size}` : '',
    basicInfo.scope ? `施工範圍：${basicInfo.scope}` : ''
  ].filter(Boolean);

  return {
    title: '工程估價草稿',
    summary: summaryParts.length
      ? `BookAI 已先整理案場基本資訊，主要草稿內容僅列真正估價工項。${summaryParts.join('；')}`
      : cleanText(source.summary || 'BookAI 已依輸入內容整理工程估價草稿，主要內容以可估價工項為主。'),
    basicInfo,
    items,
    warnings: normalizeWarnings(source.warnings, [
      '此內容僅為 AI 草稿，尚未寫入估價明細或案場資料。',
      '數量、單位、材料與施工條件仍需現場丈量與人工確認。'
    ]),
    nextSteps: normalizeNextSteps(source.nextSteps, [
      '確認案場類型、施工範圍、樓層與現場限制。',
      '現場丈量牆面與天花板面積後，再由使用者手動建立正式估價明細。',
      '確認色號、材料等級、家具保護與施工時程。'
    ])
  };
}

function extractEngineeringBasicInfo(input = '') {
  const text = normalizeText(input);
  return {
    site: extractLabeledValue(text, ['案場', '案場名稱']) || firstMatch(text, /([^。\n，,]*?(?:老公寓|公寓|住宅|住家|室內油漆工程|油漆工程)[^。\n，,]*)/),
    area: firstMatch(text, /(台中市南區|臺中市南區|[\u4e00-\u9fff]{2,}(?:市|縣)[\u4e00-\u9fff]{1,}(?:區|鄉|鎮))/),
    floor: firstMatch(text, /(\d+\s*樓(?:[^。\n，,]*?電梯)?|無電梯|有電梯)/),
    size: firstMatch(text, /(約?\s*\d+\s*坪|\d+\s*坪)/),
    layout: firstMatch(text, /(\d+\s*房\s*\d+\s*廳\s*\d+\s*廚\s*\d+\s*衛)/),
    scope: extractLabeledValue(text, ['施工範圍', '工程範圍']),
    material: extractLabeledValue(text, ['材料', '材料偏好']),
    limits: extractLabeledValue(text, ['限制', '現場限制']),
    needs: extractLabeledValue(text, ['需求', '業主需求'])
  };
}

function extractLabeledValue(text, labels = []) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*([^。\\n]+)`);
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]).slice(0, 180);
  }
  return '';
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return cleanText(match?.[1] || '').slice(0, 180);
}

function normalizeEngineeringWorkItem(item, sanitized = {}) {
  if (!item) return null;
  if (typeof item === 'string') {
    const text = sanitizeHallucinatedSceneTerms(item, sanitized, 'engineering_estimate_draft');
    if (!text || isEngineeringBasicInfoText(text)) return null;
    return {
      workItem: cleanText(text).slice(0, 80),
      unit: '待現場確認',
      quantity: '待現場丈量',
      note: '依輸入內容整理為可能估價工項，正式數量需現場確認。',
      confirmNeeded: '確認實際施工範圍、材料與數量。'
    };
  }
  if (typeof item === 'object' && !Array.isArray(item)) {
    const title = cleanText(item.workItem || item.item || item.title || item.name || item.section || '').slice(0, 80);
    const note = cleanText(item.note || item.description || item.text || item.detail || item.summary || '').slice(0, MAX_ITEM_LENGTH);
    const combined = `${title} ${note}`;
    if (!title || isEngineeringBasicInfoText(combined)) return null;
    return {
      workItem: sanitizeHallucinatedSceneTerms(title, sanitized, 'engineering_estimate_draft'),
      unit: cleanText(item.unit || item.suggestedUnit || '待現場確認').slice(0, 40),
      quantity: cleanText(item.quantity || item.suggestedQuantity || item.qty || '待現場丈量').slice(0, 60),
      note: sanitizeHallucinatedSceneTerms(note || '依輸入內容整理為可能估價工項。', sanitized, 'engineering_estimate_draft'),
      confirmNeeded: sanitizeHallucinatedSceneTerms(item.confirmNeeded || item.confirm || item.needConfirm || '確認實際數量、材料與施工條件。', sanitized, 'engineering_estimate_draft')
    };
  }
  return null;
}

function isEngineeringBasicInfoItem(item = {}) {
  return isEngineeringBasicInfoText([item.workItem, item.note, item.confirmNeeded].filter(Boolean).join(' '));
}

function isEngineeringBasicInfoText(value = '') {
  const text = normalizeText(value);
  if (!text) return true;
  if (/^(案場名稱|案場地點|地點|地區|地址|樓層|坪數|房型|施工範圍|工程範圍|材料偏好|業主需求|時程要求)$/i.test(text)) return true;
  if (/^(案場名稱|案場地點|地點|地區|地址|樓層|坪數|房型|施工範圍|工程範圍|材料偏好|業主需求|時程要求)\s*[:：]/.test(text)) return true;
  if (/台中市南區|臺中市南區/.test(text) && !/(保護|修補|油漆|底漆|面漆|清潔|搬運|動線|批土|研磨|壁癌)/.test(text)) return true;
  if (/^\d+\s*房|\d+\s*廳|\d+\s*衛|約?\s*\d+\s*坪$/.test(text)) return true;
  return false;
}

function inferEngineeringWorkItems(input = '') {
  const text = normalizeText(input);
  const hasPaint = /油漆|乳膠漆|粉刷|牆面|天花板|白色|灰色|色號/.test(text);
  const hasCeiling = /天花板/.test(text);
  const hasWallRepair = /釘孔|剝落|修補|批土|牆面/.test(text);
  const hasWallCancer = /壁癌|漏水|防水/.test(text);
  const hasFurniture = /家具|保護|地板|住戶/.test(text);
  const hasNoElevator = /無電梯|\d+\s*樓/.test(text);
  const hasOldPaint = /舊漆|剝落|底漆/.test(text);
  const hasColor = /白色|灰色|淺灰|色號|分色/.test(text);
  const size = firstMatch(text, /(約?\s*\d+\s*坪|\d+\s*坪)/) || '待現場丈量';
  const items = [];

  if (hasFurniture) items.push(engineeringItem('現場保護', '式', '1', '施工前先做動線、地板與家具簡易保護，降低粉塵與漆料污染。', '確認家具數量、可移動範圍與保護材需求。'));
  if (hasFurniture) items.push(engineeringItem('家具與地板簡易保護', '式', '1', '針對仍有家具的住家環境，安排分區遮蔽與保護。', '確認大型家具是否可移動及施工分區順序。'));
  if (hasWallCancer) items.push(engineeringItem('壁癌處理評估', '處 / 式', '待現場確認', '針對局部壁癌先檢查原因，評估是否需除霉、乾燥、防水底漆或隔離處理。', '確認壁癌範圍、含水狀況與是否有漏水源。'));
  if (hasWallRepair) items.push(engineeringItem('牆面局部修補', '處 / 式', '待現場確認', '針孔、剝落與局部不平整處需先補土修整。', '確認修補點位、深度與是否需多次補土。'));
  if (hasWallRepair || hasOldPaint) items.push(engineeringItem('批土研磨', '坪 / 式', size, '修補後進行批土與研磨，讓後續上漆面更平整。', '現場確認牆面平整度與需處理面積。'));
  if (hasOldPaint || hasPaint) items.push(engineeringItem('底漆施作', '坪', size, '舊漆剝落或修補區建議先施作底漆，提升附著與遮蓋穩定度。', '確認底漆種類、牆面乾燥程度與材料等級。'));
  if (hasPaint) items.push(engineeringItem('牆面面漆施作', '坪', size, '依指定色系施作牆面乳膠漆，正式報價需依實際丈量面積計算。', '確認漆料品牌、色號、道數與是否含局部淺灰色分色。'));
  if (hasCeiling) items.push(engineeringItem('天花板油漆', '坪', '待現場丈量', '天花板另列為估價項目，施工難度與保護需求需獨立確認。', '丈量天花板面積並確認是否需修補。'));
  if (hasColor) items.push(engineeringItem('色號確認與分色施工提醒', '式', '1', '白色系與局部淺灰色需先確認色號與分色位置，避免完工落差。', '確認色卡、分色牆面與業主簽認方式。'));
  if (hasNoElevator) items.push(engineeringItem('樓層搬運 / 無電梯施工動線提醒', '趟 / 式', '待現場確認', '4 樓無電梯會影響材料搬運、垃圾清運與施工排程。', '確認樓梯寬度、停車卸料位置與搬運次數。'));
  if (hasPaint || text) items.push(engineeringItem('完工清潔', '式', '1', '完工後進行基本清潔與保護材撤除，正式範圍需事先約定。', '確認是否含細清、垃圾清運與家具復位。'));
  if (!items.length) items.push(engineeringItem('報價前現場丈量', '式', '1', '目前資訊不足，建議先現場丈量施工範圍與確認材料。', '補充坪數、樓層、現況、材料與施工限制。'));
  return items;
}

function engineeringItem(workItem, unit, quantity, note, confirmNeeded) {
  return { workItem, unit, quantity, note, confirmNeeded };
}

function mergeEngineeringWorkItems(items = []) {
  const seen = new Set();
  return items
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeText(item.workItem).replace(/\s+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

function cleanMockDraft(useCase, text) {
  const context = cleanText(text || '未提供輸入內容');
  const commonWarnings = ['此內容為 AI 草稿，請以實際資料、規格、價格、庫存與人工確認為準。'];

  const drafts = {
    engineering_estimate_draft: {
      title: '工程估價草稿',
      summary: `依輸入內容整理估價前草稿：${context}`,
      items: [
        { workItem: '現場丈量與施工前確認', quantity: 1, unit: '式', note: '確認面積、樓層、搬運限制、保護範圍與施工時段。' },
        { workItem: '主要工程施作', quantity: '待確認', unit: '式', note: '依實際工項拆分材料、人工、外包與雜支。' },
        { workItem: '完工清潔與驗收', quantity: '待確認', unit: '式', note: '確認收尾、清潔、瑕疵修補與驗收標準。' }
      ],
      warnings: [...commonWarnings, '數量、單價、稅額與施工條件需由工程人員確認。'],
      nextSteps: ['確認現場條件', '補齊尺寸與照片', '人工建立正式估價明細']
    },
    tender_summary: {
      title: '標案摘要草稿',
      summary: `依標案內容整理摘要：${context}`,
      items: [
        { section: '標案重點', text: '整理機關、標案名稱、預算、截止日與履約範圍。' },
        { section: '資格與文件', text: '確認資格條件、押標金、履約期限與文件需求。' },
        { section: '追蹤判斷', text: '標記風險、需補資料與是否值得追蹤。' }
      ],
      warnings: [...commonWarnings, '標案資訊仍需以公告原文與附件為準。'],
      nextSteps: ['確認截止日與投標文件', '評估人力與毛利', '決定是否納入接案追蹤']
    },
    cms_copy_draft: {
      title: '官網文案草稿',
      summary: `依品牌或服務資料整理官網草稿：${context}`,
      items: [
        { section: 'Banner 標題', text: '用清楚專業的服務，讓客戶快速理解你的價值。' },
        { section: '首頁區塊文案', text: '整理服務特色、適合對象、合作流程與聯絡方式。' },
        { section: 'FAQ 草稿', text: '可加入服務範圍、交期、付款方式與售後確認。' },
        { section: 'SEO 描述', text: '以品牌名稱、服務地區與核心服務建立搜尋摘要。' }
      ],
      warnings: [...commonWarnings, '發布前需確認品牌語氣、法規聲明與聯絡資訊。'],
      nextSteps: ['調整品牌語氣', '補齊圖片與聯絡方式', '人工複製到 CMS 草稿']
    },
    commerce_product_copy: {
      title: '商品文案草稿',
      summary: `依商品資料產生文案草稿：${context}`,
      items: [
        { section: '商品標題建議', text: mockProductTitle(context) },
        { section: '商品賣點', text: mockProductBenefits(context) },
        { section: '商品描述', text: mockProductDescription(context) },
        { section: 'FAQ 草稿', text: '購買前請確認尺寸、材質、清潔方式、庫存與配送範圍。' },
        { section: '社群文案', text: mockProductSocialCopy(context) }
      ],
      warnings: [...commonWarnings, '商品規格、價格、庫存、材質與法規標示需人工確認。'],
      nextSteps: ['確認商品規格與圖片', '檢查庫存、售價與配送條件', '人工調整品牌語氣後再手動套用']
    },
    business_summary: {
      title: '經營摘要草稿',
      summary: `依營運重點整理摘要：${context}`,
      items: [
        { section: '營運重點', text: '整理本月營收、成本、收款與庫存或案場狀態。' },
        { section: '風險提醒', text: '標記可能影響現金流、毛利或交付進度的風險。' },
        { section: '下一步', text: '列出下週優先追蹤事項與需要人工確認的資料。' }
      ],
      warnings: [...commonWarnings, '經營判斷仍需以正式報表與會計資料為準。'],
      nextSteps: ['確認正式報表數字', '追蹤高風險收款或成本項目', '安排下一步負責人與期限']
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

function mockProductTitle(context) {
  if (/飲水機/.test(context)) return '靜音循環寵物飲水機，適合貓狗日常補水';
  if (/外出包/.test(context)) return '輕量防潑水寵物外出包，適合小型犬日常出門';
  if (/牛肉麵|餐|飲|套餐|店/.test(context)) return '招牌餐點文案草稿，主打特色口味與用餐情境';
  return '實用商品文案草稿，主打清楚特色與使用情境';
}

function mockProductBenefits(context) {
  if (/飲水機/.test(context)) return '靜音循環水流、節能省電、容易清洗，適合貓狗日常使用。';
  if (/外出包/.test(context)) return '防潑水、輕量好收納，適合小型犬短程外出與日常移動。';
  if (/牛肉麵|餐|飲|套餐|店/.test(context)) return '強調口味、份量、用餐時段與適合客群，不編造食材或療效。';
  return '整理商品特色、適用對象、使用方式與購買前需要確認的資訊。';
}

function mockProductDescription(context) {
  if (/飲水機/.test(context)) return '這款寵物飲水機以安靜循環水流與易清洗設計為主，適合希望提升貓狗日常飲水便利性的家庭。';
  if (/外出包/.test(context)) return '這款寵物外出包以防潑水與輕量收納為主，適合小型犬日常散步、短程外出或交通移動。';
  if (/牛肉麵|餐|飲|套餐|店/.test(context)) return '可用於菜單或平台介紹，強調餐點特色、口味印象、適合時段與人工確認後的價格資訊。';
  return '以實際規格與使用情境為主，協助買家快速理解商品特色與適合族群。';
}

function mockProductSocialCopy(context) {
  if (/飲水機/.test(context)) return '讓毛孩日常喝水更方便，靜音循環、好清洗，適合貓狗家庭補水需求。';
  if (/外出包/.test(context)) return '短程外出更輕鬆，防潑水、好收納的小型犬外出包，陪你安心出門。';
  if (/牛肉麵|餐|飲|套餐|店/.test(context)) return '今天想吃得暖又有飽足感，可以把招牌餐點加入午晚餐清單。';
  return '把商品特色整理成好懂文案，發布前再確認規格、價格與庫存。';
}

function buildCommerceMockDraft(input = '', structure = {}) {
  const taskId = String(structure?.taskLine || '').toLowerCase();
  const productName = inferCommerceProductName(input);
  const isPetWaterFountain = /飲水機|活水|2\.5l|2.5L|靜音|濾芯|水位|貓|犬|寵物/i.test(input);
  const title = isPetWaterFountain
    ? '智能靜音寵物飲水機｜2.5L 循環活水，陪毛孩安心喝水'
    : `${productName}｜日常好用的精選商品`;
  const benefits = isPetWaterFountain
    ? ['2.5L 大容量，適合上班族與多寵家庭', '低噪音馬達，夜間使用也不打擾', '可拆洗水箱，日常清潔更方便', '透明水位窗，補水狀態一眼確認', '濾芯可協助過濾毛髮與雜質']
    : buildGenericCommerceBenefits(input);
  const description = isPetWaterFountain
    ? '以日常照顧為出發點，協助飼主提供更乾淨、穩定的流動飲水環境。適合貓咪、小型犬與多寵家庭使用。'
    : `${productName} 適合重視日常質感與使用便利性的顧客。建議在商品頁補充規格、尺寸、材質、使用方式與注意限制，讓顧客更容易判斷是否適合。`;
  const faq = isPetWaterFountain
    ? 'Q：適合貓咪和小型犬使用嗎？\nA：適合，建議依寵物體型、飲水習慣與商品規格評估。\n\nQ：多久需要清洗一次？\nA：建議依使用頻率定期清洗水箱與更換濾芯，並以商品說明為準。'
    : `Q：${productName} 適合哪些人使用？\nA：適合想提升日常使用便利性、並重視商品規格與使用情境的顧客。\n\nQ：購買前需要注意什麼？\nA：建議確認尺寸、材質、使用方式與保固或售後規則。`;
  const social = isPetWaterFountain
    ? '上班不在家，也希望毛孩有乾淨流動的飲水。這款智能靜音寵物飲水機，2.5L 大容量、低噪音、好清洗，適合日常照顧使用。'
    : `正在找一款更適合日常使用的 ${productName}？這份草稿可整理成商品頁描述、FAQ 與 LINE 社群貼文，發布前請再確認規格、價格與宣稱內容。`;
  const shortCopy = isPetWaterFountain ? '2.5L 大容量、低噪音、好清洗，讓毛孩日常喝水更穩定。' : `${productName}，讓日常使用更順手。`;
  const faqSocialMode = /faq|social|line|社群/i.test(taskId);

  return {
    guidedStructured: true,
    title: faqSocialMode ? 'FAQ / 社群文案草稿' : '商品文案草稿',
    summary: faqSocialMode ? '以下是 FAQ、LINE 社群貼文、短文案與注意事項草稿。' : '以下是商品標題、賣點、商品描述、FAQ 與 LINE / 社群文案草稿。',
    items: faqSocialMode
      ? [
        { section: 'FAQ 草稿', text: faq },
        { section: 'LINE 社群貼文', text: social },
        { section: '短文案', text: shortCopy },
        { section: '注意事項', text: '發布前請人工確認商品規格、價格、庫存、適用對象與限制。避免醫療、治療、保健療效或未經證實的效果宣稱。' }
      ]
      : [
        { section: '商品標題建議', text: title },
        { section: '商品賣點', text: benefits.map((item) => `- ${item}`).join('\n') },
        { section: '商品描述', text: description },
        { section: 'FAQ 草稿', text: faq },
        { section: 'LINE / 社群文案', text: social }
      ],
    warnings: ['AI 只產生草稿，不會直接新增、修改、刪除或發布正式資料。', '請人工確認商品規格、價格、庫存、宣稱內容與法規限制。', '請勿宣稱醫療效果、治療疾病或未經證實的保健療效。'],
    nextSteps: ['人工確認商品規格、價格、庫存與宣稱內容。', '確認無誤後，可複製到商品描述、FAQ 或 LINE 社群文案欄位。', 'AI 不會自動新增商品，也不會自動上架。']
  };
}

function buildCmsMockDraft(input = '') {
  const brandName = /mori|摩理|寵物/i.test(input) ? 'Mori Pet Life 摩理寵物生活' : inferBrandName(input);
  return {
    guidedStructured: true,
    title: '官網文案草稿',
    summary: '以下是 Banner、品牌介紹、首頁區塊、FAQ 與 SEO 描述草稿。',
    items: [
      { section: 'Banner 標題', text: `${brandName}｜陪毛孩過更舒服的日常` },
      { section: 'Banner 副標', text: '精選寵物飲水機、外出用品與居家收納，兼顧實用、乾淨與日常照顧需求。' },
      { section: '品牌介紹', text: `${brandName} 是以小型寵物用品為主的選物品牌，重視商品實用性、居家整潔與飼主的日常照顧體驗。` },
      { section: '首頁區塊文案', text: '從喝水、外出到居家整理，挑選更容易融入生活的寵物用品，讓照顧變得清楚、簡單、有秩序。' },
      { section: 'FAQ 草稿', text: 'Q：商品適合哪些寵物使用？\nA：請依商品規格、寵物體型與使用習慣評估。\n\nQ：購買前需要注意什麼？\nA：建議確認尺寸、材質、清潔方式與配送規則。' },
      { section: 'SEO 描述', text: `${brandName} 精選寵物飲水機、外出包、貓砂墊與收納用品，提供溫暖、專業、乾淨的寵物日常選物體驗。` }
    ],
    warnings: ['AI 只產生草稿，不會直接寫入 CMS，也不會自動發布官網。', '請人工確認品牌語氣、商品資訊、SEO 描述與聯絡資訊。'],
    nextSteps: ['人工確認品牌語氣、服務內容與 SEO 描述。', '確認無誤後，可複製到官網 Banner、首頁區塊、FAQ 或 SEO 欄位。', 'AI 不會自動寫入 CMS，也不會自動發布官網。']
  };
}

function inferCommerceProductName(input = '') {
  const named = extractSimpleField(input, ['商品名稱', '品名', '名稱']);
  if (named) return named;
  if (/飲水機/i.test(input)) return '智能靜音寵物飲水機';
  if (/外出包/i.test(input)) return '寵物外出包';
  if (/貓砂墊/i.test(input)) return '貓砂墊';
  if (/收納/i.test(input)) return '寵物用品收納盒';
  return '精選商品';
}

function inferBrandName(input = '') {
  return extractSimpleField(input, ['品牌名稱', '品牌', '店名']) || '品牌官網';
}

function extractSimpleField(input = '', labels = []) {
  for (const label of labels) {
    const match = input.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n，,。]+)`));
    if (match?.[1]) return cleanText(match[1]).slice(0, 50);
  }
  return '';
}

function buildGenericCommerceBenefits(input = '') {
  const hints = cleanText(input)
    .split(/[，,。；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && !/幫我|文案|商品名稱|品名/.test(item))
    .slice(0, 5);
  if (hints.length >= 3) return hints;
  return ['規格清楚，方便顧客快速判斷是否適合', '適合日常使用情境，降低選購疑慮', '可搭配 FAQ 說明材質、尺寸與注意事項', '適合放入商品頁、官網區塊與社群貼文'];
}

function guidedMockDraft(useCase, text, structure = {}) {
  const cleanInput = cleanText(text || '');
  if (useCase === 'commerce_product_copy' && structure.mode !== 'restaurant') {
    return buildCommerceMockDraft(cleanInput, structure);
  }
  if (useCase === 'cms_copy_draft' && structure.mode !== 'restaurant') {
    return buildCmsMockDraft(cleanInput);
  }
  const input = cleanText(text || '');
  const commonWarnings = ['此內容僅為 AI 草稿，尚未寫入正式資料。請人工確認規格、價格、庫存、法規與實際限制後再使用。'];

  if (useCase === 'commerce_product_copy' && structure.mode === 'restaurant') {
    const name = extractNamedValue(input, ['餐點名稱', '店家名稱', '店名']) || '餐飲主打品項';
    return {
      guidedStructured: true,
      title: '餐飲文案草稿',
      summary: `已依「${name}」整理菜單、外送平台與社群文案草稿，內容仍需人工確認後使用。`,
      items: [
        { section: '菜單文案', text: `${name}主打清楚的口味特色與用餐情境，適合放在菜單或點餐頁作為短版介紹。` },
        { section: '餐點特色', text: extractSentence(input, ['特色', '湯頭', '口味', '主打']) || '請凸顯口味、份量、食材與適合時段，避免誇大或宣稱療效。' },
        { section: '推薦語', text: `想吃有記憶點的一餐，可以從 ${name} 開始；正式上架前請確認價格、份量與供應時間。` },
        { section: '外送平台描述', text: `${name}適合以重點賣點、份量說明與外帶外送限制呈現，讓顧客快速判斷是否符合需求。` },
        { section: '社群文案', text: `今天想吃點有飽足感的選擇嗎？${name} 已準備好，適合午餐、晚餐或外帶分享。` }
      ],
      warnings: [...commonWarnings, '餐飲文案不得宣稱療效，不得亂編食材或價格。'],
      nextSteps: ['確認餐點名稱、價格、份量與供應限制。', '人工複製到菜單、外送平台或社群後再發布。']
    };
  }

  if (useCase === 'commerce_product_copy') {
    const name = extractNamedValue(input, ['商品名稱', '商品']) || inferProductName(input) || '商品';
    const feature = extractSentence(input, ['商品特色', '特色', '主打賣點', '賣點']) || '請補強商品特色、規格與使用情境。';
    const audience = extractSentence(input, ['適用對象', '目標客群']) || '請確認適用對象後再使用。';
    return {
      guidedStructured: true,
      title: '商品文案草稿',
      summary: `已依「${name}」整理商品標題、賣點、描述、FAQ 與社群文案草稿。`,
      items: [
        { section: '商品標題建議', text: `${name}，兼顧日常使用與便利整理` },
        { section: '商品賣點', text: feature },
        { section: '商品描述', text: `${name}適合${audience}。文案可聚焦使用情境、規格特色與日常便利性，讓使用者快速理解商品如何協助日常照護。` },
        { section: 'FAQ', text: `這項商品適合誰使用？可依實際規格回答，例如 ${audience}。正式上架前請確認材質、尺寸、容量與保固資訊。` },
        { section: 'LINE 社群文案', text: `${name} 新品草稿：把日常需求整理得更簡單，歡迎確認規格與使用情境後再上架或分享。` }
      ],
      warnings: [...commonWarnings, '不可編造材質、療效、保證效果或不存在的規格。'],
      nextSteps: ['確認商品規格、價格、庫存與法規標示。', '人工複製文案到商品或 CMS 後再發布。']
    };
  }

  if (useCase === 'business_summary') {
    const mode = structure.mode || 'commerce';
    const sections = mode === 'engineering'
      ? ['案場進度', '收款風險', '毛利提醒', '優先處理事項']
      : mode === 'restaurant'
        ? ['營業概況', '食材成本', '尖峰與出餐', '活動建議']
        : ['營運摘要', '庫存風險', '銷售機會', '客服改善'];
    return {
      guidedStructured: true,
      title: '經營摘要草稿',
      summary: '已依輸入內容整理營運重點、風險提醒與下一步建議，未讀取或修改正式報表資料。',
      items: sections.map((section) => ({ section, text: buildBusinessMockText(section, input) })),
      warnings: commonWarnings,
      nextSteps: ['人工確認數字來源與期間。', '將高風險項目排入待辦，再由使用者手動處理。']
    };
  }

  return null;
}

function extractNamedValue(text, labels = []) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*([^。\\n，,]+)`);
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]).slice(0, 40);
  }
  return '';
}

function extractSentence(text, labels = []) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*([^。\\n]+)`);
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]).slice(0, MAX_ITEM_LENGTH);
  }
  return cleanText(text).split(/[。；;\n]/).find((line) => line.length >= 8) || '';
}

function inferProductName(text) {
  if (/寵物飲水機|飲水機/.test(text)) return '智能靜音寵物飲水機';
  if (/寵物外出包|外出包/.test(text)) return '寵物外出包';
  return '';
}

function buildBusinessMockText(section, input) {
  const source = cleanText(input).slice(0, 120);
  if (/庫存/.test(section)) return `依目前輸入，需優先注意庫存偏低品項與補貨時程。參考內容：${source}`;
  if (/客服/.test(section)) return `可改善詢問單回覆速度，先整理常見問題與回覆草稿，再由人工確認後使用。`;
  if (/收款/.test(section)) return `請確認已收款、未收款與逾期狀態，AI 只提供風險整理，不會建立收款資料。`;
  return `依輸入內容整理「${section}」重點，正式判斷仍需人工確認。參考內容：${source}`;
}

function mockDraft(useCase, text, structure = {}) {
  return guidedMockDraft(useCase, text, structure) || cleanMockDraft(useCase, text);
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

function normalizeDraft(draft, useCase = '', useCaseConfig = {}, sanitized = {}) {
  if (draft?.needsMoreInfo) {
    return {
      title: cleanText(draft.title || '需要補充更多資訊').slice(0, 200),
      summary: cleanText(draft.summary || '目前資訊仍不足，建議補充更多資料後再產生較完整草稿。').slice(0, MAX_SUMMARY_LENGTH),
      items: normalizeDraftItems(draft.items, useCase, sanitized),
      warnings: dedupeWarnings(Array.isArray(draft.warnings) ? draft.warnings.map((item) => cleanText(item)).filter(Boolean) : []),
      nextSteps: Array.isArray(draft.nextSteps) ? draft.nextSteps.map((item) => cleanText(item)).filter(Boolean).slice(0, 6) : [],
      needsMoreInfo: true,
      missingInfo: Array.isArray(draft.missingInfo) ? draft.missingInfo.map((item) => cleanText(item)).filter(Boolean).slice(0, 8) : []
    };
  }
  if (useCase === 'engineering_estimate_draft') {
    return validateDraftQuality(normalizeEngineeringDraft(draft, useCaseConfig, sanitized), useCase, sanitized);
  }
  if (draft?.guidedStructured && useCase === 'commerce_product_copy' && /FAQ\s*\/\s*社群|社群文案/.test(draft.title || '')) {
    return {
      title: cleanText(draft.title || 'FAQ / 社群文案草稿').slice(0, 200),
      summary: cleanText(draft.summary || '以下是 FAQ、LINE 社群貼文、短文案與注意事項草稿。').slice(0, MAX_SUMMARY_LENGTH),
      items: asArray(draft.items).map((item) => normalizeDraftItem(item, sanitized)).filter(Boolean).slice(0, 6),
      warnings: dedupeWarnings(Array.isArray(draft.warnings) ? draft.warnings.map((item) => cleanText(item)).filter(Boolean) : []),
      nextSteps: Array.isArray(draft.nextSteps) ? draft.nextSteps.map((item) => cleanText(item)).filter(Boolean).slice(0, 6) : [],
      needsMoreInfo: false,
      missingInfo: []
    };
  }
  if (draft?.guidedStructured) {
    return validateDraftQuality({
      title: cleanText(draft.title || 'AI 草稿').slice(0, 200),
      summary: cleanText(draft.summary || '').slice(0, MAX_SUMMARY_LENGTH),
      items: normalizeDraftItems(draft.items, useCase, sanitized),
      warnings: dedupeWarnings(Array.isArray(draft.warnings) ? draft.warnings.map((item) => cleanText(item)).filter(Boolean) : []),
      nextSteps: Array.isArray(draft.nextSteps) ? draft.nextSteps.map((item) => cleanText(item)).filter(Boolean).slice(0, 6) : [],
      needsMoreInfo: false,
      missingInfo: []
    }, useCase, sanitized);
  }
  const formatted = formatDraftForUseCase(useCase, draft, useCaseConfig);
  const value = draft && typeof draft === 'object' ? draft : {};
  const source = formatted && typeof formatted === 'object'
    ? { ...formatted, needsMoreInfo: value.needsMoreInfo, missingInfo: value.missingInfo }
    : value;
  const normalized = {
    title: cleanText(source.title || 'AI 草稿').slice(0, 200),
    summary: cleanText(source.summary || '').slice(0, MAX_SUMMARY_LENGTH),
    items: normalizeDraftItems(source.items, useCase, sanitized),
    warnings: dedupeWarnings(Array.isArray(source.warnings) ? source.warnings.map((item) => cleanText(item)).filter(Boolean) : []),
    nextSteps: Array.isArray(source.nextSteps) ? source.nextSteps.map((item) => cleanText(item)).filter(Boolean) : [],
    needsMoreInfo: Boolean(source.needsMoreInfo),
    missingInfo: Array.isArray(source.missingInfo) ? source.missingInfo.map((item) => cleanText(item)).filter(Boolean).slice(0, 8) : []
  };

  return validateDraftQuality(normalized, useCase, sanitized);
}

function normalizeText(value, options = {}) {
  return cleanText(value, options);
}

function compactForQuality(value) {
  return normalizeText(value)
    .replace(/[：:。.,，、\s/／_-]/g, '')
    .toLowerCase();
}

function isPlaceholderText(value) {
  const compact = compactForQuality(value);
  if (!compact) return true;
  return PLACEHOLDER_TEXTS.has(compact);
}

function isMostlyEnglish(value) {
  const text = String(value || '');
  const ascii = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return ascii > 12 && ascii > cjk * 2;
}

function isMojibakeText(value) {
  const text = String(value || '');
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const controls = (text.match(/[\u0080-\u009F]/g) || []).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  return replacement > 0 || controls > 0 || questionMarks >= 5;
}

function ensureChineseForChineseInput(value, sanitized = {}) {
  const text = normalizeText(value, { preferChinese: hasCjk(sanitized?.text) });
  if (!hasCjk(sanitized?.text)) return text;
  if (ENGLISH_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return '';
  if (isMostlyEnglish(text)) return '';
  return text;
}

function isLowQualityText(value, sanitized = {}) {
  const text = normalizeText(value, { preferChinese: hasCjk(sanitized?.text) });
  if (!text) return true;
  if (isMojibakeText(text)) return true;
  if (isPlaceholderText(text)) return true;
  if (/^\s*(name|description|currency|type|duration)\s*[:：]?\s*$/i.test(text)) return true;
  if (/\b(undefined|null|\[object Object\])\b/i.test(text)) return true;
  if (/^[{}\[\],":\s]+$/.test(text)) return true;
  if (hasCjk(sanitized?.text) && ensureChineseForChineseInput(text, sanitized) === '') return true;
  return false;
}

const GUARDED_SCENE_TERMS = [
  '酒店', '旅館', '飯店', '民宿', '餐廳', '店面', '辦公室', '工廠', '學校', '醫院',
  '商場', '百貨', '豪宅', '別墅', '透天', '套房', '大樓', '倉庫', '廠房',
  '商業空間', '商辦', '辦公大樓'
];

function detectSceneTerms(value = '') {
  const text = normalizeText(value);
  return GUARDED_SCENE_TERMS.filter((term) => text.includes(term));
}

function inputSceneFallback(sanitized = {}) {
  const input = normalizeText(sanitized?.text || '');
  if (/老公寓|公寓/.test(input)) return '老公寓';
  if (/住宅|住家/.test(input)) return '住宅';
  if (/教室|學校|國小/.test(input)) return '學校';
  if (/餐廳|小吃店|牛肉麵/.test(input)) return '餐飲空間';
  return '實際案場';
}

function isSceneHallucination(value, sanitized = {}, useCase = '') {
  if (useCase !== 'engineering_estimate_draft') return false;
  const input = normalizeText(sanitized?.text || '');
  const outputTerms = detectSceneTerms(value);
  return outputTerms.some((term) => !input.includes(term));
}

function sanitizeHallucinatedSceneTerms(value, sanitized = {}, useCase = '') {
  let text = normalizeText(value, { preferChinese: hasCjk(sanitized?.text) });
  if (!text || useCase !== 'engineering_estimate_draft') return text;
  const input = normalizeText(sanitized?.text || '');
  const fallback = inputSceneFallback(sanitized);
  for (const term of GUARDED_SCENE_TERMS) {
    if (text.includes(term) && !input.includes(term)) {
      text = text.replaceAll(term, fallback);
    }
  }
  return cleanText(text);
}

function repairSceneMismatchDraft() {
  return {
    title: '工程估價草稿需要重新產生',
    summary: 'AI 草稿中出現與輸入不一致的案場類型，請重新產生或補充案場資訊。',
    items: [],
    warnings: ['AI 不應自行改寫案場類型，請以實際案場為準。'],
    nextSteps: ['確認案場類型、施工範圍、樓層與現場限制後重新產生。']
  };
}

function isLikelyIrrelevant(value, sanitized = {}, useCase = '') {
  const text = normalizeText(value);
  const input = normalizeText(sanitized?.text || '');
  if (!text) return false;
  if (isSceneHallucination(text, sanitized, useCase)) return true;
  if (IRRELEVANT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (
    useCase === 'commerce_product_copy' &&
    /寵物|飲水機|外出包|貓|狗/.test(input) &&
    /水果|營養|醫療|療效|保健|食材|配方/.test(text)
  ) {
    return true;
  }
  return false;
}

function dedupeWarnings(warnings = []) {
  const seen = new Set();
  return asArray(warnings)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.replace(/\s+/g, '').toLowerCase();
      if (!key || seen.has(key) || key === compactForQuality(DEFAULT_DISCLAIMER)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function normalizeDraftItems(items, useCase = '', sanitized = {}) {
  const limit = useCase === 'engineering_estimate_draft' ? 11 : 8;
  return asArray(items)
    .map((item) => normalizeDraftItem(item, sanitized))
    .map((item) => sanitizeDraftItemForConsistency(item, sanitized, useCase))
    .filter(Boolean)
    .filter((item) => {
      const text = typeof item === 'string' ? normalizeText(item) : normalizeText(Object.values(item).join(' '));
      return !isLowQualityText(text, sanitized) && !isLikelyIrrelevant(text, sanitized, useCase);
    })
    .slice(0, limit);
}

function sanitizeDraftItemForConsistency(item, sanitized = {}, useCase = '') {
  if (!item) return null;
  if (typeof item === 'string') return sanitizeHallucinatedSceneTerms(item, sanitized, useCase);
  if (typeof item === 'object' && !Array.isArray(item)) {
    return Object.fromEntries(Object.entries(item).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeHallucinatedSceneTerms(value, sanitized, useCase) : value
    ]));
  }
  return item;
}

function repairLowQualityDraft(useCase = '') {
  if (useCase === 'commerce_product_copy') {
    return {
      title: '商品文案草稿需要更多資訊',
      summary: 'AI 草稿內容不足，請補充商品特色、適用對象、材質、用途或注意事項後重新產生。',
      items: [],
      warnings: ['目前草稿內容不足，尚不建議直接使用。'],
      nextSteps: [
        '補充商品特色、用途、目標客群與差異化賣點後重新產生。',
        '人工確認商品規格、價格、庫存與法規標示。'
      ]
    };
  }

  return {
    title: 'AI 草稿內容不足',
    summary: 'AI 草稿內容不足，請補充更多資訊後重新產生。',
    items: [],
    warnings: ['目前草稿內容不足，尚不建議直接使用。'],
    nextSteps: ['補充更完整的背景、目標、限制條件與需要產出的內容後重新產生。']
  };
}

function ensureCommerceMinimumSections(items = [], sanitized = {}) {
  const input = normalizeText(sanitized?.text || '');
  const name = extractNamedValue(input, ['商品名稱', '商品']) || inferProductName(input) || '商品';
  const feature = extractSentence(input, ['商品特色', '特色', '主打賣點', '賣點']) || input;
  const audience = extractSentence(input, ['適用對象', '目標客群']) || '目標使用者';
  const existing = new Map();

  asArray(items).forEach((item) => {
    const section = normalizeText(item?.section || item?.title || item?.label || '');
    const text = normalizeText(item?.text || item?.description || item?.content || '');
    const key = commerceSectionKey(section || text);
    if (key && text && !existing.has(key)) existing.set(key, { section: commerceSectionLabel(key), text });
  });

  const fallbacks = {
    title: `${name}，讓日常使用更安心便利`,
    benefits: buildCommerceBenefits(input, feature),
    description: `${name}適合${audience}。文案可聚焦商品特色、規格、使用情境與日常便利性，讓使用者快速理解商品如何協助日常照護。`,
    faq: `Q：適合哪些對象使用？\nA：適合${audience}，正式上架前請確認規格、材質、容量、保固與使用限制。`,
    social: `上班或日常忙碌時，也希望使用更省心？${name} 主打${compactBenefit(feature)}，適合確認規格後作為 LINE 或社群貼文草稿。`
  };

  return ['title', 'benefits', 'description', 'faq', 'social'].map((key) => existing.get(key) || {
    section: commerceSectionLabel(key),
    text: fallbacks[key]
  });
}

function commerceSectionKey(value = '') {
  const rawSection = normalizeText(value).toLowerCase();
  if (/商品標題|標題建議|title/.test(rawSection)) return 'title';
  if (/商品賣點|賣點|selling|benefit/.test(rawSection)) return 'benefits';
  if (/商品描述|描述|description/.test(rawSection)) return 'description';
  if (/faq|常見問題/.test(rawSection)) return 'faq';
  if (/line|社群|貼文|social/.test(rawSection)) return 'social';
  const text = normalizeText(value).toLowerCase();
  if (/商品標題|標題|title/.test(text)) return 'title';
  if (/商品賣點|賣點|selling|benefit/.test(text)) return 'benefits';
  if (/商品描述|描述|description/.test(text)) return 'description';
  if (/faq|常見問題|問答/.test(text)) return 'faq';
  if (/line|社群|貼文|social/.test(text)) return 'social';
  return '';
}

function commerceSectionLabel(key) {
  const cleanLabels = {
    title: '商品標題建議',
    benefits: '商品賣點',
    description: '商品描述',
    faq: 'FAQ 草稿',
    social: 'LINE / 社群文案'
  };
  if (cleanLabels[key]) return cleanLabels[key];
  return {
    title: '商品標題建議',
    benefits: '商品賣點',
    description: '商品描述',
    faq: 'FAQ 草稿',
    social: 'LINE / 社群文案'
  }[key] || key;
}

function buildCommerceBenefits(input = '', feature = '') {
  const text = normalizeText(feature || input);
  const parts = text
    .split(/[、，,。；;\n]/)
    .map((item) => cleanText(item))
    .filter((item) => item.length >= 2)
    .slice(0, 5);
  if (parts.length) return parts.map((item) => `- ${item}`).join('\n');
  return '- 請補充商品特色、規格與使用情境後再確認文案。';
}

function compactBenefit(value = '') {
  const text = normalizeText(value).split(/[。；;\n]/)[0] || '便利、清楚且可人工確認的商品特色';
  return text.slice(0, 80);
}

function validateDraftQuality(draft, useCase = '', sanitized = {}) {
  const title = ensureChineseForChineseInput(draft.title, sanitized);
  const summary = ensureChineseForChineseInput(draft.summary, sanitized);
  const items = normalizeDraftItems(draft.items, useCase, sanitized);
  const combined = [title, summary, ...items.map((item) => Object.values(item).join(' '))].join(' ');

  if (useCase === 'engineering_estimate_draft' && isSceneHallucination(combined, sanitized, useCase)) {
    return repairSceneMismatchDraft();
  }

  if (
    isLowQualityText(title, sanitized) ||
    isLowQualityText(summary, sanitized) ||
    isLikelyIrrelevant(combined, sanitized, useCase)
  ) {
    return repairLowQualityDraft(useCase);
  }

  if (useCase === 'commerce_product_copy') {
    const isFaqSocialDraft = /FAQ\s*\/\s*社群|社群文案/.test(draft.title || '') ||
      items.some((item) => /注意事項|LINE 社群貼文|短文案/.test(String(item?.section || item?.title || item?.label || '')));
    const minimumItems = sanitized?.structure?.mode === 'restaurant' || isFaqSocialDraft
      ? items
      : ensureCommerceMinimumSections(items, sanitized);
    const minimumCombined = [title, summary, ...minimumItems.map((item) => Object.values(item).join(' '))].join(' ');
    const enoughContent = isFaqSocialDraft ? minimumItems.length >= 4 : minimumItems.length >= 5 && minimumCombined.length >= 120;
    if (!enoughContent && sanitized?.structure?.mode !== 'restaurant') return repairLowQualityDraft(useCase);
    return {
      ...draft,
      title,
      summary,
      items: minimumItems,
      warnings: dedupeWarnings(draft.warnings),
      nextSteps: asArray(draft.nextSteps).map((item) => normalizeText(item)).filter((item) => !isPlaceholderText(item)).slice(0, 6)
    };
  }

  return {
    ...draft,
    title,
    summary,
    items,
    warnings: dedupeWarnings(draft.warnings),
    nextSteps: asArray(draft.nextSteps).map((item) => normalizeText(item)).filter((item) => !isPlaceholderText(item)).slice(0, 6)
  };
}

function normalizeDraftItem(item, sanitized = {}) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const entries = Object.entries(item)
      .filter(([key]) => !INTERNAL_FIELD_LABELS.has(String(key).toLowerCase()))
      .map(([key, value]) => [key, ensureChineseForChineseInput(value, sanitized).slice(0, MAX_ITEM_LENGTH)])
      .filter(([key, value]) => {
        if (!value) return false;
        if (['section', 'title', 'category', 'label'].includes(String(key).toLowerCase())) return true;
        return !isPlaceholderText(value);
      });
    return entries.length ? Object.fromEntries(entries) : null;
  }
  const text = ensureChineseForChineseInput(stripInternalFieldPrefix(item), sanitized).slice(0, MAX_ITEM_LENGTH);
  return text && !isPlaceholderText(text) ? text : null;
}
