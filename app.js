/* ============================================================
   Tic Tac Toe Zone — Online multiplayer (PeerJS WebRTC) + local mode
   Rules identical to the original game:
   - X and O alternate turns, 8 winning lines, tie when board is full.
   - In online mode the host is the authoritative referee.
   ============================================================ */
'use strict';

(() => {
    const PREFIX = 'tictaczone-';
    const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L
    const CODE_LEN = 5;
    const WIN_LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6]             // diagonals
    ];

    // ---------- DOM ----------
    const $ = (sel) => document.querySelector(sel);
    const lobbyEl = $('#screen-lobby');
    const gameEl = $('#screen-game');
    const lobbyStatus = $('#lobby-status');
    const joinInput = $('#join-code');
    const tiles = Array.from(document.querySelectorAll('.tile'));
    const boardEl = $('#board');
    const strikeSvg = $('#strike');
    const strikeLine = strikeSvg.querySelector('line');
    const announcer = $('#announcer');
    const turnBanner = $('#turn-banner');
    const turnText = $('#turn-text');
    const turnDot = turnBanner.querySelector('.dot');
    const connBadge = $('#conn-badge');
    const connText = connBadge.querySelector('span');
    const roomBar = $('#room-bar');
    const roomCodeEl = $('#room-code');
    const nameXEl = $('#name-x');
    const nameOEl = $('#name-o');
    const scoreXEl = $('#score-x');
    const scoreOEl = $('#score-o');
    const scoreTEl = $('#score-t');
    const scoreCardX = $('#score-card-x');
    const scoreCardO = $('#score-card-o');
    const btnCreate = $('#btn-create');
    const btnJoin = $('#btn-join');
    const btnLocal = $('#btn-local');
    const btnLeave = $('#btn-leave');
    const btnSound = $('#btn-sound');
    const btnCopy = $('#btn-copy');
    const btnShare = $('#btn-share');
    const btnRematch = $('#btn-rematch');
    const rematchPrompt = $('#rematch-prompt');
    const btnRematchAccept = $('#btn-rematch-accept');
    const btnRematchDecline = $('#btn-rematch-decline');
    const toastEl = $('#toast');
    const devEl = $('#screen-dev');
    const btnDev = $('#btn-dev');
    const btnDevGame = $('#btn-dev-game');
    const btnDevBack = $('#btn-dev-back');
    const themeBtns = Array.from(document.querySelectorAll('.theme-toggle'));
    const metaTheme = document.querySelector('#meta-theme');

    // ---------- State ----------
    const freshBoard = () => Array(9).fill('');
    const state = {
        mode: null,            // 'local' | 'host' | 'guest'
        board: freshBoard(),
        current: 'X',
        active: true,
        result: null,          // 'X' | 'O' | 'TIE' | null
        winLine: null,
        startingPlayer: 'X',
        round: 0,
        scores: { X: 0, O: 0, T: 0 },
        mySymbol: null,        // 'X' | 'O' | null (local)
        roomCode: null,
        peer: null,
        conn: null,
        opponentReady: false,
        joinTimer: null,
        iWantRematch: false,
        theyWantRematch: false,
        soundOn: localStorage.getItem('ttt-sound') !== 'off'
    };
    let netClosed = false;
    let createAttempts = 0;

    const other = (s) => (s === 'X' ? 'O' : 'X');
    const genCode = () => Array.from({ length: CODE_LEN },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const peerIdFor = (code) => PREFIX + code.toLowerCase();
    // ---------- UI helpers ----------
    let toastTimer = null;
    function toast(msg, ms = 2800) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    }

    function showLobby() {
        lobbyEl.classList.remove('hide');
        gameEl.classList.add('hide');
        devEl.classList.add('hide');
    }

    function showGame() {
        lobbyEl.classList.add('hide');
        gameEl.classList.remove('hide');
        devEl.classList.add('hide');
    }

    let devReturnTo = 'lobby';

    // Developer screen always opens from the top, no matter which view it was opened from.
    function showDev(origin) {
        if (origin) devReturnTo = origin;
        lobbyEl.classList.add('hide');
        gameEl.classList.add('hide');
        devEl.classList.remove('hide');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Return to the view the developer page was opened from.
    function devBack() {
        if (devReturnTo === 'game') showGame();
        else showLobby();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ---------- Theme (dark / light) ----------
    const THEME_KEY = 'ttt-theme';

    function applyTheme(theme, persist) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) {
            try { localStorage.setItem(THEME_KEY, theme); } catch (_) { }
        }
        themeBtns.forEach((btn) => {
            btn.textContent = theme === 'light' ? '🌙' : '☀️';
            btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
            btn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        });
        if (metaTheme) {
            metaTheme.setAttribute('content', theme === 'light' ? '#eef2f7' : '#0b1020');
        }
    }

    function toggleTheme() {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next, true);
    }

    function setBadge(kind, text) {
        connBadge.className = 'conn-badge ' + kind;
        connText.textContent = text;
    }

    function setLobbyStatus(msg, isError = false) {
        lobbyStatus.textContent = msg;
        lobbyStatus.classList.toggle('error', isError);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { }
            ta.remove();
            return ok;
        }
    }

    // ---------- Sound (WebAudio, no assets needed) ----------
    let audioCtx = null;
    function tone(freq, when, dur, type = 'sine', vol = 0.06) {
        const t = audioCtx.currentTime + when;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    function sfx(name, arg) {
        if (!state.soundOn) return;
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            switch (name) {
                case 'place': tone(arg === 'X' ? 540 : 660, 0, 0.09, 'triangle', 0.07); break;
                case 'join': tone(440, 0, 0.1); tone(660, 0.12, 0.14); break;
                case 'win': tone(523, 0, 0.12, 'triangle', 0.08); tone(659, 0.13, 0.12, 'triangle', 0.08); tone(784, 0.26, 0.22, 'triangle', 0.08); break;
                case 'lose': tone(392, 0, 0.15, 'sawtooth', 0.05); tone(262, 0.18, 0.26, 'sawtooth', 0.05); break;
                case 'tie': tone(330, 0, 0.12); tone(330, 0.16, 0.12); break;
                case 'click': tone(300, 0, 0.05, 'square', 0.03); break;
            }
        } catch (_) { /* audio not available — ignore */ }
    }
    // ---------- Core game logic (same rules as the original game) ----------
    function evaluate(board) {
        for (const line of WIN_LINES) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { result: board[a], line };
            }
        }
        return board.includes('') ? { result: null, line: null } : { result: 'TIE', line: null };
    }

    // Host-authoritative move application. Returns false if the move is illegal.
    function tryMove(i, symbol) {
        if (!state.active || state.board[i] !== '' || symbol !== state.current) return false;
        state.board[i] = symbol;
        const ev = evaluate(state.board);
        if (ev.result === 'X' || ev.result === 'O') {
            state.active = false;
            state.result = ev.result;
            state.winLine = ev.line;
            state.scores[ev.result] += 1;
        } else if (ev.result === 'TIE') {
            state.active = false;
            state.result = 'TIE';
            state.scores.T += 1;
        } else {
            state.current = other(symbol);
        }
        return true;
    }

    function resetRound() {
        state.board = freshBoard();
        state.active = true;
        state.result = null;
        state.winLine = null;
        state.round += 1;
        state.startingPlayer = other(state.startingPlayer); // alternate who starts
        state.current = state.startingPlayer;
        state.iWantRematch = false;
        state.theyWantRematch = false;
        render();
    }

    // Local mode reset — exactly like the original game (X always restarts).
    function localReset() {
        state.board = freshBoard();
        state.active = true;
        state.result = null;
        state.winLine = null;
        state.current = 'X';
        state.startingPlayer = 'X';
        sfx('click');
        render();
    }

    function snapshot() {
        return {
            board: state.board.slice(),
            cur: state.current,
            res: state.result,
            line: state.winLine,
            round: state.round,
            start: state.startingPlayer,
            scores: { X: state.scores.X, O: state.scores.O, T: state.scores.T }
        };
    }

    function applySnapshot(msg) {
        const newRound = typeof msg.round === 'number' && msg.round > state.round;
        state.board = msg.board.slice();
        state.current = msg.cur;
        state.active = !msg.res;
        state.result = msg.res || null;
        state.winLine = msg.line || null;
        state.round = msg.round;
        state.startingPlayer = msg.start;
        state.scores = { X: msg.scores.X, O: msg.scores.O, T: msg.scores.T };
        if (newRound) {
            state.iWantRematch = false;
            state.theyWantRematch = false;
            toast('New round started! ⚡');
        }
        render();
    }

    function broadcastState() {
        if (state.conn && state.conn.open) {
            state.conn.send({ t: 'state', ...snapshot() });
        }
    }

    function canPlay(i) {
        if (!state.active || state.board[i] !== '') return false;
        if (state.mode === 'local') return true;
        if (!state.opponentReady) return false;
        return state.current === state.mySymbol;
    }

    function playResultSound() {
        if (state.mode === 'local') {
            if (state.result === 'TIE') sfx('tie'); else sfx('win');
            return;
        }
        if (state.result === 'TIE') sfx('tie');
        else if (state.result === state.mySymbol) sfx('win');
        else sfx('lose');
    }

    function onTileClick(i) {
        if (!canPlay(i)) return;
        if (state.mode === 'guest') {
            if (tryMove(i, state.mySymbol)) {   // optimistic; host state syncs us
                sfx('place', state.mySymbol);
                if (state.result) playResultSound();
                render();
                state.conn.send({ t: 'move', i });
            }
            return;
        }
        // local + host
        const sym = state.mode === 'local' ? state.current : state.mySymbol;
        if (tryMove(i, sym)) {
            sfx('place', sym);
            if (state.result) playResultSound();
            render();
            if (state.mode === 'host') broadcastState();
        }
    }
    // ---------- Rendering ----------
    function render() {
        tiles.forEach((tile, i) => {
            const v = state.board[i];
            tile.textContent = v;
            tile.classList.toggle('playerX', v === 'X');
            tile.classList.toggle('playerO', v === 'O');
            tile.classList.toggle('win', !!state.winLine && state.winLine.includes(i));
            tile.disabled = !canPlay(i);
            tile.setAttribute('aria-label', `Cell ${i + 1}${v ? ' — ' + v : ''}`);
        });

        scoreXEl.textContent = state.scores.X;
        scoreOEl.textContent = state.scores.O;
        scoreTEl.textContent = state.scores.T;

        if (state.mode === 'host') {
            nameXEl.textContent = 'You (X)';
            nameOEl.textContent = 'Opponent (O)';
        } else if (state.mode === 'guest') {
            nameXEl.textContent = 'Opponent (X)';
            nameOEl.textContent = 'You (O)';
        } else {
            nameXEl.textContent = 'Player X';
            nameOEl.textContent = 'Player O';
        }

        const highlight = state.active ? state.current : state.result;
        scoreCardX.classList.toggle('active', highlight === 'X');
        scoreCardO.classList.toggle('active', highlight === 'O');

        updateTurnBanner();
        updateAnnouncer();
        updateRematchUI();
        drawStrike();
    }

    function updateTurnBanner() {
        turnBanner.classList.remove('x-turn', 'o-turn');
        let text = '';
        if (state.mode === 'host' && !state.opponentReady) {
            text = 'Waiting for player 2 — share your Room ID!';
            turnDot.style.background = '#f59e0b';
        } else if (state.active) {
            const sym = state.current;
            turnDot.style.background = sym === 'X' ? 'var(--x)' : 'var(--o)';
            if (state.mode === 'local') {
                text = `Player ${sym === 'X' ? '<span class="px">X</span>' : '<span class="po">O</span>'}'s turn`;
            } else {
                text = sym === state.mySymbol ? 'Your turn' : "Opponent's turn";
            }
            turnBanner.classList.add(sym === 'X' ? 'x-turn' : 'o-turn');
        } else {
            text = 'Round over';
            turnDot.style.background = '#64748b';
        }
        turnText.innerHTML = text;
    }

    function updateAnnouncer() {
        if (!state.result) {
            announcer.classList.add('hide');
            return;
        }
        let html = '';
        let cls = 'tie';
        if (state.mode === 'local') {
            if (state.result === 'TIE') {
                html = "It's a tie!";
            } else {
                html = `Player <span class="${state.result === 'X' ? 'px' : 'po'}">${state.result}</span> Won!`;
                cls = 'win';
            }
        } else {
            if (state.result === 'TIE') {
                html = "It's a tie! 🤝";
            } else if (state.result === state.mySymbol) {
                html = 'You won! 🎉';
                cls = 'win';
            } else {
                html = 'Opponent won 😢';
                cls = 'lose';
            }
        }
        announcer.className = 'announcer ' + cls;
        announcer.innerHTML = html;
    }

    function updateRematchUI() {
        const over = !!state.result;
        const connected = state.mode === 'local' || state.opponentReady;
        btnRematch.classList.toggle('hide', !(over && connected && !state.theyWantRematch));
        btnRematch.disabled = state.iWantRematch;
        btnRematch.textContent = state.iWantRematch
            ? '⏳ Waiting…'
            : (state.mode === 'local' ? '🔁 New Round' : '🔁 Rematch');
        rematchPrompt.classList.toggle('hide', !(over && state.theyWantRematch && !state.iWantRematch));
    }

    function drawStrike() {
        if (!state.winLine) {
            strikeSvg.classList.remove('show');
            return;
        }
        const boardRect = boardEl.getBoundingClientRect();
        const first = tiles[state.winLine[0]].getBoundingClientRect();
        const last = tiles[state.winLine[2]].getBoundingClientRect();
        const cx = (r) => r.left - boardRect.left + r.width / 2;
        const cy = (r) => r.top - boardRect.top + r.height / 2;
        const dx = cx(last) - cx(first);
        const dy = cy(last) - cy(first);
        const ext = 0.28; // extend a little beyond the centres
        const x1 = cx(first) - dx * ext;
        const y1 = cy(first) - dy * ext;
        const x2 = cx(last) + dx * ext;
        const y2 = cy(last) + dy * ext;
        strikeLine.setAttribute('x1', (x1 / boardRect.width) * 100);
        strikeLine.setAttribute('y1', (y1 / boardRect.height) * 100);
        strikeLine.setAttribute('x2', (x2 / boardRect.width) * 100);
        strikeLine.setAttribute('y2', (y2 / boardRect.height) * 100);
        strikeSvg.classList.add('show');
    }
    // ---------- Networking (PeerJS — zero config, works on Netlify) ----------
    function enterGame() {
        netClosed = false;
        roomBar.classList.toggle('hide', state.mode === 'local');
        connBadge.classList.toggle('hide', state.mode === 'local');
        roomCodeEl.textContent = state.roomCode || '—';
        if (state.mode === 'local') {
            setLobbyStatus('');
        } else {
            setBadge('wait', state.mode === 'host' ? 'Waiting for opponent' : 'Connecting…');
        }
        showGame();
        render();
    }

    function cleanupNet() {
        if (state.joinTimer) { clearTimeout(state.joinTimer); state.joinTimer = null; }
        try { if (state.conn) state.conn.close(); } catch (_) { }
        try { if (state.peer) state.peer.destroy(); } catch (_) { }
        state.conn = null;
        state.peer = null;
    }

    function leaveToLobby(reason) {
        cleanupNet();
        Object.assign(state, {
            mode: null, board: freshBoard(), current: 'X', active: true,
            result: null, winLine: null, startingPlayer: 'X', round: 0,
            scores: { X: 0, O: 0, T: 0 }, mySymbol: null, roomCode: null,
            opponentReady: false, iWantRematch: false, theyWantRematch: false
        });
        showLobby();
        render();
        if (reason) toast(reason);
    }

    function onConnClosed() {
        if (netClosed || state.mode === 'local' || state.mode === null) return;
        netClosed = true;
        state.opponentReady = false;
        setBadge('off', 'Opponent left');
        toast('Opponent disconnected 😢');
        cleanupNet();
        render();
    }

    function createGame() {
        if (typeof Peer === 'undefined') {
            toast('Could not load the network library — check your internet connection.');
            return;
        }
        btnCreate.disabled = true;
        btnCreate.textContent = 'Creating…';
        setLobbyStatus('Creating your unique room ID…');
        const code = genCode();
        const peer = new Peer(peerIdFor(code), { debug: 1 });
        state.peer = peer;

        peer.on('open', () => {
            createAttempts = 0;
            btnCreate.disabled = false;
            btnCreate.textContent = '⚡ Create ID';
            setLobbyStatus('');
            state.mode = 'host';
            state.mySymbol = 'X';
            state.roomCode = code;
            state.opponentReady = false;
            enterGame();
        });

        peer.on('connection', (conn) => {
            if (state.conn && state.conn.open) {
                // Room is full — politely reject extra players.
                conn.on('open', () => {
                    conn.send({ t: 'full' });
                    setTimeout(() => { try { conn.close(); } catch (_) { } }, 500);
                });
                return;
            }
            state.conn = conn;
            setupHostConn(conn);
        });

        peer.on('error', (err) => {
            btnCreate.disabled = false;
            btnCreate.textContent = '⚡ Create ID';
            if (err.type === 'unavailable-id' && createAttempts < 3) {
                createAttempts += 1;
                cleanupNet();
                createGame(); // ultra-rare code collision — retry with a new code
                return;
            }
            setLobbyStatus('Could not create the game. Please try again.', true);
            cleanupNet();
            showLobby();
        });

        peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { } });
    }
    function setupHostConn(conn) {
        conn.on('data', (msg) => {
            if (!msg || !msg.t) return;
            switch (msg.t) {
                case 'hello':
                    state.opponentReady = true;
                    setBadge('on', 'Connected');
                    sfx('join');
                    toast('Player 2 joined! You are X. 🎮');
                    conn.send({ t: 'welcome', ...snapshot(), yourSymbol: 'O' });
                    render();
                    break;
                case 'move': {
                    const prevResult = state.result;
                    if (tryMove(msg.i, 'O')) {
                        sfx('place', 'O');
                        if (state.result && !prevResult) playResultSound();
                        render();
                        broadcastState();
                    }
                    break;
                }
                case 'rematch-req': handleRematchRequest(); break;
                case 'rematch-accept':
                    resetRound();
                    broadcastState();
                    toast('Rematch accepted ⚡');
                    break;
                case 'rematch-decline':
                    state.theyWantRematch = false;
                    toast('Rematch declined');
                    render();
                    break;
            }
        });
        conn.on('close', onConnClosed);
        conn.on('error', onConnClosed);
    }

    function joinGame(code) {
        if (typeof Peer === 'undefined') {
            toast('Could not load the network library — check your internet connection.');
            return;
        }
        btnJoin.disabled = true;
        btnJoin.textContent = 'Joining…';
        setLobbyStatus(`Connecting to room ${code}…`);
        const peer = new Peer({ debug: 1 });
        state.peer = peer;

        state.joinTimer = setTimeout(() => {
            joinFail('Could not connect. Check the Room ID and try again.');
        }, 12000);

        peer.on('open', () => {
            const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
            state.conn = conn;
            conn.on('open', () => {
                clearTimeout(state.joinTimer);
                state.joinTimer = null;
                state.mode = 'guest';
                state.mySymbol = 'O';
                state.roomCode = code;
                btnJoin.disabled = false;
                btnJoin.textContent = '🚀 Join ID';
                setLobbyStatus('');
                enterGame();
                conn.send({ t: 'hello' });
            });
            conn.on('data', onGuestData);
            conn.on('close', onConnClosed);
            conn.on('error', onConnClosed);
        });

        peer.on('error', (err) => {
            if (state.mode === 'guest') return; // already connected; conn events handle it
            if (err.type === 'peer-unavailable') {
                joinFail('Room not found. Double-check the ID.');
            } else {
                joinFail('Connection error — please try again.');
            }
        });

        peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { } });
    }

    function onGuestData(msg) {
        if (!msg || !msg.t) return;
        switch (msg.t) {
            case 'welcome':
                state.opponentReady = true;
                setBadge('on', 'Connected');
                sfx('join');
                toast('Connected! You are O. 🎮');
                applySnapshot(msg);
                break;
            case 'state': {
                const prevResult = state.result;
                applySnapshot(msg);
                if (state.result && !prevResult) playResultSound();
                break;
            }
            case 'full':
                leaveToLobby('That room is already full (2 players max).');
                break;
            case 'rematch-req': handleRematchRequest(); break;
            case 'rematch-decline':
                state.theyWantRematch = false;
                state.iWantRematch = false;
                toast('Rematch declined');
                render();
                break;
        }
    }

    function joinFail(msg) {
        if (state.mode === 'guest') return;
        clearTimeout(state.joinTimer);
        state.joinTimer = null;
        cleanupNet();
        btnJoin.disabled = false;
        btnJoin.textContent = '🚀 Join ID';
        setLobbyStatus(msg, true);
        showLobby();
    }
    // ---------- Rematch ----------
    function handleRematchRequest() {
        if (state.iWantRematch) {
            // Both players want it — start immediately.
            state.iWantRematch = false;
            sfx('click');
            if (state.mode === 'host') {
                resetRound();
                broadcastState();
                toast('Both players agreed — new round! ⚡');
            } else {
                state.conn.send({ t: 'rematch-accept' });
                toast('Both players agreed — new round! ⚡');
            }
            render();
        } else {
            state.theyWantRematch = true;
            sfx('click');
            render();
        }
    }

    function requestRematch() {
        if (state.mode === 'local') {
            localReset();
            return;
        }
        if (!state.conn || !state.conn.open) return;
        state.iWantRematch = true;
        state.conn.send({ t: 'rematch-req' });
        sfx('click');
        render();
    }

    function acceptRematch() {
        state.theyWantRematch = false;
        sfx('click');
        if (state.mode === 'host') {
            resetRound();
            broadcastState();
        } else if (state.conn && state.conn.open) {
            state.conn.send({ t: 'rematch-accept' });
        }
        render();
    }

    function declineRematch() {
        state.theyWantRematch = false;
        if (state.conn && state.conn.open) state.conn.send({ t: 'rematch-decline' });
        toast('Rematch declined');
        sfx('click');
        render();
    }

    // ---------- Event wiring ----------
    tiles.forEach((tile) => {
        tile.addEventListener('click', () => onTileClick(Number(tile.dataset.i)));
    });

    btnCreate.addEventListener('click', createGame);
    btnJoin.addEventListener('click', () => {
        const code = joinInput.value.trim().toUpperCase();
        if (code.length !== CODE_LEN) {
            setLobbyStatus('Please enter the 5-character Room ID.', true);
            joinInput.focus();
            return;
        }
        joinGame(code);
    });
    btnLocal.addEventListener('click', () => {
        state.mode = 'local';
        state.mySymbol = null;
        state.roomCode = null;
        state.opponentReady = true;
        enterGame();
    });
    btnDev.addEventListener('click', () => { sfx('click'); showDev('lobby'); });
    btnDevGame.addEventListener('click', () => { sfx('click'); showDev('game'); });
    btnDevBack.addEventListener('click', () => { sfx('click'); devBack(); });
    themeBtns.forEach((btn) => btn.addEventListener('click', () => { toggleTheme(); sfx('click'); }));
    joinInput.addEventListener('input', () => {
        joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    });
    joinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnJoin.click();
    });

    btnLeave.addEventListener('click', () => leaveToLobby('You left the game. 👋'));
    btnRematch.addEventListener('click', requestRematch);
    btnRematchAccept.addEventListener('click', acceptRematch);
    btnRematchDecline.addEventListener('click', declineRematch);

    btnCopy.addEventListener('click', async () => {
        const ok = await copyText(state.roomCode || '');
        toast(ok ? 'Room ID copied! 📋' : 'Copy failed — select it manually');
        if (ok) sfx('click');
    });

    btnShare.addEventListener('click', async () => {
        const text = `Join my Tic Tac Toe game! 🎮 Room ID: ${state.roomCode}`;
        if (navigator.share) {
            try { await navigator.share({ title: 'Tic Tac Toe Zone', text, url: location.href }); } catch (_) { }
        } else {
            const ok = await copyText(`${text} — ${location.href}`);
            toast(ok ? 'Invite copied! 📋' : 'Copy failed');
            if (ok) sfx('click');
        }
    });

    btnSound.addEventListener('click', () => {
        state.soundOn = !state.soundOn;
        localStorage.setItem('ttt-sound', state.soundOn ? 'on' : 'off');
        btnSound.textContent = state.soundOn ? '🔊' : '🔇';
        if (state.soundOn) sfx('click');
    });

    window.addEventListener('resize', () => { if (state.winLine) drawStrike(); });
    window.addEventListener('beforeunload', () => { try { if (state.peer) state.peer.destroy(); } catch (_) { } });

    // ---------- Init ----------
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark', false);
    btnSound.textContent = state.soundOn ? '🔊' : '🔇';
    showLobby();
    render();
})();