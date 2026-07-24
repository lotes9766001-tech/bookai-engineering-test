# BookAI RC Storage Decision

目前未啟用任何外部 Storage Provider；本機可使用 local filesystem，Render 持久性仍需 Staging 實測。

| 方案 | 優點 | 風險／成本 |
| --- | --- | --- |
| Render Disk | 設定簡單 | 需確認方案、重啟與部署持久性；與服務生命週期綁定 |
| Supabase Storage | 與既有雲端生態整合 | 需獨立 Bucket、Policy 與 Boss 授權 |
| S3-compatible | 可替換、跨平台 | 需額外 Bucket、權限、費用與生命週期設定 |

尚待 Boss 決定 provider、Bucket、保留政策與費用；未取得決策前不得啟用付費外部服務。
