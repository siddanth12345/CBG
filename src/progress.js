// Player level (1-100) and achievements. XP comes from time spent in matches plus kills / wins / races and one-off achievement rewards.
// The curve: level 1 needs 1 minute of play, the last level (99 -> 100) about 55 minutes, in between it grows steadily (geometric), at roughly 100 XP per minute of play.
import { getMeta, touchMeta, onMetaChange } from './meta.js';
import { notify } from './hudExtras.js';
import { CHAR_IDS } from './characters.js';

export const MAX_LEVEL = 100, XP_PER_MIN = 100, LAST_LEVEL_MIN = 55;
/** XP to climb from level L-1 to L */
export const needFor = (L) => Math.round(XP_PER_MIN * Math.pow(LAST_LEVEL_MIN, (L - 1) / (MAX_LEVEL - 1)));
const CUM = [0]; for (let L = 1; L <= MAX_LEVEL; L++) CUM[L] = CUM[L - 1] + needFor(L);
export const totalXpFor = (L) => CUM[Math.max(0, Math.min(MAX_LEVEL, L))];
export function levelOf(xp) { let L = 0; while (L < MAX_LEVEL && xp >= CUM[L + 1]) L++; return L; }
export function levelInfo(xp = (getMeta().prog || {}).xp || 0) {
    const L = levelOf(xp), next = L >= MAX_LEVEL ? null : CUM[L + 1] - CUM[L], into = xp - CUM[L];
    return { level: L, into: next ? into : 0, next: next || 0, frac: next ? into / next : 1, xp };
}

