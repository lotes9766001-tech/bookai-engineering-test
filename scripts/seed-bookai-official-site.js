import { db, initDb } from '../server/db.js';
import { PG_ENABLED, initPostgresDb, pgAll, pgOne, pgQuery, getPool } from '../server/pg-db.js';

const OWNER_EMAIL = process.env.BOOKAI_OFFICIAL_OWNER_EMAIL || 'lotes.9766001@gmail.com';
const TARGET_COMPANY_ID = Number(process.env.BOOKAI_OFFICIAL_COMPANY_ID || 0);
const SITE_SLUG = 'bookai-official';

const images = {
  logo: 'https://placehold.co/512x512/ffffff/0f172a.png?text=BookAI',
  favicon: 'https://placehold.co/128x128/0f172a/ffffff.png?text=BA',
  hero: 'https://placehold.co/1600x900/f8fafc/0f172a.png?text=BookAI+Official',
  banner: 'https://placehold.co/1600x900/e0f2fe/0f172a.png?text=BookAI+Operations',
  commerce: 'https://placehold.co/1200x800/ecfeff/155e75.png?text=Commerce+ERP',
  engineering: 'https://placehold.co/1200x800/f0fdf4/166534.png?text=Engineering+Estimate',
  cms: 'https://placehold.co/1200x800/eff6ff/1d4ed8.png?text=Website+CMS',
  radar: 'https://placehold.co/1200x800/f8fafc/334155.png?text=Tender+Radar',
  general: 'https://placehold.co/1200x800/ffffff/0f172a.png?text=BookAI+SaaS'
};

const settings = {
  siteSlug: SITE_SLUG,
  siteName: 'BookAI 官方網站',
  brandName: 'BookAI',
  logoUrl: images.logo,
  faviconUrl: images.favicon,
  primaryColor: '#0f172a',
  secondaryColor: '#2563eb',
  contactEmail: OWNER_EMAIL,
  contactPhone: '',
  lineUrl: '',
  facebookUrl: '',
  instagramUrl: '',
  address: '',
  seoTitle: 'BookAI｜電商與工程業的經營管理系統',
  seoDescription: 'BookAI 協助電商與工程業者管理商品、案場、成本、報價、官網內容與營運資料。',
  isPublished: 1
};

const banners = [
  {
    title: 'BookAI 讓經營資料回到老闆手上',
    subtitle: '從案場、商品、成本、報價到品牌官網，統一在一個後台管理。',
    imageUrl: images.hero,
    buttonText: '了解 BookAI',
    buttonUrl: `/site/${SITE_SLUG}/products`,
    sortOrder: 1,
    isActive: 1
  },
  {
    title: '把不值得的辛苦交給系統',
    subtitle: '讓經營者把時間用在真正重要的決策。',
    imageUrl: images.banner,
    buttonText: '申請測試',
    buttonUrl: `/site/${SITE_SLUG}/contact`,
    sortOrder: 2,
    isActive: 1
  }
];

