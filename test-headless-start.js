const io = require('socket.io-client');
const socket = io('http://localhost:3000');

console.log('connecting...');
let gotState = false;
let timer = null;

socket.on('connect', () => {
  console.log('connected', socket.id);
  // emit start at 5 seconds
  console.log('emitting start(5)');
  socket.emit('start', 5);
  // collect states for 3 seconds
  timer = setTimeout(() => {
    console.log('done, disconnecting');
    socket.disconnect();
    process.exit(0);
  }, 3000);
});

socket.on('state', (s) => {
  console.log('state', s);
});

socket.on('timer-start', (t) => {
  console.log('timer-start', t);
});

socket.on('timer-stop', (t) => {
  console.log('timer-stop', t);
});

socket.on('timer-reset', (t) => {
  console.log('timer-reset', t);
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err.message);
  process.exit(1);
});
