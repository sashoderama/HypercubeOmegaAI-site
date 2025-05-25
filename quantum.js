/* quantum.js – Quantum Visual Enhancements for Elvira Genesis-Elvira */
export class QuantumEngine {
  constructor() {
    this.initParticleSystem();
    this.initParallaxPhysics();
  }

  initParticleSystem() {
    this.particleCanvas = document.querySelector('.quantum-canvas');
    if (!this.particleCanvas) return;
    this.ctx = this.particleCanvas.getContext('2d');
    this.particles = Array.from({ length: 1000 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 3 + 1
    }));
    this.animateParticles();
  }

  animateParticles = () => {
    this.particleCanvas.width = innerWidth * devicePixelRatio;
    this.particleCanvas.height = innerHeight * devicePixelRatio;
    this.particleCanvas.style.width = `${innerWidth}px`;
    this.particleCanvas.style.height = `${innerHeight}px`;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);

    this.ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
      if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(107, 226, 235, ${0.2 * p.size})`;
      this.ctx.fill();
    });
    requestAnimationFrame(this.animateParticles);
  }

  initParallaxPhysics() {
    document.querySelectorAll('[data-parallax]').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        el.style.setProperty('--x', `${x * 100}%`);
        el.style.setProperty('--y', `${y * 100}%`);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new QuantumEngine();
});
