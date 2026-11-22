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
export function tickChaos() {
    const C = S.chaos, on = !!(C && S.gameState === 'playing' && S.match);
    if (!on) { if (box) box.style.display = 'none'; if (dark) dark.style.display = 'none'; return; }
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
    box.style.display = 'block';
    dark.style.display = C.act.some(e => e.ev === 'dark') ? 'block' : 'none';
    const secs = Math.max(0, Math.ceil(C.next / 60));
    let h;
    if (C.nextEv && C.next <= 180) h = `<div style="color:#fbbf24;font-size:12px">⚠ INCOMING TWIST</div><div style="font-size:20px;color:#fb7185">${CHAOS_EVENTS[C.nextEv]}</div><div style="font-size:30px;line-height:1.1;animation:chTick .5s ease-out">${secs}</div>`;
    else h = `<div style="color:#94a3b8;font-size:12px">NEXT TWIST IN ${secs}s</div>`;
    h += C.act.map(e => `<div style="margin-top:6px;font-size:12px;color:#fda4af">${CHAOS_EVENTS[e.ev]} <span style="color:#cbd5e1">${Math.ceil(e.left / 60)}s</span></div><div style="margin:2px auto 0;width:200px;height:5px;border-radius:3px;background:rgba(15,23,42,.8);overflow:hidden"><div style="height:100%;width:${Math.round(100 * e.left / e.total)}%;background:#fb7185"></div></div>`).join('');
    const key = h + (C.next <= 180 ? C.next : '');
    if (key !== lastHtml) { box.innerHTML = h; lastHtml = key; }
    if (C.shown && C.shown.n !== lastN) {
        lastN = C.shown.n; pop.textContent = CHAOS_EVENTS[C.shown.ev]; pop.style.display = 'block'; pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = 'chPop 1.8s ease-out forwards';
        clearTimeout(popTimer); popTimer = setTimeout(() => { pop.style.display = 'none'; }, 1850);
    }
}
