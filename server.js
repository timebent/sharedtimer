/* filepath: /Users/jthompson/Desktop/shared-timer/server.js */
// Static file server + socket.io-based authoritative timer.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server: IOServer } = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Serve files from ./public
  const urlPath = req.url.split('?')[0];
  let filePath;
  if (urlPath === '/' || urlPath === '') filePath = path.join(__dirname, 'public', 'index.html');
  else filePath = path.join(__dirname, 'public', urlPath);

  const ext = path.extname(filePath) || '.html';
  const map = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

const io = new IOServer(server, { cors: { origin: '*' } });

// Load persisted cues (if present)
const cuesPath = path.join(__dirname, 'cues.json');
let cues = [];
try {
  const raw = fs.readFileSync(cuesPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    cues = parsed.map(c => ({ id: String(c.id || Math.random()), target: Number(c.target || 0), lead: (typeof c.lead === 'number') ? c.lead : 4, preEmitted: false, hitEmitted: false }));
  }
} catch (e) {
  // no cues file or parse error; start with empty cues
  cues = [];
}

function emitCueSnapshot(socket) {
  const payload = { cues: cues.map(c => ({ id: c.id, target: c.target, lead: c.lead, preEmitted: !!c.preEmitted, hitEmitted: !!c.hitEmitted })), elapsed, running };
  if (socket) socket.emit('cue-snapshot', payload);
  else io.emit('cue-snapshot', payload);
}

// Authoritative timer state
let running = false;
let elapsed = 0; // seconds (float)
let lastTick = Date.now();

function broadcastState(snap = false) {
  io.emit('state', { elapsed, running, snap });
}

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  // Send immediate snap of current state
  socket.emit('state', { elapsed, running, snap: true });
  // send the current cue snapshot so clients can compute which cues happened
  emitCueSnapshot(socket);

  socket.on('start', (startSeconds) => {
    if (typeof startSeconds === 'number' && Number.isFinite(startSeconds)) {
      elapsed = Math.max(0, Number(startSeconds));
    }
    running = true;
    lastTick = Date.now();
    // announce timer start with authoritative server timestamp
    const t = Date.now();
    // include current elapsed (seconds) so clients can adjust their local base
    io.emit('timer-start', { t, elapsed });
    // recompute which cues have already fired for this elapsed
    cues.forEach(c => {
      c.preEmitted = (elapsed >= (c.target - c.lead));
      c.hitEmitted = (elapsed >= c.target);
    });
    emitCueSnapshot();
    broadcastState(true);
  });

  socket.on('pause', () => {
    // update elapsed to now
    const now = Date.now();
    if (running) elapsed += (now - lastTick) / 1000;
    running = false;
    lastTick = now;
    // announce timer stop
    const t = Date.now();
    io.emit('timer-stop', { t });
    broadcastState(true);
  });

  socket.on('rewind', () => {
    elapsed = 0;
    running = false;
    lastTick = Date.now();
    // announce reset with current elapsed so clients can snap to zero
    const t = Date.now();
    io.emit('timer-reset', { t, elapsed });
    // clear cue emitted flags so they will re-fire as time advances
    cues.forEach(c => { c.preEmitted = false; c.hitEmitted = false; });
    emitCueSnapshot();
    broadcastState(true);
  });

  // Support NTP-like sync requests from socket.io clients
  socket.on('sync-request', (payload) => {
    try {
      const id = payload && payload.id;
      const token = payload && payload.token;
      // token validation could be added here
      const serverReceive = Date.now();
      const serverSend = Date.now();
      socket.emit('sync-response', { id, t1: serverReceive, t2: serverSend });
    } catch (e) {
      // ignore
    }
  });

  socket.on('disconnect', () => {
    // noop
  });
});

// Tick: advance elapsed when running, broadcast regular updates
setInterval(() => {
  const now = Date.now();
  if (running) {
    elapsed += (now - lastTick) / 1000;
  }
  lastTick = now;
  // Broadcast state frequently for smooth clients
  broadcastState(false);
  // cue scheduling: emit pre and hit phases when thresholds are crossed
  cues.forEach(c => {
    if (!c.preEmitted && running && elapsed >= (c.target - c.lead)) {
      const t = Date.now();
      io.emit('cue', { id: c.id, phase: 'pre', t, target: c.target, elapsed });
      c.preEmitted = true;
    }
    if (!c.hitEmitted && running && elapsed >= c.target) {
      const t = Date.now();
      io.emit('cue', { id: c.id, phase: 'hit', t, target: c.target, elapsed });
      c.hitEmitted = true;
    }
  });
}, 200);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
