# BookAI Package A Pre-QA 唯讀風險報告

檢查日期：2026-07-13  
範圍：目前未提交的 Package A 變更及其呼叫鏈。  
限制：未部署、未連線 PostgreSQL、未執行 migration、未讀取或修改 `.env`，未輸出任何環境變數實際值。本文件是本次唯一新增內容。

## 1. Production 環境變數阻斷表

目前 `server/env.js` 將五項變數列為 production requirements。任一缺少時，`requiredReady=false`；`/api/health` 回 503，且除 `/api/ping`、`/api/health` 外的所有 `/api` 路由均被 configuration gate 回 503。證據：`server/env.js:3-8`、`server/index.js:204-225`、`server/index.js:1343-1394`。

| 環境變數 | 實際使用功能 | Production blocking | 缺少時目前行為 | 建議分類 | 可能造成整套 API 誤回 503 |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | 啟用 production DB、安全回應、env gate 與快取規則 | 間接；未列入 requirements | 缺少時預設 development，production 保護不啟用 | 永久必要 | 否；但會造成更嚴重的環境誤判 |
| `PORT` | Render/Node listen port | 否 | 使用 5050 fallback | 永久必要（由 Render 注入） | 否 |
| `DATABASE_URL` | PostgreSQL Pool、全部正式資料、health DB query | 是 | 不建立 SQLite；health 503；其他 API 503 | 永久必要 | 是，屬正確阻斷 |
| `JWT_SECRET` | JWT 簽發及 Bearer token 驗證 | 是 | health 503；其他 API 503；production 不會實際使用開發 fallback | 永久必要 | 是，屬正確阻斷 |
| `BOOTSTRAP_SECRET` | Admin/Founder bootstrap；亦可作為 debug route 的替代授權 | 是 | health 503；所有一般 API 503 | 僅 bootstrap 必要 | **是，可能誤阻斷** |
| `BOOKAI_BOOTSTRAP_SECRET` | `BOOTSTRAP_SECRET` 的既有 alias | 是（任一 alias 存在即可） | 同上 | 僅 bootstrap 必要 | **是，可能誤阻斷** |
| `ADMIN_PASSWORD` | Bootstrap 時建立或重設 Admin/Founder 密碼 hash | 是 | health 503；所有一般 API 503；bootstrap 自身亦拒絕 | 僅 bootstrap 必要 | **是，可能誤阻斷** |
| `CORS_ORIGIN` | 瀏覽器跨網域 allowlist | 是 | health 503；一般 API 503；CORS 本身在空清單時採套件寬鬆預設 | 永久必要 | 是；安全意圖合理，但與同源部署策略需確認 |
| `CLIENT_URL` | 無任何程式呼叫位置 | 否 | 完全無行為變化 | 選填／未實作 | 否 |
| `FOUNDER_EMAIL` | Founder identity、Founder-only API、bootstrap、debug JWT | 否，只 warning | fallback 到既有 Admin identity | 永久必要（建議提升） | 否 |
| `ADMIN_EMAIL` | Admin allowlist、Admin-only API、bootstrap identity | 否，只 warning | 使用既有程式 fallback | 永久必要（建議提升） | 否 |
| `BOOKAI_DB_PROVIDER` | Development 顯式 DB provider；production 會被強制 PostgreSQL | 否 | Production 無影響；development 依 `DATABASE_URL`/SQLite 規則 | 僅 development 使用 | 否 |
| `DB_PATH` | SQLite 路徑、備份與本機 smoke | 否 | 使用 `server/bookai.sqlite` fallback | 僅 development 使用 | 否 |
| `RENDER` | Founder DB health 顯示 runtime 類型 | 否 | 顯示 local 診斷 | 選填 | 否 |
| `TENDER_OFFICIAL_SOURCE_URL` | 官方標案來源 adapter | 否 | 跳過該來源，仍使用 fallback snapshot | 選填 | 否 |
| `TENDER_GOV_PROCUREMENT_URL` | 政府採購來源 adapter | 否 | 跳過該來源，仍使用 fallback snapshot | 選填 | 否 |
| `TENDER_LOCAL_SOURCE_URL` | 地方政府來源 adapter | 否 | 跳過該來源，仍使用 fallback snapshot | 選填 | 否 |
| `TENDER_SYNC_INTERVAL_MS` | Tender 背景同步 interval | 否 | 使用每日預設值 | 選填 | 否；但非法值可能形成極短 interval |
| `AI_PROVIDER` | AI 草稿 provider 選擇 | 否 | 使用 mock provider | 選填 | 否 |
| `OLLAMA_MODEL` | Ollama model 名稱 | 否 | 使用既有預設 model | 選填 | 否 |
| `BOOKAI_OFFICIAL_COMPANY_ID`、`BOOKAI_OFFICIAL_OWNER_EMAIL` | 手動 official-site seed script | 否 | script 使用既有尋址 fallback | 選填（手動 seed 專用） | 否 |
| `DEMO_COMPANY_ID`、`DEMO_FOUNDER_EMAIL` | 手動 demo seed script | 否 | script 使用既有尋址 fallback | 僅 development 使用 | 否 |

