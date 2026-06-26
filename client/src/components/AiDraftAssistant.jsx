import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const constructionIndustries = new Set([
  'construction',
  'painting',
  'water_electric',
  'masonry',
  'interior',
  'aircon_repair',
  'waterproof',
  'demolition',
  'low_voltage',
  'other_construction',
  'painting_water_electric'
]);

const restaurantIndustries = new Set(['restaurant', 'food', 'dining', 'beverage']);
const commerceIndustries = new Set(['ecommerce', 'hosted_commerce', 'marketplace', 'social_commerce', 'retail']);

const workflows = [
  {
    id: 'engineering',
    edition: 'engineering',
    title: '工程 AI 助手',
    description: '適合估價草稿、標案摘要、案場內容整理。',
    tags: ['估價草稿', '標案摘要', '工程摘要'],
    tasks: [
      {
        id: 'estimate',
        label: '建立估價草稿',
        useCase: 'engineering_estimate_draft',
        hint: '輸入工程範圍、面積、樓層、施工限制與需要注意的條件。',
        placeholder: '請描述工程內容，例如：\n室內油漆工程，約 25 坪，含天花板，4 樓無電梯，牆面需局部修補。'
      },
      {
        id: 'tender',
        label: '分析標案內容',
        useCase: 'tender_summary',
        hint: '貼上標案重點，BookAI 會整理重點、風險與下一步。',
        placeholder: '請貼上標案重點，例如：\n機關名稱、標案名稱、預算、截止日、工程範圍、資格條件或備註。'
      },
      {
        id: 'engineering-summary',
        label: '產生工程摘要',
        useCase: 'business_summary',
        hint: '整理案場、成本、進度、標案追蹤或收款風險。',
        placeholder: '請輸入工程或案場重點，例如：\n本月進場項目、已完成工項、追加事項、待確認材料、收款或驗收風險。'
      }
    ]
  },
  {
    id: 'brand-commerce',
    edition: 'commerce',
    title: '品牌 / 電商 AI 助手',
    description: '適合商品文案、官網內容、FAQ、SEO 與社群文案。',
    tags: ['商品內容', '官網文案', 'FAQ / 社群'],
    tasks: [
      {
        id: 'product-copy',
        label: '產生商品內容',
        useCase: 'commerce_product_copy',
        hint: '輸入商品資訊後產生商品標題、賣點、描述與 FAQ 草稿。',
        placeholder: '請描述商品資訊，例如：\n商品名稱、特色、適用族群、材質、用途、注意事項。'
      },
      {
        id: 'homepage-copy',
        label: '產生官網首頁文案',
        useCase: 'cms_copy_draft',
        hint: '整理品牌定位、服務內容與首頁區塊文案。',
        placeholder: '請描述品牌或服務，例如：\n品牌定位、服務內容、目標客群、想傳達的專業感。'
      },
      {
        id: 'faq-social',
        label: '產生 FAQ / 社群文案',
        useCase: 'commerce_product_copy',
        hint: '產生可人工編輯的 FAQ、貼文或短文案草稿。',
        placeholder: '請描述想溝通的商品、服務或活動，例如：\n常見問題、主打特色、活動檔期、社群語氣與希望客戶採取的行動。'
      }
    ]
  },
  {
    id: 'restaurant',
    edition: 'restaurant',
    title: '餐飲 AI 助手',
    description: '適合菜單文案、活動內容、店家介紹與外送平台文案。',
    tags: ['菜單文案', '活動文案', '店家介紹'],
    tasks: [
      {
        id: 'menu-copy',
        label: '產生菜單文案',
        useCase: 'commerce_product_copy',
        hint: '以餐點、飲品或套餐特色產生菜單描述草稿。',
        placeholder: '請描述餐點、飲品、套餐或店家特色，例如：\n招牌牛肉麵，湯頭濃郁，牛肉軟嫩，適合午餐與晚餐，主打平價飽足。'
      },
      {
        id: 'campaign-copy',
        label: '產生活動文案',
        useCase: 'cms_copy_draft',
        hint: '整理檔期、優惠、主打餐點與活動宣傳草稿。',
        placeholder: '請描述活動內容，例如：\n週末雙人套餐，含主餐、飲品與甜點，適合家庭聚餐，主打平價與快速出餐。'
      },
      {
        id: 'store-copy',
        label: '產生店家介紹 / 外送平台文案',
        useCase: 'cms_copy_draft',
        hint: '產生店家介紹、外送平台簡介或社群短文案。',
        placeholder: '請描述店家特色，例如：\n社區型牛肉麵店，重視湯頭與份量，適合上班族午餐與家庭晚餐。'
      }
    ]
  },
  {
    id: 'business',
    edition: 'all',
    title: '經營分析 AI 助手',
    description: '適合營運摘要、收款風險、毛利提醒與下一步建議。',
    tags: ['經營摘要', '收款風險', '下一步建議'],
    tasks: [
      {
        id: 'monthly-summary',
        label: '產生本月經營摘要',
        useCase: 'business_summary',
        hint: '整理本月營運重點、風險提醒與下一步建議。',
        placeholder: '請輸入本月營運重點，例如：\n營收、收款、成本、案場、商品、庫存或需要注意的狀況。'
      },
      {
        id: 'receivable-risk',
        label: '分析收款風險',
        useCase: 'business_summary',
        hint: '輸入應收款、逾期、客戶或案場資訊，整理風險與追蹤順序。',
        placeholder: '請輸入收款狀況，例如：\n未收款客戶、金額、逾期天數、對方回覆、是否影響現金流或案場進度。'
      },
      {
        id: 'next-actions',
        label: '整理下一步建議',
        useCase: 'business_summary',
        hint: '輸入目前卡住的營運問題，整理可執行的優先順序。',
        placeholder: '請輸入需要整理的經營狀況，例如：\n毛利偏低、庫存偏高、案場延誤、收款延遲、下週需要優先處理的事項。'
      }
    ]
  }
];

