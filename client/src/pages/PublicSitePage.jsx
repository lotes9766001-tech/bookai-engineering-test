import React, { useEffect, useMemo, useState } from 'react';
import {
  createPublicInquiry,
  getPublicFaqs,
  getPublicPost,
  getPublicPosts,
  getPublicProduct,
  getPublicProducts,
  getPublicSite
} from '../lib/publicSiteApi';
import {
  getWebsiteSettings,
  listWebsiteResource
} from '../lib/websiteApi';
import { resolveAssetUrl } from '../lib/assetUrl';

function parsePublicSitePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (!['site', 'site-preview'].includes(parts[0]) || !parts[1]) return null;
  return {
    slug: decodeURIComponent(parts[1]),
    section: parts[2] || 'home',
    detailSlug: parts[3] ? decodeURIComponent(parts[3]) : '',
    preview: parts[0] === 'site-preview'
  };
}

function money(value) {
  const amount = Number(value || 0);
  if (!amount) return '價格請洽詢';
  return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

function formatDate(value) {
  if (!value) return '尚未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未設定';
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function textParagraphs(value) {
  return String(value || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicPath(slug, path = '', preview = false) {
  return `/${preview ? 'site-preview' : 'site'}/${encodeURIComponent(slug)}${path}`;
}

function publishedItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item.status === 'published');
}

function activeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item.isActive);
}

function findBySlug(items, slug) {
  return (Array.isArray(items) ? items : []).find((item) => item.slug === slug) || null;
}

async function getPreviewData() {
  const [settings, banners, sections, products, posts, faqs] = await Promise.all([
    getWebsiteSettings(),
    listWebsiteResource('banners'),
    listWebsiteResource('home-sections'),
    listWebsiteResource('products'),
    listWebsiteResource('posts'),
    listWebsiteResource('faqs')
  ]);

  return {
    site: {
      settings,
      banners: activeItems(banners),
      homeSections: activeItems(sections),
      faqs: activeItems(faqs)
    },
    products: publishedItems(products),
    posts: publishedItems(posts)
  };
}

function PublicImage({ src, alt, className = '' }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveAssetUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!resolvedSrc || failed) {
    return (
      <div className={`public-site-image-placeholder ${className}`} aria-hidden="true">
        <span>{alt?.slice(0, 1) || 'B'}</span>
        {alt && <small>{alt}</small>}
      </div>
    );
  }

  return <img className={className} src={resolvedSrc} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
}

function PublicLogo({ src, brandName }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveAssetUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!resolvedSrc || failed) return <span>{brandName.slice(0, 1)}</span>;
  return <img src={resolvedSrc} alt={brandName} onError={() => setFailed(true)} />;
}