const sections = [
  {
    sectionType: 'intro',
    title: 'BookAI 是什麼',
    subtitle: 'BookAI 是為小型企業、電商品牌與工程業者打造的經營管理系統。',
    content: 'BookAI 將商品、銷售、庫存、案場、報價、成本、收款與品牌官網內容集中在同一個後台，讓老闆能用更少時間掌握營運現況。',
    imageUrl: images.general,
    buttonText: '查看功能展示',
    buttonUrl: `/site/${SITE_SLUG}/products`,
    sortOrder: 1,
    isActive: 1
  },
  {
    sectionType: 'commerce',
    title: '電商版功能介紹',
    subtitle: '商品、庫存、進銷貨、應收應付與平台資料，協助品牌掌握營運基本盤。',
    content: 'BookAI 電商版適合正在整理商品、通路、成本與營收資料的品牌。第一階段聚焦經營資料整合，不包含購物車、金流與物流。',
    imageUrl: images.commerce,
    buttonText: '看電商版',
    buttonUrl: `/site/${SITE_SLUG}/products/bookai-commerce`,
    sortOrder: 2,
    isActive: 1
  },
  {
    sectionType: 'engineering',
    title: '工程版功能介紹',
    subtitle: '從接案、估價、案場、收款到毛利，讓工程老闆快速看懂每一案是否值得做。',
    content: '工程版支援案場中心、估價明細、單價成本、收款紀錄、工程月報與接案中心，適合油漆、水電、冷氣、裝修、防水等工程團隊。',
    imageUrl: images.engineering,
    buttonText: '看工程版',
    buttonUrl: `/site/${SITE_SLUG}/products/bookai-engineering`,
    sortOrder: 3,
    isActive: 1
  },
  {
    sectionType: 'cms',
    title: '品牌官網 CMS 功能介紹',
    subtitle: '不用另開一套系統，就能管理網站設定、Banner、功能展示、文章、FAQ 與聯絡詢問。',
    content: 'BookAI Website CMS 讓品牌官網內容與營運後台放在一起。公開網站只顯示已發布內容，預覽模式可先檢查未發布資料。',
    imageUrl: images.cms,
    buttonText: '查看文章',
    buttonUrl: `/site/${SITE_SLUG}/posts`,
    sortOrder: 4,
    isActive: 1
  },
  {
    sectionType: 'cta',
    title: '官方 LINE / 申請測試導流',
    subtitle: '想知道 BookAI 是否適合你的產業，可以先留下需求與聯絡方式。',
    content: '請透過聯絡表單描述你的產業、目前管理方式與想改善的問題。訊息會回到 BookAI 後台的聯絡詢問，方便後續追蹤。',
    imageUrl: images.radar,
    buttonText: '聯絡 BookAI',
    buttonUrl: `/site/${SITE_SLUG}/contact`,
    sortOrder: 5,
    isActive: 1
  }
];

const products = [
  {
    name: 'BookAI 電商版',
    slug: 'bookai-commerce',
    description: '協助電商品牌整理商品、庫存、進貨、銷貨、應收應付、平台營收與經營報表。',
    shortDescription: '電商品牌的經營資料後台。',
    imageUrl: images.commerce,
    category: '版本展示',
    sortOrder: 1
  },
  {
    name: 'BookAI 工程版',
    slug: 'bookai-engineering',
    description: '協助工程業者管理接案、案場、估價明細、單價成本、收款、毛利與工程月報。',
    shortDescription: '工程老闆的案場與估價管理系統。',
    imageUrl: images.engineering,
    category: '版本展示',
    sortOrder: 2
  },
  {
    name: 'BookAI 品牌官網後台',
    slug: 'bookai-website-cms',
    description: '管理網站設定、Banner、首頁區塊、功能展示、文章、FAQ、素材與聯絡詢問。',
    shortDescription: '品牌官網內容集中管理。',
    imageUrl: images.cms,
    category: 'CMS 功能',
    sortOrder: 3
  },
  {
    name: 'BookAI 接案中心 / 標案雷達',
    slug: 'bookai-lead-tender-radar',
    description: '集中追蹤案源，並以每日更新、關鍵字監控與截止日前提醒協助工程業者評估政府標案。',
    shortDescription: '案源追蹤與標案提醒。',
    imageUrl: images.radar,
    category: '工程功能',
    sortOrder: 4
  }
].map((item) => ({
  ...item,
  price: 0,
  compareAtPrice: 0,
  status: 'published',
  isFeatured: 1
}));

const posts = [
  {
    title: '為什麼小型企業需要自己的經營後台',
    slug: 'why-small-business-needs-erp',
    summary: '當資料散在 Excel、LINE、平台後台與紙本紀錄，老闆很難即時做決策。',
    content: '小型企業最常見的問題不是沒有努力，而是資料分散。BookAI 的目標是讓商品、案場、成本、收款與內容管理回到同一個後台，讓老闆可以快速判斷營收、成本、毛利與現金流。',
    coverImageUrl: images.general,
    category: '經營管理',
    publishedAt: '2026-06-01T10:00:00.000Z'
  },
  {
    title: '工程業估價與案場管理為什麼需要系統化',
    slug: 'engineering-estimate-jobsite-system',
    summary: '工程案場多、項目細、成本容易漏算，系統化估價能降低混亂與虧損風險。',
    content: '工程業者常在案場、報價、材料、工資、外包、收款之間來回切換。當估價明細與成本沒有被記錄清楚，毛利就很容易失真。BookAI 工程版以案場中心與估價明細協助老闆追蹤每一案的狀態。',
    coverImageUrl: images.engineering,
    category: '工程版',
    publishedAt: '2026-06-04T10:00:00.000Z'
  },
  {
    title: '電商品牌為什麼需要自己的官網內容後台',
    slug: 'commerce-brand-website-cms',
    summary: '品牌官網不只是形象頁，更是商品展示、內容教育與客戶詢問的入口。',
    content: '電商品牌常同時經營商城、社群與官網。當內容無法被快速更新，品牌訊息就會落後。BookAI Website CMS 讓網站設定、商品展示、文章、FAQ 與詢問集中管理，降低維護成本。',
    coverImageUrl: images.cms,
    category: '品牌官網',
    publishedAt: '2026-06-07T10:00:00.000Z'
  }
].map((item) => ({ ...item, status: 'published' }));

