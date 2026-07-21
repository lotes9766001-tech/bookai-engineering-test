# BookAI 正式環境穩定性稽核（Package A）

稽核日期：2026-07-13  
範圍：本機程式碼與安全 smoke test；未部署、未連線或寫入正式 PostgreSQL。

## 現況盤點

| 項目 | 實際狀態 |
| --- | --- |
| 專案入口 | `server/index.js` |
| Root start | `npm start` → `npm --prefix server start` |
| Server start | `node index.js` |
| Frontend build | `npm --prefix client run build`（Vite） |
| Render build | `npm run render:build` |
| Render 設定 | Repository 無 `render.yaml`；設定依賴 Render Dashboard 與 `docs/RENDER_DEPLOYMENT.md` |
| Listen | 單一 `app.listen`，使用 `Number(process.env.PORT) || 5050`，綁定 `0.0.0.0` |
| PostgreSQL pool | `server/pg-db.js` 的 lazy singleton Pool |
| SQLite | `server/db.js`，供本機無 `DATABASE_URL` 開發使用 |
| 靜態前端 | Server 供應 `client/dist`，非 `/api` 路由回傳 SPA `index.html` |
| Uploads | `server/uploads` 經 `/uploads` 提供靜態檔案 |

後端沒有獨立 `src` 目錄，多數 API 仍集中於 `server/index.js`。Repository 目前沒有 unit、integration、lint 或 typecheck script；既有根 scripts 包含 `health`、`smoke`、`rbac:smoke` 等，其中部分會建立或更新本機測試資料，不能直接指向正式資料庫。

## 資料庫選擇規則

修改後規則如下：

1. `NODE_ENV=production`：固定 provider 為 `postgresql`；即使誤設 `BOOKAI_DB_PROVIDER=sqlite` 也不會初始化 SQLite。
2. Production 缺少必要設定：Server 保持啟動，使 `/api/ping` 與 `/api/health` 可診斷；其他 API 統一回 503，DB API 不會 fallback。
3. 非 production 且有 `DATABASE_URL`：使用 PostgreSQL。
4. 非 production、無 `DATABASE_URL` 且未指定 provider：使用 SQLite。
5. 非 production 可沿用 `BOOKAI_DB_PROVIDER` 的既有顯式選擇方式。

選擇「保留程序、health unhealthy」而非 production 缺設定即終止，是為了讓 Render 能完成程序級診斷；此狀態不得視為可對外服務或可部署成功。

## Ping 與 Health

- `GET /api/ping`：只確認 Node/Express 存活，不查 DB、不執行 migration、不需登入；回 200、service、timestamp、uptimeSeconds。
- `GET /api/health`：檢查 server、目前 database provider、實際 `SELECT 1`、production 必要環境變數；DB 查詢上限 5 秒。
- Healthy 回 200；DB/必要設定異常回 503。
- Health 不回傳連線 URL、host、SQL、密碼、完整 DB error 或 stack。

Package A.1 已將 production 設定拆分：只有 `DATABASE_URL` 與 `JWT_SECRET` 是永久 runtime blocking；`BOOTSTRAP_SECRET`（相容 deprecated alias `BOOKAI_BOOTSTRAP_SECRET`）與 `ADMIN_PASSWORD` 僅在 bootstrap 時必要；`FOUNDER_EMAIL`、`ADMIN_EMAIL` 缺少時只拒絕相依的高權限入口；`CORS_ORIGIN` 缺少時拒絕非同源跨來源，但不阻斷同源 API；`CLIENT_URL` 目前未使用。`NODE_ENV` 必須由部署流程明確設為 `production`；缺少時為了本機相容會解析為 development，但 health 會公開非敏感的 `environmentExplicit=false` 供部署 Gate 判斷，非法值則 configuration unhealthy。`DB_PATH` 只適用 SQLite 開發。

## 權限與資料隔離

- JWT middleware 驗證 Bearer token，期限由既有登入流程簽發為 7 天。
- Founder 與 Admin 仍分別經 `requireFounder` / `requireAdmin` 驗證資料庫使用者 email。
- `pending_review`、`rejected`、`suspended` 仍由 `requireApproved` 阻擋；Founder/Admin 既有特權規則未修改。
- 公司 API 仍以 `companies` + `company_users` 同時比對 `company_id` 與 `user_id`，角色 middleware 未放寬。
- CMS 管理 API 仍要求 `auth`、`cmsCompany`，寫入 API另有 owner/admin/staff 等既有角色限制；公開 API 沒有加上登入要求。

本包未修改註冊、登入、登出、審核狀態更新、RBAC、company isolation 或 ERP 業務 SQL。

## CMS 公開網站與 Preview

現有公開 API 對不存在 slug、商品或文章回 404；列表查詢回空陣列。前端 `PublicSitePage` 已對空 Banner、商品、文章、FAQ 提供 fallback/empty state，圖片 URL 缺失或載入失敗會顯示 placeholder，整頁亦有 loading、not found/unavailable 狀態。

`/site-preview/:slug` 目前使用登入後 CMS API 讀取使用者可管理公司，而非以 URL slug 直接開放草稿資料，安全性較佳；風險是 URL slug 與實際預覽公司不一致時可能造成使用者困惑。本包不改 Preview 權限模型，以免放寬未發布資料。

## 主要風險

