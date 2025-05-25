/* nexus.js - Enhanced Core v3.1 */
'use strict';

// -------------------------------
// Centralized Module Logger
// -------------------------------
class ModuleLogger {
  constructor(wsUrl = null) {
    this.ws = null;
    if (wsUrl) this.initWebSocket(wsUrl);
  }

  initWebSocket(wsUrl) {
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => console.log('[ModuleLogger] WebSocket connected');
      this.ws.onerror = e => console.warn('[ModuleLogger] WebSocket error', e);
      this.ws.onclose = () => console.warn('[ModuleLogger] WebSocket closed');
    } catch (err) {
      console.warn('[ModuleLogger] WebSocket initialization failed:', err);
    }
  }

  log(event, data = {}) {
    const payload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...data
    });
    console.log('[ModuleLogger]', payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
      } catch (err) {
        console.warn('[ModuleLogger] Failed to send WebSocket message:', err);
      }
    }
  }
}

const moduleLogger = new ModuleLogger(); // Optional: 'ws://localhost:3030'

// -------------------------------
// Module Loader with Circuit Breaker
// -------------------------------
class ModuleLoader {
  static RETRY_LIMIT = 3;
  static RETRY_DELAY = 1000;
  static TIMEOUT = 5000;
  static circuitStates = new Map();
  static verbose = true; // Enable detailed logging

  static log(msg, ...args) {
    if (this.verbose) console.log(`[ModuleLoader] ${msg}`, ...args);
  }

  static async load(url, moduleName) {
    if (this.circuitStates.get(moduleName)?.isOpen) {
      this.log(`Circuit open for ${moduleName}, skipping load`);
      moduleLogger.log('circuit_open', { moduleName, url });
      return null;
    }

    if (!url.endsWith('.js')) {
      this.log(`Module ${url} might be blocked by MIME/CORS policy`);
      moduleLogger.log('invalid_mime', { moduleName, url });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const module = await Promise.race([
        import(url, { signal: controller.signal }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Module load timeout')), this.TIMEOUT))
      ]);
      
      this.circuitStates.set(moduleName, { failures: 0, isOpen: false });
      this.log(`Successfully loaded module: ${url}`);
      moduleLogger.log('module_loaded', { moduleName, url });
      return module;
    } catch (err) {
      this.log(`Module load failed: ${moduleName}`, err);
      moduleLogger.log('module_error', { moduleName, url, error: err.message });
      const state = this.circuitStates.get(moduleName) || { failures: 0 };
      state.failures++;
      
      if (state.failures >= this.RETRY_LIMIT) {
        state.isOpen = true;
        this.log(`Circuit breaker tripped for ${moduleName}`);
        moduleLogger.log('circuit_tripped', { moduleName, url });
        setTimeout(() => {
          state.isOpen = false;
          state.failures = 0;
          this.log(`Circuit breaker reset for ${moduleName}`);
          moduleLogger.log('circuit_reset', { moduleName, url });
        }, 30000);
      }
      
      this.circuitStates.set(moduleName, state);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// -------------------------------
// State Manager with Cleanup
// -------------------------------
class AppState {
  constructor() {
    this.llmCallCount = 0;
    this.animations = new Map();
    this.cleanupHandlers = new Set();
    this.resources = new FinalizationRegistry(url => {
      ModuleLoader.log(`Cleaning up resources for ${url}`);
      moduleLogger.log('resource_cleanup', { url });
    });
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

  async cleanup() {
    this.animations.forEach((_, id) => this.cancelAnimation(id));
    this.cleanupHandlers.forEach(fn => fn());
    this.resources.unregisterAll();
  }
}

// -------------------------------
// WebGL Context Manager
// -------------------------------
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
      ModuleLoader.log('WebGL context created successfully');
      moduleLogger.log('webgl_context_created', { container: container.id });
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
      ModuleLoader.log('WebGL initialization failed:', err);
      moduleLogger.log('webgl_init_error', { error: err.message });
      return this.create2DFallback(container);
    }
  }

  static create2DFallback(container) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    container.appendChild(canvas);
    
    ModuleLoader.log('2D canvas fallback created');
    moduleLogger.log('2d_fallback_created', { container: container.id });
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

// -------------------------------
// Performance Manager
// -------------------------------
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
    
    const avgDelta = this.frameTimes.reduce((a,b) => a + b, 0) / this.frameTimes.length;
    const currentFPS = 1000 / avgDelta;

    if (currentFPS < this.constructor.TARGET_FPS * 0.9) {
      this.qualityLevel = Math.max(0.5, this.qualityLevel - 0.1);
      ModuleLoader.log(`FPS dropped to ${currentFPS.toFixed(1)}, reducing quality to ${this.qualityLevel.toFixed(2)}`);
      moduleLogger.log('fps_drop', { fps: currentFPS, quality: this.qualityLevel });
    } else if (currentFPS > this.constructor.TARGET_FPS * 1.1) {
      this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.1);
      ModuleLoader.log(`FPS increased to ${currentFPS.toFixed(1)}, increasing quality to ${this.qualityLevel.toFixed(2)}`);
      moduleLogger.log('fps_increase', { fps: currentFPS, quality: this.qualityLevel });
    }

    this.lastFrameTime = now;
    return this.qualityLevel;
  }
}

