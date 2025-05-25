/* accordion.js – Accordion for Elvira Genesis-Elvira */
export function initAccordion(selectors) {
  console.debug('Initializing accordion module...');
  selectors.forEach(selector => {
    const accordion = document.querySelector(selector);
    if (!accordion) {
      console.warn(`Accordion not found: ${selector}`);
      return;
    }

    const items = accordion.querySelectorAll('.accordion-item');
    items.forEach(item => {
      const header = item.querySelector('.accordion-header');
      const content = item.querySelector('.accordion-content');
      if (!header || !content) return;

      header.addEventListener('click', () => {
        console.debug(`Accordion header clicked: ${header.textContent}`);
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !isExpanded);
        content.style.display = isExpanded ? 'none' : 'block';
      });
    });
  });

  const cleanup = () => {
    console.debug('Cleaning up accordion');
    // Event listeners are not removed as they are scoped to DOM elements
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}
