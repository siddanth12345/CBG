// Race HUD: a progress bar with a dot per racer, your place, and the track name. Only shown in race matches.
import { S, raceStandings } from './gameCore.js';

let box = null, bar = null, info = null;
const dots = new Map();
function ensure() {
    if (box) return;
    box = document.createElement('div'); box.id = 'raceProgBox';
    box.style.cssText = 'position:fixed;left:50%;top:124px;transform:translateX(-50%);width:min(560px,70vw);z-index:40;pointer-events:none;font:600 13px system-ui,sans-serif;color:#e2e8f0;text-align:center;display:none';
    info = document.createElement('div'); info.style.cssText = 'text-shadow:0 1px 4px #000;margin-bottom:6px;letter-spacing:.08em';
    bar = document.createElement('div'); bar.style.cssText = 'position:relative;height:10px;border-radius:6px;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.4)';
    const fin = document.createElement('div'); fin.textContent = '🏁'; fin.style.cssText = 'position:absolute;right:-6px;top:-20px;font-size:16px';
    bar.appendChild(fin); box.append(info, bar); document.body.appendChild(box);
}
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const clk = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export function tickRace() {
    if (rbar && S.replay) { const c = replayClock(), el = rbar.querySelector('[data-clock]'); if (c && el) { const v = clk(c.t) + ' / ' + clk(c.total); if (el.textContent !== v) el.textContent = v; } }
    spectate();
    const on = !!(S.race && S.match && S.match.race && S.gameState === 'playing');
    if (!on) { if (box) box.style.display = 'none'; return; }
    ensure(); box.style.display = 'block';
    const st = raceStandings(), me = st.findIndex(x => x.f.slot === (S.mySlot || 0));
    info.textContent = `${S.race.name.toUpperCase()}  •  ${me >= 0 ? ord(me + 1) + ' of ' + st.length : ''}  •  ${Math.max(0, Math.ceil((S.timeLeft || 0) / 60))}s`;
    for (const [k, el] of dots) if (!st.some(x => x.f.slot === k)) { el.remove(); dots.delete(k); }
    for (const { f, p } of st) {
        let d = dots.get(f.slot);
        if (!d) { d = document.createElement('div'); d.style.cssText = 'position:absolute;top:-3px;width:14px;height:14px;border-radius:50%;border:2px solid #0b1220;transform:translateX(-50%)'; bar.appendChild(d); dots.set(f.slot, d); }
        d.style.background = f.color; d.style.left = (p * 100).toFixed(1) + '%'; d.style.zIndex = f.slot === (S.mySlot || 0) ? 2 : 1; d.style.width = d.style.height = f.slot === (S.mySlot || 0) ? '18px' : '14px'; d.style.top = f.slot === (S.mySlot || 0) ? '-5px' : '-3px';
    }
}

