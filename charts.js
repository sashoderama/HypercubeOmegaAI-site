export function initCharts() {
  if (window.__charts__) return;
  window.__charts__ = true;
  const eC = document.querySelector('#entropy-chart'),
        aC = document.querySelector('#activity-chart'),
        pC = document.querySelector('#ethics-chart');
  if (!eC || !aC || !pC) return;

  const entropyChart = new Chart(eC, {
    type: 'bar',
    data: {
      labels: ['XSS', 'SQL Injection', 'DDoS', 'Zero-Day', 'Phishing'],
      datasets: [{
        label: 'Entropy Level',
        data: [0.7, 0.9, 0.5, 0.8, 0.6],
        backgroundColor: '#4f8dfd',
        borderColor: '#8fa9ff',
        borderWidth: 1
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      scales: {
        y: {
          beginAtZero: true,
          max: 1,
          title: { display: true, text: 'Entropy', color: '#e0e3f4', font: { family: 'Sora', size: 14 } },
          grid: { color: '#adb9cc' },
          ticks: { color: '#e0e3f4' }
        },
        x: {
          title: { display: true, text: 'Threat Type', color: '#e0e3f4', font: { family: 'Sora', size: 14 } },
          grid: { color: '#adb9cc' },
          ticks: { color: '#e0e3f4' }
        }
      },
      plugins: {
        legend: { labels: { color: '#e0e3f4', font: { family: 'Sora', size: 12 } } },
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
        borderColor: '#4f8dfd',
        backgroundColor: 'rgba(79,141,253,0.3)',
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
          title: { display: true, text: 'Activity', color: '#e0e3f4', font: { family: 'Sora', size: 14 } },
          grid: { color: '#adb9cc' },
          ticks: { color: '#e0e3f4' }
        },
        x: {
          title: { display: true, text: 'Time', color: '#e0e3f4', font: { family: 'Sora', size: 14 } },
          grid: { color: '#adb9cc' },
          ticks: { color: '#e0e3f4' }
        }
      },
      plugins: {
        legend: { labels: { color: '#e0e3f4', font: { family: 'Sora', size: 12 } } },
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
        backgroundColor: ['#4f8dfd', '#adb9cc', '#0c0d10'],
        borderColor: '#8fa9ff',
        borderWidth: 1
      }]
    },
    options: {
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#e0e3f4', font: { family: 'Sora', size: 12 } }
        },
        title: { display: false }
      },
      responsive: true,
      maintainAspectRatio: false
    }
  });

  setInterval(() => {
    entropyChart.data.datasets[0].data = entropyChart.data.datasets[0].data.map(() => Math.random() * 0.8 + 0.2);
    entropyChart.update();
    activityChart.data.datasets[0].data = activityChart.data.datasets[0].data.map(() => Math.random() * 0.8 + 0.2);
    activityChart.update();
    ethicsChart.data.datasets[0].data = [Math.random() * 60 + 30, Math.random() * 30, Math.random() * 20];
    ethicsChart.update();
  }, 5000);
}
