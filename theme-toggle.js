/* theme-toggle.js – Theme Toggle for Elvira Genesis-Elvira */
export function initThemeToggle() {
  console.debug('Initializing theme toggle module...');
  const toggleBtn = document.querySelector('.theme-toggle');
  if (!toggleBtn) {
    console.warn('Theme toggle button missing');
    return;
  }

  toggleBtn.addEventListener('click', () => {
    console.debug('Toggling theme');
    document.body.dataset.theme = document.body.dataset.theme === 'high-contrast' ? 'frost' : 'high-contrast';
  });

  const cleanup = () => {
    console.debug('Cleaning up theme toggle');
    toggleBtn.removeEventListener('click', toggleBtn.onclick);
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}