- **P1：Render uploads 非持久化。** `server/uploads` 位於 instance 本機檔案系統；未掛 Persistent Disk 時，重新部署或 instance 重建後圖片可能消失。後續應評估 Render Persistent Disk 或受控 object storage，遷移前須先備份與核對既有 URL。本包未刪除或改寫 uploads。
- **P1：啟動時 schema 初始化。** `checkPostgresStartup()` 既有流程呼叫 `initPostgresDb()`，內含 `CREATE TABLE IF NOT EXISTS`/相容性 schema 調整。雖未見破壞性 migration，本包未在任何正式 DB 執行；上線前仍須由 DBA review 並確認備份。
- **P1：無 repository 版 Render IaC。** Dashboard command/env drift 不易由 Git review；建議後續建立經審核的 `render.yaml`，本包不擅自改部署設定。
- **P2：Express 4 大型單檔。** 多數 async routes 自行 catch，仍需長期補齊 integration test，避免漏接 rejected Promise。
- **P2：缺完整自動測試。** 權限與庫存回滾需 QA 在隔離測試資料庫驗證。

## 本次修改

- Production 固定 PostgreSQL，禁止 SQLite fallback。
- 新增集中式 production env presence check；log 只顯示 present/missing。
- Pool 增加 connection timeout、idle timeout、max connections 與 background error handler。
- 強化 ping/health、安全 503 與 DB timeout。
- 新增 requestId、API 404 與全域 error response；前端 API clients 同時支援舊字串與新物件錯誤格式。
- 啟動 log 顯示 environment、port、database provider，不顯示 secret。
- 新增部署與 QA 文件。

## 刻意不修改

- 不部署、不 push、不建立 commit、不修改 Render/Supabase/env。
- 不執行 PostgreSQL migration、seed、正式 DB smoke 或會員狀態操作。
- 不移除 SQLite、不替換 ORM/PG 套件、不重寫 SQL。
- 不修改 Founder/Admin、會員審核、CMS 管理權限或 company isolation。
- 不重新設計 FurVita、不修改品牌內容、不建立示範資料。
- 不更換 uploads 儲存服務。

## 後續建議

1. QA 使用隔離 PostgreSQL staging DB 完成登入、審核、RBAC、company isolation、進銷貨 void/庫存回滾與 CMS 全流程。
2. DBA review 並版本化 production schema migration，部署前完成可驗證備份與 restore drill。
3. 為 uploads 制定持久化與遷移方案；切換前保留舊 URL 相容性。
4. 補 API integration tests，優先涵蓋 auth/review/RBAC、CMS public/admin 邊界與庫存 transaction。
5. 將 Render 設定納入版本控管，但須由 Boss/維運另案核准。

## Environment Classification（Package A.1）

| 分類 | 設定 | Production 缺少時行為 |
| --- | --- | --- |
| Runtime required | `DATABASE_URL`、`JWT_SECRET` | ping 仍為 200；health 與依賴 runtime 的 API 為安全 503；不使用 SQLite |
| Bootstrap only | `BOOTSTRAP_SECRET`（主要）、`BOOKAI_BOOTSTRAP_SECRET`（deprecated alias）、`ADMIN_PASSWORD` | 一般 API 與 health runtime 不受影響；bootstrap route 以 404 停用 |
| Privileged identity | `FOUNDER_EMAIL`、`ADMIN_EMAIL` | production 不使用程式 fallback；一般 API 不受影響；相依高權限 route 安全 503；health 為 degraded（DB 健康時） |
| CORS/security | `CORS_ORIGIN` | 非 runtime blocking；同源及無 Origin 的 server-to-server request 可用，非 allowlist 的跨來源拒絕；health 為 degraded（DB 健康時） |
| Optional/unused | `CLIENT_URL` | 目前無程式呼叫位置，僅保留，不控制 CORS 或 redirect |
| Development only | `DB_PATH`、`BOOKAI_DB_PROVIDER` | 只供本機 SQLite／測試；production provider 固定 PostgreSQL |

`NODE_ENV` 只接受 `development`、`test`、`production`。非法值會記錄安全 configuration error、health 503，且不允許 SQLite fallback。缺少值仍保留本機 development 便利性，因此部署 Gate 必須把「缺少或不是 production」視為阻斷；Render 上線前必須人工確認 `NODE_ENV=production`，並核對啟動 log 顯示的解析後 environment。

## Bootstrap Runbook

1. 僅在已授權且受控的維運期間設定 bootstrap secret 與 bootstrap password。
2. 執行前確認資料庫備份、操作人授權、目標 identity 設定及回滾方式；不得用正式帳號做非必要測試。
3. 完成初始化後立即移除 bootstrap secret 與 password。
4. 移除後確認一般 API、登入、CMS 與 ERP 均正常，health 的 runtime checks 不受影響。
5. 確認 bootstrap routes 回 404，表示高權限入口已停用。
6. Bootstrap secret 不得用於 Debug API；production Debug route 固定停用。

## Package A.2 Runtime Lifecycle（待 QA）

- 唯一 `app.listen` 現在保存 HTTP Server 引用，供統一 shutdown coordinator 關閉。
- `SIGTERM`／`SIGINT` 使用 exit code 0；`uncaughtException`／`unhandledRejection` 使用 exit code 1，均走冪等 cleanup。
- shutdown 順序為：標記狀態、停止背景排程、清除 timer、短暫 health drain、關閉 HTTP、等待背景工作、關閉 PostgreSQL Pool、退出。
- `/api/health` 在 shutdown drain window 回 503／`shutting_down`，並保留 provider、postgresReady 與 database 欄位。
- PostgreSQL Pool close 為 lazy-safe 與冪等；Pool 未建立時不會因 shutdown 建立 Pool。
- Tender startup timeout 與 interval 納入 registry；只有 `TENDER_SYNC_ENABLED=true` 才啟用，缺少或非法設定均安全停用。
- Tender interval 僅接受安全正整數範圍；同步錯誤不形成未處理 rejection。
- 尚未驗證 Render signal timing、Supabase Pool end 或多 Instance 排程；不得標記 A.2 QA Pass 或直接部署。
