export function initTelemetry() {
  const upd = () => {
    document.querySelector('#entropy')?.textContent = `${Math.round(Math.random() * 100)}%`;
    document.querySelector('#gpu-util')?.textContent = `${Math.round(Math.random() * 100)}%`;
    document.querySelector('#ethics')?.textContent = `${Math.round(Math.random() * 100)}%`;
    document.querySelector('#node-density')?.textContent = `${Math.round(Math.random() * 800)}`;
    document.querySelector('#threat-rate')?.textContent = `${Math.round(Math.random() * 10)}/s`;
    document.querySelector('#audit-latency')?.textContent = `${Math.round(Math.random() * 120)}ms`;
    requestAnimationFrame(upd);
  };
  upd();

  const hud = () => {
    const mem = (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0).toFixed(1);
    document.querySelector('#memory-usage')?.textContent = `${mem} MB`;
    document.querySelector('#gpu-usage')?.textContent = `${(Math.random() * 25 + 10).toFixed(0)}%`;
    document.querySelector('#cluster-load')?.textContent = `${(Math.random() * 45 + 15).toFixed(0)}%`;
    requestAnimationFrame(hud);
  };
  hud();
}
