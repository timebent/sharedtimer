const io = require('socket.io-client');
const s = io('http://localhost:3000');

s.on('connect', () => console.log('connected', s.id));
 s.on('disconnect', () => console.log('disconnected'));
 s.on('cue', (c) => console.log('cue', c));
 s.on('cue-snapshot', (m) => console.log('snapshot', JSON.stringify(m)));
 s.on('state', (st) => {});

// keep process alive
setInterval(() => {}, 1000);
