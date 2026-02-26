# Shared Timer

Shared timer with Cues synced across devices using Socket.IO. 
You can start, pause, and rewind the timer. Cues are triggered at specific elapsed times, and all connected clients will receive the cue information in real-time.

Quick start (macOS):

1. Change to the project folder:

```bash
cd ~/Desktop/shared-timer
```

2. Install dependencies and start server:

```bash
npm install
npm start
```

3. On mobile devices on the same network, open:

Get your IP on macOS (Wi‑Fi):

```bash
ipconfig getifaddr en0
```

```
http://<machine-ip>:3000
```


Controls:
- Start: start or resume the timer (you can provide seconds to start from a specific elapsed value)
- Pause: pause the timer
- Rewind: reset the elapsed timer to 0:00