### 環境變數判斷

- `DATABASE_URL`、`JWT_SECRET`、`NODE_ENV` 應永久必要。
- `CORS_ORIGIN` 應維持明確 production allowlist；是否 blocking 應配合實際同源／跨源部署策略決定。
- `BOOTSTRAP_SECRET`/alias 與 `ADMIN_PASSWORD` 的實際用途是 bootstrap，但目前被當成永久 runtime requirement，是 availability 誤阻斷風險。
- `FOUNDER_EMAIL`、`ADMIN_EMAIL` 是權限 identity，production 只 warning 且可 fallback；應由 QA/Boss 確認是否提升為永久必要。
- `CLIENT_URL` 目前未實作，設定與否皆無效果。

## 2. Middleware 順序

實際順序：requestId → security headers → CORS → JSON parser → `/uploads` static → early JSON/CORS error handler → `/api/ping` → production configuration gate → 全部 API routes（包含 health）→ API 404 → frontend static → SPA fallback → final error middleware。證據：`server/index.js:158-225`、`server/index.js:1343`、`server/index.js:11677-11715`。

| 檢查 | 結果 | 判斷 |
| --- | --- | --- |
| CORS 是否在 configuration gate 前 | 是，`server/index.js:173-183` 在 gate `:213-225` 前 | 正常 |
| OPTIONS 預檢 | 標準 CORS preflight 由 `cors` middleware 先回應，通常不進 gate；無 Origin／非標準 OPTIONS 在設定缺失時可能被 503 | P2 診斷一致性風險；標準瀏覽器 preflight 不受阻 |
| `/api/ping` | Route 本身只回 process uptime/timestamp，不查 DB，且在 gate 前 | 正常；但 JSON parser/CORS 仍先執行 |
| `/api/health` | Gate 對 `req.path === '/health'` 明確放行；可在設定錯誤時回 503 診斷 | 正常 |
| Configuration gate 範圍 | 除 health 外阻擋所有 `/api`，包含公開 CMS、login、register、plans 與已完成 bootstrap 後的正常 API | 範圍過大，主要原因是 bootstrap-only 變數被列為永久 requirements |
| API 404 | 位於全部 API routes 後，`server/index.js:11677-11686` | 正常 |
| Final error middleware | 位於 API 404、frontend static、SPA fallback 後，且是最後註冊的 middleware | 正常 |
| `/uploads` | 在 API gate/404 前、路徑不屬於 `/api` | 不會被 API 404 攔截 |
| SPA fallback | 在 API 404 後且 regex 排除 `/api` | 不會吞掉 API 404；uploads 已在更前方處理 |

## 3. Request ID 與 Log 安全