const editionAiScopes = {
  engineering: {
    title: '工程版 AI 可協助作業',
    items: [
      {
        title: '工程估價草稿',
        points: ['協助整理工項、單位、數量、注意事項', '僅供估價前整理，不直接新增估價明細']
      },
      {
        title: '標案摘要與追蹤判斷',
        points: ['協助整理標案重點、截止日、風險提醒與下一步', '不直接匯入接案中心，不直接建立案場']
      },
      {
        title: '案場 / 工程摘要',
        points: ['協助整理案場進度、收款狀況、成本風險與待辦事項', '不直接修改案場資料']
      },
      {
        title: '報價 / 請款文字草稿，未來可擴充',
        points: ['協助產生正式但需人工確認的文字', '不直接送出報價或請款']
      }
    ]
  },
  commerce: {
    title: '電商版 AI 可協助作業',
    items: [
      {
        title: '商品文案草稿',
        points: ['協助整理商品標題、賣點、商品描述、FAQ', '不直接新增商品，不直接上架']
      },
      {
        title: '官網內容草稿',
        points: ['協助產生 Banner、首頁區塊、品牌介紹、SEO 描述', '不直接寫入 CMS，不直接發布官網']
      },
      {
        title: '社群 / LINE 行銷文案草稿',
        points: ['協助產生活動文案、社群貼文、群發文案', '不直接發送訊息']
      },
      {
        title: '客服回覆草稿，未來可擴充',
        points: ['協助整理常見問題與回覆語氣', '不直接代替客服發送']
      }
    ]
  },
  restaurant: {
    title: '餐飲版 AI 可協助作業',
    items: [
      {
        title: '菜單文案草稿',
        points: ['協助整理餐點名稱、特色、口味描述、推薦語', '不直接新增菜單，不直接改價格']
      },
      {
        title: '活動文案草稿',
        points: ['協助產生套餐活動、節慶活動、外帶優惠文案', '不直接發布活動']
      },
      {
        title: '店家介紹 / 外送平台文案',
        points: ['協助整理店家特色、品牌故事、平台介紹文字', '不直接同步外送平台']
      },
      {
        title: '餐飲經營摘要，未來可擴充',
        points: ['協助整理食材成本、熱銷餐點、訂單高峰與改善建議', '不直接修改營運資料']
      }
    ]
  },
  all: {
    title: '全功能測試模式',
    intro: '目前為全功能測試模式，可檢視所有 AI 助手。實際會員會依版本只顯示對應的 AI 作業範圍。',
    items: [
      { title: '工程 AI', points: ['估價、標案、案場摘要'] },
      { title: '電商 AI', points: ['商品、官網、社群文案'] },
      { title: '餐飲 AI', points: ['菜單、活動、店家介紹'] },
      { title: '經營分析 AI', points: ['依版本調整摘要方向'] }
    ]
  }
};

