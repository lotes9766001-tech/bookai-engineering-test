import { db, initDb } from '../server/db.js';
import { PG_ENABLED, initPostgresDb, pgAll, pgOne, pgQuery, getPool } from '../server/pg-db.js';

const FOUNDER_EMAIL = process.env.DEMO_FOUNDER_EMAIL || 'lotes.9766001@gmail.com';
const DEMO_COMPANY_ID = Number(process.env.DEMO_COMPANY_ID || 0);
const SITE_SLUG = 'pawwarm-demo';

const images = {
  logo: 'https://placehold.co/256x256/fee2e2/7f1d1d.png?text=PawWarm',
  favicon: 'https://placehold.co/64x64/fee2e2/7f1d1d.png?text=PW',
  hero: 'https://placehold.co/1400x900/fff1f2/7f1d1d.png?text=PawWarm+Studio',
  banner: 'https://placehold.co/1400x900/ecfeff/155e75.png?text=Pet+Care+Selected',
  story: 'https://placehold.co/900x600/fef3c7/92400e.png?text=Brand+Story',
  product: 'https://placehold.co/900x600/e0f2fe/075985.png?text=Pet+Product',
  care: 'https://placehold.co/900x600/ecfdf5/166534.png?text=Care+Guide',
  post: 'https://placehold.co/900x600/f5f3ff/5b21b6.png?text=PawWarm+Journal',
  general: 'https://placehold.co/900x600/f8fafc/334155.png?text=BookAI+CMS'
};

const settings = {
  siteSlug: SITE_SLUG,
  siteName: '暖爪生活｜寵物生活選品',
  brandName: '暖爪生活',
  logoUrl: images.logo,
  faviconUrl: images.favicon,
  primaryColor: '#b45309',
  secondaryColor: '#0f766e',
  contactEmail: 'hello@pawwarm.demo',
  contactPhone: '02-7700-1020',
  lineUrl: 'https://line.me/R/ti/p/@pawwarm-demo',
  facebookUrl: 'https://www.facebook.com/pawwarm.demo',
  instagramUrl: 'https://www.instagram.com/pawwarm.demo',
  address: '台北市大安區暖爪路 18 號',
  seoTitle: '暖爪生活｜寵物生活選品 Demo',
  seoDescription: '暖爪生活是 BookAI Website CMS 建立的 Demo 品牌網站，展示寵物生活選品、照護內容與聯絡詢問流程。',
  isPublished: 1
};

const banners = [
  {
    title: '讓毛孩日常更安心',
    subtitle: '暖爪生活精選睡墊、外出用品、餐具與照護小物，用溫柔設計陪伴每一天。',
    imageUrl: images.hero,
    buttonText: '查看精選商品',
    buttonUrl: `/site/${SITE_SLUG}/products`,
    sortOrder: 1,
    isActive: 1
  },
  {
    title: '從居家到外出，都替毛孩想好',
    subtitle: '以耐用材質、易清潔設計與友善客服，建立飼主能放心選購的生活提案。',
    imageUrl: images.banner,
    buttonText: '閱讀品牌故事',
    buttonUrl: `/site/${SITE_SLUG}/posts`,
    sortOrder: 2,
    isActive: 1
  }
];

