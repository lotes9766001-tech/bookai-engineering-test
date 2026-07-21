# BookAI Package A QA 驗收清單

填寫方式：實際結果記錄 HTTP status、畫面或 requestId；禁止貼 token、Cookie、密碼、DB URL。P0/P1 任一 Fail 均阻擋部署。

| # | 風險 | 測試步驟 | 預期結果 | 實際結果 | Pass/Fail | 阻擋部署 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | P0 | Production-like 環境不設 `DATABASE_URL` 啟動 | 程序可供診斷；不建立 SQLite；health 503/configuration error |  |  | 是 |
| 2 | P0 | `NODE_ENV=production` 且誤設 SQLite provider | provider 仍為 PostgreSQL，不 fallback |  |  | 是 |
| 3 | P0 | 設隔離 PostgreSQL 測試 URL 後啟動 | 單一 Pool，health 200，provider PostgreSQL |  |  | 是 |
| 4 | P1 | `GET /api/ping` | 200；含 service/timestamp/uptime；DB 離線仍快速回應 |  |  | 是 |
| 5 | P1 | DB 正常時 `GET /api/health` | 200；server/database/requiredEnv 均 true |  |  | 是 |
| 6 | P0 | 隔離 DB 停止或阻斷連線再呼叫 health | 5 秒左右結束、503、無 URL/SQL/stack |  |  | 是 |
| 7 | P1 | 呼叫不存在 `/api/...` | 404；統一 error object 含 requestId |  |  | 是 |
| 8 | P1 | 觸發受控測試 500 | 500；production 無 stack/secret；log 可用 requestId 對應 |  |  | 是 |
| 9 | P1 | 使用自訂合法 `X-Request-Id` | response header/error body 保留同一 ID |  |  | 是 |
| 10 | P0 | approved 一般會員登入/登出/過期 token | 登入與登出正常；過期 token 401 |  |  | 是 |
| 11 | P0 | pending_review/rejected/suspended 帳號進核心 API | 分別依既有規則 403，不能讀 ERP |  |  | 是 |
| 12 | P0 | Founder 與非 Founder 呼叫 Founder API | Founder 正常；其他角色 403 |  |  | 是 |
| 13 | P0 | Admin 與一般會員呼叫審核 API | Admin 正常；一般會員 403；不改真實會員狀態 |  |  | 是 |
| 14 | P0 | 公司 A token 讀寫公司 B API | 403/404，資料不洩漏、不寫入 |  |  | 是 |
| 15 | P0 | CMS 管理 API 無 token/錯誤角色 | 401/403；權限未放寬 |  |  | 是 |
| 16 | P1 | 公開 CMS API 不帶 token | 已發布網站可讀取 |  |  | 是 |
| 17 | P1 | 公開 API 使用不存在 slug | 404，不是 500 |  |  | 是 |
| 18 | P1 | 已發布網站無 Banner/商品/文章/FAQ | API 回空陣列；頁面顯示 empty state、不白畫面 |  |  | 是 |
| 19 | P1 | 圖片 URL 為 null、空字串、404 | 顯示 placeholder；React 不 crash |  |  | 是 |
| 20 | P1 | `/site-preview/:slug` 以 CMS 使用者開啟 | 可預覽所屬公司；未授權使用者不可讀草稿 |  |  | 是 |
| 21 | P1 | 重啟/重新部署測試 instance 後抽查 uploads | 圖片仍存在；若無持久化則阻擋並先處理 |  |  | 是 |
| 22 | P1 | 案場/估價/收款/材料/工具/庫存異動/用料/退料/月報 | 唯讀與核准的隔離寫入流程正常 |  |  | 是 |
| 23 | P1 | 報價、請款、結案輸出 | 產出成功，金額與公司資料正確 |  |  | 是 |
| 24 | P0 | 進貨、銷貨及 void 流程（隔離資料） | 明細正確；void 回滾庫存且不可重複回滾 |  |  | 是 |
| 25 | P1 | suppliers/customers/purchases/sales/inventory | 各列表與明細正常，company isolation 有效 |  |  | 是 |
| 26 | P1 | 前端 production build | Build 成功，無 unresolved import |  |  | 是 |
| 27 | P1 | 後端 syntax/start smoke | 無語法錯誤、單一 listen、綁 `0.0.0.0`/平台 Port |  |  | 是 |
| 28 | P2 | 檢查 CORS allowlist | 核准 origin 可用；其他瀏覽器 origin 被拒絕 |  |  | 否（需風險簽核） |
| 29 | P1 | 檢查 runtime log | 僅有安全摘要/presence；無 Authorization/Cookie/password/token/URL |  |  | 是 |
| 30 | P1 | 連續觀察 health 與主要 API | 無持續 500/503、pool error storm、restart loop |  |  | 是 |
| 31 | P0 | `NODE_ENV` 設非法值 | ping 200；health 503；一般 API 503；不建立 SQLite；log 不含 secret |  |  | 是 |
| 32 | P0 | 部署設定缺少 `NODE_ENV` | health 顯示 `environmentExplicit=false`；部署 Gate 阻斷，不得當成 production 上線 |  |  | 是 |
| 33 | P1 | Production 缺少 `BOOTSTRAP_SECRET` | 一般 API 不受影響；health runtime 不因它失敗；bootstrap routes 404 |  |  | 是 |
| 34 | P1 | Production 缺少 `ADMIN_PASSWORD` | 一般 CMS／ERP 不受影響；bootstrap routes 404 |  |  | 是 |
| 35 | P0 | Production 缺少 `FOUNDER_EMAIL`／`ADMIN_EMAIL` | 一般 API 不被全域阻擋；health degraded；相依高權限 routes 安全 503；無 email fallback |  |  | 是 |
| 36 | P0 | CORS 同源、allowlist、非 allowlist | 同源與 allowlist 成功；非 allowlist 403；不造成 process crash |  |  | 是 |
| 37 | P1 | OPTIONS 在 runtime configuration 缺失時預檢 | 核准 origin 的 OPTIONS 由 CORS 在 configuration gate 前回 204 |  |  | 是 |
| 38 | P0 | Production Debug route 帶 bootstrap secret、Member/Admin/Founder JWT | 一律 404；bootstrap secret 不具 Debug 授權能力 |  |  | 是 |
| 39 | P1 | Development Debug route RBAC | bootstrap secret 403；一般會員 403；有效 Founder JWT 200，response 無敏感資料 |  |  | 是 |
| 40 | P1 | Bootstrap 完成後移除 secret/password | 一般 API、登入、CMS、ERP 正常；bootstrap routes 404 |  |  | 是 |

