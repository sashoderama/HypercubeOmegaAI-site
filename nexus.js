import * as THREE from 'https://unpkg.com/three@0.134.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.134.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.134.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.134.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// Utility Functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Spring Animation Utility
function springAnimation(target, current, velocity, stiffness = 0.15, damping = 0.8) {
    const dx = target - current;
    velocity += dx * stiffness;
    velocity *= damping;
    return { value: current + velocity, velocity };
}

// Theme Toggle
function initThemeToggle() {
    const toggleButton = $('.theme-toggle');
    toggleButton.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    });

    // Initialize theme based on localStorage or prefers-color-scheme
    if (localStorage.getItem('theme') === 'light' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: light)').matches)) {
        document.body.classList.add('light-mode');
    }
}

// Particle System (Neural Network with Bloom and Noise)
function initParticleSystem() {
    const canvas = $('#particles');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 10;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 0.85);
    composer.addPass(bloomPass);

    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
        positions[i * 3 + 2] = 0;
        velocities[i * 3] = (Math.random() - 0.5) * 0.002;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: 0x4dd0e1, size: 0.015, transparent: true, opacity: 0.5 });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(particleCount * particleCount * 6);
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4dd0e1, opacity: 0.15, transparent: true });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    function resizeParticleCanvas() {
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth / window.innerHeight;
        camera.right = window.innerWidth / window.innerHeight;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resizeParticleCanvas);
    resizeParticleCanvas();

    let particleAnimationFrameId;
    function animateParticles() {
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] += velocities[i * 3];
            positions[i * 3 + 1] += velocities[i * 3 + 1];
            if (Math.abs(positions[i * 3]) > 1) velocities[i * 3] *= -1;
            if (Math.abs(positions[i * 3 + 1]) > 1) velocities[i * 3 + 1] *= -1;
        }
        particleGeometry.attributes.position.needsUpdate = true;

        let lineIndex = 0;
        for (let i = 0; i < particleCount; i++) {
            for (let j = i + 1; j < particleCount; j++) {
                const dx = positions[i * 3] - positions[j * 3];
                const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.1) {
                    linePositions[lineIndex * 6] = positions[i * 3];
                    linePositions[lineIndex * 6 + 1] = positions[i * 3 + 1];
                    linePositions[lineIndex * 6 + 2] = 0;
                    linePositions[lineIndex * 6 + 3] = positions[j * 3];
                    linePositions[lineIndex * 6 + 4] = positions[j * 3 + 1];
                    linePositions[lineIndex * 6 + 5] = 0;
                    lineIndex++;
                }
            }
        }
        lineGeometry.setDrawRange(0, lineIndex * 2);
        lineGeometry.attributes.position.needsUpdate = true;

        composer.render();
        particleAnimationFrameId = requestAnimationFrame(animateParticles);
    }
    animateParticles();

    window.addEventListener('beforeunload', () => {
        if (particleAnimationFrameId) cancelAnimationFrame(particleAnimationFrameId);
    });

        return { renderer, composer };
}

// Consent Popup
function initConsentPopup() {
    const consentPopup = $('.consent-popup');
    const consentAccept = $('.consent-accept');
    if (!localStorage.getItem('consent')) {
        consentPopup.classList.add('active');
    }
    consentAccept.addEventListener('click', () => {
        localStorage.setItem('consent', 'true');
        consentPopup.classList.remove('active');
    });
}

// Dev Panel
function initDevPanel(particles) {
    const devPanel = $('.dev-panel');
    document.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key.toLowerCase() === 't') {
            devPanel.classList.toggle('active');
        }
    });

    $('#low-power-mode').addEventListener('change', (e) => {
        if (e.target.checked) {
            particles.material.opacity = 0.2;
            $$('.section, .consent-popup, .dev-panel').forEach(el => {
                el.style.background = document.body.classList.contains('light-mode') ? 'rgba(255,255,255,0.9)' : 'rgba(10,10,10,0.9)';
            });
        } else {
            particles.material.opacity = 0.5;
            $$('.section, .consent-popup, .dev-panel').forEach(el => {
                el.style.background = document.body.classList.contains('light-mode') ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.95)';
            });
        }
    });
}

