import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { money } from '../lib/formatters';
import { getBusinessBiReport } from '../lib/reportApi';

const industryNames = {
  ecommerce: '電商',
  retail: '零售',
  restaurant: '餐飲',
  engineering: '工程',
  service: '服務業',
  general: '企業'
};

function getIndustryName(key) {
  return industryNames[key] || '企業';
}

function Title({ title, desc }) {
  return (
    <div className="section-title">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
    </div>
  );
}

function Card({ title, value, sub }) {
  return (
    <div className="card">
      <span>{title}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Table({ cols, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((col) => <th key={col}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join('-')}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function addDateDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function getBiPresetRange(preset) {
  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);

  if (preset === 'today') return { startDate: toDateInputValue(today), endDate: toDateInputValue(today) };
  if (preset === 'week') return { startDate: toDateInputValue(startOfWeek(today)), endDate: toDateInputValue(today) };
  if (preset === 'lastMonth') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startDate: toDateInputValue(first), endDate: toDateInputValue(last) };
  }
  if (preset === '3m') {
    start.setMonth(start.getMonth() - 2);
    start.setDate(1);
    return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
  }
  if (preset === '6m') {
    start.setMonth(start.getMonth() - 5);
    start.setDate(1);
    return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
  }
  if (preset === 'year') {
    start.setMonth(0, 1);
    return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
  }

  start.setDate(1);
  return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) };
}

function getCompareRange(startDate, endDate) {
  const days = Math.max(Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000) + 1, 1);
  const compareEndDate = addDateDays(startDate, -1);
  const compareStartDate = addDateDays(compareEndDate, -days + 1);
  return { compareStartDate, compareEndDate };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function comparisonText(value, suffix = '%') {
  if (value === null || value === undefined) return '前期無資料';
  const number = Number(value || 0);
  const sign = number > 0 ? '+' : '';
  return `較前期 ${sign}${number.toFixed(1)}${suffix}`;
}

function BiMetricCard({ title, value, previous, change, formatter = money, suffix = '%', previousLabel = '前期' }) {
  const isPositive = Number(change || 0) >= 0;
  return (
    <div className="bi-metric-card">
      <span>{title}</span>
      <strong>{formatter(value)}</strong>
      <small>{previousLabel} {formatter(previous || 0)}</small>
      <em className={change === null || change === undefined ? 'neutral' : isPositive ? 'up' : 'down'}>
        {comparisonText(change, suffix)}
      </em>
    </div>
  );
}

function ChartEmpty({ children }) {
  return <div className="bi-chart-empty">{children}</div>;
}

