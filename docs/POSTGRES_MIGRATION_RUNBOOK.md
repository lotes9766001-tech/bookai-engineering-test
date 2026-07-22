# PostgreSQL Migration Runbook

## Preflight

使用完全隔離 staging、schema-only snapshot、backup 與合成 fixture；確認 migration user/runtime user 分離、SSL、RPO/RTO 與 rollback owner。不得使用 Production URL。

## Commands

- `npm run db:pg:migrate:plan`：只列出版本與 checksum。
- `npm run db:pg:migrate:status`：只讀 status（需 staging 才能查 DB）。
- `npm run db:pg:migrate -- --confirm-production-migration`：僅受控 DBA 流程，Package B-Core-1 不執行。

## Failure/Rollback

Migration 失敗立即停止並 rollback transaction；checksum drift、duplicate/missing version 皆阻斷。Production 不做自動 down migration，以 verified backup restore 與 DBA runbook 回復。

## 未驗證

本包未連線 PostgreSQL、未執行 migration、未驗證 backup/restore、SSL、Pool end、Render 或正式資料。

## B-Core-2 Static Acceptance

Static contract check 必須報告 49 張表、7 個 ordered migration、無缺表、無未決狀態及無重複 index 名稱。這不等於 PostgreSQL staging parity Pass；實際欄位、FK、constraint、type 與 transaction 仍須在隔離 staging 驗證。