## Environment Classification

- Runtime required：`DATABASE_URL`、`JWT_SECRET`。
- Bootstrap only：`BOOTSTRAP_SECRET`（主要）、`BOOKAI_BOOTSTRAP_SECRET`（deprecated alias）、`ADMIN_PASSWORD`。
- Privileged identity：`FOUNDER_EMAIL`、`ADMIN_EMAIL`。
- CORS/security：`CORS_ORIGIN`；不作全域 runtime gate。
- Optional/unused：`CLIENT_URL`，目前不控制任何 runtime 功能。

## Bootstrap Runbook

1. 僅在受控維運期間設定 Secret；執行前確認備份與授權。
2. 初始化完成後移除 Secret 與 bootstrap password。
3. 移除後驗證一般 API、登入、CMS、ERP 正常，並確認 bootstrap routes 404。
4. Bootstrap secret 不得存取 Debug API。

## QA 簽核

- QA 驗收角色：Codex（BookAI QA 評測與測試員）
- QA 驗收日期：2026-07-14（Asia/Taipei）
- 測試環境：Windows PowerShell、Node.js 22.23.1、本機 development、隔離暫存 SQLite；未讀取 `.env`，未連線 PostgreSQL／Render／Supabase。
- 基準 commit：`b97b96d Improve BI cost snapshots and page structure`
- 工作樹識別：`b97b96d` + 10 個已追蹤修改 + 6 個新增檔案；受測內容 SHA-256（排除本 QA 簽核欄位）`84658c9fa7a5b50fd4d90cab747323aeb35b6d1f759bc6b0a8c44e4390980512`。
- 修改檔案：`client/src/lib/api.js`、`client/src/lib/publicSiteApi.js`、`package.json`、`scripts/health-check.js`、`scripts/rbac-smoke-test.js`、`scripts/smoke-clean.js`、`scripts/smoke-test.js`、`server/db.js`、`server/index.js`、`server/pg-db.js`。
- 新增檔案：`docs/PACKAGE_A_PRE_QA_RISK_REPORT.md`、`docs/PACKAGE_A_QA_CHECKLIST.md`、`docs/PRODUCTION_DEPLOY_CHECKLIST.md`、`docs/PRODUCTION_STABILITY_AUDIT.md`、`scripts/package-a-smoke-test.js`、`server/env.js`。
- 測試資料來源：程式建立的暫存 SQLite 與既有 SQLite 的暫存副本；所有 HTTP 身分均使用保留測試網域，測試後清除。原始 SQLite SHA-256 前後一致。
- Package A：**Fail**。`pending_review` 使用者在公司狀態為 `approved` 的不一致狀態下可進入核心 API（預期 403，實際 200）。
- Package A.1：**Pass**。環境分類、production PostgreSQL gate、Bootstrap、Debug、identity、CORS 與相容 Health 欄位測試通過。
- P0：0。
- P1：未審核會員狀態不一致時的權限繞過（部署阻斷）；PostgreSQL staging、Render runtime／正式 CORS 未驗證；graceful shutdown 未實作；Tender Sync 無 staging disable 且多 Instance 可能重複；`/uploads` 未驗證持久化。
- P2：缺少完整 PostgreSQL integration tests；部分既有 log 可能包含過度詳細 driver error；CMS 聚合 API 使用 `Promise.all`，單一區塊失敗可能讓整體失敗；`server/index.js` 體積大。
- P3：production bundle 約 994 KB；Git 顯示 LF／CRLF working-copy warning。
- 接受的剩餘風險：僅接受記錄為 QA 後續追蹤，不接受其作為直接部署風險；P1 權限問題修正並重測前不得部署。
- 未驗證項目與原因：PostgreSQL staging、Render、正式帳號、正式 CORS 拓撲、uploads persistence 均受本次安全限制，未宣稱 Pass。
- 是否允許進入 Package A.2：**修正後允許**。
- 是否允許部署：**存在阻斷問題，不得部署**。

