import { getReduceFlash, getHitboxes, setHitboxes } from './gfx.js';
/** On-screen extras: the combo counter (with a warning before the finisher) and the training-mode numbers readout. Pure DOM, fed by gameCore each HUD tick. */
let tools = null, S_ = null;
let kcDots = null, box = null, combo = null, readout = null, kc = null, kcLines = null, kcFlash = null, kcTxt = null, kcCanvas = null, last = { c: '', r: '' };

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
    kcLines.style.cssText = 'position:absolute;inset:-25%;background:' +                          // hair-thin white wedges: a point toward the middle, widening a hair at the screen edge (not straight bars)
        'repeating-conic-gradient(from 1deg at 50% 50%,#fff 0 .09deg,transparent .09deg 1.7deg),' +
        'repeating-conic-gradient(from 0.4deg at 50% 50%,#fff 0 .16deg,transparent .16deg 2.9deg),' +
        'repeating-conic-gradient(from 2.3deg at 50% 50%,#fff 0 .05deg,transparent .05deg 1.15deg),' +
        'repeating-conic-gradient(from 5deg at 50% 50%,#fff 0 .24deg,transparent .24deg 6.3deg);' +
        '-webkit-mask-image:radial-gradient(circle at 50% 50%,transparent 30%,#000 66%);mask-image:radial-gradient(circle at 50% 50%,transparent 30%,#000 66%);';
    kcFlash = document.createElement('div');
    kcFlash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;';
    const kt = document.createElement('div'); kt.textContent = 'FINAL BLOW'; kt.style.cssText = 'position:absolute;left:0;right:0;top:14%;text-align:center;font:900 clamp(30px,7vw,72px) system-ui;letter-spacing:.14em;color:#fff;mix-blend-mode:difference;transform:skewX(-8deg);';
    const dots = document.createElement('div');                                    // manga screen-tone: the lit parts look hand-shaded and flat, 2D
    dots.style.cssText = 'position:absolute;inset:0;background-image:radial-gradient(circle,rgba(150,150,150,.8) 30%,transparent 36%);background-size:7px 7px;-webkit-mask-image:radial-gradient(ellipse at 50% 50%,transparent 38%,#000 92%);mask-image:radial-gradient(ellipse at 50% 50%,transparent 38%,#000 92%);opacity:0;';
    kc.append(dots, kcLines, kcFlash, kt); kcTxt = kt; kcDots = dots;                                                // nothing but black, the white streak and the air rings: no tone dots, no speed lines
    tools = document.createElement('div');                                           // training tools: reset, hitboxes, pause / frame step, dummy %
    tools.style.cssText = 'position:absolute;left:50%;top:max(58px,env(safe-area-inset-top));transform:translateX(-50%);display:none;gap:6px;align-items:center;padding:5px 8px;border-radius:10px;background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.35);pointer-events:auto;font:600 12px system-ui,sans-serif;color:#e2e8f0;white-space:nowrap;';
    const mk = (t, fn, id) => { const b = document.createElement('button'); b.textContent = t; if (id) b.id = id; b.style.cssText = 'font:inherit;color:#e2e8f0;background:rgba(51,65,85,.9);border:1px solid rgba(148,163,184,.4);border-radius:7px;padding:4px 8px;cursor:pointer;'; b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); b.blur(); }); b.addEventListener('pointerdown', (e) => e.stopPropagation()); tools.appendChild(b); return b; };
    mk('Reset', () => S_.trainReset && S_.trainReset());
    mk('Hitboxes: ' + (getHitboxes() ? 'on' : 'off'), (b) => { setHitboxes(!getHitboxes()); b.textContent = 'Hitboxes: ' + (getHitboxes() ? 'on' : 'off'); });
    mk('Pause', (b) => { window.__luminaryPaused = !window.__luminaryPaused; b.textContent = window.__luminaryPaused ? 'Resume' : 'Pause'; });
    mk('Step', () => { window.__luminaryPaused = true; const pb = tools.children[2]; if (pb) pb.textContent = 'Resume'; S_.stepOnce && S_.stepOnce(); });
    const lab = document.createElement('span'); lab.textContent = 'Dummy %'; tools.appendChild(lab);
    const inp = document.createElement('input'); inp.type = 'number'; inp.min = 0; inp.max = 999; inp.value = 0; inp.style.cssText = 'width:54px;font:inherit;border-radius:6px;border:1px solid rgba(148,163,184,.4);background:#0f172a;color:#e2e8f0;padding:2px 4px;';
    inp.addEventListener('change', () => S_.trainDmg && S_.trainDmg(inp.value)); for (const ev of ['keydown', 'keyup', 'pointerdown']) inp.addEventListener(ev, (e) => e.stopPropagation());
    tools.appendChild(inp);
    box.append(combo, readout, tools);
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
    S_ = S; if (tools) tools.style.display = train && S.trainTools ? 'flex' : 'none';
    readout.style.display = train ? 'block' : 'none';
    if (!train) return;
    const h = S.lastHit;
    if (h && h.def && h.age < 8) { if (h.age >= 1 && h.age <= 3) { h.spd = Math.max(h.spd || 0, Math.hypot(h.def.vx, h.def.vy)); if (h.age === 2 && S.willKO) { try { h.ko = !!S.willKO(h.def); } catch (e) { h.ko = false; } } } h.stunMax = Math.max(h.stunMax, h.def.hitstun || 0, h.def.clashStunTimer || 0); h.age++; if (h.age === 8 && h.stat) h.stat.stun += h.stunMax; }
    const rows = [];
    if (h) rows.push(`<div style="font-weight:800;color:#fff">Last hit: ${h.char} ${h.move}</div><div>damage <b>${h.dmg.toFixed(1)}</b> · stun <b>${h.stunMax}f</b> (${(h.stunMax / 60).toFixed(2)} s) · knockback speed <b>${(h.spd || 0).toFixed(1)}</b> · <b style="color:${h.ko ? '#f87171' : '#4ade80'}">${h.ko ? 'would KO' : 'no KO'}</b> · combo <b>${h.combo}</b></div>`);
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
    else if (playing && S.kcVis > 0 && S.kcFull) { on = true; e = (S.kcDur || 1.2) - S.kcT; }
    kc.style.display = on ? 'block' : 'none';
    if (!on) { if (kcCanvas && kcCanvas.style.filter) kcCanvas.style.filter = ''; return; }
    let flash = 0, filt = '';
    if (getReduceFlash()) {                                                                // reduced flashing: no white flash-bang, no inverted flicker, a short smooth fade into black and white
        const k = Math.min(1, e / 0.3);
        filt = e < 0.95 ? 'grayscale(' + k.toFixed(2) + ') contrast(' + (1 + 1.6 * k * (1 - Math.min(1, Math.max(0, (e - 0.29) / 0.66)))).toFixed(2) + ') brightness(' + (1 - 0.25 * k).toFixed(2) + ')' : 'grayscale(' + Math.max(0, 1 - (e - 0.95) / 0.25).toFixed(2) + ')';
    }
    else if (e < 0.09) flash = 1 - Math.max(0, e - 0.06) / 0.03;                               // flash-bang: instant blinding white, then straight into stark black and white
    else if (e < 0.14) filt = 'grayscale(1) contrast(5) invert(1)';
    else if (e < 0.22) filt = 'grayscale(1) contrast(5)';
    else if (e < 0.29) filt = 'grayscale(1) contrast(5) invert(1)';
    else if (e < 0.95) filt = 'grayscale(1) contrast(' + (4.2 - 1.4 * Math.min(1, (e - 0.29) / 0.66)).toFixed(2) + ') brightness(0.9)';
    else filt = 'grayscale(' + Math.max(0, 1 - (e - 0.95) / 0.25).toFixed(2) + ')';
    if (kcCanvas) kcCanvas.style.filter = filt;
    kcFlash.style.opacity = flash;
    const lines = e >= 0.03 && e < 1.0;
    if (kcDots) kcDots.style.opacity = getReduceFlash() ? 0.3 : 0.75;
    kcLines.style.opacity = lines ? 0.95 * (getReduceFlash() ? 0.4 : 1) * (e < 0.7 ? 1 : Math.max(0, (1.0 - e) / 0.3)) : 0;
    kcLines.style.transform = getReduceFlash() ? 'scale(' + (1 + e * 0.12) + ')' : 'rotate(' + ((Math.floor(e * 24) % 2) * 3) + 'deg) scale(' + (1 + e * 0.12) + ')';      // lines jitter like hand-drawn frames
    kcTxt.style.opacity = 0;                                                                // no "FINAL BLOW" text
}