| 檢查 | 結果 |
| --- | --- |
| Server 產生 requestId | 使用 `crypto.randomUUID()`，`server/index.js:158-162` |
| 外部 request ID 限制 | 僅接受 8–128 字元，限英數、`.`、`_`、`-`；不符即重建 |
| Authorization/Cookie log | 未發現將 Authorization 或 Cookie header 寫入 log；JWT middleware只讀取 Authorization |
| 密碼／Token／DATABASE_URL log | Package A 新 log 未輸出實際值；env log 只顯示 present/missing |
| Production global error response | 不含 stack/debug；debug 僅 development，`server/index.js:11694-11714` |
| 既有直接 response | `/api/bootstrap/admin` 的 catch 仍在 response 放入原始 `err.message`，`server/index.js:1486-1490`；未經 final error sanitizer |
| 既有 server log | 多處直接記錄 `err.message`，部分記錄 `err.stack`，例如 `server/index.js:2552-2558`、`:3758-3765`、`:4222-4229` |
| PostgreSQL startup log | `recordPostgresError` 保存原始 message，startup failure 直接輸出，`server/index.js:121-147` |
| PostgreSQL network probe log | socket error message 未 sanitize 即記錄，`server/index.js:503-566` |
| Pool background error | 只記 code 與固定摘要，不輸出 connection string，`server/pg-db.js:27-33` |

判斷：沒有發現直接 log Authorization/Cookie 或提交 Secret；但原始 PostgreSQL/route error message 與 stack 尚未集中 sanitize。PG library 通常不回顯完整 connection string，但目前程式沒有保證或過濾，仍有連線細節洩漏可能。

## 4. Render Process Lifecycle

| 項目 | 現況 | 風險 |
| --- | --- | --- |
| SIGTERM | 無 handler | 無 graceful shutdown |
| SIGINT | 無 handler | 無 graceful shutdown |
| 停止接受新連線 | `app.listen` 回傳值未保存，沒有 `server.close()` | Render termination 時無法先 drain requests |
| PostgreSQL Pool end | Runtime 沒有 `pool.end()` | 關閉時不會等待／結束 DB connections |
| `unhandledRejection` | 無 handler | 未捕捉 async rejection 可能導致 process exit 或無診斷終止 |
| `uncaughtException` | 無 handler | 未捕捉 exception 會直接終止 process |
| 重複 listen | Runtime 只有 `server/index.js:11796` 一個正式 listen | 正常；smoke test 的 ephemeral listener 不是正式 server |
| 背景 timer | 30 秒 startup timer 與永久 interval 未保存 handle、未 clear/unref | 阻止自然 event-loop 結束；無法 graceful cleanup |

## 5. PostgreSQL Pool

| 檢查 | 結果 |
| --- | --- |
| 共用 Pool | Runtime 只在 `server/pg-db.js:18` 建立一個 Pool；migration/health scripts 的 Pool 是獨立程序 |
| Lazy singleton | `pool` 初始為 null，`getPool()` 首次呼叫才建立 |
| max | 10；對單一 Render instance 合理，但仍需依 Supabase connection limit 核對 |
| connection timeout | 5 秒，合理 |
| idle timeout | 30 秒，合理 |
| background error | 有安全 handler，不會因 idle client error 直接成為未監聽 EventEmitter error |
| Client release | 找到 8 個 `pool.connect()` 與對應 8 個 `finally client.release()`；未發現明顯漏 release |
| Request 建 Pool | Request 可能呼叫 `getPool()`，但只取得 singleton，不會每 request 建立新 Pool |
| Health timeout | `Promise.race` 只停止等待，不取消底層 `pgOne`；超時查詢仍可能占用 Pool。反覆 health check 可累積查詢並耗盡 max=10 |
| SSL | 預設 `{ rejectUnauthorized: false }`，相容 Supabase/Render 常見連線；但停用憑證驗證屬安全折衷，應由 staging 驗證連線政策 |
| Pool end | 無 runtime shutdown 呼叫 |

## 6. Tender Sync 與背景工作

