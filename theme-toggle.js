export function initThemeToggle() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const apply = t => {
    document.body.classList.toggle('light-theme', t === 'light');
    btn.textContent = t === 'light' ? '🌙' : '🌗';
  };
  apply(localStorage.getItem('theme') || 'dark');
  btn.addEventListener('click', () => {
    const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    apply(next);
  });
}
