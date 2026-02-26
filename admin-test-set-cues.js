const io = require('socket.io-client');
const s = io('http://localhost:3000');

s.on('connect', () => {
  console.log('connected, sending admin-set-cues');
  const cues = [
    { id: 'a1', target: 10, lead: 3 },
    { id: 'a2', target: 20, lead: 4 }
  ];
  s.emit('admin-set-cues', { cues });
});

s.on('admin-save-result', (r) => {
  console.log('save result', r);
  process.exit(0);
});

setTimeout(() => { console.log('timeout'); process.exit(1); }, 5000);
