import React, { useEffect, useMemo, useState } from 'react';
import {
  createWebsiteResource,
  deleteWebsiteResource,
  getWebsiteSettings,
  listWebsiteInquiries,
  listWebsiteResource,
  saveWebsiteSettings,
  updateWebsiteInquiryStatus,
  updateWebsiteResource
} from '../lib/websiteApi';

const tabs = [
  ['overview', '官網總覽'],
  ['settings', '網站設定'],
  ['banners', '首頁 Banner'],
  ['home-sections', '首頁區塊'],
  ['products', '商品展示'],
  ['posts', '文章 / 最新消息'],
  ['faqs', 'FAQ'],
  ['inquiries', '聯絡詢問']
];

const resourceLabels = {
  banners: 'Banner',
  'home-sections': '首頁區塊',
  products: '商品',
  posts: '文章',
  faqs: 'FAQ'
};

const statusOptions = ['draft', 'published', 'hidden'];
const sectionTypes = ['hero', 'brand_story', 'feature', 'promotion', 'product_highlight', 'custom'];
const inquiryStatuses = ['new', 'read', 'replied', 'archived'];

function emptyForm(resource) {
  const base = { sortOrder: 0, isActive: true };
  if (resource === 'banners') return { ...base, title: '', subtitle: '', imageUrl: '', buttonText: '', buttonUrl: '' };
  if (resource === 'home-sections') return { ...base, sectionType: 'custom', title: '', subtitle: '', content: '', imageUrl: '', buttonText: '', buttonUrl: '' };
  if (resource === 'products') return { name: '', slug: '', description: '', shortDescription: '', price: 0, compareAtPrice: 0, imageUrl: '', category: '', status: 'draft', sortOrder: 0, isFeatured: false };
  if (resource === 'posts') return { title: '', slug: '', summary: '', content: '', coverImageUrl: '', category: '', status: 'draft', publishedAt: '' };
  if (resource === 'faqs') return { question: '', answer: '', category: '', sortOrder: 0, isActive: true };
  return {};
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function normalizeForm(resource, item) {
  return { ...emptyForm(resource), ...item };
}

function getStatusBadgeClass(status) {
  if (status === 'published') return 'website-chip website-chip-published';
  if (status === 'draft') return 'website-chip website-chip-draft';
  if (status === 'hidden') return 'website-chip website-chip-hidden';
  if (status === 'active') return 'website-chip website-chip-active';
  if (status === 'inactive') return 'website-chip website-chip-inactive';
  return 'website-chip';
}

function getStatusLabel(status) {
  const labels = {
    published: '已發布',
    draft: '草稿',
    hidden: '隱藏',
    active: '啟用',
    inactive: '停用'
  };
  return labels[status] || status;
}

function TextField({ label, value, onChange, type = 'text', textarea = false, placeholder = '' }) {
  return (
    <label className="website-field">
      <span>{label}</span>
      {textarea ? (
        <textarea value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="website-field">
      <span>{label}</span>
      <select value={value || options[0]} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
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

export default function WebsiteCmsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [settings, setSettings] = useState(null);
  const [resources, setResources] = useState({ banners: [], 'home-sections': [], products: [], posts: [], faqs: [], inquiries: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [nextSettings, banners, sections, products, posts, faqs, inquiries] = await Promise.all([
        getWebsiteSettings(),
        listWebsiteResource('banners'),
        listWebsiteResource('home-sections'),
        listWebsiteResource('products'),
        listWebsiteResource('posts'),
        listWebsiteResource('faqs'),
        listWebsiteInquiries()
      ]);
      setSettings(nextSettings);
      setResources({
        banners: Array.isArray(banners) ? banners : [],
        'home-sections': Array.isArray(sections) ? sections : [],
        products: Array.isArray(products) ? products : [],
        posts: Array.isArray(posts) ? posts : [],
        faqs: Array.isArray(faqs) ? faqs : [],
        inquiries: Array.isArray(inquiries) ? inquiries : []
      });
    } catch (err) {
      setError(err.message || '品牌官網資料載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const overview = useMemo(() => ({
    banners: resources.banners.length,
    sections: resources['home-sections'].length,
    products: resources.products.length,
    productsPublished: resources.products.filter((p) => p.status === 'published').length,
    productsDraft: resources.products.filter((p) => p.status === 'draft').length,
    productsHidden: resources.products.filter((p) => p.status === 'hidden').length,
    posts: resources.posts.length,
    postsPublished: resources.posts.filter((p) => p.status === 'published').length,
    postsDraft: resources.posts.filter((p) => p.status === 'draft').length,
    postsHidden: resources.posts.filter((p) => p.status === 'hidden').length,
    faqs: resources.faqs.length,
    newInquiries: resources.inquiries.filter((item) => item.status === 'new').length
  }), [resources]);

  async function run(action, successText) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await action();
      await loadAll();
      setMessage(successText);
    } catch (err) {
      setError(err.message || '操作失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="website-cms-page">
      <section className="website-hero">
        <div>
          <span className="website-kicker">Website CMS</span>
          <h1>品牌官網</h1>
          <p>管理品牌網站內容、首頁展示、商品資訊與顧客詢問。</p>
        </div>
        <div className="website-preview-card">
          <span>前台預覽連結</span>
          <strong>/site/{settings?.siteSlug || 'your-brand'}</strong>
        </div>
      </section>

      <div className="website-tabs" role="tablist" aria-label="品牌官網管理">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {message && <div className="website-success">{message}</div>}
      {error && <div className="website-error">{error}</div>}

      {loading ? (
        <div className="website-empty">品牌官網資料載入中...</div>
      ) : (
        <>
          {activeTab === 'overview' && <WebsiteOverview settings={settings} overview={overview} onNavigate={setActiveTab} />}
          {activeTab === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} saving={saving} onSave={() => run(() => saveWebsiteSettings(settings), '網站設定已儲存')} />}
          {['banners', 'home-sections', 'products', 'posts', 'faqs'].includes(activeTab) && (
            <ResourcePanel
              resource={activeTab}
              items={resources[activeTab] || []}
              saving={saving}
              onCreate={(payload) => run(() => createWebsiteResource(activeTab, payload), `${resourceLabels[activeTab]}已新增`)}
              onUpdate={(id, payload) => run(() => updateWebsiteResource(activeTab, id, payload), `${resourceLabels[activeTab]}已更新`)}
              onDelete={(id) => run(() => deleteWebsiteResource(activeTab, id), `${resourceLabels[activeTab]}已刪除`)}
            />
          )}
          {activeTab === 'inquiries' && <InquiriesPanel items={resources.inquiries} saving={saving} onStatus={(id, status) => run(() => updateWebsiteInquiryStatus(id, status), '詢問狀態已更新')} />}
        </>
      )}
    </div>
  );
}

function WebsiteOverview({ settings, overview, onNavigate }) {
  const previewUrl = settings?.siteSlug ? `/site/${encodeURIComponent(settings.siteSlug)}` : null;
  const cards = [
    ['網站名稱', settings?.siteName || '-'],
    ['品牌名稱', settings?.brandName || '-'],
    ['site_slug', settings?.siteSlug || '-'],
    ['發布狀態', settings?.isPublished ? '✓ 已發布' : '○ 未發布'],
    ['公開網址', previewUrl ? previewUrl : '(請先設定 site_slug)'],
    ['Banner', overview.banners],
    ['首頁區塊', overview.sections],
    ['商品', `${overview.productsPublished} 已發布 / ${overview.productsDraft} 草稿 / ${overview.productsHidden} 隱藏`],
    ['文章', `${overview.postsPublished} 已發布 / ${overview.postsDraft} 草稿 / ${overview.postsHidden} 隱藏`],
    ['FAQ', overview.faqs],
    ['新詢問', overview.newInquiries]
  ];

  return (
    <section className="website-panel">
      <div className="website-panel-head">
        <div>
          <h2>官網總覽</h2>
          <p>這裡可以管理你的品牌官網內容，資料會依登入公司自動隔離。</p>
        </div>
        <div className="website-overview-actions">
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="website-link-btn">預覽網站</a>
          )}
          <button type="button" onClick={() => onNavigate('settings')}>編輯網站設定</button>
        </div>
      </div>
      <div className="website-metric-grid">
        {cards.map(([label, value]) => (
          <div key={label} className="website-metric-card">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({ settings, setSettings, saving, onSave }) {
  const update = (key, value) => setSettings({ ...(settings || {}), [key]: value });

  return (
    <section className="website-panel">
      <div className="website-panel-head">
        <div>
          <h2>網站設定</h2>
          <p>設定品牌識別、聯絡資訊、SEO 與發布狀態。</p>
        </div>
        <button type="button" disabled={saving} onClick={onSave}>儲存設定</button>
      </div>
      <div className="website-form-grid">
        <TextField label="site_slug" value={settings?.siteSlug} onChange={(v) => update('siteSlug', v)} />
        <TextField label="網站名稱" value={settings?.siteName} onChange={(v) => update('siteName', v)} />
        <TextField label="品牌名稱" value={settings?.brandName} onChange={(v) => update('brandName', v)} />
        <TextField label="Logo URL" value={settings?.logoUrl} onChange={(v) => update('logoUrl', v)} />
        <TextField label="Favicon URL" value={settings?.faviconUrl} onChange={(v) => update('faviconUrl', v)} />
        <TextField label="主色" type="color" value={settings?.primaryColor || '#2563eb'} onChange={(v) => update('primaryColor', v)} />
        <TextField label="輔色" type="color" value={settings?.secondaryColor || '#0f172a'} onChange={(v) => update('secondaryColor', v)} />
        <TextField label="聯絡 Email" value={settings?.contactEmail} onChange={(v) => update('contactEmail', v)} />
        <TextField label="聯絡電話" value={settings?.contactPhone} onChange={(v) => update('contactPhone', v)} />
        <TextField label="LINE URL" value={settings?.lineUrl} onChange={(v) => update('lineUrl', v)} />
        <TextField label="Facebook URL" value={settings?.facebookUrl} onChange={(v) => update('facebookUrl', v)} />
        <TextField label="Instagram URL" value={settings?.instagramUrl} onChange={(v) => update('instagramUrl', v)} />
        <TextField label="地址" value={settings?.address} onChange={(v) => update('address', v)} />
        <TextField label="SEO 標題" value={settings?.seoTitle} onChange={(v) => update('seoTitle', v)} />
        <TextField label="SEO 描述" value={settings?.seoDescription} onChange={(v) => update('seoDescription', v)} textarea />
      </div>
      <div className="website-form-section">
        <h3>發布狀態</h3>
        <p className="website-form-hint">{settings?.isPublished ? '✓ 已發布：消費者可以從公開網址瀏覽你的網站' : '○ 未發布：公開網址會顯示「網站尚未開放」'}</p>
        <SwitchField label="發布網站" checked={settings?.isPublished} onChange={(v) => update('isPublished', v)} />
      </div>
    </section>
  );
}

function ResourcePanel({ resource, items, saving, onCreate, onUpdate, onDelete }) {
  const [form, setForm] = useState(emptyForm(resource));
  const [editingId, setEditingId] = useState(null);
  const label = resourceLabels[resource];

  useEffect(() => {
    setForm(emptyForm(resource));
    setEditingId(null);
  }, [resource]);

  function edit(item) {
    setEditingId(item.id);
    setForm(normalizeForm(resource, item));
  }

  async function submit(e) {
    e.preventDefault();
    if (editingId) await onUpdate(editingId, form);
    else await onCreate(form);
    setEditingId(null);
    setForm(emptyForm(resource));
  }

  function remove(id) {
    if (!window.confirm(`確定要刪除此${label}？`)) return;
    onDelete(id);
  }

  return (
    <section className="website-panel">
      <div className="website-panel-head">
        <div>
          <h2>{label}管理</h2>
          <p>新增、編輯、排序與控制顯示狀態。</p>
        </div>
      </div>
      <form className="website-editor" onSubmit={submit}>
        <ResourceFields resource={resource} form={form} setForm={setForm} />
        <div className="website-editor-actions">
          <button type="submit" disabled={saving}>{editingId ? '儲存修改' : `新增${label}`}</button>
          {editingId && <button type="button" className="website-secondary-btn" onClick={() => { setEditingId(null); setForm(emptyForm(resource)); }}>取消編輯</button>}
        </div>
      </form>
      <ResourceTable resource={resource} items={items} onEdit={edit} onDelete={remove} />
    </section>
  );
}

function ResourceFields({ resource, form, setForm }) {
  const update = (key, value) => setForm({ ...form, [key]: value });
  if (resource === 'banners') {
    return (
      <div className="website-form-grid">
        <TextField label="標題" value={form.title} onChange={(v) => update('title', v)} />
        <TextField label="副標" value={form.subtitle} onChange={(v) => update('subtitle', v)} />
        <TextField label="圖片 URL" value={form.imageUrl} onChange={(v) => update('imageUrl', v)} />
        <TextField label="按鈕文字" value={form.buttonText} onChange={(v) => update('buttonText', v)} />
        <TextField label="按鈕連結" value={form.buttonUrl} onChange={(v) => update('buttonUrl', v)} />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(v) => update('sortOrder', v)} />
        <SwitchField label="啟用" checked={form.isActive} onChange={(v) => update('isActive', v)} />
      </div>
    );
  }
  if (resource === 'home-sections') {
    return (
      <div className="website-form-grid">
        <SelectField label="區塊類型" value={form.sectionType} onChange={(v) => update('sectionType', v)} options={sectionTypes} />
        <TextField label="標題" value={form.title} onChange={(v) => update('title', v)} />
        <TextField label="副標" value={form.subtitle} onChange={(v) => update('subtitle', v)} />
        <TextField label="內容" value={form.content} onChange={(v) => update('content', v)} textarea />
        <TextField label="圖片 URL" value={form.imageUrl} onChange={(v) => update('imageUrl', v)} />
        <TextField label="按鈕文字" value={form.buttonText} onChange={(v) => update('buttonText', v)} />
        <TextField label="按鈕連結" value={form.buttonUrl} onChange={(v) => update('buttonUrl', v)} />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(v) => update('sortOrder', v)} />
        <SwitchField label="啟用" checked={form.isActive} onChange={(v) => update('isActive', v)} />
      </div>
    );
  }
  if (resource === 'products') {
    return (
      <div className="website-form-grid">
        <TextField label="商品名稱" value={form.name} onChange={(v) => update('name', v)} />
        <TextField label="slug" value={form.slug} onChange={(v) => update('slug', v)} />
        <TextField label="簡短描述" value={form.shortDescription} onChange={(v) => update('shortDescription', v)} />
        <TextField label="完整描述" value={form.description} onChange={(v) => update('description', v)} textarea />
        <TextField label="價格" type="number" value={form.price} onChange={(v) => update('price', v)} />
        <TextField label="比較價" type="number" value={form.compareAtPrice} onChange={(v) => update('compareAtPrice', v)} />
        <TextField label="圖片 URL" value={form.imageUrl} onChange={(v) => update('imageUrl', v)} />
        <TextField label="分類" value={form.category} onChange={(v) => update('category', v)} />
        <SelectField label="狀態" value={form.status} onChange={(v) => update('status', v)} options={statusOptions} />
        <TextField label="排序" type="number" value={form.sortOrder} onChange={(v) => update('sortOrder', v)} />
        <SwitchField label="精選商品" checked={form.isFeatured} onChange={(v) => update('isFeatured', v)} />
      </div>
    );
  }
  if (resource === 'posts') {
    return (
      <div className="website-form-grid">
        <TextField label="標題" value={form.title} onChange={(v) => update('title', v)} />
        <TextField label="slug" value={form.slug} onChange={(v) => update('slug', v)} />
        <TextField label="摘要" value={form.summary} onChange={(v) => update('summary', v)} />
        <TextField label="內容" value={form.content} onChange={(v) => update('content', v)} textarea />
        <TextField label="封面圖 URL" value={form.coverImageUrl} onChange={(v) => update('coverImageUrl', v)} />
        <TextField label="分類" value={form.category} onChange={(v) => update('category', v)} />
        <SelectField label="狀態" value={form.status} onChange={(v) => update('status', v)} options={statusOptions} />
        <TextField label="發布時間" value={form.publishedAt} onChange={(v) => update('publishedAt', v)} placeholder="2026-06-15T10:00:00Z" />
      </div>
    );
  }
  return (
    <div className="website-form-grid">
      <TextField label="問題" value={form.question} onChange={(v) => update('question', v)} />
      <TextField label="回答" value={form.answer} onChange={(v) => update('answer', v)} textarea />
      <TextField label="分類" value={form.category} onChange={(v) => update('category', v)} />
      <TextField label="排序" type="number" value={form.sortOrder} onChange={(v) => update('sortOrder', v)} />
      <SwitchField label="啟用" checked={form.isActive} onChange={(v) => update('isActive', v)} />
    </div>
  );
}

function ResourceTable({ resource, items, onEdit, onDelete }) {
  if (!items.length) return <div className="website-empty">目前尚無資料，請先新增內容。</div>;
  return (
    <div className="website-table-wrap">
      <table>
        <thead>
          <tr>
            <th>主要內容</th>
            <th>狀態</th>
            <th>排序 / 分類</th>
            <th>更新時間</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title || item.name || item.question || '-'}</strong>
                <small>{item.slug || item.subtitle || item.summary || item.shortDescription || item.answer || ''}</small>
              </td>
              <td>
                <span className={getStatusBadgeClass(item.status || (item.isActive ? 'active' : 'inactive'))}>
                  {getStatusLabel(item.status || (item.isActive ? 'active' : 'inactive'))}
                </span>
              </td>
              <td>{item.sortOrder ?? '-'} {item.category ? ` / ${item.category}` : ''} {resource === 'home-sections' && item.sectionType ? ` / ${item.sectionType}` : ''}</td>
              <td>{formatDate(item.updatedAt || item.createdAt)}</td>
              <td>
                <div className="website-row-actions">
                  <button type="button" onClick={() => onEdit(item)}>編輯</button>
                  <button type="button" className="website-danger-btn" onClick={() => onDelete(item.id)}>刪除</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InquiriesPanel({ items, saving, onStatus }) {
  return (
    <section className="website-panel">
      <div className="website-panel-head">
        <div>
          <h2>聯絡詢問</h2>
          <p>查看品牌官網送出的詢問並更新處理狀態。</p>
        </div>
      </div>
      {!items.length ? (
        <div className="website-empty">目前尚無聯絡詢問。</div>
      ) : (
        <div className="website-table-wrap">
          <table>
            <thead>
              <tr>
                <th>聯絡人</th>
                <th>訊息</th>
                <th>來源</th>
                <th>狀態</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name || '-'}</strong>
                    <small>{item.email || '-'} / {item.phone || '-'}</small>
                  </td>
                  <td>{item.message}</td>
                  <td>{item.sourcePage || '-'}</td>
                  <td>
                    <select value={item.status || 'new'} disabled={saving} onChange={(e) => onStatus(item.id, e.target.value)}>
                      {inquiryStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
