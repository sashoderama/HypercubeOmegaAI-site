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
        backgroundColor: '#7cd4fc',
        borderColor: '#a8c6e5',
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
          grid: { color: '#a8c6e5' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Threat Type', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#a8c6e5' },
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
    type: 'line',
    data: {
      labels: ['2025', '2027', '2029'],
      datasets: [{
        label: 'Revenue ($M)',
        data: [5, 30, 100],
        borderColor: '#7cd4fc',
        backgroundColor: 'rgba(124, 212, 252, 0.3)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      scales: {
        y: {
          beginAtZero: true,
          max: 120,
          title: { display: true, text: 'Revenue ($M)', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#a8c6e5' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Year', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#a8c6e5' },
          ticks: { color: '#0c0d10' }
        }
      },
      plugins: {
        legend: { labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title: { display: true, text: 'Revenue Projections', color: '#0c0d10', font: { family: 'Sora', size: 16 } }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const ethicsChart = new Chart(pC, {
    type: 'pie',
    data: {
      labels: ['GDPR', 'SOC2', 'HIPAA', 'FIPS 140-3'],
      datasets: [{
        label: 'Compliance Efficacy',
        data: [25, 25, 25, 25],
        backgroundColor: ['#7cd4fc', '#a8c6e5', '#4f8dfd', '#8fa9ff'],
        borderColor: '#0c0d10',
        borderWidth: 1
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } }
        },
        title: { display: true, text: 'Compliance Coverage', color: '#0c0d10', font: { family: 'Sora', size: 16 } }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const interval = setInterval(() => {
    console.debug('Updating chart data...');
    entropyChart.data.datasets[0].data = entropyChart.data.datasets[0].data.map(v => Math.max(0.8, Math.min(1.0, v + (Math.random() - 0.5) * 0.1)));
    entropyChart.update();
    ethicsChart.data.datasets[0].data = [25, 25, 25, 25];
    ethicsChart.update();
  }, 5000);

  state.cleanup.add(() => {
    console.debug('Cleaning up charts...');
    clearInterval(interval);
    entropyChart.destroy();
    activityChart.destroy();
    ethicsChart.destroy();
    tabButtons.forEach(button => button.removeEventListener('click', button.onclick));
  });
}