| 工作 | 啟動時間 | Listen 前執行 | 阻塞啟動 | 失敗造成 exit | DB 寫入 | Staging 建議 | 控制變數 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL startup init | listen callback 立即呼叫 | 否 | 不阻塞 listen；health 在 ready 前為 503 | catch 後保留 process | 會執行既有 schema 初始化 | 使用隔離 DB 驗證 | 無獨立開關 |
| Tender startup daily check | listen 後 30 秒 | 否 | 否 | Promise catch，不 exit | 可能新增/更新 tenders、matches、keywords、sync runs | **建議關閉，除非 staging 明確測試此功能** | 無 enable/disable 開關 |
| Tender interval | listen 後註冊；預設每日 | 否 | 否 | Promise catch，不 exit | 同上 | 建議關閉或使用獨立 staging 資料 | 只有 interval，沒有 enable/disable |
| Tender source fetch | 每來源最多約 12 秒 timeout，依序執行 | 否 | 不阻塞 server | 單一來源錯誤記為 partial | 後續仍會寫 fallback/其他來源資料 | staging 應避免誤抓正式來源 | 三個 source URL |
| AI provider timeout | AI request 期間 | 不適用 | 只阻塞該 request | finally clear timer | AI route本身聲明不直接寫業務資料；audit 仍可能寫 | 可使用 mock | `AI_PROVIDER`、`OLLAMA_MODEL` |

Tender sync 有 `tenderSyncRunning` 防止同 process 重疊，且 client 會在 finally release。主要問題：

- 即使三個外部來源皆未設定，fallback snapshot 仍會參與同步並寫 DB，證據 `server/index.js:5625-5630`、`:5650-5771`。
- `TENDER_SYNC_INTERVAL_MS` 直接經 `Number()` 傳入 `setInterval`，沒有 finite/minimum 驗證；非法、負值或極小值可能形成高頻 DB 工作，證據 `server/index.js:11812-11821`。
- 沒有 staging/production enable flag，也沒有 shutdown 時 clear interval。

## 7. CMS 與 uploads

| 檢查 | 結果 |
| --- | --- |
| uploads 實際路徑 | `server/uploads/website-assets`，`server/index.js:23-31` |
| Render persistence | 未見 Persistent Disk mount 設定；一般 Render instance filesystem 屬 ephemeral，部署／instance replacement 可能遺失 |
| DB path 儲存 | 本機 upload 回傳 `/uploads/website-assets/<filename>` 相對 URL；但 asset/settings/banner 等 API 接受任意 URL 字串，因此 DB 不保證「只」存相對路徑 |
| 圖片 fallback | `PublicImage`/`PublicLogo` 對空 URL 與 load error 顯示 placeholder，`client/src/pages/PublicSitePage.jsx:86-115` |
| 公開 CMS JWT | `/api/public/sites/:slug`、products/posts/faqs/inquiries 均未掛 auth middleware，`server/index.js:3491-3617` |
| CMS 管理權限 | settings/assets/resources/inquiries 維持 `auth + cmsCompany`，寫入再加角色限制，`server/index.js:3285-3489` |
| slug 不存在 | 公開 site/product/post/FAQ routes 明確回 404 |
| 空資料 | API 空 rows 會 map 為空陣列；前端有 EmptyState |
| 單一區塊錯誤 | 主站 API 以 `Promise.all` 同時讀 banners/sections/faqs，任一 query 失敗會讓整個 site API 回 500；Preview 也以單一 `Promise.all` 讀六個資源，任一失敗會顯示整頁 unavailable |

## 8. Git Diff 風險

### `git status --short`

```text
 M client/src/lib/api.js
 M client/src/lib/publicSiteApi.js
 M package.json
 M scripts/health-check.js
 M scripts/rbac-smoke-test.js
 M scripts/smoke-clean.js
 M scripts/smoke-test.js
 M server/db.js
 M server/index.js
 M server/pg-db.js
?? docs/PACKAGE_A_QA_CHECKLIST.md
?? docs/PRODUCTION_DEPLOY_CHECKLIST.md
?? docs/PRODUCTION_STABILITY_AUDIT.md
?? scripts/package-a-smoke-test.js
?? server/env.js
```