// 3D Network Graphs
function initNetworkGraphs() {
    function render3DNetworkGraph(containerId, nodesData, edgesData) {
        const container = $(`#${containerId}`);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        container.appendChild(renderer.domElement);
        renderer.setSize(container.clientWidth, container.clientHeight);

        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.3, 0.4, 0.85);
        composer.addPass(bloomPass);

        const nodes = nodesData.map(node => {
            const geometry = new THREE.SphereGeometry(0.2, 16, 16);
            const material = new THREE.MeshBasicMaterial({ color: document.body.classList.contains('light-mode') ? 0x999999 : 0x333333 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(node.x * 5, node.y * 5, Math.random() * 2 - 1);
            scene.add(mesh);
            return { mesh, id: node.id, label: node.label };
        });

        const edges = edgesData.map(edge => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            const geometry = new THREE.BufferGeometry().setFromPoints([
                fromNode.mesh.position,
                toNode.mesh.position
            ]);
            const material = new THREE.LineBasicMaterial({ color: 0x4dd0e1 });
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            return line;
        });

        const light = new THREE.PointLight(0xffffff, 1);
        light.position.set(5, 5, 5);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xaaaaaa, 0.3));
        camera.position.z = 10;

        function resizeGraphCanvas() {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
            composer.setSize(container.clientWidth, container.clientHeight);
        }
        window.addEventListener('resize', resizeGraphCanvas);
        resizeGraphCanvas();

        let graphAnimationFrameId;
        function animateGraph() {
            nodes.forEach(node => {
                node.mesh.position.z += Math.sin(Date.now() * 0.001 + node.id) * 0.01;
            });
            composer.render();
            graphAnimationFrameId = requestAnimationFrame(animateGraph);
        }
        animateGraph();

        window.addEventListener('beforeunload', () => {
            if (graphAnimationFrameId) cancelAnimationFrame(graphAnimationFrameId);
        });

            // Simulate API updates
            setInterval(() => {
                nodes.forEach(node => {
                    node.mesh.position.set(
                        node.mesh.position.x + (Math.random() - 0.5) * 0.1,
                                           node.mesh.position.y + (Math.random() - 0.5) * 0.1,
                                           node.mesh.position.z
                    );
                });
                edges.forEach((edge, i) => {
                    edge.geometry.setFromPoints([
                        nodes.find(n => n.id === edgesData[i].from).mesh.position,
                                                nodes.find(n => n.id === edgesData[i].to).mesh.position
                    ]);
                    edge.geometry.attributes.position.needsUpdate = true;
                });
            }, 5000);

            return { renderer, composer, nodes };
    }

    const neo4jNodes = [
        { id: 0, x: 0.2, y: 0.3, label: 'Audit Log' },
        { id: 1, x: 0.5, y: 0.2, label: 'Query' },
        { id: 2, x: 0.8, y: 0.3, label: 'Response' },
        { id: 3, x: 0.5, y: 0.5, label: 'Ethical Score' }
    ];
    const neo4jEdges = [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 3 }
    ];
    const threatNodes = [
        { id: 0, x: 0.3, y: 0.4, label: 'Threat Detection' },
        { id: 1, x: 0.6, y: 0.3, label: 'Anomaly' },
        { id: 2, x: 0.6, y: 0.5, label: 'Exploit' },
        { id: 3, x: 0.3, y: 0.6, label: 'Mitigation' }
    ];
    const threatEdges = [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 3 }
    ];

    const neo4jGraph = render3DNetworkGraph('neo4j-graph', neo4jNodes, neo4jEdges);
    const threatGraph = render3DNetworkGraph('threat-detection-graph', threatNodes, threatEdges);

    return { neo4jNodes: neo4jGraph.nodes, threatNodes: threatGraph.nodes, neo4jRenderer: neo4jGraph.renderer, threatRenderer: threatGraph.renderer };
}