const faqs = [
  ['BookAI 適合哪些產業？', 'BookAI 目前聚焦電商品牌與工程業者，並保留服務業、工作室與其他小型企業延伸空間。', '產品定位', 1],
  ['BookAI 可以管理品牌官網嗎？', '可以。BookAI Website CMS 可管理網站設定、Banner、首頁區塊、功能展示、文章、FAQ、素材與聯絡詢問。', '品牌官網', 2],
  ['BookAI 工程版可以做什麼？', '工程版支援案場中心、估價明細、單價成本、收款紀錄、工程月報、接案中心與標案雷達。', '工程版', 3],
  ['BookAI 電商版可以做什麼？', '電商版支援商品、庫存、進貨、銷貨、應收應付、平台營收與經營報表。', '電商版', 4],
  ['如何申請測試？', '可以透過本網站聯絡表單留下產業、公司狀況與想改善的管理問題，BookAI 團隊會再回覆。', '申請測試', 5],
  ['是否需要自行架設網站？', '第一階段不需要。BookAI 已提供 /site/:slug 公開網站與 /site-preview/:slug 預覽模式，內容由後台管理。', '品牌官網', 6]
];

const assets = [
  ['logo', 'bookai-logo.png', 'image/png', images.logo],
  ['favicon', 'bookai-favicon.png', 'image/png', images.favicon],
  ['banner', 'bookai-hero.png', 'image/png', images.hero],
  ['feature', 'bookai-feature-commerce.png', 'image/png', images.commerce],
  ['feature', 'bookai-feature-engineering.png', 'image/png', images.engineering],
  ['general', 'bookai-general.png', 'image/png', images.general]
];

const replaceTables = [
  'website_banners',
  'website_home_sections',
  'website_products',
  'website_posts',
  'website_faqs',
  'website_assets'
];

function log(message) {
  console.log(`[bookai-official-seed] ${message}`);
}

async function sqliteTargetCompany() {
  if (TARGET_COMPANY_ID) return db.prepare('SELECT * FROM companies WHERE id = ?').get(TARGET_COMPANY_ID);
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(OWNER_EMAIL);
  if (!user) return null;
  return db.prepare(`
    SELECT c.*, cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = ?
    ORDER BY CASE cu.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, cu.id ASC
    LIMIT 1
  `).get(user.id);
}

async function pgTargetCompany() {
  if (TARGET_COMPANY_ID) return pgOne('SELECT * FROM companies WHERE id = $1', [TARGET_COMPANY_ID]);
  const user = await pgOne('SELECT id, email FROM users WHERE email = $1', [OWNER_EMAIL]);
  if (!user) return null;
  return pgOne(`
    SELECT c.*, cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = $1
    ORDER BY CASE cu.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, cu.id ASC
    LIMIT 1
  `, [user.id]);
}

