# BookAI Commerce ERP Hub v1.0 新手啟動教學

這是一個可以在本機先跑起來的 BookAI v1.0 專案。你不需要先懂程式，只要照指令做。

## 你會得到什麼

- 登入 / 註冊
- 公司與方案：Business / Pro / Accountant
- 儀表板
- 交易中心
- 台灣平台串接模擬
- 發票中心
- 電子憑證
- 商品庫存
- 會計中心與成本會計
- 稅務試算
- 記帳士中台

## 第 1 步：安裝 Node.js

請安裝 Node.js LTS：
https://nodejs.org/

安裝完成後，打開終端機輸入：

```bash
node -v
npm -v
```

有出現版本號就成功。

## 第 2 步：安裝專案套件

進入專案資料夾後輸入：

```bash
npm run install:all
```

## 第 3 步：建立本機測試帳號

```bash
npm run seed
```

本機測試帳號：

```text
Email: demo@bookai.com.tw
Password: demo123456
```

## 第 4 步：啟動系統

```bash
npm run dev
```

啟動後打開：

```text
http://localhost:5173
```

## 重要說明

這版使用 SQLite，本機最快可以跑起來。之後要正式上線，再升級成 Supabase PostgreSQL。

## 目前還不是正式商用版

這是 v1.0 基礎可運作版。下一階段會繼續升級：

- 真實 Shopee / Shopify / LINE Pay API
- 正式 PostgreSQL
- Stripe / 綠界訂閱收費
- 更完整 RBAC
- 更完整報表
- 部署到 Vercel + Render / Railway