const sections = [
  {
    sectionType: 'brand_story',
    title: '品牌故事',
    subtitle: '暖爪生活相信，好的寵物用品不只漂亮，更要耐用、好清潔、讓毛孩感到舒服。',
    content: '我們以日常照護場景出發，整理適合新手飼主與多寵家庭的選品方向，讓每次選購都更有依據。',
    imageUrl: images.story,
    buttonText: '了解暖爪生活',
    buttonUrl: `/site/${SITE_SLUG}/posts/new-owner-home-care`,
    sortOrder: 1,
    isActive: 1
  },
  {
    sectionType: 'product_highlight',
    title: '精選商品介紹',
    subtitle: '從睡墊、外出包、慢食碗到清潔用品，建立毛孩舒適生活的基本配備。',
    content: '公開網站只會顯示已發布商品，草稿與隱藏商品可在後台驗證狀態控管。',
    imageUrl: images.product,
    buttonText: '前往商品展示',
    buttonUrl: `/site/${SITE_SLUG}/products`,
    sortOrder: 2,
    isActive: 1
  },
  {
    sectionType: 'feature',
    title: '安心選品與客服說明',
    subtitle: '每一件 Demo 商品都附上用途、材質與照護建議；若有疑問可用聯絡表單送回 BookAI 後台。',
    content: '此站不包含購物車、金流、物流與會員登入，專注驗證 Website CMS 的內容管理閉環。',
    imageUrl: images.care,
    buttonText: '聯絡我們',
    buttonUrl: `/site/${SITE_SLUG}/contact`,
    sortOrder: 3,
    isActive: 1
  }
];

const products = [
  {
    name: '雲朵午睡墊',
    slug: 'cloud-nap-mat',
    description: '適合貓咪與小型犬的柔軟睡墊，表布親膚，底部止滑，日常可拆洗整理。',
    shortDescription: '可拆洗、止滑、柔軟支撐的日常睡墊。',
    price: 1280,
    compareAtPrice: 1580,
    imageUrl: 'https://placehold.co/900x600/fff7ed/9a3412.png?text=Cloud+Nap+Mat',
    category: '寵物睡墊',
    status: 'published',
    sortOrder: 1,
    isFeatured: 1
  },
  {
    name: '輕旅透氣外出包',
    slug: 'breeze-travel-carrier',
    description: '多面透氣網布與加厚肩帶，適合短程外出、回診或週末小旅行。',
    shortDescription: '短程外出與回診適用的透氣外出包。',
    price: 2180,
    compareAtPrice: 2480,
    imageUrl: 'https://placehold.co/900x600/ecfeff/155e75.png?text=Travel+Carrier',
    category: '寵物外出包',
    status: 'published',
    sortOrder: 2,
    isFeatured: 1
  },
  {
    name: '慢食陶瓷餐碗',
    slug: 'slow-feeding-ceramic-bowl',
    description: '低重心陶瓷碗搭配慢食紋路，幫助毛孩放慢進食速度，清洗也更容易。',
    shortDescription: '低重心、易清潔、協助放慢進食。',
    price: 780,
    compareAtPrice: 0,
    imageUrl: 'https://placehold.co/900x600/fef3c7/92400e.png?text=Ceramic+Bowl',
    category: '寵物餐碗',
    status: 'published',
    sortOrder: 3,
    isFeatured: 1
  },
  {
    name: '日常足部清潔慕斯',
    slug: 'daily-paw-clean-mousse',
    description: '外出回家後可快速清潔腳掌與毛髮表層，溫和配方，適合日常照護使用。',
    shortDescription: '外出回家快速清潔腳掌與毛髮。',
    price: 520,
    compareAtPrice: 650,
    imageUrl: 'https://placehold.co/900x600/ecfdf5/166534.png?text=Paw+Clean+Mousse',
    category: '寵物清潔用品',
    status: 'published',
    sortOrder: 4,
    isFeatured: 0
  },
  {
    name: '嗅聞藏食玩具',
    slug: 'snuffle-play-toy',
    description: '透過藏食與嗅聞活動消耗精力，適合雨天或居家陪伴時使用。',
    shortDescription: '居家嗅聞活動與藏食訓練玩具。',
    price: 890,
    compareAtPrice: 0,
    imageUrl: 'https://placehold.co/900x600/f5f3ff/5b21b6.png?text=Snuffle+Toy',
    category: '毛孩玩具',
    status: 'draft',
    sortOrder: 5,
    isFeatured: 0
  },
  {
    name: '毛孩保健選品組',
    slug: 'wellness-care-set',
    description: 'Demo 隱藏商品，用來驗證 hidden 狀態不會出現在公開前台。',
    shortDescription: '用於驗證 hidden 狀態的 Demo 商品。',
    price: 1680,
    compareAtPrice: 1980,
    imageUrl: 'https://placehold.co/900x600/e0e7ff/3730a3.png?text=Wellness+Set',
    category: '寵物保健選品',
    status: 'hidden',
    sortOrder: 6,
    isFeatured: 0
  }
];