const placeholderLabels = new Set([
  '賣點',
  '商品描述',
  'FAQ',
  'FAQ 草稿',
  '社群文案',
  '標題',
  '摘要',
  '說明',
  '下一步',
  '注意事項',
  '商品標題建議',
  '商品賣點',
  '官網文案',
  'Banner 標題',
  '首頁區塊文案',
  '工項名稱',
  '建議數量',
  '建議單位',
  'Product Title',
  'Product Description',
  'Key Selling Points',
  'Animal Water Bottle',
  'Product Name',
  'Description',
  'Social Post'
].map((item) => item.toLowerCase()));

function inferEdition({ company, isFounder, founderEdition }) {
  if (isFounder) return ['engineering', 'commerce', 'all'].includes(founderEdition) ? founderEdition : 'commerce';

  const productLine = String(company?.product_line || company?.productLine || '').toLowerCase();
  const industry = String(company?.industry || company?.industry_type || company?.industryType || '').toLowerCase();

  if (productLine === 'engineering' || constructionIndustries.has(industry)) return 'engineering';
  if (['restaurant', 'food', 'dining', 'beverage'].includes(productLine) || restaurantIndustries.has(industry)) return 'restaurant';
  if (productLine === 'commerce' || commerceIndustries.has(industry)) return 'commerce';
  return 'commerce';
}

function editionMessage(edition, isFounder) {
  if (edition === 'all') {
    return '目前為全功能測試模式，可檢視所有 AI 助手。實際會員會依版本顯示對應 AI 助手。';
  }
  if (edition === 'engineering') {
    return 'BookAI 已依工程版開啟工程 AI 助手，協助估價、標案與案場摘要。';
  }
  if (edition === 'restaurant') {
    return 'BookAI 已依餐飲版開啟餐飲 AI 助手，協助菜單文案、活動內容與店家介紹。';
  }
  if (!isFounder && !edition) return '目前無法判斷版本，已啟用最保守的 AI 模式。';
  return 'BookAI 已依電商版開啟品牌 / 電商 AI 助手，協助商品文案、官網內容與社群草稿。';
}

function getVisibleWorkflows(edition) {
  if (edition === 'all') return workflows;
  if (edition === 'engineering') return workflows.filter((item) => item.id === 'engineering');
  if (edition === 'restaurant') return workflows.filter((item) => item.id === 'restaurant');
  return workflows.filter((item) => item.id === 'brand-commerce');
}

function workflowNotice(workflowId) {
  if (workflowId === 'engineering') {
    return 'AI 只產生工程草稿，不會新增估價項目、案場、報價、請款或結案資料。';
  }
  if (workflowId === 'brand-commerce') {
    return 'AI 只產生文案草稿，不會新增 CMS、商品、材料，也不會發布官網。';
  }
  if (workflowId === 'restaurant') {
    return 'AI 只產生餐飲文案草稿，不會新增菜單、POS、外送平台或食材庫存資料。';
  }
  return 'AI 只產生經營摘要草稿，不會修改報表、收款、會計或正式營運資料。';
}