// LLM Integration
function initLLM() {
    let llmCallCount = 0;
    const history = [];

    async function callLLM() {
        const query = $('#llm-query').value;
        const provider = $('#llm-provider').value;
        const verbose = $('#llm-verbose').checked;
        const responseDiv = $('#llm-response');
        if (!query) {
            responseDiv.textContent = 'Please enter a query.';
            responseDiv.classList.remove('loading');
            return;
        }
        responseDiv.textContent = '';
        responseDiv.classList.add('loading');
        llmCallCount++;
        $('#llm-calls').textContent = llmCallCount;

        try {
            const response = await new Promise(resolve => {
                setTimeout(() => {
                    const baseResponse = provider === 'openai' ? `OpenAI Response: Analyzed query "${query}" - No threats detected.` :
                    provider === 'local-llama' ? `LLaMA Response: Processed query "${query}" - Local model analysis complete.` :
                    provider === 'groq' ? `Grok Response: Evaluated query "${query}" - Suspicious pattern detected.` :
                    provider === 'anthropic' ? `Claude Response: Query "${query}" analyzed - Ethical alignment confirmed.` :
                    `Mistral Response: Query "${query}" processed - No anomalies found.`;
                    resolve(verbose ? `${baseResponse} (Verbose: Confidence 0.95, Latency 120ms, Tokens 128)` : baseResponse);
                }, 1000);
            });
            responseDiv.classList.remove('loading');
            responseDiv.textContent = response;
            responseDiv.appendChild($('.copy-button'));
            history.push({ query, response, provider, timestamp: new Date().toISOString() });
            updateHistory();
        } catch (error) {
            responseDiv.classList.remove('loading');
            responseDiv.textContent = `Error: ${error.message}`;
            console.error('LLM Call Error:', error);
        }
    }

    function updateHistory() {
        const historyList = $('#llm-history-list');
        historyList.innerHTML = history.map((entry, i) => `<li>${entry.timestamp}: ${entry.query} → ${entry.response}</li>`).join('');
    }

    $('.llm-submit').addEventListener('click', callLLM);
    $('#llm-query').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            callLLM();
        }
    });

    $('.llm-options').addEventListener('click', () => {
        $('.llm-options-panel').classList.toggle('active');
    });

    $('.export-history').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'llm-history.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    $('.copy-button').addEventListener('click', () => {
        const text = $('#llm-response').textContent.replace('📋', '').trim();
        navigator.clipboard.writeText(text).then(() => {
            $('.copy-button').classList.add('copied');
            setTimeout(() => $('.copy-button').classList.remove('copied'), 1000);
        });
    });

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        $('.speech-to-text').addEventListener('click', () => {
            recognition.start();
            $('.speech-to-text').textContent = '🎙️ Recording...';
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            $('#llm-query').value = transcript;
            $('.speech-to-text').textContent = '🎤';
            callLLM();
        };

        recognition.onend = () => {
            $('.speech-to-text').textContent = '🎤';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            $('.speech-to-text').textContent = '🎤';
            $('#llm-response').textContent = `Speech recognition error: ${event.error}`;
        };
    } else {
        $('.speech-to-text').disabled = true;
        $('.speech-to-text').title = 'Speech recognition not supported';
    }

    return { llmCallCount };
}

// Neural Capsule Cluster with Bloom and Noise
function initNeuralCapsule() {
    const container = $('#three-panel');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    container.appendChild(renderer.domElement);
    renderer.setSize(container.clientWidth, container.clientHeight);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.5, 0.4, 0.85);
    composer.addPass(bloomPass);

    const vertexShader = `
    varying vec2 vUv;
    uniform float u_time;
    void main() {
        vUv = uv;
        vec3 pos = position;
        pos += 0.05 * sin(u_time + pos.x * 10.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
    `;
    const fragmentShader = `
    varying vec2 vUv;
    uniform float u_time;
    float noise(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
        vec3 color = vec3(0.7, 0.7, 0.7);
        float iridescence = sin(vUv.x * 10.0 + u_time) * 0.1 + 0.9;
        float n = noise(vUv + u_time * 0.1);
        color += n * 0.1;
        gl_FragColor = vec4(color * iridescence, 1.0);
    }
    `;

    const mainCapsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.2, 2.5, 10, 20),
                                       new THREE.ShaderMaterial({
                                           vertexShader,
                                           fragmentShader,
                                           uniforms: { u_time: { value: 0 } }
                                       })
    );
    scene.add(mainCapsule);

    const subCapsules = [];
    for (let i = 0; i < 5; i++) {
        const subCapsule = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 0.8, 6, 12),
                                          new THREE.MeshPhysicalMaterial({
                                              color: document.body.classList.contains('light-mode') ? 0xcccccc : 0xaaaaaa,
                                                                         roughness: 0.6,
                                                                         metalness: 1.0,
                                                                         clearcoat: 0.3,
                                                                         reflectivity: 0.4
                                          })
        );
        subCapsule.position.set(Math.sin(i * 1.256) * 3, Math.cos(i * 1.256) * 3, 0);
        scene.add(subCapsule);
        subCapsules.push(subCapsule);
    }

    const light = new THREE.PointLight(0xffffff, 1.5);
    light.position.set(5, 5, 5);
    scene.add(light);
    const ambientLight = new THREE.AmbientLight(0xaaaaaa, 0.3);
    scene.add(ambientLight);
    camera.position.z = 8;

    function resizeThreeCanvas() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        composer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener('resize', resizeThreeCanvas);
    resizeThreeCanvas();

    let capsuleAnimationFrameId;
    let time = 0;
    function animateCapsule() {
        time += 0.01;
        mainCapsule.rotation.x += 0.005;
        mainCapsule.rotation.y += 0.01;
        mainCapsule.material.uniforms.u_time.value = time;
        subCapsules.forEach((capsule, i) => {
            capsule.position.x = Math.sin(i * 1.256 + time) * 3;
            capsule.position.y = Math.cos(i * 1.256 + time) * 3;
            capsule.rotation.z += 0.02;
        });
        composer.render();
        capsuleAnimationFrameId = requestAnimationFrame(animateCapsule);
    }
    animateCapsule();

    window.addEventListener('beforeunload', () => {
        if (capsuleAnimationFrameId) cancelAnimationFrame(capsuleAnimationFrameId);
    });

        return { renderer, composer };
}

