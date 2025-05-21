/*─────────────────────────────────────────────────────────────────────────────*
 | nexus.js – unified entry-point                                              |
 | Theme, neural background (WebGL + 2D fallback), graphs, charts, LLM, HUD…   |
 *─────────────────────────────────────────────────────────────────────────────*/

import { initThemeToggle } from './theme-toggle.js';
import { initLLM } from './llm.js';
import { initCharts } from './charts.js';
import { initAccordion } from './accordion.js';
import { initTelemetry } from './telemetry.js';

/* ── tiny helpers ─────────────────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const prefersRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const webglSupported = (() => {
  try { return !!document.createElement('canvas').getContext('webgl2'); }
  catch { return false; }
})();

/* ── globals ──────────────────────────────────────────────────────────────── */
let llmCallCount = 0;

/*─────────────────────────────────────────────────────────────────────────────*
 | 1) Neural Background – WebGL with bloom, 2D fallback                       *
 *─────────────────────────────────────────────────────────────────────────────*/
function initNeuralBackground() {
  const host = $('#neural-bg'); if (!host) return;
  const area = innerWidth * innerHeight;

  /*───────────── fallback 2D canvas ─────────────*/
  const fallback2D = () => {
    const N = Math.max(20, Math.min(150, Math.floor(area / 120_000)));
    const canvas = Object.assign(document.createElement('canvas'), { id: 'neural-bg-fallback' });
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      pulse: Math.random() * Math.PI * 2
    }));
    const edges = Array.from({ length: N * 1.2 }, () => {
      let s = Math.floor(Math.random() * N), t;
      do { t = Math.floor(Math.random() * N); } while (t === s);
      return { s, t, pulse: Math.random() * Math.PI * 2 };
    });

    const draw = ts => {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';

      // Cyberpunk gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(10, 15, 30, 0.9)');
      gradient.addColorStop(1, 'rgba(40, 60, 120, 0.9)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.5;
      edges.forEach(({ s, t, pulse }) => {
        const a = nodes[s], b = nodes[t], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 250) {
          pulse += 0.04;
          ctx.strokeStyle = `rgba(143,169,255,${(0.3 + 0.2 * Math.sin(pulse)) * (1 - d / 250)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        edges[s].pulse = pulse;
      });

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.06;
        if (n.x < 0 || n.x > innerWidth) n.vx *= -1;
        if (n.y < 0 || n.y > innerHeight) n.vy *= -1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5 * (1 + 0.3 * Math.sin(n.pulse)), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(79,141,253,0.9)';
        ctx.shadowColor = '#4f8dfd';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      !prefersRM && requestAnimationFrame(draw);
    };
    window.addEventListener('resize', () => requestAnimationFrame(draw));
    requestAnimationFrame(draw);
  };

  /*───────────── WebGL variant ─────────────*/
  if (!webglSupported || prefersRM) return fallback2D();
  Promise.all([
    import('https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js'),
    import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/EffectComposer.js'),
    import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/RenderPass.js'),
    import('https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/postprocessing/UnrealBloomPass.js')
  ]).then(([{ default: THREE }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }]) => {
    const DPR = Math.min(devicePixelRatio, 2);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(DPR);
    renderer.setSize(innerWidth, innerHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.z = 30;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x8fa9ff, 1.2, 25);
    pointLight.position.set(8, 8, 8);
    scene.add(pointLight);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.2, 0.85));

    // Dynamic node count
    const NODE_COUNT = Math.max(40, Math.min(250, Math.floor(area / 200_000)));
    const clusters = 4;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 12),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.02),
      cluster: Math.floor(Math.random() * clusters),
      pulse: Math.random() * Math.PI * 2,
      rotation: Math.random() * Math.PI * 2
    }));
    const edges = Array.from({ length: Math.floor(NODE_COUNT * 1.1) }, () => {
      let s = Math.floor(Math.random() * NODE_COUNT), t;
      do { t = Math.floor(Math.random() * NODE_COUNT); } while (t === s);
      return { s, t, pulse: Math.random() * Math.PI * 2 };
    });

    // Node geometry with rotation
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
          gl_PointSize = 8.0 * (1.0 + 0.5 * sin(pulse));
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
          float a = smoothstep(0.5, 0.2, d) * (0.7 + 0.4 * sin(vP));
          float fade = 1.0 - abs(vPos.z / 12.0);
          gl_FragColor = vec4(0.25, 0.55, 1.0, a * fade * 0.9);
        }
      `,
      transparent: true
    });
    scene.add(new THREE.Points(nodeGeo, nodeMat));

    // Edge geometry with pulsing
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
          float pulseAlpha = 0.3 + 0.2 * sin(vP);
          gl_FragColor = vec4(0.45, 0.7, 1.0, pulseAlpha * f * 0.7);
        }
      `,
      transparent: true
    });
    scene.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // Gradient background with subtle noise
    const gradientGeo = new THREE.PlaneGeometry(40, 40);
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
          vec3 color = mix(vec3(0.05, 0.05, 0.15), vec3(0.2, 0.3, 0.6), uv.y);
          float noise = fract(sin(dot(uv * time * 0.001, vec2(12.9898, 78.233))) * 43758.5453);
          color += noise * 0.015;
          gl_FragColor = vec4(color, 0.4);
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true
    });
    const gradientMesh = new THREE.Mesh(gradientGeo, gradientMat);
    gradientMesh.position.z = -10;
    scene.add(gradientMesh);

    // Particle system for floating data sparks
    const particleCount = 50;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleVel = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 30;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 15;
      particleVel[i * 3] = (Math.random() - 0.5) * 0.02;
      particleVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      particleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x8fa9ff,
      size: 2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    function refreshBuffers() {
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
    }

    /* main loop */
    let last = 0;
    const animate = t => {
      if (t - last > 20) {
        nodes.forEach(n => {
          n.pos.add(n.vel);
          n.pulse += 0.07;
          n.rotation += 0.015;
          ['x', 'y', 'z'].forEach(ax => {
            const lim = ax === 'z' ? 12 : 25;
            if (Math.abs(n.pos[ax]) > lim) n.vel[ax] *= -1;
          });
          const center = new THREE.Vector3();
          let cnt = 0;
          nodes.forEach(o => { if (o.cluster === n.cluster) { center.add(o.pos); cnt++; } });
          if (cnt) { center.divideScalar(cnt); n.vel.add(center.sub(n.pos).multiplyScalar(0.001)); }
        });
        edges.forEach(e => { e.pulse += 0.05; });
        gradientMat.uniforms.time.value = t * 0.001;
        camera.position.x = Math.sin(t * 0.00015) * 4;
        camera.position.y = Math.cos(t * 0.0001) * 3;
        camera.lookAt(0, 0, 0);
        refreshBuffers();
        composer.render();
        last = t;
      }
      !prefersRM && requestAnimationFrame(animate);
    };

    function onResize() {
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);
    onResize();
    requestAnimationFrame(animate);
  }).catch(err => {
    console.error('WebGL failed, using fallback', err);
    fallback2D();
  });
}

/*─────────────────────────────────────────────────────────────────────────────*
 | 2) Scroll-spy                                                             *
 *─────────────────────────────────────────────────────────────────────────────*/
function initScrollSpy() {
  document.addEventListener('scroll', throttle(() => {
    const sections = $$('main section');
    let active = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 100;
      if (window.scrollY >= top) active = sec.id;
    });
    $$('.nav-links a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${active}`);
    });
  }, 100));
}

