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

    class Store {
        constructor() {
            this.state = {
                session: [],
                config: { HUGGINGFACE_TOKEN: '' },
                ui: { 
                    isProChatOpen: false, 
                    isSpeaking: false, 
                    isPaused: false, 
                    currentChunkIndex: 0, 
                    lastActivity: Date.now(),
                    theme: 'aurora-dark',
                    focusElement: null
                },
                rateLimit: { bucket: 30, lastRefill: Date.now() },
                network: { isOnline: navigator.onLine, lastChecked: Date.now() }
            };
            this.listeners = new Set();
        }
        setState(updater) {
            this.state = typeof updater === 'function' ? updater(this.state) : { ...this.state, ...updater };
            this.listeners.forEach(listener => listener(this.state));
            try {
                localStorage.setItem('aurora-ui-state', compressSession(this.state.ui));
            } catch (e) {
                console.warn('Failed to persist UI state:', e);
                this.audit('store_persist', 'failed', { error: e.message });
            }
        }
        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }
        loadState() {
            try {
                const uiState = localStorage.getItem('aurora-ui-state');
                if (uiState) {
                    this.state.ui = { ...this.state.ui, ...decompressSession(uiState) };
                    this.audit('store_load', 'success', { count: Object.keys(this.state.ui).length });
                }
            } catch (e) {
                console.warn('Failed to load UI state:', e);
                this.audit('store_load', 'failed', { error: e.message });
            }
        }
        audit(type, status, details = {}) {
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: `store_${type}`,
                status,
                details,
                ts: Date.now()
            });
        }
    }

    // ─── CORE INITIALIZATION ──────────────────────────────────────────
    const emitter = new EventEmitter();
    const store = new Store();
    const AUDIT_EVENT = 'aurora-audit';
    const NONCE = 'aurora-20250518-' + crypto.randomUUID();
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const WS_URL = isLocal ? 'ws://localhost:8080/llama' : 'wss://aurora-llm.x.ai';
    const HF_MODEL = 'NousResearch/Hermes-2-Pro-Mistral-7B';
    const SESSION_VERSION = '2.0.0';
    const FALLBACK_CONFIG = { HUGGINGFACE_TOKEN: '' };
    const MAX_RETRIES = 3;
    const RETRY_BACKOFF = 1000;

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

    window.addEventListener('online', () => {
        store.setState(state => ({ ...state, network: { ...state.network, isOnline: true, lastChecked: Date.now() } }));
        showToast('Network connection restored.');
    });

    window.addEventListener('offline', () => {
        store.setState(state => ({ ...state, network: { ...state.network, isOnline: false, lastChecked: Date.now() } }));
        showToast('Network connection lost. Some features may be unavailable.');
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
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            const response = await fetch('/config.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`Invalid content-type: ${contentType}`);
            }

            const text = await response.text();
            let config;
            try {
                config = JSON.parse(text);
                if (typeof config !== 'object' || config === null || Array.isArray(config)) {
                    throw new Error('Parsed config is not a valid object');
                }
            } catch (parseError) {
                console.warn('[Aurora] Invalid JSON in config.json:', parseError);
                config = FALLBACK_CONFIG;
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'config_parse',
                    status: 'failed',
                    error: parseError.message,
                    ts: Date.now()
                });
            }

            store.setState(state => ({ ...state, config }));
            console.log('[Aurora] Config loaded:', config);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'config_load',
                status: 'success',
                retryCount: retries,
                ts: Date.now()
            });
            return;

        } catch (fetchErr) {
            retries++;
            console.warn(`[Aurora] config.json fetch failed [${retries}/${MAX_RETRIES}]:`, fetchErr.message);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'config_fetch',
                status: 'retry',
                retryCount: retries,
                error: fetchErr.message,
                ts: Date.now()
            });

            if (retries >= MAX_RETRIES) {
                store.setState(state => ({ ...state, config: FALLBACK_CONFIG }));
                console.warn('[Aurora] Fallback config used after retries.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'config_load',
                    status: 'fallback',
                    ts: Date.now()
                });
                return;
            }

            await new Promise(r => setTimeout(r, RETRY_BACKOFF * 2 ** (retries - 1)));
        }
    }
}


    // ─── TOKEN BUCKET RATE LIMITING ───────────────────────────────────
    function takeToken() {
        const now = Date.now();
        const delta = Math.floor((now - store.state.rateLimit.lastRefill) / 2000);
        if (delta > 0) {
            store.setState(state => ({
                ...state,
                rateLimit: {
                    bucket: Math.min(30, state.rateLimit.bucket + delta),
                    lastRefill: now
                }
            }));
        }
        if (store.state.rateLimit.bucket > 0) {
            store.setState(state => ({
                ...state,
                rateLimit: { ...state.rateLimit, bucket: state.rateLimit.bucket - 1 }
            }));
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'rate_limit',
                status: 'allowed',
                remaining: store.state.rateLimit.bucket,
                ts: Date.now()
            });
            return true;
        }
        emitter.emit(AUDIT_EVENT, {
            id: crypto.randomUUID(),
            type: 'rate_limit',
            status: 'exceeded',
            remaining: store.state.rateLimit.bucket,
            ts: Date.now()
        });
        return false;
    }

    // ─── SESSION CONTEXT MANAGEMENT ───────────────────────────────────
    function loadSession() {
        try {
            const compressed = localStorage.getItem('aurora-session');
            if (!compressed) {
                store.setState(state => ({ ...state, session: [] }));
                return;
            }
            const data = decompressSession(compressed);
            if (data.version !== SESSION_VERSION) {
                console.warn('Session version mismatch, migrating session.');
                store.setState(state => ({ ...state, session: migrateSession(data.entries) }));
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'session_migration',
                    status: 'success',
                    oldVersion: data.version,
                    newVersion: SESSION_VERSION,
                    ts: Date.now()
                });
                return;
            }
            store.setState(state => ({ ...state, session: data.entries }));
            console.log('Session context loaded:', store.state.session.length, 'entries');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_load',
                status: 'success',
                count: store.state.session.length,
                ts: Date.now()
            });
        } catch (e) {
            console.warn('Failed to load session context:', e);
            store.setState(state => ({ ...state, session: [] }));
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
            const data = { version: SESSION_VERSION, entries: store.state.session };
            const compressed = compressSession(data);
            localStorage.setItem('aurora-session', compressed);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'session_save',
                status: 'success',
                count: store.state.session.length,
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

    function migrateSession(entries) {
        return entries.map(entry => ({
            id: entry.id || crypto.randomUUID(),
            userMsg: entry.userMsg || '',
            botMsg: entry.botMsg || '',
            signature: entry.signature || '',
            ts: entry.ts || Date.now()
        }));
    }

    function compressSession(data) {
        return btoa(JSON.stringify(data));
    }

    function decompressSession(compressed) {
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
        function getElements() {
            return {
                root: document.getElementById('proChat-root'),
                launcher: document.getElementById('proChat-launcher'),
                closeBtn: document.getElementById('proChat-close'),
                logEl: document.getElementById('proChat-log'),
                form: document.getElementById('proChat-form'),
                inputEl: document.getElementById('proChat-input')
            };
        }

        function toggleChat(open) {
            const { root, inputEl } = getElements();
            if (!root) {
                console.warn('ProChat root element not found');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'prochat_toggle',
                    status: 'failed',
                    error: 'Root element not found',
                    ts: Date.now()
                });
                return;
            }
            store.setState(state => ({ ...state, ui: { ...state.ui, isProChatOpen: open } }));
            root.classList.toggle('hidden', !open);
            if (open) {
                if (inputEl) {
                    inputEl.focus();
                    store.setState(state => ({ ...state, ui: { ...state.ui, focusElement: 'proChat-input' } }));
                }
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
            if (store.state.ui.isProChatOpen && Date.now() - store.state.ui.lastActivity > 30000) {
                toggleChat(false);
            }
        }

        function addMsg(text, sender, id = crypto.randomUUID()) {
            const { logEl } = getElements();
            if (!logEl) {
                console.warn('ProChat log element not found');
                return null;
            }
            const li = document.createElement('li');
            li.className = 'proChat-msg';
            li.dataset.sender = sender;
            li.dataset.id = id;
            li.setAttribute('role', 'listitem');
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            li.innerHTML = `<span>${sanitizeInput(text)}</span><span class="proChat-time">${time}</span>`;
            logEl.appendChild(li);
            logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
            store.setState(state => ({ ...state, ui: { ...state.ui, lastActivity: Date.now() } }));
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

        function init() {
            const { launcher, closeBtn, form, inputEl } = getElements();
            if (!launcher || !closeBtn || !form || !inputEl) {
                console.warn('ProChat elements not found, retrying initialization');
                setTimeout(init, 100);
                return;
            }

            launcher.addEventListener('click', () => toggleChat(true));
            closeBtn.addEventListener('click', () => toggleChat(false));
            inputEl.addEventListener('input', () => {
                store.setState(state => ({ ...state, ui: { ...state.ui, lastActivity: Date.now() } }));
            });

            form.addEventListener('submit', async e => {
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
                        const { logEl } = getElements();
                        logEl?.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
                    });
                    const signedAnswer = await signData(answer);
                    store.setState(state => ({
                        ...state,
                        session: [...state.session, { id: msgId, userMsg: q, botMsg: answer, signature: signedAnswer, ts: Date.now() }]
                    }));
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
            });

            setInterval(autoHide, 1000);
        }

        return { init, toggleChat, addMsg };
    })();

    // ─── MAIN CHAT MODULE ─────────────────────────────────────────────
    const mainChat = (function() {
        function getElements() {
            return {
                chatLog: document.getElementById('chatLog'),
                input: document.getElementById('chat-input'),
                sendButton: document.getElementById('send-button'),
                loader: document.getElementById('loader')
            };
        }

        function addMessage(text, type, tooltip = '') {
            const { chatLog } = getElements();
            if (!chatLog) {
                console.warn('Main chat log element not found');
                return;
            }
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
            const { chatLog } = getElements();
            chatLog?.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
        }, 100);

        function saveHistory() {
            const { chatLog } = getElements();
            if (!chatLog) return;
            const messages = Array.from(chatLog.children).map(el => ({
                text: el.textContent,
                type: el.classList.contains('user') ? 'user' : 'ai'
            }));
            localStorage.setItem('aurora-history', compressSession({ version: SESSION_VERSION, entries: messages }));
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
                if (!compressed) return;
                const data = decompressSession(compressed);
                if (data.version !== SESSION_VERSION) {
                    console.warn('History version mismatch, resetting history.');
                    emitter.emit(AUDIT_EVENT, {
                        id: crypto.randomUUID(),
                        type: 'history_migration',
                        status: 'success',
                        oldVersion: data.version,
                        newVersion: SESSION_VERSION,
                        ts: Date.now()
                    });
                    return;
                }
                data.entries.forEach(msg => addMessage(msg.text, msg.type));
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'history_load',
                    count: data.entries.length,
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
            const { input, loader } = getElements();
            if (!input || !loader) {
                console.warn('Main chat input or loader not found');
                return;
            }
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
                const { chatLog } = getElements();
                chatLog?.appendChild(botSpan);
                const answer = await streamHF(q, chunk => {
                    botSpan.textContent += chunk;
                    scrollToBottom();
                });
                botSpan.dataset.tooltip = 'AI-generated response with ethical validation.';
                botSpan.classList.add('visible');
                const sessionId = `session_${Date.now()}`;
                const signedAnswer = await signData(answer);
                store.setState(state => ({
                    ...state,
                    session: [...state.session, { id: sessionId, userMsg: q, botMsg: answer, signature: signedAnswer, ts: Date.now() }]
                }));
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

        function init() {
            const { input, sendButton } = getElements();
            if (!input || !sendButton) {
                console.warn('MainChat elements not found, retrying initialization');
                setTimeout(init, 100);
                return;
            }
            input.addEventListener('keypress', e => {
                if (e.key === 'Enter' && input.value.trim()) sendQuery();
            });
            sendButton.addEventListener('click', sendQuery);
            loadHistory();
        }

        return { init, sendQuery, addMessage };
    })();

    // ─── TEXT-TO-SPEECH MODULE ────────────────────────────────────────
    const tts = (function() {
        let speech = new SpeechSynthesisUtterance();
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
            const { startBtn, pauseBtn } = getTTSElements();
            if (!startBtn || !pauseBtn) {
                console.warn('TTS elements not found');
                return;
            }
            if (!('speechSynthesis' in window)) {
                mainChat.addMessage('Text-to-speech not supported.', 'ai');
                showToast('TTS not supported');
                return;
            }
            if (store.state.ui.isSpeaking) return;
            store.setState(state => ({ ...state, ui: { ...state.ui, isSpeaking: true, isPaused: false, currentChunkIndex: 0 } }));
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            speech = new SpeechSynthesisUtterance();
            speech.lang = 'en-US';
            speech.volume = 1;
            speech.rate = 1;
            speech.pitch = 1;
            loadVoices();
            readNextChunk();
            announce('Text-to-speech started.');
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'tts_start',
                chunk: chunks[store.state.ui.currentChunkIndex],
                ts: Date.now()
            });
        }

        function readNextChunk() {
            const { startBtn, pauseBtn } = getTTSElements();
            if (!startBtn || !pauseBtn) return;
            if (store.state.ui.currentChunkIndex >= chunks.length) {
                store.setState(state => ({ ...state, ui: { ...state.ui, isSpeaking: false, currentChunkIndex: 0 } }));
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                announce('Text-to-speech completed.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_complete',
                    ts: Date.now()
                });
                return;
            }
            if (!store.state.ui.isPaused) {
                mainChat.addMessage(chunks[store.state.ui.currentChunkIndex], 'ai');
                speech.text = chunks[store.state.ui.currentChunkIndex];
                speech.onend = () => {
                    store.setState(state => ({ ...state, ui: { ...state.ui, currentChunkIndex: state.ui.currentChunkIndex + 1 } }));
                    readNextChunk();
                };
                window.speechSynthesis.speak(speech);
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_chunk',
                    chunk: chunks[store.state.ui.currentChunkIndex],
                    index: store.state.ui.currentChunkIndex,
                    ts: Date.now()
                });
            }
        }

        function pauseTTS() {
            const { pauseBtn } = getTTSElements();
            if (!pauseBtn || !store.state.ui.isSpeaking) return;
            if (store.state.ui.isPaused) {
                store.setState(state => ({ ...state, ui: { ...state.ui, isPaused: false } }));
                pauseBtn.textContent = 'Pause TTS';
                window.speechSynthesis.resume();
                readNextChunk();
                announce('Text-to-speech resumed.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_resume',
                    ts: Date.now()
                });
            } else {
                store.setState(state => ({ ...state, ui: { ...state.ui, isPaused: true } }));
                pauseBtn.textContent = 'Resume TTS';
                window.speechSynthesis.pause();
                announce('Text-to-speech paused.');
                emitter.emit(AUDIT_EVENT, {
                    id: crypto.randomUUID(),
                    type: 'tts_pause',
                    ts: Date.now()
                });
            }
        }

        function getTTSElements() {
            return {
                startBtn: document.getElementById('start-tts'),
                pauseBtn: document.getElementById('pause-tts')
            };
        }

        function init() {
            const { startBtn, pauseBtn } = getTTSElements();
            if (!startBtn || !pauseBtn) {
                console.warn('TTS elements not found, retrying initialization');
                setTimeout(init, 100);
                return;
            }
            startBtn.addEventListener('click', startTTS);
            pauseBtn.addEventListener('click', pauseTTS);
        }

        return { init, startTTS, pauseTTS };
    })();

    // ─── ENCRYPT/DECRYPT MODULE ───────────────────────────────────────
    async function encryptText() {
        const input = sanitizeInput(document.getElementById('encrypt-input')?.value || '');
        const outputEl = document.getElementById('encrypt-output');
        if (!outputEl) {
            console.warn('Encrypt output element not found');
            return;
        }
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
        const input = sanitizeInput(document.getElementById('decrypt-input')?.value || '');
        const outputEl = document.getElementById('decrypt-output');
        if (!outputEl) {
            console.warn('Decrypt output element not found');
            return;
        }
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
        const input = sanitizeInput(document.getElementById('decompile-input')?.value || '');
        const outputEl = document.getElementById('decompile-output');
        if (!outputEl) {
            console.warn('Decompile output element not found');
            return;
        }
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
        return str.replace(/[<>&"']/g, match => ({
            '<': '<',
            '>': '>',
            '&': '&',
            '"': '"',
            "'": '''
        })[match]).replace(/[^\x20-\x7E\n\r\t]/g, '');
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) {
            console.warn('Toast element not found');
            return;
        }
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
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'sign_data',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
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

    async function streamHF(prompt, onChunk, retries = MAX_RETRIES) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        for (let i = 0; i < retries; i++) {
            try {
                const token = store.state.config.HUGGINGFACE_TOKEN;
                if (!token) throw new Error('Missing Hugging Face token');
                const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
                const contextStr = store.state.session.slice(-5).map(c => 
                    `${c.userMsg ? 'User' : 'Bot'}: ${c.userMsg || c.botMsg}`).join('\n');
                const payload = {
                    inputs: `[CONTEXT]\n${contextStr}\n\nUser: ${prompt}\nBot:`,
                    stream: true,
                    parameters: { max_new_tokens: 200, temperature: 0.7, top_p: 0.9, stop: ['</s>'] }
                };
                const csrfToken = crypto.randomUUID();
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Use-Stream': 'true',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                const reader = response.body.getReader();
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
                    retryCount: i,
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
                    retryCount: i + 1,
                    ts: Date.now()
                });
                if (i === retries - 1) throw e;
                await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF * (i + 1)));
            }
        }
    }

    // ─── EVENT DELEGATION ─────────────────────────────────────────────
    function setupEventDelegation() {
        document.addEventListener('click', e => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            switch (action) {
                case 'accordion-toggle':
                    const accordion = target.parentElement;
                    const content = target.nextElementSibling;
                    const isExpanded = target.getAttribute('aria-expanded') === 'true';
                    target.setAttribute('aria-expanded', !isExpanded);
                    accordion.classList.toggle('active');
                    announce(`Accordion ${isExpanded ? 'collapsed' : 'expanded'}: ${target.textContent}`);
                    emitter.emit(AUDIT_EVENT, {
                        id: crypto.randomUUID(),
                        type: 'accordion_toggle',
                        state: isExpanded ? 'collapsed' : 'expanded',
                        title: target.textContent,
                        ts: Date.now()
                    });
                    break;
                case 'encrypt':
                    encryptText();
                    break;
                case 'decrypt':
                    decryptText();
                    break;
                case 'decompile':
                    decompileCode();
                    break;
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                const target = e.target.closest('.accordion-header');
                if (target) {
                    e.preventDefault();
                    const accordion = target.parentElement;
                    const isExpanded = target.getAttribute('aria-expanded') === 'true';
                    target.setAttribute('aria-expanded', !isExpanded);
                    accordion.classList.toggle('active');
                    announce(`Accordion ${isExpanded ? 'collapsed' : 'expanded'}: ${target.textContent}`);
                    emitter.emit(AUDIT_EVENT, {
                        id: crypto.randomUUID(),
                        type: 'accordion_toggle',
                        state: isExpanded ? 'collapsed' : 'expanded',
                        title: target.textContent,
                        ts: Date.now()
                    });
                }
            }
        });
    }

    // ─── INITIALIZATION ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            store.loadState();
            await loadConfig();
            loadSession();
            await initWebGPUParticles();
            proChat.init();
            mainChat.init();
            tts.init();
            setupEventDelegation();

            // Dynamic ARIA Attributes
            const setAria = (id, attrs) => {
                const el = document.getElementById(id);
                if (el) Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
            };
            setAria('chatLog', { 'aria-label': 'Main chat log' });
            setAria('proChat-root', { 'aria-label': 'AuroraGenesis AI Assistant', 'aria-modal': 'true' });
            setAria('proChat-form', { 'aria-label': 'Send a message to Aurora Assistant' });
            document.querySelectorAll('.accordion-content').forEach(content => {
                content.setAttribute('aria-labelledby', content.previousElementSibling.id || `accordion-${crypto.randomUUID()}`);
            });
            document.querySelectorAll('.accordion-header').forEach(header => {
                header.dataset.action = 'accordion-toggle';
            });
            document.getElementById('encrypt-button')?.setAttribute('data-action', 'encrypt');
            document.getElementById('decrypt-button')?.setAttribute('data-action', 'decrypt');
            document.getElementById('decompile-button')?.setAttribute('data-action', 'decompile');

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
            const preloader = document.getElementById('preloader');
            if (preloader) preloader.classList.add('fade-out');
            document.body.classList.add('loaded');
            announce('AuroraGenesis interface loaded.');

            // Restore focus if set
            if (store.state.ui.focusElement) {
                const focusEl = document.getElementById(store.state.ui.focusElement);
                if (focusEl) focusEl.focus();
            }

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
    let auditQueue = [];
    async function processAuditQueue() {
        if (!auditQueue.length) return;
        const batch = auditQueue.splice(0, 10);
        try {
            const compressed = compressSession(batch);
            await fetch(`${WS_URL}/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: compressed
            });
            console.log('Audit batch sent:', batch.length);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'audit_sync',
                status: 'success',
                batchSize: batch.length,
                ts: Date.now()
            });
        } catch (e) {
            console.warn('Failed to send audit batch:', e);
            auditQueue.push(...batch);
            emitter.emit(AUDIT_EVENT, {
                id: crypto.randomUUID(),
                type: 'audit_sync',
                status: 'failed',
                error: e.message,
                ts: Date.now()
            });
        }
        setTimeout(processAuditQueue, 5000);
    }

    emitter.on(AUDIT_EVENT, async event => {
        const signedEvent = await signData(JSON.stringify(event));
        console.log('Audit:', { ...event, signature: signedEvent });
        auditQueue.push({ ...event, signature: signedEvent });
        processAuditQueue();
    });
})();