const A = (id, icon, name, desc, xp, check) => ({ id, icon, name, desc, xp, check });
/** check(P, m): P = lifetime stats, m = this match (st = your stats, won, char, secs, race, chaos, ranked, mode) */
export const ACHIEVEMENTS = [
    A('first', '👣', 'First Steps', 'Finish a match.', 40, (P) => P.matches >= 1),
    A('win1', '🏆', 'Winner', 'Win a match.', 60, (P) => P.wins >= 1),
    A('m10', '🎮', 'Getting Warm', 'Play 10 matches.', 80, (P) => P.matches >= 10),
    A('m50', '🎯', 'Regular', 'Play 50 matches.', 200, (P) => P.matches >= 50),
    A('m200', '🛡️', 'Veteran', 'Play 200 matches.', 600, (P) => P.matches >= 200),
    A('w10', '🥉', 'Ten Wins', 'Win 10 matches.', 150, (P) => P.wins >= 10),
    A('w50', '🥈', 'Fifty Wins', 'Win 50 matches.', 400, (P) => P.wins >= 50),
    A('w100', '🥇', 'Hundred Wins', 'Win 100 matches.', 900, (P) => P.wins >= 100),
    A('k1', '🩸', 'First Blood', 'Knock out a fighter.', 40, (P) => P.kills >= 1),
    A('k25', '🏹', 'Hunter', 'Get 25 knockouts.', 150, (P) => P.kills >= 25),
    A('k100', '⚔️', 'Slayer', 'Get 100 knockouts.', 400, (P) => P.kills >= 100),
    A('k500', '💀', 'Reaper', 'Get 500 knockouts.', 1200, (P) => P.kills >= 500),
    A('flaw', '✨', 'Flawless', 'Win without losing a stock.', 120, (P, m) => m.won && m.st.deaths === 0),
    A('flaw5', '💎', 'Untouchable', 'Win 5 matches without losing a stock.', 450, (P) => P.flawless >= 5),
    A('comeback', '🔥', 'Comeback', 'Win after being above 150% damage.', 150, (P, m) => m.won && m.st.maxDmg >= 150),
    A('fast', '⚡', 'Speed Run', 'Win a match in under 90 seconds.', 150, (P, m) => m.won && m.secs < 90),
    A('long', '⏳', 'Marathon', 'Win a match that lasts over 3 minutes.', 120, (P, m) => m.won && m.secs > 180),
    A('combo4', '🥊', 'Combo Artist', 'Land a 4-hit combo.', 100, (P) => P.bestCombo >= 4),
    A('combo8', '👑', 'Combo King', 'Land an 8-hit combo.', 400, (P) => P.bestCombo >= 8),
    A('dmg150', '💥', 'Heavy Hitter', 'Deal 150 damage in one match.', 100, (P) => P.bestDealt >= 150),
    A('dmg300', '☄️', 'Wrecker', 'Deal 300 damage in one match.', 300, (P) => P.bestDealt >= 300),
    A('grab3', '🤝', 'Grab Happy', 'Land 3 grabs in one match.', 100, (P, m) => m.st.grabs >= 3),
    A('stab3', '🗡️', 'Backstabber', 'Land 3 backstabs in one match.', 120, (P, m) => m.st.backstabs >= 3),
    A('ctr2', '🛑', 'Counter Master', 'Land 2 counters in one match.', 120, (P, m) => m.st.counters >= 2),
    A('items10', '🎁', 'Collector', 'Pick up 10 items.', 150, (P) => P.items >= 10),
    A('race1', '🏁', 'Racer', 'Finish a race.', 80, (P) => P.raceFinish >= 1),
    A('race3', '🚩', 'Podium', 'Finish a race in the top 3.', 150, (P) => P.racePodium >= 1),
    A('racew', '🏎️', 'Race Winner', 'Win a race.', 250, (P) => P.raceWins >= 1),
    A('racec', '🧼', 'Clean Run', 'Finish a race without falling once.', 250, (P, m) => !!m.race && m.race.time > 0 && m.race.falls === 0),
    A('race10', '🛣️', 'Road Warrior', 'Finish 10 races.', 400, (P) => P.raceFinish >= 10),
    A('chaos1', '🌪️', 'Chaos Survivor', 'Finish a Chaos mode match.', 100, (P) => P.chaos >= 1),
    A('chaosw', '🎲', 'Chaos Champion', 'Win a Chaos mode match.', 250, (P, m) => m.chaos && m.won),
    A('chars3', '🎭', 'Pick a Side', 'Win with 3 different characters.', 200, (P) => P.charsWon.length >= 3),
    A('chars8', '🌈', 'One of Each', 'Win with all 8 characters.', 1000, (P) => P.charsWon.length >= CHAR_IDS.length),
    A('rank1', '📈', 'Ranked Debut', 'Win a ranked match.', 150, (P, m) => m.ranked && m.won),
    A('silver', '🥈', 'Silver League', 'Reach 1500 rating.', 300, () => (getMeta().rating || 0) >= 1500),
    A('gold', '🥇', 'Gold League', 'Reach 2100 rating.', 700, () => (getMeta().rating || 0) >= 2100),
    A('hardwin', '🤖', 'Bot Basher', 'Win against a Hard bot.', 150, (P, m) => m.won && m.mode === 'hard'),
    A('rich', '🪙', 'Pocket Money', 'Hold 1000 coins.', 150, () => (getMeta().coins || 0) >= 1000),
    A('t1h', '🕐', 'One Hour', 'Play for one hour in total.', 300, (P) => P.playSec >= 3600),
    A('t5h', '🕔', 'Dedicated', 'Play for five hours in total.', 1000, (P) => P.playSec >= 18000),
    A('l10', '🔟', 'Level 10', 'Reach level 10.', 150, () => levelOf(xpNow()) >= 10),
    A('l25', '⭐', 'Level 25', 'Reach level 25.', 400, () => levelOf(xpNow()) >= 25),
    A('l50', '🌟', 'Level 50', 'Reach level 50.', 1000, () => levelOf(xpNow()) >= 50),
    A('l75', '💫', 'Level 75', 'Reach level 75.', 2000, () => levelOf(xpNow()) >= 75),
    A('l100', '🏅', 'Level 100', 'Reach the maximum level.', 3000, () => levelOf(xpNow()) >= 100),
];
const xpNow = () => (getMeta().prog || {}).xp || 0;
const blankP = () => ({ xp: 0, ach: {}, matches: 0, wins: 0, kills: 0, deaths: 0, flawless: 0, bestCombo: 0, bestDealt: 0, items: 0, playSec: 0, raceFinish: 0, racePodium: 0, raceWins: 0, chaos: 0, charsWon: [] });
export function prog() { const M = getMeta(); if (!M.prog) M.prog = blankP(); else for (const k in blankP()) if (M.prog[k] === undefined) M.prog[k] = blankP()[k]; return M.prog; }

