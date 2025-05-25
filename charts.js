/* charts.js – Enhanced GPU-friendly analytics for Elvira Genesis-Elvira (v1.4) */
export function initCharts() {
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

  const handleTabClick = function() {
    console.debug(`Tab button clicked: ${this.dataset.tab}`);
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    this.classList.add('active');
    const tabId = this.dataset.tab;
    document.querySelector(`#${tabId}`).classList.add('active');
  };

  tabButtons.forEach(button => button.addEventListener('click', handleTabClick));

  const COLORS = {
    frost: { bg: '#6be2eb', border: '#b39ddb', accent: '#4f8dfd' },
    high: { bg: '#fdb813', border: '#ffde7a', accent: '#ff9b00' }
  };
  const getTheme = () => document.body.dataset.theme === 'high-contrast' ? 'high' : 'frost';
  const pick = key => COLORS[getTheme()][key];

  const makeGradient = (ctx, from, to) => {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };

  const entropyChart = new Chart(eC, {
    type: 'bar',
    data: {
      labels: ['XSS', 'SQL Injection', 'DDoS', 'Zero-Day', 'Phishing'],
      datasets: [{
        label: 'Latency (ms)',
        data: [0.8, 0.9, 0.85, 1.0, 0.95],
        backgroundColor: ctx => makeGradient(ctx.chart.ctx, pick('bg'), 'rgba(0,0,0,0)'),
        borderColor: () => pick('border'),
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.5
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
    type: 'line',
    data: {
      labels: ['2025', '2027', '2029'],
      datasets: [{
        label: 'Revenue ($M)',
        data: [5, 30, 100],
        borderColor: () => pick('accent'),
        backgroundColor: ctx => makeGradient(ctx.chart.ctx, pick('bg'), 'rgba(0,0,0,0)'),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      scales: {
        y: {
          beginAtZero: true,
          max: 120,
          title: { display: true, text: 'Revenue ($M)', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#b39ddb' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Year', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#b39ddb' },
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
        backgroundColor: ['#6be2eb', '#b39ddb', '#4f8dfd', '#8fa9ff'],
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
    entropyChart.data.datasets[0].data = entropyChart.data.datasets[0].data.map(v =>
      Math.max(0.8, Math.min(1.0, v + (Math.random() - 0.5) * 0.1)));
    entropyChart.update();
    ethicsChart.data.datasets[0].data = [25, 25, 25, 25];
    ethicsChart.update();
  }, 5000);

  const cleanup = () => {
    console.debug('Cleaning up charts...');
    clearInterval(interval);
    entropyChart.destroy();
    activityChart.destroy();
    ethicsChart.destroy();
    tabButtons.forEach(button => button.removeEventListener('click', handleTabClick));
    window.__charts__ = false;
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}
