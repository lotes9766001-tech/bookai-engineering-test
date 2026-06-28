import React from 'react';

const commerceIntegrationSections = [
  {
    edition: '電商版功能',
    title: '社群與客服來源',
    description: '把社群詢問整理成顧客資料、客服紀錄、訂單線索與常見問題。',
    items: [
      ['LINE 官方帳號', '規劃中'],
      ['Facebook 粉專', '規劃中'],
      ['Instagram', '規劃中'],
      ['TikTok', '規劃中'],
      ['Threads', '規劃中']
    ]
  },
  {
    edition: '電商版功能',
    title: '電商平台訂單',
    description: '把平台訂單、商品、庫存、平台費用與銷售資料整理回 BookAI。',
    items: [
      ['蝦皮購物 Shopee', '規劃中'],
      ['momo 購物網', '資料匯入規劃中'],
      ['PChome 24h 購物', '資料匯入規劃中'],
      ['酷澎 Coupang', '資料匯入規劃中']
    ]
  },
  {
    edition: '電商版功能',
    title: '金流與收款',
    description: '協助未來整理付款狀態、收款紀錄、退款紀錄與手續費對帳。',
    items: [
      ['綠界 ECPay', '規劃中'],
      ['藍新 NewebPay', '規劃中'],
      ['LINE Pay', '規劃中'],
      ['街口支付', '規劃中'],
      ['信用卡收款', '規劃中'],
      ['ATM / 虛擬帳號', '規劃中'],
      ['超商代碼 / 條碼繳費', '規劃中']
    ]
  },
  {
    edition: '電商版功能',
    title: '物流與出貨',
    description: '協助未來整理出貨狀態、物流單號、運費、退貨與未出貨訂單。',
    items: [
      ['黑貓宅急便', '規劃中'],
      ['新竹物流', '規劃中'],
      ['7-11 店到店', '規劃中'],
      ['全家店到店', '規劃中'],
      ['郵局', '規劃中'],
      ['自送 / 面交', '可手動記錄規劃中']
    ]
  },
  {
    edition: '電商版功能',
    title: '內容發布助手',
    description: '將 AI 草稿、商品文案、社群文案與官網內容整理成可人工發布的素材。',
    items: [
      ['Facebook 貼文草稿', '規劃中'],
      ['Instagram 貼文草稿', '規劃中'],
      ['TikTok 影片文案', '規劃中'],
      ['Threads 貼文草稿', '規劃中'],
      ['LINE 圖文訊息草稿', '規劃中'],
      ['官網文章草稿', '已由官網後台支援部分流程']
    ]
  },
  {
    edition: '電商版功能',
    title: '平台資料匯入',
    description: '在正式 API 串接完成前，先支援 CSV / Excel 匯入平台訂單、商品、庫存與付款資料。',
    items: [
      ['訂單 CSV 匯入', '規劃中'],
      ['商品 CSV 匯入', '規劃中'],
      ['客戶資料匯入', '規劃中'],
      ['庫存資料匯入', '規劃中'],
      ['平台對帳報表匯入', '規劃中']
    ]
  }
];

