// Minimal socket.io client for shared timer
(function () {
  const socket = io();

  const clockEl = document.getElementById('clock');
  const startBtn = document.getElementById('start');
  const pauseBtn = document.getElementById('pause');
  const rewindBtn = document.getElementById('rewind');
  const rewindInput = document.getElementById('rewindSeconds');
  const infoEl = document.getElementById('info');
  const cuesContainer = document.querySelector('.cues');
  const cueDisplay = document.getElementById('cueDisplay');
  const logEl = document.getElementById('log');

  let serverElapsed = 0; // seconds
  let displayElapsed = 0; // seconds
  let running = false;
  let lastUpdate = Date.now();

  function fmtTime(sec) {
    if (!Number.isFinite(sec)) sec = 0;
    sec = Math.max(0, Math.floor(sec));
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function render() {
    clockEl.textContent = fmtTime(displayElapsed);
    infoEl.textContent = running ? 'Running' : 'Paused';
  }

  socket.on('state', (s) => {
    if (!s) return;
    if (typeof s.elapsed === 'number') serverElapsed = s.elapsed;
    if (typeof s.running === 'boolean') running = s.running;
    if (s.snap) {
      displayElapsed = serverElapsed;
      lastUpdate = Date.now();
    } else {
      if (!running) displayElapsed = serverElapsed;
    }
    render();
  });

  // Optional simple local cue: flash when reaching 45s
  function checkCues() {
    // update single display: flash when within FLASH_LEAD of any upcoming cue
    let anyPre = false;
    localCues.forEach(cue => {
      if (counted.has(cue.id)) return;
      if (displayElapsed >= (cue.target - FLASH_LEAD) && displayElapsed < cue.target) {
        anyPre = true;
      }
      if (displayElapsed >= cue.target) {
        counted.add(cue.id);
        cueCount++;
        if (cueDisplay) cueDisplay.textContent = `Cues: ${cueCount}`;
        log(`Cue ${cue.id} hit at ${fmtTime(displayElapsed)}`);
      }
    });
    if (cueDisplay) {
      cueDisplay.classList.toggle('flash', anyPre);
    }
  }

  function log(text) {
    if (!logEl) return;
    logEl.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n` + logEl.textContent;
  }

  startBtn.addEventListener('click', () => {
    const v = rewindInput.value.trim();
    if (v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n) && isFinite(n) && n >= 0) socket.emit('start', n);
    } else {
      socket.emit('start');
    }
  });
  pauseBtn.addEventListener('click', () => socket.emit('pause'));
  rewindBtn.addEventListener('click', () => socket.emit('rewind'));

  // Smooth display loop
  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastUpdate) / 1000;
    lastUpdate = now;
    if (running) displayElapsed += dt;
    // nudge toward server value
    const diff = serverElapsed - displayElapsed;
    displayElapsed += diff * 0.2;
    if (!Number.isFinite(displayElapsed) || displayElapsed < 0) displayElapsed = 0;
    render();
    checkCues();
  }, 100);

  log('client initialized');
})();
const socket = io();

// The DOM element that displays the clock
const clock = document.getElementById('clock');
const startBtn = document.getElementById('start');
const pauseBtn = document.getElementById('pause');
const rewindBtn = document.getElementById('rewind');
const rewindInput = document.getElementById('rewindSeconds');
const info = document.getElementById('info');
const cue1Btn = document.getElementById('cue1');
const logEl = document.getElementById('log');

// `state` holds the minimal authoritative flags we care about locally
// - `elapsed` is not kept here; serverElapsed/displayElapsed track the time value
// - `running`: whether the timer is currently running
let state = { elapsed: 0, running: false };
const cueStates = {};
// displayElapsed is the smoothed value shown to the user to avoid jitter
let serverElapsed = 0;
let displayElapsed = 0;
let lastTickTime = Date.now();
// Timing values
// - `serverElapsed`: most recent elapsed value received from the server
// - `displayElapsed`: the value shown to the user (a smoothed/interpolated value)
// - `lastTickTime`: timestamp for the last local update used to compute dt
let waitingForSnap = false;
// local cue definitions to trigger UI in sync with display
// Local cue definitions are used so the UI can flash in tight sync with the
// displayed time (instead of relying solely on discrete server events).
// Each cue has an `id`, `target` second, and `lead` seconds to start the pre-flash.
// cues in seconds; flash starts 4s before each cue
const localCues = [ { id: 'cue2', target: 30 }, { id: 'cue1', target: 45 }, { id: 'cue3', target: 90 } ];
const FLASH_LEAD = 4;
let cueCount = 0;
const counted = new Set();

function setupCueButtons() {
  if (!cuesContainer) return;
  localCues.forEach(cue => {
    let btn = document.getElementById(cue.id);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = cue.id;
      btn.className = 'cue';
      btn.textContent = 'CUE 0';
      cuesContainer.appendChild(btn);
    }
    cueButtons[cue.id] = btn;
  });
}
setupCueButtons();

// Format seconds as MM:SS. Defensively handle non-finite inputs.
function fmtTime(s) {
  if (!Number.isFinite(s)) s = 0;
  s = Math.max(0, Math.round(s));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// Render the UI from the current display state.
// We show `displayElapsed` (smoothed) to avoid jitter when server updates arrive.
function render() {
  clock.textContent = fmtTime(displayElapsed);
  info.textContent = `${state.running ? 'Running' : 'Paused'}`;
  // render cue button state
  // update UI for all cue buttons
  Object.keys(cueButtons).forEach(id => {
    const btn = cueButtons[id];
    const st = cueStates[id];
    if (!btn) return;
    btn.classList.toggle('flash', st === 'pre');
    btn.classList.toggle('hit', st === 'hit');
    if (st === 'hit') btn.textContent = 'CUE 1';
    else btn.textContent = 'CUE 0';
  });
}

socket.on('state', (s) => {
  // update serverElapsed and running state; keep state in sync
  if (typeof s.elapsed === 'number' && Number.isFinite(s.elapsed)) serverElapsed = s.elapsed;
  else if (typeof s.remaining === 'number' && typeof s.total === 'number') {
    const rem = Number(s.remaining);
    const tot = Number(s.total);
    if (Number.isFinite(rem) && Number.isFinite(tot)) serverElapsed = Math.max(0, tot - rem);
  }
  if (typeof s.running === 'boolean') state.running = s.running;

  // If server asks to snap (start-with-time or rewind), immediately set display to server value
  if (s && s.snap) {
    displayElapsed = serverElapsed;
    lastTickTime = Date.now();
  } else {
    // If paused, snap display to server value to avoid drift; otherwise smooth toward it
    if (!state.running) displayElapsed = serverElapsed;
  }
  // ensure display isn't NaN
  if (!Number.isFinite(displayElapsed)) displayElapsed = 0;
  render();
});

socket.on('cue', (c) => {
  if (!c) return;
  console.log('cue event', c);
  if (logEl) {
    const txt = `[${new Date().toLocaleTimeString()}] cue ${c.id || ''} ${c.phase}`;
    logEl.textContent = txt;
  }
  // reset signal
  if (c.phase === 'reset') {
    delete cueStates[c.id || 'cue1'];
    // reset single cue display
    if (cueDisplay) { cueDisplay.classList.remove('flash','hit'); cueDisplay.textContent = 'Cues: 0'; }
    cueCount = 0; counted.clear();
    render();
    return;
  }
  if (!c.id) return;
  // let server events inform state if needed, but we prefer local timing for flash
  if (c.phase === 'pre') {
    if (!cueStates[c.id]) cueStates[c.id] = 'pre';
  } else if (c.phase === 'hit') {
    cueStates[c.id] = 'hit';
  }
  // update corresponding button immediately
  const btn = cueButtons[c.id];
  // reflect on single display
  if (cueDisplay) {
    const st = cueStates[c.id];
    cueDisplay.classList.toggle('flash', st === 'pre');
    if (st === 'hit') {
      cueCount++;
      cueDisplay.textContent = `Cues: ${cueCount}`;
    }
  }
  render();
});

startBtn.addEventListener('click', () => {
  const t = prompt('Start from seconds (leave blank to start/resume from 0/current):');
  if (t) {
    const n = Number(t);
    if (!Number.isNaN(n) && n >= 0) socket.emit('start', n);
  } else {
    // if not providing a number, start/resume — server will start from current elapsed (or 0)
    socket.emit('start');
  }
});

pauseBtn.addEventListener('click', () => {
  socket.emit('pause');
});

rewindBtn.addEventListener('click', () => {
  // Rewind now resets to zero on the server
  socket.emit('rewind');
});

// smooth update loop: increment displayElapsed locally and slowly correct toward serverElapsed
setInterval(() => {
  const now = Date.now();
  const dt = Math.max(0, (now - lastTickTime) / 1000);
  lastTickTime = now;
  if (state.running) {
    displayElapsed += dt;
  }
  // smooth correction toward server value to remove jitter (lerp factor)
  const diff = serverElapsed - displayElapsed;
  displayElapsed += diff * 0.2;
  // clamp
  if (!Number.isFinite(displayElapsed) || displayElapsed < 0) displayElapsed = 0;
  // local cue detection (based on displayed time) to ensure flash lines up with UI
  localCues.forEach(cue => {
    const cur = displayElapsed;
    if (!cueStates[cue.id]) {
      if (cur >= (cue.target - cue.lead) && cur < cue.target) {
        cueStates[cue.id] = 'pre';
      }
    }
    if (cueStates[cue.id] !== 'hit' && cur >= cue.target) {
      cueStates[cue.id] = 'hit';
    }
  });
  render();
}, 100);
