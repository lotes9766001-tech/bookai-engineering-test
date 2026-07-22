# BookAI RC-3 Staging 執行摘要

最後驗證：2026-07-22（Asia/Taipei）

## 結論

目前 Gate 為 `WAITING_FOR_EXTERNAL_AUTH`，Resume Point 為 `GATE_STAGING_POSTGRES_DISCOVERY`。本地回歸與靜態 PostgreSQL migration/schema 基礎通過，但 RC Staging 尚未驗收，亦未宣告可進 Production。

## 已通過

- 分支與 remote tracking：`release/bookai-rc1-staging`，HEAD 與本機的 `origin/release/bookai-rc1-staging` tracking ref 均為 `a67277c`。
- Node `v22.23.1`：build、health、Package A、Package A.2、Package B-Core、core smoke、RBAC smoke 全部 exit 0。
- Migration plan：依序找到 `001` 至 `007`，每筆均有 checksum。
- 49-table static schema contract：無 missing、evidence missing、unresolved 或 duplicate index；結果為 `static_contract_only`。
- 未操作 main、Production service、Production PostgreSQL、Production migration 或 Production secret。
- 未執行 force push、reset、clean、merge、DROP、TRUNCATE 或廣域 `git add`。

## 阻擋項目

- P0：沒有隔離的 PostgreSQL Staging、Render Staging 與 staging-only 授權設定。
- 執行環境缺少 `STAGING_ISOLATED`、`DATABASE_URL`、JWT/bootstrap secrets、`APP_URL` 與 CORS origins。
- 沒有 Render service/API 授權，也沒有 Render CLI；因此無法安全 deploy、restart/redeploy 或提供 Boss URL。
- Live migration status、001–007 execution、rerun/checksum drift、rollback、catalog parity、DB/schema health、backup/restore 均尚未執行。
- Persistent CMS storage、完整跨 tenant/RBAC matrix、CI required checks、monitoring exercise 與 Staging E2E QA 尚未驗收。

## Pre-Cloud SQLite 完整性

- Vite build 通過，但主 JavaScript chunk 約 994 kB，列為 P1 優化項目。
- 本包起始 SHA-256 為 `9F5500A847AC3776B666B835B10594ACAADFFE7EF544EFACA2E8ABA62B327C84`，大小 696320 bytes。
- 起始 Hash 與舊報告不同，列為既有資料完整性事件；未自行還原、覆寫或刪除資料庫。
- 起始時 WAL／SHM 已存在；本包不清除、不 checkpoint，也不納入 Git。
- 根因為 core 與 RBAC smoke 在未設定 `DB_PATH` 時 fallback 到原始 SQLite，且測試包含寫入交易。
- 修正後兩者各使用唯一暫存副本；指向原始 DB 時 fail closed，退出時清除暫存 SQLite／WAL／SHM。
- Package A／A.2 使用各自暫存 DB；B-Core 僅執行靜態 migration plan，不連線 PostgreSQL。

## Boss 需要提供的最小條件

1. 新建且確認非 Production 的 PostgreSQL Staging（SSL、可刪除、空資料庫）。
2. 新建 Render Staging service，固定使用 `release/bookai-rc1-staging`。
3. 透過安全管道配置 staging-only 變數；不要貼到 Git、文件或聊天。
4. 保持 `STAGING_ISOLATED=true`、`TENDER_SYNC_ENABLED=false`、`AI_ENABLED=false`，並關閉 email、LINE、payment 等外部副作用。
5. 提供可執行 Staging migration/deploy/health probe 的授權；不得提供 Production credential。

條件滿足後，從 staging preflight 開始，依序執行 migration plan/status、001–007、status、live schema/catalog drift、DB health、備份還原、Render deploy/restart/redeploy 與完整驗收。不得合併或推送 main，也不得執行任何 Production 操作。
