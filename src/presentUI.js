// Pre-match: the character roulette wheel (races) and the player presentation (portal, walk-in, zoom, K/D).
import { setPresentHook, S } from './gameCore.js';
import { CHAR_IDS, CHARS } from './characters.js';
import { getMeta } from './meta.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const colOf = (id) => (CHARS[id] && CHARS[id].art && CHARS[id].art.skin) || '#e2e8f0';
let styled = false;
function css() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.textContent = `
.pz{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#0b1224 0%,#02040a 80%);color:#fff;font-family:inherit;overflow:hidden}
.pz-skip{position:absolute;right:18px;bottom:16px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:10px;padding:7px 14px;font-weight:700;cursor:pointer}
.rl-wrap{display:flex;flex-direction:column;align-items:center;gap:14px}
.rl-title{font-size:22px;font-weight:900;letter-spacing:.18em;color:#94a3b8}
.rl-box{position:relative;width:min(78vmin,560px);height:min(78vmin,560px)}
.rl-wheel{position:absolute;inset:0;border-radius:50%;border:8px solid #475569;box-shadow:0 0 0 4px #0f172a,0 0 60px #38bdf866;overflow:hidden;transition:transform 5.2s cubic-bezier(.1,.62,.08,1)}
.rl-seg{position:absolute;left:50%;top:50%;width:0;height:0}
.rl-lbl{position:absolute;left:0;top:0;transform-origin:0 0;white-space:nowrap;font-weight:900;font-size:clamp(14px,3.4vmin,26px);text-shadow:0 0 8px #000,0 2px 2px #000;letter-spacing:.04em}
.rl-ptr{position:absolute;left:50%;top:-18px;transform:translateX(-50%);width:0;height:0;border-left:20px solid transparent;border-right:20px solid transparent;border-top:42px solid #fde047;filter:drop-shadow(0 0 8px #facc15);z-index:3}
.rl-hub{position:absolute;left:50%;top:50%;width:74px;height:74px;margin:-37px;border-radius:50%;background:radial-gradient(circle,#fef3c7,#f59e0b);border:5px solid #0f172a;z-index:2;box-shadow:0 0 18px #f59e0b}
.rl-res{font-size:clamp(26px,6vmin,46px);font-weight:900;min-height:1.3em;text-shadow:0 0 22px currentColor}
.pp-stage{position:relative;width:min(92vw,900px);height:min(70vh,520px);display:flex;align-items:center;justify-content:center;transition:transform 1s cubic-bezier(.2,.7,.2,1)}
.pp-portal{position:absolute;right:16%;top:50%;width:min(46vmin,340px);height:min(46vmin,340px);margin-top:calc(min(46vmin,340px) / -2);transform:scale(0);transition:transform .35s cubic-bezier(.3,1.4,.5,1)}
.pp-portal i{position:absolute;inset:0;border-radius:50%;border:10px solid transparent;border-top-color:var(--c);border-bottom-color:var(--c);animation:ppspin 1.1s linear infinite;filter:drop-shadow(0 0 14px var(--c))}
.pp-portal i:nth-child(2){inset:14%;animation-duration:.8s;animation-direction:reverse;border-width:8px}
.pp-portal i:nth-child(3){inset:30%;animation-duration:.6s;border-width:6px}
.pp-portal b{position:absolute;inset:36%;border-radius:50%;background:radial-gradient(circle,#fff 0%,var(--c) 45%,transparent 72%);opacity:.8}
@keyframes ppspin{to{transform:rotate(360deg)}}
.pp-fig{position:absolute;left:8%;bottom:26%;width:70px;height:130px;transform:translateX(0);transition:transform .8s linear,opacity .25s}
.pp-fig .h{position:absolute;left:18px;top:0;width:34px;height:34px;border-radius:50%;background:var(--sk);border:4px solid var(--c)}
.pp-fig .b{position:absolute;left:14px;top:36px;width:42px;height:52px;border-radius:12px;background:var(--c)}
.pp-fig .l,.pp-fig .r{position:absolute;top:86px;width:14px;height:44px;border-radius:7px;background:var(--sk);transform-origin:50% 0;animation:ppwalk .32s ease-in-out infinite alternate}
.pp-fig .l{left:16px}.pp-fig .r{left:40px;animation-direction:alternate-reverse}
@keyframes ppwalk{from{transform:rotate(-32deg)}to{transform:rotate(32deg)}}
.pp-card{position:absolute;left:6%;top:6%;opacity:0;transform:translateY(14px);transition:all .45s}
.pp-card.on{opacity:1;transform:none}
.pp-name{font-size:clamp(30px,7vmin,60px);font-weight:900;line-height:1;text-shadow:0 0 24px var(--c)}
.pp-char{font-size:clamp(18px,3.6vmin,30px);font-weight:800;margin-top:6px}
.pp-role{color:#94a3b8;font-weight:600;font-size:clamp(13px,2.4vmin,18px)}
.pp-kd{margin-top:12px;display:inline-block;padding:6px 16px;border-radius:12px;background:#0f172a;border:2px solid var(--c);font-weight:900;font-size:clamp(16px,3vmin,24px)}
.pp-count{position:absolute;left:18px;top:14px;color:#cbd5e1;font-weight:800;letter-spacing:.14em;z-index:2;text-shadow:0 0 8px #000}
.pz-3d{background:none;pointer-events:none;align-items:flex-end;justify-content:flex-start}
.cbg-intro #gameHud,.cbg-intro #aimMatrixHud,.cbg-intro #inGameMenuContainer,.cbg-intro #raceProgBox{visibility:hidden}
.pp-bar{position:absolute;left:0;right:0;height:11vh;background:#000}.pp-bar.t{top:0}.pp-bar.b{bottom:0}
.pp-card3{position:absolute;left:6%;bottom:15vh;opacity:0;transform:translateY(14px);transition:all .45s;text-shadow:0 2px 12px #000}.pp-card3.on{opacity:1;transform:none}`;
    document.head.appendChild(st);
}
const overlay = () => { css(); const o = document.createElement('div'); o.className = 'pz'; document.body.appendChild(o); return o; };

