// Online room logic: create / join a room by code, then run host or guest.
//   Host  : runs the real simulation (core.step), steers the guest's fighter from their inputs and
//           streams snapshots.
//   Guest : sends inputs, mirrors snapshots. See "Online play" in core.js.
import { S, cleanMap, resolveMap, startMatchSequence, applyRemote, applySnapshot, NETHOOK, resetSnapshotState, removeFighter, trainAttach, trainDetach, setArena } from '../gameCore.js';
import { openTransport, hasRealtime } from './transport.js';
import { isDown } from '../controls.js';
import { displayName } from '../account.js';
import { getMyChar, charOf } from '../characters.js';
import { ITEM_TYPES, ITEM_DEFAULT, ITEM_INTERVAL_MIN, ITEM_INTERVAL_MAX } from '../items.js';
import { bindChat, onRemoteChat, clearChat } from './chat.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const TIMEOUT_MS = 7000;


export function cleanItems(i) {
    i = i || {};
    const types = Array.isArray(i.types) ? ITEM_TYPES.filter(t => i.types.includes(t)) : ITEM_TYPES.slice();
    return { on: !!i.on, types, interval: Math.max(ITEM_INTERVAL_MIN, Math.min(ITEM_INTERVAL_MAX, Math.round(+i.interval) || ITEM_DEFAULT.interval)) };
}
export const defaultSettings = () => ({ teams: false, startDamage: 0, stocks: 3, mode: 'stock', timeLimit: 5, map: 'big', hazards: false, items: cleanItems(ITEM_DEFAULT) });
export const Online = {
    role: null,           // 'host' | 'guest' | null
    code: '',
    status: 'idle',       // idle | waiting | joining | connected | closed
    note: '',
    name: 'Player',
    mode: 'pvp',          // 'pvp' (1v1) | 'lobby' (up to 8)
    viaQueue: false, rankedQ: false,
    slot: 1,              // my fighter slot (0 = host)
    myId: '',
    lobby: { members: [], settings: defaultSettings(), started: false },
    cfg: null, trainOn: false, inTrain: false,   // cfg: the running custom match (late spectators get it); trainOn: a friend is in my training
    peerName: 'Opponent',
    t: null,
    lastRecv: 0,
    onChange: () => {},   // UI refresh
    onLeft: () => {},     // peer left / connection lost
};

let lastHeld = '';
let pingTimer = 0, watchTimer = 0, lobbyTimer = 0;
const TEAMS = ['red', 'blue', 'yellow', 'green'];
const MAX_PLAYERS = 8;

function set(status, note = '') { Online.status = status; Online.note = note; Online.onChange(); }

function stopTimers() { clearInterval(pingTimer); clearInterval(watchTimer); pingTimer = watchTimer = 0; }


/** ---- common ---- */
export function leaveRoom(notify = true) {
    if (Online.t) {
        if (notify && Online.role !== 'spectator') Online.t.send({ t: 'leave', id: Online.myId });
        Online.t.close();
    }
    Online.t = null; Online.role = null; Online.code = ''; stopTimers(); bindChat(null);
    NETHOOK.send = null; S.online = null; S.opponentName = null; S.spectating = false; lastHeld = ''; Online.cfg = null; Online.trainOn = false; Online.inTrain = false;
    Online.lobby = { members: [], settings: defaultSettings(), started: false }; Online.slot = 1; clearInterval(lobbyTimer);
    set('idle');
}

function watch() {
    Online.lastRecv = performance.now();
    watchTimer = setInterval(() => {
        if (Online.status !== 'connected' || (Online.role === 'host' && (Online.mode === 'lobby' || Online.mode === 'train'))) return;
        if (performance.now() - Online.lastRecv > TIMEOUT_MS) { const cb = Online.onLeft; leaveRoom(false); set('closed', 'Connection lost'); cb('Connection lost'); }
    }, 1000);
}

