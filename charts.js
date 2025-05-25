/* charts.js – Enhanced GPU-friendly analytics for Elvira Genesis-Elvira (v1.3) */
export function initCharts(state) {
  console.debug('Initializing charts module…');
  if (window.__charts__) return console.debug('Charts already active.');

  window.__charts__ = true;

  // ────────────────────────────────────────────────────────────
  // Canvas elements
  // ────────────────────────────────────────────────────────────
  const entropyCanvas  = document.querySelector('#entropy-chart');
  const activityCanvas = document.querySelector('#activity-chart');
  const ethicsCanvas   = document.querySelector('#ethics-chart');
  if (!entropyCanvas || !activityCanvas || !ethicsCanvas) {
    console.warn('Chart canvases missing → abort.');
    return;
  }

  // ────────────────────────────────────────────────────────────
  // Tabs logic
  // ────────────────────────────────────────────────────────────
  const tabButtons  = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach(btn => btn.addEventListener('click', e => {
    tabButtons .forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector('#' + btn.dataset.tab)?.classList.add('active');
  }));

  // ────────────────────────────────────────────────────────────
  // Helper – theme-aware colors
  // ────────────────────────────────────────────────────────────
  const COLORS = {
    frost:  { bg: '#7cd4fc', border: '#a8c6e5', accent: '#4f8dfd' },
    high:   { bg: '#fdb813', border: '#ffde7a', accent: '#ff9b00' }
  };
  const getTheme = () => document.body.dataset.theme === 'high-contrast' ? 'high' : 'frost';
  const pick  = key => COLORS[getTheme()][key];

  // ────────────────────────────────────────────────────────────
  // Shared animation flag
  // ────────────────────────────────────────────────────────────
  const ANIM = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ────────────────────────────────────────────────────────────
  // Gradient helpers
  // ────────────────────────────────────────────────────────────
  const makeGradient = (ctx, from, to) => {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, from); g.addColorStop(1, to);
    return g;
  };

  // ────────────────────────────────────────────────────────────
  // Chart instances
  // ────────────────────────────────────────────────────────────
  const entropyChart = new Chart(entropyCanvas, {
    type: 'bar',
    data: {
      labels: ['XSS', 'SQLi', 'DDoS', 'Zero-Day', 'Phishing'],
      datasets: [{
        label: 'Latency (ms)',
        data: [0.8, 0.9, 0.85, 1.0, 0.95],
        backgroundColor: ctx => makeGradient(ctx.chart.ctx, pick('bg'), 'rgba(0,0,0,0)'),
        borderColor: () => pick('border'),
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.5,
      }]
    },
    options: {
      animation: ANIM,
      scales: {
        y: {
          beginAtZero: true,
          max: 1.5,
          title: { display: true, text: 'Latency (ms)', font: { family: 'Sora', size: 14 } },
          grid: { color: '#ececec20' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Threat Type', font: { family: 'Sora', size: 14 } },
          grid: { color: '#ececec20' },
          ticks: { color: '#0c0d10' }
        }
      },
      plugins: {
        legend: { labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title:  { display: true, text: 'Threat-Detection Latency', font: { family: 'Sora', size: 16 } },
        tooltip:{ backgroundColor:'#0c0d10', titleColor:'#ffffff', bodyColor:'#ffffff' }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const activityChart = new Chart(activityCanvas, {
    type: 'line',
    data: {
      labels: ['2025', '2027', '2029'],
      datasets: [{
        label: 'Revenue ($M)',
        data: [5, 30, 100],
        borderColor: () => pick('accent'),
        backgroundColor: ctx => makeGradient(ctx.chart.ctx, pick('bg'), 'rgba(0,0,0,0)'),
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      animation: ANIM,
      scales: {
        y: {
          beginAtZero: true,
          max: 120,
          title: { display: true, text: 'Revenue ($M)', font: { family: 'Sora', size: 14 } },
          grid: { color: '#ececec20' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Year', font: { family: 'Sora', size: 14 } },
          grid: { color: '#ececec20' },
          ticks: { color: '#0c0d10' }
        }
      },
      plugins: {
        legend: { labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title:  { display: true, text: 'Revenue Projections', font: { family: 'Sora', size: 16 } }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const ethicsChart = new Chart(ethicsCanvas, {
    type: 'doughnut',
    data: {
      labels: ['GDPR', 'SOC2', 'HIPAA', 'FIPS 140-3'],
      datasets: [{
        label: 'Compliance Efficacy',
        data: [25, 25, 25, 25],
        backgroundColor: ['#7cd4fc', '#a8c6e5', '#4f8dfd', '#8fa9ff'],
        borderColor: '#ffffff10',
        borderWidth: 1,
        hoverOffset: 6
      }]
    },
    options: {
      animation: ANIM,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title:  { display: true, text: 'Compliance Coverage', font: { family: 'Sora', size: 16 } }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  // ────────────────────────────────────────────────────────────
  // Live update every 4 s
  // ────────────────────────────────────────────────────────────
  const interval = setInterval(() => {
    entropyChart.data.datasets[0].data = entropyChart.data.datasets[0].data.map(v =>
      Math.max(0.75, Math.min(1.05, +(v + (Math.random() - 0.5) * 0.05).toFixed(2)))
    );
    entropyChart.update('none');
  }, 4000);

  // ────────────────────────────────────────────────────────────
  // Cleanup on page unload
  // ────────────────────────────────────────────────────────────
  state.cleanup.add(() => {
    clearInterval(interval);
    entropyChart.destroy();
    activityChart.destroy();
    ethicsChart.destroy();
  });
}
