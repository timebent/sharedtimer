const io = require('socket.io-client');
const socket = io('http://localhost:3000');
console.log('connecting...');

socket.on('connect', () => {
  console.log('connected', socket.id);
  console.log('emitting rewind');
  socket.emit('rewind');
  setTimeout(() => {
    console.log('emitting start (no arg) after 500ms');
    socket.emit('start');
  }, 500);
  setTimeout(() => {
    console.log('done, disconnecting');
    socket.disconnect();
    process.exit(0);
  }, 3000);
});

socket.on('timer-reset', (t) => console.log('timer-reset', t));
socket.on('timer-start', (t) => console.log('timer-start', t));
socket.on('state', (s) => console.log('state', s));

socket.on('connect_error', (err) => { console.error('connect_error', err.message); process.exit(1); });
