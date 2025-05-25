/* nexus.js – Unified Entry Point for Elvira Genesis-Elvira (v3.1) */
'use strict';

// Module Loader
class ModuleLoader {
  static RETRY_LIMIT = 3;
  static RETRY_DELAY = 1000;
  static TIMEOUT = 5000;

  static async load(url, moduleName) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    for (let i = 0; i < this.RETRY_LIMIT; i++) {
      try {
        console.debug(`Attempting to load module: ${url}, attempt ${i + 1}`);
        const module = await Promise.race([
          import(url, { signal: controller.signal }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Module load timeout')), this.TIMEOUT)
        ]);
        console.debug(`Successfully loaded module: ${url}`);
        return module;
      } catch (err) {
        console.warn(`Failed to load ${url} on attempt ${i + 1}: ${err.message}`);
        if (i === this.RETRY_LIMIT - 1) {
          console.error(`Exhausted retries for ${moduleName}`);
          return null;
        }
        await new Promise(r => setTimeout(r, this.RETRY_DELAY * (i + 1)));
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }
}

// State Management
class AppState {
  constructor() {
    this.llmCallCount = 0;
    this.animations = new Map();
    this.cleanupHandlers = new Set();
  }

  trackAnimation(id, callback) {
    const frameId = requestAnimationFrame(function animate(t) {
      callback(t);
      this.animations.set(id, requestAnimationFrame(animate.bind(this)));
    }.bind(this));
    this.animations.set(id, frameId);
  }

  cancelAnimation(id) {
    if (this.animations.has(id)) {
      cancelAnimationFrame(this.animations.get(id));
      this.animations.delete(id);
    }
  }

  addCleanup(fn) {
    this.cleanupHandlers.add(fn);
  }

  cleanup() {
    this.animations.forEach((_, id) => this.cancelAnimation(id));
    this.cleanupHandlers.forEach(fn => fn());
  }
}

// WebGL Context Manager
class WebGLManager {
  static async createContext(container, { alpha = true, antialias = true } = {}) {
    const canvas = document.createElement('canvas');
    const attributes = { 
      alpha, 
      antialias,
      desynchronized: true,
      powerPreference: 'high-performance'
    };

    try {
      const gl = canvas.getContext('webgl2', attributes) || 
                 canvas.getContext('webgl', attributes);
      if (!gl) throw new Error('WebGL unavailable');
      container.appendChild(canvas);
      return {
        canvas,
        gl,
        resize: (width, height) => {
          canvas.width = width * devicePixelRatio;
          canvas.height = height * devicePixelRatio;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          gl.viewport(0, 0, canvas.width, canvas.height);
        }
      };
    } catch (err) {
      console.error('WebGL initialization failed:', err);
      return this.create2DFallback(container);
    }
  }

  static create2DFallback(container) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    container.appendChild(canvas);
    return {
      canvas,
      ctx,
      resize: (width, height) => {
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    };
  }
}

// Performance Manager
class PerformanceManager {
  static TARGET_FPS = 60;
  static #instance;

  constructor() {
    this.lastFrameTime = 0;
    this.frameTimes = [];
    this.qualityLevel = 1.0;
  }

  static getInstance() {
    if (!this.#instance) this.#instance = new PerformanceManager();
    return this.#instance;
  }

  monitor() {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avgDelta = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const currentFPS = 1000 / avgDelta;
    if (currentFPS < this.constructor.TARGET_FPS * 0.9) {
      this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
    } else if (currentFPS > this.constructor.TARGET_FPS * 1.1) {
      this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
    }
    this.lastFrameTime = now;
    return this.qualityLevel;
  }
}

// Neural Background
class NeuralBackground {
  #context;
  #performanceManager = PerformanceManager.getInstance();
  #particles = [];
  #edges = [];
  #scene;
  #camera;
  #renderer;
  #composer;

  constructor(container) {
    this.container = container;
    this.prefersRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isMobile = window.innerWidth <= 768;
    this.DPR = Math.min(devicePixelRatio, this.isMobile ? 1.5 : 2);
  }

  async init() {
    if (!this.container) {
      console.error('Neural background container not found');
      return;
    }
    if (!this.prefersRM) {
      await this.#initWebGL();
    } else {
      this.#init2DFallback();
    }
  }

  async #initWebGL() {
    try {
      console.debug('Loading Three.js & postprocessing...');
      const [
        { default: THREE },
        { EffectComposer },
        { RenderPass },
        { UnrealBloomPass },
        { SSAOPass },
        { BokehPass }
      ] = await Promise.all([
        import('three'),
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/SSAOPass.js'),
        import('three/addons/postprocessing/BokehPass.js')
      ]);

      this.#renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.#renderer.setPixelRatio(this.DPR);
      this.#renderer.setSize(innerWidth, innerHeight);
      this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.#renderer.toneMappingExposure = 1.0;
      this.container.appendChild(this.#renderer.domElement);

      this.#scene = new THREE.Scene();
      this.#camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
      this.#camera.position.z = 35;

      this.#scene.add(new THREE.AmbientLight(0x404040, 0.8));
      const pl = new THREE.PointLight(0x6be2eb, 2.5, 40);
      pl.position.set(10, 10, 10);
      this.#scene.add(pl);
      const dl = new THREE.DirectionalLight(0xb39ddb, 0.5);
      dl.position.set(0, 15, 15);
      this.#scene.add(dl);

      this.#composer = new EffectComposer(this.#renderer);
      this.#composer.addPass(new RenderPass(this.#scene, this.#camera));
      this.#composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.5, 0.8));
      this.#composer.addPass(new SSAOPass(this.#scene, this.#camera, innerWidth, innerHeight, 1.5, 0.8));
      this.#composer.addPass(new BokehPass(this.#scene, this.#camera, { focus: 35, aperture: 0.025, maxblur: 1.5 }));

      this.#initParticles();
      this.#initEdges();
      this.#initGradientPlane();
      this.#animate(0);

      const onResize = () => {
        this.#renderer.setSize(innerWidth, innerHeight);
        this.#composer.setSize(innerWidth, innerHeight);
        this.#camera.aspect = innerWidth / innerHeight;
        this.#camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);
      appState.addCleanup(() => window.removeEventListener('resize', onResize));
      appState.addCleanup(() => {
        this.#renderer.dispose();
        this.#renderer.forceContextLoss();
        if (this.container.contains(this.#renderer.domElement)) {
          this.container.removeChild(this.#renderer.domElement);
        }
      });
    } catch (err) {
      console.error('WebGL failed, fallback2D:', err);
      this.#init2DFallback();
    }
  }

  #init2DFallback() {
    console.debug('Using 2D canvas fallback');
    const area = innerWidth * innerHeight;
    const N = Math.max(100, Math.min(600, Math.floor(area / 50_000)));
    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'neural-bg-fallback',
      'aria-label': 'Fallback neural network'
    });
    this.container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    this.#particles = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 1.0,
      vy: (Math.random() - 0.5) * 1.0,
      pulse: Math.random() * 2 * Math.PI,
      size: 4 + Math.random() * 4
    }));
    this.#edges = Array.from({ length: N * 2 }, () => {
      let s = Math.floor(Math.random() * N), t;
      do t = Math.floor(Math.random() * N); while (t === s);
      return { s, t, pulse: Math.random() * 2 * Math.PI };
    });

    const draw = (t) => {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;

      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, 'rgba(107,226,235,0.2)');
      grad.addColorStop(0.5, 'rgba(107,226,235,0.2)');
      grad.addColorStop(1, 'rgba(179,157,219,0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.2;
      this.#edges.forEach(e => {
        const a = this.#particles[e.s], b = this.#particles[e.t];
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

      this.#particles.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.06;
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

      if (!this.prefersRM) appState.trackAnimation('neural-bg-2d', draw);
    };

    const onRes = () => {
      appState.cancelAnimation('neural-bg-2d');
      draw(0);
    };
    window.addEventListener('resize', onRes);
    appState.addCleanup(() => window.removeEventListener('resize', onRes));
    draw(0);
  }

  #initParticles() {
    const NODE_COUNT = this.isMobile ? 300 : 600;
    const clusters = 6;
    this.#particles = Array.from({ length: NODE_COUNT }, () => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 15),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.04),
      cluster: Math.floor(Math.random() * clusters),
      pulse: Math.random() * 2 * Math.PI,
      rotation: Math.random() * 2 * Math.PI,
      size: 6 + Math.random() * 4
    }));

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
          a *= (0.9 + 0.1 * rand(gl_PointCoord + vPos.xy));
          gl_FragColor = vec4(0.42, 0.89, 0.92, a * fade); // #6be2eb
        }`,
      transparent: true
    });
    const points = new THREE.Points(nodeGeo, nodeMat);
    this.#scene.add(points);
    this.#particleGeometry = nodeGeo;
    this.#particleAttributes = { posArr, pulseArr, rotArr, sizeArr };
  }

  #initEdges() {
    const EDGE_COUNT = this.#particles.length * 2;
    this.#edges = Array.from({ length: EDGE_COUNT }, () => {
      let s = Math.floor(Math.random() * this.#particles.length), t;
      do t = Math.floor(Math.random() * this.#particles.length); while (t === s);
      return { s, t, pulse: Math.random() * 2 * Math.PI };
    });

    const edgeArr = new Float32Array(EDGE_COUNT * 6);
    const edgePulseArr = new Float32Array(EDGE_COUNT);
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
      transparent: true
    });
    const lines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.#scene.add(lines);
    this.#edgeGeometry = edgeGeo;
    this.#edgeAttributes = { edgeArr, edgePulseArr };
  }

  #initGradientPlane() {
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
          vec3 c = mix(vec3(0.94, 0.97, 1.0), vec3(0.70, 0.61, 0.86), uv.y); // #b39ddb
          float noise = perlin(uv * 10.0 + time * 0.001);
          c += noise * 0.02;
          gl_FragColor = vec4(c, 0.4);
        }`,
      transparent: true,
      uniforms: { time: { value: 0 } }
    });
    const gradMesh = new THREE.Mesh(gradGeo, gradMat);
    gradMesh.position.z = -12;
    this.#scene.add(gradMesh);
    this.#gradientMaterial = gradMat;
  }

  #animate(t) {
    const quality = this.#performanceManager.monitor();
    const { posArr, pulseArr, rotArr, sizeArr } = this.#particleAttributes;
    const { edgeArr, edgePulseArr } = this.#edgeAttributes;

    this.#particles.forEach((n, i) => {
      posArr.set([n.pos.x, n.pos.y, n.pos.z], i * 3);
      pulseArr[i] = n.pulse;
      rotArr[i] = n.rotation;
      sizeArr[i] = n.size;
    });
    this.#particleGeometry.attributes.position.needsUpdate = true;
    this.#particleGeometry.attributes.pulse.needsUpdate = true;
    this.#particleGeometry.attributes.rotation.needsUpdate = true;
    this.#particleGeometry.attributes.size.needsUpdate = true;

    this.#edges.forEach((e, i) => {
      const a = this.#particles[e.s].pos, b = this.#particles[e.t].pos;
      edgeArr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      edgePulseArr[i] = e.pulse;
    });
    this.#edgeGeometry.attributes.position.needsUpdate = true;
    this.#edgeGeometry.attributes.pulse.needsUpdate = true;

    this.#particles.forEach(n => {
      n.pos.add(n.vel.clone().multiplyScalar(quality));
      n.pulse += 0.08 * quality;
      ['x', 'y', 'z'].forEach(ax => {
        const lim = ax === 'z' ? 15 : 30;
        if (Math.abs(n.pos[ax]) > lim) n.vel[ax] *= -1;
      });
      const center = new THREE.Vector3();
      let cnt = 0;
      this.#particles.forEach(o => {
        if (o.cluster === n.cluster) {
          center.add(o.pos);
          cnt++;
        }
      });
      if (cnt) {
        center.divideScalar(cnt);
        n.vel.add(center.sub(n.pos).multiplyScalar(0.002 * quality));
      }
    });
    this.#edges.forEach(e => e.pulse += 0.04 * quality);
    this.#gradientMaterial.uniforms.time.value = t * 0.001;
    this.#camera.position.x = Math.sin(t * 0.00015) * 5;
    this.#camera.position.y = Math.cos(t * 0.00012) * 4;
    this.#camera.lookAt(0, 0, 0);

    this.#composer.render();
    if (!this.prefersRM) appState.trackAnimation('neural-bg', this.#animate.bind(this));
  }

  destroy() {
    appState.cancelAnimation('neural-bg');
    appState.cancelAnimation('neural-bg-2d');
    if (this.#renderer) {
      this.#renderer.dispose();
      this.#renderer.forceContextLoss();
      if (this.container.contains(this.#renderer.domElement)) {
        this.container.removeChild(this.#renderer.domElement);
      }
    }
  }
}

// Auth Flow for Intro and Terms
class AuthFlow {
  constructor() {
    this.initLoader();
    this.playIntro();
  }

  initLoader() {
    window.addEventListener('load', () => {
      const loader = document.getElementById('quantum-loader');
      const loadingOverlay = document.getElementById('loading');
      if (loader) loader.remove();
      if (loadingOverlay) loadingOverlay.remove();
    });
  }

  playIntro() {
    const intro = document.getElementById('intro-sequence');
    if (!intro) return;
    const letters = document.querySelectorAll('.logo-particle');
    letters.forEach((letter, i) => {
      anime({
        targets: letter,
        opacity: [0, 1],
        translateY: [20, 0],
        delay: i * 80,
        duration: 1200,
        easing: 'easeOutExpo'
      });
    });
    anime({
      targets: intro,
      opacity: [1, 0],
      delay: 4500,
      duration: 1000,
      easing: 'easeInOutQuad',
      complete: () => {
        intro.remove();
        this.showTerms();
      }
    });
  }

  showTerms() {
    const authFlow = document.getElementById('auth-flow');
    const termsModal = authFlow.querySelector('.terms-modal');
    if (!authFlow || !termsModal) return;
    authFlow.style.display = 'grid';
    anime({
      targets: termsModal,
      scale: [0.9, 1],
      opacity: [0, 1],
      duration: 800,
      easing: 'easeOutBack'
    });
    document.querySelector('.accept-terms').addEventListener('click', () => {
      anime({
        targets: authFlow,
        opacity: 0,
        duration: 800,
        easing: 'easeInOutQuad',
        complete: () => authFlow.remove()
      });
    });
  }
}

// Core Initialization
const appState = new AppState();

async function initCoreModules() {
  try {
    const modules = await Promise.allSettled([
      ModuleLoader.load('/theme-toggle.js', 'theme-toggle').then(m => ({ initThemeToggle: m?.initThemeToggle })),
      ModuleLoader.load('/llm.js', 'llm').then(m => ({ initLLM: m?.initLLM })),
      ModuleLoader.load('/charts.js', 'charts').then(m => ({ initCharts: m?.initCharts })),
      ModuleLoader.load('/accordion.js', 'accordion').then(m => ({ initAccordion: m?.initAccordion }))
    ]);

    const loadedModules = modules.reduce((acc, result, index) => {
      const name = ['theme-toggle', 'llm', 'charts', 'accordion'][index];
      if (result.status === 'fulfilled' && result.value) {
        return { ...acc, ...result.value };
      }
      console.warn(`Module ${name} failed to load`);
      return acc;
    }, {});

    return loadedModules;
  } catch (err) {
    console.error('Critical module initialization error:', err);
    throw err;
  }
}

// Elvira Avatar
async function initElviraAvatar() {
  const toggleBtn = document.querySelector('.avatar-toggle');
  const panel = document.getElementById('avatar-panel');
  const video = document.getElementById('avatar-video');
  const overlay = document.getElementById('avatar-overlay');
  if (!toggleBtn || !panel || !video || !overlay) {
    console.warn('Avatar elements missing');
    return;
  }

  let stream = null;
  const ctx = overlay.getContext('2d');

  const drawOverlay = (t) => {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = `rgba(107, 226, 235, ${0.5 + 0.3 * Math.sin(t * 0.002)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(overlay.width / 2, overlay.height / 2, 50, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.font = '20px Sora';
    ctx.fillStyle = '#6be2eb';
    ctx.fillText('Elvira AI', overlay.width / 2 - 30, overlay.height / 2 + 70);
    if (!panel.classList.contains('hidden')) {
      appState.trackAnimation('avatar-overlay', drawOverlay);
    }
  };

  const handleToggleAvatar = async () => {
    console.debug('Toggling Elvira Avatar');
    if (panel.classList.contains('hidden')) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          drawOverlay(0);
        };
        panel.classList.remove('hidden');
        toggleBtn.textContent = 'Deactivate Avatar';
      } catch (err) {
        console.error('Camera access failed:', err);
        alert('Failed to access camera. Please grant permission.');
      }
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      panel.classList.add('hidden');
      toggleBtn.textContent = 'Activate Avatar';
      appState.cancelAnimation('avatar-overlay');
    }
  };

  toggleBtn.addEventListener('click', handleToggleAvatar);

  appState.addCleanup(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    toggleBtn.removeEventListener('click', handleToggleAvatar);
  });
}

// Hex Visualizer
async function initHexVisualizer() {
  const container = document.getElementById('hex-visualizer');
  if (!container) return console.warn('Hex container not found');

  const prefersRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersRM) {
    container.innerHTML = '<p>WebGL disabled by preference.</p>';
    return;
  }

  try {
    const [{ default: THREE }, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js')
    ]);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(this.isMobile ? 1.2 : 1.5);
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

    const hexGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
    const hexMat = new THREE.MeshPhongMaterial({
      color: 0x6be2eb,
      transparent: true,
      opacity: 0.8,
      emissive: 0x4f8dfd,
      emissiveIntensity: 0.3
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
      appState.trackAnimation('hex-visualizer', animateHex);
    };

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    appState.addCleanup(() => {
      window.removeEventListener('resize', onResize);
      appState.cancelAnimation('hex-visualizer');
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    });

    animateHex(0);
  } catch (err) {
    console.error('Hex visualizer error:', err);
    container.innerHTML = '<p>Failed to load hex visualizer.</p>';
  }
}

// Timeline Viewer
function initTimelineViewer() {
  const container = document.getElementById('timeline-viewer');
  if (!container) return console.warn('Timeline viewer container not found');

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Timeline viewer for attack sequences');
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const events = [
    { time: '2025-05-01', label: 'Initial Breach' },
    { time: '2025-05-02', label: 'Lateral Movement' },
    { time: '2025-05-03', label: 'Data Exfiltration' },
    { time: '2025-05-04', label: 'Containment' }
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
      ctx.fillStyle = '#6be2eb';
      ctx.fill();
      ctx.font = '14px Sora';
      ctx.fillStyle = '#0c0d10';
      ctx.fillText(event.label, x - 30, h / 2 - 20);
      ctx.fillText(event.time, x - 30, h / 2 + 30);
    });

    appState.trackAnimation('timeline-viewer', draw);
  };

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * devicePixelRatio;
    const w = rect.width * devicePixelRatio;
    events.forEach((event, i) => {
      const ex = w * (0.1 + (i / (events.length - 1)) * 0.8);
      if (Math.abs(x - ex) < 20) {
        selectedEvent = i;
      }
    });
    draw();
  });

  const onResize = () => {
    appState.cancelAnimation('timeline-viewer');
    draw();
  };
  window.addEventListener('resize', onResize);
  appState.addCleanup(() => {
    window.removeEventListener('resize', onResize);
    appState.cancelAnimation('timeline-viewer');
    if (container.contains(canvas)) {
      container.removeChild(canvas);
    }
  });

  draw();
}

// Scroll Spy
function initScrollSpy() {
  const links = document.querySelectorAll('.nav-links a');
  const sections = Array.from(links).map(link => document.querySelector(link.getAttribute('href')));
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${entry.target.id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, { threshold: 0.5 });

  sections.forEach(section => observer.observe(section));
  appState.addCleanup(() => observer.disconnect());
}

// Consent Popup
function initConsentPopup() {
  const popup = document.getElementById('consent-popup');
  if (!popup) return;

  if (!localStorage.getItem('consent')) {
    popup.classList.remove('hidden');
  }

  document.querySelector('.consent-accept').addEventListener('click', () => {
    localStorage.setItem('consent', 'accepted');
    popup.classList.add('hidden');
  });

  document.querySelector('.consent-decline').addEventListener('click', () => {
    localStorage.setItem('consent', 'declined');
    popup.classList.add('hidden');
  });
}

// Dev Panel
function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
      panel.classList.toggle('hidden');
    }
    if (e.altKey && e.key === '/') {
      document.body.dataset.theme = document.body.dataset.theme === 'high-contrast' ? 'frost' : 'high-contrast';
    }
  });
}

// Snapshot Export
function initSnapshotExport() {
  const snapshotBtn = document.querySelector('.snapshot-button');
  if (!snapshotBtn) return;

  snapshotBtn.addEventListener('click', () => {
    const data = {
      timestamp: new Date().toISOString(),
      page: window.location.hash,
      theme: document.body.dataset.theme
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Accessibility Enhancements
function initAccessibility() {
  document.documentElement.lang = 'en';
  document.documentElement.setAttribute('role', 'document');
  const skipLink = document.createElement('a');
  skipLink.href = '#main';
  skipLink.textContent = 'Skip to main content';
  skipLink.classList.add('skip-link');
  document.body.prepend(skipLink);

  document.querySelectorAll('[data-scroll]').forEach(el => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.setAttribute('data-scroll', 'in');
      }
    }, { threshold: 0.1 });
    observer.observe(el);
    appState.addCleanup(() => observer.disconnect());
  });
}

// Performance Monitoring
function initPerformanceMonitoring() {
  const perfObserver = new PerformanceObserver(list => {
    const entries = list.getEntries();
    console.debug('Performance metrics:', entries);
  });
  perfObserver.observe({ entryTypes: ['measure', 'resource', 'navigation'] });
}

// Error Handling
function handleFatalError(err) {
  console.error('Fatal application error:', err);
  document.getElementById('quantum-loader')?.remove();
  const errorDiv = document.createElement('div');
  errorDiv.className = 'critical-error';
  errorDiv.innerHTML = `
    <h2>System Error</h2>
    <p>${err.message}</p>
    <button onclick="window.location.reload()">Reload Application</button>
  `;
  document.body.prepend(errorDiv);
}

// Main Initialization Flow
async function initApplication() {
  try {
    const modules = await initCoreModules();
    const neuralBg = new NeuralBackground(document.getElementById('neural-bg'));
    await neuralBg.init();
    new AuthFlow();
    await initElviraAvatar();
    await initHexVisualizer();
    initTimelineViewer();

    if (modules.initThemeToggle) modules.initThemeToggle();
    if (modules.initCharts) {
      const chartsState = modules.initCharts();
      appState.addCleanup(chartsState.cleanup);
    }
    if (modules.initLLM) {
      const orig = modules.initLLM;
      modules.initLLM = async (...a) => { appState.llmCallCount++; return orig(...a); };
      modules.initLLM();
    }
    if (modules.initAccordion) modules.initAccordion(['#features']);

    initScrollSpy();
    initConsentPopup();
    initDevPanel();
    initSnapshotExport();
    initAccessibility();
    initPerformanceMonitoring();

    appState.addCleanup(() => neuralBg.destroy());
  } catch (err) {
    handleFatalError(err);
  }
}

// Boot Sequence
document.addEventListener('DOMContentLoaded', () => {
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  initApplication();
});

window.addEventListener('beforeunload', () => {
  appState.cleanup();
});

console.log('Aurora Core v3.1 initialized');
</xaiArtifact>

#### 4. charts.js
