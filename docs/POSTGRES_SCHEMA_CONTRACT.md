# PostgreSQL Schema Contract

Canonical contract 目前列出 SQLite 49 張表；逐一搜尋後，以下 7 張均為 ACTIVE，具有 runtime route/query/UI 證據：`accountant_clients`（`server/index.js:11573`）、`accounts`（`server/index.js:11435`、`client/src/main.jsx:3753`）、`commerce_site_settings/products/promotions`（`server/index.js:4572-4988`）、`journal_entries` 與 `journal_lines`（會計 schema/runtime 依賴，保留於 canonical migration）。本包不使用 `LEGACY_EXCLUDED`；未知表不得排除。

政策：事件時間使用 UTC `TIMESTAMPTZ`；金額/小計/稅額/成本採逐欄決策的 `NUMERIC(18,2)`；數量採 `NUMERIC(18,4)`；稅率採 `NUMERIC(9,4)`；Boolean 使用 PostgreSQL `BOOLEAN`；可結構化查詢資料才採 `JSONB`；既有 API ID 不改 UUID。

唯一性政策：email 全平台、company membership 為 `(company_id,user_id)`、SKU/website product/post slug 公司內、website settings slug 全平台、invoice/document number 公司及文件類型內、external order id 依公司及來源範圍。實際欄位 parity 與 constraint migration 需在 staging 驗證。

Canonical migrations：`001_core_identity`、`002_engineering_inventory`、`003_commerce_erp`、`004_cms`、`005_accounting`、`006_tender_audit`、`007_schema_parity`。每支 migration 為 forward-only、無 seed、可計算 checksum；本機只做靜態檢查，未執行資料庫 migration。

欄位衝突採 expand/contract：`purchase_items` 保留 `unit_price`、`unit_cost`、`subtotal`；`transactions` 保留 `profit`、`note` 與既有 amount/type/reference 語意；`vouchers` 保留 `purpose`、`tax_amount`、`status`、`type`、`tax`、`voucher_date`、`note`，不做 rename 或刪除。