function sqliteSeed(companyId) {
  const conflict = db.prepare('SELECT company_id FROM website_settings WHERE site_slug = ? AND company_id <> ?').get(SITE_SLUG, companyId);
  if (conflict) throw new Error(`site_slug ${SITE_SLUG} already belongs to company #${conflict.company_id}`);

  db.prepare(`
    INSERT INTO website_settings (
      company_id, site_slug, site_name, brand_name, logo_url, favicon_url,
      primary_color, secondary_color, contact_email, contact_phone, line_url,
      facebook_url, instagram_url, address, seo_title, seo_description,
      is_published, created_at, updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      site_slug = excluded.site_slug,
      site_name = excluded.site_name,
      brand_name = excluded.brand_name,
      logo_url = excluded.logo_url,
      favicon_url = excluded.favicon_url,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      line_url = excluded.line_url,
      facebook_url = excluded.facebook_url,
      instagram_url = excluded.instagram_url,
      address = excluded.address,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      is_published = excluded.is_published,
      updated_at = CURRENT_TIMESTAMP
  `).run(companyId, settings.siteSlug, settings.siteName, settings.brandName, settings.logoUrl, settings.faviconUrl, settings.primaryColor, settings.secondaryColor, settings.contactEmail, settings.contactPhone, settings.lineUrl, settings.facebookUrl, settings.instagramUrl, settings.address, settings.seoTitle, settings.seoDescription, settings.isPublished);

  for (const table of replaceTables) {
    db.prepare(`DELETE FROM ${table} WHERE company_id = ?`).run(companyId);
  }

  const bannerStmt = db.prepare(`
    INSERT INTO website_banners (company_id, title, subtitle, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  banners.forEach((item) => bannerStmt.run(companyId, item.title, item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive));

  const sectionStmt = db.prepare(`
    INSERT INTO website_home_sections (company_id, section_type, title, subtitle, content, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  sections.forEach((item) => sectionStmt.run(companyId, item.sectionType, item.title, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive));

  const productStmt = db.prepare(`
    INSERT INTO website_products (company_id, name, slug, description, short_description, price, compare_at_price, image_url, category, status, sort_order, is_featured, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  products.forEach((item) => productStmt.run(companyId, item.name, item.slug, item.description, item.shortDescription, item.price, item.compareAtPrice, item.imageUrl, item.category, item.status, item.sortOrder, item.isFeatured));

  const postStmt = db.prepare(`
    INSERT INTO website_posts (company_id, title, slug, summary, content, cover_image_url, category, status, published_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  posts.forEach((item) => postStmt.run(companyId, item.title, item.slug, item.summary, item.content, item.coverImageUrl, item.category, item.status, item.publishedAt));

  const faqStmt = db.prepare(`
    INSERT INTO website_faqs (company_id, question, answer, category, sort_order, is_active, created_at, updated_at)
    VALUES (?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  faqs.forEach(([question, answer, category, sortOrder]) => faqStmt.run(companyId, question, answer, category, sortOrder));

  const assetStmt = db.prepare(`
    INSERT INTO website_assets (company_id, file_url, file_name, file_type, file_size, module, created_by, created_at, updated_at)
    VALUES (?,?,?,?,0,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `);
  assets.forEach(([module, fileName, fileType, fileUrl]) => assetStmt.run(companyId, fileUrl, fileName, fileType, module));
}

async function pgSeed(companyId) {
  const conflict = await pgOne('SELECT company_id FROM website_settings WHERE site_slug = $1 AND company_id <> $2', [SITE_SLUG, companyId]);
  if (conflict) throw new Error(`site_slug ${SITE_SLUG} already belongs to company #${conflict.company_id}`);

  await pgQuery(`
    INSERT INTO website_settings (
      company_id, site_slug, site_name, brand_name, logo_url, favicon_url,
      primary_color, secondary_color, contact_email, contact_phone, line_url,
      facebook_url, instagram_url, address, seo_title, seo_description,
      is_published, created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT (company_id) DO UPDATE SET
      site_slug = EXCLUDED.site_slug,
      site_name = EXCLUDED.site_name,
      brand_name = EXCLUDED.brand_name,
      logo_url = EXCLUDED.logo_url,
      favicon_url = EXCLUDED.favicon_url,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      contact_email = EXCLUDED.contact_email,
      contact_phone = EXCLUDED.contact_phone,
      line_url = EXCLUDED.line_url,
      facebook_url = EXCLUDED.facebook_url,
      instagram_url = EXCLUDED.instagram_url,
      address = EXCLUDED.address,
      seo_title = EXCLUDED.seo_title,
      seo_description = EXCLUDED.seo_description,
      is_published = EXCLUDED.is_published,
      updated_at = CURRENT_TIMESTAMP
  `, [companyId, settings.siteSlug, settings.siteName, settings.brandName, settings.logoUrl, settings.faviconUrl, settings.primaryColor, settings.secondaryColor, settings.contactEmail, settings.contactPhone, settings.lineUrl, settings.facebookUrl, settings.instagramUrl, settings.address, settings.seoTitle, settings.seoDescription, settings.isPublished]);

  for (const table of replaceTables) {
    await pgQuery(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
  }

  for (const item of banners) {
    await pgQuery(`
      INSERT INTO website_banners (company_id, title, subtitle, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, item.title, item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]);
  }
  for (const item of sections) {
    await pgQuery(`
      INSERT INTO website_home_sections (company_id, section_type, title, subtitle, content, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, item.sectionType, item.title, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]);
  }
  for (const item of products) {
    await pgQuery(`
      INSERT INTO website_products (company_id, name, slug, description, short_description, price, compare_at_price, image_url, category, status, sort_order, is_featured, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, item.name, item.slug, item.description, item.shortDescription, item.price, item.compareAtPrice, item.imageUrl, item.category, item.status, item.sortOrder, item.isFeatured]);
  }
  for (const item of posts) {
    await pgQuery(`
      INSERT INTO website_posts (company_id, title, slug, summary, content, cover_image_url, category, status, published_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, item.title, item.slug, item.summary, item.content, item.coverImageUrl, item.category, item.status, item.publishedAt]);
  }
  for (const [question, answer, category, sortOrder] of faqs) {
    await pgQuery(`
      INSERT INTO website_faqs (company_id, question, answer, category, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, question, answer, category, sortOrder]);
  }
  for (const [module, fileName, fileType, fileUrl] of assets) {
    await pgQuery(`
      INSERT INTO website_assets (company_id, file_url, file_name, file_type, file_size, module, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,0,$5,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, [companyId, fileUrl, fileName, fileType, module]);
  }
}

async function verify(companyId) {
  if (PG_ENABLED) {
    const [settingsRow, bannerCount, sectionCount, productCount, postCount, faqCount, assetCount] = await Promise.all([
      pgOne('SELECT site_slug, is_published FROM website_settings WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_banners WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_home_sections WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_products WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_posts WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_faqs WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_assets WHERE company_id = $1', [companyId])
    ]);
    return { settings: settingsRow, banners: bannerCount.count, sections: sectionCount.count, products: productCount.count, posts: postCount.count, faqs: faqCount.count, assets: assetCount.count };
  }

  return {
    settings: db.prepare('SELECT site_slug, is_published FROM website_settings WHERE company_id = ?').get(companyId),
    banners: db.prepare('SELECT COUNT(*) AS count FROM website_banners WHERE company_id = ?').get(companyId).count,
    sections: db.prepare('SELECT COUNT(*) AS count FROM website_home_sections WHERE company_id = ?').get(companyId).count,
    products: db.prepare('SELECT COUNT(*) AS count FROM website_products WHERE company_id = ?').get(companyId).count,
    posts: db.prepare('SELECT COUNT(*) AS count FROM website_posts WHERE company_id = ?').get(companyId).count,
    faqs: db.prepare('SELECT COUNT(*) AS count FROM website_faqs WHERE company_id = ?').get(companyId).count,
    assets: db.prepare('SELECT COUNT(*) AS count FROM website_assets WHERE company_id = ?').get(companyId).count
  };
}

async function main() {
  if (PG_ENABLED) {
    await initPostgresDb();
    const company = await pgTargetCompany();
    if (!company) throw new Error(`找不到 ${OWNER_EMAIL} 所屬 company；請先建立 company_user 關聯或指定 BOOKAI_OFFICIAL_COMPANY_ID。`);
    await pgSeed(company.id);
    log(`PostgreSQL official site seeded for company #${company.id} ${company.name}`);
    log(JSON.stringify(await verify(company.id)));
    await (await getPool()).end();
    return;
  }

  initDb();
  const company = await sqliteTargetCompany();
  if (!company) throw new Error(`找不到 ${OWNER_EMAIL} 所屬 company；請先建立 company_user 關聯或指定 BOOKAI_OFFICIAL_COMPANY_ID。`);
  sqliteSeed(company.id);
  log(`SQLite official site seeded for company #${company.id} ${company.name}`);
  log(JSON.stringify(await verify(company.id)));
}

main().catch(async (err) => {
  console.error(`[bookai-official-seed] ${err.message}`);
  if (PG_ENABLED) {
    try {
      await (await getPool()).end();
    } catch {
      // ignore shutdown errors
    }
  }
  process.exit(1);
});
