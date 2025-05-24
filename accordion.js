/* accordion.js */
export function initAccordion(sectionIds = ['#features']) {
  console.debug('Initializing accordion...');
  sectionIds.forEach(sectionId => {
    const items = document.querySelectorAll(`${sectionId} .accordion-item`);
    if (!items.length) {
      console.warn(`Accordion items missing in ${sectionId}`);
      return;
    }

    items.forEach(item => {
      const header = item.querySelector('.accordion-header');
      const content = item.querySelector('.accordion-content');
      if (!header || !content) {
        console.warn(`Accordion header or content missing in ${sectionId}`);
        return;
      }

      header.addEventListener('click', () => {
        console.debug(`Accordion header clicked in ${sectionId}`);
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !isExpanded);
        content.classList.toggle('active', !isExpanded);
      });
    });

    state.cleanup.add(() => {
      console.debug(`Cleaning up accordion in ${sectionId}`);
      items.forEach(item => {
        const header = item.querySelector('.accordion-header');
        if (header) header.removeEventListener('click', header);
      });
    });
  });
}
