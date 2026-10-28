# 🎮 Tic Tac Toe Zone — Online Multiplayer

A redesigned **Tic Tac Toe** with real-time **online multiplayer**. One player creates a unique
**Room ID**, shares it, and the second player joins with it — no login, no backend, no setup.

## ✨ Features

- **Create ID** — generates a unique 5-character room ID (e.g. `K7QP2`)
- **Join ID** — enter your friend's ID to connect instantly
- **Real-time sync** — moves, turns and results sync live between both players (WebRTC via [PeerJS](https://peerjs.com))
- **Same rules as the original game** — X starts, players alternate turns, the same 8 winning lines,
  tie when the board is full, "Player X Won!" / "It's a tie!" announcements
- **Fair rematches** — both players must agree; the starting player alternates each round
- **Live scoreboard** (X wins / O wins / ties), connection status badge, sound effects with mute toggle
- **Copy / Share** the room ID (native share sheet on mobile)
- **Beautiful responsive design** — glassmorphism dark theme, glowing X/O marks, winning-strike line,
  animated background; works great on mobile and desktop
- **"Play on this device"** mode — classic 2-player hot-seat, exactly like the original game
- **👨‍💻 Developer page** — "Who created this game?" navigation in the lobby opens a profile card for
  the developer ([Ashwani Sharma](https://ashwanidev.netlify.app/)) with skills, projects and a
  **Connect** button that opens the full portfolio, plus GitHub & LinkedIn links

## 🕹 How to play online

1. Player 1 opens the site and taps **⚡ Create ID** → a room ID appears (e.g. `K7QP2`)
2. Share the ID with Player 2 (**📋 Copy** or **📤 Share** buttons)
3. Player 2 opens the same site, types the ID, and taps **🚀 Join ID**
4. Player 1 is **X**, Player 2 is **O** — play!

> Both players must be online at the same time. The connection is direct (peer-to-peer), so moves
> appear instantly.

## 🚀 Deploy on Netlify

This is a **fully static site** — nothing to build, nothing to configure.

**Option A — Drag & drop (fastest):**
1. Go to <https://app.netlify.com/drop>
2. Drag this whole folder onto the page. Done — multiplayer works out of the box.

**Option B — From Git:**
1. Push this repo to GitHub
2. In Netlify: *Add new site → Import an existing project* → pick the repo
3. Build command is already handled by `netlify.toml` • Publish directory: `.`
4. Deploy

**Option C — CLI:**
```bash
npm i -g netlify-cli
netlify deploy --prod --dir .
```

> HTTPS (which Netlify provides automatically) is required for the WebRTC connection to work —
> it will **not** work when opening the files via `file://`.

## 💻 Local development

No dependencies to install — the dev server uses only Node.js built-ins:

```bash
npm run dev
```

Then open **http://localhost:3000**. Tip: to test online multiplayer locally, open the URL in a
normal window and a private/incognito window — create an ID in one and join from the other.

## 📁 Files

| File | Purpose |
| --- | --- |
| `index.html` | Lobby (Create/Join) + game screen |
| `style.css` | Responsive glassmorphism UI |
| `app.js` | Game rules, rendering, and PeerJS networking |
| `dev-server.js` | Zero-dependency local dev server (`npm run dev`) |
| `package.json` | `npm run dev` script (no dependencies to install) |
| `netlify.toml` | Netlify static-hosting config |
| `developer.jpg` | *(optional)* Developer photo shown on the Developer page — if missing, an "AS" monogram is shown instead. Save your photo as `developer.jpg` (or `developer.png`) in this folder. |


