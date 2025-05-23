/* theme-toggle.js */
export function initThemeToggle() {
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) {
    console.warn('Theme toggle button not found');
    return;
  }

  const setTheme = theme => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  };

  toggle.addEventListener('click', () => {
    const currentTheme = document.body.dataset.theme || 'frost';
    setTheme(currentTheme === 'frost' ? 'light' : 'frost');
  });

  const savedTheme = localStorage.getItem('theme') || 'frost';
  setTheme(savedTheme);
}