/** ---- host ---- */
export async function hostRoom(code, mode = 'pvp') {
    leaveRoom(false);
    NETHOOK.fast = () => { const i = Online.t && Online.t.info; return !!i && (i.mode === 'p2p' || i.mode === 'local'); };
    Online.name = displayName(); Online.mode = mode; Online.viaQueue = false; Online.rankedQ = false;
    Online.role = 'host'; Online.code = code || newCode();
    set('waiting', 'Opening room…');
    try { Online.t = await openTransport(Online.code); } catch (e) { Online.role = null; set('closed', e.message); return false; }
    const t = Online.t;
    if (t.enableRtc) t.enableRtc('host');
    t.onmessage = (m) => {
        Online.lastRecv = performance.now();
        switch (m.t) {
            case 'hello':
                if (Online.mode === 'lobby') { lobbyHello(m); break; }
                if (Online.mode === 'train') {                       // a party member joins my training: they take over the dummy
                    if (Online.trainOn) { t.send({ t: 'full', to: m.id }); break; }
                    Online.trainOn = true; Online.peerName = (m.name || 'Guest').slice(0, 20); trainAttach(Online.peerName, m.char);
                    NETHOOK.send = (snap) => Online.t && Online.t.send({ t: 'snap', s: snap });
                    t.send({ t: 'welcome', name: Online.name, mode: 'pvp', to: m.id, slot: 1, char: getMyChar() });
                    t.send({ t: 'start', to: m.id, name: Online.name, train: { arena: S.arena, theme: S.theme, hz: !!S.hazards } });
                    set('connected', Online.peerName + ' joined your training');
                    break;
                }
                if (Online.status === 'connected') { t.send({ t: 'full', to: m.id }); break; }
                Online.peerName = (m.name || 'Guest').slice(0, 20); S.peerChar = charOf(m.char).id;
                t.send({ t: 'welcome', name: Online.name, mode: 'pvp', to: m.id, slot: 1, char: getMyChar() });
                set('connected', Online.peerName + ' joined');
                beginMatch();
                break;
            case 'held': case 'act': { const mem = memberOf(m); if (Online.mode === 'lobby') { if (mem) { mem.seen = performance.now(); applyRemote(m, mem.slot); } } else applyRemote(m); break; }
            case 'team': { const mem = memberOf(m); if (mem && !Online.lobby.started && TEAMS.includes(m.team)) { mem.team = m.team; lobbyPush(); } break; }
            case 'rematch': if (Online.mode === 'lobby') { if (Online.lobby.started && S.gameState === 'gameover') beginLobbyMatch(); } else if (Online.status === 'connected') beginMatch(); break;
            case 'leave': {
                if (Online.mode === 'lobby') { const mem = memberOf(m); if (mem) dropMember(mem); break; }
                if (Online.mode === 'train') { if (Online.trainOn) { Online.trainOn = false; NETHOOK.send = null; trainDetach(); set('waiting', 'Your friend left the training'); } break; }
                const cb = Online.onLeft; leaveRoom(false); set('closed', 'Opponent left'); cb('Opponent left'); break;
            }
            case 'spectate': {                                    // someone watches (a party member joining my match): send them what they need to start
                const start = { t: 'start', to: m.id, spec: true, hn: Online.name, gn: Online.peerName };
                if (Online.mode === 'lobby') { if (!Online.cfg) break; start.cfg = Online.cfg; }
                else if (Online.mode !== 'pvp' || Online.status !== 'connected') break;
                t.send(start); break;
            }
            case 'chat': onRemoteChat(m); break;
            case 'ping': { const mem = memberOf(m); if (mem) mem.seen = performance.now(); break; }
        }
    };
    bindChat((msg) => t.send(msg)); clearChat();
    watch();
    if (mode === 'lobby') {
        Online.lobby = { members: [{ id: 'host', slot: 0, name: Online.name, team: 'red', char: getMyChar(), seen: Infinity }], settings: defaultSettings(), started: false };
        Online.slot = 0;
        lobbyTimer = setInterval(lobbyTick, 1500);
        set('connected', 'Lobby open. Share the code ' + Online.code);
    } else set('waiting', 'Waiting for a friend. Share the code ' + Online.code);
    return true;
}

