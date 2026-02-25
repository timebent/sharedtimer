/* Socket.IO adapted clock client (preserves original sync logic)
     - Uses socket.io for transport
     - Responds to 'sync-response', 'timer-start', 'timer-stop', 'timer-reset' and 'state'
     - Compatible with both old (`start-timer`, `stop-timer`, `reset-timer`, `elapsed`, `time`) and
         new (`start`, `pause`, `rewind`, `clock`, `info`) UI element IDs.
*/
(function () {
    const params = new URLSearchParams(location.search);
    const TOKEN = params.get('token');
    const AUTO_START = true;

    const socket = (typeof io === 'function') ? io() : null;

    // DOM elements (support old and new IDs)
    const status = document.getElementById('status');
    const timeEl = document.getElementById('time');
    const clockEl = document.getElementById('clock');
    const syncBtn = document.getElementById('sync');
    const debugEl = document.getElementById('debug');
    const elapsedEl = document.getElementById('elapsed');
    const infoEl = document.getElementById('info');

    const startBtn = document.getElementById('start') || document.getElementById('start-timer');
    const pauseBtn = document.getElementById('pause') || document.getElementById('stop-timer');
    const rewindBtn = document.getElementById('rewind') || document.getElementById('reset-timer');
    const rewindInput = document.getElementById('rewindSeconds');
    const cuesContainer = document.querySelector('.cues');
    const cueDisplay = document.getElementById('cueDisplay');

    let offset = 0; // server_time - local_time (ms)
    let bestSample = null;
    let pending = new Map();
    let nextId = 1;

    let timerStart = null;
    let timerRunning = false;
    // cue state for flashing UI (local prediction + server events)
    const cueStates = {};
    // define cues (seconds). Flash will start 4 seconds before each cue.
    const localCues = [
        { id: 'cue2', target: 30 },
        { id: 'cue1', target: 45 },
        { id: 'cue3', target: 90 }
    ];
    const FLASH_LEAD = 4; // seconds before cue to start flashing
    let cueCount = 0;
    const counted = new Set();

    // no per-cue buttons in this client; we use a single `cueDisplay`

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

    function setStatus(s) { if (status) status.textContent = s; }

    function sendSync() {
        if (!socket || socket.disconnected) return;
        const id = (nextId++).toString();
        const t0 = Date.now();
        pending.set(id, { t0 });
        const payload = { id, t0 };
        if (TOKEN) payload.token = TOKEN;
        try { socket.emit('sync-request', payload); logDebug('sent sync-request ' + id); } catch (e) { logDebug('send error ' + (e && e.message)); }
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
            setStatus(`offset ${Math.round(offset)}ms, delay ${Math.round(delay)}ms`);
            logDebug(`sample id=${msg.id} offset=${Math.round(offset)} delay=${Math.round(delay)}`);
        }
    }

    let syncTimer = null;
    function startSyncing() {
        if (!socket || socket.disconnected) return;
        const burst = () => { for (let i = 0; i < 6; i++) sendSync(); };
        burst();
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(burst, 5000);
    }
    function stopSyncing() { if (syncTimer) { clearInterval(syncTimer); syncTimer = null; } }

    function formatElapsedMs(ms) {
        if (ms < 0) ms = 0;
        const total = Math.floor(ms);
        const minutes = Math.floor(total / 60000);
        const seconds = Math.floor((total % 60000) / 1000);
        const millis = total % 1000;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }

    function formatClockSeconds(sec) {
        if (!Number.isFinite(sec)) sec = 0;
        sec = Math.max(0, Math.floor(sec));
        const mm = Math.floor(sec / 60).toString().padStart(2, '0');
        const ss = (sec % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    }

    // Recompute cue state (counted/pre/hit) for a given displayed second value.
    // This is used after seeking/starting so cues that occurred before the
    // displayed time are treated as already counted, and upcoming cues can
    // be re-triggered when the timer advances past them.
    function refreshCueState(displayedSeconds) {
        if (!Number.isFinite(displayedSeconds)) displayedSeconds = 0;
        // reset
        counted.clear();
        cueCount = 0;
        Object.keys(cueStates).forEach(k => delete cueStates[k]);
        let anyPre = false;
        localCues.forEach(cue => {
            const lead = (typeof cue.lead === 'number') ? cue.lead : FLASH_LEAD;
            if (displayedSeconds >= cue.target) {
                counted.add(cue.id);
                cueStates[cue.id] = 'hit';
                cueCount++;
            } else if (displayedSeconds >= (cue.target - lead)) {
                cueStates[cue.id] = 'pre';
                anyPre = true;
            }
        });
        if (cueDisplay) {
            cueDisplay.textContent = `Cues: ${cueCount}`;
            cueDisplay.classList.toggle('flash', anyPre);
            cueDisplay.classList.remove('hit');
        }
    }

    function updateElapsedLoop() {
        if (!timerStart || !timerRunning) return;
        const now = Date.now() + offset;
        const elapsed = now - timerStart; // ms
        if (elapsedEl) elapsedEl.textContent = formatElapsedMs(elapsed);
        if (clockEl) clockEl.textContent = formatClockSeconds(Math.floor(elapsed / 1000));
        // local cue detection (based on displayed time) to ensure flash lines up with UI
        const displayedSeconds = elapsed / 1000; // allow fractional comparison
        let anyPre = false;
        localCues.forEach(cue => {
            if (counted.has(cue.id)) return;
            const lead = (typeof cue.lead === 'number') ? cue.lead : FLASH_LEAD;
            // hit detection (only once)
            if (displayedSeconds >= cue.target) {
                counted.add(cue.id);
                cueStates[cue.id] = 'hit';
                cueCount++;
                if (cueDisplay) {
                    cueDisplay.textContent = `Cues: ${cueCount}`;
                    cueDisplay.classList.add('hit');
                    // remove the hit visual after a short moment
                    setTimeout(() => { if (cueDisplay) cueDisplay.classList.remove('hit'); }, 800);
                }
                return;
            }
            // pre-flash window
            if (displayedSeconds >= (cue.target - lead) && displayedSeconds < cue.target) {
                cueStates[cue.id] = 'pre'; anyPre = true;
            }
        });
        // update single cue display flash state (keep hit handling separate)
        if (cueDisplay) {
            cueDisplay.classList.toggle('flash', anyPre);
        }
        requestAnimationFrame(updateElapsedLoop);
    }

    function handleTimerStart(msg) {
        // msg.t is server timestamp in ms
        // msg.elapsed (optional) is server-side elapsed in seconds at that timestamp
        const serverT = Number(msg && msg.t) || Date.now();
        const initialMs = (msg && typeof msg.elapsed === 'number') ? Math.floor(Number(msg.elapsed) * 1000) : 0;
        // timerStart is set so that (Date.now()+offset - timerStart) yields elapsed including initialMs
        timerStart = serverT - initialMs;
        timerRunning = true;
        logDebug('timer-start received t=' + timerStart);
        // refresh cue state based on the current displayed time so past cues are marked correctly
        try {
            const now = Date.now() + offset;
            const displayedSeconds = (now - timerStart) / 1000;
            refreshCueState(displayedSeconds);
        } catch (e) {}
        updateElapsedLoop();
    }
    function handleTimerStop(msg) {
        if (!timerStart) return;
        timerRunning = false;
        const now = Date.now() + offset;
        const elapsed = now - timerStart;
        if (elapsedEl) elapsedEl.textContent = formatElapsedMs(elapsed);
        if (clockEl) clockEl.textContent = formatClockSeconds(Math.floor(elapsed / 1000));
        // update rewind input to paused time (seconds)
        if (rewindInput) {
            try { rewindInput.value = String(Math.floor(elapsed / 1000)); } catch (e) {}
        }
        logDebug('timer-stop received');
    }
    function handleTimerReset(msg) {
        // msg may include { t, elapsed }
        timerStart = null; timerRunning = false;
        // ensure displays reset to zero
        if (elapsedEl) elapsedEl.textContent = '00:00.000';
        if (clockEl) clockEl.textContent = '00:00';
        // reset the rewind input so subsequent Start uses 0
        if (rewindInput) try { rewindInput.value = '0'; } catch (e) {}
        // clear local cue states
        Object.keys(cueStates).forEach(k => delete cueStates[k]);
        // reset cue display
        if (cueDisplay) {
            cueDisplay.classList.remove('flash', 'hit');
            cueDisplay.textContent = 'Cues: 0';
        }
        cueCount = 0; counted.clear();
        logDebug('timer-reset received');
    }

    // handle authoritative state messages (optional)
    if (socket) {
        socket.on('connect', () => {
            setStatus('connected');
            logDebug('socket connected');
            if (AUTO_START) { startSyncing(); if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = 'Syncing...'; } }
        });
        socket.on('disconnect', () => { setStatus('disconnected'); logDebug('socket disconnected'); });
        socket.on('sync-response', handleSyncResponse);
        socket.on('timer-start', handleTimerStart);
        socket.on('timer-stop', handleTimerStop);
        socket.on('timer-reset', handleTimerReset);
        socket.on('cue', (c) => {
            if (!c) return;
            logDebug('cue event ' + JSON.stringify(c));
            // reset
            if (c.phase === 'reset') {
                delete cueStates[c.id || 'cue1'];
                if (cueDisplay) { cueDisplay.classList.remove('flash','hit'); cueDisplay.textContent = 'Cues: 0'; }
                cueCount = 0; counted.clear();
                return;
            }
            if (!c.id) return;
            if (c.phase === 'pre') {
                if (!cueStates[c.id]) cueStates[c.id] = 'pre';
                if (cueDisplay) cueDisplay.classList.add('flash');
            } else if (c.phase === 'hit') {
                cueStates[c.id] = 'hit';
                if (!counted.has(c.id)) {
                    counted.add(c.id);
                    cueCount++;
                    if (cueDisplay) cueDisplay.textContent = `Cues: ${cueCount}`;
                }
            }
        });
        socket.on('state', (s) => {
            if (!s) return;
            // if server asks to snap, set display to server elapsed
            if (s.snap) {
                if (typeof s.elapsed === 'number') {
                    const ms = Math.floor(Number(s.elapsed) * 1000);
                    if (elapsedEl) elapsedEl.textContent = formatElapsedMs(ms);
                    if (clockEl) clockEl.textContent = formatClockSeconds(Math.floor(ms / 1000));
                }
            }
        });
    } else {
        setStatus('no-socket');
    }

    // UI handlers
    if (syncBtn) {
        const handler = () => { logDebug('start sync clicked'); if (socket && socket.connected) startSyncing(); syncBtn.disabled = true; syncBtn.textContent = 'Syncing...'; };
        syncBtn.addEventListener('click', handler);
        syncBtn.addEventListener('touchstart', handler);
    }

    function parseTimeInput(v) {
        // Accept formats: MM:SS(.ms), M:SS, or plain seconds (integer or float)
        if (!v) return null;
        v = String(v).trim();
        // mm:ss or m:ss(.ms)
        const m = v.match(/^\s*(\d+):(\d+(?:\.\d+)?)\s*$/);
        if (m) {
            const minutes = Number(m[1]);
            const seconds = Number(m[2]);
            if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
            return null;
        }
        // plain number (seconds)
        const n = Number(v);
        if (!Number.isNaN(n) && isFinite(n) && n >= 0) return n;
        return null;
    }

    if (startBtn) startBtn.addEventListener('click', () => {
        if (!socket || socket.disconnected) { logDebug('start: socket not connected'); return; }
        const v = rewindInput && rewindInput.value && rewindInput.value.trim();
        if (v) {
            const secs = parseTimeInput(v);
            if (secs !== null) {
                socket.emit('start', secs);
                return;
            }
            logDebug('invalid start value: ' + v);
            return;
        }
        socket.emit('start');
    });
    if (pauseBtn) pauseBtn.addEventListener('click', () => {
        if (timerStart && timerRunning && rewindInput) {
            // compute current elapsed and set the rewind input immediately
            try {
                const now = Date.now() + offset;
                const elapsedMs = now - timerStart;
                rewindInput.value = String(Math.floor(elapsedMs / 1000));
            } catch (e) {}
        }
        // refresh cue UI to reflect paused/seeked time so future cues will retrigger
        try {
            const v = rewindInput && rewindInput.value ? parseTimeInput(rewindInput.value) : null;
            if (v !== null) refreshCueState(Number(v));
        } catch (e) {}
        if (socket && socket.connected) socket.emit('pause'); else logDebug('pause: socket not connected');
    });
    if (rewindBtn) rewindBtn.addEventListener('click', () => {
        // ensure the input is reset locally so Start will use 0
        if (rewindInput) try { rewindInput.value = '0'; } catch (e) {}
        if (socket && socket.connected) socket.emit('rewind'); else { handleTimerReset({}); }
    });


    logDebug('client initialized');
})();
    