### `git diff --stat`

```text
client/src/lib/api.js           |   7 +-
client/src/lib/publicSiteApi.js |   4 +-
package.json                    |   1 +
scripts/health-check.js         |   8 +-
scripts/rbac-smoke-test.js      |   4 +-
scripts/smoke-clean.js          |   4 +-
scripts/smoke-test.js           |   4 +-
server/db.js                    |  16 ++--
server/index.js                 | 179 ++++++++++++++++++++++++++++++----------
server/pg-db.js                 |  13 ++-
10 files changed, 180 insertions(+), 60 deletions(-)
```

注意：`git diff --stat` 不包含未追蹤的新文件、`server/env.js` 與 Package A smoke script。

| 分類 | 檔案／判斷 |
| --- | --- |
| Runtime server | `server/index.js`、`server/db.js`、`server/pg-db.js`、新增 `server/env.js` |
| Frontend compatibility | `client/src/lib/api.js`、`client/src/lib/publicSiteApi.js` |
| Test tooling | 四個既有 scripts、`package.json`、新增 `scripts/package-a-smoke-test.js` |
| Documentation | 三份既有 Package A 新文件及本報告 |
| `.env` | 0 個變更 |
| SQLite DB | 0 個變更 |
| uploads | 0 個變更 |
| Secret material | 啟發式掃描新增內容：private key/JWT-like token/Database URI/Bearer literal 均 0；未發現實際密鑰 |
| 無關格式化 | Diff hunk 集中於指定功能；未見大規模無關格式化。Git 有 LF→CRLF working-copy warning |
| 意外刪除 | 0 個 deleted files |
| Diff consistency | `git diff --check` exit 0 |

## 9. 最終風險報告

### P0 阻斷

目前唯讀程式碼與 diff 未確認必然發生的 P0。由於未讀取正式環境變數、未連正式 PostgreSQL，不能宣稱正式環境已具備所有永久必要設定。

### P1 高風險

#### P1-1：Bootstrap-only 變數會阻斷整套 production API

- **問題：** `BOOTSTRAP_SECRET` 與 `ADMIN_PASSWORD` 被列為永久 requirements，但實際僅供 bootstrap/debug；缺少任一項會讓公開 CMS、登入、一般 ERP 全部 503。
- **證據：** `server/env.js:3-8`；`server/index.js:213-225`；`server/index.js:1459-1526`。
- **可能影響：** 帳號已初始化後若按安全慣例移除 bootstrap credential，正式服務會全面不可用。
- **QA 驗證方式：** Production-like mock 分別缺少兩項變數，驗證 ping/health 與 login/public CMS；不得使用正式環境。
- **Package A.1：** **建議納入**；拆分 runtime requirements 與 bootstrap requirements，並決定 bootstrap route 停用策略。

#### P1-2：沒有 Render graceful shutdown

- **問題：** 無 SIGTERM/SIGINT、server.close、Pool end 或 timer cleanup。
- **證據：** `server/index.js:11796-11822`；`server/pg-db.js:5-36`；runtime 搜尋無 lifecycle handler。
- **可能影響：** Render deploy/restart 時中斷進行中的 request/transaction，Pool 不 drain，背景同步無法有序停止。
- **QA 驗證方式：** Staging 啟動長 request/DB transaction 後送 SIGTERM，觀察是否立即中斷及 log；不得在 production 執行。
- **Package A.1：** **建議納入**。

#### P1-3：Tender 背景同步預設啟用且會寫 DB

- **問題：** listen 後 30 秒自動檢查，之後永久 interval；無 staging disable flag，外部來源皆空時仍同步 fallback snapshot。
- **證據：** `server/index.js:5596-5819`；`server/index.js:11802-11821`。
- **可能影響：** Staging/production 啟動後未經人工操作即新增或更新 tender 相關資料；與部署只讀驗證衝突。
- **QA 驗證方式：** 隔離 DB 啟動 35 秒，檢查 tender sync run 與寫入；確認 staging 是否應停用。
- **Package A.1：** **建議納入**；加入明確 enable flag、interval 驗證與 shutdown cleanup。

