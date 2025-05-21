export function initAccordion() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const accordion = header.parentElement;
      const content = header.nextElementSibling;
      const isOpen = accordion.classList.contains('active');
      headers.forEach(h => {
        h.parentElement.classList.remove('active');
        h.nextElementSibling.classList.remove('active');
      });
      if (!isOpen) {
        accordion.classList.add('active');
        content.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
      } else {
        header.setAttribute('aria-expanded', 'false');
      }
    });
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  });
}
