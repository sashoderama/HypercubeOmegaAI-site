/* charts.js */
export function initCharts() {
  if (window.__charts__) return;
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
        label: 'Entropy Level',
        data: [0.7, 0.9, 0.5, 0.8, 0.6],
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
          max: 1,
          title: { display: true, text: 'Entropy', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
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
        title: { display: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const activityChart = new Chart(aC, {
    type: 'line',
    data: {
      labels: ['0s', '5s', '10s', '15s', '20s', '25s'],
      datasets: [{
        label: 'Neural Activity',
        data: [0.3, 0.5, 0.7, 0.4, 0.6, 0.8],
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
          max: 1,
          title: { display: true, text: 'Activity', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#a8c6e5' },
          ticks: { color: '#0c0d10' }
        },
        x: {
          title: { display: true, text: 'Time', color: '#0c0d10', font: { family: 'Sora', size: 14 } },
          grid: { color: '#a8c6e5' },
          ticks: { color: '#0c0d10' }
        }
      },
      plugins: {
        legend: { labels: { color: '#0c0d10', font: { family: 'Sora', size: 12 } } },
        title: { display: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const ethicsChart = new Chart(pC, {
    type: 'pie',
    data: {
      labels: ['Compliance', 'Neutral', 'Risk'],
      datasets: [{
        label: 'Ethics Score',
        data: [70, 20, 10],
        backgroundColor: ['#7cd4fc', '#a8c6e5', '#ff6b6b'],
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
        title: { display: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  const interval = setInterval(() => {
    entropyChart.data.datasets[0].data = entropyChart.data.datasets[0].data.map(() => Math.random() * 0.8 + 0.2);
    entropyChart.update();
    activityChart.data.datasets[0].data = activityChart.data.datasets[0].data.map(() => Math.random() * 0.8 + 0.2);
    activityChart.update();
    ethicsChart.data.datasets[0].data = [Math.random() * 60 + 30, Math.random() * 30, Math.random() * 20];
    ethicsChart.update();
  }, 5000);

  state.cleanup.add(() => {
    clearInterval(interval);
    entropyChart.destroy();
    activityChart.destroy();
    ethicsChart.destroy();
    tabButtons.forEach(button => button.removeEventListener('click', button));
  });
}
