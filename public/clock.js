/* filepath: /Users/jthompson/Desktop/shared-timer/public/clock.js */
(() => {
    const status = document.getElementById('status');
    const timeEl = document.getElementById('time');
    const syncBtn = document.getElementById('sync');
    const debugEl = document.getElementById('debug');

    const params = new URLSearchParams(location.search);
    const TOKEN = params.get('token');
    const AUTO_START = true;

    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    let ws = null;
    let offset = 0; // server_time - local_time
    let bestSample = null;

    function logDebug(text) {
        const t = new Date().toISOString();
        const line = `${t} ${text}`;
        if (debugEl) {
            debugEl.textContent = line + '\n' + debugEl.textContent;
            const parts = debugEl.textContent.split('\n').slice(0, 200);
            debugEl.textContent = parts.join('\n');
        }
        if (console && console.log) console.log('[clock-debug]', text);
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            logDebug('WebSocket construct error: ' + (e && e.message));
            return;
        }

        ws.addEventListener('open', () => {
            if (status) status.textContent = 'connected';
            logDebug('ws open');
            if (AUTO_START) {
                startSyncing();
                if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = 'Syncing...'; }
            }
        });

        ws.addEventListener('close', (ev) => {
            if (status) status.textContent = 'disconnected';
            logDebug('ws close ' + (ev && ev.code ? ev.code : ''));
        });

        ws.addEventListener('error', (err) => {
            logDebug('ws error ' + (err && err.message ? err.message : err));
        });

        ws.addEventListener('message', (ev) => {
            const data = String(ev.data || '').slice(0, 2000);
            logDebug('recv ' + data);
            let msg = null;
            try { msg = JSON.parse(ev.data); } catch (e) { logDebug('parse error: ' + (e && e.message)); return; }

            if (msg.type === 'sync-response') handleSyncResponse(msg);
            else if (msg.type === 'sync-error') { logDebug('sync-error: ' + (msg.message || '')); if (status) status.textContent = 'error: ' + (msg.message || ''); }
            else if (msg.type === 'timer-start') handleTimerStart(msg);
            else if (msg.type === 'timer-stop') handleTimerStop(msg);
            else if (msg.type === 'timer-reset') handleTimerReset(msg);
        });
    }

    let pending = new Map();
    let nextId = 1;

    function sendSync() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const id = (nextId++).toString();
        const t0 = Date.now();
        pending.set(id, { t0 });
        const payload = { type: 'sync-request', id, t0 };
        if (TOKEN) payload.token = TOKEN;
        try { ws.send(JSON.stringify(payload)); logDebug('sent sync-request ' + id); } catch (e) { logDebug('send error ' + (e && e.message)); }
    }

    function handleSyncResponse(msg) {
        const now = Date.now();
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        const t0 = p.t0;
        const t1 = msg.t1;
        const t2 = msg.t2;
        const t3 = now;
        const delay = (t3 - t0) - (t2 - t1);
        const off = ((t1 - t0) + (t2 - t3)) / 2;
        if (!bestSample || delay < bestSample.delay) {
            bestSample = { delay, offset: off, at: now };
            offset = off;
            if (status) status.textContent = `offset ${Math.round(offset)}ms, delay ${Math.round(delay)}ms`;
            logDebug(`sample id=${msg.id} offset=${Math.round(offset)} delay=${Math.round(delay)}`);
        }
    }

    let syncTimer = null;
    function startSyncing() {
        if (!ws || ws.readyState !== WebSocket.OPEN) connect();
        const burst = () => { for (let i = 0; i < 6; i++) sendSync(); };
        burst();
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(burst, 5000);
    }

    function stopSyncing() {
        if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    }

    function tick() {
        if (timeEl) {
            const now = new Date(Date.now() + offset);
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            timeEl.textContent = `${hh}:${mm}:${ss}`;
        }
        requestAnimationFrame(tick);
    }

    const elapsedEl = document.getElementById('elapsed');
    const startBtn = document.getElementById('start-timer');
    const stopBtn = document.getElementById('stop-timer');
    const resetBtn = document.getElementById('reset-timer');

    let timerStart = null;
    let timerRunning = false;

    function formatElapsed(ms) {
        if (ms < 0) ms = 0;
        const total = Math.floor(ms);
        const minutes = Math.floor(total / 60000);
        const seconds = Math.floor((total % 60000) / 1000);
        const millis = total % 1000;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }

    function updateElapsed() {
        if (!elapsedEl) return;
        if (!timerStart || !timerRunning) return;
        const now = Date.now() + offset;
        const elapsed = now - timerStart;
        elapsedEl.textContent = formatElapsed(elapsed);
        requestAnimationFrame(updateElapsed);
    }

    function handleTimerStart(msg) {
        timerStart = msg.t;
        timerRunning = true;
        logDebug('timer-start received t=' + msg.t);
        updateElapsed();
    }

    function handleTimerStop(msg) {
        if (!timerStart) return;
        timerRunning = false;
        const now = Date.now() + offset;
        const elapsed = now - timerStart;
        if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsed);
        logDebug('timer-stop received t=' + msg.t + ' elapsed=' + elapsed);
    }

    function handleTimerReset(msg) {
        timerStart = null;
        timerRunning = false;
        if (elapsedEl) elapsedEl.textContent = '00:00.000';
        logDebug('timer-reset received');
    }

    function setupHandlers() {
        if (syncBtn) {
            const handler = () => { logDebug('start button clicked'); if (!ws || ws.readyState !== WebSocket.OPEN) connect(); startSyncing(); syncBtn.disabled = true; syncBtn.textContent = 'Syncing...'; };
            syncBtn.addEventListener('click', handler);
            syncBtn.addEventListener('touchstart', handler);
        }

        if (startBtn) startBtn.addEventListener('click', () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'timer-start', token: TOKEN })); else logDebug('start-timer: ws not open'); });
        if (stopBtn) stopBtn.addEventListener('click', () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'timer-stop', token: TOKEN })); else logDebug('stop-timer: ws not open'); });
        if (resetBtn) resetBtn.addEventListener('click', () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'timer-reset', token: TOKEN })); else handleTimerReset({}); });
    }

    setupHandlers();
    connect();
    tick();
    logDebug('client initialized');
})();
