/** On-screen extras: the combo counter (with a warning before the finisher) and the training-mode numbers readout. Pure DOM, fed by gameCore each HUD tick. */
let box = null, combo = null, readout = null, last = { c: '', r: '' };

function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'cbgExtras';
    box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;font-family:inherit;';
    combo = document.createElement('div');
    combo.style.cssText = 'position:absolute;right:max(14px,env(safe-area-inset-right));top:34%;text-align:right;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.7);transition:transform .08s;';
    readout = document.createElement('div');
    readout.style.cssText = 'position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(96px,env(safe-area-inset-bottom));min-width:210px;max-width:290px;padding:8px 10px;border-radius:10px;background:rgba(2,6,23,.72);border:1px solid rgba(148,163,184,.35);color:#e2e8f0;font-size:11px;line-height:1.45;font-variant-numeric:tabular-nums;display:none;';
    box.append(combo, readout);
    document.body.appendChild(box);
}

const NEXT = ['', '', '', 'Hit 4: knockback grows', 'Hit 5: stuns turn into knockback', 'Next hit: FINISHER (breaks the combo)'];

/** S = game state, fighters = all fighters, me = the local fighter */
export function tickExtras(S, fighters, me) {
    ensure();
    const playing = S.gameState === 'playing';
    box.style.display = playing ? 'block' : 'none';
    if (!playing) return;

    // ---- combo counter: the longest running combo on anyone (yours in orange, one on you in red)
    let best = null;
    for (const f of fighters) if (f.active && f.comboT > 0 && f.comboN >= 2 && (!best || f.comboN > best.comboN)) best = f;
    let c = '';
    if (best) {
        const n = best.comboN, mine = best.lastHitBy === me, onMe = best === me;
        const col = onMe ? '#fca5a5' : mine ? '#fdba74' : '#e2e8f0';
        const warn = n >= 5 ? '#f87171' : n >= 3 ? '#fde047' : '#94a3b8';
        const left = Math.round(best.comboT / 60 * 10) / 10;
        c = `<div style="font-size:${Math.min(64, 30 + n * 5)}px;font-weight:900;line-height:1;color:${col}">${n}<span style="font-size:15px;font-weight:800;margin-left:4px">HITS</span></div>` +
            `<div style="font-size:12px;font-weight:700;color:${warn};margin-top:2px">${NEXT[Math.min(5, n)] || NEXT[5]}</div>` +
            `<div style="height:4px;width:110px;margin:5px 0 0 auto;border-radius:3px;background:rgba(148,163,184,.25)"><div style="height:100%;width:${Math.round(best.comboT / 90 * 100)}%;border-radius:3px;background:${col}"></div></div>`;
        void left;
    }
    if (c !== last.c) { last.c = c; combo.innerHTML = c; }

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
