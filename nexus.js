// Entropy 3D Hex Visualizer
async function initHexVisualizer() {
  const container = $('#hex-visualizer');
  if (!container) {
    console.warn('Hex visualizer container not found');
    return;
  }

  if (!webglSupported) {
    container.innerHTML = '<p aria-live="polite">WebGL not supported. Please use a compatible browser.</p>';
    return;
  }

  try {
    console.debug('Loading Three.js for hex visualizer...');
    const [{ default: THREE }, { OrbitControls }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/controls/OrbitControls.js'),
    ]);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(isMobile ? 1.2 : 1.5);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.minDistance = 5;
    controls.maxDistance = 20;

    const hexGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
    const hexMaterial = new THREE.MeshPhongMaterial({
      color: 0x7cd4fc,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      emissive: 0x4f8dfd,
      emissiveIntensity: 0.3,
    });

    const hexGrid = new THREE.Group();
    const gridSize = 8; // Increased for denser grid
    for (let x = -gridSize; x <= gridSize; x++) {
      for (let y = -gridSize; y <= gridSize; y++) {
        const hex = new THREE.Mesh(hexGeometry, hexMaterial);
        const offset = y % 2 ? 0.5 : 0;
        hex.position.set(x + offset, 0, y * 0.866);
        hexGrid.add(hex);
      }
    }
    scene.add(hexGrid);

    const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);

    const animateHex = t => {
      hexGrid.children.forEach(hex => {
        const entropy = Math.sin(t * 0.001 + hex.position.x + hex.position.z) * 0.5 + 0.5;
        hex.scale.y = 0.2 + entropy * 1.2;
        hex.material.opacity = 0.6 + entropy * 0.4;
        hex.rotation.y += 0.01 * entropy;
      });
      controls.update();
      renderer.render(scene, camera);
      state.hexFrameId = requestAnimationFrame(animateHex);
    };

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    state.cleanup.add(() => {
      window.removeEventListener('resize', onResize);
      if (state.hexFrameId) cancelAnimationFrame(state.hexFrameId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    });

    state.hexFrameId = requestAnimationFrame(animateHex);
  } catch (err) {
    console.error('Hex visualizer failed:', err);
    container.innerHTML = '<p aria-live="polite">Failed to load visualizer. Please try again.</p>';
  }
}

// Timeline Viewer
function initTimelineViewer() {
  const container = $('#timeline-viewer');
  if (!container) {
    console.warn('Timeline viewer container not found');
    return;
  }

  console.debug('Initializing timeline viewer...');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Timeline viewer for attack sequences');
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const events = [
    { time: '2025-05-01', label: 'Initial Breach' },
    { time: '2025-05-02', label: 'Lateral Movement' },
    { time: '2025-05-03', label: 'Data Exfiltration' },
    { time: '2025-05-04', label: 'Containment' },
  ];

  let selectedEvent = null;

  const draw = () => {
    const w = container.clientWidth * devicePixelRatio,
          h = container.clientHeight * devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientHeight}px`;

    ctx.fillStyle = 'rgba(240, 248, 255, 0.15)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#7cd4fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h / 2);
    ctx.lineTo(w * 0.9, h / 2);
    ctx.stroke();

    events.forEach((event, i) => {
      const x = w * (0.1 + (i / (events.length - 1)) * 0.8);
      ctx.beginPath();
      ctx.arc(x, h / 2, selectedEvent === i ? 8 : 6, 0, 2 * Math.PI);
      ctx.fillStyle = selectedEvent === i ? '#a8c6e5' : '#7cd4fc';
      ctx.fill();

      ctx.font = `14px Sora`;
      ctx.fillStyle = '#0c0d10';
      ctx.textAlign = 'center';
      ctx.fillText(event.label, x, h / 2 - 20);
      ctx.fillText(event.time, x, h / 2 + 25);
    });

    if (selectedEvent !== null) {
      const event = events[selectedEvent];
      const x = w * (0.1 + (selectedEvent / (events.length - 1)) * 0.8);
      ctx.fillStyle = 'rgba(124, 212, 252, 0.9)';
      ctx.fillRect(x - 60, h / 2 - 60, 120, 50);
      ctx.fillStyle = '#0c0d10';
      ctx.font = '12px Sora';
      ctx.fillText(`${event.label}: ${event.time}`, x, h / 2 - 40);
    }
  };

  const handleInteraction = e => {
    console.debug('Timeline interaction triggered');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ? e.clientX - rect.left : e.offsetX) * devicePixelRatio;
    const w = canvas.width;
    selectedEvent = null;
    events.forEach((event, i) => {
      const ex = w * (0.1 + (i / (events.length - 1)) * 0.8);
      if (Math.abs(x - ex) < 12) {
        selectedEvent = i;
      }
    });
    draw();
  };

  canvas.addEventListener('click', handleInteraction);
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    handleInteraction(e.touches[0]);
  });
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      console.debug('Timeline keyboard interaction');
      selectedEvent = selectedEvent === null ? 0 : (selectedEvent + 1) % events.length;
      draw();
    }
  });

  state.cleanup.add(() => {
    console.debug('Cleaning up timeline viewer...');
    canvas.removeEventListener('click', handleInteraction);
    canvas.removeEventListener('touchstart', handleInteraction);
    canvas.removeEventListener('keydown', handleInteraction);
  });

  const resize = throttle(draw, 100);
  window.addEventListener('resize', resize);
  state.cleanup.add(() => window.removeEventListener('resize', resize));
  draw();
}

// Scroll-Spy
function initScrollSpy() {
  console.debug('Initializing scroll-spy...');
  const handler = throttle(() => {
    const sections = $$('main section');
    let active = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 80;
      if (window.scrollY >= top) active = sec.id;
    });
    $$('.nav-links a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${active}`);
    });
  }, 50);

  document.addEventListener('scroll', handler);
  state.cleanup.add(() => document.removeEventListener('scroll', handler));
}