## Package A.2-Fix-1 正式 QA 複驗（2026-07-20，Asia/Taipei）

> 本節為獨立 QA 複驗追加紀錄；原 Package A.2 Fail 與 A.2-Fix-1 工程修補紀錄均保留。本次未修改 sanitizer 或任何業務程式碼。

- QA 角色：Codex（BookAI QA 評測與測試員）。
- 測試環境：Windows PowerShell、Node.js 22.23.1、隔離 child／HTTP、兩份獨立暫存 SQLite；未讀取真實 `.env`、未連線 PostgreSQL、未執行真實 Tender Sync。
- Baseline：`b97b96d Improve BI cost snapshots and page structure`。
- 工作樹：10 個 tracked modifications、9 個 untracked additions、0 個刪除。
- 受測內容 SHA-256：`3250564997f52fdbbdad3c7830158d3d728958a0b6e469ef584139452de14c59`（排除本 QA 紀錄檔）。
- 原漏洞複驗：DATABASE_URL等號、空白、冒號、單／雙引號、大小寫、JSON、key空白、逗號、分號、換行、重複及混合其他敏感資料格式均已完全遮蔽；原始值與 URI組成不再出現在輸出。
- 既有遮蔽：postgres／postgresql URI、Authorization、Bearer、Cookie、Set-Cookie、Token、Secret、Password及raw JWT均Pass。
- 邊界：null、undefined、空字串、Error、字串、一般物件、循環物件、惡意getter、超長、多行、混合大小寫、不修改原Error均Pass。
- Sanitizer獨立矩陣：37 Pass／1 Fail。

### Fail 證據

- **P1／部署阻斷：未加引號的DATABASE_URL值以空白接續正常診斷文字時，診斷文字被正規式一併移除。**
- 測試形態：`DATABASE_URL=<fake-value> Connection timeout`；輸出已遮蔽fake value，但未保留`Connection timeout`。
- 程式證據：`server/runtime-lifecycle.js:13` 的未引號分支使用 `[^,;\r\n}]+`，會持續匹配空白及其後文字，直到逗號、分號、換行或右大括號。
- 影響：不造成原始Secret洩漏，但違反「正常診斷訊息仍可讀」及「regex不得吞掉敏感值後方正常文字」驗收條件，可能降低fatal／cleanup log的可診斷性。
- 修補要求：限制未引號值的匹配邊界，並新增明確 regression case；須同時維持含query／SSL參數的URI完整遮蔽，避免以簡單空白截斷破壞quoted／JSON案例。

### 回歸與完整性

