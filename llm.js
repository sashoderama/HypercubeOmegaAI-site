/* llm.js – Language Model Interface for Elvira Genesis-Elvira */
export function initLLM() {
  console.debug('Initializing LLM module...');
  const queryInput = document.querySelector('#llm-query'),
        submitBtn = document.querySelector('.llm-submit'),
        responseOutput = document.querySelector('#llm-response'),
        historyList = document.querySelector('#llm-history-list'),
        toggleHistoryBtn = document.querySelector('.toggle-history'),
        exportHistoryBtn = document.querySelector('.export-history'),
        copyBtn = document.querySelector('.copy-button'),
        speechBtn = document.querySelector('.speech-to-text'),
        providerSelect = document.querySelector('#llm-provider'),
        verboseCheckbox = document.querySelector('#llm-verbose'),
        optionsBtn = document.querySelector('.llm-options'),
        optionsPanel = document.querySelector('.llm-options-panel');

  if (!queryInput || !submitBtn || !responseOutput || !historyList || !toggleHistoryBtn || !exportHistoryBtn || !copyBtn || !speechBtn || !providerSelect || !verboseCheckbox || !optionsBtn || !optionsPanel) {
    console.warn('LLM elements missing');
    return;
  }

  let history = JSON.parse(localStorage.getItem('llmHistory')) || [];

  const updateHistory = () => {
    console.debug('Updating LLM history...');
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

  const handleSubmit = async () => {
    console.debug('LLM submit button clicked');
    const query = queryInput.value.trim();
    if (!query) {
      console.debug('Empty query, ignoring');
      return;
    }
    submitBtn.disabled = true;
    try {
      const response = 'Coming Soon';
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
  };

  const handleToggleHistory = () => {
    console.debug('Toggling LLM history');
    historyList.hidden = !historyList.hidden;
    updateHistory();
  };

  const handleExportHistory = () => {
    console.debug('Exporting LLM history...');
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
  };

  const handleCopy = () => {
    console.debug('Copying LLM response...');
    navigator.clipboard.writeText(responseOutput.textContent).catch(err => {
      console.error('Copy failed:', err);
      alert('Failed to copy response.');
    });
  };

  const handleSpeech = () => {
    console.debug('Starting speech recognition...');
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      alert('Speech recognition not supported in this browser.');
      return;
    }
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.start();
    recognition.onresult = event => {
      queryInput.value = event.results[0][0].transcript;
      console.debug('Speech recognition result:', queryInput.value);
    };
    recognition.onerror = err => {
      console.error('Speech recognition error:', err);
      alert('Speech recognition failed.');
    };
  };

  const handleOptions = () => {
    console.debug('Toggling LLM options panel');
    optionsPanel.classList.toggle('active');
  };

  submitBtn.addEventListener('click', handleSubmit);
  toggleHistoryBtn.addEventListener('click', handleToggleHistory);
  exportHistoryBtn.addEventListener('click', handleExportHistory);
  copyBtn.addEventListener('click', handleCopy);
  speechBtn.addEventListener('click', handleSpeech);
  optionsBtn.addEventListener('click', handleOptions);

  const cleanup = () => {
    console.debug('Cleaning up LLM event listeners');
    submitBtn.removeEventListener('click', handleSubmit);
    toggleHistoryBtn.removeEventListener('click', handleToggleHistory);
    exportHistoryBtn.removeEventListener('click', handleExportHistory);
    copyBtn.removeEventListener('click', handleCopy);
    speechBtn.removeEventListener('click', handleSpeech);
    optionsBtn.removeEventListener('click', handleOptions);
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  updateHistory();
}