// Consent Popup
function initConsent() {
  const pop = $('#consent-popup'),
        accept = $('.consent-accept'),
        decline = $('.consent-decline');
  if (!pop || !accept || !decline) {
    console.warn('Consent popup elements missing');
    return;
  }

  console.debug('Initializing consent popup...');
  if (!localStorage.getItem('consent')) pop.classList.remove('hidden');
  accept.addEventListener('click', () => {
    localStorage.setItem('consent', 'accepted');
    pop.classList.add('hidden');
    console.debug('Consent accepted');
  });
  decline.addEventListener('click', () => {
    localStorage.setItem('consent', 'declined');
    pop.classList.add('hidden');
    console.debug('Consent declined');
  });

  state.cleanup.add(() => {
    console.debug('Cleaning up consent popup...');
    accept.removeEventListener('click', accept);
    decline.removeEventListener('click', decline);
  });
}

// Dev Panel and Accessibility
function initDevPanel() {
  const panel = $('#dev-panel'),
        overlay = $('#keyboard-overlay');
  if (!panel || !overlay) {
    console.warn('Dev panel or overlay missing');
    return;
  }

  console.debug('Initializing dev panel...');
  const togglePanel = () => panel.classList.toggle('active');
  const toggleOverlay = () => overlay.classList.toggle('active');
  const toggleHighContrast = () => {
    const currentTheme = document.body.dataset.theme || 'frost';
    document.body.dataset.theme = currentTheme === 'frost' ? 'high-contrast' : 'frost';
    console.debug(`High contrast toggled to: ${document.body.dataset.theme}`);
  };

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'd') {
      togglePanel();
      toggleOverlay();
      console.debug('Dev panel toggled');
    }
    if (e.altKey && e.key === '/') {
      toggleHighContrast();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.ctrlKey) toggleOverlay();
  });

  state.cleanup.add(() => {
    console.debug('Cleaning up dev panel...');
    document.removeEventListener('keydown', togglePanel);
    document.removeEventListener('keyup', toggleOverlay);
  });
}

// Snapshot Export
function exportSnapshot() {
  console.debug('Exporting snapshot...');
  const snap = {
    stamp: new Date().toISOString(),
    llmCalls: state.llmCallCount,
    latency: $('#latency')?.textContent || 'N/A',
    events: $('#events')?.textContent || 'N/A',
    falsePositives: $('#false-positives')?.textContent || 'N/A',
    compliance: $('#compliance')?.textContent || 'N/A',
  };
  try {
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elvira-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
    console.debug('Snapshot exported successfully');
  } catch (err) {
    console.error('Snapshot export failed:', err);
    alert('Failed to export snapshot. Please try again.');
  }
}

// Utilities
function throttle(fn, ms) {
  let timer;
  return (...args) => {
    if (!timer) {
      fn(...args);
      timer = setTimeout(() => timer = null, ms);
    }
  };
}

