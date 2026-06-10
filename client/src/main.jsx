
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Building2,
  FileText,
  Layers,
  LogOut,
  Package,
  PlugZap,
  ReceiptText,
  ShieldCheck,
  Users,
  WalletCards
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis
} from 'recharts';
import { api, setToken, clearToken, getToken } from './lib/api';
import './styles.css';
import LeadCenterMock from './components/LeadCenterMock.jsx';

const planNames = {
  business: 'Business',
  pro: 'Pro',
  accountant: 'Accountant'
};

const featureByPage = {
  accounting: 'accounting_engine',
  tax: 'tax_center',
  accountant: 'accountant_console'
};

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

const navs = {
  business: [
    ['dashboard', '老闆總覽', BarChart3],
    ['transactions', '交易中心', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['inventory', '商品 / 材料庫存', Package],
    ['integrations', '平台串接', PlugZap],
    ['reports', '月報表', BarChart3],
    ['settings', '公司設定', Building2]
  ],
  pro: [
    ['dashboard', '老闆總覽', BarChart3],
    ['transactions', '交易中心', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['accounting', '會計中心', Layers],
    ['tax', '稅務中心', ShieldCheck],
    ['inventory', '商品 / 材料庫存', Package],
    ['integrations', '平台串接', PlugZap],
    ['reports', '進階報表', BarChart3],
    ['settings', '公司設定', Building2]
  ],
  accountant: [
    ['dashboard', '事務所儀表板', BarChart3],
    ['accountant', '客戶管理', Users],
    ['vouchers', '憑證審核', ReceiptText],
    ['invoices', '發票整理', FileText],
    ['reports', '批次報表', BarChart3],
    ['tax', '稅務準備', ShieldCheck],
    ['settings', '事務所設定', Building2]
  ]
};

function getPlatformName(key) {
  return platformLabel[key] || key || '未分類平台';
}

function getIndustryName(key) {
  return industryOptions[key] || key || '未設定行業';
}

function rate(part, total) {
  if (!total) return '0%';
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 1000) / 10}%`;
}

function money(n) {
  return `NT$ ${Number(n || 0).toLocaleString()}`;
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
    paused: '暫停使用'
  };

  return map[status] || '未設定';
}

function getSubscriptionPlanLabel(plan) {
  const map = {
    engineering_trial: '工程業試用版',
    engineering_starter: '工程業入門版',
    engineering_pro: '工程業專業版',
    engineering_premium: '工程業進階版'
  };

  return map[plan] || plan || '未設定';
}

function yesNoPaid(value) {
  return value === 1 || value === true ? '是' : '否';
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

  if (!tokenReady) {
    return <Auth onAuth={() => setTokenReady(true)} />;
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
    email: 'demo@bookai.com.tw',
    password: 'demo123456',
    companyName: '珍珠奶茶王國有限公司',
    taxId: '',
    companyAddress: '',
    industry: 'beverage',
    plan: 'pro'
  });

  async function submit(e) {
    e.preventDefault();
    setErr('');

    try {
      const data = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setToken(data.token);
      onAuth();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo">BookAI</div>
        <h1>{mode === 'login' ? '登入 BookAI' : '建立 BookAI 帳號'}</h1>
        <p>台灣中小企業 Commerce ERP OS</p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>
                <span>使用者姓名</span>
                <input
                  placeholder="例：王小明"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>

              <label>
                <span>公司 / 商號 / 企業社名稱</span>
                <input
                  placeholder="例：珍珠奶茶王國有限公司"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </label>

              <label>
                <span>統一編號</span>
                <input
                  placeholder="例：12345678，尚未設立可先空白"
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                />
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
                <span>使用方案</span>
                <select
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                >
                  <option value="business">Business 封閉測試</option>
                  <option value="pro">Pro 封閉測試</option>
                  <option value="accountant">Accountant 封閉測試</option>
                </select>
              </label>
            </>
          )}

          <label>
            <span>Email</span>
            <input
              placeholder="例：demo@bookai.com.tw"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              placeholder="請輸入密碼"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          {err && <div className="error">{err}</div>}

          <button>{mode === 'login' ? '登入' : '註冊'}</button>
        </form>

        <button
          className="link"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '建立新帳號' : '已有帳號，返回登入'}
        </button>

        <div className="hint">Demo：demo@bookai.com.tw / demo123456</div>
      </div>
    </div>
  );
}

function Shell({ onLogout }) {
  const [me, setMe] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [companyId, setCompanyId] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api('/me')
      .then((d) => {
        setMe(d);
        setCompanyId(d.companies[0]?.id);
      })
      .catch(onLogout);
  }, [onLogout]);

  const company = me?.companies?.find((c) => c.id === companyId);
  const plan = company?.plan || 'business';
  const baseNav = navs[plan] || navs.business;
  const constructionNav = [
    ['dashboard', '老闆總覽', BarChart3],
    ['leads', '接案中心', FileText],
    ['transactions', '交易中心', WalletCards],
    ['invoices', '發票中心', FileText],
    ['vouchers', '電子憑證', ReceiptText],
    ['inventory', '材料 / 工具庫存 ERP', Package],
    ['jobsites', '案場工作台', Building2],
    ['reports', '工程月報', BarChart3],
    ['settings', '公司設定', Building2]
  ];
  const planNav = isConstructionIndustry(company?.industry)
    ? constructionNav
    : baseNav;

if (!me || !company) {
    return <div className="loading">載入中...</div>;
  }

  const lockedFeature = featureByPage[page];

  if (lockedFeature && !me.plans[plan].features.includes(lockedFeature)) {
    return <Locked feature={lockedFeature} />;
  }

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="mark">B</div>
          <div>
            <b>BookAI</b>
            <span>封閉測試中</span>
          </div>
        </div>

        <select
          className="company-select"
          value={companyId}
          onChange={(e) => setCompanyId(Number(e.target.value))}
        >
          {me.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <nav>
          {planNav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <button className="logout" onClick={onLogout}>
          <LogOut size={18} />
          登出
        </button>
      </aside>

      <main>
        <Header
          company={company}
          onPlanChange={(p) => {
            api(`/companies/${companyId}/plan`, {
              method: 'PATCH',
              body: JSON.stringify({ plan: p })
            }).then(() => location.reload());
          }}
        />

        {page === 'dashboard' && <Dashboard companyId={companyId} refresh={refresh} company={company} onNavigate={setPage} />}
        {page === 'leads' && <LeadCenterMock companyId={companyId} />}
        {page === 'transactions' && <Transactions companyId={companyId} />}
        {page === 'integrations' && (
          <Integrations
            companyId={companyId}
            company={company}
            onSync={() => setRefresh((x) => x + 1)}
          />
        )}
        {page === 'invoices' && <Invoices companyId={companyId} />}
        {page === 'inventory' && <Inventory companyId={companyId} company={company} />}
        {page === 'jobsites' && <JobSites companyId={companyId} company={company} />}
        {page === 'vouchers' && <Vouchers companyId={companyId} />}
        {page === 'accounting' && <Accounting companyId={companyId} />}
        {page === 'tax' && <Tax companyId={companyId} />}
        {page === 'accountant' && <Accountant companyId={companyId} />}
        {page === 'reports' && <Reports companyId={companyId} company={company} />}
        {page === 'settings' && <Settings company={company} />}
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

      <select value={company.plan} onChange={(e) => onPlanChange(e.target.value)}>
        <option value="business">Business 封閉測試</option>
        <option value="pro">Pro 封閉測試</option>
        <option value="accountant">Accountant 封閉測試</option>
      </select>
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

function Dashboard({ companyId, refresh, company, onNavigate }) {
  const [s, setS] = useState(null);
  const [jobSites, setJobSites] = useState([]);
  const industry = company?.industry;
  const constructionMode = isConstructionIndustry(industry);

  useEffect(() => {
    let alive = true;

    Promise.all([
      api(`/companies/${companyId}/summary`).catch(() => null),
      constructionMode
        ? api(`/companies/${companyId}/jobsites`).catch(() => [])
        : Promise.resolve([])
    ]).then(([summary, sites]) => {
      if (!alive) return;
      setS(summary);
      setJobSites(Array.isArray(sites) ? sites : []);
    });

    return () => {
      alive = false;
    };
  }, [companyId, refresh, constructionMode]);

  if (!s) return null;

  const constructionStats = (() => {
    const sites = jobSites || [];

    const totalQuote = sites.reduce((sum, site) => sum + Number(site.quote_amount ?? site.quoteAmount ?? 0), 0);
    const received = sites.reduce((sum, site) => sum + Number(site.received_amount ?? site.receivedAmount ?? 0), 0);
    const unpaid = Math.max(totalQuote - received, 0);

    const totalCost = sites.reduce((sum, site) => {
      const material = Number(site.material_cost ?? site.materialCost ?? 0);
      const labor = Number(site.labor_cost ?? site.laborCost ?? 0);
      const personnel = Number(site.personnel_cost ?? site.personnelCost ?? 0);
      const outsourced = Number(site.outsourced_cost ?? site.outsourcedCost ?? 0);
      const misc = Number(site.misc_cost ?? site.miscCost ?? 0);
      return sum + material + labor + personnel + outsourced + misc;
    }, 0);

    const profit = totalQuote - totalCost;
    const collectionRate = totalQuote ? Math.round((received / totalQuote) * 1000) / 10 : 0;
    const marginRate = totalQuote ? Math.round((profit / totalQuote) * 1000) / 10 : 0;

    const riskSites = sites.filter((site) => {
      const quote = Number(site.quote_amount ?? site.quoteAmount ?? 0);
      const paid = Number(site.received_amount ?? site.receivedAmount ?? 0);
      const status = String(site.status || '');
      const siteCollectionRate = quote ? paid / quote : 0;
      return quote > 0 && siteCollectionRate < 0.5 && !['已結案', '結案'].includes(status);
    });

    return {
      sites,
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

  if (constructionMode) {
    const rows = constructionStats.sites.slice(0, 8).map((site) => {
      const quote = Number(site.quote_amount ?? site.quoteAmount ?? 0);
      const received = Number(site.received_amount ?? site.receivedAmount ?? 0);
      const unpaid = Math.max(quote - received, 0);
      const material = Number(site.material_cost ?? site.materialCost ?? 0);
      const labor = Number(site.labor_cost ?? site.laborCost ?? 0);
      const personnel = Number(site.personnel_cost ?? site.personnelCost ?? 0);
      const outsourced = Number(site.outsourced_cost ?? site.outsourcedCost ?? 0);
      const misc = Number(site.misc_cost ?? site.miscCost ?? 0);
      const cost = material + labor + personnel + outsourced + misc;
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
      <section>
        <div className="grid">
          <Card title="案場數量" value={constructionStats.sites.length} sub="目前建立的工程案場" />
          <Card title="案場總報價" value={money(constructionStats.totalQuote)} sub="所有案場合計報價" />
          <Card title="已收款" value={money(constructionStats.received)} sub={`收款率 ${constructionStats.collectionRate}%`} />
          <Card title="未收款" value={money(constructionStats.unpaid)} sub="需持續追蹤請款" />
        </div>

        <div className="grid">
          <Card title="核心成本" value={money(constructionStats.totalCost)} sub="材料、工資、外包與雜支" />
          <Card title="案場毛利" value={money(constructionStats.profit)} sub={constructionStats.profit >= 0 ? '目前預估有利潤' : '目前預估虧損'} />
          <Card title="平均毛利率" value={`${constructionStats.marginRate}%`} sub="毛利 / 報價" />
          <Card title="風險案場" value={constructionStats.riskSites.length} sub="收款率低於 50% 且未結案" />
        </div>

        <div className="panel">
          <h2>今天要處理什麼？</h2>
          <div className="grid">
            <button type="button" onClick={() => onNavigate?.('jobsites')}>
              新增 / 管理案場
            </button>
            <button type="button" onClick={() => onNavigate?.('jobsites')}>
              登記收款
            </button>
            <button type="button" onClick={() => onNavigate?.('reports')}>
              查看工程月報
            </button>
            <button type="button" onClick={() => onNavigate?.('inventory')}>
              檢查材料 / 工具庫存
            </button>
          </div>
        </div>

        <div className="panel-grid">
          <div className="panel">
            <h2>工程營運摘要</h2>
            <ul className="summary">
              <li>案場數量：{constructionStats.sites.length}</li>
              <li>案場總報價：{money(constructionStats.totalQuote)}</li>
              <li>已收款：{money(constructionStats.received)}</li>
              <li>未收款：{money(constructionStats.unpaid)}</li>
              <li>核心成本：{money(constructionStats.totalCost)}</li>
              <li>案場毛利：{money(constructionStats.profit)}</li>
            </ul>
          </div>

          <div className="panel">
            <h2>請款風險提醒</h2>
            <ul className="summary">
              {constructionStats.sites.length === 0 && <li>目前尚無案場資料，請先到案場工作台新增工程案場。</li>}
              {constructionStats.unpaid > 0 && <li>尚有未收款 {money(constructionStats.unpaid)}，建議持續追蹤請款進度。</li>}
              {constructionStats.riskSites.length > 0 && <li>有 {constructionStats.riskSites.length} 個案場收款率偏低，請優先檢查。</li>}
              {constructionStats.marginRate < 25 && constructionStats.totalQuote > 0 && <li>整體毛利率低於 25%，請檢查材料、工資與外包成本。</li>}
              {constructionStats.sites.length > 0 && constructionStats.unpaid === 0 && <li>目前無未收款風險，收款狀況良好。</li>}
            </ul>
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

  const chart = s.revenueByPlatform?.length
    ? s.revenueByPlatform
    : [{ name: '尚無資料', value: 1 }];

  return (
    <section>
      <div className="grid">
        <Card title="總營收" value={money(s.revenue)} />
        <Card title="總支出" value={money(s.expenses)} />
        <Card title="淨利" value={money(s.netProfit)} />
        <Card title="低庫存警示" value={s.lowStock} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>平台營收分布</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chart} dataKey="value" nameKey="name" outerRadius={90}>
                {chart.map((_, i) => (
                  <Cell key={i} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>營運摘要</h2>
          <ul className="summary">
            <li>交易筆數：{s.txCount}</li>
            <li>平台手續費：{money(s.fees)}</li>
            <li>商品成本：{money(s.cogs)}</li>
            <li>待處理發票：{s.invoicesPending}</li>
          </ul>
        </div>
      </div>
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
      <Title title="交易中心" desc="所有平台訂單統一轉成財務交易。" />

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

function Integrations({ companyId, company, onSync }) {
  const [rows, setRows] = useState([]);
  const industry = company?.industry;

  const load = () => api(`/companies/${companyId}/integrations`).then(setRows);

  useEffect(() => {
    load();
  }, [companyId]);

  const allowedCategories = getAllowedIntegrationCategories(industry);
  const visibleRows = rows.filter((p) => allowedCategories.includes(p.category));

  const groups = visibleRows.reduce((a, p) => {
    if (!a[p.category]) a[p.category] = [];
    a[p.category].push(p);
    return a;
  }, {});

  async function connect(p) {
    await api(`/companies/${companyId}/integrations/${p.platformKey}/connect`, {
      method: 'POST'
    });
    load();
  }

  async function sync(p) {
    await api(`/companies/${companyId}/integrations/${p.platformKey}/sync`, {
      method: 'POST'
    });
    await load();
    onSync?.();
  }

  return (
    <section>
      <Title title="平台串接" desc={getIntegrationDesc(industry)} />

      <div className="notice">
        目前行業別：{getIndustryName(industry)}。BookAI 會依照行業別優先顯示最相關的平台與工具。
      </div>

      {isConstructionIndustry(industry) && (
        <div className="panel">
          <h2>工程業提醒</h2>
          <p>
            工程行、油漆、水電、冷氣維修的核心通常不是大量平台訂單，而是案場報價、分期請款、
            材料費、工班費、外包費與未收款。下一階段會以「案場工作台」作為工程業主功能。
          </p>
        </div>
      )}

      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} className="panel">
          <h2>{categoryLabel[cat] || cat}</h2>
          <div className="platform-grid">
            {list.map((p) => (
              <div className="platform" key={p.platformKey}>
                <b>{p.displayName}</b>
                <span>
                  {p.priority} · {p.connectionType} · {p.status}
                </span>
                <div>
                  {p.account ? (
                    <button onClick={() => sync(p)}>同步資料</button>
                  ) : (
                    <button onClick={() => connect(p)}>連接</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!visibleRows.length && (
        <div className="notice">
          目前沒有適合此行業的串接平台。未來可新增銀行收款、LINE 收款、工程案場請款與報價單模組。
        </div>
      )}
    </section>
  );
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

function Inventory({ companyId, company }) {
  const industry = company?.industry;
  const constructionMode = isConstructionIndustry(industry);
  const [rows, setRows] = useState([]);
  const [jobSites, setJobSites] = useState([]);
  const [movements, setMovements] = useState([]);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySuccess, setInventorySuccess] = useState('');

  const [form, setForm] = useState({
    name: constructionMode ? '乳膠漆 5 加侖' : '珍珠奶茶',
    sku: constructionMode ? 'PAINT-001' : 'DRINK-001',
    category: constructionMode ? '材料' : '商品',
    unit: constructionMode ? '桶' : '個',
    price: constructionMode ? 1800 : 65,
    cost: constructionMode ? 1200 : 25,
    stock: 30,
    safetyStock: 10,
    supplier: constructionMode ? '建材行 / 油漆材料商' : '供應商',
    storageLocation: constructionMode ? '倉庫 A 區' : '門市',
    note: ''
  });

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

  async function add(e) {
    e.preventDefault();
    await api(`/companies/${companyId}/products`, {
      method: 'POST',
      body: JSON.stringify(form)
    });

    setForm((old) => ({
      ...old,
      name: '',
      sku: '',
      stock: 0,
      note: ''
    }));

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
        <Form onSubmit={add}>
          <label>
            <span>{constructionMode ? '材料 / 工具名稱' : fieldLabel(industry, 'productName')}</span>
            <input
              placeholder={constructionMode ? '例：乳膠漆 5 加侖、電鑽、砂紙' : '例：珍珠奶茶'}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            <span>{constructionMode ? '編號' : fieldLabel(industry, 'sku')}</span>
            <input
              placeholder={constructionMode ? '例：PAINT-001' : '例：DRINK-001'}
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
                  <option value="商品">商品</option>
                  <option value="原料">原料</option>
                  <option value="包材">包材</option>
                  <option value="其他">其他</option>
                </>
              )}
            </select>
          </label>

          <label>
            <span>單位</span>
            <input
              placeholder={constructionMode ? '例：桶、包、支、台、組' : '例：個、杯、包'}
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>

          <label>
            <span>{fieldLabel(industry, 'price')}</span>
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </label>

          <label>
            <span>{fieldLabel(industry, 'cost')}</span>
            <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
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
      costAmount,
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
  const [openActionSiteId, setOpenActionSiteId] = useState(null);
  const [error, setError] = useState('');

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
    costAmount: '',
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

  const [estimateItems, setEstimateItems] = useState(() => createEstimateItemsForType('冷氣工程'));

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
      setEstimateItems(createEstimateItemsForType(value));

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
    return Number(value || 0);
  }

  function updateEstimateItem(uid, key, value) {
    setEstimateItems((old) =>
      old.map((item) => (item.uid === uid ? { ...item, [key]: value } : item))
    );
  }

  function addEstimateItem() {
    setEstimateItems((old) => [
      ...old,
      {
        uid: `${Date.now()}_custom_${old.length + 1}`,
        itemCategory: '加項',
        itemName: '',
        quantity: 0,
        unit: '式',
        unitPrice: 0,
        costAmount: 0,
        note: '',
        sortOrder: old.length + 1
      }
    ]);
  }

  function removeEstimateItem(uid) {
    setEstimateItems((old) => old.filter((item) => item.uid !== uid));
  }

  function resetEstimateTemplate(type = form.projectType) {
    setEstimateItems(createEstimateItemsForType(type));
  }

  function getEstimateSummary() {
    const estimateTotal = estimateItems.reduce(
      (sum, item) => sum + numberValue(item.quantity) * numberValue(item.unitPrice),
      0
    );

    const estimateCostTotal = estimateItems.reduce(
      (sum, item) => sum + numberValue(item.costAmount),
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
        sortOrder: index + 1,
        quantity: numberValue(item.quantity),
        unitPrice: numberValue(item.unitPrice),
        costAmount: numberValue(item.costAmount),
        amount: numberValue(item.quantity) * numberValue(item.unitPrice)
      }))
      .filter((item) =>
        String(item.itemName || '').trim() &&
        (
          item.quantity > 0 ||
          item.unitPrice > 0 ||
          item.costAmount > 0 ||
          item.amount > 0
        )
      );

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
        await jobSiteRequest(`/companies/${companyId}/jobsites/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
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

    const summary = getEstimateSummary();

    try {
      setSaving(true);
      setError('');

      const payload = normalizePayload({
        ...form,
        quoteAmount: summary.totalAmount,
        subtotalAmount: summary.subtotalAmount,
        taxAmount: summary.taxAmount,
        totalAmount: summary.totalAmount,
        laborCost: summary.laborCost,
        status: form.status || '已報價'
      });

      if (editingId) {
        const updated = await jobSiteRequest(`/companies/${companyId}/jobsites/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });

        setSites((old) => old.map((site) => (site.id === editingId ? updated : site)));

        if (paymentSite?.id === editingId) {
          setPaymentSite(updated);
        }

        setEditingId(null);
      } else {
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
      setEstimateItems(createEstimateItemsForType('油漆工程'));
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

    setForm({
      siteName: site.siteName || site.name || '',
      clientName: site.clientName || '',
      clientPhone: site.clientPhone || '',
      address: site.address || '',
      projectType: site.projectType || '油漆工程',
      quoteAmount: numberValue(site.quoteAmount),
      receivedAmount: numberValue(site.receivedAmount),
      materialCost: numberValue(site.materialCost),
      laborCost: numberValue(site.laborCost),
      outsourcedCost: numberValue(site.outsourcedCost),
      miscCost: numberValue(site.miscCost),
      status: site.status || '已報價',
      note: site.note || ''
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError('');
    setForm(emptyForm);
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
      costAmount: '',
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
      costAmount: item.costAmount ?? '',
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

    try {
      setEstimateLoading(true);
      setEstimateError('');

      const payload = {
        workType: estimateSite.projectType || estimateSite.project_type || '',
        itemCategory: estimateItemForm.itemCategory || '加項',
        itemName: estimateItemForm.itemName || '',
        quantity: numberValue(estimateItemForm.quantity),
        unit: estimateItemForm.unit || '',
        unitPrice: numberValue(estimateItemForm.unitPrice),
        costAmount: numberValue(estimateItemForm.costAmount),
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
    console.log('[BookAI] deleteEstimateItem start', {
      itemId,
      estimateSiteId: estimateSite?.id,
      companyId
    });

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
    console.log('[BookAI] delete confirm result', ok);

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


    const siteName = site.siteName || site.name || '-';
    const clientName = site.clientName || site.client_name || '-';
    const clientPhone = site.clientPhone || site.client_phone || '-';
    const address = site.address || '-';
    const projectType = site.projectType || site.project_type || '-';
    const status = site.status || '-';
    const note = site.note || '-';

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

    let collectionStatus = copyCalc.collectionStatus || '未收款';

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
估價明細內部成本：${money(estimateCostTotal)}
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
估價明細內部成本：${money(estimateCostTotal)}
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

    try {
      await navigator.clipboard.writeText(text);
      setError('');
      window.alert(`${label}已複製到剪貼簿`);
    } catch (err) {
      console.error(err);
      setError(`${label}失敗，請確認瀏覽器是否允許剪貼簿權限。`);
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

              <div style={{ display: 'grid', gap: 12 }}>
                {estimateItems.map((item) => {
                  const amount = numberValue(item.quantity) * numberValue(item.unitPrice);

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
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr 150px',
                          gap: 10,
                          alignItems: 'end'
                        }}
                      >
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
                          <span>項目名稱</span>
                          <input value={item.itemName} placeholder="例：銅管追加、洗洞費、配電箱、系統櫃台尺" onChange={(e) => updateEstimateItem(item.uid, 'itemName', e.target.value)} />
                        </label>

                        <div>
                          <div className="muted">小計</div>
                          <strong>{money(amount)}</strong>
                        </div>
                      </div>

                      <div className="grid" style={{ marginTop: 10 }}>
                        <label>
                          <span>數量</span>
                          <input type="number" value={item.quantity} onChange={(e) => updateEstimateItem(item.uid, 'quantity', e.target.value)} />
                        </label>

                        <label>
                          <span>單位</span>
                          <input value={item.unit} placeholder="例：米、孔、台、式" onChange={(e) => updateEstimateItem(item.uid, 'unit', e.target.value)} />
                        </label>

                        <label>
                          <span>報價單價</span>
                          <input type="number" value={item.unitPrice} onChange={(e) => updateEstimateItem(item.uid, 'unitPrice', e.target.value)} />
                        </label>

                        <label>
                          <span>內部成本</span>
                          <input type="number" value={item.costAmount} onChange={(e) => updateEstimateItem(item.uid, 'costAmount', e.target.value)} />
                        </label>
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
                          <span>備註</span>
                          <input value={item.note || ''} placeholder="例：超出標準安裝、特殊施工、高樓危險施工" onChange={(e) => updateEstimateItem(item.uid, 'note', e.target.value)} />
                        </label>

                        <button type="button" onClick={() => removeEstimateItem(item.uid)}>
                          刪除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button type="button" onClick={addEstimateItem}>+ 新增估價項目</button>
                <button type="button" onClick={() => resetEstimateTemplate()}>重新套用{form.projectType}模板</button>
              </div>

              <div className="grid" style={{ marginTop: 12 }}>
                <Card title="估價明細小計" value={money(summary.estimateTotal)} sub="所有項目小計加總" />
                <Card title="未稅金額" value={money(summary.subtotalAmount)} sub="毛利計算基礎" />
                <Card title="營業稅" value={money(summary.taxAmount)} sub={form.taxMode === 'not_taxed' ? '目前不計稅' : `稅率 ${Number(form.taxRate || 0.05) * 100}%`} />
                <Card title="客戶應付總額" value={money(summary.totalAmount)} sub="估價明細連動計算" />
              </div>

              <div className="grid">
                <Card title="明細成本" value={money(summary.estimateCostTotal)} sub="估價項目成本合計" />
                <Card title="核心成本" value={money(summary.coreCost)} sub="明細成本 + 額外材料 + 工資 + 外包 + 雜支" />
                <Card title="預估毛利" value={money(summary.profit)} sub="未稅金額 - 核心成本" />
                <Card title="伙食費" value={money(summary.foodCost)} sub="內部參考，不計入核心毛利" />
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
          <div className="notice">目前尚無案場，新增第一筆後會正式保存到 SQLite。</div>
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
            const itemTotal = estimateItemsView.reduce((sum, item) => sum + numberValue(item.amount), 0);
            const costTotal = estimateItemsView.reduce((sum, item) => sum + numberValue(item.costAmount), 0);
            const siteCalc = calc(estimateSite);
            const grossProfit = itemTotal - costTotal;
            const grossMargin = itemTotal ? Math.round((grossProfit / itemTotal) * 1000) / 10 : 0;

            return (
              <>
                <div className="grid">
                  <Card title="明細報價合計" value={money(itemTotal)} sub="估價項目小計加總" />
                  <Card title="明細內部成本" value={money(costTotal)} sub="估價項目成本合計" />
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
                      <input value={estimateItemForm.unit} placeholder="例：米、孔、台、式" onChange={(e) => updateEstimateItemForm('unit', e.target.value)} />
                    </label>

                    <label>
                      <span>報價單價</span>
                      <input type="number" value={estimateItemForm.unitPrice} placeholder="例：700" onChange={(e) => updateEstimateItemForm('unitPrice', e.target.value)} />
                    </label>

                    <label>
                      <span>內部成本</span>
                      <input type="number" value={estimateItemForm.costAmount} placeholder="例：3200" onChange={(e) => updateEstimateItemForm('costAmount', e.target.value)} />
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
                    小計會由「數量 × 報價單價」自動計算；內部成本用於毛利判斷，不會直接顯示給客戶。
                  </div>
                </div>

                {estimateLoading ? (
                  <div className="notice">讀取估價明細中...</div>
                ) : estimateItemsView.length === 0 ? (
                  <div className="notice">
                    此案場目前沒有估價明細。舊案場可能仍使用舊報價欄位，之後可在 v3.9-2 補上新增明細功能。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {estimateItemsView.map((item) => (
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
                            <strong>{money(item.amount)}</strong>
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
                                  console.log('[BookAI] delete estimate item clicked', item);
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
                          <Card title="內部成本" value={money(item.costAmount)} />
                          <Card title="小計" value={money(item.amount)} />
                        </div>

                        {item.note && (
                          <div className="notice" style={{ marginTop: 10 }}>
                            備註：{item.note}
                          </div>
                        )}
                      </div>
                    ))}
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
    revenue === 0 ? '目前尚無營收資料，建議先到平台串接執行 Mock Sync。' : null,
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

      <div className="panel">
        <h2>平台經營洞察</h2>
        <div className="grid">
          <Card title="最賺平台" value={bestPlatform ? getPlatformName(bestPlatform.platform) : '尚無資料'} sub={bestPlatform ? `平台毛利 ${money(bestPlatform.profit)}` : '請先同步平台資料'} />
          <Card title="最高風險平台" value={riskyPlatform ? getPlatformName(riskyPlatform.platform) : '尚無資料'} sub={riskyPlatform ? `毛利率 ${rate(riskyPlatform.profit, riskyPlatform.revenue)}` : '請先同步平台資料'} />
          <Card title="平均平台抽成率" value={rate(fees, revenue)} sub="平台費 / 營收" />
          <Card title="平均商品成本率" value={rate(cogs, revenue)} sub="商品成本 / 營收" />
        </div>
      </div>

      <div className="panel">
        <h2>經營風險提醒</h2>
        <ul className="summary">
          {alerts.length ? alerts.map((a, i) => <li key={i}>{a}</li>) : <li>目前沒有明顯風險，請持續追蹤營收、成本與稅務資料。</li>}
        </ul>
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

function Settings({ company }) {
  return (
    <section>
      <Title title="公司設定" desc="公司基本資料、方案、行業別與稅籍資訊。" />
      <div className="panel">
        <h2>{company.name}</h2>
        <p>測試狀態：封閉測試中</p>
        <p>產業：{getIndustryName(company.industry)}</p>
        <p>統編：{company.tax_id || '未設定'}</p>
        <p>公司 / 營業地址：{company.address || company.company_address || '未設定'}</p>
      </div>

      <div className="panel">
        <h2>使用狀態</h2>
        <p>目前使用狀態：{getBillingStatusLabel(company.billing_status)}</p>
        <p>目前方案：{getSubscriptionPlanLabel(company.subscription_plan)}</p>
        <p>是否正式客戶：{yesNoPaid(company.is_paid_customer)}</p>
        <p>啟用日期：{company.subscription_started_at || '未設定'}</p>
        <p>到期日期：{company.subscription_expires_at || '未設定'}</p>
        <p>備註：{company.billing_note || '無'}</p>
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
        <p>封閉測試期間，此功能將依測試進度逐步開放。</p>
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

createRoot(document.getElementById('root')).render(<App />);
