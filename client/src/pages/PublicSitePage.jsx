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
  if (!amount) return '歡迎洽詢';
  return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
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

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`public-site-image-placeholder ${className}`} aria-hidden="true">
        <span>{alt?.slice(0, 1) || 'B'}</span>
      </div>
    );
  }

  return <img className={className} src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
}

function PublicLogo({ src, brandName }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <span>{brandName.slice(0, 1)}</span>;
  return <img src={src} alt={brandName} onError={() => setFailed(true)} />;
}

function PublicSiteShell({ slug, site, preview, children }) {
  const settings = site?.settings || {};
  const brandName = settings.brandName || settings.siteName || 'Brand Website';
  const nav = [
    ['首頁', publicPath(slug, '', preview)],
    ['商品', publicPath(slug, '/products', preview)],
    ['文章', publicPath(slug, '/posts', preview)],
    ['FAQ', publicPath(slug, '/faq', preview)],
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
          <p>{settings.seoDescription || '以 BookAI 建立的品牌展示網站。'}</p>
        </div>
        <div className="public-site-footer-links">
          {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}
          {settings.contactPhone && <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a>}
          {settings.lineUrl && <a href={settings.lineUrl} target="_blank" rel="noreferrer">LINE</a>}
          {settings.facebookUrl && <a href={settings.facebookUrl} target="_blank" rel="noreferrer">Facebook</a>}
          {settings.instagramUrl && <a href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}
          {settings.address && <span>{settings.address}</span>}
          <small>Powered by BookAI</small>
        </div>
      </footer>
    </div>
  );
}

function PublicNotice({ title, message }) {
  return (
    <div className="public-site public-site-notice-page">
      <div className="public-site-notice">
        <span>BookAI Website</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">回到 BookAI</a>
      </div>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="public-site-empty">
      <strong>{children}</strong>
      <span>請稍後再回來查看，或透過聯絡表單詢問品牌團隊。</span>
    </div>
  );
}

function ProductCard({ slug, product, preview }) {
  return (
    <article className="public-site-card">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h3>{product.name}</h3>
        <p>{product.shortDescription || product.description || '歡迎聯絡我們了解更多資訊。'}</p>
        <strong>{money(product.price)}</strong>
        <a className="public-site-link" href={publicPath(slug, `/products/${product.slug}`, preview)}>查看詳情</a>
      </div>
    </article>
  );
}

function PostCard({ slug, post, preview }) {
  return (
    <article className="public-site-card">
      <PublicImage src={post.coverImageUrl} alt={post.title} />
      <div>
        {post.category && <span className="public-site-chip">{post.category}</span>}
        <h3>{post.title}</h3>
        <p>{post.summary || '閱讀品牌最新消息與專業內容。'}</p>
        <small>{formatDate(post.publishedAt || post.createdAt)}</small>
        <a className="public-site-link" href={publicPath(slug, `/posts/${post.slug}`, preview)}>閱讀更多</a>
      </div>
    </article>
  );
}