// Initialization
async function initEverything() {
  const loading = $('#loading');
  try {
    console.debug('DOM loaded, initializing...');
    if (loading) {
      console.debug('Hiding loading overlay...');
      await new Promise(resolve => setTimeout(resolve, 300));
      loading.classList.add('hidden');
      loading.style.display = 'none';
    } else {
      console.warn('Loading overlay not found');
    }

    console.debug('Checking main content...');
    const main = $('main');
    if (!main) {
      console.error('Main element not found');
      throw new Error('Main element missing');
    }

    console.debug('Checking CSS load...');
    const cssLink = document.querySelector('link[href="/style.css"]');
    if (!cssLink) {
      console.warn('style.css not found, applying fallback styles');
      const style = document.createElement('style');
      style.textContent = `
        body { font-family: sans-serif; background: #f0f8ff; color: #0c0d10; }
        main { padding: 20px; text-align: center; }
        .error-message { color: red; padding: 20px; text-align: center; }
      `;
      document.head.appendChild(style);
    }

    console.debug('Initializing neural background...');
    await initNeuralBackground();
    if (modules.initThemeToggle) {
      console.debug('Initializing theme toggle...');
      modules.initThemeToggle();
    }
    console.debug('Initializing scroll-spy...');
    initScrollSpy();
    if (modules.initCharts) {
      console.debug('Initializing charts...');
      modules.initCharts(state); // Pass state
    }
    if (modules.initLLM) {
      console.debug('Initializing LLM...');
      modules.initLLM();
      const originalLLM = modules.initLLM;
      modules.initLLM = async (...args) => {
        state.llmCallCount++;
        return originalLLM(...args);
      };
    }
    if (modules.initTelemetry) {
      console.debug('Initializing telemetry...');
      modules.initTelemetry();
    }
    if (modules.initAccordion) {
      console.debug('Initializing accordion...');
      modules.initAccordion(['#features']);
    }
    initConsent();
    initDevPanel();
    initHexVisualizer();
    initTimelineViewer();

    const snapshotBtn = $('.snapshot-button');
    if (snapshotBtn) {
      console.debug('Binding snapshot button...');
      snapshotBtn.addEventListener('click', exportSnapshot);
      state.cleanup.add(() => snapshotBtn.removeEventListener('click', exportSnapshot));
    } else {
      console.warn('Snapshot button not found');
    }

    // Intersection Observer for section visibility
    console.debug('Setting up intersection observer...');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          console.debug(`Section visible: ${entry.target.id}`);
        }
      });
    }, { threshold: 0.1 });
    $$('section').forEach(section => observer.observe(section));
    state.cleanup.add(() => observer.disconnect());

    // Handle script errors
    const nexusScript = document.querySelector('script[src="/nexus.js"]');
    if (nexusScript) {
      nexusScript.addEventListener('error', () => {
        console.error('Failed to load /nexus.js');
        document.body.insertAdjacentHTML('beforeend', '<p class="error-message">Error loading application. Please try again later.</p>');
      });
    }

    console.debug('Initialization completed successfully');
  } catch (err) {
    console.error('Initialization failed:', err);
    if (loading) {
      console.log('Hiding loading overlay due to error');
      loading.classList.add('hidden');
      loading.style.display = 'none';
    }
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = 'Failed to load the application. Please try refreshing or contact support at ceo@aurora-core.net.';
    document.body.appendChild(errorDiv);
  }
}

// Boot
try {
  console.debug('Checking document readiness...');
  if (document.readyState === 'loading') {
    console.debug('Document still loading, binding DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initEverything);
  } else {
    console.debug('Document already loaded, running initEverything...');
    initEverything();
  }
  window.addEventListener('unload', () => {
    console.debug('Cleaning up on unload...');
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    if (state.hexFrameId) cancelAnimationFrame(state.hexFrameId);
    state.cleanup.forEach(fn => fn());
  });
} catch (err) {
  console.error('Fatal init error:', err);
  const loading = $('#loading');
  if (loading) {
    console.log('Hiding loading overlay due to fatal error');
    loading.classList.add('hidden');
    loading.style.display = 'none';
  }
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = 'Fatal initialization error. Please refresh or contact support at ceo@aurora-core.net.';
  document.body.appendChild(errorDiv);
}

console.log('nexus.js loaded');
