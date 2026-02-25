// Headless test client: connects two clients and exercises start/pause/rewind
const { io } = require('socket.io-client');

function makeClient(name) {
  const socket = io('http://localhost:3000');
  socket.on('connect', () => console.log(`${name} connected`));
  socket.on('state', (s) => console.log(`${name} state: running=${s.running} elapsed=${s.elapsed.toFixed(2)} snap=${s.snap}`));
  socket.on('disconnect', () => console.log(`${name} disconnected`));
  return socket;
}

(async () => {
  const a = makeClient('A');
  const b = makeClient('B');

  // wait for connections
  await new Promise(r => setTimeout(r, 500));

  console.log('Client A -> start (from 0)');
  a.emit('start');

  await new Promise(r => setTimeout(r, 3000));
  console.log('Client B -> pause');
  b.emit('pause');

  await new Promise(r => setTimeout(r, 2000));
  console.log('Client A -> start from 5');
  a.emit('start', 5);

  await new Promise(r => setTimeout(r, 3000));
  console.log('Client B -> rewind');
  b.emit('rewind');

  await new Promise(r => setTimeout(r, 1000));
  a.close();
  b.close();
  console.log('Test complete');
  process.exit(0);
})();