#### P1-4：Health timeout 不會取消 PostgreSQL query

- **問題：** 5 秒 `Promise.race` 只結束 HTTP 等待，底層查詢仍繼續。
- **證據：** `server/index.js:1331-1341`、`:1363-1369`；`server/pg-db.js:38-41`。
- **可能影響：** DB 卡住時頻繁 health probes 可累積查詢並占滿 max=10 Pool，進一步拖垮正常 API。
- **QA 驗證方式：** 隔離 PostgreSQL 注入慢查詢／網路 blackhole，連續呼叫 health 並觀察 pool waiting/active count。
- **Package A.1：** **建議納入**；評估 query timeout/statement timeout 或可取消 query。

#### P1-5：原始 DB error/stack 尚未完整安全化

- **問題：** startup、CMS、admin、feedback 等既有 log 直接輸出 `err.message`/`err.stack`；bootstrap admin error response 直接回原始 message。
- **證據：** `server/index.js:121-147`、`:503-566`、`:1486-1490`、`:2552-2574`、`:5003-5012`。
- **可能影響：** Log 或高權限 API response 可能暴露 host、schema、SQL/driver 細節；無法保證 connection string 永不出現。
- **QA 驗證方式：** 隔離 DB 製造 DNS、認證、schema 錯誤，檢查 response/runtime log；只記錄是否洩漏，不保存敏感內容。
- **Package A.1：** **建議納入**；建立共用 safe error summary。

#### P1-6：Render uploads 位於 ephemeral filesystem

- **問題：** 圖片寫到 `server/uploads/website-assets`，未見 Persistent Disk mount。
- **證據：** `server/index.js:23-31`、`:242-255`、`:3428-3432`。
- **可能影響：** 部署、instance replacement 或 restart 後檔案消失，DB 仍保留失效相對 URL。
- **QA 驗證方式：** Staging 上傳後做經核准的 instance replacement/redeploy，再抽查 URL；先備份測試檔。
- **Package A.1：** 建議先列為部署阻擋條件；儲存遷移可另案，不應在小修中倉促替換。

#### P1-7：PostgreSQL schema initialization 在 listen 後非同步執行

- **問題：** `checkPostgresStartup()` 在 listen callback 呼叫且不 await；health 會等 `postgresReady`，但一般 API 沒有 DB-ready gate。
- **證據：** `server/index.js:130-148`、`:1363-1369`、`:11796-11801`；`server/pg-db.js:49` 起的 schema initialization。
- **可能影響：** 冷啟動或初始化失敗期間，API 已接受流量並可能出現不一致 DB error；schema 操作也未經本次 staging 驗證。
- **QA 驗證方式：** 隔離 PostgreSQL 延遲／拒絕 schema 權限，啟動後同時呼叫 health 與核心 API。
- **Package A.1：** **建議納入**；至少建立清楚的 readiness gate，schema migration 策略需另行 review。

### P2 中風險

#### P2-1：CMS 單一區塊錯誤會讓整頁 unavailable

- **問題：** 公開站與 Preview 均使用整組 `Promise.all`；任何 resource 失敗即整頁 error。
- **證據：** `server/index.js:3497-3507`；`client/src/pages/PublicSitePage.jsx:64-72`、`:503-511`、`:548`。
- **可能影響：** FAQ/Banner 等單一資料表或 API 暫時失敗時，完整品牌官網白屏替代為 unavailable 頁。
- **QA 驗證方式：** Stub 單一 resource 500，其餘正常，確認頁面降級行為。
- **Package A.1：** 建議納入；可用 `Promise.allSettled` 或分區錯誤邊界，但需保持權限。

#### P2-2：SSL 停用憑證驗證

