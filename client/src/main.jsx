
import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Layers,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api, setToken, clearToken, getToken, getFounderTestEdition, updateFounderTestEdition } from './lib/api';
import { formatDate, money, rate, safeCopyValue } from './lib/formatters';
import { trackVisit, getTrackingPayload } from './lib/tracking';
import './styles.css';
import AiDraftAssistant from './components/AiDraftAssistant.jsx';
import IntegrationCenter from './components/IntegrationCenter.jsx';
import LeadCenterMock from './components/LeadCenterMock.jsx';
import BusinessBiPage from './pages/BusinessBiPage.jsx';
import PublicSitePage from './pages/PublicSitePage.jsx';
import WebsiteCmsPage from './pages/WebsiteCmsPage.jsx';

const planNames = {
  business: 'Business',
  pro: 'Pro',
  accountant: 'Accountant'
};

const featureByPage = {
  accounting: 'accounting_engine',
  tax: 'tax_center',
  accountant: 'accountant_console',
  'business-bi': 'reports'
};

function getPageFeatureKey(page) {
  if (page === 'founder') return null;
  if (page === 'ai_draft') return null;
  if (page === 'website') return 'commerce_site';
  return featureByPage[page] || page;
}

function hasCompanyFeature(company, page) {
  const key = getPageFeatureKey(page);
  if (!key || key === 'admin') return true;
  const effective = company?.effectiveFeatures;
  if (!Array.isArray(effective) || !effective.length) return true;
  return effective.includes(key);
}

const categoryLabel = {
  marketplace: '第三方商城',
  hosted_commerce: '品牌官網',
  social_commerce: '社群電商',
  payment: '金流支付',
  pos: 'POS',
  food_delivery: '外送平台'
};

const platformLabel = {
  shopee: 'Shopee 蝦皮',
  shopify: 'Shopify 官網',
  cyberbiz: 'CYBERBIZ 官網',
  linepay: 'LINE Pay',
  jkopay: '街口支付',
  ubereats: 'Uber Eats',
  foodpanda: 'Foodpanda',
  facebook: 'Facebook 社群',
  instagram: 'Instagram 社群',
  manual: '手動輸入',
  pos: 'POS 門市'
};

const industryOptions = {
  food: '餐飲業',
  restaurant: '餐飲業',
  beverage: '手搖飲 / 飲料店',
  ecommerce: '電商 / 網拍',
  retail: '零售門市',

  construction: '工程承包 / 裝修重點：案場報價、分期請款、材料成本、師傅工資、外包費與未收款風險。',
  painting: '油漆工程重點：施工坪數、每坪報價、漆料成本、師傅工資、施工天數與毛利率。',
  water_electric: '水電工程重點：點位數、材料費、管線長度、查修費、工資與追加工程。',
  masonry: '泥作工程重點：施工面積、水泥砂石成本、人工天數、清運費與工程進度。',
  interior: '裝潢工程重點：木作、系統櫃、設計費、外包協力、分期請款與案場毛利。',
  aircon_repair: '冷氣 / 空調 / 維修重點：台數、安裝費、零件成本、保固、維修毛利與未收款。',
  waterproof: '防水工程重點：施工面積、防水材料、保固風險、人工天數與驗收請款。',
  demolition: '拆除工程重點：拆除面積、人工、機具、廢棄物清運、樓層搬運與安全成本。',
  low_voltage: '弱電工程重點：點位、線材、設備、施工工時、測試驗收與維護合約。',
  other_construction: '其他工程重點：報價、成本、工資、外包、收款進度與案場毛利。',

  // 舊資料相容，不再出現在註冊選單
  painting_water_electric: '油漆 / 水電 / 泥作重點：案場報價、材料成本、師傅工資、外包費、已收款、未收款與毛利率。',

  service: '服務業',
  studio: '工作室 / 接案',
  accounting_firm: '記帳士 / 會計事務所',
  other: '其他行業'
};

const industryLabel = {
  food: '餐飲業',
  restaurant: '餐飲業',
  beverage: '手搖飲',
  ecommerce: '電商 / 網拍',
  retail: '零售門市',

  construction: '工程承包 / 裝修業',
  painting: '油漆工程',
  water_electric: '水電工程',
  masonry: '泥作工程',
  interior: '裝潢工程',
  aircon_repair: '冷氣 / 空調 / 維修',
  waterproof: '防水工程',
  demolition: '拆除工程',
  low_voltage: '弱電工程',
  other_construction: '其他工程',

  // 舊資料相容
  painting_water_electric: '油漆 / 水電 / 泥作',

  service: '服務業',
  studio: '工作室 / 接案',
  accounting_firm: '記帳士 / 會計事務所',
  other: '其他行業'
};

const productLineLabels = {
  engineering: '工程版',
  commerce: '電商版',
  restaurant: '餐飲版',
  beverage: '手搖飲版',
  retail: '零售版',
  studio: '工作室 / 個人品牌版',
  accountant: '記帳士 / 事務所版',
  general: '一般中小企業版'
};

const navs = {
  business: [
    ['dashboard', '經營總覽', BarChart3],
    ['purchases', '進貨管理', WalletCards],
    ['sales', '銷貨管理', WalletCards],
    ['receivables', '應收帳款', WalletCards],
    ['payables', '應付帳款', WalletCards],
    ['suppliers', '供應商管理', Users],
    ['customers', '客戶管理', Users],
    ['transactions', '收支管理', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['inventory', '商品 / 材料庫存', Package],
    ['integrations', '平台串接', PlugZap],
    ['reports', '經營報表', BarChart3],
    ['business-bi', 'BI 分析', BarChart3],
    ['feedbacks', '產品回饋', FileText],
    ['settings', '公司設定', Building2]
  ],
  pro: [
    ['dashboard', '經營總覽', BarChart3],
    ['purchases', '進貨管理', WalletCards],
    ['sales', '銷貨管理', WalletCards],
    ['receivables', '應收帳款', WalletCards],
    ['payables', '應付帳款', WalletCards],
    ['suppliers', '供應商管理', Users],
    ['customers', '客戶管理', Users],
    ['transactions', '收支管理', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['accounting', '會計中心', Layers],
    ['tax', '稅務中心', ShieldCheck],
    ['inventory', '商品 / 材料庫存', Package],
    ['integrations', '平台串接', PlugZap],
    ['reports', '經營報表', BarChart3],
    ['business-bi', 'BI 分析', BarChart3],
    ['feedbacks', '產品回饋', FileText],
    ['settings', '公司設定', Building2]
  ],
  accountant: [
    ['dashboard', '事務所儀表板', BarChart3],
    ['accountant', '客戶管理', Users],
    ['vouchers', '憑證審核', ReceiptText],
    ['invoices', '發票整理', FileText],
    ['reports', '批次報表', BarChart3],
    ['tax', '稅務準備', ShieldCheck],
    ['feedbacks', '產品回饋', FileText],
    ['settings', '事務所設定', Building2]
  ]
};

const founderEditionLabels = {
  commerce: '電商版',
  engineering: '工程版',
  all: '全功能測試'
};

const commerceEditionNav = [
  ['dashboard', '經營總覽', BarChart3],
  ['inventory', '商品 / 材料庫存', Package],
  ['purchases', '進貨管理', WalletCards],
  ['sales', '銷貨管理', WalletCards],
  ['suppliers', '供應商管理', Users],
  ['customers', '客戶管理', Users],
  ['receivables', '應收帳款', WalletCards],
  ['payables', '應付帳款', WalletCards],
  ['invoices', '發票中心', FileText],
  ['vouchers', '電子憑證', ReceiptText],
  ['transactions', '收支管理', WalletCards],
  ['integrations', '平台串接', PlugZap],
  ['commerce_site', '官網後台', Building2],
  ['website', '品牌官網', Building2],
  ['reports', '經營報表', BarChart3],
  ['business-bi', 'BI 分析', BarChart3],
  ['feedbacks', '產品回饋', FileText],
  ['settings', '公司設定', Building2]
];

const engineeringEditionNav = [
  ['dashboard', '經營總覽', BarChart3],
  ['jobsites', '案場中心', Building2],
  ['leads', '接案中心 / 標案雷達', FileText],
  ['receivables', '收款管理', WalletCards],
  ['reports', '工程月報 / 經營報表', BarChart3],
  ['inventory', '商品 / 材料庫存', Package],
  ['customers', '客戶管理', Users],
  ['suppliers', '供應商管理', Users],
  ['purchases', '進貨管理', WalletCards],
  ['sales', '銷貨管理', WalletCards],
  ['payables', '應付帳款', WalletCards],
  ['transactions', '收支管理', WalletCards],
  ['invoices', '發票中心', FileText],
  ['vouchers', '電子憑證', ReceiptText],
  ['website', '品牌官網', Building2],
  ['feedbacks', '產品回饋', FileText],
  ['settings', '公司設定', Building2]
];

const restaurantEditionNav = [
  ['dashboard', '經營總覽', BarChart3],
  ['purchases', '進貨管理', WalletCards],
  ['sales', '銷貨管理', WalletCards],
  ['receivables', '應收帳款', WalletCards],
  ['payables', '應付帳款', WalletCards],
  ['suppliers', '供應商管理', Users],
  ['customers', '客戶管理', Users],
  ['transactions', '收支管理', WalletCards],
  ['invoices', '發票中心', FileText],
  ['vouchers', '電子憑證', ReceiptText],
  ['inventory', '商品 / 材料庫存', Package],
  ['pos_integrations', 'POS 串接', PlugZap],
  ['reports', '經營報表', BarChart3],
  ['business-bi', 'BI 分析', BarChart3],
  ['feedbacks', '產品回饋', FileText],
  ['settings', '公司設定', Building2]
];

function mergeNavItems(...groups) {
  const seen = new Set();
  return groups.flat().filter(([id]) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getFounderEditionNav(currentNav, edition) {
  if (edition === 'commerce') return commerceEditionNav;
  if (edition === 'engineering') return engineeringEditionNav;
  if (edition === 'restaurant') return restaurantEditionNav;
  return mergeNavItems([['integrations', '整合中心', PlugZap]], currentNav, commerceEditionNav, restaurantEditionNav, engineeringEditionNav);
}

function getPlatformName(key) {
  return platformLabel[key] || key || '未分類平台';
}

function getIndustryName(key) {
  return industryOptions[key] || key || '未設定行業';
}

async function writeClipboardText(text) {
  const content = String(text ?? '');

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // Continue to the textarea fallback below.
    }
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function platformAdvice(p) {
  const feeRate = p.revenue ? p.fee / p.revenue : 0;
  const costRate = p.revenue ? p.cogs / p.revenue : 0;
  const marginRate = p.revenue ? p.profit / p.revenue : 0;

  if (p.revenue === 0) return '尚無足夠資料';
  if (marginRate < 0) return '高風險：此平台目前可能虧損';
  if (feeRate >= 0.25) return '注意：平台抽成偏高，需檢查外送或商城費率';
  if (costRate >= 0.55) return '注意：商品成本偏高，建議檢查進貨或售價';
  if (marginRate >= 0.35) return '表現佳：可考慮加強此平台銷售';
  return '穩定：持續觀察成本與流量';
}

function isFoodIndustry(industry) {
  return ['food', 'restaurant', 'beverage'].includes(industry);
}

function isEcommerceIndustry(industry) {
  return ['ecommerce'].includes(industry);
}

function isCommerceIndustry(industry) {
  return [
    'ecommerce',
    'hosted_commerce',
    'marketplace',
    'social_commerce',
    'food',
    'restaurant',
    'beverage',
    'retail'
  ].includes(industry);
}

function isConstructionIndustry(industry) {
  return [
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

    // 舊資料相容
    'painting_water_electric'
  ].includes(industry);
}

function getAllowedIntegrationCategories(industry) {
  if (isEcommerceIndustry(industry)) {
    return ['marketplace', 'hosted_commerce', 'social_commerce', 'payment', 'pos', 'food_delivery'];
  }

  if (isFoodIndustry(industry)) {
    return ['social_commerce', 'payment', 'pos', 'food_delivery'];
  }

  if (isConstructionIndustry(industry)) {
    return ['payment', 'pos'];
  }

  return ['payment', 'pos', 'social_commerce'];
}

function getIntegrationDesc(industry) {
  if (isEcommerceIndustry(industry)) {
    return '電商 / 網拍版：可串接商城、官網、社群、金流、POS 與外送相關平台。';
  }

  if (isFoodIndustry(industry)) {
    return '餐飲 / 手搖飲版：優先串接社群電商、金流支付、POS 與外送平台。';
  }

  if (isConstructionIndustry(industry)) {
    return '工程業版：平台串接是輔助，核心會放在案場、報價、材料、工資、外包與未收款追蹤。';
  }

  return '依照行業別顯示建議串接平台，未來可擴充更多產業模組。';
}

function getIndustryInsight(industry) {
  const map = {
    restaurant: '餐飲重點：食材成本率、外送抽成、人事成本、翻桌與客單價。',
    beverage: '手搖飲重點：原料成本、包材成本、熱銷飲品、外送平台毛利。',
    ecommerce: '電商重點：平台抽成、物流費、退貨率、廣告成本、商品毛利。',
    retail: '零售重點：庫存週轉、POS 銷售、低庫存預警、熱銷商品排行。',
    construction: '工程重點：案場毛利、現場報價、材料費、工資、外包費、已收款與未收款。',
    painting_water_electric: '油漆 / 水電 / 泥作重點：現場估價、案場材料、工班成本、點工費、請款進度。',
    aircon_repair: '冷氣 / 空調 / 維修重點：到府報價、零件成本、維修毛利、保固與未收款。',
    service: '服務業重點：人事成本、服務收入、案件毛利、固定費用。',
    studio: '工作室重點：接案收入、外包成本、專案毛利、未收款。',
    accounting_firm: '記帳士重點：客戶行業分類、憑證完整度、申報狀態、異常案件。',
    other: '其他行業重點：營收、成本、現金流、稅務風險。'
  };

  return map[industry] || '請先設定行業別，BookAI 會逐步提供專屬分析。';
}

function getBillingStatusLabel(status) {
  const map = {
    trial: '試用中',
    active: '正式使用中',
    expired: '已到期',
    paused: '暫停使用',
    free_beta: '免費試營運',
    internal: '內部管理',
    unpaid: '未付款',
    paid: '已付款',
    cancelled: '已取消'
  };

  return map[status] || '未設定';
}

function getSubscriptionPlanLabel(plan) {
  const map = {
    engineering_trial: '工程業試用版',
    engineering_starter: '工程業入門版',
    engineering_pro: '工程業專業版',
    engineering_premium: '工程業進階版',
    commerce_starter: '電商入門版',
    commerce_pro: '電商專業版',
    accountant_starter: '事務所入門版',
    accountant_pro: '事務所專業版'
  };

  return map[plan] || plan || '未設定';
}

function yesNoPaid(value) {
  return value === 1 || value === true ? '是' : '否';
}

function getOfficialSiteStatusLabel(status) {
  const map = {
    none: '未建立',
    planning: '規劃中',
    building: '製作中',
    live: '已上線',
    paused: '暫停'
  };

  return map[status] || '未設定';
}

function getFeedbackStatusLabel(status) {
  const map = {
    new: '新回饋',
    reviewing: '處理中',
    resolved: '已處理',
    ignored: '暫不處理'
  };

  return map[status] || '未設定';
}

function getReviewStatusLabel(status) {
  const map = {
    pending_review: '等待審核',
    approved: '已通過',
    rejected: '已拒絕',
    suspended: '已停權',
    demo: '試營運展示',
    waitlist: '候補名單',
    active: '使用中',
    inactive: '未啟用',
    closed_beta: '試營運',
    free_beta: '免費測試',
    pending: '待處理',
    failed: '失敗',
    success: '成功',
    error: '錯誤'
  };

  return map[status] || status || '未設定';
}

function getBetaStatusLabel(status) {
  const map = {
    pending_review: '等待審核',
    active: '測試中',
    approved: '測試中',
    demo: '試營運展示',
    waitlist: '候補',
    suspended: '已停權',
    rejected: '已拒絕',
    ended: '已結束',
    not_started: '尚未開始'
  };

  return map[status] || status || '未設定';
}

function getAdminBillingStatusLabel(status) {
  const map = {
    free_beta: '免費試營運',
    internal: '內部管理',
    unpaid: '未付款',
    paid: '已付款',
    trial: '試用中',
    active: '使用中',
    expired: '已到期',
    paused: '暫停使用',
    cancelled: '已取消'
  };

  return map[status] || status || '未設定';
}

function getPlanDisplayLabel(plan) {
  const map = {
    closed_beta: '試營運',
    trial: '試營運',
    starter: '入門版',
    pro: '專業版',
    business: '商務版',
    enterprise: '企業版',
    custom: '客製方案'
  };

  return map[plan] || plan || '未設定';
}

function isAdminUser(user) {
  return user?.isAdmin === true;
}

function isFounderUser(user) {
  return user?.isFounder === true;
}

function BrandLogo({ compact = false, subtitle = '智慧 ERP 系統' }) {
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''}`}>
      <div className="brand-symbol" aria-hidden="true">
        <span>B</span>
      </div>
      {!compact && (
        <div className="brand-wordmark">
          <strong>BookAI</strong>
          <small>{subtitle}</small>
        </div>
      )}
    </div>
  );
}

function fieldLabel(industry, type) {
  const construction = isConstructionIndustry(industry);
  const food = isFoodIndustry(industry);

  const labels = {
    inventoryTitle: construction ? '材料 / 工具庫存' : food ? '商品 / 食材庫存' : '商品 / 材料庫存',
    inventoryDesc: construction
      ? '管理油漆、水電、冷氣零件、耗材與安全庫存。'
      : food
        ? '管理商品、食材、包材成本與安全庫存。'
        : '商品成本與安全庫存是成本會計的基礎。',
    productName: construction ? '材料 / 工具名稱' : food ? '商品 / 食材名稱' : '商品名稱',
    sku: construction ? '材料編號 / SKU' : '商品編號 / SKU',
    price: construction ? '報價單價 / 售價' : '售價',
    cost: construction ? '進貨成本 / 單位成本' : '單位成本',
    stock: '目前庫存',
    safetyStock: '安全庫存'
  };

  return labels[type] || type;
}

function App() {
  const [tokenReady, setTokenReady] = useState(Boolean(getToken()));

  useEffect(() => {
    trackVisit();
  }, []);

  if (window.location.pathname.startsWith('/site/')) {
    return <PublicSitePage />;
  }

  if (!tokenReady) {
    return <Auth onAuth={() => setTokenReady(true)} />;
  }

  if (window.location.pathname.startsWith('/site-preview/')) {
    return <PublicSitePage />;
  }

  return (
    <Shell
      onLogout={() => {
        clearToken();
        setTokenReady(false);
      }}
    />
  );
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    companyName: '珍珠奶茶王國有限公司',
    contactName: '',
    phone: '',
    taxId: '',
    lineContact: '',
    companyStage: '剛創業',
    termsAccepted: false,
    companyAddress: '',
    industry: 'beverage'
  });

  async function submit(e) {
    e.preventDefault();
    setErr('');

    try {
      const payload = mode === 'register'
        ? {
            name: form.name,
            email: form.email,
            password: form.password,
            companyName: form.companyName,
            contactName: form.contactName,
            phone: form.phone,
            taxId: form.taxId,
            lineContact: form.lineContact,
            companyStage: form.companyStage,
            termsAccepted: form.termsAccepted,
            companyAddress: form.companyAddress,
            industry: form.industry,
            useCase: '',
            ...getTrackingPayload()
          }
        : {
            email: form.email,
            password: form.password,
            ...getTrackingPayload()
          };
      const data = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setToken(data.token);
      onAuth();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-ambient" aria-hidden="true" />
      <div className="auth-card">
        <BrandLogo subtitle="企業 AI 經營系統" />
        <h1>{mode === 'login' ? '登入 BookAI' : '建立 BookAI 帳號'}</h1>
        <p>正式公司帳號入口。登入後會進入你自己的公司系統。</p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>
                <span>使用者姓名</span>
                <input
                  name="name"
                  placeholder="例：王小明"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value, contactName: form.contactName || e.target.value })}
                />
              </label>

              <label>
                <span>聯絡電話</span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="例：0912-345-678"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>

              <label>
                <span>公司 / 商號 / 企業社名稱</span>
                <input
                  name="companyName"
                  placeholder="例：珍珠奶茶王國有限公司"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </label>

              <label>
                <span>聯絡人姓名</span>
                <input
                  name="contactName"
                  placeholder="例：王小明"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                />
              </label>

              <label>
                <span>統一編號（選填）</span>
                <input
                  name="taxId"
                  placeholder="例：12345678，尚未設立可先空白"
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                />
                <small>若已有公司 / 行號可填寫統一編號；若尚未成立，可先留空，BookAI 將透過官方客服人工審核。</small>
              </label>

              <label>
                <span>公司階段</span>
                <select
                  value={form.companyStage}
                  onChange={(e) => setForm({ ...form, companyStage: e.target.value })}
                >
                  <option value="已成立公司">已成立公司</option>
                  <option value="已成立行號">已成立行號</option>
                  <option value="工作室">工作室</option>
                  <option value="剛創業">剛創業</option>
                  <option value="尚未成立">尚未成立</option>
                  <option value="個人接案">個人接案</option>
                  <option value="情侶 / 夥伴共同創業">情侶 / 夥伴共同創業</option>
                  <option value="其他">其他</option>
                </select>
              </label>

              <label>
                <span>公司 / 營業地址</span>
                <input
                  placeholder="例：台中市南區○○路 100 號"
                  value={form.companyAddress}
                  onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
                />
              </label>

              <label>
                <span>行業別</span>
                <select
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                >
                  <option value="food">餐飲業</option>
                  <option value="beverage">手搖飲 / 飲料店</option>
                  <option value="ecommerce">電商 / 網拍</option>
                  <option value="retail">零售門市</option>

                  <option value="construction">工程承包 / 裝修業</option>
                  <option value="painting">油漆工程</option>
                  <option value="water_electric">水電工程</option>
                  <option value="masonry">泥作工程</option>
                  <option value="interior">裝潢工程</option>
                  <option value="aircon_repair">冷氣 / 空調 / 維修</option>
                  <option value="waterproof">防水工程</option>
                  <option value="demolition">拆除工程</option>
                  <option value="low_voltage">弱電工程</option>
                  <option value="other_construction">其他工程</option>

                  <option value="service">服務業</option>
                  <option value="studio">工作室 / 接案</option>
                  <option value="accounting_firm">記帳士 / 會計事務所</option>
                  <option value="other">其他行業</option>
                </select>
              </label>

              <label>
                <span>官方 LINE / 聯絡方式（選填）</span>
                <input
                  placeholder="可填 LINE ID 或方便聯繫方式"
                  value={form.lineContact}
                  onChange={(e) => setForm({ ...form, lineContact: e.target.value })}
                />
              </label>

              <label className="check-line">
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
                />
                <span>我已閱讀並同意 BookAI 測試會員服務條款，並理解目前服務仍處於測試階段，功能可能調整、中斷或發生錯誤。</span>
              </label>
            </>
          )}

          <label>
            <span>電子信箱</span>
            <input
              placeholder="例：user@bookai.com.tw"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            <span>密碼</span>
            <input
              placeholder="請輸入密碼"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          {err && <div className="error">{err}</div>}

          <button>{mode === 'login' ? '登入 BookAI' : '建立帳號'}</button>
        </form>

        <button
          className="link"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '建立新帳號' : '已有帳號，返回登入'}
        </button>

        <div className="hint">BookAI 營運後台僅限系統管理員使用。</div>
      </div>
    </div>
  );
}

function TermsBeta() {
  return (
    <div className="panel">
      <Title title="BookAI 測試會員服務條款" subtitle="版本：v1.0" />
      <div className="legal-text">
        <p>歡迎申請使用 BookAI 測試服務。BookAI 目前處於產品測試與功能驗證階段，為確保服務品質、資料安全、測試環境穩定與使用者權益，本服務採人工審核制。使用者完成註冊或申請，並不代表帳號已正式開通；BookAI 保留依內部審核標準准許、拒絕、限制、暫停或終止帳號使用權限之權利。</p>
        <p>使用者理解並同意，測試期間之功能、介面、資料結構、服務範圍與系統穩定性可能因產品開發、維護、安全或營運需求而調整、中斷、暫停或變更。BookAI 將盡合理努力維持服務可用性，但不保證測試期間服務完全不中斷、無錯誤或符合所有特定商業目的。</p>
        <p>使用者應確保其提交之申請資料、聯絡資訊、公司或品牌資料、營運資料及其他輸入內容為真實、合法且已取得必要授權。若使用者尚未成立公司或行號，得以品牌名稱、團隊名稱、工作室名稱或創業狀態進行申請，BookAI 將透過官方客服與人工審核程序確認使用需求。</p>
        <p>BookAI 試營運期間不收取試營運費用。免費試營運資格僅限 BookAI 核准之試營運期間與範圍內使用，不代表永久免費使用權、正式商用授權或未來付費方案承諾。BookAI 保留未來調整服務內容、功能範圍、試營運資格、試營運期限、正式方案與收費方式之權利。</p>
        <p>使用者不得進行未授權測試、壓力測試、爬蟲、掃描、逆向工程、繞過權限、濫用 API、建立大量帳號、干擾服務運作或其他可能影響系統安全與服務穩定之行為。</p>
        <p>BookAI 所提供之 AI 分析、營運建議、報表摘要、稅務提示、會計分類、工程評估、標案判斷或其他輔助資訊，均僅作為一般參考，不構成法律、稅務、會計、財務、工程、投資或其他專業意見。</p>
        <p>測試期間，使用者應避免將不可替代、高度敏感或唯一正式營運資料作為測試資料輸入系統，並應自行保留重要資料備份。BookAI 將採取合理安全措施維護服務與資料安全，但不承諾任何資料永久不遺失、不中斷或完全無風險。</p>
        <p>若使用者違反本條款，或 BookAI 認定使用者行為可能影響服務安全、測試秩序、品牌形象、其他使用者權益或 BookAI 營運發展，BookAI 得不經事前通知限制、暫停或終止其帳號及相關服務使用權限。</p>
      </div>
    </div>
  );
}

function PendingReviewPage({ user, company, officialLineUrl, onLogout, onNavigate }) {
  return (
    <div className="stack">
      <div className="panel hero-panel">
        <Title title="帳號審核中" subtitle="BookAI 目前採人工審核制，以維持系統品質、資料安全與測試環境穩定。" />
        <p className="muted">
          感謝您申請 BookAI。請透過官方 LINE 聯繫客服，完成身份與使用需求確認。審核通過後，系統將為您開通對應功能權限。
        </p>
        <div className="metric-grid">
          <div className="metric-card"><span>申請電子信箱</span><strong>{user?.email}</strong></div>
          <div className="metric-card"><span>公司 / 品牌名稱</span><strong>{company?.name}</strong></div>
          <div className="metric-card"><span>目前狀態</span><strong>等待官方審核</strong></div>
        </div>
        <div className="actions">
          {officialLineUrl && (
            <a className="primary-btn" href={officialLineUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={17} />
              聯繫官方 LINE
            </a>
          )}
          <button type="button" onClick={() => onNavigate('terms_beta')}>測試會員服務條款</button>
          <button type="button" className="ghost-btn" onClick={onLogout}>登出</button>
        </div>
      </div>
    </div>
  );
}

function accountNeedsReview(user, company) {
  if (!user || user.isAdmin || user.isFounder) return false;
  const status = user.approval_status || user.status || user.review_status || company?.approval_status || company?.review_status || 'pending_review';
  return !['approved', 'founder', 'admin', 'demo'].includes(status) && company?.approval_status !== 'approved' && company?.review_status !== 'approved';
}

function FounderEditionSwitcher({ edition, loading, saving, error, success, collapsed, onChange }) {
  if (collapsed) {
    return (
      <div className="founder-edition-switcher collapsed" title={`測試版本：${founderEditionLabels[edition] || '電商版'}`}>
        <span>測</span>
      </div>
    );
  }

  return (
    <div className="founder-edition-switcher">
      <div className="founder-edition-header">
        <strong>測試版本</strong>
        {loading && <small>載入中</small>}
        {saving && <small>儲存中</small>}
      </div>
      <p>目前版本：{founderEditionLabels[edition] || '電商版'}</p>
      <select
        value={edition}
        disabled={loading || saving}
        onChange={(event) => onChange(event.target.value)}
        aria-label="測試版本"
      >
        <option value="commerce">電商版</option>
        <option value="restaurant">餐飲版</option>
        <option value="engineering">工程版</option>
        <option value="all">全功能測試</option>
      </select>
      {error && <small className="founder-edition-error">{error}</small>}
      {success && !error && <small className="founder-edition-success">{success}</small>}
    </div>
  );
}

function BetaStatusNotice({ officialLineUrl, onFeedback }) {
  return (
    <div className="beta-status-notice" role="status">
      <div>
        <strong>BookAI 試營運版本</strong>
        <span>功能仍可能依測試回饋調整。若遇到問題，請透過產品回饋或官方 LINE 回報。</span>
      </div>
      <div className="beta-status-actions">
        <button type="button" onClick={onFeedback}>回報問題</button>
        {officialLineUrl && (
          <a href={officialLineUrl} target="_blank" rel="noreferrer">
            <MessageCircle size={16} />
            官方 LINE
          </a>
        )}
      </div>
    </div>
  );
}

function Shell({ onLogout }) {
  const [me, setMe] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [companyId, setCompanyId] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('bookai_sidebar_collapsed') === '1');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingMemberCount, setPendingMemberCount] = useState(0);
  const [testEdition, setTestEdition] = useState(() => localStorage.getItem('bookai_founder_test_edition') || 'commerce');
  const [testEditionLoading, setTestEditionLoading] = useState(false);
  const [testEditionSaving, setTestEditionSaving] = useState(false);
  const [testEditionError, setTestEditionError] = useState('');
  const [testEditionSuccess, setTestEditionSuccess] = useState('');
  const [betaSupport, setBetaSupport] = useState({ officialLineUrl: '' });

  useEffect(() => {
    api('/me')
      .then((d) => {
        setMe(d);
        const companies = Array.isArray(d?.companies) ? d.companies : [];
        setCompanyId(companies[0]?.id || null);
      })
      .catch(onLogout);
  }, [onLogout]);

  useEffect(() => {
    localStorage.setItem('bookai_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!me) return;
    api('/beta/support')
      .then((data) => setBetaSupport({ officialLineUrl: data?.officialLineUrl || '' }))
      .catch(() => setBetaSupport({ officialLineUrl: '' }));
  }, [me]);

  const company = me?.companies?.find((c) => c.id === companyId);
  const userIsAdmin = isAdminUser(me?.user);
  const userIsFounder = isFounderUser(me?.user);
  const needsReview = accountNeedsReview(me?.user, company);
  const betaActive = userIsFounder || Number(company?.is_tester || 0) === 1;
  const betaEdition = userIsFounder
    ? testEdition
    : isConstructionIndustry(company?.industry) ? 'engineering' : isFoodIndustry(company?.industry) ? 'restaurant' : 'commerce';
  const plan = company?.plan || 'business';
  const baseNav = navs[plan] || navs.business;
  const constructionNav = [
    ['dashboard', '經營總覽', BarChart3],
    ['leads', '接案中心', FileText],
    ['purchases', '進貨管理', WalletCards],
    ['sales', '銷貨管理', WalletCards],
    ['receivables', '應收帳款', WalletCards],
    ['payables', '應付帳款', WalletCards],
    ['suppliers', '供應商管理', Users],
    ['customers', '客戶管理', Users],
    ['transactions', '收支管理', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['inventory', '材料 / 工具庫存 ERP', Package],
    ['jobsites', '案場中心', Building2],
    ['reports', '經營報表', BarChart3],
    ['business-bi', 'BI 分析', BarChart3],
    ['feedbacks', '產品回饋', FileText],
    ['settings', '公司設定', Building2]
  ];
  const planNav = isConstructionIndustry(company?.industry)
    ? constructionNav
    : baseNav;
  const commerceNav = isCommerceIndustry(company?.industry) && !isConstructionIndustry(company?.industry)
    ? [
        ...planNav.slice(0, 5),
        ['commerce_site', '官網後台', Building2],
        ...planNav.slice(5)
      ]
    : planNav;
  const websiteNav = commerceNav.some(([id]) => id === 'website')
    ? commerceNav
    : [
        ...commerceNav.slice(0, Math.max(1, commerceNav.length - 1)),
        ['website', '品牌官網', Building2],
        ...commerceNav.slice(Math.max(1, commerceNav.length - 1))
      ];
  const editionSourceNav = userIsFounder
    ? getFounderEditionNav(websiteNav, testEdition)
    : websiteNav;
  const editionCompanyNavRaw = userIsFounder
    ? editionSourceNav
    : editionSourceNav.filter(([id]) => hasCompanyFeature(company, id));
  const editionCompanyNav = !userIsFounder && (isConstructionIndustry(company?.industry) || isFoodIndustry(company?.industry))
    ? editionCompanyNavRaw.filter(([id]) => id !== 'integrations')
    : editionCompanyNavRaw;
  const commerceIntegrationNav = !userIsFounder && isCommerceIndustry(company?.industry) && !isFoodIndustry(company?.industry) && !isConstructionIndustry(company?.industry) && !editionCompanyNav.some(([id]) => id === 'integrations')
    ? [
        ...editionCompanyNav.slice(0, Math.max(1, editionCompanyNav.length - 1)),
        ['integrations', '平台串接', PlugZap],
        ...editionCompanyNav.slice(Math.max(1, editionCompanyNav.length - 1))
      ]
    : editionCompanyNav;
  const restaurantIntegrationNav = !userIsFounder && isFoodIndustry(company?.industry) && !commerceIntegrationNav.some(([id]) => id === 'pos_integrations')
    ? [
        ...commerceIntegrationNav.slice(0, Math.max(1, commerceIntegrationNav.length - 1)),
        ['pos_integrations', 'POS 串接', PlugZap],
        ...commerceIntegrationNav.slice(Math.max(1, commerceIntegrationNav.length - 1))
      ]
    : commerceIntegrationNav;
  const aiDraftNav = restaurantIntegrationNav.some(([id]) => id === 'ai_draft')
    ? restaurantIntegrationNav
    : [
        ...restaurantIntegrationNav.slice(0, Math.max(1, restaurantIntegrationNav.length - 1)),
        ['ai_draft', 'AI 草稿助手 Beta', Sparkles],
        ...restaurantIntegrationNav.slice(Math.max(1, restaurantIntegrationNav.length - 1))
      ];
  const visibleNav = userIsAdmin
    ? [...aiDraftNav, ['admin', 'BookAI 營運後台', ShieldCheck]]
    : aiDraftNav;
  const founderNav = userIsFounder
    ? [...visibleNav, ['founder', '創辦人營運中心', ShieldCheck]]
    : visibleNav;
  const reviewNav = [
    ['review_waiting', '帳號審核中', ShieldCheck],
    ['support', '官方客服', Users],
    ['terms_beta', '測試會員條款', FileText]
  ];
  const activeNav = needsReview ? reviewNav : founderNav;

  useEffect(() => {
    if (!me || !userIsFounder) return;
    setTestEditionLoading(true);
    setTestEditionError('');
    getFounderTestEdition()
      .then((data) => {
        const edition = data?.edition || 'commerce';
        setTestEdition(edition);
        localStorage.setItem('bookai_founder_test_edition', edition);
      })
      .catch((error) => {
        setTestEditionError(error.message || '測試版本載入失敗');
      })
      .finally(() => setTestEditionLoading(false));
  }, [me, userIsFounder]);

  async function handleFounderEditionChange(edition) {
    setTestEditionSaving(true);
    setTestEditionError('');
    setTestEditionSuccess('');
    try {
      const data = await updateFounderTestEdition(edition);
      const nextEdition = data?.edition || edition;
      setTestEdition(nextEdition);
      localStorage.setItem('bookai_founder_test_edition', nextEdition);
      setTestEditionSuccess('已更新');
    } catch (error) {
      setTestEditionError(error.message || '測試版本更新失敗');
    } finally {
      setTestEditionSaving(false);
    }
  }

  useEffect(() => {
    if (!me || !userIsAdmin || needsReview) {
      setPendingMemberCount(0);
      return;
    }
    api('/admin/members?status=pending_review')
      .then((rows) => setPendingMemberCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => setPendingMemberCount(0));
  }, [me, userIsAdmin, needsReview]);

  useEffect(() => {
    if (me && needsReview && !['review_waiting', 'support', 'terms_beta'].includes(page)) {
      setPage('review_waiting');
      return;
    }
    if (me && !userIsAdmin && page === 'admin') {
      setPage('dashboard');
    }
    if (me && !userIsFounder && page === 'founder') {
      setPage('dashboard');
    }
    const visiblePageIds = new Set(activeNav.map(([id]) => id));
    if (me && !needsReview && !userIsFounder && page !== 'admin' && !hasCompanyFeature(company, page)) {
      setPage('dashboard');
      return;
    }
    if (me && !needsReview && page !== 'admin' && page !== 'founder' && !visiblePageIds.has(page)) {
      setPage('dashboard');
    }
  }, [me, userIsAdmin, userIsFounder, page, company, needsReview, activeNav]);

  if (!me || !company) {
    return <div className="loading">載入中…</div>;
  }

  const lockedFeature = getPageFeatureKey(page);

  if (!needsReview && !userIsFounder && !['admin', 'founder'].includes(page) && !hasCompanyFeature(company, page)) {
    return <Locked feature={lockedFeature} />;
  }

  if (!needsReview && !userIsFounder && featureByPage[page] && !company.effectiveFeatures?.includes(lockedFeature)) {
    return <Locked feature={lockedFeature} />;
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      <div className="mobile-app-bar">
        <BrandLogo subtitle="智慧 ERP 系統" />
        <button type="button" className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)} aria-label="開啟選單">
          <Menu size={20} />
        </button>
      </div>

      {mobileNavOpen && <button type="button" className="mobile-nav-backdrop" aria-label="關閉選單" onClick={() => setMobileNavOpen(false)} />}

      <aside className="app-sidebar">
        <div className="brand">
          <BrandLogo compact={sidebarCollapsed} subtitle="智慧 ERP 系統" />
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? '展開側邊欄' : '收合側邊欄'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button type="button" className="mobile-close-btn" onClick={() => setMobileNavOpen(false)} aria-label="關閉選單">
            <X size={18} />
          </button>
        </div>

        <div className="company-select-wrap">
          <span>目前公司</span>
          <select
            className="company-select"
            value={companyId}
            onChange={(e) => {
              setCompanyId(Number(e.target.value));
              setMobileNavOpen(false);
            }}
          >
            {(Array.isArray(me.companies) ? me.companies : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <nav>
          {activeNav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              data-label={label}
              title={sidebarCollapsed ? label : undefined}
              onClick={() => {
                setPage(id);
                setMobileNavOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'admin' && pendingMemberCount > 0 && (
                <b className="nav-badge">{pendingMemberCount}</b>
              )}
            </button>
          ))}
        </nav>

        {userIsFounder && !needsReview && (
          <FounderEditionSwitcher
            edition={testEdition}
            loading={testEditionLoading}
            saving={testEditionSaving}
            error={testEditionError}
            success={testEditionSuccess}
            collapsed={sidebarCollapsed}
            onChange={handleFounderEditionChange}
          />
        )}

        <button className="logout" data-label="登出" title={sidebarCollapsed ? '登出' : undefined} onClick={onLogout}>
          <LogOut size={18} />
          <span>登出</span>
        </button>
      </aside>

      <main className="app-main">
        {page !== 'admin' && !needsReview && (
          <Header
            company={company}
            onPlanChange={(p) => {
              api(`/companies/${companyId}/plan`, {
                method: 'PATCH',
                body: JSON.stringify({ plan: p })
              }).then(() => location.reload());
            }}
          />
        )}

        {needsReview && page === 'review_waiting' && <PendingReviewPage user={me.user} company={company} officialLineUrl={betaSupport.officialLineUrl} onLogout={onLogout} onNavigate={setPage} />}
        {needsReview && page === 'support' && <PendingReviewPage user={me.user} company={company} officialLineUrl={betaSupport.officialLineUrl} onLogout={onLogout} onNavigate={setPage} />}
        {needsReview && page === 'terms_beta' && <TermsBeta />}
        {!needsReview && betaActive && page !== 'admin' && page !== 'founder' && (
          <BetaStatusNotice
            officialLineUrl={betaSupport.officialLineUrl}
            onFeedback={() => setPage('feedbacks')}
          />
        )}
        {!needsReview && page === 'dashboard' && (
          <Dashboard
            companyId={companyId}
            refresh={refresh}
            company={company}
            engineeringMode={isConstructionIndustry(company?.industry) || (userIsFounder && testEdition === 'engineering')}
            betaActive={betaActive}
            betaEdition={betaEdition}
            officialLineUrl={betaSupport.officialLineUrl}
            onNavigate={setPage}
          />
        )}
        {!needsReview && page === 'leads' && <LeadCenterMock companyId={companyId} isAdmin={userIsAdmin} />}
        {!needsReview && page === 'transactions' && <Transactions companyId={companyId} />}
        {!needsReview && page === 'purchases' && <PurchasesManager companyId={companyId} onNavigate={setPage} />}
        {!needsReview && page === 'sales' && <SalesManager companyId={companyId} onNavigate={setPage} />}
        {!needsReview && page === 'receivables' && <ReceivablesManager companyId={companyId} onNavigate={setPage} />}
        {!needsReview && page === 'payables' && <PayablesManager companyId={companyId} onNavigate={setPage} />}
        {!needsReview && page === 'suppliers' && <ContactsManager companyId={companyId} type="suppliers" />}
        {!needsReview && page === 'customers' && <ContactsManager companyId={companyId} type="customers" />}
        {!needsReview && page === 'feedbacks' && <FeedbackCenter companyId={companyId} officialLineUrl={betaSupport.officialLineUrl} />}
        {!needsReview && page === 'integrations' && (
          <IntegrationCenter
            editionMode={userIsFounder && testEdition === 'all' ? 'all' : userIsFounder ? testEdition : betaEdition}
            isEngineering={isConstructionIndustry(company?.industry)}
            isRestaurant={isFoodIndustry(company?.industry)}
            onNavigate={setPage}
          />
        )}
        {!needsReview && page === 'pos_integrations' && (
          <IntegrationCenter
            editionMode={userIsFounder && testEdition === 'all' ? 'all' : 'restaurant'}
            isEngineering={isConstructionIndustry(company?.industry)}
            isRestaurant
            onNavigate={setPage}
          />
        )}
        {!needsReview && page === 'invoices' && <Invoices companyId={companyId} />}
        {!needsReview && page === 'inventory' && <Inventory companyId={companyId} company={company} />}
        {!needsReview && page === 'jobsites' && <JobSites companyId={companyId} company={company} />}
        {!needsReview && page === 'vouchers' && <Vouchers companyId={companyId} />}
        {!needsReview && page === 'accounting' && <Accounting companyId={companyId} />}
        {!needsReview && page === 'tax' && <Tax companyId={companyId} />}
        {!needsReview && page === 'accountant' && <Accountant companyId={companyId} />}
        {!needsReview && page === 'reports' && <Reports companyId={companyId} company={company} />}
        {!needsReview && page === 'business-bi' && <BusinessBiPage companyId={companyId} company={company} />}
        {!needsReview && page === 'ai_draft' && (
          <AiDraftAssistant
            companyId={companyId}
            company={company}
            isFounder={userIsFounder}
            founderEdition={testEdition}
          />
        )}
        {!needsReview && page === 'settings' && <Settings company={company} />}
        {!needsReview && page === 'website' && <WebsiteCmsPage />}
        {!needsReview && page === 'commerce_site' && <CommerceSiteManager companyId={companyId} company={company} />}
        {!needsReview && page === 'admin' && userIsAdmin && <AdminConsole />}
        {!needsReview && page === 'founder' && userIsFounder && <FounderDashboard />}
      </main>
    </div>
  );
}

function Header({ company, onPlanChange }) {
  return (
    <div className="header">
      <div>
        <h1>{company.name}</h1>
        <p>
          {isConstructionIndustry(company.industry)
            ? `${getIndustryName(company.industry)}專用：案場、收款、成本、毛利與月報追蹤的一體化工作台`
            : `${getIndustryName(company.industry)}專用：交易、發票、庫存、會計與成本分析的一體化工作台`}
        </p>
      </div>

      <div className="plan-badge">{productLineLabels[company.product_line] || '早期體驗'}</div>
    </div>
  );
}

function Card({ title, value, sub }) {
  return (
    <div className="card">
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const platformChartColors = ['#2563eb', '#0891b2', '#16a34a', '#b88a2e', '#7c3aed', '#dc2626', '#0f766e', '#475569'];

function PlatformRevenueChart({ rows = [] }) {
  const platformRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: getPlatformName(row.name),
      rawName: row.name || 'unknown',
      value: Number(row.value || 0)
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = platformRows.reduce((sum, row) => sum + row.value, 0);
  const top = platformRows[0] || null;
  const average = platformRows.length ? total / platformRows.length : 0;

  if (!platformRows.length || total <= 0) {
    return (
      <div className="bi-empty-state">
        <strong>目前尚無平台營收資料</strong>
        <p>完成平台串接或新增交易資料後，系統將自動整理各平台營收占比。</p>
      </div>
    );
  }

  return (
    <div className="bi-platform-chart">
      <div className="bi-kpi-row">
        <div><span>總營收</span><strong>{money(total)}</strong></div>
        <div><span>平台數</span><strong>{platformRows.length}</strong></div>
        <div><span>最高營收平台</span><strong>{top.name}</strong></div>
        <div><span>平均平台營收</span><strong>{money(average)}</strong></div>
      </div>

      <div className="bi-bars" role="list" aria-label="平台營收分布">
        {platformRows.map((row, index) => {
          const percent = total ? Math.round((row.value / total) * 1000) / 10 : 0;
          const color = platformChartColors[index % platformChartColors.length];
          return (
            <div className={`bi-bar-item ${index === 0 ? 'top' : ''}`} key={`${row.rawName}-${index}`} role="listitem" title={`${row.name}：${money(row.value)}，占比 ${percent}%`}>
              <div className="bi-bar-head">
                <span><i style={{ background: color }} />{row.name}</span>
                <strong>{money(row.value)}｜{percent}%</strong>
              </div>
              <div className="bi-bar-track">
                <b style={{ width: `${Math.max(percent, 2)}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bi-legend">
        {platformRows.map((row, index) => {
          const percent = total ? Math.round((row.value / total) * 1000) / 10 : 0;
          return (
            <span key={`${row.rawName}-legend-${index}`}>
              <i style={{ background: platformChartColors[index % platformChartColors.length] }} />
              {row.name} {percent}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

const betaGuideConfigs = {
  engineering: {
    title: '工程版試營運快速開始',
    description: '建議依序測試案場、估價、複製與工程決策流程。',
    steps: [
      { label: '建立第一個案場', page: 'jobsites' },
      { label: '新增估價明細', page: 'jobsites' },
      { label: '測試報價 / 請款 / 結案複製', page: 'jobsites' },
      { label: '查看工程 BI', page: 'dashboard' },
      { label: '進接案中心查看標案雷達', page: 'leads' }
    ]
  },
  commerce: {
    title: '電商 / 官網版試營運快速開始',
    description: '建議先建立基礎資料，再檢查品牌官網內容與公開呈現。',
    steps: [
      { label: '建立商品 / 材料資料', page: 'inventory' },
      { label: '查看經營總覽', page: 'dashboard' },
      { label: '進品牌官網後台', page: 'website' },
      { label: '編輯 Banner / 首頁區塊 / FAQ', page: 'website' },
      { label: '開啟公開網站或預覽網站', page: 'website' }
    ]
  },
  all: {
    title: '全功能試營運快速開始',
    description: '依序檢查跨版本核心流程，完成後請留下測試結果。',
    steps: [
      { label: '切換工程版與電商版', page: 'dashboard' },
      { label: '測試案場中心', page: 'jobsites' },
      { label: '測試品牌官網 CMS', page: 'website' },
      { label: '測試接案中心', page: 'leads' },
      { label: '回報問題', page: 'feedbacks' }
    ]
  }
};

const onboardingGuideConfigs = {
  engineering: {
    kicker: '首次使用引導',
    title: '歡迎使用 BookAI 工程版',
    description: '先建立你的第一個案場，BookAI 會協助你整理估價、收款、成本與案場摘要。',
    primaryAction: '建立案場',
    primaryPage: 'jobsites',
    steps: [
      {
        id: 'jobsite',
        label: '建立第一個案場',
        desc: '記錄工程名稱、地點、業主、狀態與基本資訊。',
        cta: '建立案場',
        page: 'jobsites'
      },
      {
        id: 'estimate',
        label: '新增估價項目',
        desc: '整理材料、工資、外包與其他成本，避免漏項。',
        cta: '前往估價',
        page: 'jobsites'
      },
      {
        id: 'payment',
        label: '新增收款紀錄',
        desc: '記錄訂金、期款、尾款，掌握未收款。',
        cta: '新增收款',
        page: 'jobsites'
      },
      {
        id: 'feedback',
        label: '填寫產品回饋',
        desc: '試營運期間請回報卡住的地方與希望新增的功能。',
        cta: '填寫回饋',
        page: 'feedbacks'
      }
    ],
    aiAssist: {
      label: '使用 AI 整理估價說明',
      cta: '開啟 AI 草稿助手',
      page: 'ai_draft'
    }
  },
  commerce: {
    kicker: '首次使用引導',
    title: '歡迎使用 BookAI 電商版',
    description: '先建立你的第一個商品或官網內容，BookAI 會協助你整理商品文案、官網首頁與社群草稿。',
    primaryAction: '建立商品',
    primaryPage: 'inventory',
    steps: [
      {
        id: 'product',
        label: '建立第一個商品',
        desc: '記錄商品名稱、價格、庫存、特色與狀態。',
        cta: '建立商品',
        page: 'inventory'
      },
      {
        id: 'website',
        label: '設定官網首頁',
        desc: '設定品牌名稱、Banner、首頁區塊與基本介紹。',
        cta: '設定官網',
        page: 'website'
      },
      {
        id: 'ai',
        label: '使用 AI 產生商品 / 官網文案',
        desc: '用自然語言整理商品標題、賣點、FAQ 或官網首頁文案。',
        cta: '開啟 AI 草稿助手 Beta',
        page: 'ai_draft',
        beta: true
      },
      {
        id: 'feedback',
        label: '填寫產品回饋',
        desc: '試營運期間請回報卡住的地方與希望新增的功能。',
        cta: '填寫回饋',
        page: 'feedbacks'
      }
    ]
  },
  restaurant: {
    kicker: '內部規劃中',
    title: '餐飲版目前為內部規劃中',
    description: '請聯繫 BookAI 團隊確認測試範圍；本包不開放正式餐飲首次使用引導。',
    primaryAction: '填寫回饋',
    primaryPage: 'feedbacks',
    steps: [
      {
        id: 'feedback',
        label: '聯繫 BookAI 團隊',
        desc: '確認餐飲版測試範圍後再安排後續流程。',
        cta: '填寫回饋',
        page: 'feedbacks'
      }
    ]
  },
  all: {
    kicker: 'Founder 測試模式',
    title: '目前為全功能測試模式',
    description: '可檢查工程版與電商版 onboarding。實際會員會依版本顯示對應引導。',
    primaryAction: '檢查工程引導',
    primaryPage: 'jobsites',
    steps: [
      {
        id: 'engineering',
        label: '工程版 onboarding',
        desc: '檢查建立案場、估價、收款與回饋流程。',
        cta: '前往案場中心',
        page: 'jobsites'
      },
      {
        id: 'commerce',
        label: '電商版 onboarding',
        desc: '檢查建立商品、設定官網、AI 草稿與回饋流程。',
        cta: '前往商品管理',
        page: 'inventory'
      },
      {
        id: 'feedback',
        label: '試營運回饋',
        desc: '記錄測試時發現的阻塞與版本隔離問題。',
        cta: '填寫回饋',
        page: 'feedbacks'
      }
    ]
  }
};

function TesterGuideCard({ edition, betaActive, officialLineUrl, onNavigate, onboardingState = {} }) {
  const guide = onboardingGuideConfigs[edition] || onboardingGuideConfigs.commerce;
  const storageKey = `bookai_onboarding_collapsed_${edition}`;
  const shouldDefaultCollapse = Object.values(onboardingState.completed || {}).some(Boolean);
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === '1') return true;
    if (stored === '0') return false;
    return shouldDefaultCollapse;
  });

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setCollapsed(stored === '1' || (stored !== '0' && shouldDefaultCollapse));
  }, [storageKey, shouldDefaultCollapse]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      localStorage.setItem(storageKey, value ? '0' : '1');
      return !value;
    });
  }

  function getStepStatus(step) {
    if (onboardingState.completed?.[step.id]) return '已完成';
    if (onboardingState.nextStepId === step.id) return '建議下一步';
    if (step.beta) return 'Beta';
    return '可稍後';
  }

  function stepStatusClass(step) {
    const status = getStepStatus(step);
    if (status === '已完成') return 'done';
    if (status === 'Beta') return 'beta';
    if (status === '建議下一步') return 'next';
    return 'later';
  }

  return (
    <div className={`tester-guide-card beta-guide-card onboarding-card ${betaActive ? 'tester' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="beta-guide-heading">
        <div>
          <p className="tester-guide-kicker">{guide.kicker}</p>
          <h2>{guide.title}</h2>
          {!collapsed && <p>{guide.description}</p>}
        </div>
        <button type="button" className="beta-guide-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed}>
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          {collapsed ? '展開' : '收合'}
        </button>
      </div>
      {!collapsed && (
        <>
          <ol className="beta-guide-steps onboarding-steps">
            {guide.steps.map((step) => {
              const status = getStepStatus(step);
              return (
                <li key={step.id} className={onboardingState.nextStepId === step.id ? 'is-next' : ''}>
                  <div className="onboarding-step-main">
                    <div className="onboarding-step-title-row">
                      <strong>{step.label}</strong>
                      <span className={`onboarding-status ${stepStatusClass(step)}`}>{status}</span>
                    </div>
                    <p>{step.desc}</p>
                    <button type="button" onClick={() => onNavigate?.(step.page)}>{step.cta}</button>
                  </div>
                </li>
              );
            })}
          </ol>

          {guide.aiAssist && (
            <div className="onboarding-ai-assist">
              <div>
                <span>Beta</span>
                <strong>{guide.aiAssist.label}</strong>
                <p>AI 只會產生草稿，不會直接寫入正式資料。</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => onNavigate?.(guide.aiAssist.page)}>{guide.aiAssist.cta}</button>
            </div>
          )}

          <div className="tester-guide-actions">
            <button type="button" onClick={() => onNavigate?.(guide.primaryPage)}>{guide.primaryAction}</button>
            <button type="button" className="secondary-btn" onClick={() => onNavigate?.('feedbacks')}>填寫回饋</button>
            {officialLineUrl && (
              <a href={officialLineUrl} target="_blank" rel="noreferrer">
                <MessageCircle size={16} />
                聯繫 LINE
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function finiteNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function jobSiteAmount(site, ...keys) {
  const key = keys.find((candidate) => site?.[candidate] !== undefined && site?.[candidate] !== null);
  return key ? finiteNumber(site[key]) : 0;
}

function firstIncompleteStep(stepIds, completed) {
  return stepIds.find((id) => !completed[id]) || '';
}

function monthKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getMonth() + 1}月`,
      revenue: 0,
      collected: 0
    };
  });
}