const posts = [
  {
    title: '新手飼主的居家照護清單',
    slug: 'new-owner-home-care',
    summary: '從睡眠、飲水、進食到清潔，整理毛孩剛到家時最需要準備的生活用品。',
    content: '新手飼主最常遇到的問題，是不知道哪些用品該先準備。建議先從睡眠區、飲水與進食、外出安全、清潔照護四個場景檢查。暖爪生活 Demo 站用這篇文章驗證文章列表、詳情頁與封面圖呈現。',
    coverImageUrl: 'https://placehold.co/900x600/fff7ed/9a3412.png?text=Home+Care+Guide',
    category: '新手飼主指南',
    status: 'published',
    publishedAt: '2026-06-01T10:00:00.000Z'
  },
  {
    title: '帶毛孩外出前的 5 個準備',
    slug: 'pet-travel-checklist',
    summary: '外出包、飲水、安撫小物與清潔用品，是短程外出最容易被忽略的細節。',
    content: '外出前先確認毛孩的體型、交通時間、天氣與目的地限制。透氣外出包、飲水瓶、備用尿布墊與回家清潔用品，都能降低外出壓力。',
    coverImageUrl: 'https://placehold.co/900x600/ecfeff/155e75.png?text=Travel+Checklist',
    category: '寵物外出準備',
    status: 'published',
    publishedAt: '2026-06-04T10:00:00.000Z'
  },
  {
    title: '如何挑選容易清潔的寵物用品',
    slug: 'easy-clean-pet-products',
    summary: '材質、可拆洗結構與替換耗材，是長期使用體驗的關鍵。',
    content: '容易清潔的用品通常有三個特徵：表面不易吸附髒污、結構能拆開清潔、耗材容易替換。這能幫助飼主維持居家衛生，也延長用品壽命。',
    coverImageUrl: 'https://placehold.co/900x600/ecfdf5/166534.png?text=Easy+Clean',
    category: '毛孩居家照護',
    status: 'published',
    publishedAt: '2026-06-07T10:00:00.000Z'
  },
  {
    title: '暖爪生活會員活動規劃中',
    slug: 'member-program-planning',
    summary: '這是草稿文章，用來驗證 draft 狀態不會出現在公開前台。',
    content: '此文章保留為後台草稿，不應出現在公開網站文章列表或詳情頁。',
    coverImageUrl: 'https://placehold.co/900x600/f5f3ff/5b21b6.png?text=Draft+Post',
    category: '品牌公告',
    status: 'draft',
    publishedAt: ''
  }
];

const faqs = [
  ['商品是否可以退換？', '此 Demo 網站不進行真實交易。若套用到正式品牌，退換貨規則可由品牌自行撰寫於 FAQ 或文章中。', '退換貨', 1],
  ['如何聯絡客服？', '可透過聯絡表單、Email 或 LINE 連結聯絡品牌團隊。聯絡表單會寫入 BookAI 後台聯絡詢問。', '客服', 2],
  ['是否支援 LINE 諮詢？', 'Demo 資料包含 LINE URL 欄位，可在公開網站頁尾與聯絡頁顯示。', '客服', 3],
  ['商品多久會回覆詢問？', 'Demo 品牌設定為 1-2 個工作天內回覆。正式品牌可依實際服務流程調整文案。', '詢問', 4],
  ['官網內容是否由 BookAI 後台管理？', '是。此 Demo 站資料皆來自 Website CMS 資料表，包含設定、Banner、商品、文章、FAQ、素材與詢問。', 'BookAI CMS', 5]
];

