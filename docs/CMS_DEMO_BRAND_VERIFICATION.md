# CMS Demo Brand Verification

## Demo Brand

- Brand name: 暖爪生活
- English name: PawWarm Studio
- Site slug: `pawwarm-demo`
- Positioning: pet lifestyle selection, daily pet care, and approachable customer inquiry flow.

This demo is original BookAI verification content. It is not a real storefront, does not copy another brand, and does not include purchasing, payment, logistics, consumer membership, or invoice flows.

## Seed Script

Run the seed script from the project root:

```bash
node scripts/seed-demo-brand-site.js
```

By default, the script looks for the founder email:

```text
lotes.9766001@gmail.com
```

To target a different founder email:

```bash
DEMO_FOUNDER_EMAIL=founder@example.com node scripts/seed-demo-brand-site.js
```

To target a specific existing company:

```bash
DEMO_COMPANY_ID=1 node scripts/seed-demo-brand-site.js
```

For PostgreSQL production-style verification, run with `DATABASE_URL` set:

```bash
DATABASE_URL=postgres://... node scripts/seed-demo-brand-site.js
```

The script is repeatable. It updates `website_settings` by the selected company and replaces the selected company's CMS display data in banners, home sections, products, posts, FAQs, and assets. It does not clear other companies' CMS data and does not delete inquiries.

Use a demo company when you want an isolated verification site. If you target an existing non-demo company, that company's Website CMS display content will be replaced with the PawWarm demo content.

## Test Account Prerequisites

- The founder user must exist in `users`.
- The founder user must belong to at least one company through `company_users`.
- If the founder email is not available locally, use `DEMO_COMPANY_ID` with an existing company id.

## Backoffice Verification

1. Log in to BookAI with the target company's account.
2. Open the BookAI backoffice.
3. Go to `品牌官網`.
4. Confirm the website settings show `pawwarm-demo`.
5. Review these tabs:
   - 官網總覽
   - 網站設定
   - 首頁 Banner
   - 首頁區塊
   - 商品展示
   - 文章 / 最新消息
   - FAQ
   - 聯絡詢問
   - 素材管理

## Public Site Verification

Open these routes:

- `/site/pawwarm-demo`
- `/site/pawwarm-demo/products`
- `/site/pawwarm-demo/posts`
- `/site/pawwarm-demo/faq`
- `/site/pawwarm-demo/contact`

Expected behavior:

- The homepage shows banners and home sections.
- Product list shows only `published` products.
- Draft and hidden products are not public.
- Post list shows only `published` posts.
- Draft posts are not public.
- FAQ entries are visible.
- Images use URL-based CMS fields and should fall back cleanly if a URL cannot be loaded.

## Inquiry Verification

1. Open `/site/pawwarm-demo/contact`.
2. Submit the contact form with a test name, email, and message.
3. Return to the BookAI backoffice.
4. Open `品牌官網` -> `聯絡詢問`.
5. Confirm the inquiry appears for the same company.

## Not Included

This demo does not include:

- Shopping cart
- Checkout
- Payment
- Logistics
- Consumer member login
- E-invoice
- Custom domain
- Real image upload
- S3, Cloudinary, or CDN integration