const engineeringStatusOrder = ['洽談中', '已報價', '已簽約', '施工中', '已完工', '已結案'];
const engineeringChartColors = ['#2563eb', '#0891b2', '#16a34a', '#b88a2e', '#7c3aed', '#64748b'];

function normalizeJobSiteStatus(value) {
  const status = String(value || '').trim();
  if (['洽談中', '洽談', '評估中'].includes(status)) return '洽談中';
  if (['已報價', '報價中', '待確認'].includes(status)) return '已報價';
  if (['已簽約', '簽約', '待開工'].includes(status)) return '已簽約';
  if (['施工中', '進行中', '執行中'].includes(status)) return '施工中';
  if (['已完工', '完工', '待驗收'].includes(status)) return '已完工';
  if (['已結案', '結案', 'closed', 'done'].includes(status.toLowerCase())) return '已結案';
  return '洽談中';
}

function normalizeWorkType(value) {
  const text = String(value || '').trim();
  if (/油漆|塗裝/.test(text)) return '油漆';
  if (/水電|機電|弱電/.test(text)) return '水電';
  if (/裝潢|裝修|木作|系統櫃/.test(text)) return '裝潢';
  if (/防水|抓漏/.test(text)) return '防水';
  if (/泥作|土木|砌磚|磁磚/.test(text)) return '泥作';
  return '其他';
}

function EngineeringChartEmpty({ children = '目前案場資料不足，建立更多案場後即可查看趨勢圖' }) {
  return (
    <div className="engineering-chart-empty">
      <BarChart3 size={28} aria-hidden="true" />
      <strong>尚無足夠資料</strong>
      <p>{children}</p>
    </div>
  );
}

