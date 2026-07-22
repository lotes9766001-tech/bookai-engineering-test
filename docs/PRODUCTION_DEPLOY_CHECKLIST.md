# BookAI 正式部署檢查清單（Package A）

本清單只供 QA/維運執行。Package A 不授權 Codex 自行部署、修改 production env 或操作正式資料。

## 部署前

- [ ] 記錄 branch、commit SHA、`git status`，確認變更已 review。
- [ ] 使用 lockfile 安裝相依套件並確認無 unexpected package change。
- [ ] 執行前端 build。
- [ ] 以隔離環境執行後端語法與啟動測試。
- [ ] 執行專案可用的 lint、typecheck、unit、integration、health、smoke；缺少的項目須明列 waiver。
- [ ] 僅檢查環境變數 presence：runtime 必要為 `DATABASE_URL`、`JWT_SECRET`；identity 為 `FOUNDER_EMAIL`、`ADMIN_EMAIL`；CORS security 為 `CORS_ORIGIN`。Bootstrap 變數只在受控初始化期間檢查。禁止輸出值。
- [ ] 確認 production `NODE_ENV=production` 且 provider 必為 PostgreSQL；禁止 `BOOKAI_DB_PROVIDER=sqlite`。
- [ ] DBA review migration 狀態；禁止臨時或破壞性 migration。
- [ ] 確認 PostgreSQL 備份完成、時間與 restore 方法已驗證。
- [ ] 記錄可回滾 commit、前一版 artifact 與負責人。
- [ ] 確認 Render Start Command 為 `npm start`，Build Command 為經核准的 `npm run render:build`，Health Check Path 依維運策略使用 `/api/health`。
- [ ] 確認 Render `PORT` 由平台注入，程式綁定 `0.0.0.0`。
- [ ] 在隔離測試帳號 smoke test Founder、Admin、一般會員、pending_review/rejected/suspended 阻擋與登出/過期 token。
- [ ] 以至少兩家公司測試 `company_id` 隔離，確認跨公司讀寫為 403/404。
- [ ] 確認 uploads 已備份並評估目前 instance 是否掛 Persistent Disk。
- [ ] 確認未把 `.env`、token、DB URL、密碼或 production dump 納入 commit/artifact/log。

## 部署後（依序）

1. [ ] `GET /api/ping` 為 200，且不依賴 DB。
2. [ ] `GET /api/health` 為 200。
3. [ ] `database.ready`（或相容的 `postgresReady`）為 `true`。
4. [ ] `database.provider` 為 `postgresql`，不得為 SQLite。
5. [ ] 登入頁可開啟且無持續 console/network error。
6. [ ] Founder 登入與 Founder-only API 正常，非 Founder 為 403。
7. [ ] Admin 審核後台正常，非 Admin 為 403。
8. [ ] 已核准一般會員可登入所屬公司。
9. [ ] `pending_review` 仍被核心系統阻擋；rejected/suspended 亦符合預期。
10. [ ] CMS 後台可讀取；寫入僅由授權角色執行。
11. [ ] FurVita Preview 可開啟，空區塊不白畫面。
12. [ ] 公開網站與不存在 slug 的 404 狀態正確。
13. [ ] Logo、Banner、商品/文章圖片可載入；抽查重啟後仍存在。
14. [ ] 工程案場與估價/收款/月報可讀取。
15. [ ] 材料、工具、庫存與案場用料可讀取。
16. [ ] suppliers/customers/purchases/sales 與明細可讀取。
17. [ ] 檢查 Render runtime log：無 secret、無重複 listen、provider 正確、無 pool error storm。
18. [ ] 觀察期內沒有持續 500/503、process restart loop 或資料消失。

所有寫入 smoke 必須使用 QA 核准的隔離資料；不得任意操作正式會員或建立真實帳號。

## 回滾條件

發生任一項立即停止寫入並依 incident runbook 回滾：