const restaurantIntegrationSections = [
  {
    edition: '餐飲版功能',
    title: 'POS 系統',
    description: '匯入每日營收、品項銷售、付款方式、折扣、退單與班別資料。',
    items: [
      ['iCHEF', '規劃中'],
      ['肚肚 dodo', '規劃中'],
      ['inline POS', '規劃中'],
      ['Weiby', '規劃中'],
      ['點點全球', '規劃中'],
      ['其他 POS', '可回報需求']
    ]
  },
  {
    edition: '餐飲版功能',
    title: '外送平台',
    description: '整理外送訂單、平台抽成、外送營收占比、退款與取消訂單。',
    items: [
      ['Uber Eats', '規劃中'],
      ['foodpanda', '規劃中'],
      ['Lalamove 外送', '規劃中'],
      ['自有外送', '規劃中']
    ]
  },
  {
    edition: '餐飲版功能',
    title: '訂位 / 排隊系統',
    description: '整理訂位來源、來客數、尖峰時段、翻桌率與候位紀錄。',
    items: [
      ['inline', '規劃中'],
      ['EZTABLE', '規劃中'],
      ['Google 預訂', '規劃中'],
      ['電話訂位', '可手動記錄規劃中'],
      ['現場候位', '可手動記錄規劃中']
    ]
  },
  {
    edition: '餐飲版功能',
    title: '支付對帳',
    description: '整理付款方式、收款對帳、電子發票與每日結帳資料。',
    items: [
      ['LINE Pay', '規劃中'],
      ['街口支付', '規劃中'],
      ['信用卡', '規劃中'],
      ['現金', '可手動記錄規劃中'],
      ['電子發票', '規劃中']
    ]
  },
  {
    edition: '餐飲版功能',
    title: '食材 / 庫存',
    description: '整理供應商進貨、食材庫存、耗材庫存、盤點、報廢與食材成本。',
    items: [
      ['供應商進貨', 'ERP 已支援部分流程'],
      ['食材庫存', '規劃中'],
      ['耗材庫存', '規劃中'],
      ['盤點', '規劃中'],
      ['報廢紀錄', '規劃中']
    ]
  }
];

function Title({ title, desc }) {
  return (
    <div className="title">
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  );
}

export default function IntegrationCenter({
  editionMode = 'commerce',
  isEngineering = false,
  isRestaurant = false,
  onNavigate
}) {
  const mode = editionMode === 'all'
    ? 'all'
    : editionMode === 'restaurant' || isRestaurant
      ? 'restaurant'
      : 'commerce';
  const sections = mode === 'all'
    ? [...commerceIntegrationSections, ...restaurantIntegrationSections]
    : mode === 'restaurant'
      ? restaurantIntegrationSections
      : commerceIntegrationSections;
  const title = mode === 'restaurant' ? 'POS 串接 Beta' : mode === 'all' ? '整合中心 Beta' : '平台串接 Beta';
  const desc = mode === 'restaurant'
    ? 'BookAI 餐飲版未來將支援 POS、外送平台、訂位系統、支付對帳與食材庫存整合。試營運期間先以規劃與需求蒐集為主，不進行正式外部資料同步。'
    : mode === 'all'
      ? 'Founder 全功能測試模式會顯示多版本整合規劃。每個分類都標示適用版本，試營運期間不進行正式外部資料同步。'
      : 'BookAI 平台串接中心將逐步支援社群、電商平台、金流、物流與資料匯入整合。試營運期間，部分平台會先以「手動匯入」或「設定規劃」方式提供，避免未經確認的資料同步造成錯誤。';

  if (isEngineering && editionMode !== 'all') {
    return (
      <section>
        <Title title="整合中心未開放" desc="工程版目前不提供平台串接或 POS 串接入口。" />
        <div className="notice">
          工程版定位為案場營運系統，核心功能會放在案場、報價、材料、工資、外包與未收款追蹤。本階段不顯示電商平台或餐飲 POS 串接內容。
        </div>
      </section>
    );
  }

  return (
    <section>
      <Title title={title} desc={desc} />

      <div className="notice">
        此頁僅為 Beta 規劃與需求蒐集，不會連接外部平台、不會執行 OAuth、不會儲存 API Key / Secret / Token，也不會自動同步或寫入正式資料。
      </div>

      {sections.map((section) => (
        <div key={`${section.edition}-${section.title}`} className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2>{section.title}</h2>
            <span className="status-badge">{section.edition} · 規劃中</span>
          </div>
          <p className="muted">{section.description}</p>
          <div className="platform-grid">
            {section.items.map(([name, status]) => (
              <div className="platform" key={`${section.title}-${name}`}>
                <b>{name}</b>
                <span>{section.edition} · {status}</span>
                <div>
                  <button type="button" onClick={() => onNavigate?.('feedbacks')}>
                    {status.includes('匯入') ? '資料匯入規劃中' : '回報需求'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
