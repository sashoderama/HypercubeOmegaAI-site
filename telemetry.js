/* telemetry.js */
export function initTelemetry() {
  console.debug('Initializing telemetry...');
  const latency = document.querySelector('#latency'),
        events = document.querySelector('#events'),
        falsePositives = document.querySelector('#false-positives'),
        compliance = document.querySelector('#compliance');

  if (!latency || !events || !falsePositives || !compliance) {
    console.warn('Telemetry elements missing');
    return;
  }

  const updateTelemetry = () => {
    console.debug('Updating telemetry data...');
    latency.textContent = `${(0.8 + Math.random() * 0.2).toFixed(2)}ms`;
    events.textContent = `${(5000000 + Math.random() * 100000).toFixed(0)}`;
    falsePositives.textContent = `${(0.1 + Math.random() * 0.05).toFixed(2)}%`;
    compliance.textContent = '100%';
  };

  updateTelemetry();
  const interval = setInterval(updateTelemetry, 5000);
  state.cleanup.add(() => {
    console.debug('Cleaning up telemetry...');
    clearInterval(interval);
  });
}
