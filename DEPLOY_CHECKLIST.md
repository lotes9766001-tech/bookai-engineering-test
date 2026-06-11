# BookAI v5.4 Production Deploy Checklist

## 1. Render 設定

- Repository：BookAI 正式 GitHub repository
- Branch：`main`
- Build Command：`npm install && npm run build`
- Start Command：`npm start`
- Health Check Path：`/api/health`

## 2. 必要環境變數

- `NODE_ENV=production`
- `PORT`：Render 通常自動提供。
- `JWT_SECRET`：正式環境必須使用高強度隨機字串。
- `BOOTSTRAP_SECRET`：只用於 `/api/bootstrap/admin` 初始化或重設系統管理員。
- `ADMIN_EMAIL`：BookAI 系統管理員 Email，例如 `lotes.9766001@gmail.com`。
- `ADMIN_PASSWORD`：正式系統管理員密碼，必須由 Render env 設定。

相容說明：舊環境若已設定 `BOOKAI_BOOTSTRAP_SECRET` 仍可運作，但正式部署建議改用 `BOOTSTRAP_SECRET`。

## 3. 上線第一步

1. 開啟 `https://你的服務網址/api/health`，確認 `ok: true`、`version: v5.4`。
2. 使用 bootstrap API 建立或重設 Admin：
   ```bash
   curl -X POST https://你的服務網址/api/bootstrap/admin \
     -H "Content-Type: application/json" \
     -d '{"secret":"你的 BOOTSTRAP_SECRET"}'
   ```
3. 使用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登入 BookAI。
4. 進入 BookAI 營運後台，建立或檢查公司資料。
5. 使用一般公司帳號登入，確認看不到 BookAI 營運後台。

正式環境 bootstrap 回傳不會包含明文密碼；請以 Render env 中的 `ADMIN_PASSWORD` 登入。

## 4. 官方網站登入連結

- 官方網站的「登入 BookAI」應導向已部署的 BookAI app URL。
- 不要導向測試資料工具、未登入系統頁面、localhost 或非正式網址。
- 靜態官方網站若需要手動調整，請確認所有登入按鈕的 LOGIN_URL 都指向 production app。
- 目前官方網站登入連結不得使用 `localhost:5173`。

## 5. 上線驗收清單

- 登入頁可正常開啟。
- 一般帳號登入後進入自己的公司系統。
- Dashboard / 經營總覽可讀取資料。
- 供應商管理：新增、編輯、刪除。
- 客戶管理：新增、編輯、刪除。
- 進貨管理：建立進貨單並增加庫存。
- 銷貨管理：建立銷貨單並扣減庫存。
- 庫存不足時銷貨被阻擋。
- 進貨 / 銷貨作廢後庫存正確回滾。
- 商品 / 材料庫存可正常顯示。
- 接案中心、案場中心、標案雷達可正常開啟。
- Commerce 官網後台不影響工程業公司。
- BookAI 營運後台只給系統管理員看到。
- 一般帳號直接呼叫 `/api/admin/*` 應回 403。
- 官方網站「登入 BookAI」按鈕導向 production app。
- 手機版登入、Sidebar、表格與表單不橫向破版。

## 6. 安全提醒

- 不要使用 `test-secret` 作為正式 `BOOTSTRAP_SECRET`。
- 不要使用 `demo123456` 作為正式 `ADMIN_PASSWORD`。
- 不要提交 `.env`。
- 不要提交 SQLite 正式資料庫，例如 `server/bookai.sqlite`。
- 不要提交 `node_modules`。
- 不要把 `JWT_SECRET`、`BOOTSTRAP_SECRET`、`ADMIN_PASSWORD` 寫進前端或程式碼。
- Bootstrap 完成後，建議輪替或移除 `BOOTSTRAP_SECRET`。
- 不要在正式資料庫執行會污染資料的 smoke 測試。
