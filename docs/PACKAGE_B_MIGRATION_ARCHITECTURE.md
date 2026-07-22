# Package B-Core-1 Migration Architecture

本包建立 PostgreSQL migration runner、版本表與靜態 schema contract。Migration 採 forward-only、版本排序、SHA-256 checksum、成功版本不重跑；checksum 或版本歷史不一致時停止。Migration 預設使用 transaction，失敗必須 rollback 並停止。

Runtime server 不執行 migration。PostgreSQL health 只在 `bookai_schema_migrations` 存在且最新版本為 `001_schema_contract` 時通過；實際 staging migration 尚未執行。

B-Core-2 將 canonical migration 拆為 `001_core_identity`、`002_engineering_inventory`、`003_commerce_erp`、`004_cms`、`005_accounting`、`006_tender_audit`、`007_schema_parity`；required schema version 更新為 `007_schema_parity`。49 張表均標記 ACTIVE，7 張缺表依 route/UI/query 證據納入 ACTIVE，沒有表被標成 LEGACY_EXCLUDED。

Production CLI 需額外 `--confirm-production-migration` gate；不得在 API 啟動流程呼叫 runner。Seed 與 schema migration 分離。Migration log 僅輸出安全 code，不輸出 connection string、SQL credential 或完整 driver error。