// ---------------------------------------------------------------- custom-match lobby (host side)
const memberOf = (m) => Online.lobby.members.find(x => x.id === m.id && x.id !== 'host');
const publicLobby = () => ({ t: 'lobby', settings: Online.lobby.settings, started: Online.lobby.started, members: Online.lobby.members.map(x => ({ slot: x.slot, name: x.name, team: x.team, bot: x.bot || null, char: x.char || 'luminent' })) });
export function lobbyPush() { if (Online.role === 'host' && Online.mode === 'lobby') { Online.t.send(publicLobby()); Online.onChange(); } }
function lobbyHello(m) {
    const L = Online.lobby;
    let mem = L.members.find(x => x.id === m.id);
    if (!mem) {
        if (L.started) { Online.t.send({ t: 'full', to: m.id, why: 'That match already started' }); return; }
        if (L.members.length >= MAX_PLAYERS) { Online.t.send({ t: 'full', to: m.id, why: 'That lobby is full (8 players)' }); return; }
        let slot = 1; while (L.members.some(x => x.slot === slot)) slot++;
        const counts = TEAMS.map(tm => L.members.filter(x => x.team === tm).length);
        mem = { id: m.id, slot, char: charOf(m.char).id, name: String(m.name || 'Guest').slice(0, 20), team: TEAMS[counts.indexOf(Math.min(...counts))], seen: performance.now() };
        L.members.push(mem);
    }
    Online.t.send({ t: 'welcome', name: Online.name, mode: 'lobby', to: m.id, slot: mem.slot });
    lobbyPush();
}
function dropMember(mem) {
    const L = Online.lobby;
    L.members = L.members.filter(x => x !== mem);
    if (L.started) removeFighter(mem.slot);
    lobbyPush();
}
function lobbyTick() {
    if (Online.role !== 'host') return;
    const now = performance.now();
    for (const mem of Online.lobby.members.slice()) if (mem.id !== 'host' && now - mem.seen > 9000) dropMember(mem);
    Online.t.send(publicLobby());
}
export function setLobbySetting(k, v) {
    if (Online.role !== 'host' || Online.lobby.started) return;
    if (k === 'mode' && v === 'sudden') {
        Online.lobby.settings.mode = 'sudden';
        Online.lobby.settings.stocks = 1;
        Online.lobby.settings.startDamage = 200;
        lobbyPush();
        return;
    }
    if (k === 'startDamage') v = Math.max(0, Math.min(249, Math.round(+v) || 0));
    if (Online.lobby.settings.mode === 'sudden' && k === 'startDamage') v = 200;
    if (Online.lobby.settings.mode === 'sudden' && k === 'stocks') v = 1;
    if (k === 'timeLimit') v = Math.max(1, Math.min(10, Math.round(+v) || 5));
    if (k === 'items') v = cleanItems(v);
    if (k === 'map') v = cleanMap(v);
    if (k === 'hazards') v = !!v;
    if (JSON.stringify(Online.lobby.settings[k]) === JSON.stringify(v)) return;       // no change: don't rebuild the panel under the user's mouse
    Online.lobby.settings[k] = v; lobbyPush();
}
export function setMemberChar(slot, char) {
    if (Online.role !== 'host' || Online.lobby.started) return;
    const mem = Online.lobby.members.find(x => x.slot === slot);
    if (mem && mem.char !== charOf(char).id) { mem.char = charOf(char).id; lobbyPush(); }
}
export function setMemberTeam(slot, team) {
    if (Online.role === 'host') { const mem = Online.lobby.members.find(x => x.slot === slot); if (mem && TEAMS.includes(team)) { mem.team = team; lobbyPush(); } }
    else if (Online.role === 'guest' && slot === Online.slot && Online.t) Online.t.send({ t: 'team', id: Online.myId, team });
}
export function addBot(level) {
    if (Online.role !== 'host' || Online.mode !== 'lobby' || Online.lobby.started) return false;
    const L = Online.lobby;
    if (L.members.length >= MAX_PLAYERS || !['static', 'easy', 'medium', 'hard', 'expert', 'master', 'apex'].includes(level)) return false;
    let slot = 1; while (L.members.some(x => x.slot === slot)) slot++;
    const counts = TEAMS.map(tm => L.members.filter(x => x.team === tm).length);
    const label = { static: 'Static Bot', easy: 'Easy Bot', medium: 'Medium Bot', hard: 'Hard Bot', expert: 'Expert Bot', master: 'Master Bot', apex: 'Apex Bot' }[level];
    const same = L.members.filter(x => x.bot === level).length;
    const name = same === 0 ? label : `${label} ${same + 1}`;
    if (same === 1) {
        const first = L.members.find(x => x.bot === level);
        if (first && first.name === label) first.name = label + ' 1';
    }
    L.members.push({ id: 'bot' + slot + '_' + Math.random().toString(36).slice(2, 5), slot, char: getMyChar(), name, team: TEAMS[counts.indexOf(Math.min(...counts))], bot: level, seen: Infinity });
    lobbyPush();
    return true;
}
export function kickMember(slot) {
    if (Online.role !== 'host') return;
    const mem = Online.lobby.members.find(x => x.slot === slot); if (!mem || mem.id === 'host') return;
    if (!mem.bot) Online.t.send({ t: 'kick', to: mem.id });
    dropMember(mem);
}
export function beginLobbyMatch() {
    if (Online.role !== 'host' || Online.mode !== 'lobby') return false;
    const L = Online.lobby;
    if (L.members.length < 2) { Online.note = 'You need at least 2 players'; Online.onChange(); return false; }
    L.started = true;
    const cfg = { players: L.members.map(x => ({ slot: x.slot, name: x.name, team: x.team, bot: x.bot || null, char: x.char || 'luminent' })), teams: L.settings.teams, startDamage: L.settings.mode === 'sudden' ? 200 : Math.min(249, +L.settings.startDamage || 0), stocks: L.settings.mode === 'sudden' ? 1 : (+L.settings.stocks || 3), mode: L.settings.mode === 'timer' ? 'timer' : L.settings.mode === 'sudden' ? 'sudden' : 'stock', timeLimit: +L.settings.timeLimit || 5, map: resolveMap(L.settings.map), hazards: !!L.settings.hazards, items: cleanItems(L.settings.items) };
    S.online = 'host'; S.opponentName = null; Online.cfg = cfg;
    NETHOOK.send = (snap) => Online.t && Online.t.send({ t: 'snap', s: snap });
    Online.t.send({ t: 'start', cfg });
    startMatchSequence('lobby', { ...cfg, mySlot: 0 });
    Online.onChange();
    return true;
}