// ---------------------------------------------------------------- race results: leaderboard (place, finish time, every fall) + replay of the finish with a fighter switcher
import { raceResults, startReplay, stopReplay, setRaceEndHook, gameOverModal, seekReplay, toggleReplayPause, replayClock, endRaceNow, fighters } from './gameCore.js';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (fr) => { const s = fr / 60, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; };
let panel = null, rbar = null, doneCb = null;
function css() {
    if (document.getElementById('raceCss')) return;
    const st = document.createElement('style'); st.id = 'raceCss';
    st.textContent = `.rc-panel{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(2,6,16,.82);backdrop-filter:blur(6px);font-family:system-ui,sans-serif;color:#e2e8f0}
.rc-box{width:min(760px,94vw);max-height:90vh;overflow:auto;background:#0b1220;border:1px solid rgba(148,163,184,.3);border-radius:18px;padding:22px}
.rc-box h2{margin:0 0 4px;font-size:22px;letter-spacing:.12em}.rc-box small{color:#94a3b8}
.rc-box table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}.rc-box th{text-align:left;color:#94a3b8;font-weight:600;padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.25)}
.rc-box td{padding:8px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top}.rc-box tr.w td{background:rgba(250,204,21,.08)}
.rc-box .pl{font-weight:800;font-size:16px;width:34px}.rc-box .fl{color:#fca5a5;font-size:12px}.rc-box .ok{color:#86efac}
.rc-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}.rc-btns button,.rc-bar button{background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,.4);border-radius:10px;padding:9px 14px;font-weight:600;cursor:pointer}
.rc-btns button.pri{background:#2563eb;border-color:#3b82f6}.rc-bar{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:61;display:none;gap:8px;flex-wrap:wrap;justify-content:center;max-width:92vw;background:rgba(2,6,16,.8);padding:10px 14px;border-radius:14px;border:1px solid rgba(148,163,184,.3);font:600 13px system-ui;color:#e2e8f0;align-items:center}
.rc-bar button.on{background:#2563eb;border-color:#60a5fa}`;
    document.head.appendChild(st);
}
function drawResults() {
    const R = raceResults();
    const rows = R.map((r) => `<tr class="${r.place === 1 ? 'w' : ''}"><td class="pl">${r.place}</td><td><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.color)};margin-right:6px"></i>${esc(r.name)}${r.team ? ` <small>(${esc(r.team)})</small>` : ''}</td>
<td>${r.time ? `<b class="ok">${fmt(r.time)}</b>` : `<span class="fl">DNF · ${Math.round(r.p * 100)}%</span>`}</td>
<td>${r.falls.length ? `<b>${r.falls.length}</b> <span class="fl">${r.falls.map((d) => `${fmt(d.t)} (${d.p}%)`).join(' · ')}</span>` : '<span class="ok">clean run</span>'}</td></tr>`).join('');
    panel.innerHTML = `<div class="rc-box"><h2>🏁 RACE RESULTS</h2><small>${esc(S.race ? S.race.name : '')}</small>
<table><tr><th>#</th><th>Racer</th><th>Finish time</th><th>Falls (time · how far)</th></tr>${rows}</table>
<div class="rc-btns"><button class="pri" data-rc="replay">▶ Watch replay</button><button data-rc="done">Continue</button></div></div>`;
}
function ensureBars() {
    css(); if (panel) return;
    panel = document.createElement('div'); panel.className = 'rc-panel'; document.body.appendChild(panel);
    rbar = document.createElement('div'); rbar.className = 'rc-bar'; document.body.appendChild(rbar);
    panel.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-rc]'); if (!b) return; if (b.dataset.rc === 'done') { panel.style.display = 'none'; const f = doneCb; doneCb = null; f && f(); } else watch(); });
    rbar.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('button'); if (!b) return;
        if (b.dataset.cam !== undefined) { S.raceCam = +b.dataset.cam; drawBar(); }
        else if (b.dataset.rb === 'back') stopReplay();
        else if (b.dataset.rb === 'again') { const mid = !!(S.replay && S.replay.saved && S.replay.saved.live); stopReplay(); setTimeout(mid ? myReplay : watch, 30); }
        else if (b.dataset.rb === 'm10') seekReplay(-10); else if (b.dataset.rb === 'p10') seekReplay(10);
        else if (b.dataset.rb === 'pause') { toggleReplayPause(); drawBar(); }
    });
    sbar = document.createElement('div'); sbar.className = 'rc-bar'; sbar.style.zIndex = 45; document.body.appendChild(sbar);
    sbar.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('button'); if (!b) return;
        if (b.dataset.sp !== undefined) { S.raceCam = +b.dataset.sp; sKey = ''; } else if (b.dataset.sx === 'replay') myReplay(); else if (b.dataset.sx === 'skip') endRaceNow();
    });
}
let sbar = null, sKey = '';
function showRaceResults(done) { ensureBars(); doneCb = done; drawResults(); panel.style.display = 'flex'; }
/** the replay of your own run, from the start line to where you finished (the live race waits while you watch) */
function myReplay() {
    const me = fighters[S.mySlot || 0]; if (!me || !me._finI) return;
    S.raceCam = me.slot;
    const ok = startReplay(() => { rbar.style.display = 'none'; sKey = ''; }, null, { to: me._finI, live: true });
    if (!ok) return; drawBar(); rbar.style.display = 'flex'; sbar.style.display = 'none';
}
function drawBar() {
    const R = raceResults(), paused = !!(S.replay && S.replay.paused);
    rbar.innerHTML = `<button data-rb="m10">⏪ 10s</button><button data-rb="pause">${paused ? '▶ Play' : '⏸ Pause'}</button><button data-rb="p10">10s ⏩</button><span data-clock style="min-width:84px;text-align:center"></span><span>Following:</span>${R.map((r) => `<button data-cam="${r.slot}" class="${S.raceCam === r.slot ? 'on' : ''}" style="border-left:6px solid ${esc(r.color)}">${esc(r.name)}</button>`).join('')}<button data-rb="again">↻ Restart</button><button data-rb="back">✕ ${S.replay && S.replay.saved && S.replay.saved.live ? 'Close' : 'Back'}</button>`;
}
function watch() {
    const w = raceResults()[0]; S.raceCam = w ? w.slot : 0;
    panel.style.display = 'none';
    const ok = startReplay(() => { rbar.style.display = 'none'; panel.style.display = 'flex'; });
    if (!ok) { panel.style.display = 'flex'; return; }
    drawBar(); rbar.style.display = 'flex';
}
export function initRace() { setRaceEndHook(showRaceResults); }

// after you cross the line you despawn: watch the others live (switch between them), replay your run, or skip to the results
function spectate() {
    const me = S.race && S.match && S.match.race && S.gameState === 'playing' && !S.replay ? fighters[S.mySlot || 0] : null;
    if (!me || !me._finT || !me.out) { if (sbar && sbar.style.display !== 'none') { sbar.style.display = 'none'; sKey = ''; } return; }
    ensureBars();
    const live = fighters.filter(f => f.active && !f._finT);
    if (!live.some(f => f.slot === S.raceCam) && live.length) S.raceCam = live[0].slot;
    const key = live.map(f => f.slot).join(',') + '|' + S.raceCam;
    if (key !== sKey) {
        sKey = key;
        sbar.innerHTML = `<span>🏁 You finished!${me._finT ? ' ' + fmt(me._finT) : ''} Spectating:</span>${live.map((f) => `<button data-sp="${f.slot}" class="${S.raceCam === f.slot ? 'on' : ''}" style="border-left:6px solid ${esc(f.color)}">${esc(f.name)}</button>`).join('')}<button data-sx="replay">▶ Replay my run</button><button data-sx="skip">⏭ Results now</button>`;
    }
    sbar.style.display = 'flex';
}
