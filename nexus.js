/* nexus.js – Unified Entry Point for Elvira Genesis-Elvira (Enhanced Full v2.1) */
'use strict';

// ——————————————————————————————————————————————————————————————
// Module imports with retry logic
// ——————————————————————————————————————————————————————————————
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
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
};

// Загрузи външни модули
const modules = await Promise.allSettled([
  loadModule('/theme-toggle.js').then(m => ({ initThemeToggle: m.initThemeToggle })),
  loadModule('/llm.js').then(m => ({ initLLM: m.initLLM })),
  loadModule('/charts.js').then(m => ({ initCharts: m.initCharts })),
  loadModule('/telemetry.js').then(m => ({ initTelemetry: m.initTelemetry })),
  loadModule('/accordion.js').then(m => ({ initAccordion: m.initAccordion })),
]).then(results => {
  const loaded = {};
  ['theme-toggle', 'llm', 'charts', 'telemetry', 'accordion'].forEach((name, i) => {
    if (results[i].status === 'fulfilled') {
      Object.assign(loaded, results[i].value);
      console.debug(`Module ${name} loaded successfully`);
    } else {
      console.warn(`Module ${name} failed: ${results[i].reason}`);
    }
  });
  return loaded;
}).catch(err => {
  console.error('Critical module import error:', err);
  return {};
});

// ——————————————————————————————————————————————————————————————
// DOM helpers, media queries и състояние
// ——————————————————————————————————————————————————————————————
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
let DPR = Math.min(devicePixelRatio, isMobile ? 1.5 : 2);
const state = {
  llmCallCount: 0,
  animationFrameId: null,
  hexFrameId: null,
  cleanup: new Set(),
};

// ——————————————————————————————————————————————————————————————
// Adaptive Resolution Scaling функция
// ——————————————————————————————————————————————————————————————
function adaptResolution(renderer, composer, camera) {
  let lastFPS = 60, frames = 0, lastTime = performance.now();
  const measure = t => {
    frames++;
    if (t - lastTime >= 1000) {
      lastFPS = frames;
      frames = 0;
      lastTime = t;
      if (lastFPS > 65 && DPR < 2.5) DPR = +(DPR + 0.1).toFixed(2);
      else if (lastFPS < 55 && DPR > 1) DPR = +(DPR - 0.1).toFixed(2);
      renderer.setPixelRatio(DPR);
      composer.setSize(innerWidth, innerHeight);
      camera.updateProjectionMatrix();
      console.debug(`Adaptive DPR=${DPR}, FPS=${lastFPS}`);
    }
    requestAnimationFrame(measure);
  };
  requestAnimationFrame(measure);
}

// ——————————————————————————————————————————————————————————————
// WebGL Support Check
// ——————————————————————————————————————————————————————————————
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