function EngineeringDashboardCharts({ stats, payments }) {
  const sites = stats.sites;
  const monthlyTrend = recentMonths(6);
  const monthlyMap = new Map(monthlyTrend.map((row) => [row.key, row]));

  sites.forEach((site) => {
    const row = monthlyMap.get(monthKey(site.createdAt ?? site.created_at));
    if (row) row.revenue += jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
  });
  payments.forEach((payment) => {
    const row = monthlyMap.get(monthKey(payment.paymentDate ?? payment.payment_date));
    if (row) row.collected += finiteNumber(payment.amount);
  });

  const statusCounts = new Map(engineeringStatusOrder.map((status) => [status, 0]));
  sites.forEach((site) => {
    const status = normalizeJobSiteStatus(site.status);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const statusData = engineeringStatusOrder
    .map((name) => ({ name, value: statusCounts.get(name) || 0 }))
    .filter((row) => row.value > 0);

  const workTypeTotals = new Map();
  sites.forEach((site) => {
    const name = normalizeWorkType(site.projectType ?? site.project_type);
    const value = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
    workTypeTotals.set(name, (workTypeTotals.get(name) || 0) + value);
  });
  const workTypeData = [...workTypeTotals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const rankedSites = sites
    .map((site) => {
      const revenue = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
      const received = jobSiteAmount(site, 'receivedAmount', 'received_amount');
      return {
        id: site.id,
        name: site.siteName || site.site_name || site.name || '未命名案場',
        client: site.clientName || site.client_name || '未填客戶',
        revenue,
        received,
        unpaid: Math.max(revenue - received, 0),
        status: normalizeJobSiteStatus(site.status)
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const overdueSites = sites.filter((site) => {
    const revenue = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
    const received = jobSiteAmount(site, 'receivedAmount', 'received_amount');
    return ['已完工', '已結案'].includes(normalizeJobSiteStatus(site.status)) && revenue > received;
  });
  const highRiskSites = sites.filter((site) => {
    const revenue = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
    const received = jobSiteAmount(site, 'receivedAmount', 'received_amount');
    return revenue > 0 && received / revenue < 0.5 && !['已結案'].includes(normalizeJobSiteStatus(site.status));
  });
  const hasTrendData = monthlyTrend.some((row) => row.revenue > 0 || row.collected > 0);

  return (
    <div className="engineering-bi">
      <div className="engineering-bi-grid engineering-bi-grid-wide">
        <div className="panel engineering-chart-panel">
          <div className="engineering-panel-head">
            <div>
              <h2>月度工程營收 / 收款趨勢</h2>
              <p>近 6 個月依案場建立月份彙整工程金額，並依實際收款日呈現現金回收節奏。</p>
            </div>
            <span className="engineering-panel-tag">近 6 個月</span>
          </div>
          {hasTrendData ? (
            <div className="engineering-chart-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrend} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}萬`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(value) => money(value)} contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="revenue" name="工程營收" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  <Line dataKey="collected" name="實際收款" stroke="#16a34a" strokeWidth={3} dot={{ r: 4, fill: '#16a34a' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <EngineeringChartEmpty />}
        </div>

        <div className="panel engineering-chart-panel">
          <div className="engineering-panel-head">
            <div>
              <h2>案場狀態分布</h2>
              <p>從洽談到結案的案件分布，快速辨識目前工程量集中階段。</p>
            </div>
          </div>
          {statusData.length ? (
            <div className="engineering-donut-layout">
              <div className="engineering-chart-canvas donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>
                      {statusData.map((row, index) => <Cell key={row.name} fill={engineeringChartColors[index % engineeringChartColors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} 件`, '案場數']} contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="engineering-donut-total"><strong>{sites.length}</strong><span>總案場</span></div>
              </div>
              <div className="engineering-chart-legend">
                {statusData.map((row, index) => (
                  <div key={row.name}><i style={{ background: engineeringChartColors[index % engineeringChartColors.length] }} /><span>{row.name}</span><strong>{row.value} 件</strong></div>
                ))}
              </div>
            </div>
          ) : <EngineeringChartEmpty>目前尚無案場狀態資料，新增案場後即可查看分布。</EngineeringChartEmpty>}
        </div>
      </div>

      <div className="engineering-bi-grid">
        <div className="panel engineering-chart-panel">
          <div className="engineering-panel-head">
            <div>
              <h2>工種營收分布</h2>
              <p>依案場工種彙整簽訂金額，掌握主要營收來源。</p>
            </div>
          </div>
          {workTypeData.length ? (
            <div className="engineering-chart-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workTypeData} layout="vertical" margin={{ top: 6, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(value / 10000)}萬`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(value) => money(value)} contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8 }} />
                  <Bar dataKey="value" name="工程營收" fill="#0891b2" radius={[0, 4, 4, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EngineeringChartEmpty>案場尚未填寫工種或報價金額，補齊後即可查看營收分布。</EngineeringChartEmpty>}
        </div>

        <div className="panel engineering-risk-panel">
          <div className="engineering-panel-head">
            <div>
              <h2>應收款 / 收款風險</h2>
              <p>聚焦未收款、低收款率與完工後仍未收款的案場。</p>
            </div>
          </div>
          <div className="engineering-risk-metrics">
            <div><span>未收款總額</span><strong>{money(stats.unpaid)}</strong><i className="danger" style={{ width: `${Math.min(100, stats.totalQuote ? stats.unpaid / stats.totalQuote * 100 : 0)}%` }} /></div>
            <div><span>高風險案場</span><strong>{highRiskSites.length} 件</strong><i className="warning" style={{ width: `${Math.min(100, sites.length ? highRiskSites.length / sites.length * 100 : 0)}%` }} /></div>
            <div><span>完工未收案場</span><strong>{overdueSites.length} 件</strong><i className="neutral" style={{ width: `${Math.min(100, sites.length ? overdueSites.length / sites.length * 100 : 0)}%` }} /></div>
            <div><span>整體收款率</span><strong>{stats.collectionRate}%</strong><i className="success" style={{ width: `${Math.min(100, stats.collectionRate)}%` }} /></div>
          </div>
          {!sites.length && <EngineeringChartEmpty>目前尚無案場收款資料，新增案場與收款紀錄後即可查看風險。</EngineeringChartEmpty>}
        </div>
      </div>

      <div className="panel engineering-ranking-panel">
        <div className="engineering-panel-head">
          <div>
            <h2>Top 案場排行</h2>
            <p>依工程營收排序，同時顯示未收款，讓高價值與高風險案場一眼可見。</p>
          </div>
        </div>
        {rankedSites.length ? (
          <div className="engineering-ranking-list">
            {rankedSites.map((site, index) => {
              const collectionRate = site.revenue ? Math.round(site.received / site.revenue * 1000) / 10 : 0;
              return (
                <div key={site.id || site.name}>
                  <span className="engineering-rank">{index + 1}</span>
                  <div className="engineering-rank-name"><strong>{site.name}</strong><small>{site.client}｜{site.status}</small></div>
                  <div><span>工程營收</span><strong>{money(site.revenue)}</strong></div>
                  <div><span>未收款</span><strong className={site.unpaid > 0 ? 'risk-value' : ''}>{money(site.unpaid)}</strong></div>
                  <div><span>收款率</span><strong>{collectionRate}%</strong></div>
                </div>
              );
            })}
          </div>
        ) : <EngineeringChartEmpty>目前尚無案場可供排行，建立案場後即可查看重點案件。</EngineeringChartEmpty>}
      </div>
    </div>
  );
}

function Dashboard({ companyId, refresh, company, engineeringMode = false, betaActive = false, betaEdition = 'commerce', officialLineUrl = '', onNavigate }) {
  const [s, setS] = useState(null);
  const [jobSites, setJobSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [jobSitePayments, setJobSitePayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const industry = company?.industry;
  const constructionMode = engineeringMode || isConstructionIndustry(industry);

  useEffect(() => {
    let alive = true;

    Promise.all([
      api(`/companies/${companyId}/summary`).catch(() => null),
      constructionMode
        ? api(`/companies/${companyId}/jobsites`).catch(() => [])
        : Promise.resolve([]),
      constructionMode
        ? api(`/companies/${companyId}/leads`).catch(() => [])
        : Promise.resolve([]),
      constructionMode
        ? api(`/companies/${companyId}/jobsites/bi-payments`).catch(() => [])
        : Promise.resolve([]),
      constructionMode
        ? Promise.resolve([])
        : api(`/companies/${companyId}/products`).catch(() => []),
      api(`/feedbacks/my?companyId=${companyId}`).catch(() => [])
    ]).then(([summary, sites, leadRows, paymentRows, productRows, feedbackRows]) => {
      if (!alive) return;
      setS(summary);
      setJobSites(Array.isArray(sites) ? sites : []);
      setLeads(Array.isArray(leadRows) ? leadRows : []);
      setJobSitePayments(Array.isArray(paymentRows) ? paymentRows : []);
      setProducts(Array.isArray(productRows) ? productRows : []);
      setFeedbacks(Array.isArray(feedbackRows) ? feedbackRows : []);
    });

    return () => {
      alive = false;
    };
  }, [companyId, refresh, constructionMode]);

  if (!s) return null;

  const todayText = new Date().toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });

  const constructionStats = (() => {
    const sites = jobSites || [];

    const totalQuote = sites.reduce((sum, site) => sum + jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount'), 0);
    const received = sites.reduce((sum, site) => sum + jobSiteAmount(site, 'receivedAmount', 'received_amount'), 0);
    const unpaid = Math.max(totalQuote - received, 0);

    const totalCost = sites.reduce((sum, site) => {
      const material = jobSiteAmount(site, 'materialCost', 'material_cost');
      const estimate = jobSiteAmount(site, 'estimateCostTotal', 'estimate_cost_total');
      const labor = jobSiteAmount(site, 'laborCost', 'labor_cost');
      const personnel = jobSiteAmount(site, 'personnelCost', 'personnel_cost');
      const outsourced = jobSiteAmount(site, 'outsourcedCost', 'outsourced_cost');
      const misc = jobSiteAmount(site, 'miscCost', 'misc_cost');
      return sum + estimate + material + labor + personnel + outsourced + misc;
    }, 0);

    const profit = totalQuote - totalCost;
    const collectionRate = totalQuote ? Math.round((received / totalQuote) * 1000) / 10 : 0;
    const marginRate = totalQuote ? Math.round((profit / totalQuote) * 1000) / 10 : 0;

    const riskSites = sites.filter((site) => {
      const quote = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
      const paid = jobSiteAmount(site, 'receivedAmount', 'received_amount');
      const status = String(site.status || '');
      const siteCollectionRate = quote ? paid / quote : 0;
      return quote > 0 && siteCollectionRate < 0.5 && !['已結案', '結案'].includes(status);
    });

    return {
      sites,
      leads,
      totalQuote,
      received,
      unpaid,
      totalCost,
      profit,
      collectionRate,
      marginRate,
      riskSites
    };
  })();

  const hasFeedback = feedbacks.length > 0;
  const hasEstimateData = constructionStats.sites.some((site) => (
    jobSiteAmount(site, 'estimateCostTotal', 'estimate_cost_total') > 0 ||
    jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount') > 0
  ));
  const hasPaymentData = jobSitePayments.length > 0 || constructionStats.sites.some((site) => (
    jobSiteAmount(site, 'receivedAmount', 'received_amount') > 0
  ));
  const engineeringOnboardingCompleted = {
    jobsite: constructionStats.sites.length > 0,
    estimate: hasEstimateData,
    payment: hasPaymentData,
    feedback: hasFeedback
  };
  const engineeringOnboardingState = {
    completed: engineeringOnboardingCompleted,
    nextStepId: firstIncompleteStep(['jobsite', 'estimate', 'payment', 'feedback'], engineeringOnboardingCompleted)
  };
  const commerceOnboardingCompleted = {
    product: products.length > 0,
    website: Number(s.monthlySales || 0) > 0,
    ai: false,
    feedback: hasFeedback
  };
  const commerceOnboardingState = {
    completed: commerceOnboardingCompleted,
    nextStepId: firstIncompleteStep(['product', 'website', 'ai', 'feedback'], commerceOnboardingCompleted)
  };
  const allOnboardingState = {
    completed: {},
    nextStepId: 'engineering'
  };
  const currentOnboardingState = betaEdition === 'all'
    ? allOnboardingState
    : betaEdition === 'engineering'
      ? engineeringOnboardingState
      : betaEdition === 'restaurant'
        ? { completed: {}, nextStepId: 'feedback' }
        : commerceOnboardingState;

  if (constructionMode) {
    const activeSites = constructionStats.sites.filter((site) => normalizeJobSiteStatus(site.status) !== '已結案').length;
    const priorityLeads = leads.filter((lead) => Number(lead.fitScore ?? lead.fit_score ?? 0) >= 75 && !['lost', 'converted'].includes(String(lead.status || ''))).length;
    const rows = constructionStats.sites.slice(0, 8).map((site) => {
      const quote = jobSiteAmount(site, 'totalAmount', 'total_amount', 'quoteAmount', 'quote_amount');
      const received = jobSiteAmount(site, 'receivedAmount', 'received_amount');
      const unpaid = Math.max(quote - received, 0);
      const material = jobSiteAmount(site, 'materialCost', 'material_cost');
      const estimate = jobSiteAmount(site, 'estimateCostTotal', 'estimate_cost_total');
      const labor = jobSiteAmount(site, 'laborCost', 'labor_cost');
      const personnel = jobSiteAmount(site, 'personnelCost', 'personnel_cost');
      const outsourced = jobSiteAmount(site, 'outsourcedCost', 'outsourced_cost');
      const misc = jobSiteAmount(site, 'miscCost', 'misc_cost');
      const cost = estimate + material + labor + personnel + outsourced + misc;
      const profit = quote - cost;
      const margin = quote ? Math.round((profit / quote) * 1000) / 10 : 0;
      const collection = quote ? Math.round((received / quote) * 1000) / 10 : 0;

      return [
        site.site_name || site.siteName || '未命名案場',
        site.client_name || site.clientName || '未填客戶',
        site.status || '未設定',
        money(quote),
        money(received),
        money(unpaid),
        `${collection}%`,
        money(profit),
        `${margin}%`
      ];
    });

    return (
      <section className="command-center">
        <div className="command-hero">
          <div>
          <p className="command-kicker">{todayText}｜經營總覽</p>
          <h1>{company.name}</h1>
          <p>今日工程營運狀態：{constructionStats.unpaid > 0 ? `尚有 ${money(constructionStats.unpaid)} 未收款需要追蹤` : '收款狀況穩定'}。案場、報價、成本與收款集中掌握。</p>
          </div>
          <div className="command-hero-side">
            <div className="command-signal">
              <span />
              <strong>資料已同步</strong>
            </div>
            <div className="command-quick-actions">
              <button type="button" onClick={() => onNavigate?.('purchases')}>新增進貨</button>
              <button type="button" onClick={() => onNavigate?.('sales')}>新增銷貨</button>
              <button type="button" onClick={() => onNavigate?.('leads')}>新增案源</button>
              <button type="button" onClick={() => onNavigate?.('jobsites')}>新增案場</button>
              <button type="button" onClick={() => onNavigate?.('reports')}>查看報表</button>
            </div>
          </div>
        </div>

        <TesterGuideCard
          edition={betaEdition}
          betaActive={betaActive}
          officialLineUrl={officialLineUrl}
          onNavigate={onNavigate}
          onboardingState={currentOnboardingState}
        />

        {constructionStats.sites.length === 0 && (
          <div className="onboarding-empty-state">
            <div>
              <strong>目前還沒有案場資料</strong>
              <p>建立第一個案場後，BookAI 會開始整理估價、收款與工程摘要。</p>
            </div>
            <button type="button" onClick={() => onNavigate?.('jobsites')}>建立第一個案場</button>
          </div>
        )}

        <div className="command-metrics">
          <Card title="工程營收總額" value={money(constructionStats.totalQuote)} sub={`案場收款率 ${constructionStats.collectionRate}%`} />
          <Card title="工程成本總額" value={money(constructionStats.totalCost)} sub="材料、工資、外包與雜支" />
          <Card title="應收未收總額" value={money((s.unpaidSales || 0) + constructionStats.unpaid)} sub="需持續追蹤請款" />
          <Card title="應付未付總額" value={money(s.unpaidPurchases || 0)} sub="待安排付款" />
          <Card title="已收款金額" value={money(s.collectedSales || constructionStats.received || 0)} sub="銷貨與案場收款" />
          <Card title="已付款金額" value={money(s.paidPurchases || 0)} sub="進貨付款累計" />
          <Card title="進行中案場" value={activeSites} sub={`總案場 ${constructionStats.sites.length} 件`} />
          <Card title="預估毛利" value={money(constructionStats.profit)} sub={`毛利率 ${constructionStats.marginRate}%`} />
          <Card title="接案中心狀態" value={`${priorityLeads} 件`} sub={`案源總數 ${leads.length} 件`} />
        </div>

        <EngineeringDashboardCharts stats={constructionStats} payments={jobSitePayments} />

        <div className="command-layout">
          <div className="panel command-ai-panel">
            <h2>AI 經營提醒</h2>
            <ul className="summary">
              {constructionStats.sites.length === 0 && <li>目前尚無案場資料，請先到案場中心新增工程案場。</li>}
              {constructionStats.unpaid > 0 && <li>尚有未收款 {money(constructionStats.unpaid)}，建議優先追蹤請款節點。</li>}
              {(s.unpaidPurchases || 0) > 0 && <li>目前應付未付 {money(s.unpaidPurchases || 0)}，建議安排付款時程。</li>}
              {constructionStats.riskSites.length > 0 && <li>{constructionStats.riskSites.length} 個案場收款率偏低，請檢查合約、驗收與請款進度。</li>}
              {constructionStats.marginRate < 25 && constructionStats.totalQuote > 0 && <li>整體毛利率低於 25%，建議重新檢查材料、工資與外包成本。</li>}
              {priorityLeads > 0 && <li>接案中心有 {priorityLeads} 件案源分數較高，適合今天優先追蹤。</li>}
              {constructionStats.sites.length > 0 && constructionStats.unpaid === 0 && <li>目前未收款風險低，請維持案場成本紀錄完整。</li>}
            </ul>
          </div>

          <div className="panel command-actions">
            <h2>快速操作</h2>
            <button type="button" onClick={() => onNavigate?.('purchases')}>新增進貨</button>
            <button type="button" onClick={() => onNavigate?.('sales')}>新增銷貨</button>
            <button type="button" onClick={() => onNavigate?.('leads')}>檢查接案中心</button>
            <button type="button" onClick={() => onNavigate?.('jobsites')}>管理案場中心</button>
            <button type="button" onClick={() => onNavigate?.('jobsites')}>登記收款</button>
            <button type="button" onClick={() => onNavigate?.('reports')}>查看經營報表</button>
          </div>
        </div>

        <div className="panel">
          <h2>近期案場概況</h2>
          <Table
            cols={['案場', '客戶', '狀態', '報價', '已收款', '未收款', '收款率', '毛利', '毛利率']}
            rows={rows.length ? rows : [['尚無案場', '請先新增', '-', money(0), money(0), money(0), '0%', money(0), '0%']]}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="command-center">
      <div className="command-hero">
        <div>
          <p className="command-kicker">{todayText}｜經營總覽</p>
          <h1>{company.name}</h1>
          <p>今日營運狀態：目前累計營收 {money(s.revenue)}，淨利 {money(s.netProfit)}。進貨、銷貨、庫存與帳款集中管理。</p>
        </div>
        <div className="command-hero-side">
          <div className="command-signal">
            <span />
            <strong>資料已同步</strong>
          </div>
          <div className="command-quick-actions">
            <button type="button" onClick={() => onNavigate?.('purchases')}>新增進貨</button>
            <button type="button" onClick={() => onNavigate?.('sales')}>新增銷貨</button>
            <button type="button" onClick={() => onNavigate?.('inventory')}>檢查庫存</button>
            <button type="button" onClick={() => onNavigate?.('invoices')}>處理發票</button>
            <button type="button" onClick={() => onNavigate?.('business-bi')}>BI 分析</button>
          </div>
        </div>
      </div>

      <TesterGuideCard
        edition={betaEdition}
        betaActive={betaActive}
        officialLineUrl={officialLineUrl}
        onNavigate={onNavigate}
        onboardingState={currentOnboardingState}
      />

      {products.length === 0 && betaEdition !== 'restaurant' && (
        <div className="onboarding-empty-state">
          <div>
            <strong>目前還沒有商品或官網內容</strong>
            <p>建立第一個商品後，BookAI 可以協助你整理商品文案、官網首頁與社群草稿。</p>
          </div>
          <button type="button" onClick={() => onNavigate?.('inventory')}>建立第一個商品</button>
        </div>
      )}

      <div className="command-metrics">
        <Card title="本期銷貨" value={money(s.monthlySales || 0)} />
        <Card title="本期進貨" value={money(s.monthlyPurchases || 0)} />
        <Card title="商品成本" value={money(s.cogs || 0)} />
        <Card title="毛利" value={money(s.grossProfit || 0)} />
        <Card title="毛利率" value={`${Number(s.grossMarginRate || 0).toFixed(1)}%`} />
        <Card title="已收款金額" value={money(s.collectedSales || 0)} />
        <Card title="已付款金額" value={money(s.paidPurchases || 0)} />
        <Card title="低庫存警示" value={s.lowStock} />
      </div>

      <div className="overview-grid">
        <div className="panel">
          <h2>營運摘要</h2>
          <ul className="summary">
            <li>本期銷貨總額：{money(s.monthlySales || 0)}</li>
            <li>本期進貨總額：{money(s.monthlyPurchases || 0)}</li>
            <li>本期毛利：{money(s.grossProfit || 0)}，毛利率 {Number(s.grossMarginRate || 0).toFixed(1)}%。</li>
            <li>已收款 {money(s.collectedSales || 0)}，已付款 {money(s.paidPurchases || 0)}。</li>
            <li>庫存成本：{money(s.inventoryValue || 0)}</li>
          </ul>
          <button type="button" className="secondary-btn" onClick={() => onNavigate?.('business-bi')}>前往 BI 分析</button>
        </div>

        <div className="panel">
          <h2>低庫存 / 風險提醒</h2>
          <ul className="bi-alert-list">
            {(s.lowStockItems || []).slice(0, 5).map((item) => (
              <li key={item.id || item.sku || item.name}>{item.name || '未命名商品'}：目前庫存 {item.stock || 0}，安全庫存 {item.safety_stock ?? item.safetyStock ?? 0}</li>
            ))}
            {(s.cashflowAlerts || []).map((item) => <li key={item}>{item}</li>)}
            {!(s.lowStockItems || []).length && !(s.cashflowAlerts || []).length && <li>目前沒有重大庫存或現金流提醒。</li>}
          </ul>
        </div>
      </div>

      <div className="overview-grid">
        <div className="panel">
          <h2>最近交易摘要</h2>
          <Table
            cols={['項目', '金額', '狀態']}
            rows={[
              ['本期銷貨', money(s.monthlySales || 0), `${s.txCount || 0} 筆交易`],
              ['應收未收', money(s.unpaidSales || 0), (s.unpaidSales || 0) > 0 ? '需追蹤收款' : '目前穩定'],
              ['應付未付', money(s.unpaidPurchases || 0), (s.unpaidPurchases || 0) > 0 ? '需安排付款' : '目前穩定'],
              ['待處理發票', s.invoicesPending || 0, '發票中心']
            ]}
          />
        </div>

        <div className="panel">
          <h2>待處理事項</h2>
          <ul className="summary">
            {(s.unpaidSales || 0) > 0 && <li>追蹤應收未收 {money(s.unpaidSales || 0)}。</li>}
            {(s.unpaidPurchases || 0) > 0 && <li>安排應付未付 {money(s.unpaidPurchases || 0)}。</li>}
            {(s.lowStock || 0) > 0 && <li>有 {s.lowStock} 個品項低於安全庫存。</li>}
            {(s.grossMarginRate || 0) > 0 && (s.grossMarginRate || 0) < 25 && <li>毛利率偏低，建議前往 BI 分析檢查商品成本。</li>}
            {!(s.unpaidSales || 0) && !(s.unpaidPurchases || 0) && !(s.lowStock || 0) && <li>目前沒有高優先待處理事項。</li>}
          </ul>
          <button type="button" className="secondary-btn" onClick={() => onNavigate?.('reports')}>查看完整報表</button>
        </div>
      </div>
    </section>
  );
}

function FeedbackCenter({ companyId, officialLineUrl }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    category: '操作卡住',
    page: '',
    description: '',
    expectedResult: '',
    actualResult: '',
    contact: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api(`/feedbacks/my?companyId=${companyId}`);
    setRows(data || []);
  }

  useEffect(() => {
    setMessage('');
    setError('');
    load().catch(() => setError('回饋資料讀取失敗，請稍後再試。'));
  }, [companyId]);

  async function submit(e) {
    e.preventDefault();
    try {
      setMessage('');
      setError('');
      await api('/feedbacks/create', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          category: form.category,
          page: form.page,
          description: form.description,
          expectedResult: form.expectedResult,
          actualResult: form.actualResult,
          contact: form.contact
        })
      });
      setForm({ category: '操作卡住', page: '', description: '', expectedResult: '', actualResult: '', contact: '' });
      setMessage('問題回報已送出，BookAI 團隊會依回報內容追蹤處理。');
      await load();
    } catch (err) {
      setError(err.message || '問題回報送出失敗，請稍後再試。');
    }
  }

  return (
    <section>
      <Title title="產品回饋" desc="提交試營運問題、實際結果與改善建議。你只能看到自己公司的回饋紀錄。" />
      <div className="feedback-support-panel">
        <div>
          <MessageCircle size={22} aria-hidden="true" />
          <div>
            <strong>試營運期間需要協助？</strong>
            <p>可透過產品回饋或 BookAI 官方 LINE 回報。請附上頁面名稱、操作步驟與截圖，方便我們協助排查。</p>
          </div>
        </div>
        {officialLineUrl && (
          <a href={officialLineUrl} target="_blank" rel="noreferrer">
            聯繫官方 LINE
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      <form className="form feedback-form" onSubmit={submit}>
        <label>
          <span>問題類型</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option>操作卡住</option>
            <option>按鈕無反應</option>
            <option>金額 / 報表異常</option>
            <option>畫面顯示問題</option>
            <option>資料沒有儲存</option>
            <option>建議新增功能</option>
            <option>其他</option>
          </select>
        </label>
        <label>
          <span>所在頁面</span>
          <input value={form.page} onChange={(e) => setForm({ ...form, page: e.target.value })} required placeholder="例如：案場中心、品牌官網" />
        </label>
        <label className="feedback-message-field">
          <span>問題描述</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="請說明操作步驟，以及問題發生前後的狀況。" />
        </label>
        <label className="feedback-message-field">
          <span>預期結果</span>
          <textarea value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} required placeholder="你原本預期系統應該如何運作？" />
        </label>
        <label className="feedback-message-field">
          <span>實際結果</span>
          <textarea value={form.actualResult} onChange={(e) => setForm({ ...form, actualResult: e.target.value })} required placeholder="實際看到的畫面、訊息或結果是什麼？" />
        </label>
        <label className="feedback-contact-field">
          <span>聯絡方式（選填）</span>
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="LINE ID、電話或方便聯繫的方式" />
        </label>
        <button className="feedback-submit-btn">送出問題回報</button>
      </form>

      <div className="panel">
        <h2>我的回饋紀錄</h2>
        <Table
          cols={['時間', '問題類型', '頁面', '回報內容', '狀態', '回覆備註']}
          rows={rows.map((row) => [
            row.createdAt || '-',
            row.category || '-',
            row.page || '-',
            row.message,
            getFeedbackStatusLabel(row.status),
            row.adminNote || '-'
          ])}
        />
      </div>
    </section>
  );
}

function ReceivablesManager({ companyId, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({ amount: '', receiptDate: new Date().toISOString().slice(0, 10), method: '', note: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api(`/receivables/list?companyId=${companyId}`);
    setRows(data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || '讀取應收帳款失敗'));
  }, [companyId]);

  async function submit(e) {
    e.preventDefault();
    if (!activeId) return;
    try {
      setMessage('');
      setError('');
      await api(`/sales/${activeId}/receipts?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setForm({ amount: '', receiptDate: new Date().toISOString().slice(0, 10), method: '', note: '' });
      setActiveId(null);
      setMessage('收款已新增，應收帳款已更新');
      await load();
    } catch (err) {
      setError(err.message || '新增收款失敗');
    }
  }

  const active = rows.find((row) => row.id === activeId);

  return (
    <section>
      <Title title="應收帳款" desc="追蹤未收款與部分收款的銷貨單，並登記實際收款。" />
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}
      {active && (
        <form className="form receivable-form" onSubmit={submit}>
          <label><span>單據</span><input value={`${active.documentNo || active.id}｜未收 ${money(active.remainingAmount)}`} readOnly /></label>
          <label><span>收款金額</span><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <label><span>收款日期</span><input type="date" value={form.receiptDate} onChange={(e) => setForm({ ...form, receiptDate: e.target.value })} /></label>
          <label><span>方式</span><input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="匯款、現金、支票" /></label>
          <label><span>備註</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button>新增收款</button>
          <button type="button" className="lead-soft-btn" onClick={() => setActiveId(null)}>取消</button>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="empty-action-state">
          <strong>目前尚無應收帳款。</strong>
          <p>建立銷貨單並選擇「未收款」後，這裡會顯示待收款項。</p>
          <button type="button" onClick={() => onNavigate?.('sales')}>前往銷貨管理</button>
        </div>
      ) : (
        <Table
          cols={['日期', '單號', '客戶', '總額', '已收', '未收', '狀態', '備註', '操作']}
          rows={rows.map((row) => [
            row.date || '-',
            row.documentNo || `#${row.id}`,
            row.customerName || '-',
            money(row.total),
            money(row.receivedAmount),
            money(row.remainingAmount),
            row.collectionStatus,
            row.note || '-',
            <button type="button" className="lead-soft-btn" onClick={() => {
              setActiveId(row.id);
              setForm({ ...form, amount: row.remainingAmount || '', receiptDate: new Date().toISOString().slice(0, 10) });
            }}>新增收款</button>
          ])}
        />
      )}
    </section>
  );
}

function PayablesManager({ companyId, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), method: '', note: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api(`/payables/list?companyId=${companyId}`);
    setRows(data || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || '讀取應付帳款失敗'));
  }, [companyId]);

  async function submit(e) {
    e.preventDefault();
    if (!activeId) return;
    try {
      setMessage('');
      setError('');
      await api(`/purchases/${activeId}/payments?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setForm({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), method: '', note: '' });
      setActiveId(null);
      setMessage('付款已新增，應付帳款已更新');
      await load();
    } catch (err) {
      setError(err.message || '新增付款失敗');
    }
  }

  const active = rows.find((row) => row.id === activeId);

  return (
    <section>
      <Title title="應付帳款" desc="追蹤未付款與部分付款的進貨單，並登記實際付款。" />
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}
      {active && (
        <form className="form payable-form" onSubmit={submit}>
          <label><span>單據</span><input value={`${active.documentNo || active.id}｜未付 ${money(active.remainingAmount)}`} readOnly /></label>
          <label><span>付款金額</span><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <label><span>付款日期</span><input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} /></label>
          <label><span>方式</span><input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="匯款、現金、支票" /></label>
          <label><span>備註</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button>新增付款</button>
          <button type="button" className="lead-soft-btn" onClick={() => setActiveId(null)}>取消</button>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="empty-action-state">
          <strong>目前尚無應付帳款。</strong>
          <p>建立進貨單並選擇「未付款」後，這裡會顯示待付款項。</p>
          <button type="button" onClick={() => onNavigate?.('purchases')}>前往進貨管理</button>
        </div>
      ) : (
        <Table
          cols={['日期', '單號', '供應商', '總額', '已付', '未付', '狀態', '備註', '操作']}
          rows={rows.map((row) => [
            row.date || '-',
            row.documentNo || `#${row.id}`,
            row.supplierName || '-',
            money(row.total),
            money(row.paidAmount),
            money(row.remainingAmount),
            row.paymentStatus,
            row.note || '-',
            <button type="button" className="lead-soft-btn" onClick={() => {
              setActiveId(row.id);
              setForm({ ...form, amount: row.remainingAmount || '', paymentDate: new Date().toISOString().slice(0, 10) });
            }}>新增付款</button>
          ])}
        />
      )}
    </section>
  );
}

function ContactsManager({ companyId, type }) {
  const isSupplier = type === 'suppliers';
  const title = isSupplier ? '供應商管理' : '客戶管理';
  const desc = isSupplier
    ? '管理供應商資料，建立進貨單時可直接選用。'
    : '管理客戶資料，建立銷貨單時可直接選用。';
  const createEmptyForm = () => ({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    taxId: '',
    address: '',
    note: ''
  });
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api(`/${type}/list?companyId=${companyId}`);
    setRows(data || []);
  }

  useEffect(() => {
    setForm(createEmptyForm());
    setEditingId(null);
    setMessage('');
    setError('');
    load().catch((err) => setError(err.message || `讀取${title}失敗`));
  }, [companyId, type]);

  function edit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      contactPerson: row.contactPerson || '',
      phone: row.phone || '',
      email: row.email || '',
      taxId: row.taxId || '',
      address: row.address || '',
      note: row.note || ''
    });
    setMessage(`正在編輯：${row.name}`);
    setError('');
  }

  function reset() {
    setEditingId(null);
    setForm(createEmptyForm());
    setMessage('');
  }

  async function submit(e) {
    e.preventDefault();
    try {
      setError('');
      setMessage('');
      const path = editingId
        ? `/${type}/${editingId}?companyId=${companyId}`
        : `/${type}/create?companyId=${companyId}`;
      await api(path, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(form)
      });
      setMessage(editingId ? `${title}已更新` : `${title}已新增`);
      reset();
      await load();
    } catch (err) {
      setError(err.message || `${title}儲存失敗`);
    }
  }

  async function remove(row) {
    if (!confirm(`確定刪除「${row.name}」？`)) return;
    try {
      setError('');
      setMessage('');
      await api(`/${type}/${row.id}?companyId=${companyId}`, { method: 'DELETE' });
      setMessage(`${title}已刪除`);
      await load();
    } catch (err) {
      setError(err.message || `${title}刪除失敗`);
    }
  }

  return (
    <section>
      <Title title={title} desc={desc} />
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      <form className="form erp-form erp-contact-form" onSubmit={submit}>
        <label><span>名稱</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label><span>聯絡人</span><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label>
        <label><span>電話</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label><span>電子信箱</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label><span>統編</span><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></label>
        <label><span>地址</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label><span>備註</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <button>{editingId ? '儲存修改' : '新增資料'}</button>
        {editingId && <button type="button" className="lead-soft-btn" onClick={reset}>取消編輯</button>}
      </form>

      <Table
        cols={['名稱', '聯絡人', '電話', '電子信箱', '統編', '地址', '備註', '操作']}
        rows={rows.map((row) => [
          row.name,
          row.contactPerson || '-',
          row.phone || '-',
          row.email || '-',
          row.taxId || '-',
          row.address || '-',
          row.note || '-',
          <div className="lead-actions">
            <button type="button" className="lead-soft-btn" onClick={() => edit(row)}>編輯</button>
            <button type="button" className="lead-danger-btn" onClick={() => remove(row)}>刪除</button>
          </div>
        ])}
      />
    </section>
  );
}

function PurchasesManager({ companyId, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    supplierName: '',
    supplierId: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    category: '商品',
    itemName: '',
    productId: '',
    quantity: 1,
    unit: '',
    unitCost: 0,
    tax: '',
    paymentStatus: '未付款',
    paidAmount: 0,
    note: ''
  });

  async function load() {
    const [purchaseRows, productRows, supplierRows] = await Promise.all([
      api(`/purchases/list?companyId=${companyId}`),
      api(`/companies/${companyId}/products`),
      api(`/suppliers/list?companyId=${companyId}`)
    ]);
    setRows(purchaseRows || []);
    setProducts(productRows || []);
    setSuppliers(supplierRows || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || '讀取進貨資料失敗'));
  }, [companyId]);

  function selectProduct(productId) {
    const product = products.find((p) => String(p.id) === String(productId));
    setForm({
      ...form,
      productId,
      itemName: product?.name || form.itemName,
      unit: product?.unit || form.unit,
      unitCost: product?.cost || form.unitCost
    });
  }

  async function submit(e) {
    e.preventDefault();
    try {
      setMessage('');
      setError('');
      const supplier = suppliers.find((s) => String(s.id) === String(form.supplierId));
      await api(`/purchases/create?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.supplierId || null,
          supplierName: supplier?.name || form.supplierName,
          purchaseDate: form.purchaseDate,
          category: form.category,
          tax: form.tax === '' ? undefined : Number(form.tax),
          paymentStatus: form.paymentStatus,
          paidAmount: Number(form.paidAmount || 0),
          note: form.note,
          items: [{
            productId: form.productId || null,
            itemName: form.itemName,
            quantity: Number(form.quantity || 0),
            unit: form.unit,
            unitCost: Number(form.unitCost || 0)
          }]
        })
      });
      setMessage('進貨單已建立，庫存已同步更新');
      setForm({ ...form, itemName: '', productId: '', quantity: 1, unitCost: 0, note: '' });
      await load();
    } catch (err) {
      setError(err.message || '建立進貨單失敗');
    }
  }

  async function voidPurchase(row) {
    if (!confirm(`確定作廢進貨單「${row.purchaseNo || row.id}」？作廢後會回滾庫存。`)) return;
    try {
      setMessage('');
      setError('');
      await api(`/purchases/${row.id}/void?companyId=${companyId}`, { method: 'POST' });
      setMessage('進貨單已作廢，庫存已回滾');
      await load();
    } catch (err) {
      setError(err.message || '作廢進貨單失敗');
    }
  }

  async function quickPayment(row) {
    const amount = prompt(`請輸入付款金額，未付 ${money(row.remainingAmount || 0)}`, row.remainingAmount || '');
    if (!amount) return;
    try {
      setMessage('');
      setError('');
      await api(`/purchases/${row.id}/payments?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), paymentDate: new Date().toISOString().slice(0, 10) })
      });
      setMessage('付款已新增');
      await load();
    } catch (err) {
      setError(err.message || '新增付款失敗');
    }
  }

  const subtotal = Number(form.quantity || 0) * Number(form.unitCost || 0);

  return (
    <section>
      <Title title="進貨管理" desc="建立進貨單、同步庫存、追蹤付款狀態。" />
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      <form className="form erp-form" onSubmit={submit}>
        <label><span>供應商</span><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">手動填寫</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label><span>供應商名稱</span><input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></label>
        <label><span>進貨日期</span><input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></label>
        <label><span>類別</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>商品</option><option>材料</option><option>食材</option><option>耗材</option><option>其他</option></select></label>
        <label><span>連動庫存品項</span><select value={form.productId} onChange={(e) => selectProduct(e.target.value)}><option value="">不連動庫存</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}｜庫存 {p.stock}</option>)}</select></label>
        <label><span>品項名稱</span><input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} required /></label>
        <label><span>數量</span><input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
        <label><span>單位</span><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
        <label><span>單價</span><input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></label>
        <label><span>稅額</span><input type="number" min="0" step="0.01" placeholder={`預設 ${Math.round(subtotal * 0.05)}`} value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
        <label><span>付款狀態</span><select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}><option>未付款</option><option>部分付款</option><option>已付款</option></select></label>
        <label><span>已付款金額</span><input type="number" min="0" step="0.01" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} /></label>
        <label><span>備註</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div className="erp-form-total"><span>小計</span><strong>{money(subtotal)}</strong></div>
        <button>建立進貨單</button>
      </form>

      <Table
        cols={['日期', '單號', '供應商', '類別', '總額', '已付', '未付', '付款狀態', '狀態', '備註', '操作']}
        rows={rows.map((row) => [
          row.purchaseDate,
          row.purchaseNo,
          row.supplierName || '-',
          row.category || '-',
          money(row.total),
          money(row.paidAmount),
          money(row.remainingAmount),
          row.paymentStatus,
          row.status === 'void' ? '作廢' : '已確認',
          row.note || '-',
          row.status === 'void'
            ? '-'
            : <div className="lead-actions">
                <button type="button" className="lead-soft-btn" onClick={() => quickPayment(row)}>新增付款</button>
                <button type="button" className="lead-soft-btn" onClick={() => onNavigate?.('payables')}>應付帳款</button>
                <button type="button" className="lead-danger-btn" onClick={() => voidPurchase(row)}>作廢</button>
              </div>
        ])}
      />
    </section>
  );
}