function guidedPlaceholder(task) {
  const placeholders = {
    estimate: '請描述工程需求，例如：\n台中南區 25 坪老公寓油漆，4 樓無電梯，牆面有壁癌，需要整理估價草稿。',
    tender: '請貼上標案重點，例如：\n機關、標案名稱、預算、截止日、工作範圍、資格條件或案號。',
    'product-copy': '請描述商品資訊，例如：\n商品名稱、特色、適用對象、規格、使用情境與主打賣點。',
    'homepage-copy': '請描述品牌或服務，例如：\n品牌名稱、服務內容、目標客群、品牌語氣與主要優勢。',
    'faq-social': '請描述商品、服務、活動或常見問題，例如：\n商品特色、活動檔期、社群語氣、希望客戶採取的行動。',
    'menu-copy': '請描述餐點、飲品、套餐或店家特色，例如：\n招牌牛肉麵，湯頭濃郁，牛肉軟嫩，適合午餐與晚餐，主打平價飽足。',
    'campaign-copy': '請描述餐飲活動，例如：\n套餐內容、活動期間、優惠方式、目標客群、內用或外帶限制。',
    'store-copy': '請描述店家特色，例如：\n店家類型、招牌餐點、品牌故事、目標客群、外送平台想呈現的重點。',
    'monthly-summary': '請輸入營運重點，例如：\n本月營收、成本、收款、庫存、熱銷項目、目前問題與想分析的期間。',
    'receivable-risk': '請輸入收款或營運風險，例如：\n未收款金額、逾期天數、客戶回覆、庫存或成本壓力、想優先處理的問題。',
    'next-actions': '請輸入需要整理的經營狀況，例如：\n毛利偏低、庫存偏高、案場延誤、收款延遲、下週需要優先處理的事項。'
  };
  return placeholders[task?.id] || task?.placeholder || '';
}