// ——————————————————————————————————————————————————————————————
// initNeuralBackground – пълна версия
// ——————————————————————————————————————————————————————————————
async function initNeuralBackground() {
  const host = $('#neural-bg');
  if (!host) return console.error('Neural background container not found');

  console.debug('Initializing neural background...');
  const area = innerWidth * innerHeight;

  // 2D fallback
  const fallback2D = () => {
    console.debug('Using 2D canvas fallback');
    const N = Math.max(100, Math.min(600, Math.floor(area / 50_000)));
    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'neural-bg-fallback',
      'aria-label': 'Fallback neural network',
    });
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 1.0,
      vy: (Math.random() - 0.5) * 1.0,
      pulse: Math.random() * 2 * Math.PI,
      size: 4 + Math.random() * 4,
    }));
    const edges = Array.from({ length: N * 2 }, () => {
      let s = Math.floor(Math.random() * N), t;
      do t = Math.floor(Math.random() * N); while (t === s);
      return { s, t, pulse: Math.random() * 2 * Math.PI };
    });

    function draw(t) {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;

      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      // Градиент фон
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(107,226,235,0.2)');
      grad.addColorStop(0.5, 'rgba(107,226,235,0.2)');
      grad.addColorStop(1, 'rgba(179,157,219,0.2)'); // Pastel purple
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.2;
      edges.forEach(e => {
        const a = nodes[e.s], b = nodes[e.t];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 300) {
          e.pulse += 0.04;
          ctx.strokeStyle = `rgba(107,226,235,${(0.2 + 0.3 * Math.sin(e.pulse)) * (1 - d / 300)})`;
          ctx.beginPath();
          ctx.moveTo(a.x * devicePixelRatio, a.y * devicePixelRatio);
          ctx.lineTo(b.x * devicePixelRatio, b.y * devicePixelRatio);
          ctx.stroke();
        }
      });

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.06;
        if (n.x < 0 || n.x > innerWidth) n.vx *= -1;
        if (n.y < 0 || n.y > innerHeight) n.vy *= -1;
        ctx.beginPath();
        ctx.arc(n.x * devicePixelRatio, n.y * devicePixelRatio,
                n.size * (1 + 0.3 * Math.sin(n.pulse)), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(107,226,235,0.9)';
        ctx.shadowColor = '#6be2eb';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      if (!prefersRM) state.animationFrameId = requestAnimationFrame(draw);
    }

    const onRes = () => {
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      draw(0);
    };
    window.addEventListener('resize', onRes);
    state.cleanup.add(() => window.removeEventListener('resize', onRes));
    draw(0);
  };

  if (!webglSupported || prefersRM) {
    console.log('WebGL not supported or reduced motion → fallback2D');
    return fallback2D();
  }

  // WebGL path
  try {
    console.debug('Loading Three.js & postprocessing...');
    const [
      { default: THREE },
      { EffectComposer },
      { RenderPass },
      { UnrealBloomPass },
      { SSAOPass },
      { MotionBlurPass },
      { ToneMappingPass }
    ] = await Promise.all([
      import('three'),
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import('three/examples/jsm/postprocessing/SSAOPass.js'),
      import('three/examples/jsm/postprocessing/MotionBlurPass.js'),
      import('three/examples/jsm/postprocessing/ToneMappingPass.js'),
    ]);

    // Renderer & Scene
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(DPR);
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.z = 35;

    // Lights
    scene.add(new THREE.AmbientLight(0x404040, 0.8));
    const pl = new THREE.PointLight(0x6be2eb, 2.5, 40);
    pl.position.set(10, 10, 10); scene.add(pl);
    const dl = new THREE.DirectionalLight(0xb39ddb, 0.5);
    dl.position.set(0, 15, 15); scene.add(dl);

    // Composer & Passes
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.5, 0.8));
    composer.addPass(new SSAOPass(scene, camera, innerWidth, innerHeight, 1.5, 0.8));
    composer.addPass(new MotionBlurPass(scene, camera));
    composer.addPass(new ToneMappingPass(THREE.ACESFilmicToneMapping, 1.0));

    // Adaptive scaling
    adaptResolution(renderer, composer, camera);

    // Create nodes & edges
    const NODE_COUNT = isMobile ? 300 : 600;
    const clusters = 6;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 15),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.04),
      cluster: Math.floor(Math.random() * clusters),
      pulse: Math.random() * 2 * Math.PI,
      rotation: Math.random() * 2 * Math.PI,
      size: 6 + Math.random() * 4,
    }));
    const edges = Array.from({ length: NODE_COUNT * 2 }, () => {
      let s = Math.floor(Math.random() * NODE_COUNT), t;
      do t = Math.floor(Math.random() * NODE_COUNT); while (t === s);
      return { s, t, pulse: Math.random() * 2 * Math.PI };
    });

    // BufferGeometry & Shaders for nodes
    const posArr = new Float32Array(NODE_COUNT * 3);
    const pulseArr = new Float32Array(NODE_COUNT);
    const rotArr = new Float32Array(NODE_COUNT);
    const sizeArr = new Float32Array(NODE_COUNT);
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    nodeGeo.setAttribute('pulse', new THREE.BufferAttribute(pulseArr, 1));
    nodeGeo.setAttribute('rotation', new THREE.BufferAttribute(rotArr, 1));
    nodeGeo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));

    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float pulse;
        attribute float rotation;
        attribute float size;
        varying float vPulse;
        varying vec3 vPos;
        void main(){
          vPulse = pulse;
          vPos = position;
          gl_PointSize = size * (1.0 + 0.5 * sin(pulse));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vPulse;
        varying vec3 vPos;
        float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if(d > 0.5) discard;
          float a = smoothstep(0.5, 0.2, d) * (0.8 + 0.4 * sin(vPulse));
          float fade = 1.0 - abs(vPos.z / 15.0);
          a *= (0.9 + 0.1 * rand(gl_PointCoord + vPos.xy)); // Blue noise
          gl_FragColor = vec4(0.42, 0.89, 0.92, a * fade); // #6be2eb
        }`,
      transparent: true,
    });
    const points = new THREE.Points(nodeGeo, nodeMat);
    scene.add(points);

    // BufferGeometry & Shaders за edges
    const edgeArr = new Float32Array(edges.length * 6);
    const edgePulseArr = new Float32Array(edges.length);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
    edgeGeo.setAttribute('pulse', new THREE.BufferAttribute(edgePulseArr, 1));

    const edgeMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float pulse;
        varying float vPulse;
        varying vec3 vPos;
        void main(){
          vPulse = pulse;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vPulse;
        varying vec3 vPos;
        void main(){
          float f = 1.0 - abs(vPos.z / 15.0);
          float alpha = 0.3 + 0.3 * sin(vPulse);
          gl_FragColor = vec4(0.42, 0.89, 0.92, alpha * f); // #6be2eb
        }`,
      transparent: true,
    });
    const lines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(lines);

    // Gradient plane зад всичко
    const gradGeo = new THREE.PlaneGeometry(40, 40);
    const gradMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        float perlin(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        void main(){
          vec2 uv = vUv;
          vec3 c = mix(vec3(0.94, 0.97, 1.0), vec3(0.42, 0.89, 0.92), uv.y);
          float noise = perlin(uv * 10.0 + time * 0.001);
          c += noise * 0.02;
          gl_FragColor = vec4(c, 0.4);
        }`,
      transparent: true,
      uniforms: { time: { value: 0 } },
    });
    const gradMesh = new THREE.Mesh(gradGeo, gradMat);
    gradMesh.position.z = -12;
    scene.add(gradMesh);

    // Основен анимационен loop
    let last = 0;
    function animate(t) {
      if (t - last > 16) {
        nodes.forEach((n, i) => {
          posArr.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
          pulseArr[i] = n.pulse;
          rotArr[i] = n.rotation;
          sizeArr[i] = n.size;
        });
        nodeGeo.attributes.position.needsUpdate = true;
        nodeGeo.attributes.pulse.needsUpdate = true;
        nodeGeo.attributes.rotation.needsUpdate = true;
        nodeGeo.attributes.size.needsUpdate = true;

        edges.forEach((e, i) => {
          const a = nodes[e.s].pos, b = nodes[e.t].pos;
          edgeArr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
          edgePulseArr[i] = e.pulse;
        });
        edgeGeo.attributes.position.needsUpdate = true;
        edgeGeo.attributes.pulse.needsUpdate = true;

        nodes.forEach(n => {
          n.pos.add(n.vel);
          n.pulse += 0.08;
          ['x', 'y', 'z'].forEach(ax => {
            const lim = ax === 'z' ? 15 : 30;
            if (Math.abs(n.pos[ax]) > lim) n.vel[ax] *= -1;
          });
          const center = new THREE.Vector3();
          let cnt = 0;
          nodes.forEach(o => {
            if (o.cluster === n.cluster) {
              center.add(o.pos); cnt++;
            }
          });
          if (cnt) {
            center.divideScalar(cnt);
            n.vel.add(center.sub(n.pos).multiplyScalar(0.002));
          }
        });
        edges.forEach(e => e.pulse += 0.04);
        gradMat.uniforms.time.value = t * 0.001;
        camera.position.x = Math.sin(t * 0.00015) * 5;
        camera.position.y = Math.cos(t * 0.00012) * 4;
        camera.lookAt(0, 0, 0);

        composer.render();
        last = t;
      }
      if (!prefersRM) state.animationFrameId = requestAnimationFrame(animate);
    }
    const onResize = () => {
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    state.cleanup.add(() => window.removeEventListener('resize', onResize));
    animate(0);

    state.cleanup.add(() => {
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    });
  } catch (err) {
    console.error('WebGL failed, fallback2D:', err);
    fallback2D();
  }
}

// ——————————————————————————————————————————————————————————————
// initHexVisualizer
// ——————————————————————————————————————————————————————————————
async function initHexVisualizer() {
  const container = $('#hex-visualizer');
  if (!container) return console.warn('Hex container not found');
  if (!webglSupported || prefersRM) {
    container.innerHTML = '<p aria-live="polite">WebGL disabled by preference or not supported.</p>';
    return;
  }
  try {
    console.debug('Loading Three.js & OrbitControls...');
    const [{ default: THREE }, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
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
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.enableZoom = true; controls.minDistance = 5; controls.maxDistance = 20;

    const hexGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
    const hexMat = new THREE.MeshPhongMaterial({
      color: 0x6be2eb, transparent: true, opacity: 0.8,
      emissive: 0xb39ddb, emissiveIntensity: 0.3,
    });
    const grid = new THREE.Group();
    const size = 8;
    for (let x = -size; x <= size; x++) {
      for (let y = -size; y <= size; y++) {
        const hex = new THREE.Mesh(hexGeo, hexMat);
        hex.position.set(x + (y % 2 ? 0.5 : 0), 0, y * 0.866);
        grid.add(hex);
      }
    }
    scene.add(grid);
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    scene.add(new THREE.AmbientLight(0x404040, 0.8));

    const animateHex = t => {
      grid.children.forEach(hex => {
        const e = Math.sin(t * 0.001 + hex.position.x + hex.position.z) * 0.5 + 0.5;
        hex.scale.y = 0.2 + e * 1.2;
        hex.material.opacity = 0.6 + e * 0.4;
        hex.rotation.y += 0.01 * e;
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
    animateHex(0);
  } catch (err) {
    console.error('Hex visualizer error:', err);
    container.innerHTML = '<p aria-live="polite">Failed to load hex visualizer.</p>';
  }
}

// ——————————————————————————————————————————————————————————————
// initTimelineViewer
// ——————————————————————————————————————————————————————————————
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

    ctx.strokeStyle = '#6be2eb';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h / 2);
    ctx.lineTo(w * 0.9, h / 2);
    ctx.stroke();

    events.forEach((event, i) => {
      const x = w * (0.1 + (i / (events.length - 1)) * 0.8);
      ctx.beginPath();
      ctx.arc(x, h / 2, selectedEvent === i ? 8 : 6, 0, 2 * Math.PI);
      ctx.fillStyle = selectedEvent === i ? '#a8c6e5' : '#6be2eb';
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
      ctx.fillStyle = 'rgba(107, 226, 235, 0.9)';
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

// ——————————————————————————————————————————————————————————————
// initScrollSpy
// ——————————————————————————————————————————————————————————————
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

// ——————————————————————————————————————————————————————————————
// initConsent
// ——————————————————————————————————————————————————————————————
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

// ——————————————————————————————————————————————————————————————
// initDevPanel
// ——————————————————————————————————————————————————————————————
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

// ——————————————————————————————————————————————————————————————
// exportSnapshot
// ——————————————————————————————————————————————————————————————
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

// ——————————————————————————————————————————————————————————————
// Utilities
// ——————————————————————————————————————————————————————————————
function throttle(fn, ms) {
  let timer;
  return (...args) => {
    if (!timer) {
      fn(...args);
      timer = setTimeout(() => timer = null, ms);
    }
  };
}

// ——————————————————————————————————————————————————————————————
// initEverything и bootstrapping
// ——————————————————————————————————————————————————————————————
async function initEverything() {
  const loading = $('#loading');
  try {
    console.debug('DOM loaded, initializing...');
    if (loading) {
      console.debug('Hiding loading overlay...');
      await new Promise(r => setTimeout(r, 300));
      loading.classList.add('hidden'); loading.style.display = 'none';
    } else {
      console.warn('Loading overlay not found');
    }
    if (!$('main')) throw new Error('Main element missing');
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
    await initNeuralBackground();
    modules.initThemeToggle?.();
    initScrollSpy();
    modules.initCharts?.(state); // Pass state
    if (modules.initLLM) {
      const orig = modules.initLLM;
      modules.initLLM = async (...a) => { state.llmCallCount++; return orig(...a); };
      modules.initLLM();
    }
    modules.initTelemetry?.();
    modules.initAccordion?.(['#features']);
    initConsent();
    initDevPanel();
    initHexVisualizer();
    initTimelineViewer();
    const snapBtn = $('.snapshot-button');
    if (snapBtn) {
      console.debug('Binding snapshot button...');
      snapBtn.addEventListener('click', exportSnapshot);
      state.cleanup.add(() => snapBtn.removeEventListener('click', exportSnapshot));
    } else {
      console.warn('Snapshot button not found');
    }
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          console.debug(`Section visible: ${e.target.id}`);
        }
      });
    }, { threshold: 0.1 });
    $$('section').forEach(s => obs.observe(s));
    state.cleanup.add(() => obs.disconnect());
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
      loading.classList.add('hidden'); loading.style.display = 'none';
    }
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = 'Failed to load application. Contact support at ceo@aurora-core.net.';
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
    loading.classList.add('hidden'); loading.style.display = 'none';
  }
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = 'Fatal initialization error. Contact support at ceo@aurora-core.net.';
  document.body.appendChild(errorDiv);
}

console.log('nexus.js v2.1 loaded');