- **問題：** PostgreSQL SSL 預設 `rejectUnauthorized:false`。
- **證據：** `server/pg-db.js:18-25`。
- **可能影響：** 相容 Supabase 常見連線，但弱化 TLS server identity 驗證。
- **QA 驗證方式：** 以隔離 Supabase/staging 驗證可否使用完整 CA/正式 SSL policy。
- **Package A.1：** 建議評估，不宜未驗證即切換。

#### P2-3：Founder/Admin identity 缺少時只 warning

- **問題：** 兩者使用程式 fallback，可能讓 Founder/Admin identity 與部署預期不符。
- **證據：** `server/env.js:11-13`；`server/index.js:40-49`、`:108-110`。
- **可能影響：** 權限錯配或意外共用 identity。
- **QA 驗證方式：** Production-like mock 分別缺少 identity 變數，驗證 requireFounder/requireAdmin 判斷。
- **Package A.1：** 建議與 Boss 確認後決定是否提升為永久必要。

#### P2-4：無 unhandledRejection/uncaughtException 診斷策略

- **問題：** 未註冊 process-level handler；Express 4 async route 若漏 catch，可能終止程序且缺少一致 requestId 診斷。
- **證據：** Runtime 搜尋無相關 handler；server 使用 Express 4，`server/package.json:18`。
- **可能影響：** 特定 rejected Promise 造成 crash/restart loop。
- **QA 驗證方式：** 僅在 staging 受控觸發 async rejection，確認 process/log 行為。
- **Package A.1：** 建議納入 lifecycle 設計；不可用 handler 吞掉 fatal error 後繼續服務。

#### P2-5：API error 格式仍非全面一致

- **問題：** 新 final handler/jsonError 為結構化格式，但大量 route-level catch 仍直接回 `{ error: string, code }`。
- **證據：** `server/index.js:2559`、`:2574`、`:5003-5012`，對比 `:11694-11714`。
- **可能影響：** Client/QA 需相容兩種格式，requestId 不一定出現在既有 500 body。
- **QA 驗證方式：** 抽查 admin、CMS、ERP DB error response 與 client 顯示。
- **Package A.1：** 建議漸進處理，避免一次大改所有業務 routes。

### P3 低風險

#### P3-1：標準 CORS preflight 與 configuration gate 的狀態不一致

- **問題：** 標準 OPTIONS 可能先由 CORS 回 204，即使後續實際 API 因 configuration gate 回 503。
- **證據：** `server/index.js:173-183`、`:213-225`。
- **可能影響：** 監控只測 OPTIONS 時產生假陽性；不代表 API ready。
- **QA 驗證方式：** 同時測 OPTIONS 與實際 GET/POST。
- **Package A.1：** 可納入監控文件，不一定需改程式。

#### P3-2：LF/CRLF working-copy warning

- **問題：** Git 顯示未來 LF 可能轉 CRLF。
- **證據：** `git diff --check` 執行輸出；實際 exit 0。
- **可能影響：** 後續提交可能出現行尾噪音。
- **QA 驗證方式：** Commit 前再次檢查 diff stat/hunks。
- **Package A.1：** 不必；提交前控制即可。

## 結論

**可送 QA，但有建議修補項**

送 QA 前需明確告知：不得將目前 QA 通過等同正式可部署；P1-1、P1-2、P1-3、P1-4、P1-5 應優先納入 Package A.1 評估，uploads persistence 必須成為部署決策條件。

## Package A.1 修補後附錄（2026-07-13）

本附錄記錄 Package A.1 後的現況；與前述唯讀盤點衝突時，以本附錄及目前程式碼為準。未讀取或修改 `.env`，未連線 PostgreSQL，未部署、commit 或 push。

### Environment Classification

