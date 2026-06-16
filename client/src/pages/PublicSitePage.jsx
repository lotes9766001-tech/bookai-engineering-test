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

function parsePublicSitePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'site' || !parts[1]) return null;
  return {
    slug: decodeURIComponent(parts[1]),
    section: parts[2] || 'home',
    detailSlug: parts[3] ? decodeURIComponent(parts[3]) : ''
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

function publicPath(slug, path = '') {
  return `/site/${encodeURIComponent(slug)}${path}`;
}

function PublicImage({ src, alt, className = '' }) {
  if (!src) {
    return (
      <div className={`public-site-image-placeholder ${className}`} aria-hidden="true">
        <span>{alt?.slice(0, 1) || 'B'}</span>
      </div>
    );
  }

  return <img className={className} src={src} alt={alt || ''} loading="lazy" />;
}

function PublicSiteShell({ slug, site, children }) {
  const settings = site?.settings || {};
  const brandName = settings.brandName || settings.siteName || 'Brand Website';
  const nav = [
    ['首頁', publicPath(slug)],
    ['商品', publicPath(slug, '/products')],
    ['文章', publicPath(slug, '/posts')],
    ['FAQ', publicPath(slug, '/faq')],
    ['聯絡我們', publicPath(slug, '/contact')]
  ];

  return (
    <div className="public-site">
      <header className="public-site-header">
        <a className="public-site-brand" href={publicPath(slug)}>
          {settings.logoUrl ? <img src={settings.logoUrl} alt={brandName} /> : <span>{brandName.slice(0, 1)}</span>}
          <strong>{brandName}</strong>
        </a>
        <nav className="public-site-nav" aria-label="品牌官網導覽">
          {nav.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </header>

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
  return <div className="public-site-empty">{children}</div>;
}

function ProductCard({ slug, product }) {
  return (
    <article className="public-site-card">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h3>{product.name}</h3>
        <p>{product.shortDescription || product.description || '歡迎聯絡我們了解更多資訊。'}</p>
        <strong>{money(product.price)}</strong>
        <a className="public-site-link" href={publicPath(slug, `/products/${product.slug}`)}>查看詳情</a>
      </div>
    </article>
  );
}

function PostCard({ slug, post }) {
  return (
    <article className="public-site-card">
      <PublicImage src={post.coverImageUrl} alt={post.title} />
      <div>
        {post.category && <span className="public-site-chip">{post.category}</span>}
        <h3>{post.title}</h3>
        <p>{post.summary || '閱讀品牌最新消息與專業內容。'}</p>
        <small>{formatDate(post.publishedAt || post.createdAt)}</small>
        <a className="public-site-link" href={publicPath(slug, `/posts/${post.slug}`)}>閱讀更多</a>
      </div>
    </article>
  );
}

function PublicHome({ slug, site, products, posts }) {
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
            <a href={publicPath(slug, '/products')}>{hero.buttonText || '查看商品'}</a>
            <a href={hero.buttonUrl || publicPath(slug, '/contact')} className="secondary">聯絡我們</a>
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
          <a href={publicPath(slug, '/products')}>全部商品</a>
        </div>
        {featuredProducts.length ? (
          <div className="public-site-card-grid">
            {featuredProducts.map((product) => <ProductCard key={product.id || product.slug} slug={slug} product={product} />)}
          </div>
        ) : (
          <EmptyState>目前尚無商品展示</EmptyState>
        )}
      </section>

      <section className="public-site-section">
        <div className="public-site-section-head">
          <span>News</span>
          <h2>最新文章</h2>
          <a href={publicPath(slug, '/posts')}>全部文章</a>
        </div>
        {latestPosts.length ? (
          <div className="public-site-card-grid">
            {latestPosts.map((post) => <PostCard key={post.id || post.slug} slug={slug} post={post} />)}
          </div>
        ) : (
          <EmptyState>目前尚無最新消息</EmptyState>
        )}
      </section>

      <section className="public-site-section soft">
        <div className="public-site-section-head">
          <span>FAQ</span>
          <h2>常見問題</h2>
          <a href={publicPath(slug, '/faq')}>查看 FAQ</a>
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
        <p>留下需求，我們會盡快與您聯繫。</p>
        <a href={publicPath(slug, '/contact')}>聯絡我們</a>
      </section>
    </>
  );
}

function PublicProductsPage({ slug, products }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>Products</span>
        <h1>商品展示</h1>
      </div>
      {products.length ? (
        <div className="public-site-card-grid">
          {products.map((product) => <ProductCard key={product.id || product.slug} slug={slug} product={product} />)}
        </div>
      ) : (
        <EmptyState>目前尚無商品展示</EmptyState>
      )}
    </section>
  );
}

function PublicProductDetail({ slug, product }) {
  return (
    <section className="public-site-detail">
      <PublicImage src={product.imageUrl} alt={product.name} />
      <div>
        {product.category && <span className="public-site-chip">{product.category}</span>}
        <h1>{product.name}</h1>
        <strong>{money(product.price)}</strong>
        {product.compareAtPrice > 0 && <small>原參考價 {money(product.compareAtPrice)}</small>}
        {textParagraphs(product.description || product.shortDescription).map((line) => <p key={line}>{line}</p>)}
        <a className="public-site-primary-link" href={publicPath(slug, `/contact?product=${encodeURIComponent(product.name || '')}`)}>詢問此商品</a>
      </div>
    </section>
  );
}

function PublicPostsPage({ slug, posts }) {
  return (
    <section className="public-site-section public-site-page-section">
      <div className="public-site-section-head">
        <span>News</span>
        <h1>最新消息</h1>
      </div>
      {posts.length ? (
        <div className="public-site-card-grid">
          {posts.map((post) => <PostCard key={post.id || post.slug} slug={slug} post={post} />)}
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

function PublicContactPage({ slug, site }) {
  const settings = site.settings || {};
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event) {
    event.preventDefault();
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
        <p>歡迎留下需求、商品詢問或合作訊息。</p>
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
        <button type="submit" disabled={saving}>{saving ? '送出中...' : '送出詢問'}</button>
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

  if (!route) return <PublicNotice title="網站不存在或尚未開放" message="請確認網址是否正確。" />;
  if (loading) return <PublicNotice title="載入中" message="正在載入品牌官網內容..." />;
  if (error) return <PublicNotice title={error} message="請確認網站網址，或稍後再試。" />;
  if (!site) return <PublicNotice title="網站不存在或尚未開放" message="請確認網址是否正確。" />;

  let content = null;
  if (route.section === 'home') {
    content = <PublicHome slug={route.slug} site={site} products={products} posts={posts} />;
  } else if (route.section === 'products' && route.detailSlug) {
    content = detail ? <PublicProductDetail slug={route.slug} product={detail} /> : <EmptyState>找不到商品</EmptyState>;
  } else if (route.section === 'products') {
    content = <PublicProductsPage slug={route.slug} products={products} />;
  } else if (route.section === 'posts' && route.detailSlug) {
    content = detail ? <PublicPostDetail post={detail} /> : <EmptyState>找不到文章</EmptyState>;
  } else if (route.section === 'posts') {
    content = <PublicPostsPage slug={route.slug} posts={posts} />;
  } else if (route.section === 'faq') {
    content = <PublicFaqPage faqs={faqs} />;
  } else if (route.section === 'contact') {
    content = <PublicContactPage slug={route.slug} site={site} />;
  } else {
    content = <EmptyState>網站不存在或尚未開放</EmptyState>;
  }

  return <PublicSiteShell slug={route.slug} site={site}>{content}</PublicSiteShell>;
}