/** big wheel of characters (names in their menu colour) that slows down onto the chosen one */
export function showRoulette(chosen, done, title = 'RACE CHARACTER') {
    const o = overlay(), ids = CHAR_IDS, n = ids.length, seg = 360 / n, idx = Math.max(0, ids.indexOf(chosen));
    const stops = ids.map((id, i) => `${i % 2 ? '#111a2e' : '#1b2740'} ${i * seg}deg ${(i + 1) * seg}deg`).join(',');
    o.innerHTML = `<div class="rl-wrap"><div class="rl-title">${esc(title)}</div><div class="rl-box"><div class="rl-ptr"></div><div class="rl-hub"></div><div class="rl-wheel" style="background:conic-gradient(from 0deg,${stops})">${ids.map((id, i) => `<div style="position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(${i * seg + seg / 2 - 90}deg)"><div class="rl-lbl" style="left:70px;top:-0.6em;color:${colOf(id)};${(i * seg + seg / 2) > 180 ? 'transform:rotate(180deg);transform-origin:50% 50%' : ''}">${esc(CHARS[id].name.toUpperCase())}</div></div>`).join('')}</div></div><div class="rl-res">&nbsp;</div></div>`;
    const wheel = o.querySelector('.rl-wheel'), res = o.querySelector('.rl-res');
    let finished = false;
    const end = () => { if (finished) return; finished = true; o.remove(); done && done(); };
    // the pointer is at the top (0deg): bring segment idx's centre there after a few full turns
    const target = 360 * 6 - (idx * seg + seg / 2) + (Math.random() - 0.5) * seg * 0.6;
    requestAnimationFrame(() => requestAnimationFrame(() => { wheel.style.transform = `rotate(${target}deg)`; }));
    setTimeout(() => { if (finished) return; res.style.color = colOf(chosen); res.textContent = CHARS[chosen].name.toUpperCase() + '!'; }, 5300);
    setTimeout(end, 6900);
}

/** 3D pre-match cinematic (no skip): the camera orbits the arena, then visits every spawn: a portal opens, the fighter steps out, and a card shows name, character and K/D for 2 s */
export function present(list, done) {
    css();
    const o = document.createElement('div'); o.className = 'pz pz-3d'; document.body.appendChild(o);
    const m = getMeta(), ORBIT = 3200, PER = 2000, T0 = performance.now();
    const kd = (p) => p.bot ? 'K/D n/a' : 'K/D ' + ((m.kills || 0) + ' / ' + (m.deaths || 0)) + ((m.deaths || 0) ? '  (' + ((m.kills || 0) / m.deaths).toFixed(2) + ')' : '');
    document.body.classList.add('cbg-intro');
    o.innerHTML = '<div class="pp-bar t"></div><div class="pp-bar b"></div><div class="pp-count"></div><div class="pp-card3"></div>';
    const cnt = o.querySelector('.pp-count'), card = o.querySelector('.pp-card3');
    let shown = -2, raf = 0, ended = false;
    const end = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); S.intro = null; document.body.classList.remove('cbg-intro'); o.remove(); done(); };
    const tick = () => {
        if (ended) return;
        const el = performance.now() - T0;
        if (el < ORBIT) { S.intro = { phase: 'orbit', p: el / ORBIT, rev: [] }; if (shown !== -1) { shown = -1; cnt.textContent = 'THE ARENA'; card.classList.remove('on'); } }
        else {
            const k = Math.floor((el - ORBIT) / PER);
            if (k >= list.length) { end(); return; }
            const p = list[k], rev = list.slice(0, k).map(q => q.slot);
            S.intro = { phase: 'focus', slot: p.slot, i: k, p: ((el - ORBIT) % PER) / PER, rev };
            if (shown !== k) {
                shown = k; const c = p.color || '#38bdf8', ch = CHARS[p.char] || CHARS.luminent;
                cnt.textContent = 'PLAYER ' + (k + 1) + ' / ' + list.length; card.classList.remove('on');
                card.innerHTML = `<div class="pp-name" style="color:${esc(c)};--c:${esc(c)}">${esc(p.name || 'Player')}</div><div class="pp-char" style="color:${colOf(p.char)}">${esc(ch.name)}</div><div class="pp-role">${esc(ch.role)}</div><div class="pp-kd" style="--c:${esc(c)}">${esc(kd(p))}</div>`;
                setTimeout(() => { if (shown === k) card.classList.add('on'); }, 500);
            }
        }
        raf = requestAnimationFrame(tick);
    };
    tick();
}
export function initPresent() { setPresentHook(present); }
