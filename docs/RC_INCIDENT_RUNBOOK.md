# BookAI RC Incident Runbook

本文件只描述本機與隔離 Staging 的診斷流程，不包含任何 Secret、Credential 或正式連線資訊。

## Database unavailable

1. 查看 `/api/ping` 確認程序仍存活。
2. 查看 `/api/health` 的 `databaseConnectivity` 與 `runtimeReady`。
3. 檢查安全錯誤代碼與 requestId。
4. 不重跑 Migration，不修改正式資料；交由授權人員確認 Staging 連線設定。

## Schema mismatch

1. 確認 `schemaReady=false` 與安全 reason。
2. 使用只讀 status／plan 檢查 migration history。
3. 不由 Runtime 自動修補 Schema。
4. 先備份隔離 Staging，再由授權流程處理 Migration。

## Login outage

1. 確認 health 的 runtime/authentication 狀態。
2. 使用 requestId 追蹤，不記錄密碼、JWT 或 Cookie。
3. 以隔離測試帳號重現，禁止使用正式帳號。

## CMS image unavailable

1. 確認公開 API 回應與前端 fallback。
2. 確認 object key／相對路徑，不輸出儲存服務 Credential。
3. Render ephemeral disk 的持久性必須以 Staging 重啟實測確認。

## External AI or Tender failure

1. 確認 feature flag 預設為 disabled。
2. 使用 Mock provider 重現 timeout／failure。
3. 確認核心 API 不因背景工作失敗而停止。

## Render rollback

1. 先停止自動部署並保存健康檢查證據。
2. 使用 Render 提供的上一個已驗證版本回滾。
3. 不修改 Production Service，不執行資料破壞操作。
