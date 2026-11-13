// Kills replay: every KO of the match as its own clip (5 s before + the blow), a stats card while the camera pushes in
// on the victim, then three stats pages (click anywhere to continue) and back to the result screen.
import { S, startKillsReplay, skipKillsReplay, killsReplayActive, matchStatsData, gameOverModal } from './gameCore.js';
import { charOf } from './characters.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (secs) => { const s = Math.floor(secs); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let hud = null, pages = null, tab = 0, cur = null, onPagesDone = null;

function ensure() {
    if (hud) return;
    hud = document.createElement('div'); hud.id = 'krHud'; hud.className = 'kr-hud'; hud.style.display = 'none';
    hud.innerHTML = '<div class="kr-top"><span id="krLabel"></span><button id="krSkip" type="button">Skip ▸▸</button></div><div id="krCard" class="kr-card"></div>';
    pages = document.createElement('div'); pages.id = 'krPages'; pages.className = 'kr-pages'; pages.style.display = 'none';
    const host = $('gameOverModal') ? $('gameOverModal').parentElement : document.body;
    host.appendChild(hud); host.appendChild(pages);
    $('krSkip').addEventListener('click', (e) => { e.stopPropagation(); skipKillsReplay(); });
    pages.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-krtab]'); if (t) { e.stopPropagation(); tab = +t.dataset.krtab; drawPages(); return; } advance(); });
    window.addEventListener('keydown', (e) => { if (pages.style.display !== 'none' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); advance(); } });
}

const swatch = (c) => `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(c || '#94a3b8')};margin-right:6px"></i>`;
const cn = (c) => { try { return charOf(c).name || c; } catch (e) { return c || ''; } };

function drawPages() {
    const D = matchStatsData(), rows = D.rows.slice().sort((a, b) => b.kos - a.kos || b.stocks - a.stocks || a.falls - b.falls);
    const tabs = ['Overview', 'Combat', 'Kills'];
    let body = '';
    if (tab === 0) {
        body = `<table><tr><th>Fighter</th><th>KOs</th><th>Falls</th><th>Stocks left</th><th>Damage dealt</th><th>Damage taken</th></tr>${rows.map((r, k) => `<tr class="${k === 0 ? 'top' : ''}"><td>${swatch(r.color)}${esc(r.name)} <small>${esc(cn(r.char))}</small></td><td>${r.kos}</td><td>${r.falls}</td><td>${r.stocks}</td><td>${Math.round(r.dealt)}%</td><td>${Math.round(r.taken)}%</td></tr>`).join('')}</table><p class="kr-sub">Match length ${mmss(D.secs)}</p>`;
    } else if (tab === 1) {
        const best = (k) => rows.reduce((a, r) => (r[k] > (a ? a[k] : -1) ? r : a), null);
        const aw = [['Most damage', best('dealt'), (r) => Math.round(r.dealt) + '%'], ['Most hits', best('hits'), (r) => r.hits], ['Best combo', best('combo'), (r) => r.combo + ' hits'], ['Most KOs', best('kos'), (r) => r.kos]];
        body = `<div class="kr-aw">${aw.map(([t, r, f]) => `<div><b>${t}</b><span>${r && r[t === 'Most KOs' ? 'kos' : 'dealt'] >= 0 ? swatch(r.color) + esc(r.name) : '—'}</span><em>${r ? f(r) : ''}</em></div>`).join('')}</div>
        <table><tr><th>Fighter</th><th>Hits</th><th>Best combo</th><th>Avg dmg / hit</th><th>Damage dealt</th><th>Damage taken</th></tr>${rows.map(r => `<tr><td>${swatch(r.color)}${esc(r.name)}</td><td>${r.hits}</td><td>${r.combo}</td><td>${r.hits ? (r.dealt / r.hits).toFixed(1) : '—'}%</td><td>${Math.round(r.dealt)}%</td><td>${Math.round(r.taken)}%</td></tr>`).join('')}</table>`;
    } else {
        body = D.kills.length ? `<table><tr><th>#</th><th>Time</th><th>KO</th><th>Move</th><th>At</th><th>Combo</th></tr>${D.kills.map(k => `<tr><td>${k.n}</td><td>${mmss(k.t / 60)}</td><td>${k.an ? esc(k.an) + ' ▸ ' : ''}<b>${esc(k.dn)}</b>${k.an ? '' : ' <small>fell out</small>'}</td><td>${esc(k.move || '—')}</td><td>${k.dmg}%</td><td>${k.combo >= 2 ? k.combo + ' hits' : '—'}</td></tr>`).join('')}</table>` : '<p class="kr-sub">Nobody was knocked out.</p>';
    }
    pages.innerHTML = `<div class="kr-panel"><div class="kr-tabs">${tabs.map((t, i) => `<button type="button" data-krtab="${i}" class="${i === tab ? 'on' : ''}">${t}</button>`).join('')}</div><div class="kr-body">${body}</div><div class="kr-hint">click anywhere to continue ${tab + 1}/3</div></div>`;
}
function advance() { if (tab < 2) { tab++; drawPages(); } else closePages(); }
function closePages() { pages.style.display = 'none'; const f = onPagesDone; onPagesDone = null; if (f) f(); }
export function showStatsPages(done) { ensure(); tab = 0; onPagesDone = done || null; drawPages(); pages.style.display = 'flex'; }

function card(m) {
    const bits = [`<div class="kr-v">${esc(m.dn)} <small>${esc(cn(m.dc))}</small></div>`,
        m.an ? `<div>KO'd by <b>${esc(m.an)}</b> <small>${esc(cn(m.ac))}</small></div>` : '<div>Fell out of the arena</div>',
        `<div class="kr-row"><span>${m.dmg}%</span><small>damage</small>${m.move ? `<span>${esc(m.move)}</span><small>finisher</small>` : ''}${m.combo >= 2 ? `<span>${m.combo}</span><small>hit combo</small>` : ''}<span>${m.left}</span><small>stock${m.left === 1 ? '' : 's'} left</small></div>`];
    return bits.join('');
}

export function initKills() {
    ensure();
    const kb = $('killsBtn'), sb = $('statsBtn');
    const back = () => { hud.style.display = 'none'; showStatsPages(() => gameOverModal.classList.remove('hidden')); };
    kb.addEventListener('click', () => {
        if (S.gameState !== 'gameover') return;
        gameOverModal.classList.add('hidden');
        hud.style.display = 'block'; $('krCard').style.opacity = 0;
        if (!startKillsReplay((i, n, m) => { cur = m; $('krLabel').textContent = `KILL ${i + 1} / ${n}`; $('krCard').innerHTML = card(m); }, () => { cur = null; back(); })) { hud.style.display = 'none'; gameOverModal.classList.remove('hidden'); }
    });
    sb.addEventListener('click', () => { gameOverModal.classList.add('hidden'); showStatsPages(() => gameOverModal.classList.remove('hidden')); });
}
/** called every frame: button visibility + the victim card while the camera is zoomed in */
export function tickKills() {
    if (!hud) return;
    const over = S.gameState === 'gameover' && !S.replay && S.online !== 'guest' && !killsReplayActive();
    const kb = $('killsBtn'), sb = $('statsBtn');
    kb.classList.toggle('hidden', !(over && S.clips && S.clips.length));
    sb.classList.toggle('hidden', !(over && S.klog && S.ms && S.ms.length));
    if (killsReplayActive() && S.replay) { const c = $('krCard'); c.style.opacity = S.kcT > 0 && S.kcFull ? Math.min(1, S.kcT / 0.3, (S.kcDur - S.kcT) / 0.25 + 0.0) : 0; }
}
