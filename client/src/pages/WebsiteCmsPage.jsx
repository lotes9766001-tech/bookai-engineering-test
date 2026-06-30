import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createWebsiteResource,
  createWebsiteAsset,
  deleteWebsiteAsset,
  deleteWebsiteResource,
  getWebsiteSettings,
  listWebsiteAssets,
  listWebsiteInquiries,
  listWebsiteResource,
  saveWebsiteSettings,
  uploadWebsiteAssetImage,
  updateWebsiteInquiryStatus,
  updateWebsiteResource
} from '../lib/websiteApi';
import { resolveAssetUrl } from '../lib/assetUrl';

const tabs = [
  ['overview', '官網總覽'],
  ['settings', '網站設定'],
  ['banners', '首頁 Banner'],
  ['home-sections', '首頁區塊'],
  ['products', '商品展示'],
  ['posts', '文章 / 最新消息'],
  ['faqs', 'FAQ'],
  ['inquiries', '聯絡詢問'],
  ['assets', '素材管理']
];

const resourceLabels = {
  banners: 'Banner',
  'home-sections': '首頁區塊',
  products: '商品',
  posts: '文章',
  faqs: 'FAQ'
};

const statusOptions = [
  ['draft', '草稿'],
  ['published', '已發布'],
  ['hidden', '隱藏']
];

const sectionTypeOptions = [
  ['custom', '品牌亮點'],
  ['feature', '精選特色'],
  ['promotion', '活動資訊'],
  ['story', '品牌故事'],
  ['brand_story', '品牌故事'],
  ['product_highlight', '商品展示'],
  ['hero', '主視覺']
];

const inquiryStatusOptions = [
  ['new', '新詢問'],
  ['read', '已讀'],
  ['replied', '已回覆'],
  ['archived', '已封存']
];

const assetModuleOptions = [
  ['logo', 'Logo'],
  ['favicon', '網站小圖示'],
  ['banner', 'Banner'],
  ['home_section', '首頁區塊'],
  ['product', '商品'],
  ['post', '文章'],
  ['general', '通用素材']
];

const resourceEmptyText = {
  banners: '目前尚無 Banner。你可以新增首頁主視覺，讓顧客一進站就看見品牌重點。',
  'home-sections': '目前尚無首頁區塊。你可以新增品牌故事、精選特色或活動資訊。',
  products: '目前尚無官網商品。你可以新增商品展示內容，狀態設為草稿後再發布。',
  posts: '目前尚無文章。你可以新增品牌消息、選物指南或活動公告，讓官網內容更完整。',
  faqs: '目前尚無 FAQ。你可以新增常見問題，協助顧客快速了解商品、出貨與服務方式。',
  inquiries: '目前尚無聯絡詢問。公開網站表單送出後，詢問紀錄會顯示在這裡。',
  assets: '目前尚無素材。你可以先建立常用圖片 URL，方便套用到 Logo、Banner、商品與文章。'
};

const publicStatuses = new Map(statusOptions);
const sectionTypeLabels = new Map(sectionTypeOptions);
const inquiryStatusLabels = new Map(inquiryStatusOptions);
const assetModuleLabels = new Map(assetModuleOptions);

function nextSortOrder(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const max = Math.max(0, ...rows.map((item) => Number(item.sortOrder ?? item.sort_order ?? 0) || 0));
  return max + 1;
}

function emptyForm(resource, items = []) {
  const base = { sortOrder: nextSortOrder(items), isActive: true };
  if (resource === 'banners') return { ...base, title: '', subtitle: '', imageUrl: '', buttonText: '', buttonUrl: '' };
  if (resource === 'home-sections') return { ...base, sectionType: 'custom', title: '', subtitle: '', content: '', imageUrl: '', buttonText: '', buttonUrl: '' };
  if (resource === 'products') return { name: '', slug: '', description: '', shortDescription: '', price: 0, compareAtPrice: 0, imageUrl: '', category: '', status: 'draft', sortOrder: nextSortOrder(items), isFeatured: false };
  if (resource === 'posts') return { title: '', slug: '', summary: '', content: '', coverImageUrl: '', category: '', status: 'draft', publishedAt: '' };
  if (resource === 'faqs') return { question: '', answer: '', category: '', sortOrder: nextSortOrder(items), isActive: true };
  return {};
}