/*─────────────────────────────────────────────────────────────────────────────*
 | 3) Graphs (canvas)                                                        *
 *─────────────────────────────────────────────────────────────────────────────*/
function createGraph(selector, nodes, edges) {
  const wrap = $(selector); if (!wrap) return;
  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const draw = () => {
    const w = wrap.clientWidth * devicePixelRatio,
          h = wrap.clientHeight * devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12,13,16,0.8)';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8fa9ff';
    edges.forEach(e => {
      const a = nodes.find(n => n.id === e.source),
            b = nodes.find(n => n.id === e.target);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x * .3 + b.x * .7, a.y, a.x * .7 + b.x * .3, b.y, b.x, b.y);
      ctx.stroke();
    });

    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, 2 * Math.PI);
      ctx.fillStyle = '#4f8dfd';
      ctx.fill();
      ctx.strokeStyle = '#adb9cc';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '14px Sora';
      ctx.fillStyle = '#e0e3f4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, n.x, n.y + n.r + 14);
    });

    if (selector.includes('threat')) $('#node-count').textContent = nodes.length;
  };
  draw();
  window.addEventListener('resize', throttle(draw, 200));
}

/*─────────────────────────────────────────────────────────────────────────────*
 | 4) Consent popup, Dev panel, keyboard overlay                             *
 *─────────────────────────────────────────────────────────────────────────────*/