| 分類 | 變數 | 修補後行為 |
| --- | --- | --- |
| Runtime required | `DATABASE_URL`、`JWT_SECRET` | production 缺少時 ping 200、health 503、一般 API 503；不 fallback SQLite |
| Bootstrap only | `BOOTSTRAP_SECRET`、deprecated alias `BOOKAI_BOOTSTRAP_SECRET`、`ADMIN_PASSWORD` | 缺少不影響 runtime；bootstrap route 404；bootstrap availability 只作 capability 回報 |
| Privileged identity | `FOUNDER_EMAIL`、`ADMIN_EMAIL` | production 無 fallback；缺少不阻擋一般 API，只讓相依高權限 route 503；health degraded（DB 健康時） |
| CORS/security | `CORS_ORIGIN` | 非全域 runtime gate；同源可用、非 allowlist 跨來源拒絕；缺少時 health degraded（DB 健康時） |
| Optional/unused | `CLIENT_URL` | 無呼叫位置，不控制 CORS 或 redirect |

`NODE_ENV` 限定三個合法值。非法值 configuration unhealthy 且不得落入 SQLite；缺少值仍為本機 development 相容行為，因此正式部署必須以人工 Gate 確認 `NODE_ENV=production`。

### 已修補風險

- 原 P1-1：已拆分 runtime 與 bootstrap requirements；bootstrap credential 缺少不再癱瘓 API。
- 原 P2-3：production 不再使用 Founder/Admin email fallback；缺少 identity 時只拒絕相依高權限 route。
- 原 P3-1：CORS 在 configuration gate 前處理核准 preflight；自動測試涵蓋 204 與後續 API 狀態。
- Debug 授權：production route 固定 404；bootstrap secret 不再是替代授權。development 僅允許有效 Founder JWT。
- Bootstrap error：停用時 404、錯誤 secret 統一 403，且不記錄輸入 secret；既有 rate limit 保留。

證據：`server/env.js`、`server/index.js`、`server/db.js`、`server/pg-db.js`、`scripts/package-a-smoke-test.js`。行號應以最終 QA commit 為準，避免未提交 diff 變動造成錯誤定位。

### 仍存在的風險

- P1：缺少 graceful shutdown、Pool end 與背景 timer cleanup；建議納入後續 lifecycle package。
- P1：Tender sync 無 staging disable gate，且會寫入 DB；staging 驗證前需明確控制。
- P1：health timeout 使用 HTTP 層 race，底層查詢未取消。
- P1：既有非本次範圍 log 仍可能輸出過多 driver error 摘要，需另案安全化。
- P1：uploads 位於 Render instance filesystem；若未掛 Persistent Disk，重啟／替換可能遺失。
- P1：PostgreSQL schema initialization 仍在啟動後執行，需 DBA／staging 審查。
- P2：CMS 聚合 API 的單一資料來源失敗仍可能使整個聚合 response 失敗。

### Bootstrap Runbook

1. 僅於受控維運期間設定 bootstrap secret/password，並確認備份、授權及目標 identity。
2. 完成後立即移除 bootstrap secret/password。
3. 移除後驗證一般 API、登入、CMS、ERP 正常，health runtime 不受影響。
4. 確認 bootstrap routes 404，且 bootstrap secret 無法存取 Debug API。

### 修補後結論

**可送 QA，但有建議修補項。** Package A.1 已解除本次環境分類與高權限入口的主要誤阻斷；上述 lifecycle、背景工作、uploads、schema initialization 等風險仍須由 QA/Boss 納入部署決策，不得直接部署。

## Package A.2 風險狀態更新（待 QA）

- 已實作、待驗證：graceful shutdown、SIGTERM/SIGINT、fatal handler、HTTP close、timer registry、lazy-safe Pool close、shutdown health 與 force timeout。
- 已實作、待驗證：`TENDER_SYNC_ENABLED` 安全 gate、interval validation、單程序重入保護、錯誤隔離及 shutdown guard。
- P1 保留：Render 與 Supabase staging 尚未驗證；Tender Sync 在多 Instance 間沒有分散式鎖；uploads 仍位於 instance filesystem。
- P1 保留：health timeout 的底層 PostgreSQL query 不會因 HTTP race 自動取消。
- P2 保留：CMS 聚合 API 單一資料來源失敗風險、`server/index.js` 體積與 PostgreSQL integration test 缺口。
- 本次結論須由 A.2 完整測試決定；文件更新本身不構成 QA Pass 或部署核准。
