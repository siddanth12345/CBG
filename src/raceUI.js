// Race HUD: a progress bar with a dot per racer, your place, and the track name. Only shown in race matches.
import { S, raceStandings } from './gameCore.js';

let box = null, bar = null, info = null;
const dots = new Map();
function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;top:124px;transform:translateX(-50%);width:min(560px,70vw);z-index:40;pointer-events:none;font:600 13px system-ui,sans-serif;color:#e2e8f0;text-align:center;display:none';
    info = document.createElement('div'); info.style.cssText = 'text-shadow:0 1px 4px #000;margin-bottom:6px;letter-spacing:.08em';
    bar = document.createElement('div'); bar.style.cssText = 'position:relative;height:10px;border-radius:6px;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.4)';
    const fin = document.createElement('div'); fin.textContent = '🏁'; fin.style.cssText = 'position:absolute;right:-6px;top:-20px;font-size:16px';
    bar.appendChild(fin); box.append(info, bar); document.body.appendChild(box);
}
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
export function tickRace() {
    const on = !!(S.race && S.match && S.match.race && S.gameState === 'playing');
    if (!on) { if (box) box.style.display = 'none'; return; }
    ensure(); box.style.display = 'block';
    const st = raceStandings(), me = st.findIndex(x => x.f.slot === (S.mySlot || 0));
    info.textContent = `${S.race.name.toUpperCase()}  •  ${me >= 0 ? ord(me + 1) + ' of ' + st.length : ''}  •  ${Math.max(0, Math.ceil((S.timeLeft || 0) / 60))}s`;
    for (const { f, p } of st) {
        let d = dots.get(f);
        if (!d) { d = document.createElement('div'); d.style.cssText = 'position:absolute;top:-3px;width:14px;height:14px;border-radius:50%;border:2px solid #0b1220;transform:translateX(-50%)'; bar.appendChild(d); dots.set(f, d); }
        d.style.background = f.color; d.style.left = (p * 100).toFixed(1) + '%'; d.style.zIndex = f.slot === (S.mySlot || 0) ? 2 : 1; d.style.width = d.style.height = f.slot === (S.mySlot || 0) ? '18px' : '14px'; d.style.top = f.slot === (S.mySlot || 0) ? '-5px' : '-3px';
    }
}
