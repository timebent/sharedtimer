# Shared Timer

Prototype shared timer synced across devices using Socket.IO. Timer now counts up from 0:00 (elapsed time). Clients can start, pause, and rewind the timer (rewind subtracts seconds from elapsed time).

Quick start (macOS / Linux):

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

```
http://<machine-ip>:3000
```

Get your IP on macOS (Wi‑Fi):

```bash
ipconfig getifaddr en0
```

Controls:
- Start: start or resume the timer (you can provide seconds to start from a specific elapsed value)
- Pause: pause the timer
- Rewind: reset the elapsed timer to 0:00
