// 1v1 matchmaking queue. Everyone searching broadcasts a heartbeat on one shared channel; players are paired
// first-come-first-served. The first of each pair opens a room and announces its code, the second joins it.
// (Table Wars pairs players the same way, using presence.)
import { openTransport } from './transport.js';
import { Online, hostRoom, joinRoom, leaveRoom, setLobbySetting, beginLobbyMatch } from './online.js';

export const Queue = { active: false, waiting: 0, onChange: () => {} };
let rankedQ = false, kind = '1v1', since = 0, t = null, hbT = 0, id = '', t0 = 0, peers = new Map(), matched = false, announcing = 0;
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

function stop() {
    clearInterval(hbT); hbT = 0; clearInterval(announcing); announcing = 0;
    if (t) { try { t.send({ t: 'unq', id }); } catch (e) { /* ignore */ } t.close(); }
    t = null; peers.clear(); Queue.active = false; Queue.waiting = 0; Queue.onChange();
}
export function leaveQueue() { matched = true; stop(); }

export const QUEUE_KINDS = { '1v1': '1v1', koth: 'King of the Hill', race: 'Race' };
/** kind: '1v1' (pairs), 'koth' or 'race' (groups of 2 to 4). Every queue match counts for rating. */
export async function joinQueue(ranked = true, k = '1v1') {
    leaveRoom(false);
    rankedQ = !!ranked; kind = QUEUE_KINDS[k] ? k : '1v1'; since = 0; Online.queueKind = kind;
    stop(); matched = false;
    id = Math.random().toString(36).slice(2, 9); t0 = Date.now();
    try { t = await openTransport(kind === '1v1' ? (rankedQ ? 'mm1v1r' : 'mm1v1') : 'mm' + kind); } catch (e) { Online.note = e.message; Online.status = 'closed'; Online.onChange(); return false; }
    Queue.active = true; Queue.onChange();
    t.onmessage = (m) => {
        if (matched || !m) return;
        if (m.t === 'q') peers.set(m.id, { t0: m.t0, seen: Date.now() });
        else if (m.t === 'unq') peers.delete(m.id);
        else if (m.t === 'matched' && (m.b === id || (Array.isArray(m.ids) && m.ids.includes(id) && m.a !== id))) { matched = true; const code = m.code; stop(); joinRoom(code); Online.viaQueue = true; Online.rankedQ = rankedQ; }
    };
    const tick = () => {
        if (matched || !t) return;
        t.send({ t: 'q', id, t0 });
        const now = Date.now();
        for (const [k, v] of peers) if (now - v.seen > 3500) peers.delete(k);
        Queue.waiting = peers.size; Queue.onChange();
        const list = [{ id, t0 }, ...[...peers].map(([k, v]) => ({ id: k, t0: v.t0 }))].sort((a, b) => a.t0 - b.t0 || a.id.localeCompare(b.id));
        if (kind !== '1v1') {                                  // groups: the longest-waiting player opens the lobby once 2+ are there (at once at 4, otherwise after 5 s)
            if (list[0].id !== id || list.length < 2) { since = 0; return; }
            if (!since) since = now;
            if (list.length >= 4 || now - since > 5000) hostGroup(list.slice(0, 4).map(x => x.id));
            return;
        }
        const i = list.findIndex(x => x.id === id);
        if (i % 2 === 0 && list[i + 1]) host(list[i + 1].id);
    };
    hbT = setInterval(tick, 1000); tick();
    return true;
}

async function host(partner) {
    if (matched) return;
    matched = true;
    const code = newCode();
    const qt = t; t = null; clearInterval(hbT); hbT = 0;     // keep the queue channel just long enough to announce
    const ok = await hostRoom(code);
    if (!ok) { qt.close(); matched = false; Queue.active = false; Queue.onChange(); return; }
    Online.viaQueue = true; Online.rankedQ = rankedQ;
    let n = 0;
    announcing = setInterval(() => {
        qt.send({ t: 'matched', a: id, b: partner, code });
        if (++n >= 8 || Online.status === 'connected') { clearInterval(announcing); announcing = 0; qt.send({ t: 'unq', id }); qt.close(); Queue.active = false; Queue.onChange(); }
    }, 500);
    setTimeout(() => {                                         // the partner never showed up (they matched someone else): search again
        if (Online.role === 'host' && Online.status !== 'connected') { leaveRoom(false); joinQueue(rankedQ); }
    }, 9000);
}

/** King of the Hill / Race queue: open a locked lobby, announce its code to the others, start when they are in */
async function hostGroup(ids) {
    if (matched) return;
    matched = true;
    const code = newCode(), k = kind;
    const qt = t; t = null; clearInterval(hbT); hbT = 0;
    const ok = await hostRoom(code, 'lobby');
    if (!ok) { qt.close(); matched = false; Queue.active = false; Queue.onChange(); return; }
    Online.viaQueue = true; Online.rankedQ = rankedQ;
    const L = Online.lobby; L.cap = ids.length;
    setLobbySetting('mode', k === 'koth' ? 'koth' : 'race', true); setLobbySetting('timeLimit', k === 'koth' ? 3 : 5, true); setLobbySetting('stocks', 3, true);
    setLobbySetting('map', k === 'koth' ? 'sunny' : ['frontier', 'big', 'horizon', 'bighorizon', 'lava', 'biglava', 'sunny'][Math.floor(Math.random() * 7)], true);
    setLobbySetting('teams', false, true); setLobbySetting('items', { on: k === 'race', types: undefined }, true);
    L.locked = true;
    let n = 0;
    announcing = setInterval(() => { qt.send({ t: 'matched', a: id, ids, code }); if (++n >= 10) { clearInterval(announcing); announcing = 0; qt.send({ t: 'unq', id }); qt.close(); Queue.active = false; Queue.onChange(); } }, 500);
    let waited = 0;
    const go = setInterval(() => {                           // start when everyone is in, or after 10 s with at least 2
        waited += 500;
        if (Online.role !== 'host' || Online.mode !== 'lobby') { clearInterval(go); return; }
        const humans = Online.lobby.members.length;
        if (humans >= ids.length || (waited >= 10000 && humans >= 2)) { clearInterval(go); beginLobbyMatch(); }
        else if (waited >= 14000) { clearInterval(go); leaveRoom(false); joinQueue(rankedQ, k); }
    }, 500);
}