- 語法、build、health、Package A smoke、Package A.2 smoke及`git diff --check`均Pass。
- Core smoke：獨立暫存SQLite，exit 0；案場、用料、退料、材料費及庫存異動Pass。
- RBAC smoke：另一份獨立暫存SQLite，exit 0；owner、admin、accounting、staff、viewer Pass。
- Package A／A.1／A-Fix-1：pending_review＋approved company維持403；狀態矩陣、跨公司隔離及CMS public/admin無退化。
- 原始SQLite SHA-256前後均為`9423B460D43A168BE1D2A1D18C3FA3AB4733D807C4CF65174BB660236AD2F187`。
- 暫存SQLite／WAL／SHM、測試Child Process、Timer residue均為0；所有測試Port已釋放。
- `.env`、SQLite、uploads、Private Key、JWT literal、非本機PostgreSQL URI及刪除檔案變更均為0。

### 結論與保留風險

- P0：無。
- P1：上述診斷文字過度遮蔽Fail；Render真實SIGTERM、Supabase Pool end、Tender多Instance、uploads持久性仍未驗證。
- P2：manual Tender disabled的503契約變更；health timeout不取消底層query；缺PostgreSQL integration test；`server/index.js`體積大。
- P3：production bundle約994 KB；LF／CRLF warning。
- Package A.2-Fix-1：**Fail**。
- Package A.2最終結果：**Fail**。
- 是否允許進入Package B：**修正後允許**。
- 是否允許部署：**存在阻斷問題，不得部署**。

## Package A.2-Fix-1 工程修補紀錄（2026-07-20，Asia/Taipei）

> 本節只記錄針對 A.2 正式 QA sanitizer Fail 的工程修補與自測。上方 Package A.2 **Fail** 紀錄完整保留；本節不得視為 A.2 QA Pass 或部署核准。

- 根因：`safeErrorSummary()` 原先只遮蔽 PostgreSQL URI及 token／secret／password／authorization／cookie key，沒有直接遮蔽 `DATABASE_URL` key/value 格式。
- 修補位置：`server/runtime-lifecycle.js` 的 `safeErrorSummary()`；未修改 Shutdown、Pool、Timer、Tender、Health或任何業務邏輯。
- 測試位置：`scripts/package-a2-smoke-test.js` 的 sanitizer smoke。
- DATABASE_URL案例：等號、等號空白、雙引號、單引號、JSON、key周圍空白、逗號、分號、多行、大小寫、重複出現、與 Authorization／PostgreSQL URI 同時出現均自測 Pass。
- 既有遮蔽：`postgres://`、`postgresql://`、Authorization、Bearer、Cookie、Set-Cookie、Token、Secret、Password及 raw JWT均自測 Pass。
- 邊界：undefined、null、空字串、Error、字串、循環物件、多行、惡意 message getter均不拋錯；不修改原 Error message／stack／cause。
- 診斷保留：一般 `Connection timeout`、`Pool shutdown failed`、`Tender scheduler failed` 訊息仍可讀。
- 完整回歸：語法、build、health、Package A smoke、Package A.2 smoke、暫存 SQLite Core與RBAC smoke及 `git diff --check` 均 Pass。
- 原始 SQLite SHA-256：測試前後均為 `9423B460D43A168BE1D2A1D18C3FA3AB4733D807C4CF65174BB660236AD2F187`；所有寫入型測試僅使用暫存副本。
- 未驗證：Render、Supabase PostgreSQL、正式 CORS、正式帳號、uploads持久性及 Tender多 Instance；未連線 PostgreSQL、未執行真實 Tender Sync。
- Package A.2狀態：**維持 Fail，等待獨立 QA複驗**。
- 是否可重新送 QA：**可以**。
- 是否允許進入 Package B：**尚不允許，須待 QA複驗**。
- 是否允許部署：**不允許**。
- 結論：退回修正；修正 `pending_review`／company approval 組合判斷後重新執行本驗收。

## Package A-Fix-1 修補紀錄（2026-07-14）

> 本節只記錄修補與開發端隔離驗證。上方 Package A 正式 QA **Fail** 紀錄保留不變；本節不得解讀為 Package A 已重新簽核 Pass。