function PublicSiteShell({ slug, site, preview, children }) {
  const settings = site?.settings || {};
  const brandName = settings.brandName || settings.siteName || '品牌官網';
  const nav = [
    ['首頁', publicPath(slug, '', preview)],
    ['精選商品', publicPath(slug, '/products', preview)],
    ['最新消息', publicPath(slug, '/posts', preview)],
    ['常見問題', publicPath(slug, '/faq', preview)],
    ['聯絡我們', publicPath(slug, '/contact', preview)]
  ];

  return (
    <div className="public-site">
      <header className="public-site-header">
        <a className="public-site-brand" href={publicPath(slug, '', preview)}>
          <PublicLogo src={settings.logoUrl} brandName={brandName} />
          <strong>{brandName}</strong>
        </a>
        <nav className="public-site-nav" aria-label="品牌官網導覽">
          {nav.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </header>

      {preview && (
        <div className="public-site-preview-banner">
          預覽模式：此頁僅供後台檢查，未發布網站不會公開顯示，聯絡表單不會送出。
        </div>
      )}

      <main>{children}</main>

      <footer className="public-site-footer">
        <div>
          <strong>{brandName}</strong>
          <p>{settings.seoDescription || '由 BookAI 協助建立品牌官網，集中展示商品、內容與聯絡方式。'}</p>
        </div>
        <div className="public-site-footer-links">
          {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}
          {settings.contactPhone && <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a>}
          {settings.lineUrl && <a href={settings.lineUrl} target="_blank" rel="noreferrer">LINE</a>}
          {settings.facebookUrl && <a href={settings.facebookUrl} target="_blank" rel="noreferrer">Facebook</a>}
          {settings.instagramUrl && <a href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}
          {settings.address && <span>{settings.address}</span>}
          <small>由 BookAI 提供網站技術</small>
        </div>
      </footer>
    </div>
  );
}

function PublicNotice({ title, message }) {
  return (
    <div className="public-site public-site-notice-page">
      <div className="public-site-notice">
        <span>BookAI 品牌官網</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">返回 BookAI</a>
      </div>
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="public-site-empty">
      <strong>{title}</strong>
      {message && <span>{message}</span>}
    </div>
  );
}

function ProductCard({ slug, preview, product }) {
  return (
    <article className="public-site-card">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h3>{product.name}</h3>
        <p>{product.shortDescription || product.description || '品牌尚未補充商品描述。'}</p>
        <strong>{money(product.price)}</strong>
        <a className="public-site-link" href={publicPath(slug, `/products/${encodeURIComponent(product.slug)}`, preview)}>查看商品</a>
      </div>
    </article>
  );
}

function PostCard({ slug, preview, post }) {
  return (
    <article className="public-site-card">
      <PublicImage src={post.coverImageUrl} alt={post.title} />
      <div>
        <span className="public-site-chip">{post.category || '最新消息'}</span>
        <h3>{post.title}</h3>
        <p>{post.summary || '品牌尚未補充文章摘要。'}</p>
        <small>{formatDate(post.publishedAt || post.createdAt)}</small>
        <a className="public-site-link" href={publicPath(slug, `/posts/${encodeURIComponent(post.slug)}`, preview)}>閱讀文章</a>
      </div>
    </article>
  );
}

function PublicHome({ slug, preview, site, products, posts }) {
  const settings = site.settings || {};
  const banners = site.banners || [];
  const sections = site.homeSections || [];
  const faqs = site.faqs || [];
  const hero = banners[0];
  const brandName = settings.brandName || settings.siteName || '品牌官網';
  const featuredProducts = products.filter((item) => item.isFeatured).slice(0, 3);
  const visibleProducts = (featuredProducts.length ? featuredProducts : products).slice(0, 3);
  const visiblePosts = posts.slice(0, 3);
  const visibleFaqs = faqs.slice(0, 4);

  return (
    <>
      <section className="public-site-hero">
        <div>
          <span>{brandName}</span>
          <h1>{hero?.title || settings.seoTitle || brandName}</h1>
          <p>{hero?.subtitle || settings.seoDescription || '用品牌官網展示商品、故事與服務資訊。'}</p>
          <div className="public-site-actions">
            <a href={publicPath(slug, hero?.buttonUrl || '/products', preview)}>{hero?.buttonText || '查看商品'}</a>
            <a className="secondary" href={publicPath(slug, '/contact', preview)}>聯絡我們</a>
          </div>
        </div>
        <PublicImage src={hero?.imageUrl || settings.logoUrl} alt={hero?.title || brandName} />
      </section>

      {sections.length > 0 && (
        <section className="public-site-section">
          <div className="public-site-section-head">
            <span>品牌故事</span>
            <h2>品牌亮點</h2>
          </div>
          <div className="public-site-section-grid">
            {sections.map((section) => (
              <article className="public-site-feature" key={section.id}>
                <PublicImage src={section.imageUrl} alt={section.title} />
                <div>
                  <h3>{section.title}</h3>
                  {section.subtitle && <strong>{section.subtitle}</strong>}
                  {textParagraphs(section.content).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {section.buttonText && section.buttonUrl && <a className="public-site-link" href={publicPath(slug, section.buttonUrl, preview)}>{section.buttonText}</a>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="public-site-section soft">
        <div className="public-site-section-head">
          <span>精選商品</span>
          <h2>推薦商品</h2>
          <a href={publicPath(slug, '/products', preview)}>查看全部商品</a>
        </div>
        {visibleProducts.length ? (
          <div className="public-site-card-grid">
            {visibleProducts.map((product) => <ProductCard key={product.id} slug={slug} preview={preview} product={product} />)}
          </div>
        ) : (
          <EmptyState title="目前尚無商品" message="品牌尚未發布商品，請稍後再回來查看。" />
        )}
      </section>

      <section className="public-site-section">
        <div className="public-site-section-head">
          <span>最新消息</span>
          <h2>品牌文章</h2>
          <a href={publicPath(slug, '/posts', preview)}>查看全部文章</a>
        </div>
        {visiblePosts.length ? (
          <div className="public-site-card-grid">
            {visiblePosts.map((post) => <PostCard key={post.id} slug={slug} preview={preview} post={post} />)}
          </div>
        ) : (
          <EmptyState title="目前尚無最新文章" message="歡迎稍後回來查看品牌消息與選物指南。" />
        )}
      </section>

      <section className="public-site-section soft">
        <div className="public-site-section-head">
          <span>常見問題</span>
          <h2>顧客常見問題</h2>
          <a href={publicPath(slug, '/faq', preview)}>查看全部 FAQ</a>
        </div>
        {visibleFaqs.length ? (
          <div className="public-site-faq-list">
            {visibleFaqs.map((faq) => (
              <details key={faq.id} open>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="目前尚無 FAQ" message="品牌尚未建立常見問題。" />
        )}
      </section>

      <section className="public-site-cta">
        <h2>想了解商品或合作方式？</h2>
        <p>留下需求後，品牌團隊會再與你聯繫。</p>
        <a href={publicPath(slug, '/contact', preview)}>前往聯絡表單</a>
      </section>
    </>
  );
}

function PublicProductsPage({ slug, preview, products }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>精選商品</span>
        <h1>商品展示</h1>
      </div>
      {products.length ? (
        <div className="public-site-card-grid">
          {products.map((product) => <ProductCard key={product.id} slug={slug} preview={preview} product={product} />)}
        </div>
      ) : (
        <EmptyState title="目前尚無商品" message="品牌尚未發布商品，請稍後再回來查看。" />
      )}
    </section>
  );
}

function PublicProductDetail({ slug, preview, product }) {
  if (!product) {
    return <EmptyState title="找不到這個商品" message="商品可能尚未發布或網址不正確。" />;
  }
  return (
    <section className="public-site-detail">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h1>{product.name}</h1>
        <strong>{money(product.price)}</strong>
        {Number(product.compareAtPrice || 0) > Number(product.price || 0) && <small>比較價 {money(product.compareAtPrice)}</small>}
        {textParagraphs(product.description || product.shortDescription).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <a className="public-site-primary-link" href={publicPath(slug, '/contact', preview)}>詢問這項商品</a>
      </div>
    </section>
  );
}

function PublicPostsPage({ slug, preview, posts }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>最新消息</span>
        <h1>品牌文章</h1>
      </div>
      {posts.length ? (
        <div className="public-site-card-grid">
          {posts.map((post) => <PostCard key={post.id} slug={slug} preview={preview} post={post} />)}
        </div>
      ) : (
        <EmptyState title="目前尚無最新文章" message="歡迎稍後回來查看品牌消息與選物指南。" />
      )}
    </section>
  );
}

function PublicPostDetail({ post }) {
  if (!post) return <EmptyState title="找不到這篇文章" message="文章可能尚未發布或網址不正確。" />;
  return (
    <article className="public-site-article">
      <PublicImage src={post.coverImageUrl} alt={post.title} />
      <span className="public-site-chip">{post.category || '最新消息'} {formatDate(post.publishedAt || post.createdAt)}</span>
      <h1>{post.title}</h1>
      <div className="public-site-article-body">
        {textParagraphs(post.content || post.summary).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </article>
  );
}

function PublicFaqPage({ faqs }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>常見問題</span>
        <h1>FAQ</h1>
      </div>
      {faqs.length ? (
        <div className="public-site-faq-list">
          {faqs.map((faq) => (
            <details key={faq.id} open>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="目前尚無 FAQ" message="品牌尚未建立常見問題。" />
      )}
    </section>
  );
}

function PublicContactPage({ slug, preview, site }) {
  const settings = site.settings || {};
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setNotice('');
    setError('');
    if (preview) {
      setNotice('預覽模式下不會建立詢問紀錄。');
      return;
    }
    setSaving(true);
    try {
      await createPublicInquiry(slug, { ...form, sourcePath: window.location.pathname });
      setNotice('詢問已送出，品牌團隊會再與你聯繫。');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      setError(err.message || '詢問送出失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="public-site-contact">
      <div>
        <span>聯絡我們</span>
        <h1>與品牌團隊聯繫</h1>
        <p>若想了解商品、出貨、合作或客製需求，請留下聯絡資訊。</p>
        <dl>
          {settings.contactEmail && <><dt>Email</dt><dd><a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></dd></>}
          {settings.contactPhone && <><dt>電話</dt><dd><a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a></dd></>}
          {settings.lineUrl && <><dt>LINE</dt><dd><a href={settings.lineUrl} target="_blank" rel="noreferrer">前往 LINE</a></dd></>}
          {settings.address && <><dt>地址</dt><dd>{settings.address}</dd></>}
        </dl>
        {preview && <p>預覽模式：此表單不會送出，也不會建立詢問紀錄。</p>}
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          <span>姓名</span>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="請輸入姓名" required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="hello@example.com" required />
        </label>
        <label>
          <span>電話</span>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="請輸入聯絡電話" />
        </label>
        <label>
          <span>詢問內容</span>
          <textarea value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="請簡述想了解的商品或服務。" required />
        </label>
        {notice && <div className="public-site-form-success">{notice}</div>}
        {error && <div className="public-site-form-error">{error}</div>}
        <button type="submit" disabled={saving}>{preview ? '預覽模式不送出' : saving ? '送出中...' : '送出詢問'}</button>
      </form>
    </section>
  );
}

export default function PublicSitePage() {
  const route = parsePublicSitePath(window.location.pathname);
  const [state, setState] = useState({ loading: true, error: '', site: null, products: [], posts: [], faqs: [], detail: null });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!route) {
        setState({ loading: false, error: '網址格式不正確。', site: null, products: [], posts: [], faqs: [], detail: null });
        return;
      }
      setState((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        let data;
        if (route.preview) {
          data = await getPreviewData();
        } else {
          const site = await getPublicSite(route.slug);
          const [products, posts, faqs] = await Promise.all([
            getPublicProducts(route.slug),
            getPublicPosts(route.slug),
            getPublicFaqs(route.slug)
          ]);
          data = { site, products, posts, faqs };
        }

        let detail = null;
        if (route.section === 'products' && route.detailSlug) {
          detail = route.preview ? findBySlug(data.products, route.detailSlug) : await getPublicProduct(route.slug, route.detailSlug);
        }
        if (route.section === 'posts' && route.detailSlug) {
          detail = route.preview ? findBySlug(data.posts, route.detailSlug) : await getPublicPost(route.slug, route.detailSlug);
        }

        if (active) {
          setState({
            loading: false,
            error: '',
            site: data.site,
            products: Array.isArray(data.products) ? data.products : [],
            posts: Array.isArray(data.posts) ? data.posts : [],
            faqs: Array.isArray(data.site?.faqs) ? data.site.faqs : Array.isArray(data.faqs) ? data.faqs : [],
            detail
          });
        }
      } catch (err) {
        if (active) {
          setState({ loading: false, error: err.message || '網站資料載入失敗。', site: null, products: [], posts: [], faqs: [], detail: null });
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [route?.slug, route?.section, route?.detailSlug, route?.preview]);

  const content = useMemo(() => {
    if (!route) return <PublicNotice title="找不到網站" message="請確認品牌官網網址是否正確。" />;
    if (state.loading) return <PublicNotice title="網站載入中" message="正在讀取品牌官網內容。" />;
    if (state.error) return <PublicNotice title="網站無法顯示" message={state.error} />;
    if (!state.site) return <PublicNotice title="找不到網站" message="品牌官網尚未建立或尚未發布。" />;

    if (route.section === 'products' && route.detailSlug) {
      return <PublicProductDetail slug={route.slug} preview={route.preview} product={state.detail} />;
    }
    if (route.section === 'products') {
      return <PublicProductsPage slug={route.slug} preview={route.preview} products={state.products} />;
    }
    if (route.section === 'posts' && route.detailSlug) {
      return <PublicPostDetail post={state.detail} />;
    }
    if (route.section === 'posts') {
      return <PublicPostsPage slug={route.slug} preview={route.preview} posts={state.posts} />;
    }
    if (route.section === 'faq') {
      return <PublicFaqPage faqs={state.faqs} />;
    }
    if (route.section === 'contact') {
      return <PublicContactPage slug={route.slug} preview={route.preview} site={state.site} />;
    }
    return <PublicHome slug={route.slug} preview={route.preview} site={state.site} products={state.products} posts={state.posts} />;
  }, [route, state]);

  if (!route || state.loading || state.error || !state.site) return content;

  return (
    <PublicSiteShell slug={route.slug} site={state.site} preview={route.preview}>
      {content}
    </PublicSiteShell>
  );
}
