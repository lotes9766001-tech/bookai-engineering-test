# BookAI Launch Readiness Checklist

## 必要環境變數

- `JWT_SECRET`：正式環境請使用高強度隨機字串。
- `BOOKAI_BOOTSTRAP_SECRET`：只用於 `/api/bootstrap/admin` 初始化管理員，正式環境不得使用 `test-secret`。
- `ADMIN_EMAIL`：BookAI GM / Admin 帳號 Email，預設可使用 `lotes.9766001@gmail.com`。
- `NODE_ENV=production`
- `PORT`：Render 通常會自動提供。

## Render 設定

- Build Command：`npm install && npm run build`
- Start Command：`npm start`

## 上線後檢查

- `/api/health` 是否回傳正常。
- 官方網站 CTA 是否導向登入 BookAI。
- 登入頁是否正常顯示。
- Admin / GM 帳號可登入並看到 BookAI 後台。
- 一般公司帳號可登入，但看不到 BookAI 後台。
- 進貨管理可建立進貨單並增加庫存。
- 銷貨管理可建立銷貨單並扣減庫存。
- 庫存不足時銷貨會被阻擋。
- 進貨 / 銷貨作廢會回滾庫存。
- 接案中心、案場中心、標案雷達仍可正常開啟。

## 安全提醒

- 不要在正式環境使用簡單的 `JWT_SECRET` 或 `BOOKAI_BOOTSTRAP_SECRET`。
- 不要把管理密鑰寫進前端程式碼或公開文件。
- Bootstrap admin 完成後，建議輪替或移除 `BOOKAI_BOOTSTRAP_SECRET`。
- 一般使用者呼叫 `/api/admin/*` 必須回傳 403。
- 不要在正式資料庫執行會污染資料的 smoke 測試。