- 修補範圍：僅修改會員／公司 approval gate 與 `scripts/package-a-smoke-test.js` 隔離測試；未開始 Package A.2。
- 根因：`requireApproved` 使用 `isApprovedStatus(userStatus) || companyStatus === 'approved'`，公司已核准即可繞過使用者仍待審核的狀態。
- 修補後 Gate：保留既有、後端可驗證的 Founder／平台 Admin email 例外；其他會員必須先通過 user status，再通過 company status，兩者皆可用才 `next()`。
- User 拒絕代碼：pending/null/unknown 使用 `ACCOUNT_PENDING_REVIEW`；rejected 使用 `ACCOUNT_REJECTED`；suspended 使用 `ACCOUNT_SUSPENDED`。
- Company 拒絕代碼：pending/rejected/suspended/null/unknown 統一使用 `COMPANY_NOT_ACTIVE`。
- Error response：HTTP 403、結構化 `error.code/message/requestId`，並保留 legacy top-level `code`；不包含 stack、DB 狀態或敏感資訊。
- Company-role `admin`：pending user 仍回 403，不會因公司角色繞過審核。

### 狀態矩陣隔離測試

| User | Company | 預期 | 修補驗證 |
| --- | --- | --- | --- |
| approved | approved | 200 | Pass |
| pending_review | approved | 403 `ACCOUNT_PENDING_REVIEW` | Pass |
| rejected | approved | 403 `ACCOUNT_REJECTED` | Pass |
| suspended | approved | 403 `ACCOUNT_SUSPENDED` | Pass |
| approved | pending_review | 403 `COMPANY_NOT_ACTIVE` | Pass |
| approved | rejected | 403 `COMPANY_NOT_ACTIVE` | Pass |
| approved | suspended | 403 `COMPANY_NOT_ACTIVE` | Pass |
| null | approved | 403 `ACCOUNT_PENDING_REVIEW` | Pass |
| approved | null | 403 `COMPANY_NOT_ACTIVE` | Pass |
| unknown | approved | 403 `ACCOUNT_PENDING_REVIEW` | Pass |
| approved | unknown | 403 `COMPANY_NOT_ACTIVE` | Pass |

### 修補後回歸結果

- `node --check server/index.js`：Pass。
- `node --check scripts/package-a-smoke-test.js`：Pass。
- `npm.cmd run build`：Pass；保留既有 bundle size warning。
- `npm.cmd run health`：Pass。
- `npm.cmd run smoke:package-a`：Pass，包含 A-Fix-1 狀態矩陣、CMS public/admin、Ping、Health、跨公司與 company-role Admin 測試。
- 原 QA 隔離 HTTP Auth/RBAC/CMS 重測：Pass；原 `pending_review + approved` 漏洞案例由 200 修正為結構化 403。
- 暫存 SQLite core smoke：Pass。
- 暫存 SQLite RBAC smoke：Pass。
- `git diff --check`：Pass；僅有既有 LF／CRLF warning。
- 原始 `server/bookai.sqlite` SHA-256：測試前後一致；暫存 DB、WAL、SHM 均已清除。

### A-Fix-1 結論

- 修補狀態：**已完成開發端隔離驗證，可重新送 BookAI QA**。
- Package A 正式狀態：仍維持上方 **Fail**，等待獨立 QA 重驗後才能更新。
- 是否允許進入 Package A.2：仍需正式 QA 重驗 Package A 後決定。
- 是否允許部署：不允許直接部署。

## Package A-Fix-1 QA 複驗（2026-07-17，Asia/Taipei）

> 本節為獨立正式 QA 複驗追加紀錄；保留上方 Package A 原始 Fail 與 A-Fix-1 修補紀錄，不覆蓋歷史判定。

