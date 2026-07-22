# Package B QA Checklist

## B-Core-2 靜態驗收

- [x] 49 張表皆有最終狀態 `ACTIVE` 或 `LEGACY_EXCLUDED`。
- [x] 7 張缺表均有 route/query/UI 證據並納入 ACTIVE。
- [x] Migration 版本 001～007 唯一、可排序、可計算 checksum。
- [x] Drift 工具 static mode 報告缺表、未決狀態與重複 index。
- [x] Runner plan/status 不執行 migration。
- [x] Package A/A.2、build、Core/RBAC smoke 回歸通過。
- [ ] PostgreSQL staging 實際 schema parity。
- [ ] FK、unique、index、型別、rollback、backup/restore。

## 結論

B-Core-2 尚未正式 QA Pass；PostgreSQL staging 前不得部署或執行 migration。
