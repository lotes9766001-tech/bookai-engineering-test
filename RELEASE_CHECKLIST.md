# BookAI Release Checklist

## Git 與檔案

- `git status` 必須乾淨，或只包含本次預期檔案。
- 不要提交 `server/bookai.sqlite`。
- 不要提交 `server/*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`。
- 不要提交 `node_modules`。
- 不要提交 `.env` 或任何 secret 檔。
- 不要提交 `client/dist`，除非專案明確決定改為提交 build output。
- 不要提交本機備份、暫存檔、壓縮檔。

## 自動檢查

- `node --check server/index.js`
- `node --check server/db.js`
- `node --check scripts/health-check.js`
- `npm run build`
- `npm run health`

## 權限實測

- Admin / GM 帳號可看到 BookAI 後台。
- 一般帳號看不到 BookAI 後台。
- 一般帳號直接呼叫 `/api/admin/*` 會回 403。
- 一般帳號只能操作自己的公司資料。

## ERP 核心實測

- 供應商：新增、編輯、刪除。
- 客戶：新增、編輯、刪除。
- 進貨：建立單據後庫存增加。
- 銷貨：建立單據後庫存扣減。
- 銷貨庫存不足會被阻擋。
- 進貨作廢會扣回庫存。
- 銷貨作廢會加回庫存。
- Dashboard 本月進貨 / 銷貨 / 未收款 / 未付款數字合理。

## 產品頁面實測

- 登入頁。
- Dashboard / 經營總覽。
- 商品 / 材料庫存。
- 收支管理。
- 發票中心。
- 接案中心。
- 案場中心。
- 標案雷達。
- Commerce 官網後台。
- BookAI 後台。
- 手機版 RWD。

## 官方網站

- 官方網站「登入 BookAI」CTA 導向 production app。
- 不導向 Demo、測試入口或 localhost。
- 手機版 header / menu / cards 不破版。