- QA 驗收角色：Codex（BookAI QA 評測與測試員）。
- QA 日期與時區：2026-07-17，Asia/Taipei。
- 測試環境：Windows PowerShell、Node.js 22.23.1、本機 development、隔離 HTTP Server、獨立暫存 SQLite 副本；未讀取真實 `.env`，未連線 PostgreSQL。
- Baseline commit：`b97b96d Improve BI cost snapshots and page structure`。
- 修補後工作樹識別：`main`；baseline `b97b96d`；10 個 tracked modifications、6 個 untracked additions、0 個刪除。
- 受測內容 SHA-256：`116c4b2dc6f5951769396f240cdccf086a30349de643270d7e3532db935aac31`。
- 原始漏洞：`pending_review` user 搭配 `approved` company 時，核心 API 曾因 OR 條件錯誤回 200。
- 修補位置：`server/index.js` 的 `requireApproved`；user 必須先通過 `isApprovedStatus(userStatus)`，company 必須再符合 `companyStatus === 'approved'`。
- 原始漏洞複驗：HTTP 403，`ACCOUNT_PENDING_REVIEW`，Pass；403 含 `error.code`、`error.message`、`error.requestId`，未含 stack 或敏感資料。
- 原隔離 HTTP Auth／RBAC／CMS 案例：31／31 Pass。
- User／Company 狀態矩陣：11／11 Pass。
- Core smoke：Pass（exit 0）；案場建立、案場用料、庫存 10→7、退料 7→8、材料費同步、2 筆庫存異動均符合預期。
- RBAC smoke：Pass（exit 0）；owner、admin、accounting、staff、viewer 規則均符合預期。
- 原始 SQLite SHA-256（前）：`9423B460D43A168BE1D2A1D18C3FA3AB4733D807C4CF65174BB660236AD2F187`。
- 原始 SQLite SHA-256（後）：`9423B460D43A168BE1D2A1D18C3FA3AB4733D807C4CF65174BB660236AD2F187`；前後一致。
- 暫存資料清理：Core、RBAC、HTTP harness 的 SQLite／WAL／SHM 殘留均為 0。
- Child Process／Port：HTTP harness 已送出 SIGTERM，測試 Port 可重新 bind；`childExited=false` 是 harness 只讀取 `exitCode`、未納入 signal termination 的等待時序紀錄，並非產品程序仍存活。因未保留 PID，未以模糊條件終止任何其他 Node／Codex 程序。
- 工作樹安全檢查：無 `.env`、SQLite DB、uploads 或刪除變更；未發現 Private Key、JWT literal 或非本機 PostgreSQL URI；`git diff --check` exit 0（僅 LF／CRLF warning）。
- Package A-Fix-1：**Pass**。
- Package A 最終結果：**Pass**（原始 Fail 紀錄保留，由本次複驗證據解除該漏洞阻斷）。
- Package A.1：**維持 Pass**。
- 是否允許進入 Package A.2：**允許**；本次未開始 Package A.2。
- 是否允許部署：**不允許直接部署**。

### 保留風險與未驗證範圍

- P0：無已知未解決 P0。
- P1：PostgreSQL staging、Render runtime、正式 CORS、Graceful Shutdown、Tender Sync lifecycle／多 Instance、`/uploads` 持久性均未驗證；部署前仍屬阻斷性 QA 工作。
- P2：缺少安全 PostgreSQL integration test；CMS 聚合 API 仍有單一區塊失敗可能影響整體回應的風險；`server/index.js` 體積大。
- P3：production bundle 約 994 KB；Git 有 LF／CRLF working-copy warning。
- 未驗證：正式帳號、正式會員／公司狀態、Supabase PostgreSQL、Render、正式 CORS 與正式 uploads；不得將本節視為部署核准。

## Package A.2 開發交付（待獨立 QA）

> 本節只記錄 A.2 開發與本機測試範圍，不將 Package A.2 標記為 QA Pass，亦不改寫 Package A／A.1／Fix-1 的歷史驗收紀錄。

- [ ] QA 驗證 SIGTERM／SIGINT 在目標 runtime 的實際行為與 exit code。
- [ ] QA 驗證 shutdown drain window 的 health 為 503／`shutting_down`。
- [ ] QA 驗證 HTTP close、timer cleanup、Pool 未建立與重複 close。
- [ ] QA 驗證 Tender disabled、failure isolation、interval validation 與 shutdown guard。
- [ ] QA 驗證 fatal error exit code 1 與 force timeout。
- [ ] QA 重跑 Package A、A-Fix-1、Core 與 RBAC smoke，並核對原始 SQLite hash。
- [ ] QA 確認無 Port、Child Process、SQLite/WAL/SHM 殘留。
- [ ] staging 驗證 Render lifecycle、Supabase Pool end 與 Tender 多 Instance；未完成前不得部署。

目前狀態：**A.2 已實作，待 QA；不允許直接部署。**

## Package A.2 正式 QA 驗收（2026-07-20，Asia/Taipei）

> 本節為獨立 QA 追加紀錄；Package A、A.1、A-Fix-1 的既有歷史與結論均保留。A.2 因下列安全 Fail 尚未通過，不得開始 Package B。

