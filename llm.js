/* llm.js */
export function initLLM() {
  const queryInput = $('#llm-query'),
        submitBtn = $('.llm-submit'),
        responseOutput = $('#llm-response'),
        historyList = $('#llm-history-list'),
        toggleHistoryBtn = $('.toggle-history'),
        exportHistoryBtn = $('.export-history'),
        copyBtn = $('.copy-button'),
        speechBtn = $('.speech-to-text'),
        providerSelect = $('#llm-provider'),
        verboseCheckbox = $('#llm-verbose'),
        optionsBtn = $('.llm-options'),
        optionsPanel = $('.llm-options-panel');

  if (!queryInput || !submitBtn || !responseOutput || !historyList || !toggleHistoryBtn || !exportHistoryBtn || !copyBtn || !speechBtn || !providerSelect || !verboseCheckbox || !optionsBtn || !optionsPanel) {
    console.warn('LLM elements missing');
    return;
  }

  let history = JSON.parse(localStorage.getItem('llmHistory')) || [];

  const updateHistory = () => {
    historyList.innerHTML = '';
    history.forEach((item, index) => {
      const li = document.createElement('li');
      li.textContent = `${item.query}: ${item.response.slice(0, 50)}...`;
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'cyber-button';
      deleteBtn.onclick = () => {
        history.splice(index, 1);
        localStorage.setItem('llmHistory', JSON.stringify(history));
        updateHistory();
      };
      li.appendChild(deleteBtn);
      historyList.appendChild(li);
    });
  };

  const mockLLM = async (query, verbose) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return verbose ? `Detailed analysis of "${query}": Mock threat analysis completed.` : `Mock response for "${query}".`;
  };

  submitBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    if (!query) return;
    submitBtn.disabled = true;
    try {
      const response = await mockLLM(query, verboseCheckbox.checked);
      responseOutput.textContent = response;
      history.push({ query, response, timestamp: new Date().toISOString() });
      localStorage.setItem('llmHistory', JSON.stringify(history));
      updateHistory();
    } catch (err) {
      console.error('LLM request failed:', err);
      responseOutput.textContent = 'Error processing query. Please try again.';
    } finally {
      submitBtn.disabled = false;
    }
  });

  toggleHistoryBtn.addEventListener('click', () => {
    historyList.hidden = !historyList.hidden;
    updateHistory();
  });

  exportHistoryBtn.addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'llm-history.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('History export failed:', err);
      alert('Failed to export history. Please try again.');
    }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(responseOutput.textContent).catch(err => {
      console.error('Copy failed:', err);
      alert('Failed to copy response.');
    });
  });

  speechBtn.addEventListener('click', () => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser.');
      return;
    }
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.start();
    recognition.onresult = event => {
      queryInput.value = event.results[0][0].transcript;
    };
    recognition.onerror = err => {
      console.error('Speech recognition error:', err);
      alert('Speech recognition failed.');
    };
  });

  optionsBtn.addEventListener('click', () => {
    optionsPanel.classList.toggle('active');
  });

  state.cleanup.add(() => {
    submitBtn.removeEventListener('click', submitBtn);
    toggleHistoryBtn.removeEventListener('click', toggleHistoryBtn);
    exportHistoryBtn.removeEventListener('click', exportHistoryBtn);
    copyBtn.removeEventListener('click', copyBtn);
    speechBtn.removeEventListener('click', speechBtn);
    optionsBtn.removeEventListener('click', optionsBtn);
  });

  updateHistory();
}
