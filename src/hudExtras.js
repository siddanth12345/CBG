/** On-screen extras: the combo counter (with a warning before the finisher) and the training-mode numbers readout. Pure DOM, fed by gameCore each HUD tick. */
let box = null, combo = null, readout = null, kc = null, kcLines = null, kcFlash = null, kcTxt = null, kcCanvas = null, last = { c: '', r: '' };

function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'cbgExtras';
    box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;font-family:inherit;';
    combo = document.createElement('div');
    combo.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));top:34%;text-align:right;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.7);transition:transform .08s;';
    readout = document.createElement('div');
    readout.style.cssText = 'position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(96px,env(safe-area-inset-bottom));min-width:210px;max-width:290px;padding:8px 10px;border-radius:10px;background:rgba(2,6,23,.72);border:1px solid rgba(148,163,184,.35);color:#e2e8f0;font-size:11px;line-height:1.45;font-variant-numeric:tabular-nums;display:none;';
    kc = document.createElement('div');                                             // the black-and-white "impact frame" for the final blow (lines + flashes, drawn over the canvas)
    kc.style.cssText = 'position:fixed;inset:0;z-index:31;pointer-events:none;overflow:hidden;display:none;';
    kcLines = document.createElement('div');
    kcLines.style.cssText = 'position:absolute;inset:-20%;background:repeating-conic-gradient(from 3deg at 50% 50%,#fff 0 .9deg,#000 .9deg 2.3deg,#fff 2.3deg 2.7deg,#000 2.7deg 5.1deg,#fff 5.1deg 5.4deg,#000 5.4deg 7.3deg);-webkit-mask-image:radial-gradient(circle at 50% 50%,transparent 14%,#000 62%);mask-image:radial-gradient(circle at 50% 50%,transparent 14%,#000 62%);mix-blend-mode:difference;';
    kcFlash = document.createElement('div');
    kcFlash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;';
    const kt = document.createElement('div'); kt.textContent = 'FINAL BLOW'; kt.style.cssText = 'position:absolute;left:0;right:0;top:14%;text-align:center;font:900 clamp(30px,7vw,72px) system-ui;letter-spacing:.14em;color:#fff;mix-blend-mode:difference;transform:skewX(-8deg);';
    kc.append(kcLines, kcFlash, kt); kcTxt = kt;
    box.append(combo, readout);
    document.body.append(box, kc);
}

const NEXT = ['', '', '', 'Hit 4: knockback grows', 'Hit 5: stuns turn into knockback', 'Next hit: FINISHER (breaks the combo)'];

/** S = game state, fighters = all fighters, me = the local fighter */
export function tickExtras(S, fighters, me) {
    ensure();
    const playing = S.gameState === 'playing';
    box.style.display = playing ? 'block' : 'none';
    impactFrame(S, playing);
    if (!playing) return;

    combo.innerHTML = '';
    const rw = document.getElementById('cbgReward'); if (rw && rw.innerHTML) rw.innerHTML = '';

    // ---- training readout
    const train = S.gameMode === 'training';
    readout.style.display = train ? 'block' : 'none';
    if (!train) return;
    const h = S.lastHit;
    if (h && h.def && h.age < 8) { h.stunMax = Math.max(h.stunMax, h.def.hitstun || 0, h.def.clashStunTimer || 0); h.age++; if (h.age === 8 && h.stat) h.stat.stun += h.stunMax; }
    const rows = [];
    if (h) rows.push(`<div style="font-weight:800;color:#fff">Last hit: ${h.char} ${h.move}</div><div>damage <b>${h.dmg.toFixed(1)}</b> · stun <b>${h.stunMax}f</b> (${(h.stunMax / 60).toFixed(2)} s) · combo <b>${h.combo}</b></div>`);
    else rows.push('<div style="color:#94a3b8">Hit the dummy to see numbers</div>');
    const ms = S.moveStats ? Object.entries(S.moveStats).slice(-6) : [];
    if (ms.length) rows.push('<div style="margin-top:4px;color:#94a3b8">per move (avg damage × hits)</div>' + ms.map(([k, v]) => `<div>${k}: <b>${(v.dmg / v.n).toFixed(1)}</b> × ${v.n} · stun ${(v.stun / v.n / 60).toFixed(2)} s</div>`).join(''));
    const r = rows.join('');
    if (r !== last.r) { last.r = r; readout.innerHTML = r; }
}

