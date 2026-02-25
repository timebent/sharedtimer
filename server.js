/* filepath: /Users/jthompson/Desktop/shared-timer/server.js */
// Static file server + socket.io-based authoritative timer.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server: IOServer } = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  if (filePath === './') filePath = './public/index.html';
  filePath = path.join(__dirname, filePath);

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

  socket.on('start', (startSeconds) => {
    if (typeof startSeconds === 'number' && Number.isFinite(startSeconds)) {
      elapsed = Math.max(0, Number(startSeconds));
    }
    running = true;
    lastTick = Date.now();
    broadcastState(true);
  });

  socket.on('pause', () => {
    // update elapsed to now
    const now = Date.now();
    if (running) elapsed += (now - lastTick) / 1000;
    running = false;
    lastTick = now;
    broadcastState(true);
  });

  socket.on('rewind', () => {
    elapsed = 0;
    running = false;
    lastTick = Date.now();
    broadcastState(true);
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
}, 200);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