function EditionScopeCard({ scope }) {
  if (!scope) return null;
  return (
    <section className="ai-edition-scope">
      <div>
        <h2>{scope.title}</h2>
        {scope.intro && <p>{scope.intro}</p>}
      </div>
      <div className="ai-edition-scope-grid">
        {scope.items.map((item) => (
          <article key={item.title}>
            <strong>{item.title}</strong>
            <ul>
              {item.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <p className="ai-edition-safety">AI 內容僅供草稿與輔助判斷，正式資料仍需由使用者人工確認後操作。</p>
    </section>
  );
}

function cleanPreviewText(value) {
  return String(value ?? '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/[{}[\]"]/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\b(undefined|null|\[object Object\])\b/gi, '')
    .replace(/^\s*(name|description|currency|type|duration)\s*:\s*/gim, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPlaceholderText(value) {
  const text = cleanPreviewText(value).replace(/[：:。.\s]/g, '').toLowerCase();
  if (!text) return true;
  return placeholderLabels.has(text) || text.length <= 1;
}

function compactLines(value, limit = 8) {
  return cleanPreviewText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isPlaceholderText(line))
    .slice(0, limit);
}

function providerStatusText(result) {
  const provider = result?.provider || result?.mode || '';
  if (provider === 'ollama') return `本機 AI：Ollama${result?.model ? ` · ${result.model}` : ''}`;
  if (provider === 'mock') return '測試模式：Mock Provider';
  if (provider === 'disabled') return 'AI 已停用';
  if (result?.status && result.status !== 'ok') return '本機 AI 未啟動';
  return '';
}

function uniqueList(values, fallback = []) {
  const seen = new Set();
  return [...(Array.isArray(values) ? values : []), ...fallback]
    .flatMap((item) => compactLines(item, 4))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function itemTitle(item, index) {
  if (item?.workItem) return cleanPreviewText(item.workItem);
  if (item?.section) return cleanPreviewText(item.section);
  if (item?.title) return cleanPreviewText(item.title);
  if (typeof item === 'string') return cleanPreviewText(item).slice(0, 80);
  return `草稿項目 ${index + 1}`;
}

function itemDescription(item) {
  if (item?.note) return cleanPreviewText(item.note);
  if (item?.text) return cleanPreviewText(item.text);
  if (item?.summary) return cleanPreviewText(item.summary);
  if (typeof item === 'string') return cleanPreviewText(item);
  return cleanPreviewText(Object.values(item || {}).filter(Boolean).join(' / '));
}

function buildPreviewItems(result) {
  const draft = result?.draft || {};
  const items = Array.isArray(draft.items) ? draft.items : [];
  const useCase = result?.useCase || '';

  return items.map((item, index) => {
    const base = {
      id: `${useCase || 'draft'}-${index}`,
      checked: true,
      useCase,
      type: item?.workItem ? '估價明細草稿' : cleanPreviewText(item?.section || '草稿段落'),
      title: itemTitle(item, index),
      description: itemDescription(item)
    };

    if (useCase === 'engineering_estimate_draft') {
      return {
        ...base,
        type: '估價明細草稿',
        title: cleanPreviewText(item?.workItem || base.title),
        quantity: cleanPreviewText(item?.quantity || '待確認'),
        unit: cleanPreviewText(item?.unit || '待確認'),
        note: cleanPreviewText(item?.note || base.description),
        confirmNeeded: cleanPreviewText(item?.confirmNeeded || item?.confirm || item?.needConfirm || '')
      };
    }

    return base;
  }).filter((item) => {
    const main = item.useCase === 'engineering_estimate_draft' ? item.note : item.description;
    return !isPlaceholderText(item.title) && !isPlaceholderText(main);
  });
}

function basicInfoEntries(info = {}) {
  const labels = {
    site: '案場',
    area: '地區',
    floor: '樓層 / 電梯',
    size: '坪數',
    layout: '房型',
    scope: '施工範圍',
    material: '材料偏好',
    limits: '現場限制',
    needs: '需求'
  };
  return Object.entries(labels)
    .map(([key, label]) => ({ label, value: cleanPreviewText(info?.[key]) }))
    .filter((item) => item.value);
}

function buildDraftText({ title, summary, previewItems, warnings, nextSteps }) {
  const lines = [
    cleanPreviewText(title || 'BookAI AI 草稿'),
    '',
    '摘要',
    cleanPreviewText(summary || '請人工確認草稿內容。'),
    ''
  ];

  if (previewItems.length) {
    lines.push('主要草稿內容');
    previewItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${cleanPreviewText(item.title) || '草稿項目'}`);
      if (item.useCase === 'engineering_estimate_draft') {
        lines.push(`數量：${cleanPreviewText(item.quantity) || '待確認'}`);
        lines.push(`單位：${cleanPreviewText(item.unit) || '待確認'}`);
        lines.push(`說明：${cleanPreviewText(item.note || item.description) || '待人工確認'}`);
        if (cleanPreviewText(item.confirmNeeded)) lines.push(`需確認事項：${cleanPreviewText(item.confirmNeeded)}`);
      } else {
        lines.push(cleanPreviewText(item.description) || '待人工確認');
      }
      lines.push('');
    });
  }

  if (warnings.length) {
    lines.push('注意事項');
    warnings.forEach((item) => lines.push(`- ${cleanPreviewText(item)}`));
    lines.push('');
  }

  if (nextSteps.length) {
    lines.push('下一步');
    nextSteps.forEach((item) => lines.push(`- ${cleanPreviewText(item)}`));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function errorMessage(error) {
  if (error?.code === 'AI_USE_CASE_FORBIDDEN' || error?.status === 403) {
    return '此 AI 功能不適用於目前版本。';
  }
  if (['AI_PROVIDER_UNAVAILABLE', 'AI_PROVIDER_TIMEOUT', 'AI_MODEL_NOT_FOUND'].includes(error?.code)) {
    return '本機 AI 模型尚未啟動，請確認 Ollama 是否執行中。';
  }
  return 'AI 草稿產生失敗，請稍後再試。';
}

export default function AiDraftAssistant({
  companyId,
  company = {},
  isFounder = false,
  founderEdition = 'commerce'
}) {
  const edition = inferEdition({ company, isFounder, founderEdition });
  const visibleWorkflows = useMemo(() => getVisibleWorkflows(edition), [edition]);
  const [workflowId, setWorkflowId] = useState(visibleWorkflows[0]?.id || 'brand-commerce');
  const workflow = visibleWorkflows.find((item) => item.id === workflowId) || visibleWorkflows[0] || workflows[1];
  const [taskId, setTaskId] = useState(workflow.tasks[0].id);
  const task = useMemo(
    () => workflow.tasks.find((item) => item.id === taskId) || workflow.tasks[0],
    [workflow, taskId]
  );
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [copyMessage, setCopyMessage] = useState('');
  const [manualCopyText, setManualCopyText] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState('');

  useEffect(() => {
    const nextWorkflow = visibleWorkflows.find((item) => item.id === workflowId) || visibleWorkflows[0];
    if (nextWorkflow && nextWorkflow.id !== workflowId) setWorkflowId(nextWorkflow.id);
  }, [visibleWorkflows, workflowId]);

  useEffect(() => {
    setTaskId(workflow.tasks[0].id);
    setText('');
    setResult(null);
    setError('');
    setEmptyMessage('');
    setManualCopyText('');
    setCopyMessage('');
    setAdvancedOpen(false);
  }, [workflow.id]);

  useEffect(() => {
    setPreviewItems(buildPreviewItems(result));
    setCopyMessage('');
    setManualCopyText('');
    setAdvancedOpen(false);
  }, [result]);

  useEffect(() => {
    setText('');
    setResult(null);
    setError('');
    setEmptyMessage('');
    setManualCopyText('');
    setCopyMessage('');
    setAdvancedOpen(false);
  }, [taskId]);

  async function submit(event) {
    event.preventDefault();
    if (!text.trim()) {
      setEmptyMessage('請先輸入需求內容，BookAI 會協助整理成草稿。');
      return;
    }

    setLoading(true);
    setError('');
    setEmptyMessage('');
    setResult(null);

    try {
      const data = await api(`/companies/${companyId}/ai/draft`, {
        method: 'POST',
        body: JSON.stringify({
          useCase: task.useCase,
          input: {
            text,
            workflowId: workflow.id,
            taskId: task.id,
            taskLabel: task.label,
            edition
          }
        })
      });
      setResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function updatePreviewItem(id, key, value) {
    setPreviewItems((items) => items.map((item) => (
      item.id === id ? { ...item, [key]: value } : item
    )));
  }

  function clearDraft() {
    setResult(null);
    setError('');
    setEmptyMessage('');
    setCopyMessage('');
    setManualCopyText('');
    setAdvancedOpen(false);
  }

  async function copyText(textToCopy, successMessage) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(textToCopy);
      setCopyMessage(successMessage);
      setManualCopyText('');
      return;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(textarea);
      }

      if (copied) {
        setCopyMessage(successMessage);
        setManualCopyText('');
      } else {
        setCopyMessage('瀏覽器阻擋自動複製，請在下方手動複製。');
        setManualCopyText(textToCopy);
      }
    }
  }

  async function copyFullDraft() {
    if (!previewItems.length) {
      setCopyMessage('目前沒有可預覽的草稿項目，請調整輸入內容後重新產生。');
      return;
    }
    await copyText(draftText, '已複製草稿。');
  }

  async function copySelectedDraft() {
    const selected = previewItems.filter((item) => item.checked);
    if (!selected.length) {
      setCopyMessage('請先勾選至少一個草稿項目。');
      return;
    }
    const selectedText = buildDraftText({
      title: `${draftTitle}（已勾選段落）`,
      summary: draftSummary,
      previewItems: selected,
      warnings,
      nextSteps
    });
    await copyText(selectedText, '已複製已勾選草稿。');
  }

  const draft = result?.draft || null;
  const scope = editionAiScopes[edition] || editionAiScopes.commerce;
  const draftTitle = cleanPreviewText(draft?.title || `${task.label}草稿`);
  const draftSummary = cleanPreviewText(draft?.summary || 'BookAI 已整理出可供人工確認的草稿。');
  const warnings = uniqueList(draft?.warnings, ['AI 草稿僅供輔助判斷，請人工確認後再使用。']);
  const nextSteps = uniqueList(draft?.nextSteps, ['人工確認內容後，再手動複製到正式流程。']);
  const isGuidedInsufficient = Boolean(draft?.needsMoreInfo || result?.status === 'needs_more_info');
  const guidedSuggestions = uniqueList(draft?.missingInfo || [], []);
  const engineeringBasicInfo = result?.useCase === 'engineering_estimate_draft' ? basicInfoEntries(draft?.basicInfo) : [];
  const providerText = providerStatusText(result);
  const hasLowQualityFallback = !previewItems.length && /不足|補充|需要更多資訊/.test(draftTitle + draftSummary);
  const draftText = buildDraftText({
    title: draftTitle,
    summary: draftSummary,
    previewItems,
    warnings,
    nextSteps
  });

  return (
    <section className="ai-draft-page">
      <div className="ai-draft-hero">
        <div>
          <span className="ai-beta-badge">AI Beta</span>
          <h1>AI 草稿助手</h1>
          <p>{editionMessage(edition, isFounder)}</p>
          <p className="ai-safe-copy">AI 不會直接寫入正式資料，也不會新增、修改、刪除或發布任何業務資料。</p>
        </div>
        {providerText && <div className="ai-provider-pill">{providerText}</div>}
      </div>

      {edition === 'all' && <div className="notice">全功能測試：目前可檢視所有 AI 助手，正式會員會依版本限制顯示。</div>}

      <EditionScopeCard scope={scope} />

      <div className="ai-workflow-grid">
        {visibleWorkflows.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ai-workflow-card ${workflowId === item.id ? 'active' : ''}`}
            onClick={() => setWorkflowId(item.id)}
          >
            <strong>{item.title}</strong>
            <span>{item.description}</span>
            <div>
              {item.tags.map((tag) => <small key={tag}>{tag}</small>)}
            </div>
            <em>開始使用</em>
          </button>
        ))}
      </div>

      <form className="ai-draft-form" onSubmit={submit}>
        <div className="ai-task-head">
          <div>
            <h2>{workflow.title}</h2>
            <p>{workflow.description}</p>
          </div>
          <span>{workflowNotice(workflow.id)}</span>
        </div>

        <div className="ai-task-grid" role="radiogroup" aria-label="選擇 AI 任務">
          {workflow.tasks.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ai-task-card ${task.id === item.id ? 'active' : ''}`}
              onClick={() => setTaskId(item.id)}
              role="radio"
              aria-checked={task.id === item.id}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>

        <label className="ai-input-field">
          <span>{task.label}</span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value.trim()) setEmptyMessage('');
            }}
            rows={8}
            placeholder={guidedPlaceholder(task)}
          />
        </label>

        {emptyMessage && <div className="ai-empty-state">{emptyMessage}</div>}

        <div className="ai-draft-actions">
          <button type="submit" disabled={loading}>
            {loading ? '產生中...' : '產生 AI 草稿'}
          </button>
          <small>草稿只會留在目前畫面，需由使用者人工確認後自行複製使用。</small>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      <div className="ai-draft-result">
        <div className="ai-draft-result-title">
          <div>
            <span>AI 草稿結果區</span>
            <p>以下內容尚未寫入正式資料，請確認後再複製或手動套用。</p>
          </div>
        </div>

        {!result ? (
          <div className="ai-empty-state ai-result-empty">
            請先輸入需求並產生 AI 草稿。
          </div>
        ) : (
          <article className="ai-simple-draft">
            <div className="ai-result-safety">
              此內容僅為 AI 草稿，尚未寫入正式資料。請人工確認後再使用。
            </div>

            <div className="ai-result-head">
              <div>
                <span>{hasLowQualityFallback ? '需要補充資訊' : '簡化草稿'}</span>
                <h2>{draftTitle}</h2>
              </div>
              {result.createdAt && <time>{new Date(result.createdAt).toLocaleString('zh-TW')}</time>}
            </div>

            <section>
              <h3>摘要</h3>
              <p>{draftSummary}</p>
            </section>

            {isGuidedInsufficient && guidedSuggestions.length > 0 && (
              <section className="ai-guided-suggestions">
                <h3>建議補充</h3>
                <p>BookAI 已先整理可補充的資訊，補齊後再產生會更穩定。</p>
                <ul>{guidedSuggestions.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </section>
            )}

            <section>
              <h3>主要草稿內容</h3>
              {engineeringBasicInfo.length > 0 && (
                <div className="ai-basic-info">
                  <h3>案場基本資訊</h3>
                  <div className="ai-basic-info-grid">
                    {engineeringBasicInfo.map((item) => (
                      <div key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewItems.length ? (
                <div className="ai-draft-main-list">
                  {previewItems.slice(0, result?.useCase === 'engineering_estimate_draft' ? 11 : 6).map((item) => (
                    <div key={item.id} className="ai-draft-main-card">
                      <strong>{cleanPreviewText(item.title) || '草稿項目'}</strong>
                      {item.useCase === 'engineering_estimate_draft' && (
                        <div className="ai-draft-meta">
                          <span>數量：{cleanPreviewText(item.quantity) || '待確認'}</span>
                          <span>單位：{cleanPreviewText(item.unit) || '待確認'}</span>
                        </div>
                      )}
                      <p>{cleanPreviewText(item.note || item.description) || '待人工確認'}</p>
                      {item.useCase === 'engineering_estimate_draft' && item.confirmNeeded && (
                        <small className="ai-confirm-needed">需確認事項：{cleanPreviewText(item.confirmNeeded)}</small>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ai-empty-state">
                  {hasLowQualityFallback
                    ? 'AI 草稿內容不足，請補充更多資訊後重新產生。'
                    : '目前沒有可預覽的草稿項目，請調整輸入內容後重新產生。'}
                </div>
              )}
            </section>

            <section>
              <h3>注意事項</h3>
              <ul>{warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>

            <section>
              <h3>下一步</h3>
              <ul>{nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </section>

            <div className="ai-result-actions">
              <button type="button" onClick={copyFullDraft} disabled={!previewItems.length}>複製草稿</button>
              <button type="button" className="ai-secondary-button" onClick={submit} disabled={loading}>
                重新產生
              </button>
              <button type="button" className="ai-secondary-button" onClick={clearDraft}>清除</button>
            </div>

            <div className="notice">
              {workflowNotice(workflow.id)} 目前畫面只提供草稿預覽、編輯與複製。
            </div>

            <details className="ai-draft-preview" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
              <summary>進階：選擇與編輯段落</summary>

              {previewItems.length ? (
                <>
                  <div className="ai-draft-preview-list">
                    {previewItems.map((item) => (
                      <div key={item.id} className="ai-preview-card">
                        <label className="ai-preview-check">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(event) => updatePreviewItem(item.id, 'checked', event.target.checked)}
                          />
                          <span>選取此段落</span>
                        </label>

                        <div className="ai-preview-fields">
                          <label>
                            <span>標題</span>
                            <input value={item.title} onChange={(event) => updatePreviewItem(item.id, 'title', event.target.value)} />
                          </label>

                          <label>
                            <span>類型或用途</span>
                            <input value={item.type} onChange={(event) => updatePreviewItem(item.id, 'type', event.target.value)} />
                          </label>

                          {item.useCase === 'engineering_estimate_draft' && (
                            <>
                              <label>
                                <span>建議數量</span>
                                <input value={item.quantity} onChange={(event) => updatePreviewItem(item.id, 'quantity', event.target.value)} />
                              </label>
                              <label>
                                <span>建議單位</span>
                                <input value={item.unit} onChange={(event) => updatePreviewItem(item.id, 'unit', event.target.value)} />
                              </label>
                            </>
                          )}

                          <label className="ai-preview-wide">
                            <span>{item.useCase === 'engineering_estimate_draft' ? '說明與注意事項' : '說明'}</span>
                            <textarea
                              rows={4}
                              value={item.useCase === 'engineering_estimate_draft' ? item.note : item.description}
                              onChange={(event) => updatePreviewItem(
                                item.id,
                                item.useCase === 'engineering_estimate_draft' ? 'note' : 'description',
                                event.target.value
                              )}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={copySelectedDraft}>複製已勾選草稿</button>
                </>
              ) : (
                <div className="ai-empty-state">目前沒有可預覽的草稿項目，請調整輸入內容後重新產生。</div>
              )}
            </details>

            {copyMessage && <div className="notice">{copyMessage}</div>}

            {manualCopyText && (
              <div className="ai-manual-copy">
                <div className="ai-draft-preview-head">
                  <div>
                    <h3>手動複製草稿</h3>
                    <p>瀏覽器未允許自動複製，請選取下方文字後手動複製。</p>
                  </div>
                  <button type="button" onClick={() => setManualCopyText('')}>關閉</button>
                </div>
                <textarea readOnly rows={10} value={manualCopyText} />
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