// Threat Insights Charts
function initThreatCharts() {
    const trendData = Array.from({ length: 12 }, () => Math.random() * 100);
    const trendChart = {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [{
                label: 'Threat Detections',
                data: trendData,
                borderColor: '#4dd0e1',
                backgroundColor: 'rgba(77, 208, 225, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: document.body.classList.contains('light-mode') ? '#ccc' : '#333' }, ticks: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } },
                x: { grid: { color: document.body.classList.contains('light-mode') ? '#ccc' : '#333' }, ticks: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } }
            },
            plugins: {
                legend: { labels: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } }
            }
        }
    };
    const trendChartInstance = new Chart($('#threat-trend-chart'), trendChart);

    const severityData = [30, 50, 20];
    const severityChart = {
        type: 'bar',
        data: {
            labels: ['Low', 'Medium', 'High'],
            datasets: [{
                label: 'Threat Severity',
                data: severityData,
                backgroundColor: ['#4dd0e1', '#ffca28', '#ef5350'],
                borderColor: ['#4dd0e1', '#ffca28', '#ef5350'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: document.body.classList.contains('light-mode') ? '#ccc' : '#333' }, ticks: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } },
                x: { grid: { color: document.body.classList.contains('light-mode') ? '#ccc' : '#333' }, ticks: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } }
            },
            plugins: {
                legend: { labels: { color: document.body.classList.contains('light-mode') ? '#121212' : '#e6e6e6' } }
            }
        }
    };
    const severityChartInstance = new Chart($('#threat-severity-chart'), severityChart);

    setInterval(() => {
        trendData.shift();
        trendData.push(Math.random() * 100);
        trendChart.data.datasets[0].data = trendData;
        trendChartInstance.update();

        severityData.forEach((_, i) => {
            severityData[i] = Math.random() * 50;
        });
        severityChart.data.datasets[0].data = severityData;
        severityChartInstance.update();
    }, 10000);
}

// Snapshot Export
function initSnapshotExport(neo4jNodes, threatNodes, llmCallCount) {
    $('.snapshot-button')?.addEventListener('click', () => {
        const data = {
            nodes: neo4jNodes.concat(threatNodes).map(node => ({
                id: node.id,
                label: node.label,
                x: node.mesh.position.x / 5,
                y: node.mesh.position.y / 5
            })),
            llmCalls: llmCallCount
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aurora-nexus-snapshot.json';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// Accordions
function initAccordions() {
    $$('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const accordion = header.parentElement;
            accordion.classList.toggle('active');
            header.setAttribute('aria-expanded', accordion.classList.contains('active'));
        });
        header.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    });
}

// Card Interactions
function initCardInteractions() {
    document.body.addEventListener('click', e => {
        if (e.target.closest('.card')) {
            e.target.closest('.card').classList.toggle('active');
            e.target.closest('.card').focus();
        }
    });
    document.body.addEventListener('keypress', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.card')) {
            e.preventDefault();
            e.target.closest('.card').classList.toggle('active');
        }
    });
}

// Intersection Observer
function initIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    $$('.section').forEach(section => observer.observe(section));
}

// Performance Metrics
function initPerformanceMetrics(particleRenderer, capsuleRenderer, neo4jRenderer, threatRenderer) {
    let lastFrame = performance.now();
    let webglCalls = 0;

    setInterval(() => {
        const now = performance.now();
        const fps = Math.round(1000 / (now - lastFrame));
        $('#fps').textContent = fps;
        $('#webgl-calls').textContent = webglCalls;
        if (window.performance.memory) {
            $('#memory-usage').textContent = `${Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024)} MB`;
        }
        lastFrame = now;
        webglCalls = particleRenderer.info.render.calls + capsuleRenderer.info.render.calls +
        neo4jRenderer.info.render.calls + threatRenderer.info.render.calls;
    }, 1000);
}

// Main Initialization
function init() {
    initThemeToggle();
    const { renderer: particleRenderer, composer: particleComposer } = initParticleSystem();
    initConsentPopup();
    const { neo4jNodes, threatNodes, neo4jRenderer, threatRenderer } = initNetworkGraphs();
    const { llmCallCount } = initLLM();
    const { renderer: capsuleRenderer, composer: capsuleComposer } = initNeuralCapsule();
    initThreatCharts();
    initSnapshotExport(neo4jNodes, threatNodes, llmCallCount);
    initAccordions();
    initCardInteractions();
    initIntersectionObserver();
    initPerformanceMetrics(particleRenderer, capsuleRenderer, neo4jRenderer, threatRenderer);
    initDevPanel(particleComposer.scene.children[0]); // Pass particles object

    requestIdleCallback(() => {
        if (navigator.hardwareConcurrency < 6 || window.deviceMemory < 4) {
            $('#low-power-mode').checked = true;
            $('#low-power-mode').dispatchEvent(new Event('change'));
        }
    });
}

init();