function formatDate(value) {
  if (!value) return '尚未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未設定';
  return date.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function normalizeForm(resource, item) {
  return { ...emptyForm(resource), ...item };
}

function sortWebsiteItems(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const sortA = Number(a.sortOrder ?? a.sort_order ?? 0) || 0;
    const sortB = Number(b.sortOrder ?? b.sort_order ?? 0) || 0;
    if (sortA !== sortB) return sortA - sortB;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function getStatusBadgeClass(status) {
  if (status === 'published') return 'website-chip website-chip-published';
  if (status === 'draft') return 'website-chip website-chip-draft';
  if (status === 'hidden') return 'website-chip website-chip-hidden';
  if (status === 'active' || status === 'enabled') return 'website-chip website-chip-active';
  if (status === 'inactive' || status === 'disabled') return 'website-chip website-chip-inactive';
  return 'website-chip';
}

function getStatusLabel(status) {
  const labels = {
    ...Object.fromEntries(statusOptions),
    ...Object.fromEntries(inquiryStatusOptions),
    active: '啟用',
    inactive: '停用',
    enabled: '啟用',
    disabled: '停用'
  };
  return labels[status] || status || '-';
}

function getOptionValue(option) {
  if (Array.isArray(option)) return option[0];
  if (option && typeof option === 'object') return option.value;
  return option;
}

function getOptionLabel(option) {
  if (Array.isArray(option)) return option[1];
  if (option && typeof option === 'object') return option.label;
  return getStatusLabel(option);
}

function TextField({ label, value, onChange, type = 'text', textarea = false, placeholder = '', hint = '' }) {
  return (
    <label className="website-field">
      <span>{label}</span>
      {textarea ? (
        <textarea value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  const firstValue = getOptionValue(options[0]);
  return (
    <label className="website-field">
      <span>{label}</span>
      <select value={value || firstValue} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => {
          const optionValue = getOptionValue(option);
          return <option key={optionValue} value={optionValue}>{getOptionLabel(option)}</option>;
        })}
      </select>
    </label>
  );
}

function SwitchField({ label, checked, onChange }) {
  return (
    <label className="website-switch">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ImagePreview({ src }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveAssetUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!resolvedSrc) return <div className="website-image-empty">尚未輸入圖片 URL</div>;
  if (failed) return <div className="website-image-empty">圖片無法載入，請確認網址是否完整</div>;
  return <img className="website-image-preview" src={resolvedSrc} alt="" onError={() => setFailed(true)} />;
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ImageUploadField({ label, value, onChange, assets = [], module = 'general', onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const filteredAssets = assets.filter((asset) => !module || asset.module === module || asset.module === 'general');
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setUploadError('');
    if (!file) return;
    if (!allowedTypes.has(file.type)) {
      setUploadError('\u50c5\u5141\u8a31\u4e0a\u50b3 JPG\u3001JPEG\u3001PNG \u6216 WEBP \u5716\u7247\u3002');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('\u5716\u7247\u6a94\u6848\u4e0d\u53ef\u8d85\u904e 5MB\u3002');
      return;
    }

    setUploading(true);
    try {
      const result = await uploadWebsiteAssetImage(file);
      if (!result?.url) throw new Error('\u4e0a\u50b3\u5b8c\u6210\u4f46\u672a\u53d6\u5f97\u5716\u7247 URL\u3002');
      onChange(result.url);
      onUploaded?.(file, result);
    } catch (err) {
      setUploadError(err.message || '\u5716\u7247\u4e0a\u50b3\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="website-image-field">
      <label className="website-field">
        <span>{label}</span>
        <input value={value || ''} placeholder="https://example.com/image.jpg" onChange={(e) => onChange(e.target.value)} />
        <small>{'\u53ef\u624b\u52d5\u8cbc\u4e0a\u5716\u7247 URL\uff0c\u6216\u4f7f\u7528\u4e0b\u65b9\u6309\u9215\u4e0a\u50b3\u672c\u6a5f\u5716\u7247\u5f8c\u81ea\u52d5\u586b\u5165\u3002'}</small>
      </label>
      <div className="website-image-tools">
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="website-file-input"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? '\u4e0a\u50b3\u4e2d...' : '\u4e0a\u50b3\u5716\u7247'}
        </button>
        <select
          value=""
          disabled={!filteredAssets.length}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        >
          <option value="">{filteredAssets.length ? '\u5f9e\u7d20\u6750\u7ba1\u7406\u9078\u64c7\u5716\u7247\u7db2\u5740' : '\u76ee\u524d\u6c92\u6709\u53ef\u9078\u7d20\u6750'}</option>
          {filteredAssets.map((asset) => (
            <option key={asset.id} value={asset.fileUrl}>{asset.fileName || asset.fileUrl}</option>
          ))}
        </select>
      </div>
      {uploadError && <div className="website-upload-error">{uploadError}</div>}
      <ImagePreview src={value} />
    </div>
  );
}

export default function WebsiteCmsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [settings, setSettings] = useState(null);
  const [resources, setResources] = useState({ banners: [], 'home-sections': [], products: [], posts: [], faqs: [], inquiries: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, banners, sections, products, posts, faqs, inquiries, assets] = await Promise.all([
        getWebsiteSettings(),
        listWebsiteResource('banners'),
        listWebsiteResource('home-sections'),
        listWebsiteResource('products'),
        listWebsiteResource('posts'),
        listWebsiteResource('faqs'),
        listWebsiteInquiries(),
        listWebsiteAssets()
      ]);
      setSettings(nextSettings);
      setResources({
        banners: sortWebsiteItems(banners),
        'home-sections': sortWebsiteItems(sections),
        products: sortWebsiteItems(products),
        posts: sortWebsiteItems(posts),
        faqs: sortWebsiteItems(faqs),
        inquiries: Array.isArray(inquiries) ? inquiries : [],
        assets: Array.isArray(assets) ? assets : []
      });
    } catch (err) {
      setError(err.message || '官網資料載入失敗。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function run(action, successText) {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(successText);
      await loadAll();
    } catch (err) {
      setError(err.message || '操作失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  const commonProps = { resources, assets: resources.assets, saving, run };

  return (
    <section className="website-cms-page">
      <div className="website-hero">
        <div>
          <span className="website-kicker">官網後台</span>
          <h1>品牌官網管理</h1>
          <p>管理網站設定、首頁內容、商品展示、文章、FAQ 與聯絡詢問。所有狀態值仍維持系統原本資料格式，只在畫面上轉為繁體中文。</p>
        </div>
        <div className="website-preview-card">
          <span>預覽網址</span>
          <strong>/site-preview/{settings?.siteSlug || 'brand-slug'}</strong>
          <p>預覽模式可供後台檢查，不會送出聯絡表單。</p>
        </div>
      </div>

      <div className="website-tabs" role="tablist" aria-label="官網後台分頁">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {message && <div className="website-alert success">{message}</div>}
      {error && <div className="website-alert error">{error}</div>}
      {loading ? (
        <div className="website-loading">官網資料載入中...</div>
      ) : (
        <>
          {activeTab === 'overview' && <WebsiteOverview settings={settings} resources={resources} />}
          {activeTab === 'settings' && (
            <SettingsPanel
              settings={settings}
              assets={resources.assets}
              saving={saving}
              onSave={(payload) => run(() => saveWebsiteSettings(payload), '網站設定已儲存。')}
            />
          )}
          {['banners', 'home-sections', 'products', 'posts', 'faqs'].includes(activeTab) && (
            <ResourcePanel
              resource={activeTab}
              items={resources[activeTab]}
              {...commonProps}
            />
          )}
          {activeTab === 'inquiries' && (
            <InquiriesPanel
              inquiries={resources.inquiries}
              saving={saving}
              onStatusChange={(id, status) => run(() => updateWebsiteInquiryStatus(id, status), '詢問狀態已更新。')}
            />
          )}
          {activeTab === 'assets' && (
            <AssetsPanel
              assets={resources.assets}
              saving={saving}
              run={run}
            />
          )}
        </>
      )}
    </section>
  );
}

function WebsiteOverview({ settings, resources }) {
  const previewUrl = settings?.siteSlug ? `/site-preview/${encodeURIComponent(settings.siteSlug)}` : null;
  const rows = {
    banners: Array.isArray(resources?.banners) ? resources.banners : [],
    'home-sections': Array.isArray(resources?.['home-sections']) ? resources['home-sections'] : [],
    products: Array.isArray(resources?.products) ? resources.products : [],
    posts: Array.isArray(resources?.posts) ? resources.posts : [],
    faqs: Array.isArray(resources?.faqs) ? resources.faqs : [],
    inquiries: Array.isArray(resources?.inquiries) ? resources.inquiries : []
  };
  const cards = [
    ['網站名稱', settings?.siteName || '-'],
    ['品牌名稱', settings?.brandName || '-'],
    ['公開網址代號', settings?.siteSlug || '-'],
    ['發布狀態', getStatusLabel(settings?.status || 'draft')],
    ['Banner 數量', `${rows.banners.length} 筆`],
    ['首頁區塊數量', `${rows['home-sections'].length} 筆`],
    ['商品數量', `${rows.products.length} 筆`],
    ['文章數量', `${rows.posts.length} 筆`],
    ['FAQ 數量', `${rows.faqs.length} 筆`],
    ['新詢問', `${rows.inquiries.filter((item) => item.status === 'new').length} 筆`]
  ];

  const publishedProducts = rows.products.filter((item) => item.status === 'published').length;
  const draftProducts = rows.products.filter((item) => item.status === 'draft').length;
  const hiddenProducts = rows.products.filter((item) => item.status === 'hidden').length;
  const publishedPosts = rows.posts.filter((item) => item.status === 'published').length;
  const draftPosts = rows.posts.filter((item) => item.status === 'draft').length;
  const hiddenPosts = rows.posts.filter((item) => item.status === 'hidden').length;

  return (
    <div className="website-overview">
      <div className="website-stat-grid">
        {cards.map(([label, value]) => (
          <article className="website-stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="website-overview-grid">
        <article className="website-panel">
          <h2>公開網址</h2>
          {previewUrl ? (
            <a className="website-url" href={previewUrl} target="_blank" rel="noreferrer">{previewUrl}</a>
          ) : (
            <p>請先在網站設定建立公開網址代號。</p>
          )}
        </article>
        <article className="website-panel">
          <h2>商品數量</h2>
          <strong className="website-big-number">{resources.products.length}</strong>
          <div className="website-status-list">
            <span>已發布 {publishedProducts}</span>
            <span>草稿 {draftProducts}</span>
            <span>隱藏 {hiddenProducts}</span>
          </div>
        </article>
        <article className="website-panel">
          <h2>文章數量</h2>
          <strong className="website-big-number">{resources.posts.length}</strong>
          <div className="website-status-list">
            <span>已發布 {publishedPosts}</span>
            <span>草稿 {draftPosts}</span>
            <span>隱藏 {hiddenPosts}</span>
          </div>
        </article>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, assets = [], saving, onSave }) {
  const [form, setForm] = useState(settings || {});

  useEffect(() => {
    setForm(settings || {});
  }, [settings]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form className="website-panel" onSubmit={(e) => {
      e.preventDefault();
      onSave(form);
    }}>
      <div className="website-panel-head">
        <div>
          <h2>網站設定</h2>
          <p>設定品牌官網的公開網址、品牌資訊、社群連結與 SEO 文字。</p>
        </div>
        <button className="primary" type="submit" disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</button>
      </div>

      <div className="website-form-grid">
        <TextField label="公開網址代號" value={form.siteSlug} onChange={(value) => update('siteSlug', value)} placeholder="mori-pet-life" hint="公開網址會使用 /site/site_slug，建議使用英文、數字或短橫線。" />
        <TextField label="網站名稱" value={form.siteName} onChange={(value) => update('siteName', value)} placeholder="Mori Pet Life 官方網站" />
        <TextField label="品牌名稱" value={form.brandName} onChange={(value) => update('brandName', value)} placeholder="Mori Pet Life" />
        <ImageUploadField label="Logo 圖片網址" value={form.logoUrl} onChange={(value) => update('logoUrl', value)} assets={assets} module="logo" />
        <ImageUploadField label="網站小圖示網址" value={form.faviconUrl} onChange={(value) => update('faviconUrl', value)} assets={assets} module="favicon" />
        <TextField label="主色" value={form.primaryColor} onChange={(value) => update('primaryColor', value)} placeholder="#1f6f5b" />
        <TextField label="輔色" value={form.secondaryColor} onChange={(value) => update('secondaryColor', value)} placeholder="#f4efe6" />
        <TextField label="聯絡 Email" value={form.contactEmail} onChange={(value) => update('contactEmail', value)} placeholder="hello@example.com" />
        <TextField label="聯絡電話" value={form.contactPhone} onChange={(value) => update('contactPhone', value)} placeholder="02-1234-5678" />
        <TextField label="LINE 連結" value={form.lineUrl} onChange={(value) => update('lineUrl', value)} placeholder="https://line.me/..." />
        <TextField label="Facebook 連結" value={form.facebookUrl} onChange={(value) => update('facebookUrl', value)} placeholder="https://facebook.com/..." />
        <TextField label="Instagram 連結" value={form.instagramUrl} onChange={(value) => update('instagramUrl', value)} placeholder="https://instagram.com/..." />
        <TextField label="地址" value={form.address} onChange={(value) => update('address', value)} placeholder="台北市..." />
        <TextField label="SEO 標題" value={form.seoTitle} onChange={(value) => update('seoTitle', value)} placeholder="品牌名稱 | 官方網站" />
        <TextField label="SEO 描述" value={form.seoDescription} onChange={(value) => update('seoDescription', value)} textarea placeholder="用 1-2 句話描述品牌、商品與服務特色。" />
        <SelectField label="發布狀態" value={form.status || 'draft'} onChange={(value) => update('status', value)} options={statusOptions} />
      </div>
    </form>
  );
}

function ResourcePanel({ resource, items, assets, saving, run }) {
  const label = resourceLabels[resource] || '內容';
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm(resource, items));

  useEffect(() => {
    setEditing(null);
    setForm(emptyForm(resource, items));
  }, [resource, items]);

  const reset = () => {
    setEditing(null);
    setForm(emptyForm(resource, items));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (editing) {
      await run(() => updateWebsiteResource(resource, editing.id, form), `${label}已更新。`);
    } else {
      await run(() => createWebsiteResource(resource, form), `${label}已新增。`);
    }
    reset();
  }

  async function handleDelete(item) {
    if (!window.confirm(`確定要刪除這筆${label}嗎？`)) return;
    await run(() => deleteWebsiteResource(resource, item.id), `${label}已刪除。`);
  }

  return (
    <div className="website-resource-layout">
      <form className="website-panel" onSubmit={handleSubmit}>
        <div className="website-panel-head">
          <div>
            <h2>{editing ? `編輯${label}` : `新增${label}`}</h2>
            <p>請填寫顧客看得懂的內容；系統狀態值會保留原資料格式，只在畫面上顯示中文。</p>
          </div>
          <div className="website-actions">
            {editing && <button type="button" className="secondary" onClick={reset}>取消編輯</button>}
            <button className="primary" type="submit" disabled={saving}>{saving ? '儲存中...' : editing ? '更新內容' : `新增${label}`}</button>
          </div>
        </div>
        <ResourceFields resource={resource} form={form} setForm={setForm} assets={assets} />
      </form>

      <ResourceTable
        resource={resource}
        items={items}
        onEdit={(item) => {
          setEditing(item);
          setForm(normalizeForm(resource, item));
        }}
        onDelete={handleDelete}
      />
    </div>
  );
}

function ResourceFields({ resource, form, setForm, assets }) {
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  if (resource === 'banners') {
    return (
      <div className="website-form-grid">
        <TextField label="標題" value={form.title} onChange={(value) => update('title', value)} placeholder="陪牠一起過更好的日常" />
        <TextField label="副標" value={form.subtitle} onChange={(value) => update('subtitle', value)} textarea placeholder="用一句話說明品牌主張或本期活動。" />
        <ImageUploadField label="圖片 URL" value={form.imageUrl} onChange={(value) => update('imageUrl', value)} assets={assets} module="banner" />
        <TextField label="按鈕文字" value={form.buttonText} onChange={(value) => update('buttonText', value)} placeholder="查看商品" />
        <TextField label="按鈕連結" value={form.buttonUrl} onChange={(value) => update('buttonUrl', value)} placeholder="/products" />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(value) => update('sortOrder', value)} />
        <SwitchField label="啟用" checked={form.isActive} onChange={(value) => update('isActive', value)} />
      </div>
    );
  }

  if (resource === 'home-sections') {
    return (
      <div className="website-form-grid">
        <SelectField label="區塊類型" value={form.sectionType} onChange={(value) => update('sectionType', value)} options={sectionTypeOptions} />
        <TextField label="標題" value={form.title} onChange={(value) => update('title', value)} placeholder="品牌亮點" />
        <TextField label="副標" value={form.subtitle} onChange={(value) => update('subtitle', value)} placeholder="讓顧客快速理解你的特色。" />
        <TextField label="內容" value={form.content} onChange={(value) => update('content', value)} textarea placeholder="可輸入品牌故事、活動說明、服務特色或商品介紹。" />
        <ImageUploadField label="圖片 URL" value={form.imageUrl} onChange={(value) => update('imageUrl', value)} assets={assets} module="home_section" />
        <TextField label="按鈕文字" value={form.buttonText} onChange={(value) => update('buttonText', value)} placeholder="了解更多" />
        <TextField label="按鈕連結" value={form.buttonUrl} onChange={(value) => update('buttonUrl', value)} placeholder="/products" />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(value) => update('sortOrder', value)} />
        <SwitchField label="啟用" checked={form.isActive} onChange={(value) => update('isActive', value)} />
      </div>
    );
  }

  if (resource === 'products') {
    return (
      <div className="website-form-grid">
        <TextField label="商品名稱" value={form.name} onChange={(value) => update('name', value)} placeholder="智能寵物飲水機" />
        <TextField label="商品網址代號" value={form.slug} onChange={(value) => update('slug', value)} placeholder="smart-pet-water-fountain" hint="建議使用英文、數字或短橫線，例如 smart-pet-water-fountain。" />
        <TextField label="簡短描述" value={form.shortDescription} onChange={(value) => update('shortDescription', value)} textarea placeholder="顯示在商品列表的一段簡短介紹。" />
        <TextField label="完整描述" value={form.description} onChange={(value) => update('description', value)} textarea placeholder="補充商品特色、規格、使用情境與注意事項。" />
        <TextField label="價格" type="number" value={form.price} onChange={(value) => update('price', value)} />
        <TextField label="比較價" type="number" value={form.compareAtPrice} onChange={(value) => update('compareAtPrice', value)} />
        <ImageUploadField label="圖片 URL" value={form.imageUrl} onChange={(value) => update('imageUrl', value)} assets={assets} module="product" />
        <TextField label="分類" value={form.category} onChange={(value) => update('category', value)} placeholder="一般商品" />
        <SelectField label="狀態" value={form.status} onChange={(value) => update('status', value)} options={statusOptions} />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(value) => update('sortOrder', value)} />
        <SwitchField label="精選商品" checked={form.isFeatured} onChange={(value) => update('isFeatured', value)} />
      </div>
    );
  }

  if (resource === 'posts') {
    return (
      <div className="website-form-grid">
        <TextField label="標題" value={form.title} onChange={(value) => update('title', value)} placeholder="新品上市公告" />
        <TextField label="文章網址代號" value={form.slug} onChange={(value) => update('slug', value)} placeholder="new-arrival" hint="建議使用英文、數字或短橫線，方便形成文章網址。" />
        <TextField label="摘要" value={form.summary} onChange={(value) => update('summary', value)} textarea placeholder="顯示在最新消息列表的一段摘要。" />
        <TextField label="內容" value={form.content} onChange={(value) => update('content', value)} textarea placeholder="輸入品牌消息、選物指南或活動公告內容。" />
        <ImageUploadField label="封面圖片 URL" value={form.coverImageUrl} onChange={(value) => update('coverImageUrl', value)} assets={assets} module="post" />
        <TextField label="分類" value={form.category} onChange={(value) => update('category', value)} placeholder="品牌消息" />
        <SelectField label="狀態" value={form.status} onChange={(value) => update('status', value)} options={statusOptions} />
        <TextField label="發布時間" type="datetime-local" value={form.publishedAt} onChange={(value) => update('publishedAt', value)} />
      </div>
    );
  }

  if (resource === 'faqs') {
    return (
      <div className="website-form-grid">
        <TextField label="問題" value={form.question} onChange={(value) => update('question', value)} placeholder="多久可以收到商品？" />
        <TextField label="回答" value={form.answer} onChange={(value) => update('answer', value)} textarea placeholder="請用顧客能理解的方式回答。" />
        <TextField label="分類" value={form.category} onChange={(value) => update('category', value)} placeholder="出貨與付款" />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(value) => update('sortOrder', value)} />
        <SwitchField label="啟用" checked={form.isActive} onChange={(value) => update('isActive', value)} />
      </div>
    );
  }

  return null;
}

function ResourceTable({ resource, items, onEdit, onDelete }) {
  const label = resourceLabels[resource] || '內容';
  if (!items.length) {
    return <div className="website-panel website-empty-state">{resourceEmptyText[resource] || `目前尚無${label}。`}</div>;
  }

  return (
    <div className="website-panel website-table-panel">
      <div className="website-panel-head">
        <h2>{label}列表</h2>
        <span>{items.length} 筆</span>
      </div>
      <div className="website-table-wrap">
        <table className="website-table">
          <thead>
            <tr>
              <th>主要內容</th>
              <th>狀態 / 類型</th>
              <th>排序 / 分類</th>
              <th>更新時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const title = item.title || item.name || item.question || '未命名內容';
              const detail = item.subtitle || item.summary || item.shortDescription || item.answer || item.slug || '';
              const image = item.imageUrl || item.coverImageUrl;
              const status = item.status || (item.isActive ? 'enabled' : 'disabled');
              return (
                <tr key={item.id}>
                  <td>
                    <div className="website-table-main">
                      {image && <ImagePreview src={image} />}
                      <div>
                        <strong>{title}</strong>
                        {detail && <small>{item.slug && detail === item.slug ? `網址代號：${detail}` : detail}</small>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {resource === 'home-sections' ? (
                      <span className="website-chip">{sectionTypeLabels.get(item.sectionType) || '品牌亮點'}</span>
                    ) : (
                      <span className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</span>
                    )}
                  </td>
                  <td>
                    <div className="website-table-meta">
                      {item.sortOrder !== undefined && <span>排序 {item.sortOrder}</span>}
                      {item.category && <span>{item.category}</span>}
                    </div>
                  </td>
                  <td>{formatDate(item.updatedAt || item.createdAt)}</td>
                  <td>
                    <div className="website-row-actions">
                      <button type="button" className="secondary" onClick={() => onEdit(item)}>編輯內容</button>
                      <button type="button" className="danger" onClick={() => onDelete(item)}>刪除紀錄</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetsPanel({ assets, saving, run }) {
  const [form, setForm] = useState({ fileName: '', fileUrl: '', fileType: 'image', fileSize: '', module: 'general' });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    await run(() => createWebsiteAsset(form), '素材已新增。');
    setForm({ fileName: '', fileUrl: '', fileType: 'image', fileSize: '', module: 'general' });
  }

  async function handleDelete(asset) {
    if (!window.confirm('確定要刪除這筆素材嗎？')) return;
    await run(() => deleteWebsiteAsset(asset.id), '素材已刪除。');
  }

  return (
    <div className="website-resource-layout">
      <form className="website-panel" onSubmit={handleSubmit}>
        <div className="website-panel-head">
          <div>
            <h2>新增素材</h2>
            <p>保存常用圖片或檔案網址，後續可套用在 Logo、Banner、首頁區塊、商品或文章。</p>
          </div>
          <button className="primary" type="submit" disabled={saving}>{saving ? '儲存中...' : '新增素材'}</button>
        </div>
        <div className="website-form-grid">
          <TextField label="素材名稱" value={form.fileName} onChange={(value) => update('fileName', value)} placeholder="首頁主視覺圖片" />
          <ImageUploadField
            label="素材 URL"
            value={form.fileUrl}
            onChange={(value) => update('fileUrl', value)}
            assets={assets}
            module={form.module}
            onUploaded={(file) => {
              setForm((prev) => ({
                ...prev,
                fileName: prev.fileName || file.name,
                fileType: 'image',
                fileSize: file.size
              }));
            }}
          />
          <TextField label="類型" value={form.fileType} onChange={(value) => update('fileType', value)} placeholder="image" />
          <TextField label="檔案大小" value={form.fileSize} onChange={(value) => update('fileSize', value)} placeholder={formatFileSize(120 * 1024)} />
          <SelectField label="用途" value={form.module} onChange={(value) => update('module', value)} options={assetModuleOptions} />
        </div>
      </form>

      <div className="website-panel website-table-panel">
        <div className="website-panel-head">
          <h2>素材列表</h2>
          <span>{assets.length} 筆</span>
        </div>
        {!assets.length ? (
          <div className="website-empty-state">{resourceEmptyText.assets}</div>
        ) : (
          <div className="website-table-wrap">
            <table className="website-table">
              <thead>
                <tr>
                  <th>預覽</th>
                  <th>素材資訊</th>
                  <th>用途</th>
                  <th>類型與大小</th>
                  <th>建立時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td><ImagePreview src={asset.fileUrl} /></td>
                    <td>
                      <strong>{asset.fileName || '未命名素材'}</strong>
                      <small className="website-url">{asset.fileUrl}</small>
                    </td>
                    <td>{assetModuleLabels.get(asset.module) || '通用素材'}</td>
                    <td>{asset.fileType || '-'} {asset.fileSize ? ` / ${asset.fileSize}` : ''}</td>
                    <td>{formatDate(asset.createdAt)}</td>
                    <td>
                      <div className="website-row-actions">
                        <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(asset.fileUrl)}>複製網址</button>
                        <button type="button" className="danger" onClick={() => handleDelete(asset)}>刪除紀錄</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InquiriesPanel({ inquiries, saving, onStatusChange }) {
  const sorted = useMemo(() => [...inquiries].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [inquiries]);

  if (!sorted.length) {
    return <div className="website-panel website-empty-state">{resourceEmptyText.inquiries}<br />預覽模式下不會建立詢問紀錄。</div>;
  }

  return (
    <div className="website-panel website-table-panel">
      <div className="website-panel-head">
        <div>
          <h2>聯絡詢問</h2>
          <p>公開網站表單送出後，詢問紀錄會顯示在這裡。</p>
        </div>
        <span>{sorted.length} 筆</span>
      </div>
      <div className="website-table-wrap">
        <table className="website-table">
          <thead>
            <tr>
              <th>姓名 / 聯絡方式</th>
              <th>詢問內容</th>
              <th>來源頁面</th>
              <th>狀態</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name || '-'}</strong>
                  <small>{item.email || '-'} {item.phone ? ` / ${item.phone}` : ''}</small>
                </td>
                <td>{item.message || '-'}</td>
                <td>{item.sourcePath || '-'}</td>
                <td>
                  <select value={item.status || 'new'} disabled={saving} onChange={(e) => onStatusChange(item.id, e.target.value)}>
                    {inquiryStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