function SalesManager({ companyId, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customerName: '',
    customerId: '',
    saleDate: new Date().toISOString().slice(0, 10),
    category: '商品銷售',
    itemName: '',
    productId: '',
    quantity: 1,
    unit: '',
    unitPrice: 0,
    tax: '',
    collectionStatus: '未收款',
    receivedAmount: 0,
    note: ''
  });

  async function load() {
    const [saleRows, productRows, customerRows] = await Promise.all([
      api(`/sales/list?companyId=${companyId}`),
      api(`/companies/${companyId}/products`),
      api(`/customers/list?companyId=${companyId}`)
    ]);
    setRows(saleRows || []);
    setProducts(productRows || []);
    setCustomers(customerRows || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || '讀取銷貨資料失敗'));
  }, [companyId]);

  function selectProduct(productId) {
    const product = products.find((p) => String(p.id) === String(productId));
    setForm({
      ...form,
      productId,
      itemName: product?.name || form.itemName,
      unit: product?.unit || form.unit,
      unitPrice: product?.price || form.unitPrice
    });
  }

  async function submit(e) {
    e.preventDefault();
    try {
      setMessage('');
      setError('');
      const customer = customers.find((c) => String(c.id) === String(form.customerId));
      await api(`/sales/create?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.customerId || null,
          customerName: customer?.name || form.customerName,
          saleDate: form.saleDate,
          category: form.category,
          tax: form.tax === '' ? undefined : Number(form.tax),
          collectionStatus: form.collectionStatus,
          receivedAmount: Number(form.receivedAmount || 0),
          note: form.note,
          items: [{
            productId: form.productId || null,
            itemName: form.itemName,
            quantity: Number(form.quantity || 0),
            unit: form.unit,
            unitPrice: Number(form.unitPrice || 0)
          }]
        })
      });
      setMessage('銷貨單已建立，庫存已同步扣減');
      setForm({ ...form, itemName: '', productId: '', quantity: 1, unitPrice: 0, note: '' });
      await load();
    } catch (err) {
      setError(err.message || '建立銷貨單失敗');
    }
  }

  async function voidSale(row) {
    if (!confirm(`確定作廢銷貨單「${row.saleNo || row.id}」？作廢後會回滾庫存。`)) return;
    try {
      setMessage('');
      setError('');
      await api(`/sales/${row.id}/void?companyId=${companyId}`, { method: 'POST' });
      setMessage('銷貨單已作廢，庫存已回滾');
      await load();
    } catch (err) {
      setError(err.message || '作廢銷貨單失敗');
    }
  }

  async function quickReceipt(row) {
    const amount = prompt(`請輸入收款金額，未收 ${money(row.remainingAmount || 0)}`, row.remainingAmount || '');
    if (!amount) return;
    try {
      setMessage('');
      setError('');
      await api(`/sales/${row.id}/receipts?companyId=${companyId}`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), receiptDate: new Date().toISOString().slice(0, 10) })
      });
      setMessage('收款已新增');
      await load();
    } catch (err) {
      setError(err.message || '新增收款失敗');
    }
  }

  const subtotal = Number(form.quantity || 0) * Number(form.unitPrice || 0);

  return (
    <section>
      <Title title="銷貨管理" desc="建立銷貨單、同步扣減庫存、追蹤收款狀態。" />
      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}

      <form className="form erp-form" onSubmit={submit}>
        <label><span>客戶</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">手動填寫</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span>客戶名稱</span><input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
        <label><span>銷貨日期</span><input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} /></label>
        <label><span>類別</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>商品銷售</option><option>工程服務</option><option>餐飲營收</option><option>其他</option></select></label>
        <label><span>連動庫存品項</span><select value={form.productId} onChange={(e) => selectProduct(e.target.value)}><option value="">不連動庫存</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}｜庫存 {p.stock}</option>)}</select></label>
        <label><span>品項名稱</span><input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} required /></label>
        <label><span>數量</span><input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
        <label><span>單位</span><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
        <label><span>單價</span><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></label>
        <label><span>稅額</span><input type="number" min="0" step="0.01" placeholder={`預設 ${Math.round(subtotal * 0.05)}`} value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
        <label><span>收款狀態</span><select value={form.collectionStatus} onChange={(e) => setForm({ ...form, collectionStatus: e.target.value })}><option>未收款</option><option>部分收款</option><option>已收款</option></select></label>
        <label><span>已收款金額</span><input type="number" min="0" step="0.01" value={form.receivedAmount} onChange={(e) => setForm({ ...form, receivedAmount: e.target.value })} /></label>
        <label><span>備註</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div className="erp-form-total"><span>小計</span><strong>{money(subtotal)}</strong></div>
        <button>建立銷貨單</button>
      </form>

      <Table
        cols={['日期', '單號', '客戶', '類別', '總額', '已收', '未收', '收款狀態', '狀態', '備註', '操作']}
        rows={rows.map((row) => [
          row.saleDate,
          row.saleNo,
          row.customerName || '-',
          row.category || '-',
          money(row.total),
          money(row.receivedAmount),
          money(row.remainingAmount),
          row.collectionStatus,
          row.status === 'void' ? '作廢' : '已確認',
          row.note || '-',
          row.status === 'void'
            ? '-'
            : <div className="lead-actions">
                <button type="button" className="lead-soft-btn" onClick={() => quickReceipt(row)}>新增收款</button>
                <button type="button" className="lead-soft-btn" onClick={() => onNavigate?.('receivables')}>應收帳款</button>
                <button type="button" className="lead-danger-btn" onClick={() => voidSale(row)}>作廢</button>
              </div>
        ])}
      />
    </section>
  );
}

function Transactions({ companyId }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api(`/companies/${companyId}/transactions`).then(setRows);
  }, [companyId]);

  const filtered = rows.filter((r) => !filter || r.platform_key === filter);
  const platforms = [...new Set(rows.map((r) => r.platform_key))];

  return (
    <section>
      <Title title="收支管理" desc="整理手動交易、平台訂單與其他收入支出紀錄。" />

      <label>
        <span>平台篩選</span>
        <select onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部平台</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {getPlatformName(p)}
            </option>
          ))}
        </select>
      </label>

      <Table
        cols={['平台', '訂單', '總額', '手續費', '成本', '實收', '平台毛利']}
        rows={filtered.map((r) => [
          getPlatformName(r.platform_key),
          r.external_order_id,
          money(r.gross_amount),
          money(r.platform_fee),
          money(r.cost_of_goods_sold),
          money(r.net_amount),
          money(r.platform_profit)
        ])}
      />
    </section>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[BookAI] UI render failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-screen">
          <div className="panel app-error-card">
            <h1>頁面暫時無法顯示</h1>
            <p>系統已保護目前操作，沒有寫入或同步任何外部資料。請重新整理頁面後再試，若持續發生請透過產品回饋或官方客服聯繫 BookAI。</p>
            <button type="button" onClick={() => window.location.reload()}>重新整理</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Invoices({ companyId }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    buyerName: '',
    buyerTaxId: '',
    amountExclTax: 1000,
    invoiceType: 'B2C'
  });

  const load = () => api(`/companies/${companyId}/invoices`).then(setRows);

  useEffect(() => {
    load();
  }, [companyId]);

  async function add(e) {
    e.preventDefault();
    await api(`/companies/${companyId}/invoices`, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    load();
  }

  return (
    <section>
      <Title title="發票中心" desc="B2B / B2C 發票整理與 5% 營業稅試算。" />

      <Form onSubmit={add}>
        <label>
          <span>買方名稱</span>
          <input
            placeholder="例：王先生 / 某某有限公司"
            value={form.buyerName}
            onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
          />
        </label>

        <label>
          <span>買方統編</span>
          <input
            placeholder="例：12345678，B2C 可空白"
            value={form.buyerTaxId}
            onChange={(e) => setForm({ ...form, buyerTaxId: e.target.value })}
          />
        </label>

        <label>
          <span>未稅金額</span>
          <input
            type="number"
            placeholder="例：1000"
            value={form.amountExclTax}
            onChange={(e) => setForm({ ...form, amountExclTax: e.target.value })}
          />
        </label>

        <label>
          <span>發票類型</span>
          <select
            value={form.invoiceType}
            onChange={(e) => setForm({ ...form, invoiceType: e.target.value })}
          >
            <option value="B2C">B2C 消費者</option>
            <option value="B2B">B2B 公司行號</option>
          </select>
        </label>

        <button>新增發票</button>
      </Form>

      <Table
        cols={['發票號碼', '類型', '買方', '未稅', '稅額', '含稅', '狀態']}
        rows={rows.map((r) => [
          r.invoice_no,
          r.invoice_type,
          r.buyer_name,
          money(r.amount_excl_tax),
          money(r.tax_amount),
          money(r.amount_incl_tax),
          r.status
        ])}
      />
    </section>
  );
}

function createInventoryForm(constructionMode) {
  return {
    name: '',
    sku: '',
    category: constructionMode ? '材料' : '一般商品',
    unit: constructionMode ? '桶' : '個',
    price: '',
    cost: '',
    stock: 0,
    safetyStock: 0,
    supplier: '',
    storageLocation: '',
    note: ''
  };
}

const commerceProductCategories = [
  '一般商品',
  '成品',
  '原物料',
  '包材耗材',
  '服飾配件',
  '美妝保養',
  '食品飲品',
  '居家生活',
  '寵物用品',
  '3C 配件',
  '贈品樣品',
  '組合商品',
  '服務項目',
  '其他'
];

function Inventory({ companyId, company }) {
  const industry = company?.industry;
  const constructionMode = isConstructionIndustry(industry);
  const [rows, setRows] = useState([]);
  const [jobSites, setJobSites] = useState([]);
  const [movements, setMovements] = useState([]);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySuccess, setInventorySuccess] = useState('');

  const [form, setForm] = useState(() => createInventoryForm(constructionMode));

  const [movementForm, setMovementForm] = useState({
    productId: '',
    movementType: '進貨入庫',
    quantity: '',
    jobSiteId: '',
    note: ''
  });

  const load = async () => {
    const [products, sites, movementRows] = await Promise.all([
      api(`/companies/${companyId}/products`).catch(() => []),
      constructionMode ? api(`/companies/${companyId}/jobsites`).catch(() => []) : Promise.resolve([]),
      constructionMode ? api(`/companies/${companyId}/inventory-movements`).catch(() => []) : Promise.resolve([])
    ]);

    setRows(Array.isArray(products) ? products : []);
    setJobSites(Array.isArray(sites) ? sites : []);
    setMovements(Array.isArray(movementRows) ? movementRows : []);
  };

  useEffect(() => {
    load();
  }, [companyId]);

  useEffect(() => {
    setForm(createInventoryForm(constructionMode));
  }, [constructionMode]);

  async function add(e) {
    e.preventDefault();
    setInventoryError('');
    setInventorySuccess('');
    await api(`/companies/${companyId}/products`, {
      method: 'POST',
      body: JSON.stringify(form)
    });

    setForm(createInventoryForm(constructionMode));
    setInventorySuccess('商品已新增成功');

    load();
  }

  async function addMovement(e) {
    e.preventDefault();

    try {
      setInventoryError('');
      setInventorySuccess('');

      await api(`/companies/${companyId}/inventory-movements`, {
        method: 'POST',
        body: JSON.stringify(movementForm)
      });

      setMovementForm({
        productId: '',
        movementType: '進貨入庫',
        quantity: '',
        jobSiteId: '',
        note: ''
      });

      await load();
      setInventorySuccess('庫存異動已完成，庫存與案場成本已同步更新。');
    } catch (err) {
      console.error(err);
      setInventoryError(err.message || '庫存異動失敗，請檢查材料、數量與案場是否正確。');
    }
  }

  function exportInventoryCsv() {
    const headers = constructionMode
      ? ['名稱', '編號', '類型', '單位', '單價', '成本', '庫存數量', '安全庫存', '供應商', '存放位置', '備註', '庫存狀態']
      : ['商品名稱', 'SKU', '分類', '單位', '售價', '成本', '庫存', '安全庫存', '供應商', '存放位置', '備註', '庫存狀態'];

    const csvRows = rows.map((r) => {
      const stock = Number(r.stock || 0);
      const safety = Number(r.safety_stock ?? r.safetyStock ?? 0);
      const status = stock <= safety ? '低於安全庫存' : '正常';

      return [
        r.name || '',
        r.sku || '',
        r.category || '',
        r.unit || '',
        r.price || 0,
        r.cost || 0,
        stock,
        safety,
        r.supplier || '',
        r.storage_location || r.storageLocation || '',
        r.note || '',
        status
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`BookAI_${constructionMode ? '材料工具庫存' : '商品庫存'}_${today}.csv`, headers, csvRows);
  }

  function exportMovementsCsv() {
    const headers = [
      '日期',
      '材料 / 工具',
      '編號',
      '異動類型',
      '數量',
      '單位',
      '異動前庫存',
      '異動後庫存',
      '單位成本',
      '案場編號',
      '案場名稱',
      '備註'
    ];

    const csvRows = movements.map((m) => [
      m.createdAt || '',
      m.productName || '',
      m.productSku || '',
      m.movementType || '',
      m.quantity || 0,
      m.unit || '',
      m.beforeStock || 0,
      m.afterStock || 0,
      m.unitCost || 0,
      m.jobSiteId || '',
      m.jobSiteName || '',
      m.note || ''
    ]);

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`BookAI_庫存異動紀錄_${today}.csv`, headers, csvRows);
  }

  return (
    <section>
      <Title
        title={constructionMode ? '材料 / 工具庫存 ERP' : fieldLabel(industry, 'inventoryTitle')}
        desc={constructionMode
          ? '管理工程材料、工具、耗材、設備、供應商、存放位置與案場用料。'
          : fieldLabel(industry, 'inventoryDesc')}
      />

      <div className="panel">
        <h2>{constructionMode ? '新增材料 / 工具' : '新增商品 / 材料'}</h2>
        {inventoryError && <div className="error">{inventoryError}</div>}
        {inventorySuccess && <div className="notice">{inventorySuccess}</div>}
        <Form onSubmit={add}>
          <label>
            <span>{constructionMode ? '材料 / 工具名稱' : fieldLabel(industry, 'productName')}</span>
            <input
              placeholder={constructionMode ? '例：乳膠漆 5 加侖、電鑽、砂紙' : '例：智能寵物飲水機'}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            <span>{constructionMode ? '編號' : fieldLabel(industry, 'sku')}</span>
            <input
              placeholder={constructionMode ? '例：PAINT-001' : '例：PET-001'}
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
          </label>

          <label>
            <span>{constructionMode ? '類型' : '分類'}</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {constructionMode ? (
                <>
                  <option value="材料">材料</option>
                  <option value="工具">工具</option>
                  <option value="耗材">耗材</option>
                  <option value="設備">設備</option>
                  <option value="其他">其他</option>
                </>
              ) : (
                <>
                  {commerceProductCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </>
              )}
            </select>
          </label>

          <label>
            <span>單位</span>
            <input
              placeholder={constructionMode ? '例：桶、包、支、台、組' : '例：個、組、包'}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>

          <label>
            <span>{fieldLabel(industry, 'price')}</span>
            <input type="number" placeholder={constructionMode ? '例：1800' : '例：1280'} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>

          <label>
            <span>{fieldLabel(industry, 'cost')}</span>
            <input type="number" placeholder={constructionMode ? '例：1200' : '例：760'} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </label>

          <label>
            <span>{constructionMode ? '庫存數量' : fieldLabel(industry, 'stock')}</span>
            <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </label>

          <label>
            <span>{fieldLabel(industry, 'safetyStock')}</span>
            <input type="number" value={form.safetyStock} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} />
          </label>

          <label>
            <span>供應商</span>
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </label>

          <label>
            <span>存放位置</span>
            <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
          </label>

          <label style={{ gridColumn: '1 / -1' }}>
            <span>備註</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>

          <button>{constructionMode ? '新增材料 / 工具' : '新增'}</button>
        </Form>
      </div>

      {constructionMode && (
        <div className="panel">
          <h2>庫存異動登記</h2>
          <div className="notice">
            進貨入庫會增加庫存；案場用料會減少庫存；退料回庫會增加庫存；報廢損耗會減少庫存；盤點調整會直接修正庫存。案場用料可選案場編號，方便追蹤每個案場用了哪些材料。
          </div>

          {inventoryError && <div className="error">{inventoryError}</div>}
          {inventorySuccess && <div className="notice">{inventorySuccess}</div>}

          <Form onSubmit={addMovement}>
            <label>
              <span>材料 / 工具</span>
              <select
                value={movementForm.productId}
                onChange={(e) => setMovementForm({ ...movementForm, productId: e.target.value })}
              >
                <option value="">請選擇</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} {r.name}（庫存 {r.stock || 0} {r.unit || ''}）
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>異動類型</span>
              <select
                value={movementForm.movementType}
                onChange={(e) => setMovementForm({ ...movementForm, movementType: e.target.value })}
              >
                <option value="進貨入庫">進貨入庫（增加庫存）</option>
                <option value="案場用料">案場用料（扣除庫存）</option>
                <option value="退料回庫">退料回庫（增加庫存）</option>
                <option value="報廢損耗">報廢損耗（扣除庫存）</option>
                <option value="盤點調整">盤點調整（直接修正庫存）</option>
              </select>
            </label>

            <label>
              <span>{movementForm.movementType === '盤點調整' ? '盤點後庫存' : '數量'}</span>
              <input
                type="number"
                value={movementForm.quantity}
                placeholder={movementForm.movementType === '盤點調整' ? '例：28' : '例：3'}
                onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
              />
            </label>

            <label>
              <span>關聯案場</span>
              <select
                value={movementForm.jobSiteId}
                onChange={(e) => setMovementForm({ ...movementForm, jobSiteId: e.target.value })}
              >
                <option value="">不指定案場</option>
                {jobSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    案場 #{s.id}｜{s.siteName || s.name || '未命名案場'}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>備註</span>
              <input
                placeholder="例：南屯案場一樓牆面用料、退回半桶、盤點修正"
                value={movementForm.note}
                onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
              />
            </label>

            <button>登記庫存異動</button>
          </Form>
        </div>
      )}

      <div className="panel">
        <h2>{constructionMode ? '材料 / 工具庫存總覽' : '庫存總覽'}</h2>
        <button type="button" onClick={exportInventoryCsv}>
          {constructionMode ? '匯出材料 / 工具 CSV' : '匯出庫存 CSV'}
        </button>


        {!constructionMode && rows.length === 0 && (
          <div className="onboarding-empty-state compact">
            <div>
              <strong>目前還沒有商品或官網內容</strong>
              <p>先建立第一個商品，後續可以整理商品文案、庫存與官網展示內容。</p>
            </div>
          </div>
        )}
        <Table
          cols={constructionMode
            ? ['編號', '名稱', '類型', '單位', '單價', '成本', '庫存', '安全庫存', '供應商', '存放位置', '狀態', '備註']
            : [fieldLabel(industry, 'sku'), fieldLabel(industry, 'productName'), '分類', '單位', fieldLabel(industry, 'price'), fieldLabel(industry, 'cost'), '庫存', '安全庫存', '狀態']}
          rows={rows.map((r) => {
            const stock = Number(r.stock || 0);
            const safety = Number(r.safety_stock ?? r.safetyStock ?? 0);
            const status = stock <= safety ? '低於安全庫存' : '正常';

            return constructionMode
              ? [
                  r.sku,
                  r.name,
                  r.category || '',
                  r.unit || '',
                  money(r.price),
                  money(r.cost),
                  stock,
                  safety,
                  r.supplier || '',
                  r.storage_location || r.storageLocation || '',
                  status,
                  r.note || ''
                ]
              : [
                  r.sku,
                  r.name,
                  r.category || '',
                  r.unit || '',
                  money(r.price),
                  money(r.cost),
                  stock,
                  safety,
                  status
                ];
          })}
        />
      </div>

      {constructionMode && (
        <div className="panel">
          <h2>最近庫存異動紀錄</h2>
          <button type="button" onClick={exportMovementsCsv}>
            匯出庫存異動 CSV
          </button>

          <Table
            cols={['日期', '材料 / 工具', '異動類型', '數量', '庫存變化', '案場', '備註']}
            rows={movements.length
              ? movements.map((m) => [
                  m.createdAt || '',
                  m.productName || '',
                  m.movementType || '',
                  `${m.quantity || 0} ${m.unit || ''}`,
                  `${m.beforeStock || 0} → ${m.afterStock || 0}`,
                  m.jobSiteId ? `#${m.jobSiteId} ${m.jobSiteName || ''}` : '-',
                  m.note || ''
                ])
              : [['尚無紀錄', '-', '-', '-', '-', '-', '-']]
            }
          />
        </div>
      )}
    </section>
  );
}
function Vouchers({ companyId }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    vendor: '供應商',
    purpose: '原物料採購',
    amount: 1050
  });

  const load = () => api(`/companies/${companyId}/vouchers`).then(setRows);

  useEffect(() => {
    load();
  }, [companyId]);

  async function add(e) {
    e.preventDefault();
    await api(`/companies/${companyId}/vouchers`, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    load();
  }

  return (
    <section>
      <Title title="電子憑證" desc="整理收據、發票與費用用途，並做營業稅扣抵初步檢查。" />

      <Form onSubmit={add}>
        <label>
          <span>供應商 / 店家名稱</span>
          <input
            placeholder="例：某某材料行"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
        </label>

        <label>
          <span>用途 / 費用說明</span>
          <input
            placeholder="例：原物料採購 / 油漆材料 / 外包費"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </label>

        <label>
          <span>含稅金額</span>
          <input
            type="number"
            placeholder="例：1050"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>

        <button>新增憑證</button>
      </Form>

      <Table
        cols={['供應商', '用途', '金額', '稅額', '可扣抵', '狀態']}
        rows={rows.map((r) => [
          r.vendor,
          r.purpose,
          money(r.amount),
          money(r.tax_amount),
          r.deductible ? '是' : '否',
          r.status
        ])}
      />
    </section>
  );
}

function Accounting({ companyId }) {
  const [r, setR] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    api(`/companies/${companyId}/accounting/reports`).then(setR);
    api(`/companies/${companyId}/accounting/accounts`).then(setAccounts);
  }, [companyId]);

  if (!r) return null;

  return (
    <section>
      <Title title="會計中心 / 成本會計" desc="Pro 版核心：複式會計基礎、COGS、平台毛利與成本率。" />

      <div className="grid">
        <Card title="營收" value={money(r.incomeStatement.revenue)} />
        <Card title="商品成本 COGS" value={money(r.incomeStatement.cogs)} />
        <Card title="毛利" value={money(r.incomeStatement.grossMargin)} />
        <Card title="淨利" value={money(r.incomeStatement.netProfit)} />
      </div>

      <div className="panel">
        <h2>科目表</h2>
        <Table cols={['代碼', '科目', '類型']} rows={accounts.map((a) => [a.code, a.name, a.type])} />
      </div>
    </section>
  );
}

function Tax({ companyId }) {
  const [r, setR] = useState(null);

  useEffect(() => {
    api(`/companies/${companyId}/tax/vat`).then(setR);
  }, [companyId]);

  if (!r) return null;

  return (
    <section>
      <Title title="稅務中心" desc="目前只做管理試算，不做正式申報。" />

      <div className="grid">
        <Card title="銷項稅額" value={money(r.outputTax)} />
        <Card title="進項稅額" value={money(r.inputTax)} />
        <Card title="應納營業稅" value={money(r.payableVAT)} />
      </div>

      <div className="notice">{r.disclaimer}</div>
    </section>
  );
}

function Accountant({ companyId }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    clientName: '新客戶有限公司',
    clientTaxId: '87654321'
  });

  const load = () => api(`/companies/${companyId}/accountant/clients`).then(setRows);

  useEffect(() => {
    load();
  }, [companyId]);

  async function add(e) {
    e.preventDefault();
    await api(`/companies/${companyId}/accountant/clients`, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    load();
  }

  return (
    <section>
      <Title title="記帳士中台" desc="多客戶收件、月結進度與缺件追蹤。" />

      <Form onSubmit={add}>
        <label>
          <span>客戶名稱</span>
          <input
            placeholder="例：新客戶有限公司"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
        </label>

        <label>
          <span>客戶統編</span>
          <input
            placeholder="例：87654321"
            value={form.clientTaxId}
            onChange={(e) => setForm({ ...form, clientTaxId: e.target.value })}
          />
        </label>

        <button>新增客戶</button>
      </Form>

      <Table
        cols={['客戶', '統編', '狀態', '月結進度', '缺件數']}
        rows={rows.map((r) => [
          r.client_name,
          r.client_tax_id,
          r.status,
          `${r.closing_progress}%`,
          r.missing_docs
        ])}
      />
    </section>
  );
}

function jobSiteHealth(marginRate, unpaid, quoteAmount) {
  if (marginRate < 0) return '虧損風險：此案場目前預估虧損';
  if (unpaid > quoteAmount * 0.5) return '收款風險：未收款比例偏高';
  if (marginRate < 20) return '低毛利：建議檢查材料、工資或外包成本';
  if (marginRate >= 35) return '高毛利：此案場表現佳';
  return '正常：持續追蹤進度與收款';
}

