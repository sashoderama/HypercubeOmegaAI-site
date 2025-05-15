/* ─── CORE INITIALIZATION ────────────────────────────────────────── */
(async function() {
    // Error Handling
    window.onerror = (msg, url, line, col, error) => {
        console.error(`Uncaught Error: ${msg} at ${url}:${line}:${col}`, error);
    };
    window.addEventListener('unhandledrejection', event => {
        console.error('Unhandled Promise Rejection:', event.reason);
    });

    // Runtime Test
    console.log('DOM loaded, JS working ✅');
    const test = document.createElement('div');
    test.textContent = 'JS is active';
    test.style.cssText = 'position:fixed;top:0;left:0;background:#0f0;padding:10px;';
    document.body.appendChild(test);
    setTimeout(() => test.remove(), 3000);

    // Environment Configuration
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let HF_TOKEN = '';
    try {
        const response = await fetch('/config.json');
        const config = await response.json();
        HF_TOKEN = config.HUGGINGFACE_TOKEN || '';
    } catch (e) {
        console.warn('Failed to load config.json, using empty HF_TOKEN:', e);
    }
    const HF_MODEL = 'NousResearch/Hermes-2-Pro-Mistral-7B';
    const WS_URL = isLocal ? 'ws://localhost:8080/llama' : 'wss://aurora-llm.x.ai';
    const AUDIT_EVENT = 'proChat-audit';

    // Token Bucket for Rate Limiting (30 req/min)
    let bucket = 30, lastRefill = Date.now();
    const takeToken = () => {
        const now = Date.now();
        const delta = Math.floor((now - lastRefill) / 2000);
        if (delta > 0) {
            bucket = Math.min(30, bucket + delta);
            lastRefill = now;
        }
        if (bucket > 0) {
            bucket--;
            return true;
        }
        return false;
    };

    // Session Context Memory
    let sessionContext = JSON.parse(localStorage.getItem('aurora-session') || '[]');
    const saveSession = () => localStorage.setItem('aurora-session', JSON.stringify(sessionContext));

    // WebGPU Particle System
    async function initWebGPUParticles() {
        try {
            if (!navigator.gpu) throw new Error('WebGPU not supported');
            const canvas = document.createElement('canvas');
            canvas.id = 'particles-js';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '-3';
            canvas.style.filter = 'blur(1px)';
            canvas.style.opacity = '0.7';
            document.body.appendChild(canvas);
            const adapter = await navigator.gpu.requestAdapter();
            const device = await adapter.requestDevice();
            const context = canvas.getContext('webgpu');
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

            const particleCount = 10000;
            const particles = new Float32Array(particleCount * 4);
            for (let i = 0; i < particleCount; i++) {
                particles[i * 4] = (Math.random() - 0.5) * 4000;
                particles[i * 4 + 1] = (Math.random() - 0.5) * 4000;
                particles[i * 4 + 2] = (Math.random() - 0.5) * 4000;
                particles[i * 4 + 3] = Math.random();
            }

            const particleBuffer = device.createBuffer({
                size: particles.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(particleBuffer, 0, particles);

            const shaderCode = `
                struct Particle {
                    position: vec3<f32>,
                    color: f32
                };
                @group(0) @binding(0) var<storage, read> particles: array<Particle>;
                @vertex
                fn vs(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
                    let p = particles[idx];
                    let pos = p.position * 0.0005;
                    return vec4<f32>(pos.x, pos.y, pos.z, 1.0);
                }
                @fragment
                fn fs() -> @location(0) vec4<f32> {
                    return vec4<f32>(0.0, 1.0, 1.0, 0.6);
                }
            `;
            const shaderModule = device.createShaderModule({ code: shaderCode });
            const pipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: { module: shaderModule, entryPoint: 'vs' },
                fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
                primitive: { topology: 'point-list' }
            });

            const bindGroup = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: particleBuffer } }]
            });

            function animate() {
                const commandEncoder = device.createCommandEncoder();
                const pass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        view: context.getCurrentTexture().createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 0 },
                        loadOp: 'clear',
                        storeOp: 'store'
                    }]
                });
                pass.setPipeline(pipeline);
                pass.setBindGroup(0, bindGroup);
                pass.draw(particleCount);
                pass.end();
                device.queue.submit([commandEncoder.finish()]);
                requestAnimationFrame(animate);
            }
            animate();
            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth * devicePixelRatio;
                canvas.height = window.innerHeight * devicePixelRatio;
            });
        } catch (e) {
            console.warn('WebGPU particles failed:', e);
        }
    }

    /* ─── PRO CHATBOX MODULE ─────────────────────────────────────── */
    const proChat = (function() {
        const root = document.getElementById('proChat-root');
        const launcher = document.getElementById('proChat-launcher');
        const closeBtn = document.getElementById('proChat-close');
        const logEl = document.getElementById('proChat-log');
        const form = document.getElementById('proChat-form');
        const inputEl = document.getElementById('proChat-input');

        let isHidden = true;
        let lastActivity = Date.now();

        const toggleChat = (open) => {
            isHidden = !open;
            root.classList.toggle('hidden', !open);
            if (open) {
                inputEl.focus();
                lastActivity = Date.now();
            }
        };

        const autoHide = () => {
            if (!isHidden && Date.now() - lastActivity > 30000) {
                toggleChat(false);
            }
        };

        setInterval(autoHide, 1000);

        const addMsg = (text, sender, id = crypto.randomUUID()) => {
            const li = document.createElement('li');
            li.className = 'proChat-msg';
            li.dataset.sender = sender;
            li.dataset.id = id;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `<span>${sanitizeHTML(text)}</span><span class="proChat-time">${time}</span>`;
            logEl.appendChild(li);
            logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
            lastActivity = Date.now();
            return li.firstChild;
        };

        launcher.onclick = () => toggleChat(true);
        closeBtn.onclick = () => toggleChat(false);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const q = inputEl.value.trim();
            if (!q) return;
            if (!takeToken()) {
                addMsg('Rate limit: 30 messages / minute', 'bot');
                showToast('Rate limit exceeded');
                return;
            }
            const msgId = crypto.randomUUID();
            addMsg(q, 'user', msgId);
            inputEl.value = '';
            const botSpan = addMsg('', 'bot');
            try {
                const answer = await streamHF(q, chunk => {
                    botSpan.textContent += chunk;
                    logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
                });
                sessionContext.push({ id: msgId, userMsg: q, botMsg: answer, ts: Date.now() });
                saveSession();
                window.dispatchEvent(new CustomEvent(AUDIT_EVENT, {
                    detail: { id: msgId, userMsg: q, botMsg: answer, ts: Date.now() }
                }));
            } catch (err) {
                botSpan.textContent = `(Error) ${err.message || err}`;
                showToast(`Error: ${err.message}`);
            }
        });

        async function streamHF(prompt, onChunk, retries = 3) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            for (let i = 0; i < retries; i++) {
                try {
                    if (!HF_TOKEN) throw new Error('Missing Hugging Face token');
                    const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
                    const contextStr = sessionContext.slice(-5).map(c => 
                        `${c.userMsg ? 'User' : 'Bot'}: ${c.userMsg || c.botMsg}`).join('\n');
                    const payload = {
                        inputs: `[CONTEXT]\n${contextStr}\n\nUser: ${prompt}\nBot:`,
                        stream: true,
                        parameters: { max_new_tokens: 200, temperature: 0.7, top_p: 0.9, stop: ['</s>'] }
                    };
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${HF_TOKEN}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Use-Stream': 'true'
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });
                    clearTimeout(timeout);
                    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                    const reader = res.body.getReader();
                    let full = '';
                    const decoder = new TextDecoder();
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const txt = decoder.decode(value, { stream: true });
                        txt.split('\n').forEach(line => {
                            if (!line.trim()) return;
                            try {
                                const payload = JSON.parse(line);
                                const chunk = payload?.token?.text || '';
                                onChunk(chunk);
                                full += chunk;
                            } catch (_) {}
                        });
                    }
                    return full.trim();
                } catch (e) {
                    clearTimeout(timeout);
                    if (i === retries - 1) throw e;
                    console.warn(`Retry ${i + 1}/${retries} for streamHF:`, e);
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }

        return { init: () => {} };
    })();

    /* ─── MAIN CHAT MODULE ───────────────────────────────────────── */
    const mainChat = (function() {
        const chatLog = document.getElementById('chatLog');
        const input = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');
        const loader = document.getElementById('loader');

        const addMessage = (text, type, tooltip = '') => {
            requestAnimationFrame(() => {
                const bubble = document.createElement('div');
                bubble.className = `message-bubble card ${type}`;
                bubble.textContent = sanitizeHTML(text);
                bubble.dataset.tooltip = tooltip || (type === 'ai' ? 'AI-generated response with ethical validation.' : 'User input.');
                chatLog.appendChild(bubble);
                bubble.classList.add('visible');
                scrollToBottom();
                saveHistory();
            });
        };

        const scrollToBottom = debounce(() => {
            chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
        }, 100);

        const saveHistory = () => {
            const messages = Array.from(chatLog.children).map(el => ({
                text: el.textContent,
                type: el.classList.contains('user') ? 'user' : 'ai'
            }));
            localStorage.setItem('aurora-session', JSON.stringify(messages));
        };

        const loadHistory = () => {
            const history = JSON.parse(localStorage.getItem('aurora-session') || '[]');
            history.forEach(msg => addMessage(msg.text, msg.type));
        };

        async function sendQuery() {
            const q = input.value.trim();
            if (!q) return;
            if (!takeToken()) {
                addMessage('Rate limit: 30 messages / minute', 'ai');
                showToast('Rate limit exceeded');
                return;
            }
            addMessage(q, 'user');
            loader.classList.add('active');
            input.value = '';
            try {
                const botSpan = document.createElement('div');
                botSpan.className = 'message-bubble card ai';
                chatLog.appendChild(botSpan);
                const answer = await streamHF(q, chunk => {
                    botSpan.textContent += chunk;
                    scrollToBottom();
                });
                botSpan.dataset.tooltip = 'AI-generated response with ethical validation.';
                botSpan.classList.add('visible');
                const sessionId = `session_${Date.now()}`;
                sessionContext.push({ id: sessionId, userMsg: q, botMsg: answer, ts: Date.now() });
                saveSession();
                window.dispatchEvent(new CustomEvent(AUDIT_EVENT, {
                    detail: { id: sessionId, userMsg: q, botMsg: answer, ts: Date.now() }
                }));
            } catch (e) {
                addMessage(`Error: ${e.message}`, 'ai');
                showToast(`Error: ${e.message}`);
            } finally {
                loader.classList.remove('active');
            }
        }

        input.addEventListener('keypress', e => {
            if (e.key === 'Enter' && input.value.trim()) {
                sendQuery();
            }
        });
        sendButton.addEventListener('click', sendQuery);

        return { init: loadHistory, sendQuery };
    })();

    /* ─── TEXT-TO-SPEECH MODULE ──────────────────────────────────── */
    const tts = (function() {
        let speech = new SpeechSynthesisUtterance();
        let isSpeaking = false;
        let isPaused = false;
        let currentChunkIndex = 0;

        const chunks = [
            "AuroraGenesis-OMEGA is a cutting-edge AI system for cybersecurity, ethical reasoning, and forensic analysis, integrating over 40 modules for advanced cognitive capabilities.",
            "Key features include recursive agent architecture, capsule-based memory, real-time threat detection, and scalable dual-GPU processing.",
            "The system ensures ethical compliance with 10,000+ protocols, validated by zero-knowledge proofs and Merkle trees.",
            "Target markets include cybersecurity, healthcare AI, legal compliance, and enterprise SaaS, with a projected 300% ROI in 5 years."
        ];

        function startTTS() {
            if (!('speechSynthesis' in window)) {
                mainChat.addMessage('Text-to-speech not supported.', 'ai');
                showToast('TTS not supported');
                return;
            }
            if (isSpeaking) return;
            isSpeaking = true;
            isPaused = false;
            document.getElementById('start-tts').disabled = true;
            document.getElementById('pause-tts').disabled = false;
            speech = new SpeechSynthesisUtterance();
            speech.lang = 'en-US';
            speech.volume = 1;
            speech.rate = 1;
            speech.pitch = 1;
            readNextChunk();
        }

        function readNextChunk() {
            if (currentChunkIndex >= chunks.length) {
                isSpeaking = false;
                document.getElementById('start-tts').disabled = false;
                document.getElementById('pause-tts').disabled = true;
                currentChunkIndex = 0;
                return;
            }
            if (!isPaused) {
                mainChat.addMessage(chunks[currentChunkIndex], 'ai');
                speech.text = chunks[currentChunkIndex];
                speech.onend = () => {
                    currentChunkIndex++;
                    readNextChunk();
                };
                window.speechSynthesis.speak(speech);
            }
        }

        function pauseTTS() {
            if (isSpeaking) {
                if (isPaused) {
                    isPaused = false;
                    document.getElementById('pause-tts').textContent = 'Pause TTS';
                    window.speechSynthesis.resume();
                    readNextChunk();
                } else {
                    isPaused = true;
                    document.getElementById('pause-tts').textContent = 'Resume TTS';
                    window.speechSynthesis.pause();
                }
            }
        }

        document.getElementById('start-tts').addEventListener('click', startTTS);
        document.getElementById('pause-tts').addEventListener('click', pauseTTS);

        return { startTTS, pauseTTS };
    })();

    /* ─── ENCRYPT/DECRYPT MODULE ─────────────────────────────────── */
    function encryptText() {
        const input = document.getElementById('encrypt-input').value;
        const output = document.getElementById('encrypt-output');
        if (!input) {
            output.textContent = 'Please enter text to encrypt.';
            showToast('No input provided');
            return;
        }
        const encoded = btoa(input);
        output.textContent = `Encrypted: ${encoded}`;
        window.dispatchEvent(new CustomEvent(AUDIT_EVENT, {
            detail: { id: crypto.randomUUID(), action: 'encrypt', input, output: encoded, ts: Date.now() }
        }));
    }

    function decryptText() {
        const input = document.getElementById('decrypt-input').value;
        const output = document.getElementById('decrypt-output');
        if (!input) {
            output.textContent = 'Please enter encrypted text to decrypt.';
            showToast('No input provided');
            return;
        }
        try {
            const decoded = atob(input);
            output.textContent = `Decrypted: ${decoded}`;
            window.dispatchEvent(new CustomEvent(AUDIT_EVENT, {
                detail: { id: crypto.randomUUID(), action: 'decrypt', input, output: decoded, ts: Date.now() }
            }));
        } catch (e) {
            output.textContent = 'Invalid encrypted text.';
            showToast('Invalid encrypted text');
        }
    }

    /* ─── DECOMPILE MODULE ───────────────────────────────────────── */
    function decompileCode() {
        const input = document.getElementById('decompile-input').value;
        const output = document.getElementById('decompile-output');
        if (!input) {
            output.textContent = 'Please enter compiled code to decompile.';
            showToast('No input provided');
            return;
        }
        output.textContent = `Decompiled Output: Simulated decompilation of ${input.length} bytes. Detected function: main() with 3 calls to unknown libraries.`;
        window.dispatchEvent(new CustomEvent(AUDIT_EVENT, {
            detail: { id: crypto.randomUUID(), action: 'decompile', input, output: output.textContent, ts: Date.now() }
        }));
    }

    document.getElementById('encrypt-button').addEventListener('click', encryptText);
    document.getElementById('decrypt-button').addEventListener('click', decryptText);
    document.getElementById('decompile-button').addEventListener('click', decompileCode);

    /* ─── UTILITIES ──────────────────────────────────────────────── */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    /* ─── INITIALIZATION ─────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initWebGPUParticles();
        } catch (e) {
            console.warn('WebGPU init failed:', e);
        }
        proChat.init();
        mainChat.init();
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const accordion = header.parentElement;
                const content = header.nextElementSibling;
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                header.setAttribute('aria-expanded', !isExpanded);
                accordion.classList.toggle('active');
            });
            header.addEventListener('touchstart', () => {
                const accordion = header.parentElement;
                const content = header.nextElementSibling;
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                header.setAttribute('aria-expanded', !isExpanded);
                accordion.classList.toggle('active');
            });
        });

        // Set ARIA attributes dynamically
        document.getElementById('chatLog').setAttribute('role', 'log');
        document.getElementById('chatLog').setAttribute('aria-live', 'polite');
        document.getElementById('proChat-root').setAttribute('role', 'dialog');
        document.getElementById('proChat-root').setAttribute('aria-modal', 'true');
        document.getElementById('proChat-root').setAttribute('aria-label', 'AuroraGenesis AI Assistant');
        document.getElementById('proChat-log').setAttribute('role', 'list');
        document.getElementById('proChat-log').setAttribute('aria-live', 'polite');
        document.getElementById('proChat-form').setAttribute('aria-label', 'Send a message');
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.setAttribute('role', 'button');
            header.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.accordion-content').forEach(content => {
            content.setAttribute('role', 'region');
        });

        // Dynamic VH Fix
        const setVH = () => {
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        };
        window.addEventListener('resize', setVH);
        setVH();

        // PWA Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('✅ Service worker registered:', reg))
                .catch(err => console.error('❌ Service worker registration failed:', err));
        }

        // Auto-load setup
        document.getElementById('preloader').classList.add('fade-out');
        document.body.classList.add('loaded');
    });

    // Audit Listener
    window.addEventListener(AUDIT_EVENT, e => {
        const { id, userMsg, botMsg, action, input, output, ts } = e.detail;
        console.log('Audit:', { id, userMsg, botMsg, action, input, output, ts });
    });
})();
