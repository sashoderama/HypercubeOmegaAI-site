/* nexus.js – Unified Entry Point for Elvira Genesis-Elvira */
'use strict';

// Module imports with retry logic
const loadModule = async (url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.debug(`Attempting to load module: ${url}, attempt ${i + 1}`);
      const module = await import(url);
      console.debug(`Successfully loaded module: ${url}`);
      return module;
    } catch (err) {
      console.warn(`Failed to load ${url} on attempt ${i + 1}: ${err.message}`);
      if (i === retries - 1) {
        console.error(`Exhausted retries for ${url}: ${err.message}`);
        throw new Error(`Failed to load ${url}: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

const modules = await Promise.allSettled([
  loadModule('/theme-toggle.js').then(m => ({ initThemeToggle: m.initThemeToggle })),
  loadModule('/llm.js').then(m => ({ initLLM: m.initLLM })),
  loadModule('/charts.js').then(m => ({ initCharts: m.initCharts })),
  loadModule('/telemetry.js').then(m => ({ initTelemetry: m.initTelemetry })),
  loadModule('/accordion.js').then(m => ({ initAccordion: m.initAccordion })),
]).then(results => {
  const loaded = {};
  results.forEach((result, i) => {
    const moduleName = ['theme-toggle', 'llm', 'charts', 'telemetry', 'accordion'][i];
    if (result.status === 'fulfilled') {
      console.debug(`Module ${moduleName} loaded successfully`);
      Object.assign(loaded, result.value);
    } else {
      console.warn(`Module ${moduleName} failed: ${result.reason}`);
    }
  });
  return loaded;
}).catch(err => {
  console.error('🔥 Critical module import error:', err);
  return {};
});

// Helpers
const $ = s => {
  const el = document.querySelector(s);
  if (!el) console.warn(`Element not found: ${s}`);
  return el;
};
const $$ = s => {
  const els = Array.from(document.querySelectorAll(s));
  if (!els.length) console.warn(`No elements found: ${s}`);
  return els;
};
const prefersRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth <= 768;
const webglSupported = (() => {
  try {
    const canvas = document.createElement('canvas');
    const supported = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    console.debug(`WebGL supported: ${supported}`);
    return supported;
  } catch {
    console.warn('WebGL check failed');
    return false;
  }
})();

// State
const state = {
  llmCallCount: 0,
  animationFrameId: null,
  hexFrameId: null,
  cleanup: new Set(),
};

// Neural Background (Upscaled)
async function initNeuralBackground() {
  const host = $('#neural-bg');
  if (!host) {
    console.error('Neural background container not found');
    return;
  }

  console.debug('Initializing neural background...');
  const area = innerWidth * innerHeight;
  let renderer, composer;

  const fallback2D = () => {
    console.debug('Falling back to 2D canvas for neural background');
    const N = Math.max(30, Math.min(150, Math.floor(area / 100_000)));
    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'neural-bg-fallback',
      'aria-label': 'Decorative neural network visualization',
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      pulse: Math.random() * Math.PI * 2,
    }));
    const edges = Array.from({ length: N * 1.2 }, () => {
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
      gradient.addColorStop(0, 'rgba(240, 248, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(168, 198, 229, 0.15)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.2;
      edges.forEach(({ s, t, pulse }) => {
        const a = nodes[s], b = nodes[t], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 250) {
          pulse += 0.02;
          ctx.strokeStyle = `rgba(124, 212, 252, ${(0.25 + 0.2 * Math.sin(pulse)) * (1 - d / 250)})`;
          ctx.beginPath();
          ctx.moveTo(a.x * devicePixelRatio, a.y * devicePixelRatio);
          ctx.lineTo(b.x * devicePixelRatio, b.y * devicePixelRatio);
          ctx.stroke();
        }
        edges[s].pulse = pulse;
      });

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.03;
        if (n.x < 0 || n.x > innerWidth) n.vx *= -1;
        if (n.y < 0 || n.y > innerHeight) n.vy *= -1;
        ctx.beginPath();
        ctx.arc(n.x * devicePixelRatio, n.y * devicePixelRatio, 5 * (1 + 0.3 * Math.sin(n.pulse)), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(124, 212, 252, 0.85)';
        ctx.shadowColor = '#7cd4fc';
        ctx.shadowBlur = 10;
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
    console.debug('Loading Three.js dependencies...');
    const [{ default: THREE }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.min.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/EffectComposer.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/RenderPass.js'),
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/UnrealBloomPass.js'),
    ]);

    const DPR = isMobile ? Math.min(devicePixelRatio, 1.2) : Math.min(devicePixelRatio, 1.5);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(DPR);
    renderer.setSize(innerWidth, innerHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.z = 30;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x7cd4fc, 1.5, 25);
    pointLight.position.set(8, 8, 8);
    scene.add(pointLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight.position.set(0, 10, 10);
    scene.add(directionalLight);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.2, 0.85));

    const NODE_COUNT = Math.max(75, Math.min(300, Math.floor(area / 150_000)));
    const clusters = 4;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 12),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.02),
      cluster: Math.floor(Math.random() * clusters),
      pulse: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2,
    }));
    const edges = Array.from({ length: Math.floor(NODE_COUNT * 1.2) }, () => {
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
          gl_PointSize = 6.0 * (1.0 + 0.4 * sin(pulse));
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
          float a = smoothstep(0.5, 0.2, d) * (0.7 + 0.3 * sin(vP));
          float fade = 1.0 - abs(vPos.z / 12.0);
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
          float f = 1.0 - abs(vPos.z / 12.0);
          float pulseAlpha = 0.25 + 0.2 * sin(vP);
          gl_FragColor = vec4(0.49, 0.83, 0.99, pulseAlpha * f * 0.7);
        }
      `,
      transparent: true,
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    const gradientGeo = new THREE.PlaneGeometry(35, 35);
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
          float noise = fract(sin(dot(uv * time * 0.0008, vec2(12.9898, 78.233))) * 43758.5453);
          color += noise * 0.015;
          gl_FragColor = vec4(color, 0.35);
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true,
    });
    const gradientMesh = new THREE.Mesh(gradientGeo, gradientMat);
    gradientMesh.position.z = -10;
    scene.add(gradientMesh);

    const particleCount = isMobile ? 75 : 150;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleVel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 30;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 15;
      particleVel[i * 3] = (Math.random() - 0.5) * 0.02;
      particleVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      particleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.015;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x7cd4fc,
      size: isMobile ? 1.0 : 1.3,
      transparent: true,
      opacity: 0.6,
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
        if (Math.abs(particlePos[i * 3]) > 30) particleVel[i * 3] *= -1;
        if (Math.abs(particlePos[i * 3 + 1]) > 30) particleVel[i * 3 + 1] *= -1;
        if (Math.abs(particlePos[i * 3 + 2]) > 15) particleVel[i * 3 + 2] *= -1;
      }
      particleGeo.attributes.position.needsUpdate = true;
    };

    let last = 0;
    const animate = t => {
      if (t - last > 20) {
        nodes.forEach(n => {
          n.pos.add(n.vel);
          n.pulse += 0.04;
          n.rotation += 0.015;
          ['x', 'y', 'z'].forEach(ax => {
            const lim = ax === 'z' ? 12 : 25;
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
            n.vel.add(center.sub(n.pos).multiplyScalar(0.0009));
          }
        });
        edges.forEach(e => {
          e.pulse += 0.03;
        });
        gradientMat.uniforms.time.value = t * 0.0008;
        camera.position.x = Math.sin(t * 0.00012) * 4;
        camera.position.y = Math.cos(t * 0.00009) * 3;
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
      import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.min.js'),
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

    const hexGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
    const hexMaterial = new THREE.MeshPhongMaterial({
      color: 0x7cd4fc,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    const hexGrid = new THREE.Group();
    const gridSize = 6;
    for (let x = -gridSize; x <= gridSize; x++) {
      for (let y = -gridSize; y <= gridSize; y++) {
        const hex = new THREE.Mesh(hexGeometry, hexMaterial);
        const offset = y % 2 ? 0.5 : 0;
        hex.position.set(x + offset, 0, y * 0.866);
        hexGrid.add(hex);
      }
    }
    scene.add(hexGrid);

    const light = new THREE.PointLight(0xffffff, 1.2, 100);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 0.6));

    const animateHex = t => {
      hexGrid.children.forEach(hex => {
        const entropy = Math.sin(t * 0.0008 + hex.position.x + hex.position.z) * 0.5 + 0.5;
        hex.scale.y = 0.2 + entropy * 1.0;
        hex.material.opacity = 0.6 + entropy * 0.4;
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
  canvas.tabIndex = 0; // Make canvas focusable
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
      timer = setTimeout(() => (timer = null), ms);
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
      modules.initCharts();
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
  console.error('🔥 Fatal init error:', err);
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
