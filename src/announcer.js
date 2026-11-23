// Announcer: a voice (the browser's speech synthesis) plus a big caption for the moments of a match: countdown, KOs, last stocks, the clock, tag / hill changes, chaos twists, the winner.
import { S, fighters, audio, CHAOS_EVENTS } from './gameCore.js';

const KEY = 'luminary.announcer';
export const announcerOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
export const setAnnouncer = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ } if (!on) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } } };

let cap = null, capT = 0, voice = null, lastSay = {}, st = {};
function caption(text, big) {
    if (!cap) { cap = document.createElement('div'); cap.style.cssText = 'position:fixed;left:50%;top:21%;transform:translateX(-50%);z-index:44;pointer-events:none;font:900 clamp(22px,4.2vw,46px) system-ui,sans-serif;letter-spacing:.1em;color:#fff;text-shadow:0 0 22px #38bdf8,0 4px 12px #000;white-space:nowrap;opacity:0;transition:opacity .25s'; document.body.appendChild(cap); }
    cap.textContent = text; cap.style.fontSize = big ? 'clamp(30px,6vw,64px)' : ''; cap.style.opacity = 1; clearTimeout(capT); capT = setTimeout(() => { cap.style.opacity = 0; }, big ? 1500 : 1100);
}
function pickVoice() {
    try { const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); voice = vs.find(v => /male|daniel|david|google uk english male|alex|fred/i.test(v.name) && !/female/i.test(v.name)) || vs[0] || null; } catch (e) { voice = null; }
}
/** say(text, { key, gap, big }) — key + gap (frames-ish ms) stop the same line repeating too fast */
export function say(text, o = {}) {
    if (!announcerOn() || audio.muted || S.demo) return;
    const now = performance.now(), k = o.key || text;
    if (lastSay[k] && now - lastSay[k] < (o.gap || 1500)) return; lastSay[k] = now;
    caption(text, o.big);
    try {
        if (!('speechSynthesis' in window)) return;
        if (!voice) pickVoice();
        if (o.cut) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text).toLowerCase().replace(/!/g, '.')); u.rate = o.rate || 1.08; u.pitch = 0.75; u.volume = 0.9; if (voice) u.voice = voice;
        speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device: the caption still shows */ }
}
const nm = (f) => String(f.name || f.tagName || 'Player').slice(0, 14);
let seen = { gs: '', cd: -9, stocks: {}, kills: {}, it: -2, who: -2, chaos: 0, tl: 0, sd: false, first: true };
export function tickAnnouncer() {
    if (!S.match && S.gameMode !== 'training') { seen.gs = S.gameState; return; }
    const gs = S.gameState;
    if (gs === 'countdown' || gs === 'playing') {
        if (S.cdN !== seen.cd && S.cdN >= 0) { say(S.cdN === 0 ? 'Go!' : String(S.cdN), { key: 'cd' + S.cdN, gap: 400, big: true, cut: true }); }
        seen.cd = S.cdN;
    }
    if (gs === 'playing' && S.match && !S.demo) {
        if (seen.gs !== 'playing') { seen.first = true; seen.kills = {}; seen.stocks = {}; seen.it = -2; seen.who = -2; seen.chaos = 0; seen.tl = 0; seen.sd = false; }
        const act = fighters.filter(f => f.active);
        for (const f of act) {
            const key = f.slot, ks = f.kills || 0, sk = f.stocks;
            if (!seen.first && ks > (seen.kills[key] || 0)) { const n = ks; say(n === 1 && !seen.anyKill ? `First blood. ${nm(f)}` : n >= 5 ? `${nm(f)} is unstoppable` : n === 3 ? `${nm(f)} is on fire` : `${nm(f)} scores`, { key: 'k' + key, gap: 2500 }); seen.anyKill = true; }
            if (!seen.first && S.match.mode === 'stock' && sk === 1 && (seen.stocks[key] || 9) > 1) say(`${nm(f)}, final stock`, { key: 'fs' + key, gap: 3000 });
            seen.kills[key] = ks; seen.stocks[key] = sk;
        }
        if (S.sudden && !seen.sd) say('Sudden death!', { big: true, cut: true }); seen.sd = !!S.sudden;
        if (S.match.mode === 'timer' && !S.sudden) {
            const sec = Math.ceil((S.timeLeft || 0) / 60);
            if (sec <= 30 && sec > 29 && seen.tl !== 30) { say('Thirty seconds left', { key: 't30' }); seen.tl = 30; }
            if (sec <= 10 && sec > 9 && seen.tl !== 10) { say('Ten seconds', { key: 't10' }); seen.tl = 10; }
        }
        const M = S.md;
        if (M && M.sub === 'tag' && M.it !== seen.it && M.it >= 0) { const f = act.find(x => x.slot === M.it); if (f) say(`${nm(f)} is it!`, { key: 'tag', gap: 1200 }); seen.it = M.it; }
        if (M && M.sub === 'koth' && M.who !== seen.who) { const f = act.find(x => x.slot === M.who); if (f) say(`${nm(f)} takes the hill`, { key: 'hill', gap: 2500 }); else if (seen.who >= 0) say('Hill is open', { key: 'hillopen', gap: 3000 }); seen.who = M.who; }
        if (S.chaos && S.chaos.shown && S.chaos.shown.n !== seen.chaos) { seen.chaos = S.chaos.shown.n; say(CHAOS_EVENTS[S.chaos.shown.ev] || 'Chaos', { key: 'chaos', gap: 500, rate: 1.15 }); }
        seen.first = false;
    }
    if (gs === 'gameover' && seen.gs !== 'gameover') say(S.winnerLabel ? (S.winnerLabel + ' wins') : 'Game', { key: 'end', gap: 500, big: true, cut: true });
    seen.gs = gs;
}