- 登入普遍失敗或 token 驗證異常。
- PostgreSQL unavailable 或 `/api/health` 持續 503。
- Production provider 顯示 SQLite。
- Founder/Admin 權限錯亂或一般會員可進入管理 API。
- 會員審核阻擋或 `company_id` 隔離失效。
- 核心 API 持續 500。
- CMS Preview/公開網站持續 503 或白畫面。
- Build 通過但 runtime crash/restart loop。
- 已確認資料寫入後消失、void 回滾錯誤或圖片消失。

## 安全回滾程序

1. 停止新寫入或進入維護模式（由維運/Boss 核准）。
2. 切回已記錄的前一版 commit/artifact；不要用 `git reset --hard` 覆蓋工作目錄。
3. 不反向執行未審核 migration；若 schema/data 涉及，交由 DBA 使用已驗證備份/runbook。
4. 重新確認 ping、health、provider、登入、權限、核心唯讀 API。
5. 保留 requestId、時間窗與安全 log，建立 incident 記錄。

## Package A.1 部署 Gate

- [ ] `NODE_ENV` 缺少、非法或不是 `production` 均為部署阻斷；Render 上線前人工確認 `NODE_ENV=production`。
- [ ] 啟動 log 僅顯示解析後 environment、port、database provider，不顯示任何設定值。
- [ ] `DATABASE_URL` 與 `JWT_SECRET` 缺少時 health 503，且一般 API 503；production 不建立 SQLite。
- [ ] `FOUNDER_EMAIL`、`ADMIN_EMAIL` 均已設定；若缺少，health 應 degraded 且對應高權限 route 應安全 503，不得使用程式 fallback。
- [ ] 若前後端跨來源，`CORS_ORIGIN` 明確列出核准來源；若同源，確認未設定時同源可用、其他跨來源拒絕。
- [ ] `CLIENT_URL` 目前未使用，不得將其誤認為 CORS 或 redirect 設定。

## Bootstrap Runbook

1. 僅於受控維運期間設定主要名稱 `BOOTSTRAP_SECRET` 與 `ADMIN_PASSWORD`；`BOOKAI_BOOTSTRAP_SECRET` 僅為 deprecated 相容 alias。
2. 執行前確認備份、授權、目標 identity 與回滾方式。
3. 完成初始化後移除 bootstrap secret 與 password。
4. 移除後確認一般 API、登入、CMS、ERP 正常，health runtime 仍健康。
5. 確認 bootstrap routes 回 404。
6. 確認 bootstrap secret 無法存取 Debug API；production Debug route 應回 404。

## Package A.2 部署與 Shutdown Gate

- [ ] A.2 已由獨立 QA 驗收；本機 smoke 通過不等於部署核准。
- [ ] staging 明確設定 `TENDER_SYNC_ENABLED=false`，或由 Boss 核准後明確設為 `true`；不得依賴缺省推測。
- [ ] 若設定 `TENDER_SYNC_INTERVAL_MS`，確認為 60,000 至 604,800,000 的整數。
- [ ] Render 送出 SIGTERM 後 health 先轉為 503／`shutting_down`，舊 instance 在 force timeout 前正常退出。
- [ ] 確認 HTTP 不再接受新連線、既有 request 完成、Pool end 無持續錯誤。
- [ ] 確認沒有 restart loop、Port 占用或 background timer 殘留。
- [ ] 確認 Tender failure 不影響 ping、health 與一般 API。
- [ ] 多 Instance 開啟 Tender Sync 前完成營運風險接受；本包沒有分散式鎖。
- [ ] 發生 force timeout、Pool close 持續失敗或重複 Tender Sync 時停止上線並回滾。
- Package B-Core-1 前置：確認 `bookai_schema_migrations` 版本與 checksum，且 migration 只能由受控 CLI/DBA 流程執行；不得由 API startup 自動建立或修改 PostgreSQL schema。
- B-Core-2：確認 required schema version 為 `007_schema_parity`；static contract 不是 staging parity 證據，未完成 staging 前不得部署。