export default function BusinessBiPage({ companyId, company }) {
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(() => getBiPresetRange('month'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const kpis = data?.kpis || {};
  const previous = data?.previousKpis || {};
  const comparison = data?.comparison || {};
  const queryRange = data?.range || {};

  useEffect(() => {
    let alive = true;
    const compare = getCompareRange(range.startDate, range.endDate);
    setLoading(true);
    setError('');
    getBusinessBiReport(companyId, {
      startDate: range.startDate,
      endDate: range.endDate,
      compareStartDate: compare.compareStartDate,
      compareEndDate: compare.compareEndDate
    })
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || 'BI 資料載入失敗，請稍後再試。');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [companyId, range.startDate, range.endDate]);

  function changePreset(nextPreset) {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') setRange(getBiPresetRange(nextPreset));
  }

  const topProducts = data?.topProducts || [];
  const platformRevenue = data?.platformRevenue || [];
  const inventoryRisk = data?.inventoryRisk || [];
  const revenueTrend = data?.revenueTrend || [];
  const profitTrend = data?.profitTrend || [];

  return (
    <section className="business-bi-page">
      <Title title="BI 分析" desc={`${getIndustryName(company?.industry)}專用：查看區間銷貨、進貨、毛利、排行、平台分布與庫存風險。`} />

      <div className="bi-filter-bar">
        {[
          ['today', '今日'],
          ['week', '本週'],
          ['month', '本月'],
          ['lastMonth', '上月'],
          ['3m', '近 3 個月'],
          ['6m', '近 6 個月'],
          ['year', '今年'],
          ['custom', '自訂']
        ].map(([id, label]) => (
          <button key={id} type="button" className={preset === id ? 'active' : ''} onClick={() => changePreset(id)}>{label}</button>
        ))}
        <label>
          <span>開始</span>
          <input type="date" value={range.startDate} onChange={(e) => { setPreset('custom'); setRange((prev) => ({ ...prev, startDate: e.target.value })); }} />
        </label>
        <label>
          <span>結束</span>
          <input type="date" value={range.endDate} onChange={(e) => { setPreset('custom'); setRange((prev) => ({ ...prev, endDate: e.target.value })); }} />
        </label>
      </div>

      <div className="notice">
        查詢公司 ID：{queryRange.companyId || companyId}｜查詢區間：{queryRange.startDate || range.startDate} 至 {queryRange.endDate || range.endDate}
      </div>

      {loading && <div className="notice">BI 資料載入中...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="bi-metric-grid">
            <BiMetricCard title="銷貨總額" value={kpis.salesTotal} previous={previous.salesTotal} change={comparison.salesTotalChangeRate} />
            <BiMetricCard title="進貨總額" value={kpis.purchaseTotal} previous={previous.purchaseTotal} change={comparison.purchaseTotalChangeRate} />
            <BiMetricCard title="商品成本" value={kpis.productCost} previous={previous.productCost} change={null} />
            <BiMetricCard title="毛利" value={kpis.grossProfit} previous={previous.grossProfit} change={comparison.grossProfitChangeRate} />
            <BiMetricCard title="毛利率" value={kpis.grossMarginRate} previous={previous.grossMarginRate} change={comparison.grossMarginRateChange} formatter={formatPercent} suffix="%" />
            <BiMetricCard title="交易筆數" value={kpis.transactionCount} previous={previous.transactionCount} change={comparison.transactionCountChangeRate} formatter={(value) => `${Number(value || 0)} 筆`} />
            <BiMetricCard title="平均客單價" value={kpis.averageOrderValue} previous={previous.averageOrderValue} change={comparison.averageOrderValueChangeRate} />
            <BiMetricCard title="已收 / 已付" value={kpis.receivedAmount} previous={kpis.paidAmount} change={null} formatter={(value) => money(value)} previousLabel="已付" />
          </div>

          <div className="bi-chart-grid">
            <div className="panel bi-chart-card">
              <h2>營收趨勢圖</h2>
              <p className="panel-subtitle">依日期區間自動彙總每日或每月銷貨金額。</p>
              {revenueTrend.length ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Bar dataKey="salesTotal" name="銷貨金額" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <ChartEmpty>目前此區間尚無銷貨資料。</ChartEmpty>}
            </div>

            <div className="panel bi-chart-card">
              <h2>毛利趨勢圖</h2>
              <p className="panel-subtitle">同時檢視銷貨總額、商品成本與毛利。</p>
              {profitTrend.length ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={profitTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value) => money(value)} />
                    <Legend />
                    <Bar dataKey="salesTotal" name="銷貨總額" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="productCost" name="商品成本" stroke="#dc2626" strokeWidth={2} />
                    <Line type="monotone" dataKey="grossProfit" name="毛利" stroke="#16a34a" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <ChartEmpty>目前此區間尚無毛利資料。</ChartEmpty>}
            </div>
          </div>

          <div className="bi-chart-grid">
            <div className="panel bi-chart-card">
              <h2>平台營收分布</h2>
              <p className="panel-subtitle">依銷貨備註判斷官網、蝦皮、momo、LINE 與其他來源。</p>
              {platformRevenue.length ? (
                <div className="bi-platform-list">
                  {platformRevenue.map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span>
                      <strong>{money(item.amount)}</strong>
                      <small>{formatPercent(item.percentage)}</small>
                      <i style={{ width: `${Math.max(4, item.percentage)}%` }} />
                    </div>
                  ))}
                </div>
              ) : <ChartEmpty>目前此區間尚無平台分布資料。</ChartEmpty>}
            </div>

            <div className="panel bi-chart-card">
              <h2>商品銷售排行</h2>
              <p className="panel-subtitle">Top 5 商品，包含銷售數量、金額、成本與毛利。</p>
              <Table
                cols={['商品', '數量', '銷售金額', '商品成本', '毛利']}
                rows={topProducts.length ? topProducts.map((item) => [
                  item.name,
                  Number(item.quantity || 0),
                  money(item.amount),
                  money(item.cost),
                  money(item.grossProfit)
                ]) : [['目前此區間尚無商品銷售資料', '-', money(0), money(0), money(0)]]}
              />
            </div>
          </div>

          <div className="bi-chart-grid">
            <div className="panel bi-chart-card">
              <h2>庫存風險摘要</h2>
              <p className="panel-subtitle">低於安全庫存的品項與目前庫存成本。</p>
              <div className="bi-stock-summary">
                <Card title="低庫存品項" value={`${kpis.lowStockCount || 0} 項`} />
                <Card title="庫存成本" value={money(kpis.inventoryCost || 0)} />
              </div>
              <Table
                cols={['商品', '庫存', '安全庫存', '庫存成本']}
                rows={inventoryRisk.length ? inventoryRisk.map((item) => [
                  item.name,
                  `${item.stock} ${item.unit || ''}`,
                  `${item.safetyStock} ${item.unit || ''}`,
                  money(item.stockCost)
                ]) : [['目前沒有低庫存商品', '-', '-', money(0)]]}
              />
            </div>

            <div className="panel bi-chart-card">
              <h2>營運摘要</h2>
              <p className="panel-subtitle">依本期 BI 數字整理需要注意的事項。</p>
              <ul className="summary">
                {(data?.summary || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="bi-cashflow-grid">
                <div><span>應收未收</span><strong>{money(kpis.accountsReceivable || 0)}</strong></div>
                <div><span>應付未付</span><strong>{money(kpis.accountsPayable || 0)}</strong></div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