- QA 角色：Codex（BookAI QA 評測與測試員）。
- QA 日期與時區：2026-07-20，Asia/Taipei。
- 測試環境：Windows PowerShell、Node.js 22.23.1、隔離 HTTP Server、mock PostgreSQL Pool、兩份獨立暫存 SQLite；未讀取真實 `.env`、未連線 PostgreSQL、未執行真實 Tender Sync。
- Baseline：`b97b96d Improve BI cost snapshots and page structure`。
- 驗收工作樹：`main`；10 個 tracked modifications、9 個 untracked additions、0 個刪除。
- 受測內容 SHA-256：`3f26281bf060d55dcb43bf98fde4336042137c72b6b4dd403aab9a426ab5173b`（排除本 QA 紀錄檔，以避免追加紀錄改變受測指紋）。

### 驗收結果

- Runtime／HTTP：Server 啟動、ping 200、health 200、shutdown health 503、`shutting_down`、`checks.server=false`、相容欄位保留、HTTP close、既有 request drain、冪等 shutdown及 Port rebind均 Pass。
- Signal／Fatal：SIGTERM、SIGINT 以 coordinator 注入驗證 exit 0；`uncaughtException`、`unhandledRejection` 隔離 child exit 1；force timeout Pass。Windows 未宣稱完成 Render 真實 SIGTERM。
- Test IPC：僅 `NODE_ENV=test`、明確 test flag 與 IPC channel 同時成立才註冊；production-like 隔離 Server 對 IPC message、query 及 header 均未 shutdown，Pass。
- Pool：未建立 close、已建立 end 一次、重複 close、建立中 shutdown、close failure 繼續 cleanup、固定安全 log均 Pass；使用 mock，未連線 PostgreSQL。
- Timer：startup timeout／recurring interval registry、clearAll、shutdown 後拒絕新 timer均 Pass；request-scoped timers 未納入 registry。
- Tender：development／test／production 缺設定均 disabled；true 才啟用；false／空值／未知值停用；合法 interval 接受，0／負數／NaN／過短／超界回安全預設並 warning；重入、failure isolation、shutdown guard與 timer cleanup均 Pass。未執行真實 adapter。
- Manual Tender API：disabled 時由原先執行同步改為 HTTP 503／`TENDER_SYNC_DISABLED`，屬刻意但可觀察的既有 API 錯誤契約變更；前端／維運端需納入 QA，相容風險列 P2。
- Package A 回歸：`npm.cmd run smoke:package-a` Pass；pending_review＋approved company 仍為 403，狀態矩陣、跨公司隔離、CMS public/admin及 A-Fix-1 均無退化。
- Core smoke：獨立暫存 SQLite，exit 0；案場、用料、退料、材料費及庫存異動 Pass。
- RBAC smoke：另一份全新暫存 SQLite，exit 0；owner、admin、accounting、staff、viewer Pass。
- 原始 SQLite SHA-256 前／後：`9423B460D43A168BE1D2A1D18C3FA3AB4733D807C4CF65174BB660236AD2F187`／相同。
- 清理：暫存 SQLite／WAL／SHM 0、測試 Child Process 0、測試 Port均已釋放；timer由 registry assertion與 child exit確認無殘留。
- 工作樹安全：`.env`、SQLite、uploads、刪除檔案、Private Key、JWT literal、非本機 PostgreSQL URI均為 0；`git diff --check` exit 0，僅 LF／CRLF warning。

### Fail 證據

- **P1／部署阻斷：Runtime log sanitizer 未遮蔽 `DATABASE_URL=<value>` 字面格式。** 獨立測試呼叫 `safeErrorSummary(new Error('DATABASE_URL=<isolated-value>'))`，回傳 message 仍含該隔離值。證據為 `server/runtime-lifecycle.js:7-12`：目前只特別遮蔽 PostgreSQL URI及 token／secret／password／authorization／cookie key，未涵蓋 `DATABASE_URL` key。Fatal／cleanup error message 若帶入此格式，可能寫入 runtime log。
- 修補要求：將 `DATABASE_URL`（大小寫不敏感及常見空白／冒號／等號格式）納入 sanitizer，新增 regression test，並重跑 A.2 正式 QA。不得只依賴 URI regex。

### 風險與結論