function JobSites({ companyId, company }) {
  const projectTypeOptions = [
    '油漆工程',
    '裝潢工程',
    '水電工程',
    '冷氣工程',
    '泥作工程',
    '拆除工程',
    '防水工程',
    '弱電工程',
    '鷹架工程',
    '板模工程'
  ];

  const projectTypeTips = {
    '油漆工程': '油漆工程適合用坪數、批土、底漆、面漆、保護工程與高處施工等項目估價。',
    '裝潢工程': '裝潢工程適合用台尺、五金、抽屜、燈條、特殊板材與拆舊櫃等項目估價。',
    '水電工程': '水電工程適合用點位、迴路、配電箱、打牆開槽、面板升級與全戶配管估價。',
    '冷氣工程': '冷氣工程適合用主機、標準安裝、銅管追加、洗洞、室外機架與高樓危險施工估價。',
    '泥作工程': '泥作工程適合用打底、貼磚、磁磚材料、防水層、填縫與搬運上樓估價。',
    '拆除工程': '拆除工程適合用拆除工資、打石、清運車數、廢棄物處理、電梯保護與樓層加價估價。',
    '防水工程': '防水工程適合用施作坪數、防水彈泥、抗裂網、高壓灌注、裂縫修補與保固估價。',
    '弱電工程': '弱電工程適合用監視器點位、網路點位、NVR/DVR、硬碟、PoE Switch 與遠端設定估價。',
    '鷹架工程': '鷹架工程適合用搭設坪數、防塵網、防墜網、超期租金、特殊高度與道路使用估價。',
    '板模工程': '板模工程適合用柱模、樑模、牆模、樓板模、清水模加價、支撐鋼管與拆模估價。'
  };

  const estimateUnitOptions = [
    '個', '組', '台', '套', '支', '片', '張',
    '坪', '㎡', '才',
    '米', '公尺', '尺', '台尺',
    '式', '工', '日', '趟', '戶', '間',
    '公斤', '包', '桶', '箱',
    '自訂'
  ];

  function isPresetEstimateUnit(unit) {
    return estimateUnitOptions.includes(unit) && unit !== '自訂';
  }

  function emptyEstimateDraft() {
    return {
      itemCategory: '加項',
      itemName: '',
      quantity: '',
      unit: '式',
      unitPrice: '',
      unitCost: '',
      note: ''
    };
  }

  function estimateQuantity(item) {
    return numberValue(item.quantity);
  }

  function estimateUnitPrice(item) {
    return numberValue(item.unitPrice ?? item.unit_price);
  }

  function estimateUnitCost(item) {
    if (item.unitCost !== undefined || item.unit_cost !== undefined) {
      return numberValue(item.unitCost ?? item.unit_cost);
    }

    const quantity = estimateQuantity(item);
    const costAmount = numberValue(item.costAmount ?? item.cost_amount);
    return quantity > 0 ? costAmount / quantity : costAmount;
  }

  function estimateQuoteSubtotal(item) {
    return estimateQuantity(item) * estimateUnitPrice(item);
  }

  function estimateCostSubtotal(item) {
    return estimateQuantity(item) * estimateUnitCost(item);
  }

  function EstimateUnitInput({ value, onChange }) {
    const unit = String(value || '');
    const selectValue = isPresetEstimateUnit(unit) ? unit : '自訂';

    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <select
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === '自訂' ? (isPresetEstimateUnit(unit) ? '' : unit) : next);
          }}
        >
          {estimateUnitOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>

        {selectValue === '自訂' && (
          <input
            value={unit}
            placeholder="輸入自訂單位"
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    );
  }

  function cleanEstimateUnit(unit) {
    return String(unit || '').trim();
  }

  const estimateTemplates = {
    '油漆工程': [
      ['牆面 / 天花施作坪數', 0, '坪', 1200, 0, '主項'],
      ['批土處理', 0, '坪', 300, 0, '加項'],
      ['底漆', 0, '坪', 250, 0, '加項'],
      ['面漆', 0, '坪', 450, 0, '加項'],
      ['保護工程', 1, '式', 3000, 0, '加項'],
      ['裂縫修補', 0, '處', 800, 0, '加項'],
      ['特殊色 / 跳色', 0, '式', 2000, 0, '加項'],
      ['高處施工', 0, '式', 3000, 0, '加項']
    ],
    '裝潢工程': [
      ['系統櫃 / 木作台尺', 0, '台尺', 5000, 0, '主項'],
      ['特殊五金', 0, '組', 1500, 0, '加項'],
      ['抽屜', 0, '組', 1800, 0, '加項'],
      ['緩衝鉸鏈', 0, '組', 500, 0, '加項'],
      ['拉籃', 0, '組', 3500, 0, '加項'],
      ['玻璃門片', 0, '片', 2500, 0, '加項'],
      ['燈條', 0, '式', 3000, 0, '加項'],
      ['特殊板材', 0, '式', 5000, 0, '加項'],
      ['拆舊櫃', 0, '式', 6000, 0, '加項']
    ],
    '水電工程': [
      ['開關插座點位', 0, '點', 3500, 0, '主項'],
      ['燈具點位', 0, '點', 2500, 0, '加項'],
      ['網路點位', 0, '點', 2500, 0, '加項'],
      ['配電箱', 0, '組', 12000, 0, '加項'],
      ['迴路新增', 0, '迴', 5000, 0, '加項'],
      ['打牆開槽', 0, '式', 8000, 0, '加項'],
      ['浴室暖風機', 0, '台', 4500, 0, '加項'],
      ['熱水器配管', 0, '式', 6000, 0, '加項'],
      ['面板升級', 0, '式', 3000, 0, '加項'],
      ['全戶配管一式', 0, '式', 0, 0, '加項']
    ],
    '冷氣工程': [
      ['冷氣主機 / 室內機', 1, '台', 35000, 29000, '主項'],
      ['標準安裝', 1, '式', 3500, 2000, '主項'],
      ['銅管追加', 0, '米', 700, 0, '加項'],
      ['洗洞費', 0, '孔', 1200, 0, '加項'],
      ['室外機架', 0, '組', 2500, 0, '加項'],
      ['排水管延伸', 0, '米', 300, 0, '加項'],
      ['舊機拆除', 0, '台', 1500, 0, '加項'],
      ['冷媒補充', 0, '式', 2500, 0, '加項'],
      ['高樓危險施工', 0, '式', 3000, 0, '加項'],
      ['吊車費', 0, '趟', 0, 0, '加項'],
      ['裝潢配合拉管', 0, '式', 0, 0, '加項']
    ],
    '泥作工程': [
      ['打底', 0, '坪', 2500, 0, '主項'],
      ['貼磚', 0, '坪', 6000, 0, '主項'],
      ['磁磚材料', 0, '坪', 2500, 0, '加項'],
      ['填縫', 0, '式', 3000, 0, '加項'],
      ['洩水坡度', 0, '式', 5000, 0, '加項'],
      ['防水層', 0, '坪', 2500, 0, '加項'],
      ['搬運上樓', 0, '層', 1500, 0, '加項'],
      ['舊磚拆除', 0, '坪', 1800, 0, '加項'],
      ['磁磚切割', 0, '式', 2000, 0, '加項']
    ],
    '拆除工程': [
      ['拆除工資', 0, '天', 12000, 0, '主項'],
      ['打石', 0, '天', 15000, 0, '加項'],
      ['清運車數', 0, '車', 13000, 0, '主項'],
      ['廢棄物處理', 0, '式', 5000, 0, '加項'],
      ['電梯保護', 1, '式', 5000, 0, '加項'],
      ['公設保護', 0, '式', 5000, 0, '加項'],
      ['大型家具拆除', 0, '式', 3000, 0, '加項'],
      ['搬運樓層加價', 0, '層', 1500, 0, '加項'],
      ['夜間施工', 0, '式', 5000, 0, '加項']
    ],
    '防水工程': [
      ['防水施作坪數', 0, '坪', 3000, 0, '主項'],
      ['底漆', 0, '坪', 300, 0, '加項'],
      ['防水彈泥', 0, '坪', 1200, 0, '加項'],
      ['抗裂網', 0, '坪', 500, 0, '加項'],
      ['裂縫修補', 0, '處', 1000, 0, '加項'],
      ['高壓灌注', 0, '針', 2500, 0, '加項'],
      ['局部打針', 0, '處', 2500, 0, '加項'],
      ['女兒牆處理', 0, '式', 8000, 0, '加項'],
      ['保固加價', 0, '年', 3000, 0, '加項']
    ],
    '弱電工程': [
      ['監視器點位', 0, '點', 3000, 0, '主項'],
      ['網路點位', 0, '點', 2500, 0, '主項'],
      ['攝影機', 0, '台', 3500, 0, '加項'],
      ['NVR / DVR 主機', 0, '台', 12000, 0, '加項'],
      ['硬碟', 0, '顆', 3000, 0, '加項'],
      ['PoE Switch', 0, '台', 6000, 0, '加項'],
      ['Cat6 拉線', 0, '米', 80, 0, '加項'],
      ['機櫃整理', 0, '式', 3000, 0, '加項'],
      ['遠端監控設定', 1, '式', 3000, 0, '加項'],
      ['APP 設定', 1, '式', 1500, 0, '加項']
    ],
    '鷹架工程': [
      ['搭設坪數', 0, '坪', 450, 0, '主項'],
      ['拆除費', 0, '式', 0, 0, '加項'],
      ['防塵網', 0, '式', 5000, 0, '加項'],
      ['防墜網', 0, '式', 5000, 0, '加項'],
      ['超期租金', 0, '月', 10000, 0, '加項'],
      ['騎樓保護', 0, '式', 8000, 0, '加項'],
      ['特殊高度加價', 0, '式', 10000, 0, '加項'],
      ['道路使用', 0, '式', 0, 0, '加項'],
      ['吊掛費', 0, '趟', 0, 0, '加項'],
      ['夜間拆搭', 0, '式', 8000, 0, '加項']
    ],
    '板模工程': [
      ['柱模', 0, '坪', 3000, 0, '主項'],
      ['樑模', 0, '坪', 3200, 0, '主項'],
      ['牆模', 0, '坪', 3200, 0, '主項'],
      ['樓板模', 0, '坪', 2800, 0, '主項'],
      ['清水模加價', 0, '坪', 1200, 0, '加項'],
      ['支撐鋼管', 0, '式', 8000, 0, '加項'],
      ['放樣', 0, '式', 5000, 0, '加項'],
      ['拆模', 0, '式', 8000, 0, '加項'],
      ['特殊結構加價', 0, '式', 10000, 0, '加項']
    ]
  };

  function createEstimateItemsForType(type) {
    const rows = estimateTemplates[type] || estimateTemplates['油漆工程'];

    return rows.map(([itemName, quantity, unit, unitPrice, costAmount, itemCategory], index) => ({
      uid: `${Date.now()}_${index}_${itemName}`,
      itemCategory,
      itemName,
      quantity,
      unit,
      unitPrice,
      unitCost: costAmount,
      note: '',
      sortOrder: index + 1
    }));
  }

  function getEstimateTemplateTip(type) {
    return projectTypeTips[type] || '請依案場實際項目輸入數量、單位、單價、成本與備註。';
  }

  const emptyForm = {
    siteName: '',
    clientName: '',
    clientPhone: '',
    address: '',
    projectType: '油漆工程',
    quoteAmount: 0,
    receivedAmount: 0,
    materialCost: 0,
    laborCost: 0,
    outsourcedCost: 0,
    miscCost: 0,
    foodCost: 0,
    taxMode: 'not_taxed',
    taxRate: 0.05,
    paintAreaPing: '',
    paintPricePerPing: '',
    paintWorkers: '',
    paintWorkDays: '',
    paintDailyWage: '',
    status: '已報價',
    note: ''
  };

  const [sites, setSites] = useState([]);
  const [siteSearch, setSiteSearch] = useState('');
  const [siteStatusFilter, setSiteStatusFilter] = useState('全部');
  const [siteCollectionFilter, setSiteCollectionFilter] = useState('全部');
  const [siteRiskFilter, setSiteRiskFilter] = useState('全部');
  const [siteSort, setSiteSort] = useState('最新');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingOriginalForm, setEditingOriginalForm] = useState(null);
  const [openActionSiteId, setOpenActionSiteId] = useState(null);
  const [error, setError] = useState('');
  const [manualCopy, setManualCopy] = useState(null);

  const [paymentSite, setPaymentSite] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: '現金',
    note: ''
  });

  const [estimateSite, setEstimateSite] = useState(null);
  const [estimateItemsView, setEstimateItemsView] = useState([]);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [editingEstimateItemId, setEditingEstimateItemId] = useState(null);
  const [estimateItemForm, setEstimateItemForm] = useState({
    itemCategory: '加項',
    itemName: '',
    quantity: '',
    unit: '式',
    unitPrice: '',
    unitCost: '',
    note: ''
  });

  const [form, setForm] = useState({
    ...emptyForm,
    siteName: '南屯店面整修工程',
    clientName: '陳小姐',
    clientPhone: '0912-345-678',
    address: '台中市南屯區',
    projectType: '冷氣工程',
    quoteAmount: 0,
    receivedAmount: 0,
    materialCost: 0,
    laborCost: 0,
    outsourcedCost: 0,
    miscCost: 0,
    taxMode: 'not_taxed',
    taxRate: 0.05,
    status: '已簽約'
  });

  const [estimateDraft, setEstimateDraft] = useState(() => emptyEstimateDraft());
  const [estimateItems, setEstimateItems] = useState([]);

  async function jobSiteRequest(path, options = {}) {
    return api(path, options);
  }

  async function loadSites() {
    if (!companyId) {
      setSites([]);
      setLoading(false);
      setError('找不到公司 ID，請重新登入或重新整理頁面。');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const rows = await jobSiteRequest(`/companies/${companyId}/jobsites`);
      setSites(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error(err);
      setError(err.message || '讀取案場失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSites();
  }, [companyId]);

  function update(key, value) {
    if (key === 'projectType') {
      setForm((old) => ({
        ...old,
        projectType: value,
        quoteAmount: 0,
        materialCost: 0,
        laborCost: 0,
        outsourcedCost: 0,
        miscCost: 0,
        foodCost: 0
      }));
      return;
    }

    setForm((old) => ({
      ...old,
      [key]: value
    }));
  }

  function updatePaymentForm(key, value) {
    setPaymentForm((old) => ({
      ...old,
      [key]: value
    }));
  }

  function numberValue(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function hydrateJobSiteForm(site = {}) {
    return {
      siteName: site.siteName || site.name || '',
      clientName: site.clientName || site.client_name || '',
      clientPhone: site.clientPhone || site.client_phone || '',
      address: site.address || '',
      projectType: site.projectType || site.project_type || '油漆工程',
      quoteAmount: numberValue(site.quoteAmount ?? site.quote_amount),
      taxMode: site.taxMode || site.tax_mode || 'not_taxed',
      taxRate: numberValue(site.taxRate ?? site.tax_rate ?? 0.05),
      subtotalAmount: numberValue(site.subtotalAmount ?? site.subtotal_amount ?? site.quoteAmount ?? site.quote_amount),
      taxAmount: numberValue(site.taxAmount ?? site.tax_amount),
      totalAmount: numberValue(site.totalAmount ?? site.total_amount ?? site.quoteAmount ?? site.quote_amount),
      receivedAmount: numberValue(site.receivedAmount ?? site.received_amount),
      materialCost: numberValue(site.materialCost ?? site.material_cost),
      laborCost: numberValue(site.laborCost ?? site.labor_cost),
      outsourcedCost: numberValue(site.outsourcedCost ?? site.outsourced_cost),
      miscCost: numberValue(site.miscCost ?? site.misc_cost),
      foodCost: numberValue(site.foodCost ?? site.food_cost),
      status: site.status || '已報價',
      note: site.note || '',
      paintWorkers: '',
      paintWorkDays: '',
      paintDailyWage: ''
    };
  }

  function buildJobSiteUpdatePayload(data, original) {
    if (!original) return null;

    const payload = {};
    const textFields = ['siteName', 'clientName', 'clientPhone', 'address', 'projectType', 'taxMode', 'status', 'note'];
    const numberFields = ['taxRate', 'receivedAmount', 'materialCost', 'outsourcedCost', 'miscCost', 'foodCost'];

    for (const field of textFields) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
      const value = String(data[field] ?? '').trim();
      const oldValue = String(original[field] ?? '').trim();
      if (field === 'siteName' && !value) {
        return { error: '請輸入案場名稱' };
      }
      if (value !== oldValue) payload[field] = value;
    }

    for (const field of numberFields) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
      const rawValue = data[field];
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      const value = Number(rawValue);
      const oldValue = Number(original[field] || 0);
      if (!Number.isFinite(value)) continue;
      if (value !== oldValue) payload[field] = value;
    }

    return payload;
  }

  function updateEstimateItem(uid, key, value) {
    setEstimateItems((old) =>
      old.map((item) => (item.uid === uid ? { ...item, [key]: value } : item))
    );
  }

  function updateEstimateDraft(key, value) {
    setEstimateDraft((old) => ({
      ...old,
      [key]: value
    }));
  }

  function addEstimateItem() {
    if (!String(estimateDraft.itemName || '').trim()) {
      setError('請先輸入估價項目名稱，再加入明細列表。');
      return;
    }
    const unit = cleanEstimateUnit(estimateDraft.unit);
    if (!unit) {
      setError('請輸入自訂單位');
      return;
    }

    setEstimateItems((old) => [
      ...old,
      {
        uid: `${Date.now()}_custom_${old.length + 1}`,
        itemCategory: estimateDraft.itemCategory || '加項',
        itemName: estimateDraft.itemName || '',
        quantity: estimateDraft.quantity,
        unit,
        unitPrice: estimateDraft.unitPrice,
        unitCost: estimateDraft.unitCost,
        note: estimateDraft.note || '',
        sortOrder: old.length + 1
      }
    ]);
    setEstimateDraft(emptyEstimateDraft());
    setError('');
  }

  function removeEstimateItem(uid) {
    setEstimateItems((old) => old.filter((item) => item.uid !== uid));
  }

  function resetEstimateTemplate(type = form.projectType) {
    setEstimateItems(createEstimateItemsForType(type));
    setEstimateDraft(emptyEstimateDraft());
  }

  function getEstimateSummary() {
    const estimateTotal = estimateItems.reduce(
      (sum, item) => sum + estimateQuoteSubtotal(item),
      0
    );

    const estimateCostTotal = estimateItems.reduce(
      (sum, item) => sum + estimateCostSubtotal(item),
      0
    );

    const taxMode = form.taxMode || 'not_taxed';
    const taxRate = numberValue(form.taxRate || 0.05);

    let subtotalAmount = estimateTotal;
    let taxAmount = 0;
    let totalAmount = estimateTotal;

    if (taxMode === 'tax_excluded') {
      subtotalAmount = estimateTotal;
      taxAmount = Math.round(subtotalAmount * taxRate);
      totalAmount = subtotalAmount + taxAmount;
    } else if (taxMode === 'tax_included') {
      totalAmount = estimateTotal;
      subtotalAmount = taxRate > 0 ? Math.round(totalAmount / (1 + taxRate)) : totalAmount;
      taxAmount = totalAmount - subtotalAmount;
    }

    const workers = numberValue(form.paintWorkers);
    const workDays = numberValue(form.paintWorkDays);
    const dailyWage = numberValue(form.paintDailyWage);
    const laborCost = workers * workDays * dailyWage;

    const coreCost =
      estimateCostTotal +
      numberValue(form.materialCost) +
      laborCost +
      numberValue(form.outsourcedCost) +
      numberValue(form.miscCost);

    const foodCost = numberValue(form.foodCost);
    const profit = subtotalAmount - coreCost;
    const marginRate = subtotalAmount ? Math.round((profit / subtotalAmount) * 1000) / 10 : 0;

    return {
      estimateTotal,
      estimateCostTotal,
      subtotalAmount,
      taxAmount,
      totalAmount,
      coreCost,
      foodCost,
      profit,
      marginRate,
      laborCost
    };
  }

  async function saveEstimateItemsForSite(jobsiteId) {
    const usableItems = estimateItems
      .map((item, index) => ({
        ...item,
        unit: cleanEstimateUnit(item.unit),
        sortOrder: index + 1,
        quantity: estimateQuantity(item),
        unitPrice: estimateUnitPrice(item),
        unitCost: estimateUnitCost(item),
        costAmount: estimateCostSubtotal(item),
        amount: estimateQuoteSubtotal(item)
      }))
      .filter((item) =>
        String(item.itemName || '').trim() &&
        (
          item.quantity > 0 ||
          item.unitPrice > 0 ||
          item.unitCost > 0 ||
          item.costAmount > 0 ||
          item.amount > 0
        )
      );

    if (usableItems.some((item) => !cleanEstimateUnit(item.unit))) {
      setError('請輸入自訂單位');
      throw new Error('請輸入自訂單位');
    }

    for (const item of usableItems) {
      await jobSiteRequest(`/companies/${companyId}/jobsites/${jobsiteId}/estimate-items`, {
        method: 'POST',
        body: JSON.stringify({
          workType: form.projectType,
          itemCategory: item.itemCategory || '加項',
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit || '',
          unitPrice: item.unitPrice,
          amount: item.amount,
          costAmount: item.costAmount,
          note: item.note || '',
          sortOrder: item.sortOrder
        })
      });
    }
  }

  function compactText(value, limit = 8) {
    const text = String(value || '');
    if (!text) return '-';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  function csvSafe(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(filename, headers, rows) {
    const csv = [
      headers.map(csvSafe).join(','),
      ...rows.map((row) => row.map(csvSafe).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function applyEstimateToForm() {
    if (form.projectType === '油漆工程') {
      const areaPing = numberValue(form.paintAreaPing);
      const pricePerPing = numberValue(form.paintPricePerPing);
      const materialCostPerPing = numberValue(form.paintMaterialCostPerPing);
      const workers = numberValue(form.paintWorkers);
      const workDays = numberValue(form.paintWorkDays);
      const dailyWage = numberValue(form.paintDailyWage);
      const extraFee = numberValue(form.paintExtraFee);

      const quoteAmount = areaPing * pricePerPing + extraFee;
      const materialCost = areaPing * materialCostPerPing;
      const laborCost = workers * workDays * dailyWage;

      setForm((old) => ({
        ...old,
        quoteAmount,
        materialCost,
        laborCost
      }));

      return;
    }

    if (form.projectType === '裝潢工程') {
      const quoteAmount =
        numberValue(form.renoDemolitionFee) +
        numberValue(form.renoElectricFee) +
        numberValue(form.renoMasonryFee) +
        numberValue(form.renoCarpentryFee) +
        numberValue(form.renoPaintingFee) +
        numberValue(form.renoCabinetFee) +
        numberValue(form.renoLightingFee) +
        numberValue(form.renoCleanupFee) +
        numberValue(form.renoDesignFee) +
        numberValue(form.renoSupervisionFee) +
        numberValue(form.renoOtherFee);

      setForm((old) => ({
        ...old,
        quoteAmount
      }));

      return;
    }

    setError('此工程類型目前先使用手動輸入報價與成本，專用估價欄位會在下一階段加入。');
  }

  async function confirmPaintEstimateAndCreateSite() {
    if (!companyId) {
      setError('找不到公司 ID，請重新登入或重新整理頁面。');
      return;
    }

    if (!form.siteName || !form.clientName) {
      setError('請先填寫案場名稱與客戶名稱，再確認接案。');
      return;
    }

    const areaPing = numberValue(form.paintAreaPing);
    const pricePerPing = numberValue(form.paintPricePerPing);

    if (!areaPing || !pricePerPing) {
      setError('請先填寫作業坪數與每坪價格，系統才能計算報價金額。');
      return;
    }

    const workers = numberValue(form.paintWorkers);
    const workDays = numberValue(form.paintWorkDays);
    const dailyWage = numberValue(form.paintDailyWage);

    const quoteAmount = areaPing * pricePerPing;
    const laborCost = workers * workDays * dailyWage;
    const foodCost = numberValue(form.foodCost);
    const miscCost = numberValue(form.miscCost);

    const payload = normalizePayload({
      ...form,
      quoteAmount,
      areaPings: areaPing,
      pricePerPing,
      foodCost,
      materialCost: numberValue(form.materialCost),
      laborCost,
      outsourcedCost: numberValue(form.outsourcedCost),
      miscCost,
      status: form.status || '已報價',
      note: form.note || '由坪數接案估價表確認接案'
    });

    try {
      setSaving(true);
      setError('');

      if (editingId) {
        const editPayload = normalizeJobSiteEditPayload(form);
        if (!editPayload || editPayload.error || !Object.keys(editPayload).length) {
          setError(editPayload?.error || '沒有偵測到案場資料變更。');
          return;
        }
        await jobSiteRequest(`/companies/${companyId}/jobsites/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(editPayload)
        });
      } else {
        await jobSiteRequest(`/companies/${companyId}/jobsites`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      await loadSites();

      setEditingId(null);
      setForm({
        ...emptyForm,
        projectType: '油漆工程',
        status: '已報價'
      });
    } catch (err) {
      console.error(err);
      setError(err.message || '確認接案失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  function normalizePayload(data) {
    return {
      ...data,
      siteName: data.siteName || '',
      clientName: data.clientName || '',
      clientPhone: data.clientPhone || '',
      address: data.address || '',
      projectType: data.projectType || '',
      quoteAmount: numberValue(data.quoteAmount ?? data.quote_amount),
      taxMode: data.taxMode ?? data.tax_mode ?? 'not_taxed',
      taxRate: numberValue(data.taxRate ?? data.tax_rate ?? 0.05),
      subtotalAmount: numberValue(data.subtotalAmount ?? data.subtotal_amount),
      taxAmount: numberValue(data.taxAmount ?? data.tax_amount),
      totalAmount: numberValue(data.totalAmount ?? data.total_amount ?? data.quoteAmount ?? data.quote_amount),
      estimateCostTotal: numberValue(data.estimateCostTotal ?? data.estimate_cost_total),
      receivedAmount: numberValue(data.receivedAmount ?? data.received_amount),
      materialCost: numberValue(data.materialCost ?? data.material_cost),
      laborCost: numberValue(data.laborCost ?? data.labor_cost),
      outsourcedCost: numberValue(data.outsourcedCost ?? data.outsourced_cost),
      miscCost: numberValue(data.miscCost ?? data.misc_cost),
      status: data.status || '已報價',
      note: data.note || ''
    };
  }

  function normalizeJobSiteEditPayload(data) {
    return buildJobSiteUpdatePayload(data, editingOriginalForm);
  }

  function calc(site) {
    const quoteAmount = numberValue(site.quoteAmount);
    const receivedAmount = numberValue(site.receivedAmount);
    const estimateCostTotal = numberValue(site.estimateCostTotal ?? site.estimate_cost_total ?? 0);
    const foodCost = numberValue(site.foodCost);

    const totalCost =
      estimateCostTotal +
      numberValue(site.materialCost) +
      numberValue(site.laborCost) +
      numberValue(site.outsourcedCost) +
      numberValue(site.miscCost);

    const unpaid = Math.max(quoteAmount - receivedAmount, 0);
    const profit = quoteAmount - totalCost;
    const marginRate = quoteAmount ? Math.round((profit / quoteAmount) * 1000) / 10 : 0;
    const collectionRate = quoteAmount ? Math.round((receivedAmount / quoteAmount) * 1000) / 10 : 0;

    let collectionStatus = '未收款';
    let collectionHint = '尚未收到任何款項';
    let collectionLevel = 'danger';

    if (quoteAmount <= 0) {
      collectionStatus = '尚未報價';
      collectionHint = '請先輸入報價金額，系統才能判斷收款進度';
      collectionLevel = 'muted';
    } else if (receivedAmount > quoteAmount) {
      collectionStatus = '溢收提醒';
      collectionHint = `已超收 ${money(receivedAmount - quoteAmount)}，請確認收款紀錄是否輸入正確`;
      collectionLevel = 'warning';
    } else if (receivedAmount === quoteAmount) {
      collectionStatus = '已收齊';
      collectionHint = '此案場已全額收款';
      collectionLevel = 'success';
    } else if (receivedAmount > 0) {
      collectionStatus = '部分收款';
      collectionHint = `尚有 ${money(unpaid)} 未收，收款率 ${collectionRate}%`;
      collectionLevel = 'warning';
    }

    if (
      quoteAmount > 0 &&
      receivedAmount < quoteAmount &&
      site.status === '已請款'
    ) {
      collectionStatus = '已請款待收';
      collectionHint = `已請款但尚有 ${money(unpaid)} 未收`;
      collectionLevel = 'warning';
    }

    if (
      quoteAmount > 0 &&
      receivedAmount < quoteAmount &&
      unpaid > quoteAmount * 0.5
    ) {
      collectionStatus = '收款風險高';
      collectionHint = `未收金額超過報價 50%，目前尚有 ${money(unpaid)} 未收`;
      collectionLevel = 'danger';
    }

    return {
      quoteAmount,
      receivedAmount,
      estimateCostTotal,
      foodCost,
      totalCost,
      unpaid,
      profit,
      marginRate,
      collectionRate,
      collectionStatus,
      collectionHint,
      collectionLevel
    };
  }

  async function submitSite(e) {
    e.preventDefault();

    if (!form.siteName.trim()) {
      setError('請輸入案場名稱');
      return;
    }

    if (!companyId) {
      setError('找不到公司 ID，無法儲存案場。');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingId) {
        const payload = normalizeJobSiteEditPayload(form);
        if (!payload) {
          setError('案場資料尚未載入完成，請重新整理後再試。');
          return;
        }
        if (payload.error) {
          setError(payload.error);
          return;
        }
        if (!Object.keys(payload).length) {
          setError('沒有偵測到案場資料變更。');
          return;
        }
        const updated = await jobSiteRequest(`/companies/${companyId}/jobsites/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });

        setSites((old) => old.map((site) => (site.id === editingId ? updated : site)));

        if (paymentSite?.id === editingId) {
          setPaymentSite(updated);
        }

        setEditingId(null);
        setEditingOriginalForm(null);
      } else {
        const summary = getEstimateSummary();
        const payload = normalizePayload({
          ...form,
          quoteAmount: summary.totalAmount,
          subtotalAmount: summary.subtotalAmount,
          taxAmount: summary.taxAmount,
          totalAmount: summary.totalAmount,
          laborCost: summary.laborCost,
          status: form.status || '已報價'
        });
        const created = await jobSiteRequest(`/companies/${companyId}/jobsites`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (created?.id) {
          await saveEstimateItemsForSite(created.id);
        }

        await loadSites();
      }

      setForm({
        ...emptyForm,
        projectType: '油漆工程',
        quoteAmount: 0,
        receivedAmount: 0,
        materialCost: 0,
        laborCost: 0,
        outsourcedCost: 0,
        miscCost: 0,
        foodCost: 0,
        taxMode: 'not_taxed',
        taxRate: 0.05,
        status: '已報價'
      });
      setEstimateItems([]);
      setEstimateDraft(emptyEstimateDraft());
    } catch (err) {
      console.error(err);
      setError(err.message || '儲存案場失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }


  function startEdit(site) {
    setEditingId(site.id);
    setError('');

    const hydrated = hydrateJobSiteForm(site);
    setForm(hydrated);
    setEditingOriginalForm(hydrated);
    setEstimateItems([]);
    setEstimateDraft(emptyEstimateDraft());

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingOriginalForm(null);
    setError('');
    setForm(emptyForm);
    setEstimateItems([]);
    setEstimateDraft(emptyEstimateDraft());
  }

  async function removeSite(siteId) {
    const ok = window.confirm('確定要刪除此案場嗎？\n\n此動作會刪除該案場、估價明細與收款紀錄；庫存異動歷史會保留，但會解除案場關聯。');

    if (!ok) return;

    try {
      setError('');

      await jobSiteRequest(`/companies/${companyId}/jobsites/${siteId}`, {
        method: 'DELETE'
      });

      setSites((old) => old.filter((site) => site.id !== siteId));

      if (editingId === siteId) {
        cancelEdit();
      }

      if (paymentSite?.id === siteId) {
        setPaymentSite(null);
        setPayments([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '刪除案場失敗，請確認此案場是否仍有關聯資料。');
    }
  }

  async function openEstimateItems(site) {
    if (!companyId || !site?.id) {
      setError('找不到公司 ID 或案場 ID，無法讀取估價明細。');
      return;
    }

    try {
      setEstimateSite(site);
      setEstimateLoading(true);
      setEstimateError('');
      setEstimateItemsView([]);

      const result = await jobSiteRequest(`/companies/${companyId}/jobsites/${site.id}/estimate-items`);
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];

      setEstimateItemsView(items);

      setTimeout(() => {
        document.getElementById('jobsite-estimate-items-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 50);
    } catch (err) {
      console.error(err);
      setEstimateError(err.message || '讀取估價明細失敗');
    } finally {
      setEstimateLoading(false);
    }
  }

  function closeEstimateItems() {
    setEstimateSite(null);
    setEstimateItemsView([]);
    setEstimateError('');
    setEditingEstimateItemId(null);
    resetEstimateItemForm();
  }

  function updateEstimateItemForm(key, value) {
    setEstimateItemForm((old) => ({
      ...old,
      [key]: value
    }));
  }

  function resetEstimateItemForm() {
    setEditingEstimateItemId(null);
    setEstimateItemForm({
      itemCategory: '加項',
      itemName: '',
      quantity: '',
      unit: '式',
      unitPrice: '',
      unitCost: '',
      note: ''
    });
  }

  function startEditEstimateItem(item) {
    setEditingEstimateItemId(item.id);
    setEstimateItemForm({
      itemCategory: item.itemCategory || '加項',
      itemName: item.itemName || '',
      quantity: item.quantity ?? '',
      unit: item.unit || '式',
      unitPrice: item.unitPrice ?? '',
      unitCost: estimateUnitCost(item) || '',
      note: item.note || ''
    });

    setTimeout(() => {
      document.getElementById('estimate-item-editor')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 50);
  }

  async function submitEstimateItem(e) {
    e.preventDefault();

    if (!estimateSite?.id) {
      setEstimateError('找不到案場 ID，無法儲存估價明細。');
      return;
    }

    if (!String(estimateItemForm.itemName || '').trim()) {
      setEstimateError('請輸入估價項目名稱。');
      return;
    }
    const unit = cleanEstimateUnit(estimateItemForm.unit);
    if (!unit) {
      setEstimateError('請輸入自訂單位');
      return;
    }

    try {
      setEstimateLoading(true);
      setEstimateError('');

      const payload = {
        workType: estimateSite.projectType || estimateSite.project_type || '',
        itemCategory: estimateItemForm.itemCategory || '加項',
        itemName: estimateItemForm.itemName || '',
        quantity: numberValue(estimateItemForm.quantity),
        unit,
        unitPrice: numberValue(estimateItemForm.unitPrice),
        costAmount: numberValue(estimateItemForm.quantity) * numberValue(estimateItemForm.unitCost),
        note: estimateItemForm.note || '',
        sortOrder: editingEstimateItemId
          ? estimateItemsView.findIndex((item) => item.id === editingEstimateItemId) + 1
          : estimateItemsView.length + 1
      };

      const path = editingEstimateItemId
        ? `/companies/${companyId}/jobsites/${estimateSite.id}/estimate-items/${editingEstimateItemId}`
        : `/companies/${companyId}/jobsites/${estimateSite.id}/estimate-items`;

      await jobSiteRequest(path, {
        method: editingEstimateItemId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      resetEstimateItemForm();

      await openEstimateItems(estimateSite);
      await loadSites();
      setError('');
    } catch (err) {
      console.error(err);
      setEstimateError(err.message || '儲存估價明細失敗');
    } finally {
      setEstimateLoading(false);
    }
  }

  async function deleteEstimateItem(itemId) {
    if (!estimateSite?.id) {
      const msg = '找不到目前案場，無法刪除估價明細。';
      setEstimateError(msg);
      window.alert(msg);
      return;
    }

    if (!itemId) {
      const msg = '找不到估價項目 ID，無法刪除。';
      setEstimateError(msg);
      window.alert(msg);
      return;
    }

    const ok = window.confirm('確定要刪除此估價項目嗎？刪除後案場報價金額會重新計算。');

    if (!ok) return;

    try {
      setEstimateLoading(true);
      setEstimateError('');

      await jobSiteRequest(`/companies/${companyId}/jobsites/${estimateSite.id}/estimate-items/${itemId}`, {
        method: 'DELETE'
      });

      if (editingEstimateItemId === itemId) {
        resetEstimateItemForm();
      }

      const currentSite = estimateSite;

      await openEstimateItems(currentSite);
      await loadSites();

      window.alert('估價項目已刪除，案場金額已重新計算。');
    } catch (err) {
      console.error('[BookAI] delete estimate item failed', err);
      const msg = err.message || '刪除估價明細失敗';
      setEstimateError(msg);
      window.alert(msg);
    } finally {
      setEstimateLoading(false);
    }
  }


  async function openPayments(site) {
    try {
      setPaymentSite(site);
      setPaymentLoading(true);
      setError('');

      const rows = await jobSiteRequest(`/companies/${companyId}/jobsites/${site.id}/payments`);
      setPayments(Array.isArray(rows) ? rows : []);

      setEditingPaymentId(null);
      setPaymentForm({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        method: '現金',
        note: ''
      });

      setTimeout(() => {
        const el = document.getElementById('jobsite-payments-panel');
        if (el) {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 100);
    } catch (err) {
      console.error(err);
      setError(err.message || '讀取收款紀錄失敗');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function submitPayment(e) {
    e.preventDefault();

    if (!paymentSite) {
      setError('請先選擇案場');
      return;
    }

    if (numberValue(paymentForm.amount) <= 0) {
      setError('請輸入大於 0 的收款金額');
      return;
    }

    try {
      setPaymentSaving(true);
      setError('');

      const url = editingPaymentId
        ? `/companies/${companyId}/jobsites/${paymentSite.id}/payments/${editingPaymentId}`
        : `/companies/${companyId}/jobsites/${paymentSite.id}/payments`;

      const result = await jobSiteRequest(url, {
        method: editingPaymentId ? 'PUT' : 'POST',
        body: JSON.stringify({
          amount: numberValue(paymentForm.amount),
          paymentDate: paymentForm.paymentDate,
          method: paymentForm.method,
          note: paymentForm.note
        })
      });

      if (editingPaymentId) {
        setPayments((old) =>
          old.map((payment) =>
            payment.id === editingPaymentId ? result.payment : payment
          )
        );
      } else {
        setPayments((old) => [result.payment, ...old]);
      }

      await loadSites();

      setPaymentSite((old) =>
        old
          ? { ...old, receivedAmount: result.receivedAmount }
          : old
      );

      setEditingPaymentId(null);
      setPaymentForm({
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        method: '現金',
        note: ''
      });
    } catch (err) {
      console.error(err);
      setError(err.message || '新增收款失敗');
    } finally {
      setPaymentSaving(false);
    }
  }

  function editPayment(payment) {
    setEditingPaymentId(payment.id);
    setPaymentForm({
      amount: String(payment.amount || ''),
      paymentDate: payment.paymentDate || new Date().toISOString().slice(0, 10),
      method: payment.method || '現金',
      note: payment.note || ''
    });

    setTimeout(() => {
      const el = document.getElementById('jobsite-payments-panel');
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
  }

  function cancelEditPayment() {
    setEditingPaymentId(null);
    setPaymentForm({
      amount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      method: '現金',
      note: ''
    });
  }

  async function removePayment(paymentId) {
    if (!paymentSite) return;

    const ok = window.confirm('確定要刪除此收款紀錄嗎？');

    if (!ok) return;

    try {
      setError('');

      const result = await jobSiteRequest(`/companies/${companyId}/jobsites/${paymentSite.id}/payments/${paymentId}`, {
        method: 'DELETE'
      });

      setPayments((old) => old.filter((payment) => payment.id !== paymentId));

      if (editingPaymentId === paymentId) {
        cancelEditPayment();
      }

      await loadSites();

      setPaymentSite((old) =>
        old
          ? { ...old, receivedAmount: result.receivedAmount }
          : old
      );
    } catch (err) {
      console.error(err);
      setError(err.message || '刪除收款失敗');
    }
  }

  const totals = sites.reduce(
    (acc, site) => {
      const c = calc(site);
      acc.quoteAmount += c.quoteAmount;
      acc.receivedAmount += c.receivedAmount;
      acc.totalCost += c.totalCost;
      acc.unpaid += c.unpaid;
      acc.profit += c.profit;
      return acc;
    },
    {
      quoteAmount: 0,
      receivedAmount: 0,
      totalCost: 0,
      unpaid: 0,
      profit: 0
    }
  );

  const avgMargin = totals.quoteAmount
    ? Math.round((totals.profit / totals.quoteAmount) * 1000) / 10
    : 0;

  const filteredSites = sites
    .filter((site) => {
      const c = calc(site);
      const keyword = siteSearch.trim().toLowerCase();

      const textMatched = !keyword ||
        String(site.siteName || site.name || '').toLowerCase().includes(keyword) ||
        String(site.clientName || '').toLowerCase().includes(keyword) ||
        String(site.clientPhone || '').toLowerCase().includes(keyword) ||
        String(site.projectType || '').toLowerCase().includes(keyword) ||
        String(site.address || '').toLowerCase().includes(keyword);

      const statusMatched =
        siteStatusFilter === '全部' || String(site.status || '') === siteStatusFilter;

      const collectionMatched =
        siteCollectionFilter === '全部' || c.collectionStatus === siteCollectionFilter;

      const riskMatched =
        siteRiskFilter === '全部' ||
        (siteRiskFilter === '毛利偏低' && c.marginRate < 20) ||
        (siteRiskFilter === '收款風險高' && c.unpaid > c.quoteAmount * 0.5 && c.quoteAmount > 0) ||
        (siteRiskFilter === '有未收款' && c.unpaid > 0);

      return textMatched && statusMatched && collectionMatched && riskMatched;
    })
    .sort((a, b) => {
      const ca = calc(a);
      const cb = calc(b);

      if (siteSort === '報價金額高到低') return cb.quoteAmount - ca.quoteAmount;
      if (siteSort === '未收款高到低') return cb.unpaid - ca.unpaid;
      if (siteSort === '毛利率低到高') return ca.marginRate - cb.marginRate;
      if (siteSort === '毛利率高到低') return cb.marginRate - ca.marginRate;

      return Number(b.id || 0) - Number(a.id || 0);
    });

  const riskCount = filteredSites.filter((site) => {
    const c = calc(site);
    return c.marginRate < 20 || c.unpaid > c.quoteAmount * 0.5;
  }).length;

  const riskSummary = filteredSites.reduce(
    (acc, site) => {
      const c = calc(site);

      if (c.marginRate < 20 || c.unpaid > c.quoteAmount * 0.5) {
        acc.highRiskCount += 1;
      }

      acc.totalUnpaid += c.unpaid;

      if (c.receivedAmount > 0 && c.unpaid > 0) {
        acc.partialPaidCount += 1;
      }

      if (c.quoteAmount > 0 && c.marginRate < 20) {
        acc.lowMarginCount += 1;
      }

      return acc;
    },
    {
      highRiskCount: 0,
      totalUnpaid: 0,
      partialPaidCount: 0,
      lowMarginCount: 0
    }
  );

  function exportJobSitesCsv() {
    const headers = [
      '案場名稱',
      '客戶名稱',
      '客戶電話',
      '案場地址',
      '工程類型',
      '施工狀態',
      '作業坪數',
      '每坪價格',
      '報價金額',
      '已收款',
      '未收款',
      '收款率',
      '收款狀態',
      '材料費',
      '工資',
      '外包費',
      '交通 / 雜支',
      '伙食費',
      '核心成本',
      '毛利',
      '毛利率',
      '備註',
      '建立時間'
    ];

    const rows = filteredSites.map((site) => {
      const c = calc(site);

      const areaPing =
        site.paintAreaPing ??
        site.areaPing ??
        site.area_pings ??
        site.areaPings ??
        '';

      const pricePerPing =
        site.paintPricePerPing ??
        site.pricePerPing ??
        site.price_per_ping ??
        '';

      const foodCost =
        site.foodCost ??
        site.food_cost ??
        0;

      return [
        site.siteName || site.site_name || site.name || '',
        site.clientName || site.client_name || '',
        site.clientPhone || site.client_phone || '',
        site.address || '',
        site.projectType || site.project_type || '',
        site.status || '',
        areaPing,
        pricePerPing,
        c.quoteAmount,
        c.receivedAmount,
        c.unpaid,
        `${c.collectionRate}%`,
        c.collectionStatus,
        numberValue(site.materialCost ?? site.material_cost),
        numberValue(site.laborCost ?? site.labor_cost),
        numberValue(site.outsourcedCost ?? site.outsourced_cost),
        numberValue(site.miscCost ?? site.misc_cost),
        numberValue(foodCost),
        c.totalCost,
        c.profit,
        `${c.marginRate}%`,
        site.note || '',
        site.createdAt || site.created_at || ''
      ];
    });

    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`BookAI_案場總覽_${today}.csv`, headers, rows);
  }

  async function copyJobSiteText(site, type = 'quote') {
    const c = calc(site);
    let copyCalc = c;

    try {
      if (companyId && site?.id) {
        const result = await jobSiteRequest(`/companies/${companyId}/jobsites/${site.id}/estimate-items`);

        const freshItems = Array.isArray(result)
          ? result
          : Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result?.data)
              ? result.data
              : [];

        if (freshItems.length > 0) {
          const itemQuantity = (item) => {
            const q = numberValue(
              item.quantity ??
              item.qty ??
              item.count ??
              1
            );
            return q > 0 ? q : 1;
          };

          const itemUnitPrice = (item) => numberValue(
            item.unit_price ??
            item.unitPrice ??
            item.price ??
            item.sell_price ??
            item.sellPrice ??
            item.amount ??
            0
          );

          const itemInternalUnitCost = (item) => numberValue(
            item.internal_unit_cost ??
            item.internalUnitCost ??
            item.internal_cost ??
            item.internalCost ??
            item.cost ??
            item.unit_cost ??
            item.unitCost ??
            0
          );

          const freshSubtotalAmount = freshItems.reduce((sum, item) => {
            return sum + itemQuantity(item) * itemUnitPrice(item);
          }, 0);

          const freshEstimateCostTotal = freshItems.reduce((sum, item) => {
            const rowCostAmount = numberValue(
              item.cost_amount ??
              item.costAmount ??
              item.total_cost ??
              item.totalCost
            );

            if (rowCostAmount > 0) {
              return sum + rowCostAmount;
            }

            return sum + itemQuantity(item) * itemInternalUnitCost(item);
          }, 0);

          const extraMaterialCost = numberValue(site.materialCost || site.material_cost);
          const extraLaborCost = numberValue(site.laborCost || site.labor_cost);
          const extraOutsourcedCost = numberValue(site.outsourcedCost || site.outsourced_cost);
          const extraMiscCost = numberValue(site.miscCost || site.misc_cost);

          const freshCoreCost =
            freshEstimateCostTotal +
            extraMaterialCost +
            extraLaborCost +
            extraOutsourcedCost +
            extraMiscCost;

          const freshTotalAmount = numberValue(
            copyCalc.totalAmount ??
            copyCalc.quoteAmount ??
            site.quoteAmount ??
            site.quote_amount ??
            freshSubtotalAmount
          );

          const freshProfit = freshTotalAmount - freshCoreCost;
          const freshMarginRate =
            freshTotalAmount > 0
              ? Number(((freshProfit / freshTotalAmount) * 100).toFixed(1))
              : 0;

          copyCalc = {
            ...copyCalc,
            subtotalAmount: freshSubtotalAmount || copyCalc.subtotalAmount,
            estimateSubtotalAmount: freshSubtotalAmount || copyCalc.estimateSubtotalAmount,
            estimateCostTotal: freshEstimateCostTotal,
            totalCost: freshCoreCost,
            profit: freshProfit,
            marginRate: freshMarginRate,
          };
        }
      }
    } catch (err) {
      console.warn('複製文字讀取估價明細失敗，改用原本案場計算資料', err);
    }


    const siteName = safeCopyValue(site.siteName || site.name);
    const clientName = safeCopyValue(site.clientName || site.client_name);
    const clientPhone = safeCopyValue(site.clientPhone || site.client_phone);
    const address = safeCopyValue(site.address);
    const projectType = safeCopyValue(site.projectType || site.project_type);
    const status = safeCopyValue(site.status);
    const note = safeCopyValue(site.note);

    const quoteAmount = numberValue(copyCalc.quoteAmount || site.quoteAmount);
    const subtotalAmount = numberValue(site.subtotalAmount || site.subtotal_amount || quoteAmount);
    const taxAmount = numberValue(site.taxAmount || site.tax_amount || 0);
    const totalAmount = numberValue(site.totalAmount || site.total_amount || quoteAmount);

    const estimateCostTotal = numberValue(copyCalc.estimateCostTotal || site.estimateCostTotal);
    const materialCost = numberValue(site.materialCost || site.material_cost);
    const laborCost = numberValue(site.laborCost || site.labor_cost);
    const outsourcedCost = numberValue(site.outsourcedCost || site.outsourced_cost);
    const miscCost = numberValue(site.miscCost || site.misc_cost);
    const foodCost = numberValue(site.foodCost || site.food_cost);

    const coreCost = numberValue(copyCalc.totalCost);
    const profit = numberValue(copyCalc.profit);
    const marginRate = numberValue(copyCalc.marginRate);

    const receivedAmount = numberValue(copyCalc.receivedAmount || site.receivedAmount || site.received_amount);
    const unpaid = numberValue(copyCalc.unpaid);
    const collectionRate = numberValue(copyCalc.collectionRate);

    let collectionStatus = safeCopyValue(copyCalc.collectionStatus, '未收款');

    // 新增案場剛建立時，未收款 100% 很正常，不要直接嚇成「風險高」
    if (receivedAmount === 0 && quoteAmount > 0 && ['已報價', '已簽約', '施工中'].includes(status)) {
      collectionStatus = '尚未收款';
    }

    const quoteText = `【BookAI 工程報價摘要】

案場名稱：${siteName}
業主 / 客戶：${clientName}
客戶電話：${clientPhone}
案場地址：${address}
工程類型：${projectType}
施工狀態：${status}

【報價資訊】
估價明細報價：${money(subtotalAmount)}
營業稅：${money(taxAmount)}
客戶應付總額：${money(totalAmount)}

【成本摘要】
估價明細成本合計：${money(estimateCostTotal)}
額外材料費：${money(materialCost)}
工資：${money(laborCost)}
外包費：${money(outsourcedCost)}
交通 / 雜支：${money(miscCost)}
伙食費：${money(foodCost)}（內部參考，不計入核心毛利）
核心成本：${money(coreCost)}

【預估毛利】
預估毛利：${money(profit)}
毛利率：${marginRate}%

備註：${note}`;

    const paymentText = `【BookAI 工程請款摘要】

案場名稱：${siteName}
業主 / 客戶：${clientName}
客戶電話：${clientPhone}
工程類型：${projectType}
施工狀態：${status}

【收款資訊】
報價 / 合約金額：${money(totalAmount)}
已收款：${money(receivedAmount)}
未收款：${money(unpaid)}
收款率：${collectionRate}%
收款狀態：${collectionStatus}

【請款提醒】
本案目前尚有未收款：${money(unpaid)}
若已完成階段性施工或驗收，建議安排請款與收款確認。

備註：${note}`;

    const doneText = `【BookAI 工程結案摘要】

案場名稱：${siteName}
業主 / 客戶：${clientName}
工程類型：${projectType}
施工狀態：${status}

【金額摘要】
報價金額：${money(totalAmount)}
已收款：${money(receivedAmount)}
未收款：${money(unpaid)}
收款率：${collectionRate}%

【成本與毛利】
核心成本：${money(coreCost)}
預估毛利：${money(profit)}
毛利率：${marginRate}%

【成本明細】
估價明細成本合計：${money(estimateCostTotal)}
額外材料費：${money(materialCost)}
工資：${money(laborCost)}
外包費：${money(outsourcedCost)}
交通 / 雜支：${money(miscCost)}
伙食費：${money(foodCost)}（內部參考，不計入核心毛利）

備註：${note}`;

    const text =
      type === 'payment'
        ? paymentText
        : type === 'done'
          ? doneText
          : quoteText;

    const label =
      type === 'payment'
        ? '請款複製'
        : type === 'done'
          ? '結案複製'
          : '報價複製';

    const copied = await writeClipboardText(text);

    if (copied) {
      setError('');
      setManualCopy(null);
      window.alert(`${label}已複製到剪貼簿`);
    } else {
      const msg = `${label}失敗，請手動複製下方文字。`;
      setError(msg);
      setManualCopy({ label, text });
    }
  }


  function exportJobSiteSummaryCsv(site) {
    if (!site) {
      setError('請先選擇案場');
      return;
    }

    const c = calc(site);

    const siteName = site.siteName || site.site_name || site.name || '案場';
    const clientName = site.clientName || site.client_name || '';
    const clientPhone = site.clientPhone || site.client_phone || '';
    const address = site.address || '';
    const projectType = site.projectType || site.project_type || '';
    const status = site.status || '';

    const areaPing =
      site.paintAreaPing ??
      site.areaPing ??
      site.area_pings ??
      site.areaPings ??
      '';

    const pricePerPing =
      site.paintPricePerPing ??
      site.pricePerPing ??
      site.price_per_ping ??
      '';

    const materialCost = numberValue(site.materialCost ?? site.material_cost);
    const laborCost = numberValue(site.laborCost ?? site.labor_cost);
    const outsourcedCost = numberValue(site.outsourcedCost ?? site.outsourced_cost);
    const miscCost = numberValue(site.miscCost ?? site.misc_cost);
    const foodCost = numberValue(site.foodCost ?? site.food_cost);

    let advice = '資料完整，建議持續追蹤收款與成本。';

    if (c.quoteAmount <= 0) {
      advice = '尚未建立報價金額，建議先確認作業坪數與每坪價格。';
    } else if (c.profit < 0) {
      advice = '目前預估虧損，建議調整報價或檢查材料、工資與外包成本。';
    } else if (c.marginRate < 20) {
      advice = '毛利率偏低，建議檢查材料費、工資、外包費與每坪價格。';
    } else if (c.unpaid > 0 && c.collectionRate < 50) {
      advice = '目前收款率偏低，建議優先追蹤請款進度。';
    } else if (c.collectionRate >= 100) {
      advice = '收款狀況良好，可進入結案或後續追蹤。';
    }

    const headers = ['分類', '項目', '內容'];

    const rows = [
      ['案場基本資料', '案場名稱', siteName],
      ['案場基本資料', '客戶名稱', clientName],
      ['案場基本資料', '客戶電話', clientPhone],
      ['案場基本資料', '案場地址', address],
      ['案場基本資料', '工程類型', projectType],
      ['案場基本資料', '施工狀態', status],
      ['報價資訊', '作業坪數', areaPing],
      ['報價資訊', '每坪價格', pricePerPing],
      ['報價資訊', '報價金額', c.quoteAmount],
      ['收款資訊', '已收款', c.receivedAmount],
      ['收款資訊', '未收款', c.unpaid],
      ['收款資訊', '收款率', `${c.collectionRate}%`],
      ['收款資訊', '收款狀態', c.collectionStatus],
      ['成本資訊', '材料費', materialCost],
      ['成本資訊', '工資', laborCost],
      ['成本資訊', '外包費', outsourcedCost],
      ['成本資訊', '交通 / 雜支', miscCost],
      ['成本資訊', '伙食費', foodCost],
      ['成本資訊', '核心成本', c.totalCost],
      ['毛利資訊', '預估毛利', c.profit],
      ['毛利資訊', '毛利率', `${c.marginRate}%`],
      ['經營建議', '接案建議', advice],
      ['其他', '備註', site.note || ''],
      ['其他', '建立時間', site.createdAt || site.created_at || '']
    ];

    const today = new Date().toISOString().slice(0, 10);
    const safeName = String(siteName).replace(/[\\/:*?"<>|]/g, '_');

    downloadCsv(`BookAI_${safeName}_案場摘要_${today}.csv`, headers, rows);
  }

  function exportPaymentsCsv() {
    if (!paymentSite) {
      setError('請先選擇案場並打開收款紀錄');
      return;
    }

    const headers = [
      '案場名稱',
      '收款日期',
      '收款金額',
      '付款方式',
      '備註'
    ];

    const rows = payments.map((payment) => [
      paymentSite.siteName || paymentSite.name || '',
      payment.paymentDate || '',
      payment.amount || 0,
      payment.method || '',
      payment.note || ''
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const siteName = String(paymentSite.siteName || paymentSite.name || '案場').replace(/[\\/:*?"<>|]/g, '_');

    downloadCsv(`BookAI_${siteName}_收款紀錄_${today}.csv`, headers, rows);
  }

  const paymentSiteCalc = paymentSite ? calc(paymentSite) : null;

  return (
    <section>
      <Title
        title="案場工作台"
        desc={`${getIndustryName(company?.industry)}專用：管理案場報價、收款、材料、工資、外包與毛利。`}
      />

      {error && <div className="notice">⚠️ {error}</div>}

      {manualCopy && (
        <div className="copy-fallback-backdrop" role="presentation">
          <div className="copy-fallback-dialog" role="dialog" aria-modal="true" aria-labelledby="copy-fallback-title">
            <div className="copy-fallback-head">
              <div>
                <h2 id="copy-fallback-title">手動複製{manualCopy.label.replace('複製', '')}內容</h2>
                <p>複製失敗，請全選並手動複製下方完整內容。</p>
              </div>
              <button type="button" onClick={() => setManualCopy(null)} aria-label="關閉手動複製視窗">
                關閉
              </button>
            </div>
            <textarea
              readOnly
              value={manualCopy.text}
              rows={18}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="copy-fallback-actions">
              <button
                type="button"
                onClick={async () => {
                  const copied = await writeClipboardText(manualCopy.text);
                  if (copied) {
                    setError('');
                    setManualCopy(null);
                    window.alert(`${manualCopy.label}已複製到剪貼簿`);
                  } else {
                    setError(`${manualCopy.label}失敗，請全選並手動複製下方完整內容。`);
                  }
                }}
              >
                再次複製
              </button>
              <button type="button" onClick={() => setManualCopy(null)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid">
        <Card title="案場合約 / 報價總額" value={money(totals.quoteAmount)} sub={`${sites.length} 個案場`} />
        <Card title="已收款" value={money(totals.receivedAmount)} sub={`收款率 ${rate(totals.receivedAmount, totals.quoteAmount)}`} />
        <Card title="未收款" value={money(totals.unpaid)} sub="需追蹤請款與逾期" />
        <Card title="案場總毛利" value={money(totals.profit)} sub={`平均毛利率 ${avgMargin}%`} />
      </div>

      <div className="panel">
        <h2>接案估價表</h2>
        <div className="notice">
          這裡只需要填一次。BookAI 會依「工種估價明細」自動加總報價、成本、稅額、毛利、毛利率與收款率；確認後可直接新增到下方「案場總覽」。
          <br />
          若材料、工資、外包與雜支已列入下方估價明細，請勿在上方重複填寫。
        </div>

        <div className="grid">
          <label>
            <span>案場名稱</span>
            <input value={form.siteName} placeholder="例：北屯住宅油漆工程" onChange={(e) => update('siteName', e.target.value)} />
          </label>

          <label>
            <span>業主 / 客戶名稱</span>
            <input value={form.clientName} placeholder="例：王先生" onChange={(e) => update('clientName', e.target.value)} />
          </label>

          <label>
            <span>客戶電話</span>
            <input value={form.clientPhone} placeholder="例：0912-345-678" onChange={(e) => update('clientPhone', e.target.value)} />
          </label>

          <label>
            <span>案場地址</span>
            <input value={form.address} placeholder="例：台中市北屯區" onChange={(e) => update('address', e.target.value)} />
          </label>

          <label>
            <span>工程類型</span>
            <select value={form.projectType} onChange={(e) => update('projectType', e.target.value)}>
              {projectTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>
            <span>已收款</span>
            <input type="number" value={form.receivedAmount || ''} placeholder="例：60000，尚未收款可填 0" onChange={(e) => update('receivedAmount', e.target.value)} />
          </label>

          <label>
            <span>額外材料費</span>
            <input type="number" value={form.materialCost || ''} placeholder="例：未列入明細的額外材料成本，避免重複計入" onChange={(e) => update('materialCost', e.target.value)} />
          </label>

          <label>
            <span>作業人數</span>
            <input type="number" value={form.paintWorkers || ''} placeholder="例：2" onChange={(e) => update('paintWorkers', e.target.value)} />
          </label>

          <label>
            <span>施工天數</span>
            <input type="number" value={form.paintWorkDays || ''} placeholder="例：5" onChange={(e) => update('paintWorkDays', e.target.value)} />
          </label>

          <label>
            <span>工資（日）</span>
            <input type="number" value={form.paintDailyWage || ''} placeholder="例：3000" onChange={(e) => update('paintDailyWage', e.target.value)} />
          </label>

          <label>
            <span>外包費</span>
            <input type="number" value={form.outsourcedCost || ''} placeholder="例：25000" onChange={(e) => update('outsourcedCost', e.target.value)} />
          </label>

          <label>
            <span>交通 / 雜支</span>
            <input type="number" value={form.miscCost || ''} placeholder="例：8000" onChange={(e) => update('miscCost', e.target.value)} />
          </label>

          <label>
            <span>伙食費（內部參考）</span>
            <input type="number" value={form.foodCost || ''} placeholder="例：2000，不計入核心毛利" onChange={(e) => update('foodCost', e.target.value)} />
          </label>

          <label>
            <span>施工狀態</span>
            <select value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="已報價">已報價</option>
              <option value="已簽約">已簽約</option>
              <option value="施工中">施工中</option>
              <option value="待驗收">待驗收</option>
              <option value="已請款">已請款</option>
              <option value="部分收款">部分收款</option>
              <option value="已結案">已結案</option>
              <option value="逾期未收">逾期未收</option>
            </select>
          </label>

          <label style={{ gridColumn: '1 / -1' }}>
            <span>備註</span>
            <input value={form.note || ''} placeholder="例：客戶要求分兩期付款" onChange={(e) => update('note', e.target.value)} />
          </label>
        </div>

        {(() => {
          const summary = getEstimateSummary();

          return (
            <div className="panel" style={{ marginTop: 12 }}>
              <h3>工種估價明細</h3>

              <div className="notice">
                {getEstimateTemplateTip(form.projectType)}
                <br />
                完整明細估價建議將材料、工資、外包與加項全部列在下方，上方快速成本欄位可填 0。
                <br />
                估價明細是「對客戶報價」；額外材料費、工資、外包費、交通 / 雜支是內部成本。若材料成本已填在明細內，請勿在額外材料費重複填入。伙食費保留為內部參考，不計入核心毛利。
              </div>

              <div className="grid">
                <label>
                  <span>計價方式</span>
                  <select value={form.taxMode || 'not_taxed'} onChange={(e) => update('taxMode', e.target.value)}>
                    <option value="not_taxed">不計稅 / 內部估算</option>
                    <option value="tax_excluded">未稅，另加 5% 營業稅</option>
                    <option value="tax_included">含稅，總額內含 5% 營業稅</option>
                  </select>
                </label>

                <label>
                  <span>稅率（%）</span>
                  <input
                    type="number"
                    step="0.1"
                    value={Math.round(Number(form.taxRate ?? 0.05) * 1000) / 10}
                    onChange={(e) => update('taxRate', Number(e.target.value || 0) / 100)}
                  />
                </label>
              </div>

              <div className="panel" style={{ marginTop: 12, padding: 14, border: '1px solid #e5e7eb' }}>
                <h3>新增估價項目</h3>

                <div className="grid">
                  <label>
                    <span>類型</span>
                    <select value={estimateDraft.itemCategory || '加項'} onChange={(e) => updateEstimateDraft('itemCategory', e.target.value)}>
                      <option value="主項">主項</option>
                      <option value="加項">加項</option>
                      <option value="材料">材料</option>
                      <option value="工資">工資</option>
                      <option value="外包">外包</option>
                    </select>
                  </label>

                  <label>
                    <span>項目名稱 / 品項</span>
                    <input value={estimateDraft.itemName} placeholder="例：銅管追加、洗洞費、配電箱" onChange={(e) => updateEstimateDraft('itemName', e.target.value)} />
                  </label>

                  <label>
                    <span>數量</span>
                    <input type="number" min="0" step="0.01" value={estimateDraft.quantity} placeholder="例：8" onChange={(e) => updateEstimateDraft('quantity', e.target.value)} />
                  </label>

                  <label>
                    <span>單位</span>
                    <EstimateUnitInput value={estimateDraft.unit} onChange={(value) => updateEstimateDraft('unit', value)} />
                  </label>

                  <label>
                    <span>報價單價</span>
                    <input type="number" min="0" step="1" value={estimateDraft.unitPrice} placeholder="例：700" onChange={(e) => updateEstimateDraft('unitPrice', e.target.value)} />
                  </label>

                  <label>
                    <span>單價成本</span>
                    <input type="number" min="0" step="1" value={estimateDraft.unitCost} placeholder="例：350" onChange={(e) => updateEstimateDraft('unitCost', e.target.value)} />
                  </label>

                  <label style={{ gridColumn: '1 / -1' }}>
                    <span>說明 / 備註</span>
                    <input value={estimateDraft.note || ''} placeholder="例：超出標準安裝、特殊施工、高樓危險施工" onChange={(e) => updateEstimateDraft('note', e.target.value)} />
                  </label>
                </div>

                <div className="row-actions" style={{ marginTop: 12 }}>
                  <button type="button" onClick={addEstimateItem}>加入明細</button>
                  <button type="button" onClick={() => setEstimateDraft(emptyEstimateDraft())}>清空輸入</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <h3>已加入明細列表</h3>

                {estimateItems.length === 0 ? (
                  <div className="notice">尚未加入估價明細。請先在上方輸入一筆項目，再按「加入明細」。</div>
                ) : estimateItems.map((item) => {
                  const quoteSubtotal = estimateQuoteSubtotal(item);
                  const costSubtotal = estimateCostSubtotal(item);
                  const profit = quoteSubtotal - costSubtotal;

                  return (
                    <div
                      key={item.uid}
                      className="panel"
                      style={{
                        marginTop: 0,
                        padding: 14,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div className="grid">
                        <label>
                          <span>類型</span>
                          <select value={item.itemCategory || '加項'} onChange={(e) => updateEstimateItem(item.uid, 'itemCategory', e.target.value)}>
                            <option value="主項">主項</option>
                            <option value="加項">加項</option>
                            <option value="材料">材料</option>
                            <option value="工資">工資</option>
                            <option value="外包">外包</option>
                          </select>
                        </label>

                        <label>
                          <span>項目名稱 / 品項</span>
                          <input value={item.itemName} onChange={(e) => updateEstimateItem(item.uid, 'itemName', e.target.value)} />
                        </label>

                        <label>
                          <span>數量</span>
                          <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateEstimateItem(item.uid, 'quantity', e.target.value)} />
                        </label>

                        <label>
                          <span>單位</span>
                          <EstimateUnitInput value={item.unit} onChange={(value) => updateEstimateItem(item.uid, 'unit', value)} />
                        </label>

                        <label>
                          <span>報價單價</span>
                          <input type="number" min="0" step="1" value={item.unitPrice} onChange={(e) => updateEstimateItem(item.uid, 'unitPrice', e.target.value)} />
                        </label>

                        <label>
                          <span>單價成本</span>
                          <input type="number" min="0" step="1" value={item.unitCost ?? ''} onChange={(e) => updateEstimateItem(item.uid, 'unitCost', e.target.value)} />
                        </label>
                      </div>

                      <div className="grid" style={{ marginTop: 10 }}>
                        <Card title="報價小計" value={money(quoteSubtotal)} sub="數量 × 報價單價" />
                        <Card title="成本小計" value={money(costSubtotal)} sub="數量 × 單價成本" />
                        <Card title="毛利" value={money(profit)} sub="報價小計 - 成本小計" />
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 90px',
                          gap: 10,
                          alignItems: 'end',
                          marginTop: 10
                        }}
                      >
                        <label>
                          <span>說明 / 備註</span>
                          <input value={item.note || ''} onChange={(e) => updateEstimateItem(item.uid, 'note', e.target.value)} />
                        </label>

                        <button type="button" onClick={() => removeEstimateItem(item.uid)}>
                          刪除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid" style={{ marginTop: 12 }}>
                <Card title="估價明細小計" value={money(summary.estimateTotal)} sub="所有項目小計加總" />
                <Card title="未稅金額" value={money(summary.subtotalAmount)} sub="毛利計算基礎" />
                <Card title="營業稅" value={money(summary.taxAmount)} sub={form.taxMode === 'not_taxed' ? '目前不計稅' : `稅率 ${Number(form.taxRate || 0.05) * 100}%`} />
                <Card title="客戶應付總額" value={money(summary.totalAmount)} sub="估價明細連動計算" />
              </div>

              <div className="grid">
                <Card title="成本合計" value={money(summary.estimateCostTotal)} sub="數量 × 單價成本加總" />
                <Card title="核心成本" value={money(summary.coreCost)} sub="明細成本 + 額外材料 + 工資 + 外包 + 雜支" />
                <Card title="預估毛利" value={money(summary.profit)} sub="未稅金額 - 核心成本" />
                <Card title="伙食費" value={money(summary.foodCost)} sub="內部參考，不計入核心毛利" />
              </div>

              <div className="notice" style={{ marginTop: 12 }}>
                核心成本 = 明細成本 + 上方快速成本欄位。請確認沒有重複填寫。
              </div>
            </div>
          );
        })()}

        {(() => {
          const summary = getEstimateSummary();
          const receivedAmount = Number(form.receivedAmount || 0);
          const unpaid = Math.max(summary.totalAmount - receivedAmount, 0);
          const collectionRate = summary.totalAmount ? Math.round((receivedAmount / summary.totalAmount) * 1000) / 10 : 0;

          let advice = '請輸入估價明細數量、單價與成本後查看接案提醒。';
          if (summary.totalAmount > 0) {
            if (summary.profit < 0) advice = '目前核心成本高於未稅金額，建議調整報價或降低成本。';
            else if (summary.marginRate < 20) advice = '毛利偏低，請檢查明細成本、材料費、工資、外包費與雜支。';
            else if (summary.marginRate < 35) advice = '可承接，但需控管追加項目、工期與收款進度。';
            else advice = '毛利健康，目前試算具備利潤空間。';
          }

          return (
            <div className="panel" style={{ marginTop: 12 }}>
              <h3>估價結果</h3>

              <div className="grid">
                <Card title="客戶應付總額" value={money(summary.totalAmount)} sub="估價明細 + 稅務連動" />
                <Card title="未稅金額" value={money(summary.subtotalAmount)} sub="毛利計算基礎" />
                <Card title="核心成本" value={money(summary.coreCost)} sub="明細成本 + 額外材料 + 工資 + 外包 + 雜支" />
                <Card title="預估毛利" value={money(summary.profit)} sub={summary.profit >= 0 ? '目前預估有利潤' : '目前預估虧損'} />
              </div>

              <div className="grid">
                <Card title="毛利率" value={`${summary.marginRate}%`} sub="毛利 / 未稅金額" />
                <Card title="已收款" value={money(receivedAmount)} sub={`收款率 ${collectionRate}%`} />
                <Card title="未收款" value={money(unpaid)} sub="後續需追蹤請款" />
                <Card title="伙食費" value={money(summary.foodCost)} sub="內部參考，不計入核心毛利" />
              </div>

              <div className="notice" style={{ marginTop: 12 }}>
                提醒：若工資、材料、外包費已填入估價明細，請勿再於上方快速成本欄位重複填寫，避免核心成本被加總兩次。
              </div>

              <div className="notice" style={{ marginTop: 12 }}>
                {advice}
              </div>
            </div>
          );
        })()}

        <button type="button" disabled={saving} onClick={submitSite}>
          {saving ? '儲存中...' : editingId ? '更新案場資料' : '確認接案，新增到案場'}
        </button>

        {editingId && (
          <button type="button" onClick={cancelEdit}>
            取消修改
          </button>
        )}
      </div>

      <div className="panel">
        <h2>案場總覽</h2>

        <div className="grid">
          <Card title="高風險案場" value={`${riskSummary.highRiskCount} 個`} sub="毛利偏低或未收款偏高" />
          <Card title="未收款總額" value={money(riskSummary.totalUnpaid)} sub="目前篩選範圍內未收款" />
          <Card title="部分收款案場" value={`${riskSummary.partialPaidCount} 個`} sub="已有收款但尚未收齊" />
          <Card title="毛利偏低案場" value={`${riskSummary.lowMarginCount} 個`} sub="毛利率低於 20%" />
        </div>

        <div className="filters">
          <input
            value={siteSearch}
            placeholder="搜尋案場、客戶、工程類型、地址"
            onChange={(e) => setSiteSearch(e.target.value)}
          />

          <select value={siteStatusFilter} onChange={(e) => setSiteStatusFilter(e.target.value)}>
            <option value="全部">全部狀態</option>
            <option value="已報價">已報價</option>
            <option value="已簽約">已簽約</option>
            <option value="施工中">施工中</option>
            <option value="待驗收">待驗收</option>
            <option value="已請款">已請款</option>
            <option value="部分收款">部分收款</option>
            <option value="已結案">已結案</option>
            <option value="逾期未收">逾期未收</option>
          </select>

          <select value={siteCollectionFilter} onChange={(e) => setSiteCollectionFilter(e.target.value)}>
            <option value="全部">全部收款狀態</option>
            <option value="尚未報價">尚未報價</option>
            <option value="未收款">未收款</option>
            <option value="部分收款">部分收款</option>
            <option value="已收齊">已收齊</option>
            <option value="已請款待收">已請款待收</option>
            <option value="收款風險高">收款風險高</option>
          </select>

          <select value={siteRiskFilter} onChange={(e) => setSiteRiskFilter(e.target.value)}>
            <option value="全部">全部風險</option>
            <option value="有未收款">有未收款</option>
            <option value="收款風險高">收款風險高</option>
            <option value="毛利偏低">毛利偏低</option>
          </select>

          <select value={siteSort} onChange={(e) => setSiteSort(e.target.value)}>
            <option value="最新">最新建立</option>
            <option value="報價金額高到低">報價金額高到低</option>
            <option value="未收款高到低">未收款高到低</option>
            <option value="毛利率低到高">毛利率低到高</option>
            <option value="毛利率高到低">毛利率高到低</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSiteSearch('');
              setSiteStatusFilter('全部');
              setSiteCollectionFilter('全部');
              setSiteRiskFilter('全部');
              setSiteSort('最新');
            }}
          >
            清除篩選
          </button>

          <button type="button" onClick={exportJobSitesCsv}>
            匯出案場 CSV
          </button>
        </div>

        <div className="notice">
          目前顯示 {filteredSites.length} / {sites.length} 個案場
        </div>

        {loading ? (
          <div className="notice">案場資料讀取中...</div>
        ) : sites.length === 0 ? (
          <div className="onboarding-empty-state compact">
            <div>
              <strong>目前還沒有案場資料</strong>
              <p>建立第一個案場後，BookAI 會開始整理估價、收款與工程摘要。</p>
            </div>
          </div>
        ) : (
          <Table
            cols={['案場資訊', '客戶', '工程狀態', '收款進度', '成本毛利', '毛利率', '操作']}
            rows={filteredSites.map((site) => {
              const c = calc(site);

              return [
                <div style={{ minWidth: 120, maxWidth: 160, textAlign: 'left' }}>
                  <strong
                    title={site.siteName || site.name || '-'}
                    style={{
                      display: 'block',
                      lineHeight: 1.35,
                      marginBottom: 4
                    }}
                  >
                    {compactText(site.siteName || site.name || '-', 7)}
                  </strong>
                  <div className="muted">{site.projectType || '-'}</div>
                </div>,

                <div style={{ minWidth: 90, maxWidth: 110, textAlign: 'left' }}>
                  <strong
                    title={site.clientName || '-'}
                    style={{
                      display: 'block',
                      lineHeight: 1.3,
                      maxWidth: 110,
                      whiteSpace: 'normal',
                      textAlign: 'left'
                    }}
                  >
                    {compactText(site.clientName || '-', 4)}
                  </strong>
                  {site.clientPhone ? (
                    <button
                      type="button"
                      style={{
                        display: 'block',
                        marginTop: 4,
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        color: '#2563eb',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        lineHeight: 1.4,
                        cursor: 'pointer',
                        textAlign: 'left',
                        boxShadow: 'none'
                      }}
                      onClick={() => {
                        const ok = window.confirm(`是否撥打 ${site.clientPhone}？`);
                        if (ok) {
                          window.location.href = `tel:${site.clientPhone}`;
                        }
                      }}
                    >
                      {site.clientPhone}
                    </button>
                  ) : (
                    <div className="muted">未填電話</div>
                  )}
                </div>,

                <div style={{ minWidth: 72, textAlign: 'center' }}>
                  {site.status || '-'}
                </div>,

                <div style={{ minWidth: 170, maxWidth: 210, textAlign: 'left' }}>
                  <div>報價：{money(c.quoteAmount)}</div>
                  <div>已收：{money(c.receivedAmount)}</div>
                  <div>未收：{money(c.unpaid)}</div>
                  <div>收款率：{c.collectionRate}%</div>
                  <div className="muted">{c.collectionStatus}</div>
                </div>,

                <div style={{ minWidth: 130, textAlign: 'left' }}>
                  <div>核心成本：{money(c.totalCost)}</div>
                  <div>毛利：{money(c.profit)}</div>
                </div>,

                <strong>{c.marginRate}%</strong>,

                <div
                  className="row-actions"
                  style={{
                    minWidth: 70,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6
                  }}
                >
                  <button
                    type="button"
                    style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                    onClick={() => openPayments(site)}
                  >
                    收款
                  </button>

                  <button
                    type="button"
                    style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                    onClick={() => setOpenActionSiteId((id) => (id === site.id ? null : site.id))}
                  >
                    {openActionSiteId === site.id ? '收合' : '更多'}
                  </button>

                  {openActionSiteId === site.id && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        paddingTop: 4,
                        borderTop: '1px solid #e5e7eb'
                      }}
                    >
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => openEstimateItems(site)}>估價明細</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => startEdit(site)}>修改</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => exportJobSiteSummaryCsv(site)}>摘要csv</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => copyJobSiteText(site, 'quote')}>報價複製</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => copyJobSiteText(site, 'payment')}>請款複製</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => copyJobSiteText(site, 'done')}>結案複製</button>
                      <button type="button" style={{ padding: "6px 10px", fontSize: "0.8rem" }} onClick={() => removeSite(site.id)}>刪除案場</button>
                    </div>
                  )}
                </div>
              ];
            })}
          />
        )}

        {riskCount > 0 && (
          <div className="notice">
            有 {riskCount} 個案場可能毛利偏低或未收款偏高，建議優先追蹤。
          </div>
        )}
      </div>

      {estimateSite && (
        <div className="panel" id="jobsite-estimate-items-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2>估價明細：{estimateSite.siteName || estimateSite.name}</h2>
            <button type="button" onClick={closeEstimateItems}>
              關閉
            </button>
          </div>

          {estimateError && <div className="notice">⚠️ {estimateError}</div>}

          {(() => {
            const itemTotal = estimateItemsView.reduce((sum, item) => sum + estimateQuoteSubtotal(item), 0);
            const costTotal = estimateItemsView.reduce((sum, item) => sum + estimateCostSubtotal(item), 0);
            const siteCalc = calc(estimateSite);
            const grossProfit = itemTotal - costTotal;
            const grossMargin = itemTotal ? Math.round((grossProfit / itemTotal) * 1000) / 10 : 0;

            return (
              <>
                <div className="grid">
                  <Card title="明細報價合計" value={money(itemTotal)} sub="估價項目小計加總" />
                  <Card title="成本合計" value={money(costTotal)} sub="數量 × 單價成本加總" />
                  <Card title="明細毛利" value={money(grossProfit)} sub={`明細毛利率 ${grossMargin}%`} />
                  <Card title="案場未收款" value={money(siteCalc.unpaid)} sub={`收款率 ${siteCalc.collectionRate}%`} />
                </div>

                <div className="panel" id="estimate-item-editor" style={{ marginTop: 12 }}>
                  <h3>{editingEstimateItemId ? '編輯估價項目' : '新增估價項目'}</h3>

                  <Form onSubmit={submitEstimateItem}>
                    <label>
                      <span>類型</span>
                      <select value={estimateItemForm.itemCategory} onChange={(e) => updateEstimateItemForm('itemCategory', e.target.value)}>
                        <option value="主項">主項</option>
                        <option value="加項">加項</option>
                        <option value="材料">材料</option>
                        <option value="工資">工資</option>
                        <option value="外包">外包</option>
                      </select>
                    </label>

                    <label>
                      <span>項目名稱</span>
                      <input value={estimateItemForm.itemName} placeholder="例：銅管追加、洗洞費、室外機架" onChange={(e) => updateEstimateItemForm('itemName', e.target.value)} />
                    </label>

                    <label>
                      <span>數量</span>
                      <input type="number" value={estimateItemForm.quantity} placeholder="例：8" onChange={(e) => updateEstimateItemForm('quantity', e.target.value)} />
                    </label>

                    <label>
                      <span>單位</span>
                      <EstimateUnitInput value={estimateItemForm.unit} onChange={(value) => updateEstimateItemForm('unit', value)} />
                    </label>

                    <label>
                      <span>報價單價</span>
                      <input type="number" value={estimateItemForm.unitPrice} placeholder="例：700" onChange={(e) => updateEstimateItemForm('unitPrice', e.target.value)} />
                    </label>

                    <label>
                      <span>單價成本</span>
                      <input type="number" min="0" step="1" value={estimateItemForm.unitCost} placeholder="例：350" onChange={(e) => updateEstimateItemForm('unitCost', e.target.value)} />
                    </label>

                    <label style={{ gridColumn: '1 / -1' }}>
                      <span>備註</span>
                      <input value={estimateItemForm.note} placeholder="例：超出標準安裝、特殊施工、高樓危險施工" onChange={(e) => updateEstimateItemForm('note', e.target.value)} />
                    </label>

                    <button type="submit" disabled={estimateLoading}>
                      {estimateLoading ? '儲存中...' : editingEstimateItemId ? '更新估價項目' : '新增估價項目'}
                    </button>

                    {editingEstimateItemId && (
                      <button type="button" onClick={resetEstimateItemForm}>
                        取消編輯
                      </button>
                    )}
                  </Form>

                  <div className="notice" style={{ marginTop: 10 }}>
                    報價小計會由「數量 × 報價單價」自動計算；成本小計會由「數量 × 單價成本」自動計算。
                  </div>
                </div>

                {estimateLoading ? (
                  <div className="notice">讀取估價明細中...</div>
                ) : estimateItemsView.length === 0 ? (
                  <div className="notice">
                    此案場目前沒有估價明細。可在上方新增估價項目，舊案場仍可保留原本報價欄位。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {estimateItemsView.map((item) => {
                      const quoteSubtotal = estimateQuoteSubtotal(item);
                      const costSubtotal = estimateCostSubtotal(item);
                      const unitCost = estimateUnitCost(item);
                      const profit = quoteSubtotal - costSubtotal;

                      return (
                        <div
                          key={item.id}
                          className="panel"
                          style={{
                            marginTop: 0,
                            padding: 14,
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <strong>{item.itemName || '-'}</strong>
                              <div className="muted">{item.itemCategory || '估價項目'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <strong>{money(quoteSubtotal)}</strong>
                              <div className="row-actions" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => startEditEstimateItem(item)}>編輯</button>
                                <button
                                  type="button"
                                  style={{
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    border: '1px solid #fecaca'
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteEstimateItem(item.id);
                                  }}
                                >
                                  刪除
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="grid" style={{ marginTop: 10 }}>
                            <Card title="數量" value={`${item.quantity || 0} ${item.unit || ''}`} />
                            <Card title="報價單價" value={money(item.unitPrice)} />
                            <Card title="單價成本" value={money(unitCost)} />
                            <Card title="報價小計" value={money(quoteSubtotal)} />
                          </div>

                          <div className="grid" style={{ marginTop: 10 }}>
                            <Card title="成本小計" value={money(costSubtotal)} sub="數量 × 單價成本" />
                            <Card title="毛利" value={money(profit)} sub="報價小計 - 成本小計" />
                          </div>

                          {item.note && (
                            <div className="notice" style={{ marginTop: 10 }}>
                              備註：{item.note}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {paymentSite && (
        <div className="panel" id="jobsite-payments-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2>收款紀錄：{paymentSite.siteName || paymentSite.name}</h2>
            <button type="button" onClick={exportPaymentsCsv}>
              匯出收款 CSV
            </button>
          </div>

          {paymentSiteCalc && (
            <div className="grid">
              <Card title="報價金額" value={money(paymentSiteCalc.quoteAmount)} />
              <Card title="已收款" value={money(paymentSiteCalc.receivedAmount)} sub={`收款率 ${paymentSiteCalc.collectionRate}%`} />
              <Card title="未收款" value={money(paymentSiteCalc.unpaid)} sub={`${paymentSiteCalc.collectionStatus}｜${paymentSiteCalc.collectionHint}`} />
              <Card title="案場毛利" value={money(paymentSiteCalc.profit)} sub={`毛利率 ${paymentSiteCalc.marginRate}%`} />
            </div>
          )}

          <Form onSubmit={submitPayment}>
            <label>
              <span>收款金額</span>
              <input type="number" value={paymentForm.amount} placeholder="例：20000" onChange={(e) => updatePaymentForm('amount', e.target.value)} />
            </label>
            <label>
              <span>收款日期</span>
              <input type="date" value={paymentForm.paymentDate} onChange={(e) => updatePaymentForm('paymentDate', e.target.value)} />
            </label>
            <label>
              <span>收款方式</span>
              <select value={paymentForm.method} onChange={(e) => updatePaymentForm('method', e.target.value)}>
                <option value="現金">現金</option>
                <option value="匯款">匯款</option>
                <option value="支票">支票</option>
                <option value="信用卡">信用卡</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              <span>備註</span>
              <input value={paymentForm.note} placeholder="例：訂金 / 二期款 / 尾款" onChange={(e) => updatePaymentForm('note', e.target.value)} />
            </label>

            <button disabled={paymentSaving}>
              {paymentSaving ? '收款儲存中...' : '新增收款'}
            </button>

            <button type="button" onClick={() => {
              setPaymentSite(null);
              setPayments([]);
            }}>
              關閉收款紀錄
            </button>
          </Form>

          {paymentLoading ? (
            <div className="notice">收款紀錄讀取中...</div>
          ) : (
            <Table
              cols={['日期', '金額', '方式', '備註', '操作']}
              rows={payments.map((payment) => [
                payment.paymentDate || '-',
                money(payment.amount),
                payment.method || '-',
                payment.note || '-',
                <div className="row-actions">
                  <button type="button" onClick={() => editPayment(payment)}>編輯</button>
                  <button type="button" onClick={() => removePayment(payment.id)}>刪除</button>
                </div>
              ])}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ConstructionQuoteCalculator() {
  const [quote, setQuote] = useState({
    siteName: '北屯住宅油漆工程',
    clientName: '王先生',
    areaPing: 25,
    areaM2: 82.6,
    pricePerPing: 4800,
    quoteAmount: 120000,
    materialCostPerPing: 1120,
    materialCost: 28000,
    workers: 2,
    workDays: 5,
    dailyWage: 2800,
    outsourcedCost: 12000,
    transportCost: 2500,
    miscCost: 3000
  });

  const suggestedQuoteAmount =
    Number(quote.areaPing || 0) * Number(quote.pricePerPing || 0);

  const suggestedMaterialCost =
    Number(quote.areaPing || 0) * Number(quote.materialCostPerPing || 0);

  const laborCost =
    Number(quote.workers || 0) *
    Number(quote.workDays || 0) *
    Number(quote.dailyWage || 0);

  const totalCost =
    Number(quote.materialCost || 0) +
    laborCost +
    Number(quote.outsourcedCost || 0) +
    Number(quote.transportCost || 0) +
    Number(quote.miscCost || 0);

  const profit = Number(quote.quoteAmount || 0) - totalCost;
  const marginRate = Number(quote.quoteAmount || 0)
    ? Math.round((profit / Number(quote.quoteAmount || 0)) * 1000) / 10
    : 0;

  const costPerPing = Number(quote.areaPing || 0)
    ? Math.round((totalCost / Number(quote.areaPing || 0)) * 10) / 10
    : 0;

  const profitPerPing = Number(quote.areaPing || 0)
    ? Math.round((profit / Number(quote.areaPing || 0)) * 10) / 10
    : 0;

  let advice = '報價尚可，請確認現場風險、牆面狀況與追加項目。';
  if (marginRate < 0) advice = '危險：此報價目前預估虧損，建議立刻調整報價或成本。';
  else if (marginRate < 20) advice = '偏低：毛利率低於 20%，建議檢查面積、材料、工班與外包成本。';
  else if (marginRate >= 35) advice = '漂亮：毛利率良好，仍需確認收款條件、牆面狀況與施工風險。';

  function update(key, value) {
    setQuote((old) => {
      const next = {
        ...old,
        [key]: value
      };

      if (key === 'areaPing') {
        next.areaM2 = Math.round(Number(value || 0) * 3.3058 * 10) / 10;
        next.quoteAmount = Math.round(Number(value || 0) * Number(old.pricePerPing || 0));
        next.materialCost = Math.round(Number(value || 0) * Number(old.materialCostPerPing || 0));
      }

      if (key === 'areaM2') {
        const ping = Math.round((Number(value || 0) / 3.3058) * 10) / 10;
        next.areaPing = ping;
        next.quoteAmount = Math.round(ping * Number(old.pricePerPing || 0));
        next.materialCost = Math.round(ping * Number(old.materialCostPerPing || 0));
      }

      if (key === 'pricePerPing') {
        next.quoteAmount = Math.round(Number(old.areaPing || 0) * Number(value || 0));
      }

      if (key === 'materialCostPerPing') {
        next.materialCost = Math.round(Number(old.areaPing || 0) * Number(value || 0));
      }

      return next;
    });
  }

  return (
    <div className="panel">
      <h2>現場報價毛利試算</h2>
      <div className="notice">
        適合工程行、油漆、水電、冷氣維修現場估價使用。油漆業可先輸入坪數或平方公尺，BookAI 會估算報價、材料成本與每坪毛利。
      </div>

      <Form>
        <label>
          <span>案場名稱</span>
          <input placeholder="例：北屯住宅油漆工程" value={quote.siteName} onChange={(e) => update('siteName', e.target.value)} />
        </label>
        <label>
          <span>業主 / 客戶名稱</span>
          <input placeholder="例：王先生" value={quote.clientName} onChange={(e) => update('clientName', e.target.value)} />
        </label>
        <label>
          <span>施工面積 / 坪數</span>
          <input type="number" placeholder="例：25" value={quote.areaPing} onChange={(e) => update('areaPing', e.target.value)} />
        </label>
        <label>
          <span>施工面積 / 平方公尺</span>
          <input type="number" placeholder="例：82.6" value={quote.areaM2} onChange={(e) => update('areaM2', e.target.value)} />
        </label>
        <label>
          <span>每坪報價</span>
          <input type="number" placeholder="例：4800" value={quote.pricePerPing} onChange={(e) => update('pricePerPing', e.target.value)} />
        </label>
        <label>
          <span>報價金額</span>
          <input type="number" placeholder="例：120000" value={quote.quoteAmount} onChange={(e) => update('quoteAmount', e.target.value)} />
        </label>
        <label>
          <span>每坪材料成本</span>
          <input type="number" placeholder="例：1120" value={quote.materialCostPerPing} onChange={(e) => update('materialCostPerPing', e.target.value)} />
        </label>
        <label>
          <span>材料費</span>
          <input type="number" placeholder="例：28000" value={quote.materialCost} onChange={(e) => update('materialCost', e.target.value)} />
        </label>
        <label>
          <span>師傅人數</span>
          <input type="number" placeholder="例：2" value={quote.workers} onChange={(e) => update('workers', e.target.value)} />
        </label>
        <label>
          <span>施工天數 / 工天</span>
          <input type="number" placeholder="例：5" value={quote.workDays} onChange={(e) => update('workDays', e.target.value)} />
        </label>
        <label>
          <span>每人每日工資</span>
          <input type="number" placeholder="例：2800" value={quote.dailyWage} onChange={(e) => update('dailyWage', e.target.value)} />
        </label>
        <label>
          <span>外包費 / 協力廠商</span>
          <input type="number" placeholder="例：12000" value={quote.outsourcedCost} onChange={(e) => update('outsourcedCost', e.target.value)} />
        </label>
        <label>
          <span>交通車馬費</span>
          <input type="number" placeholder="例：2500" value={quote.transportCost} onChange={(e) => update('transportCost', e.target.value)} />
        </label>
        <label>
          <span>雜支 / 耗材</span>
          <input type="number" placeholder="例：3000" value={quote.miscCost} onChange={(e) => update('miscCost', e.target.value)} />
        </label>
      </Form>

      <div className="grid">
        <Card title="建議報價" value={money(suggestedQuoteAmount)} sub={`${quote.areaPing} 坪 × ${money(quote.pricePerPing)}`} />
        <Card title="報價金額" value={money(quote.quoteAmount)} sub={quote.siteName} />
        <Card title="預估核心成本" value={money(totalCost)} sub={`含工資 ${money(laborCost)}`} />
        <Card title="預估毛利" value={money(profit)} sub={profit >= 0 ? '目前預估有利潤' : '目前預估虧損'} />
      </div>

      <div className="grid">
        <Card title="毛利率" value={`${marginRate}%`} sub={advice} />
        <Card title="每坪成本" value={money(costPerPing)} sub="核心成本 / 坪數" />
        <Card title="每坪毛利" value={money(profitPerPing)} sub="毛利 / 坪數" />
        <Card title="建議材料費" value={money(suggestedMaterialCost)} sub={`${quote.areaPing} 坪 × ${money(quote.materialCostPerPing)}`} />
      </div>

      <Table
        cols={['成本項目', '金額', '說明']}
        rows={[
          ['施工面積', `${quote.areaPing} 坪 / ${quote.areaM2} ㎡`, '可用坪數或平方公尺估算'],
          ['每坪報價', money(quote.pricePerPing), '用於快速估算報價金額'],
          ['材料費', money(quote.materialCost), '油漆、水電材料、冷氣零件、耗材'],
          ['工資', money(laborCost), `${quote.workers} 人 × ${quote.workDays} 天 × ${money(quote.dailyWage)}`],
          ['外包費', money(quote.outsourcedCost), '外包工班、協力廠商'],
          ['交通車馬費', money(quote.transportCost), '油資、停車、搬運、車資'],
          ['雜支 / 耗材', money(quote.miscCost), '膠帶、砂紙、刷具、五金、小工具'],
          ['預估核心成本', money(totalCost), '以上成本合計'],
          ['每坪成本', money(costPerPing), '核心成本除以坪數'],
          ['預估毛利', money(profit), advice]
        ]}
      />
    </div>
  );
}

function Reports({ companyId, company }) {
  const [data, setData] = useState({
    summary: null,
    transactions: [],
    products: [],
    vouchers: [],
    tax: null,
    jobSites: []
  });

  const [loading, setLoading] = useState(true);
  const industry = company?.industry;
  const constructionMode = isConstructionIndustry(industry);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      api(`/companies/${companyId}/summary`).catch(() => null),
      api(`/companies/${companyId}/transactions`).catch(() => []),
      api(`/companies/${companyId}/products`).catch(() => []),
      api(`/companies/${companyId}/vouchers`).catch(() => []),
      api(`/companies/${companyId}/tax/vat`).catch(() => null),
      constructionMode ? api(`/companies/${companyId}/jobsites`).catch(() => []) : Promise.resolve([])
    ]).then(([summary, transactions, products, vouchers, tax, jobSites]) => {
      if (!alive) return;
      setData({
        summary,
        transactions,
        products,
        vouchers,
        tax,
        jobSites: Array.isArray(jobSites) ? jobSites : []
      });
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [companyId, constructionMode]);

  if (loading) {
    return (
      <section>
        <Title
          title={constructionMode ? '工程月報' : '進階報表'}
          desc={constructionMode ? '正在整理案場、報價、收款與成本資料...' : '正在整理營收、成本、平台與稅務資料...'}
        />
      </section>
    );
  }

  const tx = data.transactions || [];
  const products = data.products || [];
  const vouchers = data.vouchers || [];
  const summary = data.summary || {};
  const jobSites = data.jobSites || [];

  if (constructionMode) {
    const siteRows = jobSites.map((site) => {
      const quote = Number(site.quoteAmount ?? site.quote_amount ?? 0);
      const received = Number(site.receivedAmount ?? site.received_amount ?? 0);
      const unpaid = Math.max(quote - received, 0);

      const areaPings = Number(site.areaPings ?? site.area_pings ?? site.paintAreaPing ?? 0);
      const pricePerPing = Number(site.pricePerPing ?? site.price_per_ping ?? site.paintPricePerPing ?? 0);

      const material = Number(site.materialCost ?? site.material_cost ?? 0);
      const labor = Number(site.laborCost ?? site.labor_cost ?? 0);
      const outsourced = Number(site.outsourcedCost ?? site.outsourced_cost ?? 0);
      const misc = Number(site.miscCost ?? site.misc_cost ?? 0);
      const food = Number(site.foodCost ?? site.food_cost ?? 0);

      const totalCost = material + labor + outsourced + misc + food;
      const profit = quote - totalCost;
      const marginRate = quote ? Math.round((profit / quote) * 1000) / 10 : 0;
      const collectionRate = quote ? Math.round((received / quote) * 1000) / 10 : 0;

      let risk = '正常';
      if (profit < 0) risk = '虧損風險';
      else if (quote > 0 && marginRate < 20) risk = '毛利偏低';
      else if (quote > 0 && collectionRate < 30) risk = '收款風險高';
      else if (quote > 0 && collectionRate < 70) risk = '追蹤中';

      return {
        name: site.siteName || site.site_name || site.name || '未命名案場',
        client: site.clientName || site.client_name || '未填客戶',
        phone: site.clientPhone || site.client_phone || '',
        address: site.address || '',
        projectType: site.projectType || site.project_type || '',
        status: site.status || '未設定',
        areaPings,
        pricePerPing,
        quote,
        received,
        unpaid,
        material,
        labor,
        outsourced,
        misc,
        food,
        totalCost,
        profit,
        marginRate,
        collectionRate,
        risk,
        note: site.note || '',
        createdAt: site.createdAt || site.created_at || ''
      };
    });

    const totalQuote = siteRows.reduce((sum, s) => sum + s.quote, 0);
    const totalReceived = siteRows.reduce((sum, s) => sum + s.received, 0);
    const totalUnpaid = siteRows.reduce((sum, s) => sum + s.unpaid, 0);
    const totalCost = siteRows.reduce((sum, s) => sum + s.totalCost, 0);
    const totalProfit = totalQuote - totalCost;
    const avgMarginRate = totalQuote ? Math.round((totalProfit / totalQuote) * 1000) / 10 : 0;
    const avgCollectionRate = totalQuote ? Math.round((totalReceived / totalQuote) * 1000) / 10 : 0;
    const riskCount = siteRows.filter((s) => ['收款風險高', '毛利偏低', '虧損風險'].includes(s.risk)).length;
    const lowMarginCount = siteRows.filter((s) => s.quote > 0 && s.marginRate < 20).length;
    const unpaidCount = siteRows.filter((s) => s.unpaid > 0).length;

    const statusMap = siteRows.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    const alerts = [
      siteRows.length === 0 ? '目前尚無案場資料，請先到案場工作台新增接案估價。' : null,
      totalUnpaid > 0 ? `尚有未收款 ${money(totalUnpaid)}，建議優先追蹤請款。` : null,
      riskCount > 0 ? `有 ${riskCount} 個案場存在收款、毛利或虧損風險。` : null,
      lowMarginCount > 0 ? `有 ${lowMarginCount} 個案場毛利率低於 20%，請檢查報價與成本。` : null,
      avgCollectionRate < 60 && totalQuote > 0 ? '整體收款率低於 60%，建議強化分期請款與驗收收款流程。' : null,
      vouchers.some((v) => v.deductible === 0) ? '有不可扣抵憑證，稅務中心需要留意。' : null
    ].filter(Boolean);

    function exportEngineeringReportCsv() {
      const headers = [
        '案場名稱',
        '客戶名稱',
        '電話',
        '地址',
        '工程類型',
        '施工狀態',
        '作業坪數',
        '每坪價格',
        '報價金額',
        '已收款',
        '未收款',
        '收款率',
        '材料費',
        '工資',
        '外包費',
        '交通 / 雜支',
        '伙食費',
        '核心成本',
        '毛利',
        '毛利率',
        '風險',
        '備註',
        '建立時間'
      ];

      const rows = siteRows.map((s) => [
        s.name,
        s.client,
        s.phone,
        s.address,
        s.projectType,
        s.status,
        s.areaPings,
        s.pricePerPing,
        s.quote,
        s.received,
        s.unpaid,
        `${s.collectionRate}%`,
        s.material,
        s.labor,
        s.outsourced,
        s.misc,
        s.food,
        s.totalCost,
        s.profit,
        `${s.marginRate}%`,
        s.risk,
        s.note,
        s.createdAt
      ]);

      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`BookAI_工程月報_${today}.csv`, headers, rows);
    }

    return (
      <section>
        <Title
          title="工程月報"
          desc={`${getIndustryName(industry)}專屬月報：統整案場報價、已收款、未收款、成本、毛利率與收款風險，適合月底對帳與經營檢討。`}
        />

        <div className="notice">{getIndustryInsight(industry)}</div>

        <div className="grid">
          <Card title="總案場數" value={siteRows.length} sub="目前建立案場" />
          <Card title="案場總報價" value={money(totalQuote)} sub="所有案場合計" />
          <Card title="已收款總額" value={money(totalReceived)} sub={`收款率 ${avgCollectionRate}%`} />
          <Card title="未收款總額" value={money(totalUnpaid)} sub={`${unpaidCount} 個案場仍有未收款`} />
        </div>

        <div className="grid">
          <Card title="核心成本" value={money(totalCost)} sub="材料、工資、外包、雜支與伙食" />
          <Card title="總毛利" value={money(totalProfit)} sub={totalProfit >= 0 ? '目前預估有利潤' : '目前預估虧損'} />
          <Card title="平均毛利率" value={`${avgMarginRate}%`} sub="總毛利 / 總報價" />
          <Card title="風險案場" value={riskCount} sub="收款、毛利或虧損風險" />
        </div>

        <div className="panel">
          <h2>工程月報匯出</h2>
          <p className="muted">匯出案場、收款、成本、毛利、毛利率與風險狀態，方便月底對帳、給會計或內部檢討。</p>
          <button type="button" onClick={exportEngineeringReportCsv}>
            匯出工程月報 CSV
          </button>
        </div>

        <div className="panel-grid">
          <div className="panel">
            <h2>案場狀態分布</h2>
            <Table
              cols={['狀態', '案場數']}
              rows={Object.entries(statusMap).length
                ? Object.entries(statusMap).map(([status, count]) => [status, count])
                : [['尚無資料', 0]]
              }
            />
          </div>

          <div className="panel">
            <h2>工程風險提醒</h2>
            <ul className="summary">
              {alerts.length ? alerts.map((a, i) => <li key={i}>{a}</li>) : <li>目前工程營運狀況穩定，請持續維護案場與收款資料。</li>}
            </ul>
          </div>
        </div>

        <div className="panel">
          <h2>案場收款與毛利分析</h2>
          <Table
            cols={['案場', '客戶', '狀態', '坪數', '每坪價格', '報價', '已收款', '未收款', '收款率', '核心成本', '毛利', '毛利率', '風險']}
            rows={siteRows.length
              ? siteRows.map((s) => [
                  s.name,
                  s.client,
                  s.status,
                  s.areaPings,
                  money(s.pricePerPing),
                  money(s.quote),
                  money(s.received),
                  money(s.unpaid),
                  `${s.collectionRate}%`,
                  money(s.totalCost),
                  money(s.profit),
                  `${s.marginRate}%`,
                  s.risk
                ])
              : [['尚無案場', '請先新增', '-', 0, money(0), money(0), money(0), money(0), '0%', money(0), money(0), '0%', '待建立']]
            }
          />
        </div>
      </section>
    );
  }

  const revenue = Number(summary.revenue || 0);
  const fees = Number(summary.fees || 0);
  const cogs = Number(summary.cogs || 0);
  const voucherTotal = vouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0);

  const totalCost = fees + cogs + voucherTotal;
  const grossProfit = revenue - cogs - fees;
  const netProfit = revenue - totalCost;
  const grossMarginRate = revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
  const expenseRate = revenue ? Math.round((totalCost / revenue) * 1000) / 10 : 0;
  const unpaidSales = Number(summary.unpaidSales || 0);
  const unpaidPurchases = Number(summary.unpaidPurchases || 0);
  const collectedSales = Number(summary.collectedSales || 0);
  const paidPurchases = Number(summary.paidPurchases || 0);
  const monthlySales = Number(summary.monthlySales || 0);
  const monthlyPurchases = Number(summary.monthlyPurchases || 0);
  const cashGap = unpaidSales - unpaidPurchases;

  const platformMap = tx.reduce((acc, t) => {
    const key = t.platform_key || 'manual';

    if (!acc[key]) {
      acc[key] = { platform: key, revenue: 0, fee: 0, cogs: 0, net: 0, profit: 0, count: 0 };
    }

    acc[key].revenue += Number(t.gross_amount || 0);
    acc[key].fee += Number(t.platform_fee || 0);
    acc[key].cogs += Number(t.cost_of_goods_sold || 0);
    acc[key].net += Number(t.net_amount || 0);
    acc[key].profit += Number(t.platform_profit || 0);
    acc[key].count += 1;

    return acc;
  }, {});

  const platformRows = Object.values(platformMap).sort((a, b) => b.profit - a.profit);
  const bestPlatform = platformRows.length ? platformRows[0] : null;
  const riskyPlatform =
    platformRows
      .filter((p) => p.revenue > 0)
      .sort((a, b) => a.profit / a.revenue - b.profit / b.revenue)[0] || null;

  const alerts = [
    revenue === 0 ? '目前尚無營收資料，建議先到平台串接查看資料匯入規劃。' : null,
    grossMarginRate < 30 && revenue > 0 ? '毛利率低於 30%，請檢查平台抽成、商品成本或折扣活動。' : null,
    fees > revenue * 0.18 && revenue > 0 ? '平台手續費占比偏高，外送或商城平台可能正在吃掉利潤。' : null,
    products.some((p) => Number(p.stock || 0) <= Number(p.safety_stock || 0)) ? '有商品低於安全庫存，請到商品庫存檢查。' : null,
    vouchers.some((v) => v.deductible === 0) ? '有不可扣抵憑證，稅務中心需要留意。' : null
  ].filter(Boolean);

  return (
    <section>
      <Title
        title="進階報表"
        desc={`${getIndustryName(industry)}專屬分析：營收、成本、毛利、平台、商品與稅務風險。`}
      />

      <div className="notice">{getIndustryInsight(industry)}</div>

      <div className="grid">
        <Card title="本期營收" value={money(revenue)} sub={`${tx.length} 筆交易`} />
        <Card title="本期核心成本" value={money(totalCost)} sub={`費用率 ${expenseRate}%`} />
        <Card title="預估毛利" value={money(grossProfit)} sub={`毛利率 ${grossMarginRate}%`} />
        <Card title="預估淨利" value={money(netProfit)} sub={netProfit >= 0 ? '目前為正收益' : '目前為虧損'} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>平台經營洞察</h2>
          <div className="grid">
            <Card title="最賺平台" value={bestPlatform ? getPlatformName(bestPlatform.platform) : '尚無資料'} sub={bestPlatform ? `平台毛利 ${money(bestPlatform.profit)}` : '尚無平台資料'} />
            <Card title="最高風險平台" value={riskyPlatform ? getPlatformName(riskyPlatform.platform) : '尚無資料'} sub={riskyPlatform ? `毛利率 ${rate(riskyPlatform.profit, riskyPlatform.revenue)}` : '尚無平台資料'} />
            <Card title="平均平台抽成率" value={rate(fees, revenue)} sub="平台費 / 營收" />
            <Card title="平均商品成本率" value={rate(cogs, revenue)} sub="商品成本 / 營收" />
          </div>
        </div>

        <div className="panel">
          <h2>應收 / 應付狀態</h2>
          <div className="grid">
            <Card title="應收未收" value={money(unpaidSales)} sub={unpaidSales > 0 ? '需追蹤收款' : '目前無未收'} />
            <Card title="應付未付" value={money(unpaidPurchases)} sub={unpaidPurchases > 0 ? '需安排付款' : '目前無未付'} />
            <Card title="已收款" value={money(collectedSales)} sub="銷貨收款累計" />
            <Card title="已付款" value={money(paidPurchases)} sub="進貨付款累計" />
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>經營風險提醒</h2>
          <ul className="summary">
            {alerts.length ? alerts.map((a, i) => <li key={i}>{a}</li>) : <li>目前沒有明顯風險，請持續追蹤營收、成本與稅務資料。</li>}
            {cashGap < 0 && <li>本期應付未付高於應收未收，請留意付款排程與現金流。</li>}
          </ul>
        </div>

        <div className="panel">
          <h2>月度趨勢摘要</h2>
          <Table
            cols={['項目', '金額', '狀態']}
            rows={[
              ['本月銷貨', money(monthlySales), monthlySales > 0 ? '已有銷貨資料' : '尚無本月銷貨'],
              ['本月進貨', money(monthlyPurchases), monthlyPurchases > 0 ? '已有進貨資料' : '尚無本月進貨'],
              ['本月毛利', money(grossProfit), grossProfit >= 0 ? '毛利為正' : '毛利為負'],
              ['應收應付差額', money(cashGap), cashGap >= 0 ? '流入可覆蓋未付' : '需留意付款壓力']
            ]}
          />
        </div>
      </div>

      <div className="panel">
        <h2>平台毛利分析</h2>
        <Table
          cols={['平台', '交易數', '營收', '平台費', '抽成率', '商品成本', '成本率', '實收', '實收率', '平台毛利', '毛利率', '經營建議']}
          rows={platformRows.map((p) => [
            getPlatformName(p.platform),
            p.count,
            money(p.revenue),
            money(p.fee),
            rate(p.fee, p.revenue),
            money(p.cogs),
            rate(p.cogs, p.revenue),
            money(p.net),
            rate(p.net, p.revenue),
            money(p.profit),
            rate(p.profit, p.revenue),
            platformAdvice(p)
          ])}
        />
      </div>
    </section>
  );
}

const emptyCommerceProduct = {
  name: '',
  category: '',
  price: '',
  originalPrice: '',
  imageUrl: '',
  description: '',
  isFeatured: '0',
  isVisible: '1',
  sortOrder: 1
};

const emptyCommercePromotion = {
  title: '',
  description: '',
  promoType: 'banner',
  startDate: '',
  endDate: '',
  isActive: '1',
  sortOrder: 1
};

function nextCommerceSortOrder(items = []) {
  return Math.max(0, ...items.map((item) => Number(item.sortOrder ?? item.sort_order ?? 0) || 0)) + 1;
}

function CommerceSiteManager({ companyId, company }) {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [productForm, setProductForm] = useState(emptyCommerceProduct);
  const [promotionForm, setPromotionForm] = useState(emptyCommercePromotion);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingPromotionId, setEditingPromotionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadCommerceSite() {
    try {
      setLoading(true);
      setError('');
      const [settingsRow, productRows, promotionRows] = await Promise.all([
        api(`/companies/${companyId}/commerce-site/settings`),
        api(`/companies/${companyId}/commerce-site/products`),
        api(`/companies/${companyId}/commerce-site/promotions`)
      ]);
      setSettings(settingsRow);
      const nextProducts = Array.isArray(productRows) ? productRows : [];
      const nextPromotions = Array.isArray(promotionRows) ? promotionRows : [];
      setProducts(nextProducts);
      setPromotions(nextPromotions);
      if (!editingProductId) setProductForm({ ...emptyCommerceProduct, sortOrder: nextCommerceSortOrder(nextProducts) });
      if (!editingPromotionId) setPromotionForm({ ...emptyCommercePromotion, sortOrder: nextCommerceSortOrder(nextPromotions) });
    } catch (err) {
      setError(err.message || '讀取官網後台資料失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCommerceSite();
  }, [companyId]);

  async function saveSettings(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage('');
      setError('');
      const updated = await api(`/companies/${companyId}/commerce-site/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings)
      });
      setSettings(updated);
      setMessage('已儲存');
    } catch (err) {
      setError(err.message || '儲存官網設定失敗');
    } finally {
      setSaving(false);
    }
  }

  async function publishSettings() {
    try {
      setSaving(true);
      setMessage('');
      setError('');
      const updated = await api(`/companies/${companyId}/commerce-site/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ ...settings, siteStatus: 'live' })
      });
      setSettings(updated);
      setMessage('網站狀態已更新為已上線');
    } catch (err) {
      setError(err.message || '發布更新失敗');
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage('');
      setError('');
      const path = editingProductId
        ? `/companies/${companyId}/commerce-site/products/${editingProductId}`
        : `/companies/${companyId}/commerce-site/products`;
      const saved = await api(path, {
        method: editingProductId ? 'PATCH' : 'POST',
        body: JSON.stringify(productForm)
      });
      setProducts((old) => editingProductId ? old.map((p) => (p.id === editingProductId ? saved : p)) : [saved, ...old]);
      setEditingProductId(null);
      setProductForm({ ...emptyCommerceProduct, sortOrder: nextCommerceSortOrder([saved, ...products]) });
      setMessage('已儲存');
    } catch (err) {
      setError(err.message || '儲存商品失敗');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm('確定要刪除此商品嗎？')) return;
    try {
      setError('');
      await api(`/companies/${companyId}/commerce-site/products/${id}`, { method: 'DELETE' });
      setProducts((old) => old.filter((p) => p.id !== id));
      setMessage('已儲存');
    } catch (err) {
      setError(err.message || '刪除商品失敗');
    }
  }

  async function savePromotion(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage('');
      setError('');
      const path = editingPromotionId
        ? `/companies/${companyId}/commerce-site/promotions/${editingPromotionId}`
        : `/companies/${companyId}/commerce-site/promotions`;
      const saved = await api(path, {
        method: editingPromotionId ? 'PATCH' : 'POST',
        body: JSON.stringify(promotionForm)
      });
      setPromotions((old) => editingPromotionId ? old.map((p) => (p.id === editingPromotionId ? saved : p)) : [saved, ...old]);
      setEditingPromotionId(null);
      setPromotionForm({ ...emptyCommercePromotion, sortOrder: nextCommerceSortOrder([saved, ...promotions]) });
      setMessage('已儲存');
    } catch (err) {
      setError(err.message || '儲存活動失敗');
    } finally {
      setSaving(false);
    }
  }

  async function deletePromotion(id) {
    if (!window.confirm('確定要刪除此活動嗎？')) return;
    try {
      setError('');
      await api(`/companies/${companyId}/commerce-site/promotions/${id}`, { method: 'DELETE' });
      setPromotions((old) => old.filter((p) => p.id !== id));
      setMessage('已儲存');
    } catch (err) {
      setError(err.message || '刪除活動失敗');
    }
  }

  function editProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || '',
      category: product.category || '',
      price: product.price || '',
      originalPrice: product.originalPrice || '',
      imageUrl: product.imageUrl || '',
      description: product.description || '',
      isFeatured: product.isFeatured ? '1' : '0',
      isVisible: product.isVisible ? '1' : '0',
      sortOrder: product.sortOrder || 0
    });
  }

  function editPromotion(promotion) {
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      title: promotion.title || '',
      description: promotion.description || '',
      promoType: promotion.promoType || 'banner',
      startDate: promotion.startDate || '',
      endDate: promotion.endDate || '',
      isActive: promotion.isActive ? '1' : '0',
      sortOrder: promotion.sortOrder || 0
    });
  }

  if (loading || !settings) {
    return (
      <section>
        <Title title="Commerce 官網後台" desc="正在讀取官網後台資料..." />
      </section>
    );
  }

  const featuredProducts = products.filter((p) => p.isFeatured && p.isVisible).slice(0, 3);
  const previewProducts = featuredProducts.length ? featuredProducts : products.filter((p) => p.isVisible).slice(0, 3);
  const activePromotions = promotions.filter((p) => p.isActive).slice(0, 3);
  const visibleProductCount = products.filter((p) => p.isVisible).length;

  return (
    <section className="commerce-site-page">
      <Title title="Commerce 官網後台" desc="管理品牌資訊、商品展示、活動跑馬燈與官方 LINE 導流內容。" />

      {message && <div className="notice">{message}</div>}
      {error && <div className="error">{error}</div>}
      {!settings.brandName && !settings.heroTitle && !settings.heroSubtitle && (
        <div className="onboarding-empty-state compact">
          <div>
            <strong>目前尚未設定官網首頁</strong>
            <p>你可以先設定品牌名稱、Banner 與首頁區塊，建立基本品牌頁面。</p>
          </div>
          <button type="button" onClick={() => document.querySelector('.commerce-cms-editor input')?.focus()}>設定官網首頁</button>
        </div>
      )}

      <div className="commerce-cms-status">
        <div className="commerce-cms-status-card">
          <span>官網狀態</span>
          <strong>{settings.siteStatus === 'live' ? '已上線' : settings.siteStatus === 'paused' ? '暫停' : '草稿'}</strong>
          <small>最後更新：{settings.updatedAt || '尚未更新'}</small>
        </div>
        <div className="commerce-cms-status-card">
          <span>商品展示</span>
          <strong>{visibleProductCount} 件</strong>
          <small>主打商品：{featuredProducts.length} 件</small>
        </div>
        <div className="commerce-cms-status-card">
          <span>活動內容</span>
          <strong>{activePromotions.length} 則</strong>
          <small>首頁橫幅 / 跑馬燈 / 活動</small>
        </div>
      </div>

      <div className="commerce-site-grid">
        <form className="panel commerce-site-card commerce-cms-editor" onSubmit={saveSettings}>
          <div className="commerce-cms-head">
            <div>
              <h2>首頁內容設定</h2>
              <p>管理訪客第一眼看到的品牌名稱、主標、副標與公告文字。</p>
            </div>
            <div className="commerce-site-actions">
              <button disabled={saving}>儲存設定</button>
              <button type="button" className="link" onClick={() => setMessage('預覽會顯示在右側官網預覽卡。')}>預覽官方網站</button>
              <button type="button" onClick={publishSettings} disabled={saving}>發布更新</button>
            </div>
          </div>

          <div className="form commerce-cms-form">
            <label><span>品牌名稱</span><input value={settings.brandName || ''} onChange={(e) => setSettings({ ...settings, brandName: e.target.value })} /></label>
            <label><span>首頁主標題</span><input value={settings.heroTitle || ''} onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })} /></label>
            <label><span>首頁副標</span><input value={settings.heroSubtitle || ''} onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })} /></label>
            <label><span>跑馬燈 / 公告文字</span><input value={settings.announcementText || ''} onChange={(e) => setSettings({ ...settings, announcementText: e.target.value })} /></label>
          </div>

          <div className="commerce-cms-head compact">
            <div>
              <h2>品牌資訊</h2>
              <p>官方 LINE、聯絡方式與網站狀態。</p>
            </div>
          </div>
          <div className="form commerce-cms-form">
            <label><span>官方 LINE 連結</span><input value={settings.officialLineUrl || ''} onChange={(e) => setSettings({ ...settings, officialLineUrl: e.target.value })} /></label>
            <label><span>聯絡電話</span><input value={settings.contactPhone || ''} onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })} /></label>
            <label><span>聯絡電子信箱</span><input value={settings.contactEmail || ''} onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })} /></label>
            <label><span>網站狀態</span><select value={settings.siteStatus || 'draft'} onChange={(e) => setSettings({ ...settings, siteStatus: e.target.value })}><option value="draft">草稿</option><option value="live">已上線</option><option value="paused">暫停</option></select></label>
            <label><span>版型名稱</span><input value={settings.themeName || 'default'} onChange={(e) => setSettings({ ...settings, themeName: e.target.value })} /></label>
          </div>
        </form>

        <div className="panel commerce-site-preview">
          <span className="commerce-site-pill">{settings.siteStatus === 'live' ? '已上線' : settings.siteStatus === 'paused' ? '暫停' : '草稿'}</span>
          <h2>{settings.brandName || company.name}</h2>
          <h3>{settings.heroTitle}</h3>
          <p>{settings.heroSubtitle}</p>
          <div className="commerce-site-marquee">{settings.announcementText}</div>
          <h3>主打商品</h3>
          <div className="commerce-site-preview-products">
            {previewProducts.map((product) => (
              <div key={product.id}><strong>{product.name}</strong><span>{money(product.price)}</span></div>
            ))}
            {!products.length && <p>尚未新增商品。</p>}
          </div>
          <h3>目前啟用活動</h3>
          <ul>
            {activePromotions.map((promo) => <li key={promo.id}>{promo.title}</li>)}
            {!activePromotions.length && <li>尚無啟用活動。</li>}
          </ul>
        </div>
      </div>

      <div className="panel commerce-site-card">
        <div className="commerce-cms-head">
          <div>
            <h2>商品展示管理</h2>
            <p>設定商品名稱、分類、售價、主打商品、上架狀態與排序。</p>
          </div>
        </div>
        <form className="form" onSubmit={saveProduct}>
          <label><span>商品名稱</span><input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></label>
          <label><span>商品分類</span><input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} /></label>
          <label><span>商品價格</span><input type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></label>
          <label><span>原價</span><input type="number" value={productForm.originalPrice} onChange={(e) => setProductForm({ ...productForm, originalPrice: e.target.value })} /></label>
          <label>
            <span>圖片網址</span>
            <input
              value={productForm.imageUrl}
              placeholder="請貼上完整圖片網址，包含 https:// 開頭"
              onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
            />
          </label>
          <label><span>商品描述</span><input value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></label>
          <label><span>主打商品</span><select value={productForm.isFeatured} onChange={(e) => setProductForm({ ...productForm, isFeatured: e.target.value })}><option value="0">否</option><option value="1">是</option></select></label>
          <label><span>是否顯示</span><select value={productForm.isVisible} onChange={(e) => setProductForm({ ...productForm, isVisible: e.target.value })}><option value="1">顯示</option><option value="0">隱藏</option></select></label>
          <label><span>排序</span><input type="number" value={productForm.sortOrder} onChange={(e) => setProductForm({ ...productForm, sortOrder: e.target.value })} /></label>
          <button disabled={saving}>{editingProductId ? '儲存商品' : '新增商品'}</button>
          {editingProductId && <button type="button" className="link" onClick={() => { setEditingProductId(null); setProductForm({ ...emptyCommerceProduct, sortOrder: nextCommerceSortOrder(products) }); }}>取消編輯</button>}
        </form>

        <Table
          cols={['商品', '分類', '價格', '原價', '主打', '顯示', '排序', '操作']}
          rows={products.map((product) => [
            product.name,
            product.category || '-',
            money(product.price),
            money(product.originalPrice),
            product.isFeatured ? '是' : '否',
            product.isVisible ? '是' : '否',
            product.sortOrder,
            <div className="commerce-site-actions"><button type="button" onClick={() => editProduct(product)}>編輯</button><button type="button" className="lead-danger-btn" onClick={() => deleteProduct(product.id)}>刪除</button></div>
          ])}
        />
      </div>

      <div className="panel commerce-site-card">
        <div className="commerce-cms-head">
          <div>
            <h2>活動 / 跑馬燈管理</h2>
            <p>管理首頁橫幅、跑馬燈與活動訊息。</p>
          </div>
        </div>
        <form className="form" onSubmit={savePromotion}>
          <label><span>活動標題</span><input value={promotionForm.title} onChange={(e) => setPromotionForm({ ...promotionForm, title: e.target.value })} /></label>
          <label><span>活動描述</span><input value={promotionForm.description} onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })} /></label>
          <label><span>類型</span><select value={promotionForm.promoType} onChange={(e) => setPromotionForm({ ...promotionForm, promoType: e.target.value })}><option value="banner">首頁橫幅</option><option value="marquee">跑馬燈</option><option value="campaign">活動</option></select></label>
          <label><span>開始日期</span><input type="date" value={promotionForm.startDate} onChange={(e) => setPromotionForm({ ...promotionForm, startDate: e.target.value })} /></label>
          <label><span>結束日期</span><input type="date" value={promotionForm.endDate} onChange={(e) => setPromotionForm({ ...promotionForm, endDate: e.target.value })} /></label>
          <label><span>是否啟用</span><select value={promotionForm.isActive} onChange={(e) => setPromotionForm({ ...promotionForm, isActive: e.target.value })}><option value="1">啟用</option><option value="0">停用</option></select></label>
          <label><span>排序</span><input type="number" value={promotionForm.sortOrder} onChange={(e) => setPromotionForm({ ...promotionForm, sortOrder: e.target.value })} /></label>
          <button disabled={saving}>{editingPromotionId ? '儲存活動' : '新增活動'}</button>
          {editingPromotionId && <button type="button" className="link" onClick={() => { setEditingPromotionId(null); setPromotionForm({ ...emptyCommercePromotion, sortOrder: nextCommerceSortOrder(promotions) }); }}>取消編輯</button>}
        </form>

        <Table
          cols={['活動', '類型', '期間', '啟用', '排序', '操作']}
          rows={promotions.map((promotion) => [
            promotion.title,
            promotion.promoType === 'marquee' ? '跑馬燈' : promotion.promoType === 'campaign' ? '活動' : '首頁橫幅',
            `${promotion.startDate || '-'} ~ ${promotion.endDate || '-'}`,
            promotion.isActive ? '是' : '否',
            promotion.sortOrder,
            <div className="commerce-site-actions"><button type="button" onClick={() => editPromotion(promotion)}>編輯</button><button type="button" className="lead-danger-btn" onClick={() => deletePromotion(promotion.id)}>刪除</button></div>
          ])}
        />
      </div>
    </section>
  );
}

function FounderDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [dbHealth, setDbHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadFounderData() {
    try {
      setError('');
      const [analyticsData, healthData, backupRows] = await Promise.all([
        api('/founder/analytics'),
        api('/founder/db-health'),
        api('/founder/backups')
      ]);
      setAnalytics(analyticsData);
      setDbHealth(healthData);
      setBackups(Array.isArray(backupRows) ? backupRows : []);
    } catch (err) {
      setError(err.message || '讀取創辦人營運中心失敗');
    }
  }

  useEffect(() => {
    loadFounderData();
  }, []);

  async function createBackup() {
    try {
      setMessage('');
      setError('');
      const backup = await api('/founder/backup', { method: 'POST' });
      setMessage(`備份已建立：${backup.filename}`);
      await loadFounderData();
    } catch (err) {
      setError(err.message || '建立備份失敗');
    }
  }

  if (!analytics || !dbHealth) {
    return <div className="loading">讀取創辦人營運中心...</div>;
  }

  const sourceLabel = {
    line: 'LINE',
    official_website: '官方網站',
    facebook: 'Facebook',
    instagram: 'Instagram',
    google: 'Google',
    direct: 'Direct',
    referral: 'Referral',
    demo_link: '測試連結',
    unknown: 'Unknown'
  };

  return (
    <section className="founder-dashboard">
      <div className="founder-hero">
        <div>
          <p className="command-kicker">Founder Dashboard</p>
          <h1>創辦人營運中心</h1>
          <p>追蹤訪客、註冊、登入、活躍會員、來源轉換、資料庫健康與備份狀態。</p>
        </div>
        <button type="button" onClick={loadFounderData}>重新整理</button>
      </div>

      {message && <div className="admin-message">{message}</div>}
      {error && <div className="admin-error">{error}</div>}

      <div className="command-metrics">
        <Card title="總會員數" value={analytics.users.total} />
        <Card title="今日訪客" value={analytics.visitors.today} sub={`昨日 ${analytics.visitors.yesterday}`} />
        <Card title="今日註冊" value={analytics.users.today} sub={`本週 ${analytics.users.last7Days}`} />
        <Card title="今日登入" value={analytics.logins.today} sub={`本週 ${analytics.logins.last7Days}`} />
        <Card title="7日活躍會員" value={analytics.activeUsers.last7Days} />
        <Card title="30日活躍會員" value={analytics.activeUsers.last30Days} />
      </div>

      <div className="command-metrics">
        <Card title="7日訪客" value={analytics.visitors.last7Days} />
        <Card title="7日註冊" value={analytics.users.last7Days} />
        <Card title="7日登入" value={analytics.logins.last7Days} />
        <Card title="30日訪客" value={analytics.visitors.last30Days} />
        <Card title="30日註冊" value={analytics.users.last30Days} />
        <Card title="30日登入" value={analytics.logins.last30Days} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>流量來源</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>來源</th>
                  <th>訪客數</th>
                  <th>註冊數</th>
                  <th>登入數</th>
                  <th>註冊轉換率</th>
                  <th>登入轉換率</th>
                </tr>
              </thead>
              <tbody>
                {analytics.sources.map((row) => (
                  <tr key={row.source}>
                    <td>{sourceLabel[row.source] || row.source}</td>
                    <td>{row.visits}</td>
                    <td>{row.registers}</td>
                    <td>{row.logins}</td>
                    <td>{row.registerConversionRate}%</td>
                    <td>{row.loginConversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>漏斗分析</h2>
          <div className="founder-funnel">
            <div><span>訪客</span><strong>{analytics.funnel.visits}</strong></div>
            <div><span>註冊</span><strong>{analytics.funnel.registers}</strong></div>
            <div><span>登入</span><strong>{analytics.funnel.logins}</strong></div>
            <div><span>活躍</span><strong>{analytics.funnel.activeUsers}</strong></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>測試者名單</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>公司名稱</th>
                <th>電子信箱</th>
                <th>產業別</th>
                <th>註冊時間</th>
                <th>最後登入</th>
                <th>登入次數</th>
                <th>來源</th>
              </tr>
            </thead>
            <tbody>
              {analytics.testers.map((row) => (
                <tr key={row.id}>
                  <td>{row.companyName}</td>
                  <td>{row.email || '-'}</td>
                  <td>{getIndustryName(row.industry)}</td>
                  <td>{row.createdAt || '-'}</td>
                  <td>{row.lastLoginAt || '-'}</td>
                  <td>{row.loginCount || 0}</td>
                  <td>{sourceLabel[row.source] || row.source || '-'}</td>
                </tr>
              ))}
              {!analytics.testers.length && (
                <tr><td colSpan="7">目前沒有早期體驗使用者。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>DB Health</h2>
          <ul className="summary">
            <li>資料庫位置：{dbHealth.dbPath}</li>
            <li>資料庫模式：{dbHealth.provider || 'sqlite'}</li>
            <li>資料儲存：{dbHealth.storage || (dbHealth.isPersistentPath ? 'persistent-disk' : 'sqlite')}</li>
            <li>PostgreSQL：{dbHealth.provider === 'postgresql' ? '已啟用' : (dbHealth.postgres?.checked ? dbHealth.postgres.message : '未啟用')}</li>
            <li>資料庫大小：{dbHealth.dbSizeMB} MB</li>
            <li>儲存狀態：{dbHealth.storage === 'postgresql' ? 'PostgreSQL' : (dbHealth.isPersistentPath ? 'Persistent Disk' : 'SQLite')}</li>
            <li>Render 環境：{dbHealth.renderEnvironment}</li>
            <li>會員數：{dbHealth.usersCount}</li>
            <li>案場數：{dbHealth.jobSitesCount}</li>
            <li>收款紀錄：{dbHealth.paymentsCount}</li>
            <li>最後註冊：{dbHealth.lastUserCreatedAt || '-'}</li>
            {dbHealth.warning && <li className="danger-text">{dbHealth.warning}</li>}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-heading-row">
            <h2>備份中心</h2>
            <button type="button" onClick={createBackup}>建立備份</button>
          </div>
          <ul className="summary">
            <li>備份數量：{dbHealth.backupCount}</li>
            <li>最後備份：{dbHealth.lastBackupAt || '-'}</li>
          </ul>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>檔名</th>
                  <th>大小</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {backups.slice(0, 8).map((row) => (
                  <tr key={row.filename}>
                    <td>{row.filename}</td>
                    <td>{row.sizeMB} MB</td>
                    <td>{row.createdAt}</td>
                  </tr>
                ))}
                {!backups.length && <tr><td colSpan="3">目前尚無備份。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>異常提醒</h2>
        <ul className="summary">
          {analytics.alerts.map((alert) => <li key={alert}>{alert}</li>)}
          {!analytics.alerts.length && <li>目前沒有異常提醒。</li>}
        </ul>
      </div>
    </section>
  );
}

function AdminConsole() {
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [settings, setSettings] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [billingForm, setBillingForm] = useState({});
  const [websiteForm, setWebsiteForm] = useState({});
  const [testerForm, setTesterForm] = useState({});
  const [settingsForm, setSettingsForm] = useState({});
  const [feedbacks, setFeedbacks] = useState([]);
  const [reviewUsers, setReviewUsers] = useState([]);
  const [featureCatalog, setFeatureCatalog] = useState([]);
  const [featureForm, setFeatureForm] = useState({});
  const [featureNote, setFeatureNote] = useState('');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('all');
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState('pending_review');
  const [memberPlanForm, setMemberPlanForm] = useState({});
  const [memberProductLineForm, setMemberProductLineForm] = useState({});
  const [demoResult, setDemoResult] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAdmin() {
    try {
      setError('');
      const [companyRows, settingRows, feedbackRows, featureRows, reviewRows] = await Promise.all([
        api('/admin/companies'),
        api('/admin/settings'),
        api('/admin/feedbacks'),
        api('/admin/features/catalog'),
        api(`/admin/members?status=${memberStatusFilter}`)
      ]);
      setCompanies(companyRows || []);
      setSettings(settingRows || {});
      setSettingsForm(settingRows || {});
      setFeedbacks(feedbackRows || []);
      setFeatureCatalog(featureRows || []);
      setReviewUsers(reviewRows || []);
      setMemberPlanForm((old) => {
        const next = { ...old };
        (reviewRows || []).forEach((row) => {
          next[row.id] = next[row.id] || row.plan || 'trial';
        });
        return next;
      });
      setMemberProductLineForm((old) => {
        const next = { ...old };
        (reviewRows || []).forEach((row) => {
          next[row.id] = next[row.id] || row.product_line || 'general';
        });
        return next;
      });
      setSelectedId((old) => old || companyRows?.[0]?.id || null);
    } catch (err) {
      setError(err.message || '會員審核資料讀取失敗，請稍後再試或聯繫系統管理員。');
    }
  }

  async function reviewUser(userId, action, note = '') {
    try {
      setError('');
      setMessage('');
      const statusMap = {
        approve: 'approved',
        reject: 'rejected',
        suspend: 'suspended',
        restore: 'approved',
        demo: 'demo'
      };
      await api(`/admin/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          approval_status: statusMap[action] || action,
          plan: memberPlanForm[userId] || 'trial',
          product_line: memberProductLineForm[userId] || 'general',
          reviewNote: note
        })
      });
      setMessage('會員審核狀態已更新');
      await loadAdmin();
    } catch (err) {
      setError(err.message || '更新會員審核狀態失敗');
    }
  }

  useEffect(() => {
    loadAdmin();
  }, [memberStatusFilter]);

  const selected = companies.find((c) => c.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;

    setBillingForm({
      billing_status: selected.billing_status || 'trial',
      subscription_plan: selected.subscription_plan || 'engineering_trial',
      subscription_expires_at: selected.subscription_expires_at || '',
      is_paid_customer: selected.is_paid_customer ? '1' : '0',
      billing_note: selected.billing_note || ''
    });

    setWebsiteForm({
      has_official_site: selected.has_official_site ? '1' : '0',
      official_site_url: selected.official_site_url || '',
      official_site_status: selected.official_site_status || 'none',
      official_site_note: selected.official_site_note || ''
    });

    setTesterForm({
      is_tester: selected.is_tester ? '1' : '0',
      tester_started_at: selected.tester_started_at || '',
      tester_feedback_status: selected.tester_feedback_status || '尚未回饋',
      tester_note: selected.tester_note || ''
    });

    api(`/admin/companies/${selected.id}/features`)
      .then((data) => {
        const enabledSet = new Set(data?.effectiveFeatures || []);
        const next = {};
        (featureCatalog || []).forEach((item) => {
          next[item.key] = enabledSet.has(item.key);
        });
        setFeatureForm(next);
        setFeatureNote('');
      })
      .catch((err) => setError(err.message || '讀取功能授權失敗'));
  }, [selectedId, companies, featureCatalog]);

  const filteredCompanies = companies.filter((company) => {
    const statusMatched = statusFilter === 'all' || company.billing_status === statusFilter;
    const keywordMatched = !keyword.trim() || String(company.name || '').includes(keyword.trim());
    return statusMatched && keywordMatched;
  });

  const renewalDays = Number(settings.renewal_reminder_days || 7);
  const now = new Date();
  const soonLimit = new Date();
  soonLimit.setDate(soonLimit.getDate() + renewalDays);

  const metrics = {
    total: companies.length,
    trial: companies.filter((c) => c.billing_status === 'trial').length,
    active: companies.filter((c) => c.billing_status === 'active').length,
    expired: companies.filter((c) => c.billing_status === 'expired').length,
    paused: companies.filter((c) => c.billing_status === 'paused').length,
    website: companies.filter((c) => Number(c.has_official_site || 0) === 1).length,
    expiring: companies.filter((c) => {
      if (!c.subscription_expires_at) return false;
      const expires = new Date(c.subscription_expires_at);
      return expires >= now && expires <= soonLimit;
    }).length,
    testers: companies.filter((c) => Number(c.is_tester || 0) === 1).length,
    pendingReview: reviewUsers.filter((u) => (u.approval_status || u.status || u.review_status) === 'pending_review').length,
    freeBetaApproved: companies.filter((c) => Number(c.is_free_beta || 0) === 1 && ['approved', 'demo'].includes(c.beta_status || '')).length,
    newFeedbacks: feedbacks.filter((f) => f.status === 'new').length,
    mrr: companies.reduce((sum, c) => {
      if (!c.is_paid_customer || c.billing_status !== 'active') return sum;
      const map = {
        engineering_starter: 799,
        engineering_pro: 1999,
        engineering_premium: 3999
      };
      return sum + Number(map[c.subscription_plan] || 0);
    }, 0)
  };

  const productLineCounts = companies.reduce((acc, company) => {
    const key = company.product_line || 'general';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  async function saveBilling(e) {
    e.preventDefault();
    if (!selected) return;

    try {
      setMessage('');
      setError('');
      await api(`/admin/companies/${selected.id}/billing`, {
        method: 'PATCH',
        body: JSON.stringify(billingForm)
      });
      await loadAdmin();
      setMessage('收費狀態已更新');
    } catch (err) {
      setError(err.message || '更新收費狀態失敗');
    }
  }

  async function saveWebsite(e) {
    e.preventDefault();
    if (!selected) return;

    try {
      setMessage('');
      setError('');
      await api(`/admin/companies/${selected.id}/website`, {
        method: 'PATCH',
        body: JSON.stringify(websiteForm)
      });
      await loadAdmin();
      setMessage('網站狀態已更新');
    } catch (err) {
      setError(err.message || '更新網站狀態失敗');
    }
  }

  async function saveTester(e) {
    e.preventDefault();
    if (!selected) return;

    try {
      setMessage('');
      setError('');
      await api(`/admin/companies/${selected.id}/tester`, {
        method: 'PUT',
        body: JSON.stringify(testerForm)
      });
      await loadAdmin();
      setMessage('早期體驗狀態已更新');
    } catch (err) {
      setError(err.message || '更新早期體驗狀態失敗');
    }
  }

  async function saveFeatureAccess(e) {
    e.preventDefault();
    if (!selected) return;

    try {
      setMessage('');
      setError('');
      await api(`/admin/companies/${selected.id}/features`, {
        method: 'PUT',
        body: JSON.stringify({
          features: featureForm,
          note: featureNote || '系統管理員調整'
        })
      });
      await loadAdmin();
      setMessage('功能授權已更新');
    } catch (err) {
      setError(err.message || '更新功能授權失敗');
    }
  }

  async function saveSettings(e) {
    e.preventDefault();

    try {
      setMessage('');
      setError('');
      const updated = await api('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm)
      });
      setSettings(updated || {});
      setSettingsForm(updated || {});
      setMessage('平台設定已更新');
    } catch (err) {
      setError(err.message || '更新平台設定失敗');
    }
  }

  async function prepareDemoEngineering() {
    try {
      setDemoLoading(true);
      setDemoResult(null);
      setMessage('');
      setError('');
      const result = await api('/admin/demo/engineering', {
        method: 'POST'
      });
      setDemoResult(result.demo || null);
      await loadAdmin();
      setMessage('工程測試資料已建立或更新');
    } catch (err) {
      setError(err.message || '建立工程測試資料失敗');
    } finally {
      setDemoLoading(false);
    }
  }

  async function updateFeedback(row, patch) {
    try {
      setMessage('');
      setError('');
      const updated = await api(`/admin/feedbacks/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: patch.status ?? row.status,
          admin_note: patch.adminNote ?? row.adminNote ?? ''
        })
      });
      setFeedbacks((items) => items.map((item) => item.id === updated.id ? updated : item));
      setMessage('回饋狀態已更新');
    } catch (err) {
      setError(err.message || '更新回饋失敗');
    }
  }

  const filteredFeedbacks = feedbacks.filter((row) => {
    const statusMatched = feedbackStatusFilter === 'all' || row.status === feedbackStatusFilter;
    const categoryMatched = feedbackCategoryFilter === 'all' || row.category === feedbackCategoryFilter;
    return statusMatched && categoryMatched;
  });

  return (
    <section className="admin-console">
      <div className="admin-space-bg" />

      <div className="admin-cockpit">
        <div className="admin-hero">
          <div>
            <div className="admin-pill">BookAI 營運後台</div>
            <h1>系統管理中心</h1>
            <p>管理客戶、方案、網站與平台設定的企業管理平台。</p>
          </div>
          <div className="admin-orbit">
            <span className="admin-status-light active" />
            <strong>系統狀態正常</strong>
          </div>
        </div>

        {message && <div className="admin-message">{message}</div>}
        {error && <div className="admin-error">{error}</div>}

        <div className="admin-control-panel">
          <div className="admin-panel-head">
            <div>
              <h2>會員審核中心</h2>
              <p>審核新申請的企業使用者，控管測試期准入品質與資料安全。</p>
            </div>
            <div className="inline-actions">
              <select value={memberStatusFilter} onChange={(e) => setMemberStatusFilter(e.target.value)}>
                <option value="pending_review">等待審核</option>
                <option value="approved">已通過</option>
                <option value="rejected">已拒絕</option>
                <option value="suspended">已暫停</option>
                <option value="demo">試營運展示</option>
                <option value="all">全部</option>
              </select>
              <button type="button" onClick={loadAdmin}>重新整理</button>
            </div>
          </div>
          <div className="admin-beta-summary">
            <div>
              <span>BookAI 試營運</span>
              <strong>{metrics.freeBetaApproved} 人</strong>
              <small>目前已通過測試者</small>
            </div>
            <div>
              <span>第一階段觀察目標</span>
              <strong>20 人</strong>
              <small>營運觀察目標，不作為審核限制</small>
            </div>
            <div>
              <span>待審核</span>
              <strong>{metrics.pendingReview}</strong>
              <small>等待官方審核</small>
            </div>
            <div>
              <span>各行業測試者分布</span>
              <small>{Object.entries(productLineCounts).map(([key, count]) => `${productLineLabels[key] || key} ${count}`).join(' / ') || '尚無資料'}</small>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-customer-table">
              <thead>
                <tr>
                  <th>申請時間</th>
                  <th>電子信箱</th>
                  <th>公司 / 品牌</th>
                  <th>聯絡人</th>
                  <th>電話</th>
                  <th>LINE</th>
                  <th>統編</th>
                  <th>階段</th>
                  <th>行業版本</th>
                  <th>目前產品線</th>
                  <th>設定產品線</th>
                  <th>會員狀態</th>
                  <th>測試狀態</th>
                  <th>免費測試</th>
                  <th>方案狀態</th>
                  <th>設定方案</th>
                  <th>條款版本</th>
                  <th>同意時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reviewUsers.slice(0, 40).map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{row.email}</td>
                    <td>{row.company_name || '-'}</td>
                    <td>{row.company_contact_name || row.contact_name || row.name || '-'}</td>
                    <td>{row.company_phone || row.phone || '-'}</td>
                    <td>{row.company_line_contact || row.line_contact || '-'}</td>
                    <td>{row.tax_id || row.user_tax_id || '未提供'}</td>
                    <td>{row.company_company_stage || row.company_stage || '-'}</td>
                    <td>{getIndustryName(row.industry)}</td>
                    <td>{productLineLabels[row.product_line] || row.product_line || '一般中小企業版'}</td>
                    <td>
                      <select
                        value={memberProductLineForm[row.id] || row.product_line || 'general'}
                        onChange={(e) => setMemberProductLineForm({ ...memberProductLineForm, [row.id]: e.target.value })}
                      >
                        {Object.entries(productLineLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td><span className="admin-pill">{getReviewStatusLabel(row.approval_status || row.status || row.review_status || 'pending_review')}</span></td>
                    <td>{getBetaStatusLabel(row.beta_status)}</td>
                    <td>{Number(row.is_free_beta || 0) === 1 ? '是' : '否'}</td>
                    <td>{getPlanDisplayLabel(row.plan || 'trial')}</td>
                    <td>
                      <select
                        value={memberPlanForm[row.id] || row.plan || 'trial'}
                        onChange={(e) => setMemberPlanForm({ ...memberPlanForm, [row.id]: e.target.value })}
                      >
                        <option value="trial">試營運</option>
                        <option value="starter">入門版</option>
                        <option value="pro">專業版</option>
                        <option value="enterprise">企業版</option>
                        <option value="custom">客製方案</option>
                      </select>
                    </td>
                    <td>{row.terms_version || '-'}</td>
                    <td>{formatDate(row.terms_accepted_at)}</td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" onClick={() => reviewUser(row.id, 'approve')}>通過免費測試</button>
                        <button type="button" onClick={() => reviewUser(row.id, 'reject', '未通過審核')}>拒絕申請</button>
                        <button type="button" onClick={() => reviewUser(row.id, 'suspend', '暫停使用')}>停權帳號</button>
                        <button type="button" onClick={() => reviewUser(row.id, 'restore')}>恢復帳號</button>
                        <button type="button" onClick={() => reviewUser(row.id, 'demo')}>設為展示帳號</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!reviewUsers.length && (
                  <tr><td colSpan="19">目前沒有會員申請資料。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-control-panel">
          <div className="admin-panel-head">
            <div>
              <h2>測試資料工具</h2>
              <p>在線上環境建立工程業測試資料，僅供系統管理員驗收與展示使用。</p>
            </div>
            <button type="button" onClick={prepareDemoEngineering} disabled={demoLoading}>
              {demoLoading ? '建立中...' : '建立 / 更新工程測試資料'}
            </button>
          </div>

          {demoResult && (
            <div className="admin-detail-list">
              <p><span>電子信箱</span><strong>{demoResult.email}</strong></p>
              <p><span>登入密碼</span><strong>{demoResult.password}</strong></p>
              <p><span>公司編號</span><strong>#{demoResult.companyId}</strong></p>
              <p><span>公司名稱</span><strong>{demoResult.companyName}</strong></p>
            </div>
          )}
        </div>

        <div className="admin-command-grid">
          <div className="admin-metric-card"><span>總客戶數</span><strong>{metrics.total}</strong></div>
          <div className="admin-metric-card"><span>試用中</span><strong>{metrics.trial}</strong></div>
          <div className="admin-metric-card"><span>正式使用中</span><strong>{metrics.active}</strong></div>
          <div className="admin-metric-card"><span>已到期</span><strong>{metrics.expired}</strong></div>
          <div className="admin-metric-card"><span>暫停使用</span><strong>{metrics.paused}</strong></div>
          <div className="admin-metric-card"><span>有官方網站客戶</span><strong>{metrics.website}</strong></div>
          <div className="admin-metric-card"><span>即將到期客戶</span><strong>{metrics.expiring}</strong></div>
          <div className="admin-metric-card"><span>早期體驗使用者</span><strong>{metrics.testers}</strong></div>
          <div className="admin-metric-card"><span>待審會員</span><strong>{metrics.pendingReview}</strong></div>
          <div className="admin-metric-card"><span>新回饋</span><strong>{metrics.newFeedbacks}</strong></div>
          <div className="admin-metric-card gold"><span>本月預估月收</span><strong>{money(metrics.mrr)}</strong></div>
        </div>

        <div className="admin-grid">
          <div className="admin-control-panel">
            <div className="admin-panel-head">
              <div>
                <h2>客戶管理</h2>
                <p>依公司、收費狀態與網站狀態追蹤客戶。</p>
              </div>
              <button type="button" onClick={loadAdmin}>重新同步</button>
            </div>

            <div className="admin-toolbar">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋公司名稱"
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">全部狀態</option>
                <option value="trial">試用中</option>
                <option value="active">正式使用中</option>
                <option value="expired">已到期</option>
                <option value="paused">暫停使用</option>
              </select>
            </div>

            <div className="admin-customer-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>公司</th>
                    <th>方案</th>
                    <th>狀態</th>
                    <th>到期日</th>
                    <th>早期體驗</th>
                    <th>網站</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((company) => (
                    <tr
                      key={company.id}
                      className={selectedId === company.id ? 'selected' : ''}
                      onClick={() => setSelectedId(company.id)}
                    >
                      <td>#{company.id}</td>
                      <td>
                        <strong>{company.name}</strong>
                        <small>{company.owner_email || '未設定 owner email'}</small>
                      </td>
                      <td>{getSubscriptionPlanLabel(company.subscription_plan)}</td>
                      <td>
                        <span className={`admin-status-dot ${company.billing_status || 'trial'}`} />
                        {getAdminBillingStatusLabel(company.billing_status)}
                      </td>
                      <td>{company.subscription_expires_at || '未設定'}</td>
                      <td>{Number(company.is_tester || 0) === 1 ? '是' : '否'}</td>
                      <td>{getOfficialSiteStatusLabel(company.official_site_status)}</td>
                    </tr>
                  ))}
                  {!filteredCompanies.length && (
                    <tr>
                      <td colSpan="7">目前沒有符合條件的公司。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-drawer">
            <div className="admin-glow-card">
              <h2>客戶詳細資料</h2>
              {selected ? (
                <>
                  <div className="admin-detail-list">
                    <p><span>公司 ID</span><strong>#{selected.id}</strong></p>
                    <p><span>公司名稱</span><strong>{selected.name}</strong></p>
                    <p><span>行業別</span><strong>{getIndustryName(selected.industry)}</strong></p>
                    <p><span>產品線</span><strong>{productLineLabels[selected.product_line] || selected.product_line || '一般中小企業版'}</strong></p>
                    <p><span>測試狀態</span><strong>{getBetaStatusLabel(selected.beta_status)}</strong></p>
                    <p><span>免費試營運</span><strong>{Number(selected.is_free_beta || 0) === 1 ? '是' : '否'}</strong></p>
                    <p><span>測試群組</span><strong>{getReviewStatusLabel(selected.beta_group || 'closed_beta')}</strong></p>
                    <p><span>測試核准時間</span><strong>{selected.beta_approved_at || '未設定'}</strong></p>
                    <p><span>是否正式客戶</span><strong>{yesNoPaid(selected.is_paid_customer)}</strong></p>
                    <p><span>早期體驗使用者</span><strong>{Number(selected.is_tester || 0) === 1 ? '是' : '否'}</strong></p>
                    <p><span>使用回饋狀態</span><strong>{selected.tester_feedback_status || '尚未回饋'}</strong></p>
                    <p><span>官方網站網址</span><strong>{selected.official_site_url || '未設定'}</strong></p>
                    <p><span>管理備註</span><strong>{selected.billing_note || '無'}</strong></p>
                  </div>

                  <form className="admin-settings-panel" onSubmit={saveBilling}>
                    <h3>方案 / 收費管理</h3>
                    <label>
                      <span>使用狀態</span>
                      <select value={billingForm.billing_status || 'trial'} onChange={(e) => setBillingForm({ ...billingForm, billing_status: e.target.value })}>
                        <option value="trial">試用中</option>
                        <option value="active">正式使用中</option>
                        <option value="expired">已到期</option>
                        <option value="paused">暫停使用</option>
                      </select>
                    </label>
                    <label>
                      <span>方案</span>
                      <input value={billingForm.subscription_plan || ''} onChange={(e) => setBillingForm({ ...billingForm, subscription_plan: e.target.value })} />
                    </label>
                    <label>
                      <span>到期日</span>
                      <input value={billingForm.subscription_expires_at || ''} onChange={(e) => setBillingForm({ ...billingForm, subscription_expires_at: e.target.value })} placeholder="YYYY-MM-DD" />
                    </label>
                    <label>
                      <span>正式客戶</span>
                      <select value={billingForm.is_paid_customer || '0'} onChange={(e) => setBillingForm({ ...billingForm, is_paid_customer: e.target.value })}>
                        <option value="0">否</option>
                        <option value="1">是</option>
                      </select>
                    </label>
                    <label>
                      <span>管理備註</span>
                      <input value={billingForm.billing_note || ''} onChange={(e) => setBillingForm({ ...billingForm, billing_note: e.target.value })} />
                    </label>
                    <button>儲存收費狀態</button>
                  </form>

                  <form className="admin-settings-panel" onSubmit={saveTester}>
                    <h3>早期體驗管理</h3>
                    <label>
                      <span>早期體驗使用者</span>
                      <select value={testerForm.is_tester || '0'} onChange={(e) => setTesterForm({ ...testerForm, is_tester: e.target.value })}>
                        <option value="0">否</option>
                        <option value="1">是</option>
                      </select>
                    </label>
                    <label>
                      <span>體驗開始日</span>
                      <input value={testerForm.tester_started_at || ''} onChange={(e) => setTesterForm({ ...testerForm, tester_started_at: e.target.value })} placeholder="YYYY-MM-DD" />
                    </label>
                    <label>
                      <span>回饋狀態</span>
                      <select value={testerForm.tester_feedback_status || '尚未回饋'} onChange={(e) => setTesterForm({ ...testerForm, tester_feedback_status: e.target.value })}>
                        <option>尚未回饋</option>
                        <option>已回饋</option>
                        <option>需追蹤</option>
                        <option>已完成測試</option>
                      </select>
                    </label>
                    <label>
                      <span>內部備註</span>
                      <input value={testerForm.tester_note || ''} onChange={(e) => setTesterForm({ ...testerForm, tester_note: e.target.value })} />
                    </label>
                    <button>儲存早期體驗狀態</button>
                  </form>

                  <form className="admin-settings-panel" onSubmit={saveFeatureAccess}>
                    <h3>功能授權管理</h3>
                    <p className="admin-form-note">針對這家公司快速調整可使用功能。關閉後，使用者側邊欄會隱藏該功能，後端進階功能檢查也會套用有效授權。</p>
                    <div className="admin-feature-grid">
                      {Object.entries(
                        (featureCatalog || []).reduce((groups, item) => {
                          const group = item.group || '其他';
                          groups[group] = groups[group] || [];
                          groups[group].push(item);
                          return groups;
                        }, {})
                      ).map(([group, items]) => (
                        <div className="admin-feature-group" key={group}>
                          <strong>{group}</strong>
                          {items.map((item) => (
                            <label key={item.key} className="admin-feature-toggle">
                              <input
                                type="checkbox"
                                checked={featureForm[item.key] !== false}
                                onChange={(e) => setFeatureForm({ ...featureForm, [item.key]: e.target.checked })}
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <label>
                      <span>調整備註</span>
                      <input value={featureNote} onChange={(e) => setFeatureNote(e.target.value)} placeholder="例：早期體驗開通工程模組" />
                    </label>
                    <button>儲存功能授權</button>
                  </form>

                  <form className="admin-settings-panel" onSubmit={saveWebsite}>
                    <h3>客戶網站狀態</h3>
                    <label>
                      <span>是否有官方網站</span>
                      <select value={websiteForm.has_official_site || '0'} onChange={(e) => setWebsiteForm({ ...websiteForm, has_official_site: e.target.value })}>
                        <option value="0">否</option>
                        <option value="1">是</option>
                      </select>
                    </label>
                    <label>
                      <span>網站網址</span>
                      <input value={websiteForm.official_site_url || ''} onChange={(e) => setWebsiteForm({ ...websiteForm, official_site_url: e.target.value })} />
                    </label>
                    <label>
                      <span>網站狀態</span>
                      <select value={websiteForm.official_site_status || 'none'} onChange={(e) => setWebsiteForm({ ...websiteForm, official_site_status: e.target.value })}>
                        <option value="none">未建立</option>
                        <option value="planning">規劃中</option>
                        <option value="building">製作中</option>
                        <option value="live">已上線</option>
                        <option value="paused">暫停</option>
                      </select>
                    </label>
                    <label>
                      <span>網站備註</span>
                      <input value={websiteForm.official_site_note || ''} onChange={(e) => setWebsiteForm({ ...websiteForm, official_site_note: e.target.value })} />
                    </label>
                    <button>儲存網站狀態</button>
                  </form>
                </>
              ) : (
                <p>請先選擇一家公司。</p>
              )}
            </div>
          </div>
        </div>

        <div className="admin-control-panel">
          <div className="admin-panel-head">
            <div>
              <h2>產品回饋管理</h2>
              <p>查看所有公司送出的產品回饋，並標記處理狀態與內部備註。</p>
            </div>
          </div>

          <div className="admin-toolbar">
            <select value={feedbackStatusFilter} onChange={(e) => setFeedbackStatusFilter(e.target.value)}>
              <option value="all">全部狀態</option>
              <option value="new">新回饋</option>
              <option value="reviewing">處理中</option>
              <option value="resolved">已處理</option>
              <option value="ignored">暫不處理</option>
            </select>
            <select value={feedbackCategoryFilter} onChange={(e) => setFeedbackCategoryFilter(e.target.value)}>
              <option value="all">全部類別</option>
              <option value="操作卡住">操作卡住</option>
              <option value="按鈕無反應">按鈕無反應</option>
              <option value="金額 / 報表異常">金額 / 報表異常</option>
              <option value="畫面顯示問題">畫面顯示問題</option>
              <option value="資料沒有儲存">資料沒有儲存</option>
              <option value="建議新增功能">建議新增功能</option>
              <option value="操作問題">操作問題</option>
              <option value="介面建議">介面建議</option>
              <option value="功能需求">功能需求</option>
              <option value="錯誤回報">錯誤回報</option>
              <option value="其他">其他</option>
            </select>
          </div>

          <div className="admin-customer-table">
            <table>
              <thead>
                <tr>
                  <th>公司</th>
                  <th>使用者</th>
                  <th>類別</th>
                  <th>評分</th>
                  <th>內容</th>
                  <th>狀態</th>
                  <th>管理備註</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeedbacks.map((row) => (
                  <tr key={row.id}>
                    <td>{row.companyName || '-'}</td>
                    <td>
                      <strong>{row.userName || '-'}</strong>
                      <small>{row.userEmail || ''}</small>
                    </td>
                    <td>{row.category}</td>
                    <td>{row.rating} / 5</td>
                    <td className="admin-feedback-message">{row.message}</td>
                    <td>
                      <select value={row.status || 'new'} onChange={(e) => updateFeedback(row, { status: e.target.value })}>
                        <option value="new">新回饋</option>
                        <option value="reviewing">處理中</option>
                        <option value="resolved">已處理</option>
                        <option value="ignored">暫不處理</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.adminNote || ''}
                        onChange={(e) => setFeedbacks((items) => items.map((item) => item.id === row.id ? { ...item, adminNote: e.target.value } : item))}
                        onBlur={(e) => updateFeedback(row, { adminNote: e.target.value })}
                        placeholder="內部備註"
                      />
                    </td>
                    <td>{row.createdAt || '-'}</td>
                  </tr>
                ))}
                {!filteredFeedbacks.length && (
                  <tr>
                    <td colSpan="8">目前沒有符合條件的回饋。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form className="admin-control-panel admin-platform-settings" onSubmit={saveSettings}>
          <div className="admin-panel-head">
            <div>
              <h2>平台設定</h2>
              <p>這裡保存平台設定，後續可串到官網與營運流程。</p>
            </div>
          </div>

          <div className="admin-settings-grid">
            <label>
              <span>官方網站網址</span>
              <input value={settingsForm.official_site_url || ''} onChange={(e) => setSettingsForm({ ...settingsForm, official_site_url: e.target.value })} />
            </label>
            <label>
              <span>官方 LINE 連結</span>
              <input value={settingsForm.official_line_url || ''} onChange={(e) => setSettingsForm({ ...settingsForm, official_line_url: e.target.value })} />
            </label>
            <label>
              <span>預設試用天數</span>
              <input value={settingsForm.default_trial_days || ''} onChange={(e) => setSettingsForm({ ...settingsForm, default_trial_days: e.target.value })} />
            </label>
            <label>
              <span>到期提醒天數</span>
              <input value={settingsForm.renewal_reminder_days || ''} onChange={(e) => setSettingsForm({ ...settingsForm, renewal_reminder_days: e.target.value })} />
            </label>
            <label>
              <span>啟用官網後台功能</span>
              <select value={settingsForm.enable_website_backend || 'true'} onChange={(e) => setSettingsForm({ ...settingsForm, enable_website_backend: e.target.value })}>
                <option value="true">啟用</option>
                <option value="false">停用</option>
              </select>
            </label>
            <label>
              <span>系統公告</span>
              <input value={settingsForm.system_announcement || ''} onChange={(e) => setSettingsForm({ ...settingsForm, system_announcement: e.target.value })} />
            </label>
          </div>

          <button>儲存平台設定</button>
        </form>
      </div>
    </section>
  );
}

function Settings({ company }) {
  return (
    <section>
      <Title title="公司設定" desc="公司基本資料、行業別與早期體驗狀態。" />
      <div className="panel">
        <h2>{company.name}</h2>
        <p>帳號狀態：已依 BookAI 核准範圍開放功能</p>
        <p>產業：{getIndustryName(company.industry)}</p>
        <p>產品線：{productLineLabels[company.product_line] || '一般中小企業版'}</p>
        <p>統編：{company.tax_id || '未設定'}</p>
        <p>公司 / 營業地址：{company.address || company.company_address || '未設定'}</p>
      </div>

      <div className="panel">
        <h2>早期體驗</h2>
        <p>目前階段：{getBetaStatusLabel(company.beta_status) === '未設定' ? '已開通使用' : getBetaStatusLabel(company.beta_status)}</p>
        <p>測試群組：{getReviewStatusLabel(company.beta_group || 'closed_beta')}</p>
        <p>注意事項：早期體驗期間功能與開放範圍可能依產品測試安排調整。</p>
      </div>
    </section>
  );
}

function Locked({ feature }) {
  return (
    <div className="app">
      <main className="locked">
        <h1>此功能尚未開放</h1>
        <p>你正在開啟的功能：{feature}</p>
        <p>此功能尚未包含在目前公司開放範圍，請聯絡 BookAI 官方確認開通狀態。</p>
      </main>
    </div>
  );
}

function Title({ title, desc }) {
  return (
    <div className="title">
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  );
}

function Form({ children, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit || ((e) => e.preventDefault())}>
      {children}
    </form>
  );
}

function Table({ cols, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: 'center' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={{ verticalAlign: 'middle' }}>{c}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length}>尚無資料</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
