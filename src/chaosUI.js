// Chaos mode HUD: a countdown with the name of the next twist, a big pop-up when it lands, and a bar for every twist that is running.
import { S, CHAOS_EVENTS } from './gameCore.js';
let box = null, pop = null, dark = null, lastHtml = '', lastN = 0, popTimer = 0;
function css() {
    if (document.getElementById('chaosCss')) return;
    const st = document.createElement('style'); st.id = 'chaosCss';
    st.textContent = `@keyframes chPop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}18%{transform:translate(-50%,-50%) scale(1.25);opacity:1}30%{transform:translate(-50%,-50%) scale(1)}85%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(1.15);opacity:0}}
@keyframes chTick{0%{transform:scale(1.5);opacity:.4}100%{transform:scale(1);opacity:1}}`;
    document.head.appendChild(st);
}
const ICON = { lowgrav: '🌙', highgrav: '🪨', kb: '💥', meteors: '☄️', items: '🎁', speed: '💨', slowmo: '🐌', ice: '🧊', heal: '💖', poison: '☠️', lowkb: '🪶', kb3: '🔥', infjump: '🦘', shove: '👋', wind: '🌬️', floaty: '🎈', dive: '⚓', dark: '🔦', peace: '🕊️', spike: '📈', swap: '🔀', scramble: '🌀', armor: '🛡️', mud: '🟤', fullheal: '✨', moonturbo: '🚀' };
const TINT = { ice: '125,211,252', poison: '74,222,128', heal: '244,114,182', mud: '120,83,45', slowmo: '96,165,250', lowgrav: '167,139,250', moonturbo: '167,139,250', highgrav: '120,113,108', speed: '251,191,36', wind: '226,232,240', kb3: '248,113,113', kb: '248,113,113', peace: '134,239,172', armor: '148,163,184' };
let tint = null;
export function tickChaos() {
    const C = S.chaos, on = !!(C && S.gameState === 'playing' && S.match);
    if (!on) { if (box) box.style.display = 'none'; if (dark) dark.style.display = 'none'; if (tint) tint.style.display = 'none'; return; }
    css();
    if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:41;pointer-events:none;font:800 14px system-ui,sans-serif;letter-spacing:.12em;text-align:center;color:#fff;text-shadow:0 2px 10px #000;display:none;min-width:260px';
        document.body.appendChild(box);
        pop = document.createElement('div');
        pop.style.cssText = 'position:fixed;left:50%;top:38%;z-index:42;pointer-events:none;font:900 clamp(30px,7vw,70px) system-ui,sans-serif;letter-spacing:.08em;color:#fff;text-shadow:0 0 28px #fb7185,0 4px 14px #000;text-align:center;white-space:nowrap;display:none';
        document.body.appendChild(pop);
        dark = document.createElement('div');
        dark.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;background:radial-gradient(circle at 50% 55%,rgba(0,0,0,0) 8%,rgba(0,0,0,.93) 38%);display:none';
        document.body.appendChild(dark);
    }
    if (!tint) { tint = document.createElement('div'); tint.style.cssText = 'position:fixed;inset:0;z-index:29;pointer-events:none;transition:background .4s;background:transparent'; document.body.appendChild(tint); }
    { const t = [...C.act].reverse().find(e => TINT[e.ev]); tint.style.display = 'block'; tint.style.background = t ? `radial-gradient(ellipse at center,rgba(${TINT[t.ev]},0) 45%,rgba(${TINT[t.ev]},.28) 100%)` : 'transparent'; }
    box.style.display = 'block';
    dark.style.display = C.act.some(e => e.ev === 'dark') ? 'block' : 'none';
    const secs = Math.max(0, Math.ceil(C.next / 60));
    let h;
    if (C.nextEv && C.next <= 180) h = `<div style="color:#fbbf24;font-size:12px">⚠ INCOMING TWIST</div><div style="font-size:20px;color:#fb7185">${ICON[C.nextEv] || ''} ${CHAOS_EVENTS[C.nextEv]}</div><div style="font-size:30px;line-height:1.1;animation:chTick .5s ease-out">${secs}</div>`;
    else if (C.held) h = `<div style="color:#fbbf24;font-size:12px">${ICON[C.nextEv] || ''} ${CHAOS_EVENTS[C.nextEv]} — HELD BACK (3 twists max)</div>`;
    else h = `<div style="color:#94a3b8;font-size:12px">NEXT TWIST IN ${secs}s</div>`;
    h += C.act.map(e => `<div style="margin-top:6px;font-size:12px;color:#fda4af">${ICON[e.ev] || ''} ${CHAOS_EVENTS[e.ev]} <span style="color:#cbd5e1">${Math.ceil(e.left / 60)}s</span></div><div style="margin:2px auto 0;width:200px;height:5px;border-radius:3px;background:rgba(15,23,42,.8);overflow:hidden"><div style="height:100%;width:${Math.round(100 * e.left / e.total)}%;background:#fb7185"></div></div>`).join('');
    const key = h + (C.next <= 180 ? C.next : '');
    if (key !== lastHtml) { box.innerHTML = h; lastHtml = key; }
    if (C.shown && C.shown.n !== lastN) {
        lastN = C.shown.n; pop.textContent = (ICON[C.shown.ev] || '') + ' ' + CHAOS_EVENTS[C.shown.ev]; pop.style.display = 'block'; pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = 'chPop 1.8s ease-out forwards';
        clearTimeout(popTimer); popTimer = setTimeout(() => { pop.style.display = 'none'; }, 1850);
    }
}
