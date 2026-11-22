// Chaos mode banner: the current twist with a draining bar, or a "next twist in" countdown.
import { S, CHAOS_EVENTS } from './gameCore.js';
let box = null, last = '';
export function tickChaos() {
    const C = S.chaos, on = !!(C && S.gameState === 'playing' && S.match);
    if (!on) { if (box) box.style.display = 'none'; return; }
    if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:41;pointer-events:none;font:800 15px system-ui,sans-serif;letter-spacing:.14em;text-align:center;color:#fff;text-shadow:0 2px 10px #000;display:none';
        document.body.appendChild(box);
    }
    box.style.display = 'block';
    const html = C.ev
        ? `<div style="color:#fb7185;font-size:20px">⚡ CHAOS: ${CHAOS_EVENTS[C.ev]}</div><div style="margin:5px auto 0;width:220px;height:6px;border-radius:4px;background:rgba(15,23,42,.8);overflow:hidden"><div style="height:100%;width:${Math.round(100 * C.left / (C.total || 420))}%;background:#fb7185"></div></div>`
        : `<div style="color:#94a3b8;font-size:12px">CHAOS IN ${Math.max(0, Math.ceil(C.next / 60))}s</div>`;
    if (html !== last) { box.innerHTML = html; last = html; }
}
