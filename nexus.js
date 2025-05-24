/* nexus.js – Unified Entry Point for AuroraGenesis ∞ NEXUS */
'use strict';

// Module imports with retry logic
const loadModule = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const module = await import(url);
      return module;
    } catch (err) {
      if (i === retries - 1) throw new Error(`Failed to load ${url}: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

const modules = await Promise.allSettled([
  loadModule('/theme-toggle.js').then(m => ({ initThemeToggle: m.initThemeToggle })),
  loadModule('/llm.js').then(m => ({ initLLM: m.initLLM })),
  loadModule('/charts.js').then(m => ({ initCharts: m.initCharts })),
  loadModule('/accordion.js').then(m => ({ initAccordion: m.initAccordion })),
  loadModule('/telemetry.js').then(m => ({ initTelemetry: m.initTelemetry })),
]).then(results => {
  const loaded = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') Object.assign(loaded, result.value);
    else console.warn(`Module ${['theme-toggle', 'llm', 'charts', 'accordion', 'telemetry'][i]} failed: ${result.reason}`);
  });
  return loaded;
}).catch(err => {
  console.error('🔥 Module import error:', err);
  return {};
});

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const prefersRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const webglSupported = (() => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
})();

// State
const state = {
  llmCallCount: 0,
  animationFrameId: null,
  cleanup: new Set(),
};

// Neural Background
async function initNeuralBackground() {
  const host = $('#neural-bg');
  if (!host) {
    console.error('Neural background container not found');
    return;
  }

  const area = innerWidth * innerHeight;
  let renderer, composer;

  const fallback2D = () => {
    const N = Math.max(20, Math.min(100, Math.floor(area / 150_000)));
    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'neural-bg-fallback',
      'aria-label': 'Decorative neural network visualization',
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      pulse: Math.random() * Math.PI * 2,
    }));
    const edges = Array.from({ length: N }, () => {
      let s = Math.floor(Math.random() * N), t;
      do { t = Math.floor(Math.random() * N); } while (t === s);
      return { s, t, pulse: Math.random() * Math.PI * 2 };
    });

    const draw = ts => {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(240, 248, 255, 0.1)');
      gradient.addColorStop(1, 'rgba(168, 198, 229, 0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1;
      edges.forEach(({ s, t, pulse }) => {
        const a = nodes[s], b = nodes[t], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 200) {
          pulse += 0.03;
          ctx.strokeStyle = `rgba(124, 212, 252, ${(0.2 + 0.15 * Math.sin(pulse)) * (1 - d / 200)})`;
          ctx.beginPath();
          ctx.moveTo(a.x * devicePixelRatio, a.y * devicePixelRatio);
          ctx.lineTo(b.x * devicePixelRatio, b.y * devicePixelRatio);
          ctx.stroke();
        }
        edges[s].pulse = pulse;
      });

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.04;
        if (n.x < 0 || n.x > innerWidth) n.vx *= -1;
        if (n.y < 0 || n.y > innerHeight) n.vy *= -1;
        ctx.beginPath();
        ctx.arc(n.x * devicePixelRatio, n.y * devicePixelRatio, 4 * (1 + 0.2 * Math.sin(n.pulse)), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(124, 212, 252, 0.8)';
        ctx.shadowColor = '#7cd4fc';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      if (!prefersRM) state.animationFrameId = requestAnimationFrame(draw);
    };

    const resize = () => {
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      requestAnimationFrame(draw);
    };
    window.addEventListener('resize', resize);
    state.cleanup.add(() => window.removeEventListener('resize', resize));
    requestAnimationFrame(draw);
  };

  if (!webglSupported || prefersRM) {
    console.log('WebGL not supported or reduced motion preferred, falling back to 2D');
    return fallback2D();
  }

  try {
    const [{ default: THREE }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.min.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/EffectComposer.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/RenderPass.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/UnrealBloomPass.js'),
    ]);

    const DPR = Math.min(devicePixelRatio, 1.5);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(DPR);
    renderer.setSize(innerWidth, innerHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.z = 25;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x7cd4fc, 1, 20);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.15, 0.9));

    const NODE_COUNT = Math.max(30, Math.min(150, Math.floor(area / 250_000)));
    const clusters = 3;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.015),
      cluster: Math.floor(Math.random() * clusters),
      pulse: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2,
    }));
    const edges = Array.from({ length: Math.floor(NODE_COUNT * 0.8) }, () => {
      let s = Math.floor(Math.random() * NODE_COUNT), t;
      do { t = Math.floor(Math.random() * NODE_COUNT); } while (t === s);
      return { s, t, pulse: Math.random() * Math.PI * 2 };
    });

    const posArr = new Float32Array(NODE_COUNT * 3);
    const pulseArr = new Float32Array(NODE_COUNT);
    const rotArr = new Float32Array(NODE_COUNT);
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    nodeGeo.setAttribute('pulse', new THREE.BufferAttribute(pulseArr, 1));
    nodeGeo.setAttribute('rotation', new THREE.BufferAttribute(rotArr, 1));
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float pulse;
        attribute float rotation;
        varying float vP;
        varying vec3 vPos;
        void main() {
          vP = pulse;
          vPos = position;
          gl_PointSize = 6.0 * (1.0 + 0.3 * sin(pulse));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vP;
        varying vec3 vPos;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.2, d) * (0.6 + 0.3 * sin(vP));
          float fade = 1.0 - abs(vPos.z / 10.0);
          gl_FragColor = vec4(0.49, 0.83, 0.99, a * fade * 0.8);
        }
      `,
      transparent: true,
    });
    scene.add(new THREE.Points(nodeGeo, nodeMat));

    const edgeArr = new Float32Array(edges.length * 6);
    const edgePulseArr = new Float32Array(edges.length);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
    edgeGeo.setAttribute('pulse', new THREE.BufferAttribute(edgePulseArr, 1));
    const edgeMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float pulse;
        varying float vP;
        varying vec3 vPos;
        void main() {
          vP = pulse;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vP;
        varying vec3 vPos;
        void main() {
          float f = 1.0 - abs(vPos.z / 10.0);
          float pulseAlpha = 0.2 + 0.15 * sin(vP);
          gl_FragColor = vec4(0.49, 0.83, 0.99, pulseAlpha * f * 0.6);
        }
      `,
      transparent: true,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const gradientGeo = new THREE.PlaneGeometry(30, 30);
    const gradientMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        void main() {
          vec2 uv = vUv;
          vec3 color = mix(vec3(0.94, 0.97, 1.0), vec3(0.66, 0.78, 0.9), uv.y);
          float noise = fract(sin(dot(uv * time * 0.001, vec2(12.9898, 78.233))) * 43758.5453);
          color += noise * 0.01;
          gl_FragColor = vec4(color, 0.3);
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true,
    });
    const gradientMesh = new THREE.Mesh(gradientGeo, gradientMat);
    gradientMesh.position.z = -8;
    scene.add(gradientMesh);

    const particleCount = 30;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleVel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 25;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 25;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      particleVel[i * 3] = (Math.random() - 0.5) * 0.015;
      particleVel[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
      particleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x7cd4fc,
      size: 1.5,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const refreshBuffers = () => {
      nodes.forEach((n, i) => {
        posArr.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
        pulseArr[i] = n.pulse;
        rotArr[i] = n.rotation;
      });
      nodeGeo.attributes.position.needsUpdate = true;
      nodeGeo.attributes.pulse.needsUpdate = true;
      nodeGeo.attributes.rotation.needsUpdate = true;

      edges.forEach(({ s, t, pulse }, i) => {
        const a = nodes[s].pos, b = nodes[t].pos;
        edgeArr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        edgePulseArr[i] = pulse;
      });
      edgeGeo.attributes.position.needsUpdate = true;
      edgeGeo.attributes.pulse.needsUpdate = true;

      for (let i = 0; i < particleCount; i++) {
        particlePos[i * 3] += particleVel[i * 3];
        particlePos[i * 3 + 1] += particleVel[i * 3 + 1];
        particlePos[i * 3 + 2] += particleVel[i * 3 + 2];
        if (Math.abs(particlePos[i * 3]) > 25) particleVel[i * 3] *= -1;
        if (Math.abs(particlePos[i * 3 + 1]) > 25) particleVel[i * 3 + 1] *= -1;
        if (Math.abs(particlePos[i * 3 + 2]) > 12) particleVel[i * 3 + 2] *= -1;
      }
      particleGeo.attributes.position.needsUpdate = true;
    };

    let last = 0;
    const animate = t => {
      if (t - last > 25) {
        nodes.forEach(n => {
          n.pos.add(n.vel);
          n.pulse += 0.05;
          n.rotation += 0.01;
          ['x', 'y', 'z'].forEach(ax => {
            const lim = ax === 'z' ? 10 : 20;
            if (Math.abs(n.pos[ax]) > lim) n.vel[ax] *= -1;
          });
          const center = new THREE.Vector3();
          let cnt = 0;
          nodes.forEach(o => {
            if (o.cluster === n.cluster) {
              center.add(o.pos);
              cnt++;
            }
          });
          if (cnt) {
            center.divideScalar(cnt);
            n.vel.add(center.sub(n.pos).multiplyScalar(0.0008));
          }
        });
        edges.forEach(e => {
          e.pulse += 0.04;
        });
        gradientMat.uniforms.time.value = t * 0.001;
        camera.position.x = Math.sin(t * 0.0001) * 3;
        camera.position.y = Math.cos(t * 0.00008) * 2;
        camera.lookAt(0, 0, 0);
        refreshBuffers();
        composer.render();
        last = t;
      }
      if (!prefersRM) state.animationFrameId = requestAnimationFrame(animate);
    };

    const onResize = () => {
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    state.cleanup.add(() => window.removeEventListener('resize', onResize));
    onResize();
    state.animationFrameId = requestAnimationFrame(animate);

    state.cleanup.add(() => {
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    });
  } catch (err) {
    console.error('WebGL failed, using fallback:', err);
    fallback2D();
  }
}

// Scroll-Spy
function initScrollSpy() {
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

// Graphs
function createGraph(selector, nodes = [], edges = []) {
  const wrap = $(selector);
  if (!wrap) {
    console.error(`Graph container ${selector} not found`);
    return;
  }
  if (!nodes.length || !edges.length) {
    console.warn(`No valid nodes or edges for ${selector}`);
    wrap.innerHTML = '<p aria-live="polite">Graph data unavailable.</p>';
    return;
  }

  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', `Graph visualization for ${selector.includes('threat') ? 'threat detection' : 'stack'}`);
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const draw = () => {
    const w = wrap.clientWidth * devicePixelRatio,
          h = wrap.clientHeight * devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${wrap.clientWidth}px`;
    canvas.style.height = `${wrap.clientHeight}px`;
    ctx.fillStyle = 'rgba(240, 248, 255, 0.1)';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#7cd4fc';
    edges.forEach(e => {
      const a = nodes.find(n => n.id === e.source),
            b = nodes.find(n => n.id === e.target);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x * devicePixelRatio, a.y * devicePixelRatio);
        ctx.bezierCurveTo(
          a.x * 0.3 + b.x * 0.7, a.y,
          a.x * 0.7 + b.x * 0.3, b.y,
          b.x * devicePixelRatio, b.y * devicePixelRatio
        );
        ctx.stroke();
      }
    });

    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x * devicePixelRatio, n.y * devicePixelRatio, n.r, 0, 2 * Math.PI);
      ctx.fillStyle = '#7cd4fc';
      ctx.fill();
      ctx.strokeStyle = '#a8c6e5';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '12px Sora';
      ctx.fillStyle = '#0c0d10';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x * devicePixelRatio, (n.y + n.r + 12) * devicePixelRatio);
    });

    const nodeCount = $(selector.includes('threat') ? '#node-count' : '#stack-node-count');
    if (nodeCount) nodeCount.textContent = nodes.length;
  };

  const resize = throttle(draw, 100);
  window.addEventListener('resize', resize);
  state.cleanup.add(() => window.removeEventListener('resize', resize));
  draw();
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

  if (!localStorage.getItem('consent')) pop.classList.remove('hidden');
  accept.addEventListener('click', () => {
    localStorage.setItem('consent', 'accepted');
    pop.classList.add('hidden');
  });
  decline.addEventListener('click', () => {
    localStorage.setItem('consent', 'declined');
    pop.classList.add('hidden');
  });

  state.cleanup.add(() => {
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

  const togglePanel = () => panel.classList.toggle('active');
  const toggleOverlay = () => overlay.classList.toggle('active');
  const toggleHighContrast = () => {
    const currentTheme = document.body.dataset.theme || 'frost';
    document.body.dataset.theme = currentTheme === 'frost' ? 'high-contrast' : 'frost';
  };

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'd') {
      togglePanel();
      toggleOverlay();
    }
    if (e.altKey && e.key === '/') {
      toggleHighContrast();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.ctrlKey) toggleOverlay();
  });

  state.cleanup.add(() => {
    document.removeEventListener('keydown', togglePanel);
    document.removeEventListener('keyup', toggleOverlay);
  });
}