export function beginMatch() {
    if (Online.role !== 'host') return;
    S.online = 'host'; S.opponentName = Online.peerName;
    NETHOOK.send = (snap) => Online.t && Online.t.send({ t: 'snap', s: snap });
    Online.t.send({ t: 'start', name: Online.name });
    startMatchSequence('online');
}

/** ---- guest ---- */
export async function joinRoom(code) {
    leaveRoom(false);
    Online.name = displayName(); Online.viaQueue = false; Online.rankedQ = false;
    code = (code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { set('closed', 'Codes are 4 letters'); return false; }
    Online.role = 'guest'; Online.code = code;
    set('joining', 'Connecting…');
    try { Online.t = await openTransport(code); } catch (e) { Online.role = null; set('closed', e.message); return false; }
    const t = Online.t;
    if (t.enableRtc) t.enableRtc('guest');
    NETHOOK.rtt = () => (Online.t && Online.t.info && Online.t.info.rtt) || 0;
    const myId = Online.myId = Math.random().toString(36).slice(2, 8);
    let welcomed = false;
    t.onmessage = (m) => {
        Online.lastRecv = performance.now();
        switch (m.t) {
            case 'welcome': if (m.to && m.to !== myId) break; Online.mode = m.mode === 'lobby' ? 'lobby' : 'pvp'; Online.slot = m.slot || 1; welcomed = true; Online.peerName = (m.name || 'Host').slice(0, 20); set('connected', 'Connected to ' + Online.peerName); break;
            case 'full': if (m.to === myId) { leaveRoom(false); set('closed', m.why || 'That room is full'); } break;
            case 'kick': if (m.to === myId) { const cb = Online.onLeft; leaveRoom(false); set('closed', 'You were removed from the lobby'); cb('You were removed from the lobby'); } break;
            case 'lobby': if (welcomed) { Online.lobby = { members: m.members, settings: m.settings, started: m.started }; Online.onChange(); } break;
            case 'start': if (m.to && m.to !== myId) break;
                if (m.train) { Online.inTrain = true; Online.peerName = (m.name || Online.peerName).slice(0, 20); S.online = 'guest'; S.opponentName = Online.peerName; resetSnapshotState(); startMatchSequence('online'); setArena(m.train.arena || 'normal', m.train.theme || 'frontier'); S.hazards = !!m.train.hz; Online.onChange(); break; }
                if (m.cfg) { S.online = 'guest'; Online.lobby.started = true; resetSnapshotState(); startMatchSequence('lobby', { ...m.cfg, mySlot: Online.slot }); Online.onChange(); break; }
                Online.peerName = (m.name || Online.peerName).slice(0, 20); S.online = 'guest'; S.opponentName = Online.peerName; resetSnapshotState(); startMatchSequence('online'); break;
            case 'snap': if (S.online === 'guest') applySnapshot(m.s); break;
            case 'leave': { const cb = Online.onLeft; leaveRoom(false); set('closed', 'The host left'); cb('The host left'); break; }
            case 'chat': onRemoteChat(m); break;
        }
    };
    bindChat((msg) => t.send(msg)); clearChat();
    watch();
    const hello = () => t.send({ t: 'hello', id: myId, name: Online.name, char: getMyChar() });
    hello();
    const retry = setInterval(() => { if (welcomed || Online.role !== 'guest') clearInterval(retry); else hello(); }, 500);
    setTimeout(() => { if (!welcomed && Online.role === 'guest') { clearInterval(retry); leaveRoom(false); set('closed', 'No room with that code' + (t.local ? ' (this page cannot reach the internet: open the standalone link, see the lobby note)' : '')); } }, 15000);
    pingTimer = setInterval(() => Online.t && Online.t.send({ t: 'ping', id: myId }), 2000);
    return true;
}

/** ---- guest input forwarding (main.js calls these instead of acting locally) ---- */
export function sendAct(a, extra = {}) { if (Online.role === 'guest' && Online.t) Online.t.send({ t: 'act', id: Online.myId, a, ...extra }); }
export function sendHeld(aim) {
    if (Online.role !== 'guest' || !Online.t) return;
    const h = { left: isDown('left'), right: isDown('right'), shield: isDown('shield'), drop: isDown('drop') };
    const key = JSON.stringify(h);
    if (key === lastHeld && !aim) return;
    lastHeld = key;
    Online.t.send({ t: 'held', id: Online.myId, ...h, ...(aim || {}) });
}
export function requestRematch() { if (Online.role === 'guest' && Online.t) Online.t.send({ t: 'rematch' }); else if (Online.role === 'host') { if (Online.mode === 'lobby') beginLobbyMatch(); else beginMatch(); } }
export { hasRealtime };


// ---- connection badge: "Direct" = peer to peer (fast), "Relay" = through the public broker (slower)
let badge = null;
setInterval(() => {
    const on = Online.role && Online.t && Online.status === 'connected' && S.gameState !== 'start';
    if (!on) { if (badge) badge.style.display = 'none'; return; }
    if (!badge) {
        badge = document.createElement('div');
        badge.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:14;pointer-events:none;font:800 11px system-ui,sans-serif;letter-spacing:.06em;padding:3px 10px;border-radius:10px;background:rgba(8,12,24,.75);border:1px solid rgba(148,163,184,.3)';
        document.body.appendChild(badge);
    }
    const i = Online.t.info || { mode: 'relay', rtt: 0 };
    const p2p = i.mode === 'p2p', local = i.mode === 'local';
    badge.style.display = 'block';
    badge.style.color = local ? '#a78bfa' : p2p ? '#4ade80' : '#fbbf24';
    badge.textContent = '● ' + (local ? 'SAME BROWSER' : p2p ? 'DIRECT' : 'RELAY') + (i.rtt ? ' · ' + i.rtt + ' ms' : '');
}, 1000);


// ---- party: watch a friend's match. A spectator only listens (their own inputs are never sent) and sees through the friend's fighter.
export async function spectateRoom(code, slot = 0) {
    leaveRoom(false);
    Online.name = displayName(); Online.viaQueue = false; Online.rankedQ = false;
    code = (code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { set('closed', 'Codes are 4 letters'); return false; }
    Online.role = 'spectator'; Online.code = code;
    set('joining', 'Connecting…');
    try { Online.t = await openTransport(code); } catch (e) { Online.role = null; set('closed', e.message); return false; }
    const t = Online.t, myId = Online.myId = Math.random().toString(36).slice(2, 8);
    let started = false;
    t.onmessage = (m) => {
        Online.lastRecv = performance.now();
        if (m.t === 'start' && m.to === myId && !started) {
            started = true; S.online = 'guest'; S.spectating = true; resetSnapshotState();
            if (m.cfg) { Online.lobby.started = true; startMatchSequence('lobby', { ...m.cfg, mySlot: slot }); }
            else { S.opponentName = m.gn || 'Opponent'; startMatchSequence('online'); S.mySlot = slot === 0 ? 1 : 0; S.opponentName = m.gn; }
            set('connected', 'Watching ' + (m.hn || 'the match'));
        } else if (m.t === 'snap' && started && S.online === 'guest') applySnapshot(m.s);
        else if (m.t === 'leave' && started) { const cb = Online.onLeft; leaveRoom(false); set('closed', 'The match ended'); cb('The match ended'); }
        else if (m.t === 'chat') onRemoteChat(m);
    };
    watch();
    const ask = () => t.send({ t: 'spectate', id: myId, name: Online.name });
    ask();
    const retry = setInterval(() => { if (started || Online.role !== 'spectator') clearInterval(retry); else ask(); }, 600);
    setTimeout(() => { if (!started && Online.role === 'spectator') { clearInterval(retry); leaveRoom(false); set('closed', 'That match is not running anymore'); } }, 10000);
    return true;
}
