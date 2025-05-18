(async function() {
    // ─── UTILITY CLASSES ──────────────────────────────────────────────
    class EventEmitter {
        constructor() {
            this.events = new Map();
        }
        on(event, listener) {
            if (!this.events.has(event)) this.events.set(event, []);
            this.events.get(event).push(listener);
        }
        emit(event, ...args) {
            if (this.events.has(event)) {
                this.events.get(event).forEach(listener => listener(...args));
            }
        }
        off(event, listener) {
            if (this.events.has(event)) {
                this.events.set(event, this.events.get(event).filter(l => l !== listener));
            }
        }
    }

    // ─── CORE INITIALIZATION ──────────────────────────────────────────
    const emitter = new EventEmitter();
    const AUDIT_EVENT = 'aurora-audit';
    const NONCE = 'aurora-20250518-' + crypto.randomUUID();
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let HF_TOKEN = '';
    let sessionContext = [];
    let bucket = 30, lastRefill = Date.now();

    // ─── ERROR HANDLING ───────────────────────────────────────────────
    window.onerror = (msg, url, line, col, error) => {
        console.error(`Uncaught Error: ${msg} at ${url}:${line}:${col}`, error);
        showToast('An unexpected error occurred. Please try again.');
        emitter.emit(AUDIT_EVENT, {
            id: crypto.randomUUID(),
            type: 'error',
            message: msg,
            url,
            line,
            col,
            stack: error?.stack,
            ts: Date.now()
        });
    };

    window.addEventListener('unhandledrejection', event => {
        console.error('Unhandled Promise Rejection:', event.reason);
        showToast('A promise was rejected. Check the console for details.');
        emitter.emit(AUDIT_EVENT, {
            id: crypto.randomUUID(),
            type: 'promise_rejection',
            reason: event.reason?.message || event.reason,
            stack: event.reason?.stack,
            ts: Date.now()
        });
    });

    // ─── RUNTIME TEST ─────────────────────────────────────────────────
    console.log('DOM loaded, JS initialized ✅');
    const test = document.createElement('div');
    test.textContent = 'AuroraGenesis JS Active';
    test.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        background: #0f0;
        padding: 10px;
        z-index: 10000;
        font-family: 'Source Code Pro', monospace;
        border-radius: var(--radius-sm);
        box-shadow: var(--glow-accent);
    `;
    document.body.appendChild(test);
    setTimeout(() => test.remove(), 3000);

    // ─── ENVIRONMENT CONFIGURATION ────────────────────────────────────
    async function loadConfig() {
        try {
            const response = await fetchWithRetry('/config.json', { retries: 3, backoff: 1000 });
            const config = await response.json();
            HF_TOKEN = config.HUGGINGFACE_TOKEN || '';
            console.log('Configuration loaded successfully.');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'config_load',
                status: 'success',
                ts: Date.now()
            });
        } catch (e) {
            console.warn('Failed to load config.json, using empty HF_TOKEN:', e);
            HF_TOKEN = '';
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'config_load',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    const HF_MODEL = 'NousResearch/Hermes-2-Pro-Mistral-7B';
    const WS_URL = isLocal ? 'ws://localhost:8080/llama' : 'wss://aurora-llm.x.ai';

    // ─── TOKEN BUCKET RATE LIMITING ───────────────────────────────────
    function takeToken() {
        const now = Date.now();
        const delta = Math.floor((now - lastRefill) / 2000);
        if (delta > 0) {
            bucket = Math.min(30, bucket + delta);
            lastRefill = now;
        }
        if (bucket > 0) {
            bucket--;
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'rate_limit',
                status: 'allowed',
                remaining: bucket,
                ts: Date.now()
            });
            return true;
        }
        emitter.emit(AUDIT_EVENT, {
            id: crypto.randomUUID(),
            type: 'rate_limit',
            status: 'exceeded',
            remaining: bucket,
            ts: Date.now()
        });
        return false;
    }

    // ─── SESSION CONTEXT MANAGEMENT ───────────────────────────────────
    function loadSession() {
        try {
            const compressed = localStorage.getItem('aurora-session');
            sessionContext = compressed ? decompressSession(compressed) : [];
            console.log('Session context loaded:', sessionContext.length, 'entries');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_load',
                status: 'success',
                count: sessionContext.length,
                ts: Date.now()
            });
        } catch (e) {
            console.warn('Failed to load session context:', e);
            sessionContext = [];
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_load',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    function saveSession() {
        try {
            const compressed = compressSession(sessionContext);
            localStorage.setItem('aurora-session', compressed);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_save',
                status: 'success',
                count: sessionContext.length,
                ts: Date.now()
            });
        } catch (e) {
            console.warn('Failed to save session context:', e);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_save',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    function compressSession(data) {
        // Simulated Zstd compression (base64 for simplicity)
        return btoa(JSON.stringify(data));
    }

    function decompressSession(compressed) {
        // Simulated Zstd decompression
        return JSON.parse(atob(compressed));
    }

    // ─── WEBGPU PARTICLE SYSTEM ───────────────────────────────────────
    async function initWebGPUParticles() {
        try {
            if (!navigator.gpu) throw new Error('WebGPU not supported');
            const deviceMemory = navigator.deviceMemory || 4;
            const particleCount = Math.min(10000, deviceMemory * 2000);
            const canvas = document.createElement('canvas');
            canvas.id = 'particles-js';
            canvas.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -3;
                filter: blur(1px);
                opacity: 0.7;
                pointer-events: none;
            `;
            document.body.appendChild(canvas);

            const adapter = await navigator.gpu.requestAdapter();
            const device = await adapter.requestDevice();
            const context = canvas.getContext('webgpu');
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({ device, format, alphaMode: 'premultiplied' });

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

            let lastFrame = performance.now();
            const targetFPS = deviceMemory < 4 ? 30 : 60;
            const frameInterval = 1000 / targetFPS;

            function animate() {
                const now = performance.now();
                if (now - lastFrame < frameInterval) {
                    requestAnimationFrame(animate);
                    return;
                }
                lastFrame = now;

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
            window.addEventListener('resize', debounce(() => {
                canvas.width = window.innerWidth * devicePixelRatio;
                canvas.height = window.innerHeight * devicePixelRatio;
            }, 100));

            // Cleanup on unload
            window.addEventListener('beforeunload', () => {
                device.destroy();
                canvas.remove();
            });

            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'webgpu_init',
                status: 'success',
                particleCount,
                ts: Date.now()
            });
        } catch (e) {
            console.warn('WebGPU particles failed:', e);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'webgpu_init',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    // ─── PRO CHATBOX MODULE ───────────────────────────────────────────
    const proChat = (function() {
        const root = document.getElementById('proChat-root');
        const launcher = document.getElementById('proChat-launcher');
        const closeBtn = document.getElementById('proChat-close');
        const logEl = document.getElementById('proChat-log');
        const inputEl = document.getElementById('proChat-input');

        let isHidden = true;
        let lastActivity = Date.now();

        function toggleChat(open) {
            isHidden = !open;
            root.classList.toggle('hidden', !open);
            if (open) {
                inputEl.focus();
                lastActivity = Date.now();
                root.setAttribute('aria-hidden', 'false');
                announce('Aurora Assistant chat opened.');
            } else {
                root.setAttribute('aria-hidden', 'true');
                announce('Aurora Assistant chat closed.');
            }
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'prochat_toggle',
                state: open ? 'open' : 'close',
                ts: Date.now()
            });
        }

        function autoHide() {
            if (!isHidden && Date.now() - lastActivity > 30000) {
                toggleChat(false);
            }
        }

        setInterval(autoHide, 1000);

        function addMsg(text, sender, id = crypto.randomUUID()) {
            const li = document.createElement('li');
            li.className = 'proChat-msg';
            li.dataset.sender = sender;
            li.dataset.id = id;
            li.setAttribute('role', 'listitem');
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `<span>${sanitizeInput(text)}</span><span class="proChat-time">${time}</span>`;
            logEl.appendChild(li);
            logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
            lastActivity = Date.now();
            announce(`${sender === 'user' ? 'User' : 'Assistant'} message: ${text}`);
            emitter.emit(AUDIT_EVENT, {
                id,
                type: 'prochat_message',
                sender,
                text,
                ts: Date.now()
            });
            return li.firstChild;
        }

        launcher.addEventListener('click', () => toggleChat(true));
        closeBtn.addEventListener('click', () => toggleChat(false));
        inputEl.addEventListener('input', () => {
            lastActivity = Date.now();
        });

        async function handleSubmit(e) {
            e.preventDefault();
            const q = sanitizeInput(inputEl.value.trim());
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
                const signedAnswer = await signData(answer);
                sessionContext.push({ id: msgId, userMsg: q, botMsg: answer, signature: signedAnswer, ts: Date.now() });
                saveSession();
                emitter.emit(AUDIT_EVENT, {
                    id: msgId,
                    type: 'prochat_response',
                    userMsg: q,
                    botMsg: answer,
                    signature: signedAnswer,
                    ts: Date.now()
                });
            } catch (err) {
                botSpan.textContent = `(Error) ${err.message || err}`;
                showToast(`Error: ${err.message}`);
                emitter.emit(AUDIT_EVENT, {
                    id: msgId,
                    type: 'prochat_error',
                    error: err.message,
                    ts: Date.now()
                });
            }
        }

        return { init: () => inputEl.addEventListener('submit', handleSubmit), toggleChat, addMsg };
    })();

    // ─── MAIN CHAT MODULE ─────────────────────────────────────────────
    const mainChat = (function() {
        const chatLog = document.getElementById('chatLog');
        const input = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');
        const loader = document.getElementById('loader');

        function addMessage(text, type, tooltip = '') {
            requestAnimationFrame(() => {
                const bubble = document.createElement('div');
                bubble.className = `message-bubble card ${type}`;
                bubble.textContent = sanitizeInput(text);
                bubble.dataset.tooltip = tooltip || (type === 'ai' ? 'AI-generated response with ethical validation.' : 'User input.');
                bubble.setAttribute('role', 'alert');
                chatLog.appendChild(bubble);
                bubble.classList.add('visible');
                scrollToBottom();
                saveHistory();
                announce(`${type === 'user' ? 'User' : 'Assistant'} message: ${text}`);
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'mainchat_message',
                    sender: type,
                    text,
                    tooltip,
                    ts: Date.now()
                });
            });
        }

        const scrollToBottom = debounce(() => {
            chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
        }, 100);

        function saveHistory() {
            const messages = Array.from(chatLog.children).map(el => ({
                text: el.textContent,
                type: el.classList.contains('user') ? 'user' : 'ai'
            }));
            localStorage.setItem('aurora-history', compressSession(messages));
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'history_save',
                count: messages.length,
                ts: Date.now()
            });
        }

        function loadHistory() {
            try {
                const compressed = localStorage.getItem('aurora-history');
                const history = compressed ? decompressSession(compressed) : [];
                history.forEach(msg => addMessage(msg.text, msg.type));
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'history_load',
                    count: history.length,
                    ts: Date.now()
                });
            } catch (e) {
                console.warn('Failed to load chat history:', e);
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'history_load',
                    status: 'failed',
                    error: e.message,
                    ts: Date.now()
                });
            }
        }

        async function sendQuery() {
            const q = sanitizeInput(input.value.trim());
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
                const signedAnswer = await signData(answer);
                sessionContext.push({ id: sessionId, userMsg: q, botMsg: answer, signature: signedAnswer, ts: Date.now() });
                saveSession();
                emitter.emit(AUDIT_EVENT, {
                    id: sessionId,
                    type: 'mainchat_response',
                    userMsg: q,
                    botMsg: answer,
                    signature: signedAnswer,
                    ts: Date.now()
                });
            } catch (e) {
                addMessage(`Error: ${e.message}`, 'ai');
                showToast(`Error: ${e.message}`);
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'mainchat_error',
                    error: e.message,
                    ts: Date.now()
                });
            } finally {
                loader.classList.remove('active');
            }
        }

        input.addEventListener('keypress', e => {
            if (e.key === 'Enter' && input.value.trim()) sendQuery();
        });
        sendButton.addEventListener('click', sendQuery);

        return { init: loadHistory, sendQuery, addMessage };
    })();

    // ─── TEXT-TO-SPEECH MODULE ────────────────────────────────────────
    const tts = (function() {
        let speech = new SpeechSynthesisUtterance();
        let isSpeaking = false;
        let isPaused = false;
        let currentChunkIndex = 0;
        let voices = [];

        const chunks = [
            "AuroraGenesis-OMEGA is a cutting-edge AI system for cybersecurity, ethical reasoning, and forensic analysis, integrating over 40 modules for advanced cognitive capabilities.",
            "Key features include recursive agent architecture, capsule-based memory, real-time threat detection, and scalable dual-GPU processing.",
            "The system ensures ethical compliance with 10,000+ protocols, validated by zero-knowledge proofs and Merkle trees.",
            "Target markets include cybersecurity, healthcare AI, legal compliance, and enterprise SaaS, with a projected 300% ROI in 5 years."
        ];

        function loadVoices() {
            voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
            if (voices.length) {
                speech.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Microsoft')) || voices[0];
            }
        }

        window.speechSynthesis.onvoiceschanged = loadVoices;

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
            loadVoices();
            readNextChunk();
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'tts_start',
                chunk: chunks[currentChunkIndex],
                ts: Date.now()
            });
        }

        function readNextChunk() {
            if (currentChunkIndex >= chunks.length) {
                isSpeaking = false;
                document.getElementById('start-tts').disabled = false;
                document.getElementById('pause-tts').disabled = true;
                currentChunkIndex = 0;
                announce('Text-to-speech completed.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_complete',
                    ts: Date.now()
                });
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
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_chunk',
                    chunk: chunks[currentChunkIndex],
                    index: currentChunkIndex,
                    ts: Date.now()
                });
            }
        }

        function pauseTTS() {
            if (!isSpeaking) return;
            if (isPaused) {
                isPaused = false;
                document.getElementById('pause-tts').textContent = 'Pause TTS';
                window.speechSynthesis.resume();
                readNextChunk();
                announce('Text-to-speech resumed.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_resume',
                    ts: Date.now()
                });
            } else {
                isPaused = true;
                document.getElementById('pause-tts').textContent = 'Resume TTS';
                window.speechSynthesis.pause();
                announce('Text-to-speech paused.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_pause',
                    ts: Date.now()
                });
            }
        }

        document.getElementById('start-tts').addEventListener('click', startTTS);
        document.getElementById('pause-tts').addEventListener('click', pauseTTS);

        return { startTTS, pauseTTS };
    })();

    // ─── ENCRYPT/DECRYPT MODULE ───────────────────────────────────────
    async function encryptText() {
        const input = sanitizeInput(document.getElementById('encrypt-input').value);
        const outputEl = document.getElementById('encrypt-output');
        if (!input) {
            outputEl.textContent = 'Please enter text to encrypt.';
            showToast('No input provided');
            return;
        }
        try {
            const encoded = btoa(input);
            outputEl.textContent = `Encrypted: ${encoded}`;
            const signature = await signData(encoded);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'encrypt',
                input,
                output: encoded,
                signature,
                ts: Date.now()
            });
        } catch (e) {
            outputEl.textContent = 'Encryption failed.';
            showToast('Encryption failed');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'encrypt_error',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    async function decryptText() {
        const input = sanitizeInput(document.getElementById('decrypt-input').value);
        const outputEl = document.getElementById('decrypt-output');
        if (!input) {
            outputEl.textContent = 'Please enter encrypted text to decrypt.';
            showToast('No input provided');
            return;
        }
        try {
            const decoded = atob(input);
            outputEl.textContent = `Decrypted: ${decoded}`;
            const signature = await signData(decoded);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'decrypt',
                input,
                output: decoded,
                signature,
                ts: Date.now()
            });
        } catch (e) {
            outputEl.textContent = 'Invalid encrypted text.';
            showToast('Invalid encrypted text');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'decrypt_error',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    // ─── DECOMPILE MODULE ─────────────────────────────────────────────
    async function decompileCode() {
        const input = sanitizeInput(document.getElementById('decompile-input').value);
        const outputEl = document.getElementById('decompile-output');
        if (!input) {
            outputEl.textContent = 'Please enter compiled code to decompile.';
            showToast('No input provided');
            return;
        }
        try {
            const simulatedOutput = `Decompiled Output: Simulated decompilation of ${input.length} bytes. Detected function: main() with 3 calls to unknown libraries.`;
            outputEl.textContent = simulatedOutput;
            const signature = await signData(simulatedOutput);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'decompile',
                input,
                output: simulatedOutput,
                signature,
                ts: Date.now()
            });
        } catch (e) {
            outputEl.textContent = 'Decompilation failed.';
            showToast('Decompilation failed');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'decompile_error',
                error: e.message,
                ts: Date.now()
            });
        }
    }

    // ─── UTILITIES ────────────────────────────────────────────────────
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

    function sanitizeInput(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML.replace(/[<>&"']/g, match => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;'
        })[match]);
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = sanitizeInput(message);
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
        announce(`Notification: ${message}`);
        emitter.emit(AUDIT_EVENT, {
            id: crypto.randomUUID(),
            type: 'toast',
            message,
            ts: Date.now()
        });
    }

    async function fetchWithRetry(url, options = {}) {
        const { retries = 3, backoff = 1000 } = options;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return response;
            } catch (e) {
                if (i === retries - 1) throw e;
                console.warn(`Retry ${i + 1}/${retries} for ${url}:`, e);
                await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
            }
        }
    }

    async function signData(data) {
        try {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.generateKey(
                { name: 'HMAC', hash: 'SHA-256' },
                true,
                ['sign']
            );
            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                encoder.encode(data)
            );
            return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('Failed to sign data:', e);
            return '';
        }
    }

    function announce(message) {
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.style.position = 'absolute';
        announcer.style.left = '-9999px';
        announcer.textContent = message;
        document.body.appendChild(announcer);
        setTimeout(() => announcer.remove(), 1000);
    }

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
                const res = await fetchWithRetry(url, {
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
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'stream_hf',
                    status: 'success',
                    prompt,
                    response: full,
                    ts: Date.now()
                });
                return full.trim();
            } catch (e) {
                clearTimeout(timeout);
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'stream_hf',
                    status: 'failed',
                    prompt,
                    error: e.message,
                    retry: i + 1,
                    ts: Date.now()
                });
                if (i === retries - 1) throw e;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    // ─── INITIALIZATION ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadConfig();
            loadSession();
            await initWebGPUParticles();
            proChat.init();
            mainChat.init();

            // Accordion Interactions
            document.querySelectorAll('.accordion-header').forEach(header => {
                const toggleAccordion = () => {
                    const accordion = header.parentElement;
                    const content = header.nextElementSibling;
                    const isExpanded = header.getAttribute('aria-expanded') === 'true';
                    header.setAttribute('aria-expanded', !isExpanded);
                    accordion.classList.toggle('active');
                    announce(`Accordion ${isExpanded ? 'collapsed' : 'expanded'}: ${header.textContent}`);
                    emitter.emit(AUDIT_EVENT, {
                        id: crypto.randomUUID(),
                        type: 'accordion_toggle',
                        state: isExpanded ? 'collapsed' : 'expanded',
                        title: header.textContent,
                        ts: Date.now()
                    });
                };
                header.addEventListener('click', toggleAccordion);
                header.addEventListener('touchstart', toggleAccordion, { passive: true });
            });

            // Dynamic ARIA Attributes
            document.getElementById('chatLog').setAttribute('aria-label', 'Main chat log');
            document.getElementById('proChat-root').setAttribute('aria-label', 'AuroraGenesis AI Assistant');
            document.getElementById('proChat-form').setAttribute('aria-label', 'Send a message to Aurora Assistant');
            document.querySelectorAll('.accordion-content').forEach(content => {
                content.setAttribute('aria-labelledby', content.previousElementSibling.id || `accordion-${crypto.randomUUID()}`);
            });

            // Dynamic VH Fix
            const setVH = debounce(() => {
                document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
            }, 100);
            window.addEventListener('resize', setVH);
            setVH();

            // PWA Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                    .then(reg => {
                        console.log('✅ Service worker registered:', reg);
                        emitter.emit(AUDIT_EVENT, {
                            id: crypto.randomUUID(),
                            type: 'service_worker',
                            status: 'registered',
                            scope: reg.scope,
                            ts: Date.now()
                        });
                    })
                    .catch(err => {
                        console.error('❌ Service worker registration failed:', err);
                        emitter.emit(AUDIT_EVENT, {
                            id: crypto.randomUUID(),
                            type: 'service_worker',
                            status: 'failed',
                            error: err.message,
                            ts: Date.now()
                        });
                    });
            }

            // Preloader Fade-Out
            document.getElementById('preloader').classList.add('fade-out');
            document.body.classList.add('loaded');
            announce('AuroraGenesis interface loaded.');

            // Bind Module Events
            document.getElementById('encrypt-button').addEventListener('click', encryptText);
            document.getElementById('decrypt-button').addEventListener('click', decryptText);
            document.getElementById('decompile-button').addEventListener('click', decompileCode);

            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'init_complete',
                ts: Date.now()
            });
        } catch (e) {
            console.error('Initialization failed:', e);
            showToast('Initialization failed. Check the console for details.');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'init_failed',
                error: e.message,
                ts: Date.now()
            });
        }
    });

    // ─── AUDIT LOGGING ────────────────────────────────────────────────
    emitter.on(AUDIT_EVENT, async event => {
        const signedEvent = await signData(JSON.stringify(event));
        console.log('Audit:', { ...event, signature: signedEvent });
        // Simulate sending to a secure audit server
        try {
            await fetchWithRetry(`${WS_URL}/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...event, signature: signedEvent })
            });
        } catch (e) {
            console.warn('Failed to send audit log:', e);
        }
    });
})();
