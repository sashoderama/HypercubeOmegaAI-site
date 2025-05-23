/* accordion.js */
export function initAccordion() {
  const items = $$('.accordion-item');
  if (!items.length) {
    console.warn('Accordion items missing');
    return;
  }

  items.forEach(item => {
    const header = item.querySelector('.accordion-header');
    const content = item.querySelector('.accordion-content');
    if (!header || !content) return;

    header.addEventListener('click', () => {
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', !isExpanded);
      content.classList.toggle('active', !isExpanded);
    });
  });

  state.cleanup.add(() => {
    items.forEach(item => {
      const header = item.querySelector('.accordion-header');
      if (header) header.removeEventListener('click', header);
    });
  });
}