/** a short message at the bottom centre (e.g. the "why did I die" recap) */
export function notify(text, ms = 3600) {
    ensure();
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:absolute;left:50%;bottom:18%;transform:translateX(-50%);max-width:88vw;padding:9px 16px;border-radius:12px;background:rgba(15,23,42,.88);border:1px solid rgba(248,113,113,.55);color:#fecaca;font:700 14px/1.3 system-ui,sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s;';
    box.style.display = 'block';
    box.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
}

/** coins / challenges / ladder summary on the game-over screen */
export function showReward(r) {
    const modal = document.getElementById('gameOverModal');
    if (!modal) return;
    let el = document.getElementById('cbgReward');
    if (!el) { el = document.createElement('div'); el.id = 'cbgReward'; el.style.cssText = 'margin:6px 0 14px;text-align:center;color:#e2e8f0;font:600 15px/1.5 system-ui,sans-serif;max-width:92vw'; modal.insertBefore(el, modal.children[1] || null); }
    const rank = r.rank ? `<div style="font-weight:800;color:${r.rank.tier.color}">${r.rank.tier.name} · ${r.rank.after} ${r.rank.after >= r.rank.before ? '▲ +' + (r.rank.after - r.rank.before) : '▼ ' + (r.rank.after - r.rank.before)}${r.rank.up ? ' — PROMOTED!' : r.rank.down ? ' — demoted' : ''}</div>` : '';
    const ch = r.done.map(c => `<div style="color:#86efac">✔ Daily: ${c.name} (+${c.coins})</div>`).join('');
    el.innerHTML = `${rank}<div style="color:#fde047;font-weight:800">+${r.gain} 🪙 <span style="opacity:.7;font-weight:600">(${r.coins} total)</span></div>${ch}`;
}

/** Final blow = a manga-style impact frame: the whole screen flickers white / inverted black-and-white (high contrast), speed lines burst from the centre,
 *  then it settles into stark black-and-white and fades back to colour. Live (for the two involved) and in replays (wherever the match had one). */
function impactFrame(S, playing) {
    if (!kcCanvas) kcCanvas = document.querySelector('canvas');
    let on = false, e = 0;
    if (S.replay) { on = S.kcImpT > 0; e = 1.2 - S.kcImpT; }
    else if (playing && S.kcPause > 0 && S.kcFull) { on = true; e = (S.kcDur || 1.2) - S.kcT; }
    kc.style.display = on ? 'block' : 'none';
    if (!on) { if (kcCanvas && kcCanvas.style.filter) kcCanvas.style.filter = ''; return; }
    let flash = 0, filt = '';
    if (e < 0.09) flash = 1 - Math.max(0, e - 0.06) / 0.03;                               // flash-bang: instant blinding white, then straight into stark black and white
    else if (e < 0.14) filt = 'grayscale(1) contrast(5) invert(1)';
    else if (e < 0.22) filt = 'grayscale(1) contrast(5)';
    else if (e < 0.29) filt = 'grayscale(1) contrast(5) invert(1)';
    else if (e < 0.95) filt = 'grayscale(1) contrast(' + (3.2 - 1.6 * Math.min(1, (e - 0.29) / 0.66)).toFixed(2) + ')';
    else filt = 'grayscale(' + Math.max(0, 1 - (e - 0.95) / 0.25).toFixed(2) + ')';
    if (kcCanvas) kcCanvas.style.filter = filt;
    kcFlash.style.opacity = flash;
    const lines = e >= 0.06 && e < 0.9;
    kcLines.style.opacity = lines ? (e < 0.6 ? 0.85 : 0.85 * (0.9 - e) / 0.3) : 0;
    kcLines.style.transform = 'rotate(' + ((Math.floor(e * 24) % 2) * 3) + 'deg) scale(' + (1 + e * 0.12) + ')';      // lines jitter like hand-drawn frames
    kcTxt.style.opacity = e > 0.14 && e < 1.0 ? 1 : 0;
}