const assets = [
  ['logo', 'pawwarm-logo.png', 'image/png', images.logo],
  ['favicon', 'pawwarm-favicon.png', 'image/png', images.favicon],
  ['banner', 'pawwarm-hero.png', 'image/png', images.hero],
  ['product', 'pawwarm-product-placeholder.png', 'image/png', images.product],
  ['post', 'pawwarm-post-cover.png', 'image/png', images.post],
  ['general', 'bookai-cms-demo.png', 'image/png', images.general]
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
  console.log(`[cms-demo-seed] ${message}`);
}

async function sqliteTargetCompany() {
  if (DEMO_COMPANY_ID) {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(DEMO_COMPANY_ID);
  }
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(FOUNDER_EMAIL);
  if (!user) return null;
  return db.prepare(`
    SELECT c.*, cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = ?
    ORDER BY
      CASE cu.role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        ELSE 3
      END,
      cu.id ASC
    LIMIT 1
  `).get(user.id);
}

async function pgTargetCompany() {
  if (DEMO_COMPANY_ID) {
    return pgOne('SELECT * FROM companies WHERE id = $1', [DEMO_COMPANY_ID]);
  }
  const user = await pgOne('SELECT id, email FROM users WHERE email = $1', [FOUNDER_EMAIL]);
  if (!user) return null;
  return pgOne(`
    SELECT c.*, cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = $1
    ORDER BY
      CASE cu.role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        ELSE 3
      END,
      cu.id ASC
    LIMIT 1
  `, [user.id]);
}