function initConsent() {
  const pop = $('#consent-popup'), btn = $('.consent-accept');
  if (!localStorage.getItem('consent')) pop?.classList.remove('hidden');
  btn?.addEventListener('click', () => {
    localStorage.setItem('consent', 'y');
    pop?.classList.add('hidden');
  });
}

function initDevPanel() {
  const panel = $('#dev-panel'), toggle = $('.toggle-dev-panel'), overlay = $('#keyboard-overlay');
  toggle?.addEventListener('click', () => panel?.classList.toggle('active'));
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'd') {
      panel?.classList.toggle('active');
      overlay?.classList.remove('active');
    }
    if (e.ctrlKey) overlay?.classList.add('active');
  });
  document.addEventListener('keyup', () => overlay?.classList.remove('active'));
}

/*─────────────────────────────────────────────────────────────────────────────*
 | 5) Utilities                                                              *
 *─────────────────────────────────────────────────────────────────────────────*/
function throttle(fn, ms) {
  let timer;
  return (...a) => {
    if (!timer) {
      fn(...a);
      timer = setTimeout(() => timer = null, ms);
    }
  };
}

/*─────────────────────────────────────────────────────────────────────────────*
 | 6) Static data (nodes/edges)                                              *
 *─────────────────────────────────────────────────────────────────────────────*/
const threatNodes = [
  { id: '1', x: 100, y: 100, r: 20, label: 'Ingest' },
  { id: '2', x: 300, y: 200, r: 20, label: 'Analyze' },
  { id: '3', x: 500, y: 150, r: 20, label: 'Mutate' },
  { id: '4', x: 200, y: 350, r: 20, label: 'Neutralize' },
  { id: '5', x: 400, y: 400, r: 20, label: 'Audit' }
];
const threatEdges = [
  { source: '1', target: '2' },
  { source: '2', target: '3' },
  { source: '3', target: '4' },
  { source: '4', target: '5' }
];

const stackNodes = [
  { id: '1', x: 150, y: 100, r: 20, label: 'PyTorch' },
  { id: '2', x: 350, y: 150, r: 20, label: 'Ray' },
  { id: '3', x: 250, y: 300, r: 20, label: 'Redis' }
];
const stackEdges = [
  { source: '1', target: '2' },
  { source: '2', target: '3' }
];

/*─────────────────────────────────────────────────────────────────────────────*
 | 7) Boot everything once DOM ready                                         *
 *─────────────────────────────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  // Hide loading overlay
  $('#loading').classList.add('hidden');

  initNeuralBackground();
  initThemeToggle();
  initScrollSpy();
  initCharts();
  initLLM();
  initTelemetry();
  initAccordion();
  initConsent();
  initDevPanel();

  createGraph('#threat-detection-graph', threatNodes, threatEdges);
  createGraph('#stack-graph', stackNodes, stackEdges);

  $('.snapshot-button')?.addEventListener('click', () => {
    const snap = {
      stamp: new Date().toISOString(),
      llmCalls: llmCallCount,
      entropy: $('#entropy')?.textContent,
      gpu: $('#gpu-util')?.textContent
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexus-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});
