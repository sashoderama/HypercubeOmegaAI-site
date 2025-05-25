/* charts.js */
export function initCharts(state) {
  console.debug('Initializing charts module...');
  if (window.__charts__) {
    console.debug('Charts already initialized, skipping');
    return;
  }
  window.__charts__ = true;

  const eC = document.querySelector('#entropy-chart'),
        aC = document.querySelector('#activity-chart'),
        pC = document.querySelector('#ethics-chart');
  if (!eC || !aC || !pC) {
    console.warn('Chart canvases missing');
    return;
  }

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      console.debug(`Tab button clicked: ${button.dataset.tab}`);
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      button.classList.add('active');
      const tabId = button.dataset.tab;
      document.querySelector(`#${tabId}`).classList.add('active');
    });
  });

  const entropyChart = new Chart(eC, {
    type: 'bar',
    data: {
      labels: ['XSS', 'SQL Injection', 'DDoS', 'Zero-Day', 'Phishing'],
      datasets: [{
        label: 'Latency (ms)',
        data: [0.8, 0.9, 0.85, 1.0, 0.95],
        backgroundColor: '#6be2eb',
        borderColor: '#b39ddb',
        borderWidth: 1
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      scales: {
        y: {
          beginAtZero: true,
          max: 1.5,
          title: { display: true, text: 'Latency (ms)', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#b39ddb' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Threat Type', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#b39ddb' },
          ticks: { color: '#0c0d10' }
        }
      },
      plugins: {
        legend: { labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title: { display: true, text: 'Threat Detection Latency', color: '#0c0d10', font: { family: 'Sora', size: 16 } }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const activityChart = new Chart(aC, {
    type