function sqliteUpsertSettings(companyId) {
  const conflict = db.prepare('SELECT company_id FROM website_settings WHERE site_slug = ? AND company_id <> ?').get(SITE_SLUG, companyId);
  if (conflict) throw new Error(`site_slug ${SITE_SLUG} already belongs to another company (${conflict.company_id})`);
  const existing = db.prepare('SELECT id FROM website_settings WHERE company_id = ?').get(companyId);
  if (existing) {
    db.prepare(`
      UPDATE website_settings
      SET site_slug = ?, site_name = ?, brand_name = ?, logo_url = ?, favicon_url = ?,
          primary_color = ?, secondary_color = ?, contact_email = ?, contact_phone = ?,
          line_url = ?, facebook_url = ?, instagram_url = ?, address = ?,
          seo_title = ?, seo_description = ?, is_published = 1, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
    `).run(settings.siteSlug, settings.siteName, settings.brandName, settings.logoUrl, settings.faviconUrl, settings.primaryColor, settings.secondaryColor, settings.contactEmail, settings.contactPhone, settings.lineUrl, settings.facebookUrl, settings.instagramUrl, settings.address, settings.seoTitle, settings.seoDescription, companyId);
    return;
  }
  db.prepare(`
    INSERT INTO website_settings (
      company_id, site_slug, site_name, brand_name, logo_url, favicon_url,
      primary_color, secondary_color, contact_email, contact_phone, line_url,
      facebook_url, instagram_url, address, seo_title, seo_description,
      is_published, created_at, updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(companyId, settings.siteSlug, settings.siteName, settings.brandName, settings.logoUrl, settings.faviconUrl, settings.primaryColor, settings.secondaryColor, settings.contactEmail, settings.contactPhone, settings.lineUrl, settings.facebookUrl, settings.instagramUrl, settings.address, settings.seoTitle, settings.seoDescription);
}

async function pgUpsertSettings(companyId) {
  const conflict = await pgOne('SELECT company_id FROM website_settings WHERE site_slug = $1 AND company_id <> $2', [SITE_SLUG, companyId]);
  if (conflict) throw new Error(`site_slug ${SITE_SLUG} already belongs to another company (${conflict.company_id})`);
  await pgQuery(`
    INSERT INTO website_settings (
      company_id, site_slug, site_name, brand_name, logo_url, favicon_url,
      primary_color, secondary_color, contact_email, contact_phone, line_url,
      facebook_url, instagram_url, address, seo_title, seo_description,
      is_published, created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
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
      is_published = 1,
      updated_at = CURRENT_TIMESTAMP
  `, [companyId, settings.siteSlug, settings.siteName, settings.brandName, settings.logoUrl, settings.faviconUrl, settings.primaryColor, settings.secondaryColor, settings.contactEmail, settings.contactPhone, settings.lineUrl, settings.facebookUrl, settings.instagramUrl, settings.address, settings.seoTitle, settings.seoDescription]);
}

function sqliteReplaceCompanyContent(companyId) {
  for (const table of replaceTables) {
    db.prepare(`DELETE FROM ${table} WHERE company_id = ?`).run(companyId);
  }
}

async function pgReplaceCompanyContent(companyId) {
  for (const table of replaceTables) {
    await pgQuery(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
  }
}

function sqliteUpsertByField(table, keyField, keyValue, companyId, row, insertSql, updateSql, values) {
  const existing = db.prepare(`SELECT id FROM ${table} WHERE company_id = ? AND ${keyField} = ?`).get(companyId, keyValue);
  if (existing) db.prepare(updateSql).run(...values.update, existing.id, companyId);
  else db.prepare(insertSql).run(companyId, ...values.insert);
}

async function pgUpsertByField(table, keyField, keyValue, companyId, row, insertSql, updateSql, values) {
  const existing = await pgOne(`SELECT id FROM ${table} WHERE company_id = $1 AND ${keyField} = $2`, [companyId, keyValue]);
  if (existing) await pgQuery(updateSql, [...values.update, existing.id, companyId]);
  else await pgQuery(insertSql, [companyId, ...values.insert]);
}

function seedSqlite(companyId) {
  sqliteUpsertSettings(companyId);
  sqliteReplaceCompanyContent(companyId);

  for (const item of banners) {
    sqliteUpsertByField('website_banners', 'title', item.title, companyId, item, `
      INSERT INTO website_banners (company_id, title, subtitle, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_banners
      SET subtitle = ?, image_url = ?, button_text = ?, button_url = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, {
      insert: [item.title, item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive],
      update: [item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]
    });
  }

  for (const item of sections) {
    sqliteUpsertByField('website_home_sections', 'title', item.title, companyId, item, `
      INSERT INTO website_home_sections (company_id, section_type, title, subtitle, content, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_home_sections
      SET section_type = ?, subtitle = ?, content = ?, image_url = ?, button_text = ?, button_url = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, {
      insert: [item.sectionType, item.title, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive],
      update: [item.sectionType, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]
    });
  }

  for (const item of products) {
    sqliteUpsertByField('website_products', 'slug', item.slug, companyId, item, `
      INSERT INTO website_products (company_id, name, slug, description, short_description, price, compare_at_price, image_url, category, status, sort_order, is_featured, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_products
      SET name = ?, description = ?, short_description = ?, price = ?, compare_at_price = ?, image_url = ?, category = ?, status = ?, sort_order = ?, is_featured = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, {
      insert: [item.name, item.slug, item.description, item.shortDescription, item.price, item.compareAtPrice, item.imageUrl, item.category, item.status, item.sortOrder, item.isFeatured],
      update: [item.name, item.description, item.shortDescription, item.price, item.compareAtPrice, item.imageUrl, item.category, item.status, item.sortOrder, item.isFeatured]
    });
  }

  for (const item of posts) {
    sqliteUpsertByField('website_posts', 'slug', item.slug, companyId, item, `
      INSERT INTO website_posts (company_id, title, slug, summary, content, cover_image_url, category, status, published_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_posts
      SET title = ?, summary = ?, content = ?, cover_image_url = ?, category = ?, status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, {
      insert: [item.title, item.slug, item.summary, item.content, item.coverImageUrl, item.category, item.status, item.publishedAt],
      update: [item.title, item.summary, item.content, item.coverImageUrl, item.category, item.status, item.publishedAt]
    });
  }

  for (const [question, answer, category, sortOrder] of faqs) {
    sqliteUpsertByField('website_faqs', 'question', question, companyId, null, `
      INSERT INTO website_faqs (company_id, question, answer, category, sort_order, is_active, created_at, updated_at)
      VALUES (?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_faqs
      SET answer = ?, category = ?, sort_order = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `, {
      insert: [question, answer, category, sortOrder],
      update: [answer, category, sortOrder]
    });
  }

  for (const [module, fileName, fileType, fileUrl] of assets) {
    sqliteUpsertByField('website_assets', 'file_url', fileUrl, companyId, null, `
      INSERT INTO website_assets (company_id, file_url, file_name, file_type, file_size, module, created_by, created_at)
      VALUES (?,?,?,?,0,?,NULL,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_assets
      SET file_name = ?, file_type = ?, module = ?
      WHERE id = ? AND company_id = ?
    `, {
      insert: [fileUrl, fileName, fileType, module],
      update: [fileName, fileType, module]
    });
  }
}

async function seedPostgres(companyId) {
  await pgUpsertSettings(companyId);
  await pgReplaceCompanyContent(companyId);

  for (const item of banners) {
    await pgUpsertByField('website_banners', 'title', item.title, companyId, item, `
      INSERT INTO website_banners (company_id, title, subtitle, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_banners
      SET subtitle = $1, image_url = $2, button_text = $3, button_url = $4, sort_order = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND company_id = $8
    `, {
      insert: [item.title, item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive],
      update: [item.subtitle, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]
    });
  }

  for (const item of sections) {
    await pgUpsertByField('website_home_sections', 'title', item.title, companyId, item, `
      INSERT INTO website_home_sections (company_id, section_type, title, subtitle, content, image_url, button_text, button_url, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_home_sections
      SET section_type = $1, subtitle = $2, content = $3, image_url = $4, button_text = $5, button_url = $6, sort_order = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND company_id = $10
    `, {
      insert: [item.sectionType, item.title, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive],
      update: [item.sectionType, item.subtitle, item.content, item.imageUrl, item.buttonText, item.buttonUrl, item.sortOrder, item.isActive]
    });
  }

  for (const item of products) {
    await pgQuery(`
      INSERT INTO website_products (company_id, name, slug, description, short_description, price, compare_at_price, image_url, category, status, sort_order, is_featured, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (company_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        short_description = EXCLUDED.short_description,
        price = EXCLUDED.price,
        compare_at_price = EXCLUDED.compare_at_price,
        image_url = EXCLUDED.image_url,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        sort_order = EXCLUDED.sort_order,
        is_featured = EXCLUDED.is_featured,
        updated_at = CURRENT_TIMESTAMP
    `, [companyId, item.name, item.slug, item.description, item.shortDescription, item.price, item.compareAtPrice, item.imageUrl, item.category, item.status, item.sortOrder, item.isFeatured]);
  }

  for (const item of posts) {
    await pgQuery(`
      INSERT INTO website_posts (company_id, title, slug, summary, content, cover_image_url, category, status, published_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (company_id, slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        content = EXCLUDED.content,
        cover_image_url = EXCLUDED.cover_image_url,
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        published_at = EXCLUDED.published_at,
        updated_at = CURRENT_TIMESTAMP
    `, [companyId, item.title, item.slug, item.summary, item.content, item.coverImageUrl, item.category, item.status, item.publishedAt]);
  }

  for (const [question, answer, category, sortOrder] of faqs) {
    await pgUpsertByField('website_faqs', 'question', question, companyId, null, `
      INSERT INTO website_faqs (company_id, question, answer, category, sort_order, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_faqs
      SET answer = $1, category = $2, sort_order = $3, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND company_id = $5
    `, {
      insert: [question, answer, category, sortOrder],
      update: [answer, category, sortOrder]
    });
  }

  for (const [module, fileName, fileType, fileUrl] of assets) {
    await pgUpsertByField('website_assets', 'file_url', fileUrl, companyId, null, `
      INSERT INTO website_assets (company_id, file_url, file_name, file_type, file_size, module, created_by, created_at)
      VALUES ($1,$2,$3,$4,0,$5,NULL,CURRENT_TIMESTAMP)
    `, `
      UPDATE website_assets
      SET file_name = $1, file_type = $2, module = $3
      WHERE id = $4 AND company_id = $5
    `, {
      insert: [fileUrl, fileName, fileType, module],
      update: [fileName, fileType, module]
    });
  }
}

async function verify(companyId) {
  if (PG_ENABLED) {
    const [productCounts, postCounts, bannerCount, sectionCount, faqCount, assetCount] = await Promise.all([
      pgAll('SELECT status, COUNT(*)::int AS count FROM website_products WHERE company_id = $1 GROUP BY status ORDER BY status', [companyId]),
      pgAll('SELECT status, COUNT(*)::int AS count FROM website_posts WHERE company_id = $1 GROUP BY status ORDER BY status', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_banners WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_home_sections WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_faqs WHERE company_id = $1', [companyId]),
      pgOne('SELECT COUNT(*)::int AS count FROM website_assets WHERE company_id = $1', [companyId])
    ]);
    return { productCounts, postCounts, bannerCount: bannerCount.count, sectionCount: sectionCount.count, faqCount: faqCount.count, assetCount: assetCount.count };
  }

  return {
    productCounts: db.prepare('SELECT status, COUNT(*) AS count FROM website_products WHERE company_id = ? GROUP BY status ORDER BY status').all(companyId),
    postCounts: db.prepare('SELECT status, COUNT(*) AS count FROM website_posts WHERE company_id = ? GROUP BY status ORDER BY status').all(companyId),
    bannerCount: db.prepare('SELECT COUNT(*) AS count FROM website_banners WHERE company_id = ?').get(companyId).count,
    sectionCount: db.prepare('SELECT COUNT(*) AS count FROM website_home_sections WHERE company_id = ?').get(companyId).count,
    faqCount: db.prepare('SELECT COUNT(*) AS count FROM website_faqs WHERE company_id = ?').get(companyId).count,
    assetCount: db.prepare('SELECT COUNT(*) AS count FROM website_assets WHERE company_id = ?').get(companyId).count
  };
}

async function main() {
  if (PG_ENABLED) {
    await initPostgresDb();
    const company = await pgTargetCompany();
    if (!company) throw new Error(`找不到 Demo 目標公司。請確認 DEMO_COMPANY_ID 或 founder email：${FOUNDER_EMAIL}`);
    await seedPostgres(company.id);
    const summary = await verify(company.id);
    log(`PostgreSQL seed complete for company #${company.id} ${company.name}`);
    log(JSON.stringify(summary));
    await (await getPool()).end();
    return;
  }

  initDb();
  const company = await sqliteTargetCompany();
  if (!company) throw new Error(`找不到 Demo 目標公司。請確認 DEMO_COMPANY_ID 或 founder email：${FOUNDER_EMAIL}`);
  seedSqlite(company.id);
  const summary = await verify(company.id);
  log(`SQLite seed complete for company #${company.id} ${company.name}`);
  log(JSON.stringify(summary));
}

main().catch(async (err) => {
  console.error(`[cms-demo-seed] ${err.message}`);
  if (PG_ENABLED && getPool) {
    try {
      await (await getPool()).end();
    } catch {
      // ignore shutdown errors
    }
  }
  process.exit(1);
});
