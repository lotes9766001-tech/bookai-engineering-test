# BookAI Package A.2 Runtime Lifecycle

> 本文件描述本機完成、尚待 QA 與 staging 驗證的 runtime lifecycle。不得視為部署核准，也不得包含任何環境變數實際值。

## Runtime Lifecycle

### Server Startup

1. `server/index.js` 初始化既有 Express app 與 development SQLite／production PostgreSQL provider 規則。
2. 唯一正式 `app.listen` 綁定 `process.env.PORT` 對應的 port 與 `0.0.0.0`，並保存 HTTP Server 引用。
3. Listen callback 僅非阻塞地啟動 PostgreSQL readiness 與背景排程設定；Tender Sync 不會延後 Server listen。
4. 啟動 log 僅顯示 environment、port、database provider 與 Tender enabled boolean，不顯示 secret 或 URL。

### Background Job Startup

- 長期 timeout／interval 由 runtime timer registry 登記。
- registry 停止接受 timer 後，不會再執行已登記 callback。
- scheduler 避免同一程序同時執行兩輪 Tender Sync。
- 已執行的工作不會被中斷 DB transaction；shutdown 會在 HTTP close 後等待工作抵達可控完成點，並受 force timeout 保護。

### Tender Sync Gate

- `TENDER_SYNC_ENABLED=true` 才會啟用排程與手動同步入口。
- development、test、production 缺少明確設定時均採安全停用並記錄 warning；不得假設 production 永久開啟。
- `TENDER_SYNC_INTERVAL_MS` 必須為 60,000 至 604,800,000 之間的安全正整數；缺少或非法時使用每日預設值。
- 排程工作失敗只記錄去敏感化摘要，不會形成未處理 rejection 或拖垮 Web API。
- shutdown 開始後不啟動新一輪工作。
- 多 Render instance 仍可能各自執行一輪；本包未加入分散式鎖，保留為 P1。

### Signal Handling

- `SIGTERM` 與 `SIGINT` 觸發 exit code 0 的冪等 shutdown。
- `uncaughtException` 與無法安全分類的 `unhandledRejection` 記錄去敏感化摘要後，以 exit code 1 觸發相同 cleanup。
- 正常 Express request error 仍由既有 error middleware 處理，不會自動終止 process。

### HTTP Server Close

1. 標記 `isShuttingDown=true`。
2. health 在短暫 drain window 回 503／`shutting_down`。
3. 停止新背景工作並清除 timer。
4. 呼叫 `server.close()` 停止接受新連線並等待既有 HTTP request 完成。

### Timer Cleanup

- Tender startup timeout 與 recurring interval 均由 registry 集中清除。
- request-scoped health/fetch/AI timeout 由原有 `finally` 清理，不屬長期 background handle。

### PostgreSQL Pool End

- `closePostgresPool()` 安全且冪等。
- Pool 尚未建立時直接回報 `not_created`，不會因 shutdown 建立 Pool。
- Pool 已建立時只呼叫一次 `pool.end()`；失敗只記錄安全摘要並繼續 shutdown。
- Pool 關閉後拒絕建立新連線。

### Force Exit Timeout

- Shutdown force timeout 為程式常數，預設 10 秒且不新增正式環境變數。
- 超時時正常 signal 也會以非零 exit code 結束，避免 process 永久卡住。
- Fatal runtime error 無論正常 cleanup 或 force timeout均維持 exit code 1。
- 跨平台 smoke 在 `NODE_ENV=test` 且 IPC child 明確啟用時使用 test-only shutdown message，驗證真實 BookAI health 與 exit；production 不註冊此 handler。

## Render Shutdown Runbook

1. 確認新版本已經 QA 與 Boss 核准後才部署。
2. 舊 Instance 收到 `SIGTERM`。
3. 確認 health 轉為 503／`shutting_down`。
4. 確認停止新請求與新背景工作。
5. 等待既有 HTTP request 與正在執行的 Tender 工作完成。
6. 確認 PostgreSQL Pool 關閉。
7. 確認舊 Instance 正常退出且無 force timeout。
8. 檢查 runtime log，不得出現 secret、連線字串或持續 fatal error。
9. 確認沒有 restart loop。
10. 確認沒有多 Instance 重複 Tender Sync；若有，停用同步並回滾／另案導入分散式協調。

## Staging Tender Sync

- 停用：明確設定 `TENDER_SYNC_ENABLED=false`，重新啟動 staging 後確認安全 log 顯示 disabled。
- 開啟：僅於受控測試窗口明確設定 `TENDER_SYNC_ENABLED=true`，並設定經審核的 interval。
- 確認未執行：觀察 staging 的 sync run 數量與去敏感化 runtime log；不得以 production 資料做測試。
- 失敗隔離：讓測試 adapter 失敗後確認 ping/health 與一般 API 仍可服務，且沒有 restart loop。
- 多 Instance：staging 開啟前只保留單一 scheduler instance；本包未提供分散式鎖。

## 回滾

回滾本包時，切回 QA 記錄的 Package A-Fix-1 工作樹／commit，移除 A.2 lifecycle 接線、A.2 smoke script 與本文件；不得反向 migration、修改資料或覆蓋其他未提交變更。
