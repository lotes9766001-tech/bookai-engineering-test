# BookAI Windows 本機啟動指南

此文件用於 Windows 本機開發環境，特別是需要測試 BookAI 後端 SQLite 模式與 CMS 圖片上傳功能時。

## 建議 Node 版本

建議使用 Node 22 LTS。

目前專案的本機 SQLite 模式使用 `better-sqlite3`。Node 24 可能找不到對應的 prebuilt binary，接著改走 `node-gyp rebuild`，在 Windows 缺少 Python 或 C++ build tools 時會安裝失敗。

不建議用 Node 24 跑本機 SQLite 開發環境。若目前已安裝 Node 24，請先切換到 Node 22 LTS，再重新安裝依賴。

## PowerShell 指令注意事項

Windows PowerShell 請使用 `npm.cmd`，不要直接使用 `npm`。

直接執行 `npm` 可能會碰到 `npm.ps1` execution policy 限制，導致指令被 PowerShell 擋下。

## 後端安裝與啟動

在第一個終端機執行：

```powershell
cd C:\Users\Owner\OneDrive\Desktop\bookai-engineering-test\server
npm.cmd install
npm.cmd run dev
```

後端預設使用 `server` 目錄下的依賴。若需要測試 CMS 圖片上傳，請確認 `server/package.json` 內有 `multer` dependency，並且 `npm.cmd install` 已完整成功。

## 前後端一起啟動

在另一個終端機回到專案根目錄執行：

```powershell
cd C:\Users\Owner\OneDrive\Desktop\bookai-engineering-test
npm.cmd install
npm.cmd run dev
```

根目錄的 `npm.cmd run dev` 會同時啟動 server 與 client，適合日常本機開發。若正在排查後端安裝問題，建議先單獨在 `server` 目錄完成 `npm.cmd install`。

## node_modules 壞掉時的清理方式

若曾在 Node 24 下安裝失敗，或 `node_modules` 內依賴不完整，可先清理再重裝。

清理 server 依賴：

```powershell
cd C:\Users\Owner\OneDrive\Desktop\bookai-engineering-test\server
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm.cmd install
```

清理專案根目錄依賴：

```powershell
cd C:\Users\Owner\OneDrive\Desktop\bookai-engineering-test
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm.cmd install
```

清理後請確認目前 Node 版本是 Node 22 LTS，再執行 `npm.cmd install`。

## Node 24 警告

`server` 的 `npm.cmd run dev` 會先檢查 Node major version。若偵測到 Node 24 或更新版本，會顯示以下提醒，但不會中斷啟動：

```text
BookAI 本機 SQLite 模式建議使用 Node 22 LTS。
Node 24 可能導致 better-sqlite3 安裝失敗。
```

這個檢查只作為本機開發提醒，不會改變 DB provider 架構，也不會影響正式環境部署流程。

## CMS 圖片上傳相關依賴

CMS 圖片上傳 API 使用 `multer` 處理 `multipart/form-data`：

- API：`POST /api/website-assets/upload`
- 靜態路徑：`/uploads`
- 儲存位置：`server/uploads/website-assets/`
- 限制：JPG、JPEG、PNG、WEBP，單檔 5MB

若後端啟動出現 `Cannot find package 'multer'`，代表 `server` 依賴尚未完整安裝。請在 Node 22 LTS 下進入 `server` 目錄重新執行：

```powershell
npm.cmd install
```