- P0：無已確認 P0。
- P1：上述 sanitizer Fail；Render 真實 SIGTERM、Supabase Pool end、Tender 多 Instance 無分散式鎖、`/uploads` 持久性尚未驗證。
- P2：manual Tender disabled 的 503 契約變更；health timeout 不取消底層 PostgreSQL query；缺安全 PostgreSQL integration test；`server/index.js` 體積大。
- P3：production bundle 約 994 KB；LF／CRLF warning。
- Package A.2：**Fail**。
- 是否允許進入 Package B：**修正後允許**。
- 是否允許部署：**存在阻斷問題，不得部署**。
## Package A.2-Fix-2 工程修補紀錄（2026-07-22，Asia/Taipei）

- 根因：`safeErrorSummary()` 的未加引號 `DATABASE_URL` 分支使用 `[^,;\r\n}]+`，會將值後方以空白分隔的正常診斷文字一併匹配。
- 修補位置：`server/runtime-lifecycle.js`；僅將未加引號值邊界收緊為 `[^\s,;\r\n}]+`，quoted／JSON 分支及其他 runtime lifecycle 未修改。
- 測試補充：`scripts/package-a2-smoke-test.js` 新增空白、Tab、分號及 quoted/JSON 後方診斷文字保留案例。
- 回歸：syntax check、build、health、Package A smoke、Package A.2 smoke、暫存 SQLite core/RBAC smoke 均通過；原始 SQLite SHA-256 前後一致（`9423B460...2F187`，僅記錄指紋，不輸出資料內容）。
- 未執行：QA 複驗、PostgreSQL、Render、正式 Tender Sync、migration、部署、commit、push。
- Package A.2-Fix-2 工程結果：待 QA 複驗；不得在本紀錄自行改判 Package A.2。
## Package A.2-Fix-2 正式 QA 複驗（2026-07-22，Asia/Taipei）

- QA 角色：獨立 QA；環境：本機 Windows、隔離 sanitizer harness、暫存 SQLite。
- 版本：branch `main`；baseline `b97b96d`；工作樹維持既有 Package A/A.1/A.2 變更；本次實際程式修改檔案為 `server/runtime-lifecycle.js` 與 `scripts/package-a2-smoke-test.js`。
- Regex 語意：實際為 Regex literal，未加引號分支使用 `[^\s,;\r\n}]+`；Space、Tab、CR、LF 均為終止字元，quoted/JSON 分支優先保留引號內空白值。
- 原始失敗案例：`DATABASE_URL=<value> connection timeout` 已遮蔽敏感值並完整保留診斷文字；PostgreSQL URI 後方 `pool shutdown failed` 亦保留。
- 診斷文字矩陣：Space、Tab、逗號、分號、CRLF、右大括號、雙引號、單引號、JSON、重複 key、Authorization、PostgreSQL URI及一般訊息均 Pass；獨立 harness 11/11 Pass。
- Sanitizer 回歸：Package A.2 smoke（含原 38 案例及 Fix-2 案例）Pass；null/undefined/空字串、循環物件、惡意 getter、Error 未變更均 Pass。
- Runtime 回歸：syntax checks、build、health、Package A smoke、Package A.2 smoke、暫存 SQLite core/RBAC 均 Pass。
- 完整性：原始 SQLite SHA-256 前後均為 `9423B460...2F187`；暫存 DB/WAL/SHM、Port、Child Process、Timer residue 均為 0；未連線 PostgreSQL、未執行真實 Tender Sync。
- 未驗證：Render/SIGTERM、Supabase Pool end、正式 CORS、Tender 多 Instance、uploads 持久性。
- QA 結論：本次 Fix-2 矩陣與回歸通過，**建議重新送 Package A.2 QA**；不得在本紀錄自行改判 Package A.2 或開始 Package B。部署仍不允許。

## BookAI Package A.2 正式簽核（2026-07-22，Asia/Taipei）

- Package A.2-Fix-2：**Pass**。
- Package A.2 最終結論：**Pass**。
- Package A.1：**維持 Pass**。
- Package A-Fix-1：**維持 Pass**。
- 是否允許進入 Package B：**允許**。
- 是否允許部署：**不允許直接部署**。
- 保留未驗證項目：Render 真實 SIGTERM、Supabase Pool end、正式 CORS、Tender 多 Instance、uploads 持久性。
- 本次實際修改檔案：僅 QA 文件 `docs/PACKAGE_A_QA_CHECKLIST.md`；未修改任何程式碼。
- 既有 Package A、Package A.2、Package A.2-Fix-1 Fail 歷史均保留；本簽核不代表正式環境或外部依賴已驗證。