function PublicHome({ slug, site, products, posts, preview }) {
  const settings = site.settings || {};
  const banners = site.banners || [];
  const sections = site.homeSections || [];
  const faqs = site.faqs || [];
  const hero = banners[0] || {};
  const brandName = settings.brandName || settings.siteName || '品牌官網';
  const featuredProducts = products.filter((item) => item.isFeatured).concat(products.filter((item) => !item.isFeatured)).slice(0, 3);
  const latestPosts = posts.slice(0, 3);

  return (
    <>
      <section className="public-site-hero">
        <div>
          <span>{settings.siteName || 'Brand Website'}</span>
          <h1>{hero.title || brandName}</h1>
          <p>{hero.subtitle || settings.seoDescription || '探索品牌商品、服務內容與最新消息。'}</p>
          <div className="public-site-actions">
            <a href={publicPath(slug, '/products', preview)}>{hero.buttonText || '查看商品'}</a>
            <a href={hero.buttonUrl || publicPath(slug, '/contact', preview)} className="secondary">聯絡我們</a>
          </div>
        </div>
        <PublicImage src={hero.imageUrl || settings.logoUrl} alt={brandName} />
      </section>

      <section className="public-site-section">
        <div className="public-site-section-head">
          <span>Brand Story</span>
          <h2>品牌亮點</h2>
        </div>
        {sections.length ? (
          <div className="public-site-section-grid">
            {sections.map((section) => (
              <article key={section.id || section.title} className="public-site-feature">
                <PublicImage src={section.imageUrl} alt={section.title} />
                <div>
                  <span>{section.sectionType || 'feature'}</span>
                  <h3>{section.title}</h3>
                  <p>{section.subtitle || section.content}</p>
                  {section.buttonUrl && <a className="public-site-link" href={section.buttonUrl}>{section.buttonText || '了解更多'}</a>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState>目前尚無首頁區塊</EmptyState>
        )}
      </section>

      <section className="public-site-section soft">
        <div className="public-site-section-head">
          <span>Products</span>
          <h2>精選商品</h2>
          <a href={publicPath(slug, '/products', preview)}>全部商品</a>
        </div>
        {featuredProducts.length ? (
          <div className="public-site-card-grid">
            {featuredProducts.map((product) => <ProductCard key={product.id || product.slug} slug={slug} product={product} preview={preview} />)}
          </div>
        ) : (
          <EmptyState>目前尚無商品展示</EmptyState>
        )}
      </section>

      <section className="public-site-section">
        <div className="public-site-section-head">
          <span>News</span>
          <h2>最新文章</h2>
          <a href={publicPath(slug, '/posts', preview)}>全部文章</a>
        </div>
        {latestPosts.length ? (
          <div className="public-site-card-grid">
            {latestPosts.map((post) => <PostCard key={post.id || post.slug} slug={slug} post={post} preview={preview} />)}
          </div>
        ) : (
          <EmptyState>目前尚無最新消息</EmptyState>
        )}
      </section>

      <section className="public-site-section soft">
        <div className="public-site-section-head">
          <span>FAQ</span>
          <h2>常見問題</h2>
          <a href={publicPath(slug, '/faq', preview)}>查看 FAQ</a>
        </div>
        {faqs.length ? (
          <div className="public-site-faq-list">
            {faqs.slice(0, 4).map((faq) => (
              <details key={faq.id || faq.question} open>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState>目前尚無常見問題</EmptyState>
        )}
      </section>

      <section className="public-site-cta">
        <h2>想了解更多？</h2>
        <p>{preview ? '預覽模式可檢查表單畫面，但不會建立詢問紀錄。' : '留下需求，我們會盡快與您聯繫。'}</p>
        <a href={publicPath(slug, '/contact', preview)}>聯絡我們</a>
      </section>
    </>
  );
}

function PublicProductsPage({ slug, products, preview }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>Products</span>
        <h1>商品展示</h1>
      </div>
      {products.length ? (
        <div className="public-site-card-grid">
          {products.map((product) => <ProductCard key={product.id || product.slug} slug={slug} product={product} preview={preview} />)}
        </div>
      ) : (
        <EmptyState>目前尚無商品展示</EmptyState>
      )}
    </section>
  );
}

function PublicProductDetail({ slug, product, preview }) {
  return (
    <section className="public-site-detail">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h1>{product.name}</h1>
        <strong>{money(product.price)}</strong>
        {product.compareAtPrice > 0 && <small>原參考價 {money(product.compareAtPrice)}</small>}
        {textParagraphs(product.description || product.shortDescription).map((line) => <p key={line}>{line}</p>)}
        <a className="public-site-primary-link" href={publicPath(slug, `/contact?product=${encodeURIComponent(product.name || '')}`, preview)}>詢問此商品</a>
      </div>
    </section>
  );
}

function PublicPostsPage({ slug, posts, preview }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>News</span>
        <h1>最新消息</h1>
      </div>
      {posts.length ? (
        <div className="public-site-card-grid">
          {posts.map((post) => <PostCard key={post.id || post.slug} slug={slug} post={post} preview={preview} />)}
        </div>
      ) : (
        <EmptyState>目前尚無最新消息</EmptyState>
      )}
    </section>
  );
}

function PublicPostDetail({ post }) {
  return (
    <article className="public-site-article">
      <div>
        {post.category && <span className="public-site-chip">{post.category}</span>}
        <h1>{post.title}</h1>
        <p>{post.summary}</p>
        <small>{formatDate(post.publishedAt || post.createdAt)}</small>
      </div>
      <PublicImage src={post.coverImageUrl} alt={post.title} />
      <div className="public-site-article-body">
        {textParagraphs(post.content || post.summary).map((line) => <p key={line}>{line}</p>)}
      </div>
    </article>
  );
}

function PublicFaqPage({ faqs }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>FAQ</span>
        <h1>常見問題</h1>
      </div>
      {faqs.length ? (
        <div className="public-site-faq-list">
          {faqs.map((faq) => (
            <details key={faq.id || faq.question} open>
              <summary>{faq.question}</summary>
              {faq.category && <span>{faq.category}</span>}
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState>目前尚無常見問題</EmptyState>
      )}
    </section>
  );
}

function PublicContactPage({ slug, site, preview }) {
  const settings = site.settings || {};
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (preview) {
      setSuccess('預覽模式不會送出詢問。');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await createPublicInquiry(slug, {
        ...form,
        sourcePage: window.location.pathname
      });
      setSuccess('已送出，我們會盡快與您聯繫。');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      setError(err.message || '送出失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="public-site-contact">
      <div>
        <span>Contact</span>
        <h1>聯絡我們</h1>
        <p>{preview ? '目前為預覽模式，送出按鈕不會建立後台詢問紀錄。' : '歡迎留下需求、商品詢問或合作訊息。'}</p>
        <dl>
          {settings.contactEmail && <><dt>Email</dt><dd><a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></dd></>}
          {settings.contactPhone && <><dt>電話</dt><dd><a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a></dd></>}
          {settings.lineUrl && <><dt>LINE</dt><dd><a href={settings.lineUrl} target="_blank" rel="noreferrer">加入 LINE</a></dd></>}
          {settings.facebookUrl && <><dt>Facebook</dt><dd><a href={settings.facebookUrl} target="_blank" rel="noreferrer">Facebook</a></dd></>}
          {settings.instagramUrl && <><dt>Instagram</dt><dd><a href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram</a></dd></>}
          {settings.address && <><dt>地址</dt><dd>{settings.address}</dd></>}
        </dl>
      </div>

      <form onSubmit={submit}>
        <label>
          <span>姓名</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          <span>電話</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          <span>詢問內容</span>
          <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </label>
        {error && <div className="public-site-form-error">{error}</div>}
        {success && <div className="public-site-form-success">{success}</div>}
        <button type="submit" disabled={saving}>{saving ? '送出中...' : preview ? '預覽模式不送出' : '送出詢問'}</button>
      </form>
    </section>
  );
}

export default function PublicSitePage() {
  const route = useMemo(() => parsePublicSitePath(window.location.pathname), []);
  const [site, setSite] = useState(null);
  const [products, setProducts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!route) return;
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      setDetail(null);
      try {
        if (route.preview) {
          const previewData = await getPreviewData();
          if (!alive) return;
          const settings = previewData.site?.settings || {};
          if (settings.siteSlug && settings.siteSlug !== route.slug) {
            throw new Error('預覽網址與目前網站 site_slug 不一致');
          }
          setSite(previewData.site);
          document.title = settings.seoTitle || settings.brandName || settings.siteName || '品牌官網預覽';

          if (route.section === 'home') {
            setProducts(previewData.products);
            setPosts(previewData.posts);
            setFaqs(previewData.site.faqs);
          } else if (route.section === 'products' && route.detailSlug) {
            setDetail(findBySlug(previewData.products, route.detailSlug));
          } else if (route.section === 'products') {
            setProducts(previewData.products);
          } else if (route.section === 'posts' && route.detailSlug) {
            setDetail(findBySlug(previewData.posts, route.detailSlug));
          } else if (route.section === 'posts') {
            setPosts(previewData.posts);
          } else if (route.section === 'faq') {
            setFaqs(previewData.site.faqs);
          }
          return;
        }

        const nextSite = await getPublicSite(route.slug);
        if (!alive) return;
        setSite(nextSite);

        const settings = nextSite?.settings || {};
        document.title = settings.seoTitle || settings.brandName || settings.siteName || '品牌官網';

        if (route.section === 'home') {
          const [nextProducts, nextPosts] = await Promise.all([
            getPublicProducts(route.slug).catch(() => []),
            getPublicPosts(route.slug).catch(() => [])
          ]);
          if (!alive) return;
          setProducts(Array.isArray(nextProducts) ? nextProducts : []);
          setPosts(Array.isArray(nextPosts) ? nextPosts : []);
          setFaqs(Array.isArray(nextSite?.faqs) ? nextSite.faqs : []);
        } else if (route.section === 'products' && route.detailSlug) {
          setDetail(await getPublicProduct(route.slug, route.detailSlug));
        } else if (route.section === 'products') {
          const nextProducts = await getPublicProducts(route.slug);
          if (!alive) return;
          setProducts(Array.isArray(nextProducts) ? nextProducts : []);
        } else if (route.section === 'posts' && route.detailSlug) {
          setDetail(await getPublicPost(route.slug, route.detailSlug));
        } else if (route.section === 'posts') {
          const nextPosts = await getPublicPosts(route.slug);
          if (!alive) return;
          setPosts(Array.isArray(nextPosts) ? nextPosts : []);
        } else if (route.section === 'faq') {
          const nextFaqs = await getPublicFaqs(route.slug);
          if (!alive) return;
          setFaqs(Array.isArray(nextFaqs) ? nextFaqs : []);
        }
      } catch (err) {
        if (!alive) return;
        setError(err.status === 403 ? '網站尚未開放' : err.message || '網站不存在或尚未開放');
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [route]);

  if (!route) return <PublicNotice title="網站不存在" message="請確認網址是否正確，或回到 BookAI 後台取得正確的公開網址。" />;
  if (loading) return <PublicNotice title="載入中" message="正在載入品牌官網內容，請稍候。" />;
  if (error) return <PublicNotice title={error} message={error === '網站尚未開放' ? '此網站尚未發布，請稍後再試。' : '請確認網站網址，或稍後再試。'} />;
  if (!site) return <PublicNotice title="網站不存在" message="請確認網址是否正確。" />;

  let content = null;
  if (route.section === 'home') {
    content = <PublicHome slug={route.slug} site={site} products={products} posts={posts} preview={route.preview} />;
  } else if (route.section === 'products' && route.detailSlug) {
    content = detail ? <PublicProductDetail slug={route.slug} product={detail} preview={route.preview} /> : <EmptyState>找不到商品</EmptyState>;
  } else if (route.section === 'products') {
    content = <PublicProductsPage slug={route.slug} products={products} preview={route.preview} />;
  } else if (route.section === 'posts' && route.detailSlug) {
    content = detail ? <PublicPostDetail post={detail} /> : <EmptyState>找不到文章</EmptyState>;
  } else if (route.section === 'posts') {
    content = <PublicPostsPage slug={route.slug} posts={posts} preview={route.preview} />;
  } else if (route.section === 'faq') {
    content = <PublicFaqPage faqs={faqs} />;
  } else if (route.section === 'contact') {
    content = <PublicContactPage slug={route.slug} site={site} preview={route.preview} />;
  } else {
    content = <EmptyState>網站不存在或尚未開放</EmptyState>;
  }

  return <PublicSiteShell slug={route.slug} site={site} preview={route.preview}>{content}</PublicSiteShell>;
}
