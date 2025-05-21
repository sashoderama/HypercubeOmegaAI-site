import { saveHistoryItem, loadHistory } from './indexeddb-llm.js';

export function initLLM() {
  const submit = document.querySelector('.llm-submit'),
        query = document.querySelector('#llm-query'),
        resp = document.querySelector('#llm-response'),
        hist = document.querySelector('#llm-history-list'),
        prov = document.querySelector('#llm-provider');

  async function fakeCall(text, provider) {
    await new Promise(r => setTimeout(r, 800));
    return `Analysis for "${text}" via ${provider}: threat < 1%.`;
  }

  submit?.addEventListener('click', async () => {
    const q = query.value.trim(); if (!q) return;
    submit.disabled = true;
    resp.textContent = 'Processing…';
    window.llmCallCount = (window.llmCallCount || 0) + 1;

    const res = await fakeCall(q, prov.value);
    if (Math.random() < 0.1) {
      resp.textContent = '⚠️ Blocked by ethics filter.';
      submit.disabled = false;
      return;
    }

    resp.textContent = res;
    const item = { q, ts: new Date().toLocaleTimeString() };
    const li = document.createElement('li');
    li.innerHTML = `<span>${q}</span><span>${item.ts}</span>`;
    hist.prepend(li);
    saveHistoryItem(item);
    submit.disabled = false;
  });

  document.querySelector('.copy-button')?.addEventListener('click', () => {
    navigator.clipboard.writeText(resp.textContent);
    const b = document.querySelector('.copy-button');
    b.textContent = '✅';
    setTimeout(() => b.textContent = '📋', 1500);
  });

  document.querySelector('.export-history')?.addEventListener('click', () => {
    const data = [...hist.children].map(li => ({ q: li.children[0].textContent, ts: li.children[1].textContent }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llm-history.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.querySelector('.toggle-history')?.addEventListener('click', () => {
    hist.toggleAttribute('hidden');
  });

  // Load history from IndexedDB
  loadHistory().then(items => {
    items.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.q}</span><span>${item.ts}</span>`;
      hist.appendChild(li);
    });
  });
}