// Snapshot Export
function exportSnapshot() {
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
    a.download = 'nexus-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
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
      timer = setTimeout(() => (timer = null), ms);
    }
  };
}

// Static Data
const threatNodes = [
  { id: '1', x: 100, y: 100, r: 15, label: 'Ingest' },
  { id: '2', x: 300, y: 200, r: 15, label: 'Analyze' },
  { id: '3', x: 500, y: 150, r: 15, label: 'Mutate' },
  { id: '4', x: 200, y: 350, r: 15, label: 'Neutralize' },
  { id: '5', x: 400, y: 400, r: 15, label: 'Audit' },
];
const threatEdges = [
  { source: '1', target: '2' },
  { source: '2', target: '3' },
  { source: '3', target: '4' },
  { source: '4', target: '5' },
];
const stackNodes = [
  { id: '1', x: 150, y: 100, r: 15, label: 'Kafka' },
  { id: '2', x: 350, y: 150, r: 15, label: 'Prometheus' },
  { id: '3', x: 250, y: 300, r: 15, label: 'Triton' },
];
const stackEdges = [
  { source: '1', target: '2' },
  { source: '2', target: '3' },
];

// Initialization
async function initEverything() {
  const loading = $('#loading');
  try {
    if (loading) {
      await new Promise(resolve => setTimeout(resolve, 300));
      loading.classList.add('hidden');
      loading.style.display = 'none';
    }

    await initNeuralBackground();
    if (modules.initThemeToggle) modules.initThemeToggle();
    initScrollSpy();
    if (modules.initCharts) modules.initCharts();
    if (modules.initLLM) {
      modules.initLLM();
      const originalLLM = modules.initLLM;
      modules.initLLM = async (...args) => {
        state.llmCallCount++;
        return originalLLM(...args);
      };
    }
    if (modules.initTelemetry) modules.initTelemetry();
    if (modules.initAccordion) {
      modules.initAccordion(['#features']);
    }
    initConsent();
    initDevPanel();

    createGraph('#threat-detection-graph', threatNodes, threatEdges);
    createGraph('#stack-graph', stackNodes, stackEdges);

    const snapshotBtn = $('.snapshot-button');
    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', exportSnapshot);
      state.cleanup.add(() => snapshotBtn.removeEventListener('click', exportSnapshot));
    }

    // Intersection Observer for section visibility
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });
    $$('section').forEach(section => observer.observe(section));
    state.cleanup.add(() => observer.disconnect());
  } catch (err) {
    console.error('Initialization failed:', err);
    if (loading) {
      loading.classList.add('hidden');
      loading.style.display = 'none';
    }
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.padding = '20px';
    errorDiv.textContent = 'Failed to load the application. Please try refreshing or contact support.';
    document.body.appendChild(errorDiv);
  }
}

// Boot
try {
  document.addEventListener('DOMContentLoaded', initEverything);
  window.addEventListener('unload', () => {
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    state.cleanup.forEach(fn => fn());
  });
} catch (err) {
  console.error('🔥 Fatal init error:', err);
  if ($('#loading')) {
    $('#loading').classList.add('hidden');
    $('#loading').style.display = 'none';
  }
  const errorDiv = document.createElement('div');
  errorDiv.style.color = 'red';
  errorDiv.style.textAlign = 'center';
  errorDiv.style.padding = '20px';
  errorDiv.textContent = 'Fatal initialization error. Please refresh or contact support.';
  document.body.appendChild(errorDiv);
}

console.log('nexus.js loaded');