const toasts = [];
function pushXp(P, n) {
    const before = levelOf(P.xp); P.xp = Math.min(totalXpFor(MAX_LEVEL), P.xp + Math.max(0, Math.round(n)));
    const after = levelOf(P.xp); if (after > before) toasts.push(`⬆ LEVEL UP! You are level ${after}`);
}
/** called once when a match ends (not training / demo). Returns a summary for the game-over screen. */
export function awardMatch(m) {
    const P = prog(), st = m.st || {}, secs = Math.max(0, Math.min(1500, m.secs || 0));
    let xp = secs * XP_PER_MIN / 60 + (st.kills || 0) * 12 + (m.won ? 50 : 0);
    P.matches++; if (m.won) P.wins++; P.kills += st.kills || 0; P.deaths += st.deaths || 0; P.playSec += secs;
    if (m.won && (st.deaths || 0) === 0) P.flawless++;
    P.bestCombo = Math.max(P.bestCombo, st.combo || 0); P.bestDealt = Math.max(P.bestDealt, st.dealt || 0); P.items += st.items || 0;
    if (m.chaos) P.chaos++;
    if (m.won && m.char && !P.charsWon.includes(m.char)) P.charsWon.push(m.char);
    if (m.race) { if (m.race.time > 0) { P.raceFinish++; xp += 40 + Math.max(0, 4 - m.race.place) * 10; if (m.race.place <= 3) P.racePodium++; if (m.race.place === 1) P.raceWins++; } }
    pushXp(P, xp);
    const got = [];
    for (let pass = 0; pass < 3; pass++) {                                   // level-based achievements can unlock after the XP of earlier ones
        let any = false;
        for (const a of ACHIEVEMENTS) { if (P.ach[a.id]) continue; let ok = false; try { ok = !!a.check(P, m); } catch (e) { ok = false; } if (ok) { P.ach[a.id] = Date.now(); any = true; got.push(a); pushXp(P, a.xp); } }
        if (!any) break;
    }
    touchMeta();
    const info = levelInfo(P.xp);
    got.forEach((a, i) => setTimeout(() => notify(`🏆 Achievement: ${a.name} (+${a.xp} XP)`, 4200), 1500 + i * 700));
    toasts.forEach((t, i) => setTimeout(() => notify(t, 4600), 900 + i * 900)); toasts.length = 0;
    return { xp: Math.round(xp), got, ...info };
}

// ---------------------------------------------------------------- profile panel
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let panel = null;
function render() {
    const P = prog(), L = levelInfo(P.xp), done = ACHIEVEMENTS.filter(a => P.ach[a.id]).length;
    const rows = ACHIEVEMENTS.map(a => { const ok = !!P.ach[a.id]; return `<div style="display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:${ok ? 'rgba(34,197,94,.12)' : 'rgba(30,41,59,.7)'};border:1px solid ${ok ? 'rgba(34,197,94,.5)' : 'rgba(148,163,184,.2)'};opacity:${ok ? 1 : .72}"><span style="font-size:24px;filter:${ok ? 'none' : 'grayscale(1)'}">${a.icon}</span><div style="flex:1"><b>${esc(a.name)}</b><div style="font-size:12px;color:#94a3b8">${esc(a.desc)}</div></div><span style="font-size:12px;color:${ok ? '#86efac' : '#fde047'};font-weight:700">${ok ? '✔' : '+' + a.xp + ' XP'}</span></div>`; }).join('');
    const t = Math.round(P.playSec / 60), hrs = t >= 60 ? `${Math.floor(t / 60)}h ${t % 60}m` : `${t}m`;
    panel.querySelector('[data-body]').innerHTML = `<div style="text-align:center;margin-bottom:12px"><div style="font-size:44px;font-weight:900;color:#fde047;line-height:1">LEVEL ${L.level}</div>
<div style="margin:8px auto;width:min(420px,86%);height:14px;border-radius:8px;background:rgba(15,23,42,.9);border:1px solid rgba(148,163,184,.4);overflow:hidden"><div style="height:100%;width:${(L.frac * 100).toFixed(1)}%;background:linear-gradient(90deg,#22d3ee,#a78bfa)"></div></div>
<div style="font-size:13px;color:#94a3b8">${L.next ? `${L.into} / ${L.next} XP to level ${L.level + 1}` : 'MAX LEVEL'} · ${P.matches} matches · ${P.wins} wins · ${P.kills} KOs · ${hrs} played</div></div>
<div style="font-weight:800;margin:6px 0">Achievements ${done} / ${ACHIEVEMENTS.length}</div><div style="display:grid;gap:6px">${rows}</div>`;
}
export function openProfile() {
    if (!panel) {
        panel = document.createElement('div'); panel.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(2,6,16,.9);display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#e2e8f0';
        panel.innerHTML = '<div style="width:min(620px,94vw);max-height:90vh;overflow:auto;background:#0b1220;border:1px solid rgba(148,163,184,.3);border-radius:18px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h2 style="margin:0;letter-spacing:.1em">PROFILE</h2><button data-x class="lm-btn lm-mini">✕ Close</button></div><div data-body></div></div>';
        document.body.appendChild(panel); panel.addEventListener('click', (e) => { if (e.target === panel || e.target.closest('[data-x]')) panel.style.display = 'none'; });
    }
    render(); panel.style.display = 'flex';
}
export function initProgress() {
    const b = document.getElementById('profileBtnStart'); if (!b) return;
    b.addEventListener('click', openProfile);
    const upd = () => { const s = b.querySelector('small'); if (s) s.textContent = `Level ${levelInfo().level} · ${Object.keys(prog().ach).length}/${ACHIEVEMENTS.length} achievements`; };
    upd(); onMetaChange(upd);
}
