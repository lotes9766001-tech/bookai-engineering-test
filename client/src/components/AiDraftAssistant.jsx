import React, { useState } from 'react';
import { api } from '../lib/api';

const useCaseOptions = [
  { key: 'engineering_estimate_draft', label: '工程估價草稿' },
  { key: 'tender_summary', label: '標案摘要' },
  { key: 'cms_copy_draft', label: '官網文案草稿' },
  { key: 'commerce_product_copy', label: '商品文案草稿' },
  { key: 'business_summary', label: '經營摘要' }
];

function renderItem(item, index) {
  if (item && typeof item === 'object') {
    const text = Object.entries(item)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' / ');
    return <li key={index}>{text}</li>;
  }
  return <li key={index}>{String(item || '')}</li>;
}

export default function AiDraftAssistant({ companyId }) {
  const [useCase, setUseCase] = useState(useCaseOptions[0].key);
  const [text, setText] = useState('室內油漆工程，約 25 坪，含天花板，4 樓無電梯');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await api(`/companies/${companyId}/ai/draft`, {
        method: 'POST',
        body: JSON.stringify({
          useCase,
          input: { text }
        })
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'AI 草稿暫時無法產生，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  const draft = result?.draft || null;

  return (
    <section className="ai-draft-page">
      <div className="title">
        <span className="ai-beta-badge">AI Beta</span>
        <h1>AI 草稿助手</h1>
        <p>僅產生草稿、摘要與建議；不會自動寫入正式資料、報價、請款或官網內容。</p>
      </div>

      <form className="ai-draft-form" onSubmit={submit}>
        <label>
          <span>用途</span>
          <select value={useCase} onChange={(event) => setUseCase(event.target.value)}>
            {useCaseOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>輸入內容</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder="請輸入要整理的內容。建議不要貼上完整電話、Email 或客戶地址。"
          />
        </label>

        <div className="ai-draft-actions">
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? '產生中...' : '產生草稿'}
          </button>
          <small>草稿需由使用者確認後，才可手動套用到正式表單。</small>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="ai-draft-result">
          <div className="ai-draft-meta">
            <span>{result.provider || result.mode || 'unknown'}</span>
            <span>{result.status || (result.ok ? 'ok' : 'disabled')}</span>
            <span>{result.createdAt ? new Date(result.createdAt).toLocaleString('zh-TW') : ''}</span>
          </div>

          <div className="notice">{result.disclaimer || 'AI 內容僅供輔助判斷，請以實際資料與人工確認為準。'}</div>

          {draft && (
            <article>
              <h2>{draft.title}</h2>
              <p>{draft.summary}</p>

              {draft.items?.length > 0 && (
                <>
                  <h3>草稿內容</h3>
                  <ul>{draft.items.map(renderItem)}</ul>
                </>
              )}

              {draft.warnings?.length > 0 && (
                <>
                  <h3>注意事項</h3>
                  <ul>{draft.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </>
              )}

              {draft.nextSteps?.length > 0 && (
                <>
                  <h3>下一步</h3>
                  <ul>{draft.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}