// -------------------------------
// Neural Background
// -------------------------------
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
      ModuleLoader.log('Neural background container not found');
      moduleLogger.log('neural_bg_error', { error: 'Container not found' });
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
      ModuleLoader.log('Loading Three.js & postprocessing...');
      moduleLogger.log('loading_threejs', {});
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
      pl.position.set(10, 10, 10); this.#scene.add(pl);
      const dl = new THREE.DirectionalLight(0xb39ddb, 0.5);
      dl.position.set(0, 15, 15); this.#scene.add(dl);

      this.#composer = new EffectComposer(this.#renderer);
      this.#composer.addPass(new RenderPass(this.#scene, this.#camera));
      this.#composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.5, 0.8));
      this.#composer.addPass(new SSAOPass(this.#scene, this.#camera, innerWidth, innerHeight, 1.5, 0.8));
      this.#composer.addPass(new MotionBlurPass(this.#scene, this.#camera));
      this.#composer.addPass(new ToneMappingPass(THREE.ACESFilmicToneMapping, 1.0));

      this.#initParticles();
      this.#initEdges();
      this.#initGradientPlane();
      this.#animate(0);

      const onResize = () => {
        this.#renderer.setSize(innerWidth, innerHeight);
        this.#composer.setSize(innerWidth, innerHeight);
        this.#camera.aspect = innerWidth / innerHeight;
        this.#camera.updateProjectionMatrix();
        ModuleLoader.log('Neural background resized');
        moduleLogger.log('neural_bg_resize', { width: innerWidth, height: innerHeight });
      };
      window.addEventListener('resize', onResize);
      appState.addCleanup(() => window.removeEventListener('resize', onResize));
      appState.addCleanup(() => {
        this.#renderer.dispose();
        this.#renderer.forceContextLoss();
        if (this.container.contains(this.#renderer.domElement)) {
          this.container.removeChild(this.#renderer.domElement);
          ModuleLoader.log('Neural background renderer cleaned up');
          moduleLogger.log('neural_bg_cleanup', {});
        }
      });
    } catch (err) {
      ModuleLoader.log('WebGL failed, fallback2D:', err);
      moduleLogger.log('webgl_init_error', { error: err.message });
      this.#init2DFallback();
    }
  }

  #init2DFallback() {
    ModuleLoader.log('Using 2D canvas fallback');
    moduleLogger.log('2d_fallback_init', {});
    const area = innerWidth * innerHeight;
    const N = Math.max(100, Math.min(600, Math.floor(area / 50_000)));
    const canvas = Object.assign(document.createElement('canvas'), {
      id: 'neural-bg-fallback',
      'aria-label': 'Fallback neural network',
    });
    this.container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });
    this.#particles = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 1.0,
      vy: (Math.random() - 0.5) * 1.0,
      pulse: Math.random() * 2 * Math.PI,
      size: 4 + Math.random() * 4,
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
      size: 6 + Math.random() * 4,
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
          a *= (0.9 + 0.1 * rand(gl_PointCoord + vPos.xy)); // Blue noise
          gl_FragColor = vec4(0.42, 0.89, 0.92, a * fade); // #6be2eb
        }`,
      transparent: true,
    });
    const points = new THREE.Points(nodeGeo, nodeMat);
    this.#scene.add(points);
    this.#particleGeometry = nodeGeo;
    this.#particleAttributes = { posArr, pulseArr, rotArr, sizeArr };
    ModuleLoader.log(`Initialized ${NODE_COUNT} particles`);
    moduleLogger.log('particles_init', { count: NODE_COUNT });
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
      transparent: true,
    });
    const lines = new THREE.LineSegments(edgeGeo, edgeMat);
    this.#scene.add(lines);
    this.#edgeGeometry = edgeGeo;
    this.#edgeAttributes = { edgeArr, edgePulseArr };
    ModuleLoader.log(`Initialized ${EDGE_COUNT} edges`);
    moduleLogger.log('edges_init', { count: EDGE_COUNT });
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
      uniforms: { time: { value: 0 } },
    });
    const gradMesh = new THREE.Mesh(gradGeo, gradMat);
    gradMesh.position.z = -12;
    this.#scene.add(gradMesh);
    this.#gradientMaterial = gradMat;
    ModuleLoader.log('Gradient plane initialized');
    moduleLogger.log('gradient_plane_init', {});
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
          center.add(o.pos); cnt++;
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
        ModuleLoader.log('Neural background destroyed');
        moduleLogger.log('neural_bg_destroyed', {});
      }
    }
  }
}

// -------------------------------
// Quantum Engine for Particle System and Parallax
// -------------------------------
class QuantumEngine {
  constructor() {
    this.initParticleSystem();
    this.initParallaxPhysics();
    this.setupTemporalCaching();
  }

  initParticleSystem() {
    this.particleCanvas = document.querySelector('.quantum-canvas');
    if (!this.particleCanvas) {
      ModuleLoader.log('Quantum canvas not found');
      moduleLogger.log('quantum_canvas_error', { error: 'Canvas not found' });
      return;
    }
    this.ctx = this.particleCanvas.getContext('2d');
    this.particles = Array.from({ length: 1000 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 3 + 1
    }));
    
    ModuleLoader.log('Quantum particle system initialized', { particleCount: this.particles.length });
    moduleLogger.log('quantum_particles_init', { count: this.particles.length });
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
    
    appState.trackAnimation('quantum-particles', this.animateParticles);
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
    ModuleLoader.log('Parallax physics initialized');
    moduleLogger.log('parallax_init', {});
  }

  setupTemporalCaching() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        type: 'module',
        updateViaCache: 'none'
      }).then(reg => {
        ModuleLoader.log('Service Worker registered');
        moduleLogger.log('service_worker_registered', {});
      }).catch(err => {
        ModuleLoader.log('Service Worker registration failed:', err);
        moduleLogger.log('service_worker_error', { error: err.message });
      });
    }
  }
}

// -------------------------------
// Auth Flow for Intro and Terms
// -------------------------------
class AuthFlow {
  constructor() {
    this.initLoader();
    this.playIntro();
  }

  initLoader() {
    window.addEventListener('load', () => {
      const loader = document.getElementById('quantum-loader');
      if (loader) {
        loader.remove();
        ModuleLoader.log('Quantum loader removed');
        moduleLogger.log('loader_removed', {});
      }
    });
  }

  playIntro() {
    const intro = document.getElementById('intro-sequence');
    if (!intro) {
      ModuleLoader.log('Intro sequence not found');
      moduleLogger.log('intro_sequence_error', { error: 'Element not found' });
      return;
    }
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
        ModuleLoader.log('Intro sequence completed');
        moduleLogger.log('intro_sequence_completed', {});
        this.showTerms();
      }
    });
  }

  showTerms() {
    const authFlow = document.getElementById('auth-flow');
    const termsModal = authFlow.querySelector('.terms-modal');
    if (!authFlow || !termsModal) {
      ModuleLoader.log('Auth flow or terms modal not found');
      moduleLogger.log('auth_flow_error', { error: 'Element not found' });
      return;
    }
    
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
        complete: () => {
          authFlow.remove();
          ModuleLoader.log('Terms modal accepted and removed');
          moduleLogger.log('terms_accepted', {});
        }
      });
    });
    ModuleLoader.log('Terms modal displayed');
    moduleLogger.log('terms_modal_displayed', {});
  }
}

// -------------------------------
// Core Initialization
// -------------------------------
const appState = new AppState();

async function initCoreModules() {
  try {
    const modules = await Promise.allSettled([
      ModuleLoader.load('/theme-toggle.js', 'theme-toggle').then(m => ({ initThemeToggle: m?.initThemeToggle })),
      ModuleLoader.load('/llm.js', 'llm').then(m => ({ initLLM: m?.initLLM })),
      ModuleLoader.load('/charts.js', 'charts').then(m => ({ initCharts: m?.initCharts })),
      ModuleLoader.load('/telemetry.js', 'telemetry').then(m => ({ initTelemetry: m?.initTelemetry })),
      ModuleLoader.load('/accordion.js', 'accordion').then(m => ({ initAccordion: m?.initAccordion }))
    ]);

    const loadedModules = modules.reduce((acc, result, index) => {
      const name = ['theme-toggle', 'llm', 'charts', 'telemetry', 'accordion'][index];
      if (result.status === 'fulfilled' && result.value) {
        appState.resources.register(result.value, name);
        return { ...acc, ...result.value };
      }
      ModuleLoader.log(`Module ${name} failed to load`);
      moduleLogger.log('module_load_failed', { moduleName: name });
      return acc;
    }, {});

    ModuleLoader.log('Core modules initialized', Object.keys(loadedModules));
    moduleLogger.log('core_modules_initialized', { modules: Object.keys(loadedModules) });
    return loadedModules;
  } catch (err) {
    ModuleLoader.log('Critical module initialization error:', err);
    moduleLogger.log('core_init_error', { error: err.message });
    throw err;
  }
}

// -------------------------------
// Accessibility Enhancements
// -------------------------------
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
  ModuleLoader.log('Accessibility enhancements initialized');
  moduleLogger.log('accessibility_init', {});
}

// -------------------------------
// Performance Monitoring
// -------------------------------
function initPerformanceMonitoring() {
  const perfObserver = new PerformanceObserver(list => {
    const entries = list.getEntries();
    ModuleLoader.log('Performance metrics:', entries);
    moduleLogger.log('performance_metrics', { entries: entries.map(e => e.name) });
  });

  perfObserver.observe({ entryTypes: ['measure', 'resource', 'navigation'] });
  ModuleLoader.log('Performance monitoring initialized');
  moduleLogger.log('performance_monitoring_init', {});
}

// -------------------------------
// Error Handling
// -------------------------------
function handleFatalError(err) {
  ModuleLoader.log('Fatal application error:', err);
  moduleLogger.log('fatal_error', { error: err.message });
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

// -------------------------------
// Main Initialization Flow
// -------------------------------
async function initApplication() {
  try {
    const modules = await initCoreModules();
    const neuralBg = new NeuralBackground(document.getElementById('neural-bg'));
    await neuralBg.init();
    new QuantumEngine();
    new AuthFlow();

    if (modules.initThemeToggle) modules.initThemeToggle();
    if (modules.initCharts) modules.initCharts();
    if (modules.initLLM) {
      const orig = modules.initLLM;
      modules.initLLM = async (...a) => { 
        appState.llmCallCount++; 
        ModuleLoader.log(`LLM call count: ${appState.llmCallCount}`);
        moduleLogger.log('llm_call', { count: appState.llmCallCount });
        return orig(...a); 
      };
      modules.initLLM();
    }
    if (modules.initTelemetry) modules.initTelemetry();
    if (modules.initAccordion) modules.initAccordion(['#features']);

    initAccessibility();
    initPerformanceMonitoring();

    appState.addCleanup(() => {
      neuralBg.destroy();
      ModuleLoader.log('Application cleanup initiated');
      moduleLogger.log('app_cleanup', {});
    });
  } catch (err) {
    handleFatalError(err);
  }
}

// -------------------------------
// Boot Sequence
// -------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }

  initApplication();
  ModuleLoader.log('Application boot sequence started');
  moduleLogger.log('app_boot', {});
});

window.addEventListener('beforeunload', () => {
  appState.cleanup();
  ModuleLoader.log('Application unloading');
  moduleLogger.log('app_unload', {});
});

ModuleLoader.log('Aurora Core v3.1 initialized');
moduleLogger.log('core_initialized', { version: '3.1' });
