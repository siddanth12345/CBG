// BUILD_STAMP 20261103ac — Ember throw knockback normalized + 1.3s air freeze
// ============================================================================
//  COOL BATTLE GAME - game core
//  All gameplay runs in the original 2D world space: x -> right, y -> down,
//  3800 x 2100. The 3D renderer only *reads* this state; the `fx(...)` hooks and
//  presentation fields (attackKind, specialKind, ...) never feed back in.
// ============================================================================
import { tickExtras, notify, showReward } from './hudExtras.js';
import { perksFor, reportMatch, perkStat, BOT_NAMES, MOD_NAMES } from './meta.js';
import { AI_PRIOR } from './aiPrior.js';
import { charOf, getMyChar, DEFAULT_CHAR } from './characters.js';
import { displayName } from './account.js';
import { SoundEngine } from './audio.js';
import { isDown, neutralForced } from './controls.js';
import { ITEM_TYPES } from './items.js';
import { SP, spec, SLOT_OF, lerpR, STYLE_OF } from './specials.js';

export const S = { fxClear: 0, screenShake: 0, gameMode: 'hard', gameState: 'start', online: null, train: null };   // online: null | 'host' | 'guest'; train: training menu prefs
export const audio = new SoundEngine();
/** everything the host has produced since the last network snapshot (effects, sounds, particles) */
export const outbox = [];
export const NETHOOK = { send: null, rtt: null, fast: null };
// online host: forward every sound the simulation plays so the guest hears it too
for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) {
    if (!/^play/.test(name) || typeof audio[name] !== 'function') continue;
    const orig = audio[name].bind(audio);
    audio[name] = (...args) => { if (S.online === 'host') outbox.push({ k: 'a', m: name, a: args }); return orig(...args); };
}
export const koBeams = [];
export const shockwaves = [];
export const fxEvents = [];
export const orbs = [];                    // CBG Core projectiles
export const whirlpools = [];              // Tide Whirlpool zones: { x, y, r, life, owner, pull }
let orbSerial = 0, poolSerial = 0;
const zapTrails = [];               // Volt's Thunder Dash: lingering zigzag lightning that stuns and scrambles the controls of anyone who touches it (host only)
const pillars = [];                  // Ember's twin fire pillars (host only)
const SWORD_SCALE = 1.5, SWORD_OFF = 105;     // Bulwark's falling swords are 1.5x as big
const drops = [];                    // falling swords / rocks from Bulwark's and Terra's side specials (host only; guests see them through fx events)
const ROLL_CHARGE = 72;              // Ember's rolling charge: 1.2 s to full
const ROLL_AUTO = 30;                // hold full charge 0.5 s → auto release
const recBuf = { fx: [], p: [], snd: [] };
for (const n of ['playF', 'playJump', 'playDash', 'playHit', 'playGrab', 'playThrow', 'playShield', 'playHoming', 'playSpear', 'playBurst', 'playZap', 'playStomp', 'playParry', 'playStab', 'playKO']) {
    const orig = audio[n] && audio[n].bind(audio); if (!orig) continue;
    audio[n] = (...args) => { if (S.gameState === 'playing' && !S.replay && recBuf.snd.length < 40) recBuf.snd.push([n, ...args]); return orig(...args); };     // remembered for the replay
}
function fx(type, x, y, a = 0, b = 0, c = 0) { fxEvents.push({ type, x, y, a, b, c }); if (S.gameState === 'playing' && !S.replay && recBuf.fx.length < 80) recBuf.fx.push([type, x, y, a, b, c]); if (S.online === 'host') outbox.push({ k: 'f', e: [type, x, y, a, b, c] }); }

const WORLD = {
    width: 3800,
    height: 2100,
    gravity: 0.5,
    terminalVelocity: 16,
    friction: 0.86,
    airFriction: 0.985
};

/** After a fighter has been moved by force (grab carry, whirlpool pull, Phoenix drag ...): never leave them inside the stage block.
 *  Decide which face to stay on from where they were BEFORE the move, so they are never ejected through the floor or across the stage. */
function pushOutOfStage(f, ox, oy) {
    const L = STAGE.x, R = STAGE.x + STAGE.width, T = STAGE.y, B = STAGE.y + STAGE.height, hw = f.width / 2, hh = f.height / 2;
    if (f.x + hw <= L || f.x - hw >= R || f.y + hh <= T || f.y - hh >= B) return;
    if (STAGE.segs && !STAGE.segs.some(q => f.x + hw > q.l && f.x - hw < q.r)) return;          // inside a gap of the split stage
    if (oy + hh <= T + 1) f.y = T - hh;
    else if (oy - hh >= B - 1) f.y = B + hh;
    else if (ox + hw <= L + 1) f.x = L - hw;
    else if (ox - hw >= R - 1) f.x = R + hw;
    else {                                                   // was already inside: leave by the nearest face
        const d = [f.y + hh - T, B - (f.y - hh), f.x + hw - L, R - (f.x - hw)], m = Math.min(...d);
        if (m === d[0]) f.y = T - hh; else if (m === d[1]) f.y = B + hh; else if (m === d[2]) f.x = L - hw; else f.x = R + hw;
    }
}
/** teleports stop at the first solid face of the stage instead of passing through it: sweep the fighter's box along the path, return the last free point */
function clipTeleport(f, x0, y0, x1, y1) {
    const hw = f.width / 2, hh = f.height / 2, L = STAGE.x - hw, R = STAGE.x + STAGE.width + hw, T = STAGE.y - hh, B = STAGE.y + STAGE.height + hh;
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[x0, dx, L, R], [y0, dy, T, B]]) {
        if (Math.abs(d) < 1e-9) { if (p <= lo + 0.5 || p >= hi - 0.5) return { x: x1, y: y1 }; continue; }       // parallel and outside (or sliding along a face): free
        let a = (lo - p) / d, b = (hi - p) / d; if (a > b) { const q = a; a = b; b = q; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 >= t1 || t0 <= 0 || t0 >= 1) return t0 <= 0 && t0 < t1 ? { x: x0, y: y0 } : { x: x1, y: y1 };            // misses the stage (or already inside: leave it to the push-out)
    const t = Math.max(0, t0 - 0.002);
    return { x: x0 + dx * t, y: y0 + dy * t };
}
const STAGE = {
    x: 1140,
    y: 1250,
    width: 1520,
    height: 90,
    color: '#1e293b',
    topColor: '#38bdf8'
};

const BLAST_ZONES = {
    left: -380,
    right: 4180,
    top: -283,
    bottom: 2423
};
STAGE.platforms = [];                       // soft (one-way) platforms: { x, y, w } with x = left edge, y = top surface
STAGE.segs = null;                          // Horizon hazard: while the stage is split, its solid pieces [{l, r, off}] (null = one piece)
const SPL = { t: 0, cuts: [], base: null, off: [] };       // the Horizon split: clock, cut positions (0..1 of the stage), original stage x / width, current piece offsets
const onStageX = (px, pad = 0) => STAGE.segs ? STAGE.segs.some(q => px > q.l - pad && px < q.r + pad) : (px > STAGE.x - pad && px < STAGE.x + STAGE.width + pad);

/** the normal 1v1 / bot arena, and the custom-match arena: stage + kill zone 2.5x bigger, with Battlefield-style platforms */
const ARENAS = {
    normal: {
        world: { width: 3800, height: 2100 },
        stage: { x: 1140, y: 1250, width: 1520, height: 90 },
        bz: { left: -380, right: 4180, top: -283, bottom: 2423 },       // kill zone 10% taller than before
        platforms: () => [],
    },
    lobby: {
        // 0.7x the old big arena horizontally (stage, kill zone and platforms); same height
        world: { width: 6650, height: 5250 },
        stage: { x: 1995, y: 3125, width: 2660, height: 225 },
        bz: { left: -665, right: 7315, top: -400, bottom: 5750 },
        // Big Battlefield: two side platforms and one high platform in the middle
        platforms: (st) => {
            const w = Math.round(st.width * 0.22), cx = st.x + st.width / 2;
            return [
                { x: Math.round(cx - st.width * 0.25 - w / 2), y: st.y - 200, w },
                { x: Math.round(cx + st.width * 0.25 - w / 2), y: st.y - 200, w },
                { x: Math.round(cx - w / 2), y: st.y - 390, w },
            ];
        },
    },
};
export function setArena(kind, theme = 'frontier') {
    SPL.base = null; SPL.cuts = []; SPL.t = 0; SPL.off = []; STAGE.segs = null;
    const a = ARENAS[kind] || ARENAS.normal;
    Object.assign(WORLD, a.world);
    Object.assign(STAGE, a.stage);
    STAGE.platforms = a.platforms(STAGE);
    Object.assign(BLAST_ZONES, a.bz);
    S.arena = kind === 'lobby' ? 'lobby' : 'normal';
    S.theme = theme === 'horizon' ? 'horizon' : 'frontier';          // look only: Horizon has the exact same collision as Frontier
    S.arenaVersion = (S.arenaVersion || 0) + 1;
}
/** map ids: frontier (small), big (big Frontier), horizon (small), bighorizon, and the random picks rand / randS / randB */
export const MAP_IDS = ['frontier', 'big', 'horizon', 'bighorizon'];
export const HAZ_IDS = ['frontierH', 'bigH', 'horizonH', 'bighorizonH'];      // old ids of the hazard maps: hazards are an option now, these just load the plain map
export const MAP_NAMES = { frontier: '€Frontier', big: '¥Frontier', horizon: '€Horizon', bighorizon: '¥Horizon', frontierH: '(€)Frontier', bigH: '(¥)Frontier', horizonH: '(€)Horizon', bighorizonH: '(¥)Horizon', rand: 'Random (any)', randS: 'Random €', randB: 'Random ¥' };
export const cleanMap = (m) => HAZ_IDS.includes(m) ? m.replace(/H$/, '') : (MAP_IDS.includes(m) || m === 'rand' || m === 'randS' || m === 'randB') ? m : 'big';
export function resolveMap(m) {
    m = cleanMap(m);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (m === 'rand') return pick(MAP_IDS);
    if (m === 'randS') return pick(['frontier', 'horizon']);
    if (m === 'randB') return pick(['big', 'bighorizon']);
    return m;
}
export function setArenaByMap(m) {
    m = resolveMap(m);
    const base = m.replace(/H$/, '');
    setArena(base === 'frontier' || base === 'horizon' ? 'normal' : 'lobby', base === 'horizon' || base === 'bighorizon' ? 'horizon' : 'frontier');
    resetHazards();
    return m;
}
/** where the two duel fighters start on the current arena (the big arenas are far from the small one's coordinates) */
function placeDuel(move) {
    const big = S.arena === 'lobby';
    for (const [f, k] of [[p1, 0.4], [p2, 0.6]]) {
        if (big) { f.startX = STAGE.x + STAGE.width * k; f.startY = STAGE.y - 120; } else { f.startX = f.home.x; f.startY = f.home.y; }
        if (move) { f.x = f.startX; f.y = f.startY; f.vx = f.vy = 0; }
    }
}


// ----------------------------------------------------------------- tuning (frames @ 60 Hz)
export const ATTACK_FRAMES = 18;
const LOCK = 36;              // 0.6 s: after ANY move you can't start another one (you can still walk)
const lk = (f, n) => (f.char === 'bulwark' || f.char === 'terra') ? Math.round(n * 0.7) : n;   // Bulwark / Terra: 0.7x the lock after a move
const JUMP_OK = 24;           // ...but you may jump once 0.2 s of that lock has passed (36 - 12)
const MELEE_CHARGE_MAX = 102; // 1.7 s to fully charge a held side / up / down melee
const MELEE_CHARGE_BONUS = 0.3;   // fully charged = +30% damage and knockback
const GRAB_KB_SCALE = 0.7;    // a grab throw is worth 0.7x a melee hit (percent based)
const STUN = 30;              // 0.5 s stun
const FREEZE = 18;            // 0.3 s "getting up" after a headbutt
const SUPLEX_DETECT = 0.45;    // suplex homing radius, as a fraction of the stage length
const SUPLEX_SPEED = 20;
const SUPLEX_RISE = 20;       // frames spent rising with the opponent before the slam
const TOP_LIMIT = 80;         // reaching the top of the map cancels a suplex
export const ROLL_FRAMES = 20;       // 3x faster than the old 60-frame roll (same distance)
const ROLL_DISTANCE = 368;
const ROLL_COOLDOWN = 120;    // 2 s
const HANG_MAX = 180;         // 3 s on a ledge -> kicked off...
const TIMEOUT_BAN = 240;      // ...and can't re-grab a ledge for 4 s
const KICK_BAN = 180;         // kicked by someone taking your ledge -> 3 s no ledge
export const AIR_F_MAX = 2;   // F moves usable in the air before you must touch the ground
/** training-menu overrides (only while gameMode === 'training') */
export const trainLock = () => (S.gameMode === 'training' && S.train && S.train.lock != null) ? S.train.lock : LOCK;
export const trainStun = () => (S.gameMode === 'training' && S.train && S.train.stun != null) ? S.train.stun : STUN;
export const airFOf = (f) => trainAirF() + (f && f.char === 'volt' ? 1 : 0);      // Volt gets 3 air F moves instead of 2
export const trainAirF = () => (S.gameMode === 'training' && S.train && S.train.airF != null) ? S.train.airF : AIR_F_MAX;
export const trainWalk = () => (S.gameMode === 'training' && S.train && S.train.walk != null) ? S.train.walk : 1;
export const trainJumps = (f) => {
    if (S.gameMode === 'training' && S.train && S.train.jumps != null) return S.train.jumps;
    return charOf(f.char).jumps + (f.balloon ? 3 : 0);
};
export const DEFAULT_TRAIN = {
    stage: 'normal', // 'normal' | 'lobby' (big Frontier)
    stun: 30, lock: 36, jumps: null, airF: 2, walk: 1,
    char: null, botType: 'static', botChar: null, hazards: false,
};
export function ensureTrain() {
    if (!S.train) S.train = { ...DEFAULT_TRAIN, char: null, botChar: null };
    return S.train;
}

const CD = { CORE: 90, BLINK: 60, SPIRAL: 120, SUPLEX: 0, HEADBUTT: 90 };   // no aftermath cooldown on the suplex
const F_MOVES = new Set(['BLINK', 'SPIRAL', 'HEADBUTT']);   // (the ground-down Suplex is a grab, so it counts as GRAB)
const SPIRAL_JUMP_COST = 0;   // Rising Spiral takes no jumps at all
const HOLD_TO_CORE = 30;      // F held < 0.5 s -> directional variant, >= 0.5 s -> CBG Core charge
const CHARGE_MAX = 63;        // full charge after 63 frames (0.7x the old 1.5 s)

let dramaticZoom = {
    active: false,
    targetX: 0,
    targetY: 0,
    currentZoom: 1,
    targetZoom: 3.5,
    progress: 0
};

/** a press that arrived while the fighter was still locked is kept for a few frames so it fires the instant it can (responsiveness) */
export const inputBuf = { a: null, t: 0, wx: 0, wy: 0, dir: 'NEUTRAL', hold: false };
export function bufferInput(a, extra = {}) { Object.assign(inputBuf, { a, t: 9, wx: 0, wy: 0, dir: 'NEUTRAL', hold: false }, extra); }
function flushBuffered() {
    const b = inputBuf;
    if (!b.a) return;
    if (--b.t < 0 || S.online === 'guest') { b.a = null; return; }
    let ok = false;
    if (b.a === 'attack') ok = p1.attack(b.dir, b.hold);
    else if (b.a === 'grab') ok = p1.executeGrabDash(b.wx, b.wy);
    else if (b.a === 'jump') ok = p1.jump();
    if (ok) b.a = null;
}

const keys = {};
const mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    worldX: WORLD.width / 2,
    worldY: WORLD.height / 2,
    originX: null,      // screen position the aim matrix is measured from (the player); set by the camera
    originY: null,
    dx: 0,
    dy: 0,
    dist: 0,
    direction: 'NEUTRAL'
};

function updateAimMatrix() {
    if (mouse.touchMode) return;                       // on-screen controls set the aim directly
    const centerX = mouse.originX ?? window.innerWidth / 2;
    const centerY = mouse.originY ?? window.innerHeight / 2;

    mouse.dx = mouse.x - centerX;
    mouse.dy = mouse.y - centerY;
    mouse.dist = Math.sqrt(mouse.dx * mouse.dx + mouse.dy * mouse.dy);

    const DEADZONE = 45;

    const forcedNeutral = neutralForced();          // hold the neutral key: the matrix reads NEUTRAL
    if (forcedNeutral || mouse.dist <= DEADZONE) {
        mouse.direction = 'NEUTRAL';
    } else {
        const absDx = Math.abs(mouse.dx);
        const absDy = Math.abs(mouse.dy);

        if (absDx > absDy) {
            mouse.direction = mouse.dx < 0 ? 'SIDE_LEFT' : 'SIDE_RIGHT';
        } else {
            mouse.direction = mouse.dy < 0 ? 'UP' : 'DOWN';
        }
    }

    const arrowElem = document.getElementById('aimMatrixArrow');
    const labelElem = document.getElementById('aimMatrixLabel');
    const vectorElem = document.getElementById('aimVectorText');

    vectorElem.textContent = `dx: ${Math.round(mouse.dx)} | dy: ${Math.round(mouse.dy)}`;

    // Per-character F special names (J swings are shared)
    const cid = (typeof p1 !== 'undefined' && p1 && p1.char) ? p1.char : getMyChar();
    const spN = spec(cid, 'N'), spS = spec(cid, 'S'), spU = spec(cid, 'U');
    const spDG = spec(cid, 'DG'), spDA = spec(cid, 'DA');
    const nName = spN.name || 'Core';
    const sName = spS.name || 'Side Special';
    const uName = spU.name || 'Up Special';
    const dName = (spDG.name || 'Down') + ' / ' + (spDA.name || 'Air Down');

    switch (mouse.direction) {
        case 'UP':
            arrowElem.textContent = '⬆';
            labelElem.textContent = `UP  •  J: Up Slash  •  F: ${uName}`;
            break;
        case 'DOWN':
            arrowElem.textContent = '⬇';
            labelElem.textContent = `DOWN  •  J: Down Strike  •  F: ${dName}`;
            break;
        case 'SIDE_LEFT':
            arrowElem.textContent = '⬅';
            labelElem.textContent = `SIDE (LEFT)  •  J: Side Slash  •  F: ${sName}`;
            break;
        case 'SIDE_RIGHT':
            arrowElem.textContent = '➡';
            labelElem.textContent = `SIDE (RIGHT)  •  J: Side Slash  •  F: ${sName}`;
            break;
        default:
            arrowElem.textContent = '⏺';
            labelElem.textContent = (forcedNeutral ? 'NEUTRAL (held)' : 'NEUTRAL') + `  •  J: Jab  •  hold F: ${nName}`;
            break;
    }
}

// ----------------------------------------------------------------- swing profiles
// J attacks (and the Blink slash) are *swings*: the hitbox is rebuilt every frame from the
// fighter's current position and sweeps along the animation, only inside its active window.
const rad = (d) => d * Math.PI / 180;
const arc = (r, a0, a1) => (k, f) => {
    const a = rad(a0 + (a1 - a0) * k);
    return { x: f * Math.cos(a) * r, y: -Math.sin(a) * r };
};
const SWING = {
    // neutral melee: a sword spin around the body (both sides, air and ground) that only launches UP
    JAB:  { type: 'J', a: 5, b: 15, w: 150, h: 74, damage: 7, bkb: 13, kbg: 1.05, multi: true, path: () => ({ x: 0, y: -4 }),
            angle: () => -Math.PI / 2 },
    // Luminent / Umbra / Volt neutral melee: half the knockback, thrown away from the attacker (toward where the foe is)
    JABR: { type: 'J', a: 5, b: 15, w: 150, h: 74, damage: 7, bkb: 6.5, kbg: 0.525, multi: true, radial: true, path: () => ({ x: 0, y: -4 }),
            angle: () => -Math.PI / 2 },
    UP:   { type: 'J', a: 4, b: 11, w: 75, h: 55, damage: 8,  bkb: 12, kbg: 1.25, chargeable: true, path: arc(56, 10, 150),
            angle: () => -Math.PI / 2 },
    DOWN: { type: 'J', a: 4, b: 11, w: 75, h: 55, damage: 9,  bkb: 13, kbg: 1.25, chargeable: true, path: arc(54, 25, -110),
            angle: (f, grounded) => grounded ? -Math.PI / 3 : Math.PI / 2 },
    SIDE_LEFT:  { type: 'J', a: 5, b: 12, w: 70, h: 62, damage: 10, bkb: 12, kbg: 1.25, chargeable: true, path: arc(64, 70, -20),
            angle: () => Math.PI + Math.PI / 6 },
    SIDE_RIGHT: { type: 'J', a: 5, b: 12, w: 70, h: 62, damage: 10, bkb: 12, kbg: 1.25, chargeable: true, path: arc(64, 70, -20),
            angle: () => -Math.PI / 6 },
    BLINK: { type: 'BLINK', a: 1, b: 9, w: 110, h: 72, damage: 11, bkb: 11, kbg: 1.2, path: (k, f) => ({ x: f * (30 + 70 * k), y: 0 }),
            angle: (f) => f === 1 ? -Math.PI / 5 : Math.PI + Math.PI / 5 },
};

// character-specific side specials (Thunder Dash, Shadow Step, and every travelling dash) are swings with their own hit data
for (const id in SP) {
    const sp = SP[id].S;
    if (!sp || (sp.kind !== 'tp' && sp.kind !== 'dash') || sp.swing === 'BLINK') continue;
    const ang = sp.ang !== undefined ? sp.ang : Math.PI / 5;
    SWING['SP_' + id + '_S'] = {
        type: 'BLINK', a: 1, b: sp.kind === 'dash' ? sp.frames : 9, w: sp.w || 110, h: sp.h || 72, damage: sp.dmg, bkb: sp.bkb, kbg: sp.kbg, multi: !!sp.multi, stun: sp.stun || 0, flow: sp.flow ? sp.dist / sp.frames : 0,
        path: sp.kind === 'dash' ? (k, f) => ({ x: f * (sp.w * 0.3), y: 0 }) : (k, f) => ({ x: f * (30 + 70 * k), y: 0 }),
        angle: (f) => f === 1 ? -ang : Math.PI + ang,
    };
}

// ----------------------------------------------------------------- counter matrix
//  Move types: J, GRAB (also the Suplex dash), CORE, BLINK, SPIRAL, HEADBUTT  (+ the SHIELD state)
//   * SHIELD   counters everything except GRAB
//   * GRAB     is countered by every other active move (except HEADBUTT, which grab beats) - and beats SHIELD
//   * HEADBUTT counters everything except GRAB and SHIELD
//   * J        counters everything except SHIELD
//   * CORE     counters every F move and GRAB (not J)
function counters(defType, atkType) {
    if (!defType) return false;
    if (atkType === 'GRAB') return defType !== 'SHIELD' && defType !== 'HEADBUTT' && defType !== 'GRAB';
    switch (defType) {
        case 'SHIELD': case 'J': case 'HEADBUTT': return true;
        case 'CORE': return F_MOVES.has(atkType);
        default: return false;
    }
}
/** 'hit' | 'shield' | 'countered' | 'clash' */
function interaction(atkType, defender, down = false, atkChar = null) {
    if (defender.riposteT > 0) return down ? 'downclash' : 'riposte';          // a counter beats everything but down moves, which clash and stun both
    if (atkChar === 'volt') {                                      // Volt's moves are the weakest in the game: ANY active move (or shield) of the target beats them
        const vT = defender.isShielding ? 'SHIELD' : (defender.activeMove ? defender.activeMove.type : null);
        if (vT) return vT === 'SHIELD' ? 'shield' : 'countered';
    }          // Bulwark's open counter window: everything except Down moves
    // Active Phoenix Dash is countered by grabs, melee, directional specials and Cores.
    // Detached Phoenix rockets are separate projectiles and keep their own shield rules.
    if (defender.char === 'ember' && defender.sx && defender.sx.k === 'rocket' &&
        ['GRAB', 'J', 'CORE', 'BLINK', 'SPIRAL', 'SUPLEX', 'HEADBUTT'].includes(atkType)) return 'hit';
    const dType = defender.isShielding ? 'SHIELD' : (defender.activeMove ? defender.activeMove.type : null);
    if (!counters(dType, atkType)) return 'hit';
    if (dType === 'SHIELD') return 'shield';
    return counters(atkType, dType) ? 'clash' : 'countered';
}

class Fighter {
    constructor(x, y, color, name, isAI = false) {
        this.char = DEFAULT_CHAR;                // which character this fighter is (model, walk speed, special tunings)
        this.startX = x;
        this.startY = y;
        this.home = { x, y, color, name };       // restored when leaving a custom match
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = 44;
        this.height = 68;
        this.color = color;
        this.name = name;
        this.isAI = isAI;

        this.damage = 0;
        this.stocks = 3;
        this.active = true;                  // takes part in the match (custom matches use up to 8)
        this.out = false;                    // out of stocks
        this.team = null;                    // 'red' | 'blue' | 'yellow' | 'green' in team matches
        this.slot = 0;
        this.superColor = null;
        this.dropT = 0;                      // frames during which soft platforms are ignored (dropping through)

        this.maxJumps = 3;
        this.jumpsLeft = 3;
        this.grounded = false;

        this.isHanging = false;
        this.hangSide = 0;

        this.canGrab = true;
        this.heldItem = null;                // item in hand (host only; guests read `heldId`)
        this.heldId = 0;
        this.balloon = false;                // balloon item: 7 jumps until knocked out
        this.gravT = 0;                      // frames of reduced gravity (0.65x) after being hit by someone holding a balloon
        this.stuckTo = 0;                    // id of a thrown firestick (spear) this fighter is pinned to
        this.kills = 0;                      // timer matches: score
        this.deaths = 0;
        this.lastHitBy = null;               // for kill credit
        this.lastHitT = 9999;
        this._acc = 0; this._since = 0; this._slowK = 1; this._upd = true;   // clock time bubble

        this.isShielding = false;
        this.shieldHealth = 100;
        this.maxShieldHealth = 100;
        this.dizzyTimer = 0;
        this.clashStunTimer = 0;

        this.isRolling = false;
        this.rollTimer = 0;
        this.rollVx = 0;

        this.isGrabDashing = false;
        this.grabDashTimer = 0;
        this.grabHolding = null;
        this.grabbedBy = null;
        this.grabTimer = 0; this.gripT = 0; this.gripMode = false; this.throwKind = 'side'; this.throwU = 0; this.bombPrimed = false; this.bombShots = 0; this.bombLockT = 0; this.bombWas = 0; this.recoilT = 0; this.recoilX = 0; this.recoilY = 0; this.bombN = 0; this.bombT = 0; this.bombBy = null; this.tickFreezeT = 0;

        this.hitstun = 0;
        this.freezeAirTimer = 0;
        this.bounceReflectT = 0;
        this.invincibleTimer = 0;
        this.spawnT = 0;                     // respawn pre-animation: frozen and untouchable at the spawn point while the light pillar plays (60 frames = 1 s)
        this.ghostT = 0;                     // Phoenix Dash aftermath: invincible, but nothing this fighter does hurts anyone
        this.facing = 1;

        this.attackTimer = 0;
        this.activeHitbox = null;
        this.ghosts = [];
        this.incomingHitCount = 0;

        // --- 3D presentation only (never read by game logic) ---
        this.attackKind = null;      // 'JAB' | 'UP' | 'DOWN' | 'SIDE_LEFT' | 'SIDE_RIGHT'
        this.attackSerial = 0;
        this.throwFxT = 0;
        this.px = x; this.py = y;
        this._teleported = true;

        this.initCombat();
    }

    /** every field of the action / special-move system (reset on spawn) */
    initCombat() {
        this.actionLock = 0;                 // frames until another move may start
        this.airSpecials = 0;                // F moves used since last touching the ground
        this.cd = { CORE: 0, BLINK: 0, SPIRAL: 0, SUPLEX: 0, HEADBUTT: 0 };
        this.activeMove = null;              // { type, t }: what the fighter is "doing" for counter purposes
        this.fActive = false;                // F is being held
        this.fNeutral = false;               // F was pressed with the aim in the deadzone
        this.fDirPress = 'NEUTRAL';
        this.chargeFrames = 0;
        this.aiChargeGoal = 0;
        this.swing = null;                   // current J / Blink swing profile
        this.swingHit = false;
        this.swingHitSet = null;             // spin attack: who it already hit
        this.attackHeld = false;             // melee button still held: charging a side / up / down swing
        this.meleeCharge = 0;                // frames charged (0..MELEE_CHARGE_MAX)
        this.suplexAng = 0;                  // backflip angle during a suplex (radians)
        this.landFlipT = 0;                  // landing recovery of the suplex backflip
        this.spiralT = 0;
        this.rockT = 0;
        this.zapN = 0; this.zapT = 0; this.zapImmuneT = 0; this.swordGroundCd = false; this._swordRemain = 0; this.comboN = 0; this.comboT = 0; this.comboN = 0; this.comboT = 0;        // zapImmuneT: lightning trails ignore this fighter (1.3 s after a trail stun ends) // Volt's stuns on this fighter in the last 10 s (the 3rd one becomes a normal knockback instead)
        this.riposteT = 0; this.riposteAfter = 0; this.riposteCd = 0; this.stabT = 0;   // Bulwark's counter: open window / missed aftermath / cooldown / stab animation
        this.swordRide = false;              // Bulwark's Up-F: carried up on his floating sword
        this.backT = 0; this._shadowT = 0; this.cloakT = 0; this.soakT = 0; this.slowT = 0; this._stunAfter = 0; this.buryT = 0; this._wantOut = false; this._wpT = 0; this._windCd = 0;   // soakT: drenched by Tide's melee (slower, takes more from his water)
           // cloakT: Umbra is invisible to everyone but himself
           // backT: lying on the back after Bulwark's stab (frames left)
        this.bleedT = 0; this.bleedTick = 0; // bleeding out after a riposte stab
        this.upT = 0;                        // frames an Up-F move is in progress (Ember's roll counters these too)
        this.sideT = 0;                      // frames a Side-F move is in progress (Ember's Fireball Roll counters these)
        this.glide = false;                  // Tide: keeps the Geyser boost momentum in the air
        this.burnT = 0; this.burnDmg = 3; this.burnBy = null;     // burning (Ember's roll): damage ticks while it lasts
        this.trapId = 0;                     // id of the bubble this fighter is trapped in (Tide's Bubble Trap)
        this.sx = null;                      // running character special: { k: 'burst'|'breath'|'pound'|'dash', t, ... }
        this.armorT = 0;                     // frames of armour (damage, but no flinch / knockback)
        this.suplexT = 0;                    // > 0 while carrying an opponent in a suplex
        this.suplexN = 0;
        this.suplexPhase = 'rise';
        this.suplexPending = false;          // the grab dash in flight is a suplex
        this.suplexTarget = null;
        this.grabVictim = null;
        this.diving = false;
        this.diveT = 0;
        this.diveHit = false;
        this.freezeTimer = 0;                // "getting up" frames after a headbutt
        this.rollCooldown = 0;
        this.rollTotal = ROLL_FRAMES;
        this.hangTimer = 0;
        this.ledgeBan = 0;
        this.haltT = 0; this.haltElapsed = 0;   // Ember post-roll slowdown (0.7 s)
        this.specialKind = null;             // presentation: 'CORE' | 'SPIRAL' | 'SUPLEX' | 'HEADBUTT'
        this.specialT = 0;
        this.specialDur = 0;
    }

    get charging() { return this.fActive && (this.fNeutral || this.chargeFrames >= HOLD_TO_CORE); }

    reset(fullReset = false) {
        this.x = this.startX;
        this.vx = 0;
        this.vy = 0;
        // full reset (match start, demo, rematch): stand on the stage immediately.
        // mid-match respawn (fullReset false while playing) keeps the 1s light pillar above the stage.
        if (fullReset || S.gameState !== 'playing') {
            this.y = STAGE.y - this.height / 2;
            this.grounded = true;
        } else {
            this.y = STAGE.y - 300;
            this.grounded = false;
        }
        this.damage = S.match ? S.match.startDamage : 0;    // custom match: you start AND respawn with the chosen starting damage
        this.dropHeld();
        this.balloon = false; this.maxJumps = trainJumps(this); this.gravT = 0; this.stuckTo = 0; this.sx = null; this.armorT = 0; this.trapId = 0; this.burnT = 0; this.burnDmg = 3; this.burnBy = null;
        this.jumpsLeft = this.maxJumps;
        this.isHanging = false;
        this.canGrab = true;
        this.isGrabDashing = false;
        this.isRolling = false;
        this.rollTimer = 0;
        this.dropT = 0;
        this.grabHolding = null;
        this.grabbedBy = null;
        this.grabTimer = 0; this.gripT = 0; this.gripMode = false; this.throwKind = 'side'; this.throwU = 0; this.bombPrimed = false; this.bombShots = 0; this.bombLockT = 0; this.bombWas = 0; this.recoilT = 0; this.recoilX = 0; this.recoilY = 0; this.bombN = 0; this.bombT = 0; this.bombBy = null; this.tickFreezeT = 0;
        this.isShielding = false;
        this.shieldHealth = this.maxShieldHealth;
        this.dizzyTimer = 0; this.zapN = 0; this.zapT = 0; this.zapImmuneT = 0; this.swordGroundCd = false; this._swordRemain = 0; this.comboN = 0; this.comboT = 0;
        this.clashStunTimer = 0; this._stunAfter = 0;
        this.hitstun = 0;
        this.invincibleTimer = Math.max(120 + perkOf(this, 'spawn'), this._kcInv > 0 ? 180 : 0); this._kcInv = 0; this.ghostT = 0;      // 3 s of i-frames after a kill-cam KO

        this.spawnT = (!fullReset && S.gameState === 'playing') ? 60 : 0;
        if (this.spawnT <= 0 && this.grounded) this.vy = 0;
        this.attackTimer = 0;
        this.activeHitbox = null;
        this.incomingHitCount = 0;
        this.attackKind = null;
        this.throwFxT = 0;
        this._teleported = true;
        this.initCombat();

        if (fullReset) {
            this.stocks = S.match ? S.match.stocks : 3;
            this.out = false;
            this.kills = 0; this.deaths = 0; this.lastHitBy = null; this.lastHitT = 9999;
        }
    }

    // ------------------------------------------------------------ action gating
    /** true while the fighter may NOT start a new move */
    actionBlocked() {
        return this.actionLock > 0 || this.hitstun > 0 || this.dizzyTimer > 0 || this.clashStunTimer > 0 ||
            this.freezeTimer > 0 || this.isRolling || this.isHanging || !!this.grabbedBy || !!this.grabHolding ||
            this.isShielding || this.fActive || this.spiralT > 0 || this.suplexT > 0 || this.diving || !!this.sx ||
            this.haltT > 0;   // Ember post-roll halt: no attacks/specials/shield
    }
    canShield() {
        return this.actionLock <= 0 && !this.attackHeld && !this.fActive && this.spiralT === 0 && this.suplexT === 0 && !this.diving && !this.sx &&
            !this.isRolling && this.freezeTimer === 0 && this.haltT <= 0;
    }
    setMove(type, frames) { this.activeMove = { type, t: frames }; }

    /** being hit / countered cancels whatever the fighter was doing */
    interrupt() {
        this.releaseGrabHold();
        this.fActive = false; this.chargeFrames = 0; this.aiChargeGoal = 0;
        this.swing = null; this.attackTimer = 0; this.activeHitbox = null; this.attackHeld = false; this.meleeCharge = 0;
        this.releaseSuplexVictim();
        this.spiralT = 0; this.suplexT = 0; this.suplexPending = false; this.diving = false; this.sx = null; this.swordRide = false; this._carry = [];
        this.riposteT = 0; this.riposteAfter = 0; this.stabT = 0; this._stabVictim = null;
        this.haltT = 0; this.haltElapsed = 0;
        this.specialKind = null; this.specialDur = 0; this.specialT = 0;
        this.activeMove = null; this.actionLock = 0; this.freezeTimer = 0; this.freezeAirTimer = 0;
        this.isGrabDashing = false;
    }

    update() {
        if (!(this.hitstun > 0 || this.clashStunTimer > 0 || this.dizzyTimer > 0)) this._freeFace = this.facing;      // remembered for Umbra's backstab: which way they faced before being stunned
        if (this.spawnT > 0) {                                          // 1 s pre-spawn: hold still in the light while it plays, then drop in
            this.spawnT--; this.vx = this.vy = 0; this.y = STAGE.y - 300; this.grounded = false; this.isHanging = false;
            this.invincibleTimer = Math.max(this.invincibleTimer, 3); this.actionLock = Math.max(this.actionLock, 2);
            return;
        }
        if (this.armorT > 0) this.armorT--;
        if (this.rockT > 0) this.rockT--;
        if (this.zapT > 0 && --this.zapT === 0) this.zapN = 0;
        if (this.zapImmuneT > 0) this.zapImmuneT--;
        if (this.comboT > 0 && --this.comboT === 0) this.comboN = 0;
        if (this._shadowT > 0) this._shadowT--;
        if (this._boostWait) { this._boostWait = false; this._edgeBoost = true; }
        if (this.buryT > 0) this.buryT--;
        if (this._kcInv > 0) this._kcInv--;
        if (this._wpT > 0) this._wpT--;
        if (this.slowT > 0) this.slowT--;
        if (this.soakT > 0) { this.soakT--; if (this.soakT % 14 === 0) createParticles(this.x + (Math.random() - 0.5) * 30, this.y - 10, '#38bdf8', 2); }
        if (this.cloakT > 0) { if (--this.cloakT === 0) this._edgeBoost = false; } else this._edgeBoost = false;
        if (this.backT > 0) { this.backT--; this.hitstun = Math.max(this.hitstun, 2); this.invincibleTimer = Math.max(this.invincibleTimer, this.backT > 0 ? 3 : 12); if (this.grounded) { this.vx *= 0.5; this.vy = Math.min(this.vy, 0); } if (this.backT === 0) { this.hitstun = 0; this.invincibleTimer = Math.max(this.invincibleTimer, 12); } }
        if (this.isGrabDashing || this.grabHolding || this.suplexPending || this.suplexT > 0) this.invincibleTimer = Math.max(this.invincibleTimer, 30);      // grabbers can't be hit while grabbing, nor for 0.5 s after the grab is over
        if (this.char === 'bulwark') {                                                   // every landing from the air is a small stomp
            if (!this.grounded) this._airT = (this._airT || 0) + 1;
            else { if (this._airT >= 10 && !this.hitstun && !this.clashStunTimer && !this.isHanging && !this.swordGroundCd && this.stocks > 0 && !this.out) this.landStomp(false); this._airT = 0; }
        }
        if (this.swordGroundCd) {      // Sword Lift cancelled early: no Up-F until he is back on the ground, where he stomps and pauses
            if (this.grounded) { this.swordGroundCd = false; this.cd.SPIRAL = Math.min(this.cd.SPIRAL, 18); this.landStomp(true); this._airT = 0; }
            else this.cd.SPIRAL = Math.max(this.cd.SPIRAL, 30);
        }
        if (this.char === 'bulwark') this.tickRiposte();
        if (this.bleedT > 0) {                                          // Bulwark riposte: 2.5 s bleed, 1 damage every 0.3 s
            if (this.stocks <= 0 || this.out) this.bleedT = 0;
            else {
                this.bleedT--;
                if (++this.bleedTick % 18 === 0) {
                    if (!S.sdNoDmg) this.damage += 1; if (this._bleedBy) { this.lastHitBy = this._bleedBy; this.lastHitT = 0; }
                    dripBlood(this.x, this.y - 10); fx('burn', this.x, this.y - 20, 0, 0, 'blood'); audio.playHit(false);
                }
            }
        }
        if (this.sideT > 0) this.sideT--;
        if (this.upT > 0) this.upT--;
        if (this.glideT > 0) {
            this.glideT--;
            if (this.glideT <= 0) this.glide = false;          // boost window over → normal drift / friction
        }
        if (this.glide && (this.grounded || this.hitstun > 0 || this.isHanging || this.sx || this.activeMove || this.attackTimer > 0 || this.spiralT > 0 || this.diving || this.isShielding || this.isRolling || this.grabHolding || this.grabbedBy || this.freezeTimer > 0 || this.dizzyTimer > 0 || Math.abs(this.vx) < 2)) { this.glide = false; this.glideT = 0; }
        if (this.burnT > 0) {                                  // burning: 1 tick every 0.2 s (12 frames)
            this.burnT--;
            if (this.burnT % 12 === 0 && this.stocks > 0) {
                if (!S.sdNoDmg) this.damage += this.burnDmg || 1;
                if (this.burnBy) { this.lastHitBy = this.burnBy; this.lastHitT = 0; }
                fx('burn', this.x, this.y - 30); createParticles(this.x, this.y, '#fb923c', 5);
            }
        }
        // Ember Side-F end lag: slide to a stop over 0.7 s (legs-forward halt)
        if (this.haltT > 0) {
            this.haltT--;
            this.haltElapsed++;
            this.haltV = (this.haltV || 0) * (this.haltK || 0.88);
            this.vx = this.haltV / (this.grounded ? WORLD.friction : WORLD.airFriction);   // friction is applied later: compensate so the slide distance is exact
            if (this.haltT === 0) this.haltV = 0;
            if (this.grounded && this.haltElapsed % 3 === 0 && Math.abs(this.haltV) > 1) createParticles(this.x - Math.sign(this.haltV) * 14, this.y + this.height / 2 - 4, '#e7d3a8', 2);   // skid dust
        }
        if (this.trapId) {
            if (orbs.some(o => o.id === this.trapId)) {
                this.hitstun = Math.max(this.hitstun, 2);
                // Tide's Bubble Trap: protect the captive throughout the grey stun.
                this.invincibleTimer = Math.max(this.invincibleTimer, 2);
                this.ghostT = Math.max(this.ghostT, 2);
            } else {
                this.trapId = 0;
                this.invincibleTimer = Math.max(this.invincibleTimer, 60);
                this.ghostT = Math.max(this.ghostT, 60);
            }
        }
        const bj = trainJumps(this);       // training menu can override jump count
        if (this.maxJumps !== bj) { this.jumpsLeft = Math.min(bj, this.jumpsLeft + Math.max(0, bj - this.maxJumps)); this.maxJumps = bj; }
        if (this.gravT > 0) this.gravT--;
        if (this.dropT > 0) this.dropT--;
        if (S.sdNoDmg) this.damage = 200;          // sudden death: percent is locked, moves cannot change it
        if (this.damage >= 250) {
            this.takeKO();
            return;
        }

        if (this.invincibleTimer > 0) this.invincibleTimer--;
        if (this.freezeAirTimer > 0) this.freezeAirTimer--;
        if (this.bounceReflectT > 0) this.bounceReflectT--;
        if (this.ghostT > 0) this.ghostT--;
        if (this.lastHitT < 9999) this.lastHitT++;
        if (this.landFlipT > 0) this.landFlipT--;
        if (this.actionLock > 0) this.actionLock--;
        if (this.rollCooldown > 0) this.rollCooldown--;
        if (this.ledgeBan > 0) this.ledgeBan--;
        for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
        if (this.activeMove && --this.activeMove.t <= 0) this.activeMove = null;
        if (this.activeHitbox && this.activeHitbox.ttl !== undefined && --this.activeHitbox.ttl <= 0) this.activeHitbox = null;
        if (this.specialDur > 0 && ++this.specialT >= this.specialDur) { this.specialKind = null; this.specialDur = 0; }

        if (this.bombN > 0) {                                  // Ember's cluster bomb burn: 5 ticks of 2 over 3 s; each tick freezes the victim 0.2 s but their velocity carries on afterwards
            if (this.stocks <= 0 || this.out) this.bombN = 0;
            else if (++this.bombT % 36 === 0) {
                if (!S.sdNoDmg) this.damage += 2; if (this.bombBy) { this.lastHitBy = this.bombBy; this.lastHitT = 0; }
                this.bombN--; this.tickFreezeT = 12; fx('burn', this.x, this.y - 30); createParticles(this.x, this.y, '#fb923c', 6); audio.playHit(false);
            }
        }
        if (this.char === 'ember') {                           // cluster bomb bookkeeping: 2 shots per prime; 2 s before it can be primed again once every bubble has gone off
            const live = orbs.some(o => o && o.owner === this && o.kind === 'bomb') ? 1 : 0;
            if (this.bombWas && !live && this.bombShots <= 0) this.bombLockT = 120;
            this.bombWas = live; if (this.bombLockT > 0) this.bombLockT--;
            this.bombPrimed = this.bombShots > 0;
        }
        if (this.recoilT > 0) {                                // throwing the bubbles shoves Ember straight back (a quick push, no leftover speed)
            this.recoilT--; this.x += this.recoilX; this.y += this.recoilY; this.recoilX *= 0.88; this.recoilY *= 0.88; this.glide = false;
            if (this.recoilT > 0) { this.vx = 0; this.vy = 0; } else { this.vx = this.recoilX * 0.4; this.vy = this.recoilY * 0.4; }   // the shove slows as it goes and then coasts on, it never stops dead
        }
        if (this.tickFreezeT > 0) { this.tickFreezeT--; return; }
        if (this.freezeAirTimer > 0) { this.vx = this.vy = 0; return; }

        if (this.clashStunTimer > 0) {
            this.clashStunTimer--;
            this.vx = 0;
            this.vy = Math.min(this.vy + WORLD.gravity * (this.gravT > 0 ? 0.65 : 1), WORLD.terminalVelocity);
            this.x += this.vx;
            this.y += this.vy;
            this.checkStageCollision();
            return;
        }

        if (this.dizzyTimer > 0) {
            this.dizzyTimer--;
            this.vx *= 0.8;
            this.vy = Math.min(this.vy + WORLD.gravity * (this.gravT > 0 ? 0.65 : 1), WORLD.terminalVelocity);
            this.x += this.vx;
            this.y += this.vy;
            this.checkStageCollision();
            return;
        }

        if (this.freezeTimer > 0) {          // getting up after a headbutt (not a stun: no grey, no damage)
            this.freezeTimer--;
            this.vx = 0;
            this.vy = Math.min(this.vy + WORLD.gravity * (this.gravT > 0 ? 0.65 : 1), WORLD.terminalVelocity);
            this.y += this.vy;
            this.checkStageCollision();
            return;
        }

        if (this.isHanging) {
            this.hangTimer++;
            if (this.hangTimer >= HANG_MAX) {          // overstayed the ledge
                this.kickFromLedge(TIMEOUT_BAN);
                return;
            }
            this.vx = 0;
            this.vy = 0;
            const ledgeX = this.hangSide === -1 ? STAGE.x : STAGE.x + STAGE.width;
            this.x = ledgeX + (this.hangSide * 12);
            this.y = STAGE.y + 12;
            return;
        }

        if (this.isRolling) {
            this.rollTimer--;
            this.invincibleTimer = Math.max(this.invincibleTimer, 2);
            this.vx = this.rollVx;
            this.vy = 0;
            // a roll can never carry you over the void: it stops at the ledge
            let nx = this.x + this.vx;
            const minX = STAGE.x + 12, maxX = STAGE.x + STAGE.width - 12;
            let atEdge = false;
            if (nx < minX) { nx = minX; atEdge = true; }
            else if (nx > maxX) { nx = maxX; atEdge = true; }
            this.x = nx;
            this.y = STAGE.y - this.height / 2;
            this.ghosts.push({ x: this.x, y: this.y, alpha: 0.5, color: '#38bdf8' });

            if (this.rollTimer <= 0 || atEdge) {
                this.isRolling = false;
                this.vx = 0;
            }
            return;
        }

        if (this.grabbedBy && (!isAlive(this.grabbedBy) || (this.grabbedBy.grabHolding !== this && this.grabbedBy.grabVictim !== this) || this.grabbedBy.grabbedBy)) { this.grabbedBy = null; this.hitstun = Math.min(this.hitstun, 10); }      // never stay stuck to a grabber who let go, died or was grabbed himself
        if (this.grabHolding && (!isAlive(this.grabHolding) || this.grabHolding.grabbedBy !== this || this.grabbedBy)) this.releaseGrabHold();
        if (this.grabbedBy) {
            this.vx = 0;
            this.vy = 0;
            const g = this.grabbedBy, gox = this.x, goy = this.y;
            if (g.throwU > 0) {                   // the thrower's wind-up: the foe is carried round with the flip / spin
                const u = g.throwU, th = g.throwKind === 'up' ? -2 * Math.PI * u : g.throwKind === 'down' ? -Math.PI * 0.6 * u : 0;
                this.x = g.x + g.facing * 46 * Math.cos(th);
                this.y = g.y - 46 * Math.sin(th) - (g.throwKind === 'side' ? 0 : 0);
            } else if (g.gripT > 0) {             // held by the leg and swung over Ember's head
                const u = 1 - (g.gripT - 18) / 12, uu = Math.max(0, Math.min(1, u)), th = Math.PI - uu * (Math.PI + 0.25);
                this.x = g.x + g.facing * 58 * Math.cos(th);
                this.y = g.y - 58 * Math.sin(th);
            } else if (g.suplexT > 0) {                  // carried round the backflip: overhead -> behind -> underneath
                const a = g.suplexAng || 0;
                this.x = g.x - g.facing * 46 * Math.sin(a);
                this.y = g.y - 46 * Math.cos(a);
            } else {
                this.x = g.x + (g.facing * 35);
                this.y = g.y;
            }
            pushOutOfStage(this, gox, goy); this.px = this.x; this.py = this.y;
            return;
        }

        if (this.suplexT > 0) {                   // Suplex: rise with the opponent, then slam them down
            this.updateSuplex();
            return;
        }

        if (this.grabHolding) {
            this.grabTimer--;
            this.vx = 0;
            this.vy = 0;
            {   // the throw's wind-up animation depends on where it is aimed: up = front flip, side = a spin, down = a half front flip (the throw itself stays omnidirectional)
                let ax, ay;
                if (this.isAI) { ax = (this.x < STAGE.x + STAGE.width / 2 ? -1 : 1); ay = -0.4; }
                else { ax = (this.remoteAim ? this.remoteAim.x : mouse.worldX) - this.x; ay = (this.remoteAim ? this.remoteAim.y : mouse.worldY) - this.y; }
                this.throwKind = ay < -Math.abs(ax) * 0.8 ? 'up' : ay > Math.abs(ax) * 0.8 ? 'down' : 'side';
                if (this.throwKind === 'side') this.facing = ax >= 0 ? 1 : -1;
                const win = 18;
                this.throwU = this.grabTimer <= win ? 1 - Math.max(0, this.grabTimer) / win : 0;
                if (this.gripMode && this.throwU > 0 && this.grabTimer % 4 === 0) {      // Ember's version: explosions (visual only) fling him round
                    const fy = this.throwKind === 'up' ? this.y + 34 : this.throwKind === 'down' ? this.y - 34 : this.y + 6;
                    fx('explosion', this.x - (this.throwKind === 'side' ? this.facing * 24 : 0), fy, 34, 0.2, STYLE_OF[this.char]); createParticles(this.x, fy, '#fb923c', 5);
                }
            }
            if (this.gripMode && this.gripT > 0) {              // the grip burns: 5 ticks of 0.4 (2 damage over 0.5 s)
                this.gripT--;
                if (this.gripT % 6 === 0 && this.grabHolding) {
                    const v = this.grabHolding; if (!S.sdNoDmg) v.damage += 0.4; v.lastHitBy = this; v.lastHitT = 0; fx('burn', v.x, v.y - 20); createParticles(v.x, v.y, '#fb923c', 4);
                }
            }

            if (this.grabTimer <= 0) {
                const target = this.grabHolding;
                this.grabHolding = null;
                if (this.char === 'bulwark') this.clashStunTimer = Math.max(this.clashStunTimer, 40);      // Bulwark is stunned for 0.67 s after a grab throw (no more endless chains)
                target.grabbedBy = null;

                let dx = 0;
                let dy = 0;

                if (this.isAI) {
                    const stageCenterX = STAGE.x + STAGE.width / 2;
                    dx = this.x < stageCenterX ? -1 : 1;
                    dy = -0.4;
                } else {
                    dx = (this.remoteAim ? this.remoteAim.x : mouse.worldX) - this.x;
                    dy = (this.remoteAim ? this.remoteAim.y : mouse.worldY) - this.y;
                }

                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const throwSpeed = grabThrowSpeed(target); // Ember's Phoenix Dash throw uses normal grab knockback
                target.vx = (dx / dist) * throwSpeed;
                target.vy = (dy / dist) * throwSpeed;
                target.bounceReflectT = 60;
                target.hitstun = 60;
                target.grounded = false;
                target.lastHitBy = this; target.lastHitT = 0;

                audio.playThrow(); this.throwU = 0;
                this.throwFxT = 14;
                S.screenShake = 14;
                createParticles(target.x, target.y, '#ef4444', 25);
                if (this.gripMode) {                                // the fling ends in an explosion
                    this.freezeAirTimer = 30; this.cd.SPIRAL = Math.max(this.cd.SPIRAL, 30 + 48); this.grounded = false; this.vx = this.vy = 0;   // 0.5 s hang, then Up is locked for 0.8 s
                    this.gripMode = false; this.gripT = 0;
                    fx('explosion', target.x, target.y, 90, 0.5, STYLE_OF[this.char]); createParticles(target.x, target.y, '#fb923c', 22); audio.playHit(true); S.screenShake = 20;
                }
            }
            return;
        }

        if (this.isGrabDashing) {
            this.grabDashTimer--;
            this.ghosts.push({ x: this.x, y: this.y, alpha: 0.6, color: '#ef4444' });
            if (this.suplexPending && this.suplexTarget) {      // home in on the locked target
                const t = this.suplexTarget;
                this.facing = t.x >= this.x ? 1 : -1;
                this.vx = this.facing * SUPLEX_SPEED;
            }
            if (this.grabDashTimer <= 0) {
                this.isGrabDashing = false;
                this.suplexPending = false;
                this.suplexTarget = null;
            }
        }

        if (this.hitstun > 0) {
            this.hitstun--;
            if (this.hitstun === 0 && this._stunAfter > 0) { this.clashStunTimer = this._stunAfter; this._stunAfter = 0; }
            this.vx *= 0.98;
            this.vy = Math.min(this.vy + WORLD.gravity * 0.75, WORLD.terminalVelocity);
            this.x += this.vx;
            this.y += this.vy;
            this.checkStageCollision(true);                  // ragdolled: bounce off the stage instead of sliding along it
            return;
        }

        for (let i = this.ghosts.length - 1; i >= 0; i--) {
            this.ghosts[i].alpha -= 0.05;
            if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
        }

        if (this.isShielding) {
            this.shieldHealth -= 0.25;
            this.vx = 0;
            if (this.shieldHealth <= 0) {
                this.isShielding = false;
                this.dizzyTimer = 180;
                audio.playHit(true);
            }
        } else if (this.shieldHealth < this.maxShieldHealth) {
            this.shieldHealth += 0.3;
        }

        this.updateSpecials();

        if (this.sx && this.sx.k === 'thunder') {
            this.vx = 0; this.vy = 0;                          // Volt Enlightened: frozen until the bolt ends
        } else if (this.diving || this.spiralT > 0 || (this.sx && this.sx.k === 'rocket')) {
            this.vx *= 0.92;
        } else if (!this.grounded) {
            let gMul = (this.gravT > 0 ? 0.65 : 1);
            // charging Fireball Roll: 0.6× gravity only while charging
            if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'charge') gMul *= 0.6;
            this.vy = Math.min(this.vy + WORLD.gravity * gMul, WORLD.terminalVelocity);
            if (!this.glide) this.vx *= WORLD.airFriction;
            if (!this.glide && !this.sx && !this.activeMove && !this.recoilT && !this.isGrabDashing && this.attackTimer <= 0 && this.lastHitT > 45 && Math.abs(this.vx) > 14) this.vx *= 0.93;   // speed left over from a dash / blink bleeds off quickly instead of carrying a bot across the map
        } else {
            this.vx *= WORLD.friction;
        }
        // Ember Fireball charge: no sideways drift / walk
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'charge') {
            this.vx = 0;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (!(this.sx && this.sx.k === 'rocket' && spec(this.char, 'U').ghost)) { this.checkStageCollision();       // Umbra's Shadow Flight passes through the stage
        this.checkLedgeMagnet(); }

        if (this.diving && this.grounded) this.diveImpact();

        if (this.attackTimer > 0) {
            const sw = this.swing;
            if (this.attackHeld && sw && sw.chargeable && ATTACK_FRAMES - this.attackTimer >= sw.a - 1) {
                // button still held at the wind-up: the swing waits there, charging (up to 1.7 s)
                this.actionLock = Math.max(this.actionLock, LOCK - sw.a + 1 + (this.heldItem && this.heldItem.type === 'FIRESTICK' ? 12 : 0));
                if (this.meleeCharge < MELEE_CHARGE_MAX) this.meleeCharge++;   // stays fully charged until you let go
            } else {
                const slowSwing = this.heldItem && this.heldItem.type === 'FIRESTICK' && this.swing && this.swing.type !== 'BLINK';
                if (!(slowSwing && (this._slowTick = (this._slowTick || 0) + 1) % 3 === 0)) this.attackTimer--;   // firestick: swings take 1.5x as long
                if (this.attackTimer === 0 && this.swing) {
                    this.swing = null;
                    this.activeHitbox = null;
                    this.attackHeld = false; this.meleeCharge = 0;
                }
            }
        }
        this.updateSwing();

        // the kill barrier reacts as soon as the body touches it (not only the centre). A protected fighter (spawn / kill-cam i-frames) cannot be KO'd, so the barrier hits them instead:
        // +250% damage and a hard shove back to the middle of the arena (also the safety net for any glitch that leaves someone outside)
        const hw = (this.width || 40) / 2, hh = (this.height || 70) / 2, B = BLAST_ZONES;
        if (this.x - hw < B.left || this.x + hw > B.right || this.y - hh < B.top || this.y + hh > B.bottom) {
            if (this.invincibleTimer > 0 || this.spawnT > 0) {
                if (!(this._bzCool > 0)) {
                    const cx = (B.left + B.right) / 2, cy = (B.top + B.bottom) / 2, dx = cx - this.x, dy = cy - this.y, d = Math.hypot(dx, dy) || 1;
                    if (!S.sdNoDmg) this.damage += 250; this.interrupt && this.interrupt();
                    this.vx = dx / d * 26; this.vy = dy / d * 26; this.hitstun = Math.max(this.hitstun, 30); this._bzCool = 40;
                    S.screenShake = Math.max(S.screenShake, 14); audio.playHit(true); fx('hit', this.x, this.y, 25, Math.atan2(dy, dx));
                }
            } else this.takeKO();
        }
        if (this._bzCool > 0) this._bzCool--;
    }

    // ------------------------------------------------------------ swings (J attack, Blink slash)
    updateSwing() {
        const sw = this.swing;
        if (!sw) return;
        const e = ATTACK_FRAMES - this.attackTimer;          // frames elapsed (1..18)
        if (this.swingHit || e < sw.a || e > sw.b) {
            this.activeHitbox = null;
            return;
        }
        const k = (e - sw.a) / Math.max(1, sw.b - sw.a);
        const p = sw.path(k, this.facing);
        const cm = 1 + MELEE_CHARGE_BONUS * (this.meleeCharge / MELEE_CHARGE_MAX);          // charged swing: up to +30%
        const fl = this.heldItem && this.heldItem.type === 'FIRESTICK' ? this.heldItem.len : 1;   // firestick: longer reach
        const reach = 1 + (fl - 1) * 0.6;
        let dmg = sw.damage * cm;
        let burn = null;
        if (this.char === 'ember') {
            // Ember melee: base 2 (uncharged) / 3 (full); main damage is burn ticks
            const ch = this.meleeCharge / MELEE_CHARGE_MAX;
            dmg = 2 + Math.round(ch);                         // 2 → 3
            // 1.6 s uncharged → 3 s full; tick every 0.2 s deals 1
            const burnFrames = Math.round(96 + ch * (180 - 96)); // 96..180
            burn = { t: burnFrames, dmg: 1 };
        }
        this.activeHitbox = {
            x: this.x + p.x * reach, y: this.y + p.y * reach, w: sw.w * fl * (sw.type === 'J' ? 1.3 : 1), h: sw.h * (1 + (fl - 1) * 0.35) * (sw.type === 'J' ? 1.3 : 1),
            damage: dmg, bkb: sw.bkb * cm, kbg: sw.kbg * cm, angle: sw.angle(this.facing, this.grounded), radial: !!sw.radial, type: sw.type,
            multi: !!sw.multi, fire: fl > 1, stun: sw.stun || 0, burn,
            fixed: sw.flow ? { vx: this.facing * sw.flow, vy: -1, hitstun: 8 } : null,
        };
        if (sw.type === 'J') this.setMove('J', 2);            // J only counters while its swing is live
    }

    // ------------------------------------------------------------ F specials: per-frame state
    updateSpecials() {
        if (this.fActive && this.char === 'zephyr' && this.chargeFrames >= CHARGE_MAX + 60 && !this.sx && this.cd.CORE <= 0) this.fRelease('NEUTRAL', this.x, this.y);      // fully charged for 1 s: it goes off by itself
        if (this.fActive) this.chargeFrames = Math.min(this.char === 'zephyr' ? 130 : 120, this.chargeFrames + (this.char === 'tide' && this.chargeFrames >= HOLD_TO_CORE ? 2 : this.char === 'volt' && this.chargeFrames >= HOLD_TO_CORE ? 2.75 : 1));   // Tide's Core twice as fast, Volt's fully charged 0.7 s after pressing charges 2x faster
        if (this.fActive && !this.sx && spec(this.char, 'S').kind === 'roll' && this.cd.BLINK <= 0 && this.canRollStart()) {
            const dr = this === p1 && !(S.online === 'guest') ? mouse.direction : this.fDirPress;
            if (dr === 'SIDE_LEFT' || dr === 'SIDE_RIGHT') { if (!this.grounded) this.airSpecials++; this.startRollCharge(dr === 'SIDE_LEFT' ? -1 : 1); }
        }
        // hard lock: while Side-F is on cooldown, never start / charge a roll
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'charge' && this.cd.BLINK > 0) {
            this.sx = null; this.fActive = false; this.chargeFrames = 0;
        }

        if (this.sx) this.updateSx();

        if (this.spiralT > 0) {                               // the Up-F recovery (Rising Spiral and every character's own version)
            const sp = spec(this.char, 'U');
            this.spiralT--;
            this.vy = -sp.vy;
            const n = sp.frames - this.spiralT;               // 1..frames
            if (sp.inv && n <= sp.inv) this.invincibleTimer = Math.max(this.invincibleTimer, 2);
            const lastZone = n >= sp.frames - 5;
            const fire = lastZone ? n === sp.frames - 5 : (sp.hitDmg > 0 && n % sp.every === 1);
            if (fire && sp.kind === 'rise') {
                const last = lastZone;
                this.activeHitbox = {
                    x: this.x, y: this.y - 8, w: sp.w, h: sp.h, type: 'SPIRAL', ttl: 5,
                    damage: last ? sp.lastDmg : sp.hitDmg, bkb: last ? sp.lastBkb : 0, kbg: last ? sp.lastKbg : 0,
                    angle: -Math.PI / 2 + this.facing * 0.35,
                    fixed: last ? null : { vx: this.facing * 1.5, vy: -sp.vy, hitstun: 14 },
                };
                fx('spiral', this.x, this.y);
            }
            if (sp.sword) {                                   // Bulwark: the rising sword spears whoever is above it and carries them up (they go on with the sword when he lets go)
                for (const t of foesOf(this)) {
                    if (this._carry.includes(t) || t.invincibleTimer > 0 || t.stocks <= 0) continue;
                    if (Math.abs(t.x - this.x) < 80 + t.width / 2 && t.y < this.y + 10 && this.y - t.y < 190 && interaction('SPIRAL', t, true) === 'hit') {
                        t.interrupt(); t.lastHitBy = this; t.lastHitT = 0; t.hitstun = Math.max(t.hitstun, 4); this._carry.push(t);
                        S.screenShake = Math.max(S.screenShake, 6); audio.playSpear(); createParticles(t.x, t.y, '#e2e8f0', 10); fx('hit', t.x, t.y, 10, -Math.PI / 2);
                    }
                }
                for (const t of this._carry) if (isAlive(t)) { t.x += (this.x - t.x) * 0.5; t.y = this.y - this.height / 2 - 64; t.vx = t.vy = 0; t.grounded = false; t.hitstun = Math.max(t.hitstun, 3); t.px = t.x; t.py = t.y; }
                if (this.spiralT % 4 === 0) createParticles(this.x, this.y + this.height / 2, '#e2e8f0', 2);
            }
            if (this.spiralT === 0) this.endSpiral();
        }

        if (this.diving) {                                    // Down-F in the air: dive (Air Headbutt and every character's own version)
            const sp = spec(this.char, 'DA');
            this.diveT++;
            this.vx = sp.vx ? this.facing * sp.vx : 0;
            this.vy = sp.vy;
            this.activeMove = { type: 'HEADBUTT', t: 3 };
            if (sp.hitDmg > 0 && this.diveT % sp.every === 1) {   // consecutive hits on the way down
                this.activeHitbox = {
                    x: this.x, y: this.y + 12, w: 132, h: 118, type: 'HEADBUTT', ttl: 5,
                    damage: sp.hitDmg, bkb: 0, kbg: 0, angle: Math.PI / 2,
                    fixed: { vx: 0, vy: 18, hitstun: 14 },
                };
                fx('spiral', this.x, this.y);
            }
            if (this.diveT > 90 || this.y > STAGE.y + 260) {
                this.diving = false; this.specialKind = null; this.specialDur = 0; this.activeMove = null; this.activeHitbox = null;
            }
        }
    }

    /** running character specials: burst / breath / ground pound / dash */
    updateSx() {
        const x = this.sx, f = this.facing;
        x.t++;
        if (x.k === 'burst') {
            const sp = spec(this.char, 'N'), pt = x.t - 3;
            this.activeMove = { type: 'CORE', t: 3 };
            if (pt >= 0 && pt < sp.frames && pt % sp.every === 0) {
                const R = lerpR(sp.R, x.c);
                this.swingHitSet = new Set();
                this.activeHitbox = { x: this.x, y: this.y, w: R * 2, h: R * 2, type: 'CORE', ttl: 4, multi: true, radial: !!sp.radial, stun: sp.stun || 0,
                    damage: lerpR(sp.dmg, x.c), bkb: lerpR(sp.bkb, x.c), kbg: sp.kbg, angle: -0.8 };
                fx('explosion', this.x, this.y, R, x.c, STYLE_OF[this.char]); fx('gust', this.x, this.y, R, 1, STYLE_OF[this.char]); S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true);
            }
            if (x.t >= sp.frames + 8) { this.sx = null; this.activeMove = null; if (this.char === 'zephyr') { this.actionLock = Math.max(this.actionLock, 42); this.cd.CORE = Math.max(this.cd.CORE, 42 + 240); } }      // Zephyr: tired 0.7 s, then the charge is on cooldown for 4 s
        } else if (x.k === 'breath') {
            const sp = spec(this.char, 'N');
            this.activeMove = { type: 'CORE', t: 3 };
            // Direction is locked at release (PC + mobile): no mid-stream re-aim
            if (x.t < sp.frames && x.t % sp.every === 0) {
                const w = lerpR(sp.w, x.c), last = x.t + sp.every >= sp.frames;
                const dx = x.dx !== undefined ? x.dx : f, dy = x.dy !== undefined ? x.dy : 0;
                const ang = x.ang !== undefined ? x.ang : (f > 0 ? 0 : Math.PI);
                const halfL = w / 2, halfT = sp.h / 2;
                // AABB that bounds the oriented stream rectangle (length w, thickness h)
                const extX = Math.abs(dx) * halfL + Math.abs(dy) * halfT;
                const extY = Math.abs(dy) * halfL + Math.abs(dx) * halfT;
                const cx = this.x + dx * (halfL + 16);
                const cy = this.y + dy * (halfL + 16);
                this.swingHitSet = new Set();
                const tickD = Array.isArray(sp.dmg) ? lerpR(sp.dmg, x.c) : sp.dmg;
                const lastD = Array.isArray(sp.lastDmg) ? lerpR(sp.lastDmg, x.c) : sp.lastDmg;
                // 6 ticks (every 5 over 26 frames): 5×tick + last → 14 uncharged / 18 full charge
                this.activeHitbox = { x: cx, y: cy, w: extX * 2, h: extY * 2, type: 'CORE', ttl: sp.every, multi: true,
                    damage: last ? lastD : tickD, bkb: last ? sp.bkb : 0, kbg: last ? sp.kbg : 0,
                    angle: last ? ang - 0.15 * Math.sign(dx || 1) : ang,
                    fixed: last ? null : { vx: dx * 3.5, vy: dy * 3.5 - 0.4, hitstun: 12 } };
                createParticles(this.x + dx * w * 0.5, this.y + dy * w * 0.5, '#fb923c', 8);
                createParticles(this.x + dx * w * 0.8, this.y + dy * w * 0.8, '#fde047', 5);
                // a = aim angle (sim rad), b = +/- length (sign marks final burst)
                fx('flame', this.x + dx * 24, this.y + dy * 24, ang, last ? w : -w, STYLE_OF[this.char]);
            }
            if (x.t >= sp.frames + 6) { this.sx = null; this.activeMove = null; }
        } else if (x.k === 'pound') {
            const sp = spec(this.char, 'DG');
            this.activeMove = { type: 'SPIRAL', t: 3 };
            this.vx = 0;
            const pt = x.t - sp.windup, n = sp.hits || 1, ev = sp.every || 6;
            if (sp.pillars && pt === 0) this.spawnPillars(sp.pillars);
            if (!sp.pillars && pt >= 0 && pt < n * ev && pt % ev === 0) {
                const w = STAGE.width * sp.w, feet = this.y + this.height / 2;
                const cx = x.tx !== null ? x.tx : this.x + (sp.centred ? 0 : f * (sp.off || 0)), cy = x.ty !== null ? x.ty : feet - sp.h / 2;
                this.swingHitSet = new Set();
                if (sp.twister) {
                    { const T = { id: ++windId, x: this.x + f * 60, y: feet, vx: f * 5.2, r: 105, h: 300, life: 150, owner: this, caught: new Map(), age: 0 }; tornadoes.push(T); fx('twister', T.x, T.y, f * T.r, T.life, T.id); }
                    fx('gust', this.x + f * 60, feet, 120, 0, 'wind'); S.screenShake = Math.max(S.screenShake, 6); createParticles(this.x + f * 60, feet - 10, '#e0f2fe', 16);
                } else if (sp.zone) {
                    // fixed pixel radius (rPx) so big maps don't scale the pool up
                    const R = sp.rPx != null ? sp.rPx : STAGE.width * (sp.R || sp.w * 0.5);
                    // only one whirlpool — if one is live, animation only (no second pool)
                    if (whirlpools.length === 0) {
                        // no activeHitbox: zero damage, zero stun — pure pull zone
                        const pid = ++poolSerial;
                        whirlpools.push({ id: pid, x: cx, y: feet, r: R, life: sp.life || 180, max: sp.life || 180, owner: this, pull: sp.pull || 2, dmg: 0 });
                        fx('pool', cx, feet, R, 600, pid);
                        S.screenShake = Math.max(S.screenShake, 8);
                        createParticles(cx, feet - 10, '#38bdf8', 16);
                    } else {
                        fx('gust', cx, feet, R * 0.35, 0, 'water');
                    }
                } else {
                    this.activeHitbox = { x: cx, y: cy, w, h: sp.h, type: 'SPIRAL', ttl: 4, multi: true, mirror: true, radial: !!sp.radial, stun: sp.stun || 0,
                        pull: sp.pull || 0, damage: sp.dmg, bkb: sp.bkb, kbg: sp.kbg, angle: sp.ang };
                    const st = STYLE_OF[this.char];
                    if (sp.h >= 150) fx('pillar', cx, cy + sp.h / 2, w, sp.h, st + '!@'); else fx('stomp', cx, cy + sp.h / 2, w, 0, st + '@');
                    if (sp.armor || sp.dmg >= 24) fx('quake', cx, cy + sp.h / 2, w, 0, st + '@');
                    if (sp.pull) fx('gust', cx, cy, sp.pull * 30, 1, st);
                    S.screenShake = Math.max(S.screenShake, 10); audio.playHit(true);
                    createParticles(cx, cy + sp.h / 2, this.color, 14);
                }
            }
            if (x.t >= sp.windup + n * ev + 6) { this.sx = null; this.activeMove = null; this.actionLock = Math.max(this.actionLock, lk(this, sp.lock || trainLock())); }
        } else if (x.k === 'rocket') {
            const sp = spec(this.char, 'U');
            if (x.charge > 0) {                                        // 1 s of charging in place (aim still steers the launch) before the Phoenix Dash starts
                x.charge--; x.t--; this.activeMove = null; this.activeHitbox = null; this.vx = this.vy = 0; this.grounded = false;
                const aim0 = aimOf(this); x.ang = Math.atan2(aim0.y - this.y, aim0.x - this.x); if (Math.sin(x.ang) > 0.3) x.ang = -x.ang;
                this.facing = Math.cos(x.ang) >= 0 ? 1 : -1;
                const u = 1 - x.charge / 36;
                if (x.charge % 6 === 0) { fx('explosion', this.x, this.y, 26 + 44 * u, 0.15, STYLE_OF[this.char]); createParticles(this.x, this.y, '#fb923c', 3); }
                if (x.charge === 0) { fx('rocket', this.x, this.y, 0, 0, STYLE_OF[this.char]); S.screenShake = Math.max(S.screenShake, 6); audio.playHit(false); }
                return;
            }
            this.activeMove = { type: 'SPIRAL', t: 3 };
            if (sp.ghost) { this.cloakT = Math.max(this.cloakT, 3); }                  // Shadow Flight: invisible and passes through the stage, but he can be hit out of it        // Umbra's Shadow Flight: an invisible shadow, untouchable, harmless, passes through walls
            const aim = aimOf(this);
            let da = Math.atan2(aim.y - this.y, aim.x - this.x) - x.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
            x.ang += Math.max(-sp.turn, Math.min(sp.turn, da));
            // Sub-step the rocket so it cannot skip through the stage / platforms in one frame
            const step = sp.speed, n = Math.max(1, Math.ceil(step / 6));
            const sx = Math.cos(x.ang) * step / n, sy = Math.sin(x.ang) * step / n;
            for (let i = 0; i < n; i++) {
                const lx = this.x, ly = this.y;
                this.x += sx; this.y += sy;
                this.px = lx; this.py = ly;
                this.vx = sx; this.vy = sy;
                if (!sp.ghost) { this.checkStageCollision(false); if (this.grounded) break; }
            }
            this.vx = this.vy = 0;
            this.facing = Math.cos(x.ang) >= 0 ? 1 : -1;
            if (sp.jet) {                                                  // Zephyr's Jet Stream: no hitbox; the air he flies through becomes a current that carries foes along
                if (x.t % 2 === 0 && x.px !== undefined) { zapTrails.push({ x1: x.px, y1: x.py, x2: this.x, y2: this.y, life: 36, owner: this, hit: new Set(), push: 15, wind: true }); fx('gust', this.x, this.y, 46, 0, 'wind'); }
                x.px = this.x; x.py = this.y; createParticles(this.x, this.y, '#e0f2fe', 2);
            } else if (sp.ghost) { /* no hitbox */ } else if (sp.drill) {                                                // Phoenix Dash: a continuous drill of hits that carries foes along with the flame; only the end knocks
                const hx = this.x + Math.cos(x.ang) * 40, hy = this.y + Math.sin(x.ang) * 40;
                if (x.t % 6 === 1) this.swingHitSet = new Set();
                if (!this.swingHitSet) this.swingHitSet = new Set();
                this.activeHitbox = { x: hx, y: hy, w: sp.w, h: sp.h, type: 'SPIRAL', ttl: 3, multi: true, damage: sp.dmg, bkb: 0, kbg: 0, angle: x.ang, phoenix: x.t >= sp.frames - 5,
                    fixed: { vx: Math.cos(x.ang) * sp.speed * 0.95, vy: Math.sin(x.ang) * sp.speed * 0.95, hitstun: 7 } };
            } else if (x.t % 3 === 1) {
                if (!this.swingHitSet) this.swingHitSet = new Set();
                this.activeHitbox = { x: this.x + Math.cos(x.ang) * 34, y: this.y + Math.sin(x.ang) * 34, w: sp.w, h: sp.h, type: 'SPIRAL', ttl: 3, multi: true,
                    damage: sp.dmg, bkb: sp.bkb, kbg: sp.kbg, angle: x.ang - 0.15 * Math.sign(Math.cos(x.ang) || 1), fixed: null };
            }
            if (sp.drill) {                                                    // STICKY drag: anyone the drill has hit is pinned to the flame and carried along, so they cannot fall out of the move
                if (!x.caught) x.caught = new Set();
                const hx = this.x + Math.cos(x.ang) * 40, hy = this.y + Math.sin(x.ang) * 40;
                for (const f of foesOf(this)) {
                    if (!isAlive(f)) continue;
                    const near = Math.abs(f.x - hx) < sp.w / 2 + f.width / 2 + 60 && Math.abs(f.y - hy) < sp.h / 2 + f.height / 2 + 60;
                    if (!x.caught.has(f) && near && f.lastHitBy === this && f.lastHitT <= 8) x.caught.add(f);
                    if (x.caught.has(f)) {
                        if (f.isShielding || f.stocks <= 0) { x.caught.delete(f); continue; }
                        const k = 0.55;                                       // strong pull toward the drill's tip
                        const ox = f.x, oy = f.y; f.x += (hx - f.x) * k; f.y += (hy - f.y) * k; pushOutOfStage(f, ox, oy); f.px = f.x; f.py = f.y;
                        f.vx = Math.cos(x.ang) * sp.speed * 0.95; f.vy = Math.sin(x.ang) * sp.speed * 0.95;
                        f.hitstun = Math.max(f.hitstun, 8); f.grounded = false; f.lastHitBy = this; if (f.lastHitT > 6) f.lastHitT = 6;
                    }
                }
            }
            if (!sp.ghost) fx('trail', this.x, this.y, Math.round(x.ang * 100) / 100, 0, STYLE_OF[this.char]);
            else {                                                         // Shadow Flight leaves a purple trail and dust clouds
                fx('trail', this.x, this.y, Math.round(x.ang * 100) / 100, 0, STYLE_OF[this.char]);
                createParticles(this.x, this.y, '#a855f7', 3); createParticles(this.x, this.y + 6, '#7e22ce', 2);
                if (x.t % 3 === 0) { createParticles(this.x + (Math.random() - 0.5) * 30, this.y + (Math.random() - 0.5) * 30, '#9ca3af', 3); fx('explosion', this.x, this.y, 30 + Math.random() * 26, 0.1, 'dark'); }
            }
            if (x.t >= sp.frames) {
                if (sp.ghost) {                                     // ended inside the stage: surface on top of it
                    const hw = this.width / 2, hh = this.height / 2;
                    if (this.x + hw > STAGE.x && this.x - hw < STAGE.x + STAGE.width && this.y + hh > STAGE.y && this.y - hh < STAGE.y + STAGE.height) { this.y = STAGE.y - hh; this.px = this.x; this.py = this.y; this.grounded = false; }
                    this.cloakT = 6;
                }
                const caught = x.caught ? [...x.caught].filter(f => isAlive(f) && !onSword(f) && Math.hypot(f.x - this.x, f.y - this.y) < 200) : [];
                if (caught.length === 1 && sp.drill) {                      // one foe caught: grab them by the leg and fling them away (an explosion at the end of the throw)
                    const v = caught[0];
                    v.interrupt(); v.isShielding = false; v.hitstun = 40; v.vx = v.vy = 0;
                    this.grabHolding = v; v.grabbedBy = this; this.grabTimer = 30; this.gripT = 30; this.gripMode = true; this.gripTickT = 0;
                    this.facing = v.x >= this.x ? 1 : -1;
                    audio.playGrab(); fx('grab', v.x, v.y); createParticles(v.x, v.y, '#fb923c', 16);
                    this.sx = null; this.activeMove = null; this.armorT = 0; this.vx = this.vy = 0;
                    return;
                }
                if (sp.missile && caught.length === 0) {                                           // the fire rocket detaches and keeps flying the way Ember was heading until it explodes
                    const m = sp.missile;
                    const nearFoe = nearestOf({ x: this.x, y: this.y }, foesOf(this).filter(isAlive));
                    for (const da of [-20, 0, 20]) {                         // three rockets from the same point: the middle one homes on the nearest foe, one 20 degrees either side flies straight
                        const a = x.ang + da * Math.PI / 180;
                        orbs.push({ homing: da === 0 && nearFoe ? nearFoe : undefined, homingDelay: da === 0 && nearFoe ? 30 : 0, homingTurn: 0.02, shieldCounter: da === 0 && !!nearFoe, spd: m.speed, x: this.x + Math.cos(x.ang) * 40, y: this.y + Math.sin(x.ang) * 40, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, r: m.r, charge: 0.2, owner: this,
                            life: m.life, color: '#fb923c', id: ++orbSerial, d: m.dmg, R: m.R, bkb: m.bkb, kbg: m.kbg, grav: 0, curve: 0, wobble: 0, pull: 0, age: 0, kind: 'firerocket', phoenix: true, flat: false });
                    }
                    fx('rocket', this.x, this.y, 0, 0, 'fire'); fx('explosion', this.x, this.y, 60, 0.3, 'fire'); audio.playHit(false);
                }
                if (sp.missile && caught.length >= 2) {
                    const m = sp.missile;
                // two or more foes caught in the drill: one 2x fast, perfectly homing rocket goes after them (8 dmg, 0.8x rocket knockback, ignores shields)
                    for (const f of caught) {
                        orbs.push({ x: this.x + Math.cos(x.ang) * 40, y: this.y + Math.sin(x.ang) * 40, vx: 0, vy: 0, r: m.r, charge: 0.3, owner: this,
                            life: 150, color: '#fde047', id: ++orbSerial, d: 8, R: m.R, bkb: m.bkb * 0.8, kbg: m.kbg * 0.8, grav: 0, curve: 0, wobble: 0, pull: 0, age: 0,
                            kind: 'firerocket', phoenix: false, flat: true, homing: f, spd: m.speed * 2, shieldPass: true });
                        audio.playHoming();
                    }
                    fx('rocket', this.x, this.y, 0, 0, 'fire'); fx('explosion', this.x, this.y, 60, 0.3, 'fire'); audio.playHit(false);
                }
                this.sx = null; this.activeMove = null; this.armorT = Math.min(this.armorT, 3);
                this.vx = Math.cos(x.ang) * sp.speed * 0.45; this.vy = Math.sin(x.ang) * sp.speed * 0.45;
                const over = this.x > STAGE.x - 40 && this.x < STAGE.x + STAGE.width + 40 && this.y < STAGE.y;
                this.actionLock = Math.max(this.actionLock, lk(this, (sp.ghost || sp.jet) ? 12 : sp.missile ? 16 : over ? 20 : 70));
            }
        } else if (x.k === 'erupt') {
            const sp = spec(this.char, 'U');
            this.activeMove = { type: 'SPIRAL', t: 3 };
            if (x.t === sp.windup) {
                const w = STAGE.width * sp.w, px = this.x, feet = this.y + this.height / 2;
                this.swingHitSet = new Set();
                this.activeHitbox = { x: px, y: feet - sp.h / 2 + 30, w, h: sp.h, type: 'SPIRAL', ttl: sp.rideFrames, multi: true, mirror: true,
                    damage: sp.dmg, bkb: 0, kbg: 0, angle: -1.45, stun: sp.stun || 0, lift: sp.lift || 0 };
                fx('pillar', px, feet, w, sp.h, STYLE_OF[this.char] + '!@'); S.screenShake = Math.max(S.screenShake, 10); audio.playHit(true);
                x.px = px;
            }
            // ride: smooth upward push (additive) so gravity still shapes the arc
            if (x.t > sp.windup && x.t <= sp.windup + sp.rideFrames) {
                this.grounded = false;
                this.vy -= sp.ride * 0.42;                       // soft continuous lift (not a hard lock)
                this.vy = Math.max(this.vy, -sp.ride * 1.35);    // cap climb speed
                this.vx *= 0.88;
                if (x.t % 3 === 0) fx('trail', this.x, this.y + 30, -Math.PI / 2, 0, 'water');
            }
            // aim boost: 1.5× the old 3× walk speed, eased in over several frames (gravity still applies after)
            if (x.t === sp.windup + sp.rideFrames) {
                const aim = aimOf(this), ang = Math.atan2(aim.y - this.y, aim.x - this.x);
                const spd = 4.5 * 0.7 * 8.5 * charOf(this.char).walk;  // 0.7× previous launch strength
                x.bvx = Math.cos(ang) * spd;
                x.bvy = Math.sin(ang) * spd - 1.2;
                x.boostLeft = 10;
                if (Math.abs(x.bvx) > 3) this.facing = x.bvx > 0 ? 1 : -1;
                fx('gust', this.x, this.y, 90, 0, 'water'); fx('trail', this.x, this.y, Math.round(ang * 100) / 100, 1, 'water');
            }
            if (x.boostLeft > 0) {
                const a = 0.2;                                   // ease toward boost vector (smooth, not a snap)
                this.vx += (x.bvx - this.vx) * a;
                this.vy += (x.bvy - this.vy) * a;
                this.grounded = false;
                x.boostLeft--;
            }
            if (x.t >= sp.windup + sp.rideFrames + 12) {
                this.sx = null; this.activeMove = null;
                if (!this.grounded && !this.isHanging) {
                    this.glide = true;
                    this.glideT = 42;                          // 0.7 s of boost drift, then normal air control
                }
            }
        } else if (x.k === 'dash') {
            const sp = spec(this.char, 'S');
            if (x.t <= sp.frames) {
                this.x = Math.min(WORLD.width - 20, Math.max(20, this.x + x.d * sp.dist / sp.frames));
                this.vx = 0; this.vy = Math.min(this.vy, 0.5);
                this.ghosts.push({ x: this.x, y: this.y, alpha: 0.6, color: sp.ghost || '#fde68a' });
                if (x.t % 2 === 0) fx('trail', this.x, this.y, x.d > 0 ? 0 : Math.PI, 1, STYLE_OF[this.char]);
                if (sp.drops && x.t % 3 === 1) this.dropAt(this.x, sp.drops);
            } else if (sp.end && x.t <= sp.frames + 5) {
                this.vx = 0; this.vy = Math.min(this.vy, 0.5);
                if (!x.ended) {                                 // the dash finishes with a blast: this is the hit that knocks
                    x.ended = true; const e = sp.end, st = STYLE_OF[this.char], feet = this.y + this.height / 2;
                    this.swing = null; this.attackTimer = 0;
                    this.swingHitSet = new Set();
                    this.activeHitbox = { x: this.x + x.d * (e.fwd || 0), y: e.pillar ? feet - e.h / 2 + 30 : this.y, w: e.w, h: e.h, type: 'BLINK', ttl: 6, multi: true,
                        mirror: !e.radial, radial: !!e.radial, damage: e.dmg, bkb: e.bkb || 0, kbg: e.kbg || 0, angle: e.ang !== undefined ? e.ang : -0.5, stun: e.stun || 0 };
                    if (e.pillar) fx('pillar', this.x + x.d * (e.fwd || 0), feet, e.w, e.h, st + '!@'); else { fx('explosion', this.x, this.y, e.w / 2, 0.5, st); fx('gust', this.x, this.y, e.w / 2, 1, st); }
                    S.screenShake = Math.max(S.screenShake, 10); audio.playHit(true);
                    if (sp.rebound) { this.vx = -x.d * sp.rebound; this.vy = -5; this.grounded = false; }
                }
            } else { this.sx = null; this.armorT = Math.min(this.armorT, 2); }
        } else if (x.k === 'roll') {
            const sp = spec(this.char, 'S'), st = STYLE_OF[this.char];
            if (x.ph === 'charge') {
                x.c = Math.min(1, x.t / ROLL_CHARGE);
                this.activeMove = null; this.facing = x.d;
                if (x.c >= 1) { x.fullT = (x.fullT || 0) + 1; if (x.fullT >= ROLL_AUTO) { this.launchRoll(); return; } }
                else x.fullT = 0;
                // red → white → blue particle gradient
                const col = x.c < 0.5 ? '#ef4444' : (x.c < 0.95 ? '#f8fafc' : '#38bdf8');
                if (x.t % 4 === 0) createParticles(this.x, this.y, col, 2);
                if (!this.fActive && !this.isAI) { this.launchRoll(); }
                else if (this === p1 && mouse.touchMode && S.online !== 'guest' && mouse.direction !== (x.d > 0 ? 'SIDE_RIGHT' : 'SIDE_LEFT')) this.launchRoll();
            } else if (x.pause > 0) {                                  // hit mid-roll: frozen in place for 0.5 s, the roll's clock stands still too
                x.pause--; x.t--; this.vx = 0; this.vy = Math.min(this.vy, 0); this.activeHitbox = null; this.activeMove = { type: 'BLINK', t: 2 };
                if (x.pause % 6 === 0) createParticles(this.x, this.y, '#fb923c', 2);
            } else {
                const c = x.c, walk = 8.5 * charOf(this.char).walk;
                // tiers first (needed for distance)
                const full = c >= 0.9, mid = c >= 0.4 && !full;
                // white travels 1.4× as far as red (same speed, longer life); blue uses full charged life
                // red base; white 1.2×; blue faster version of white (1.45×)
                const spdMul = full ? 1.45 : (mid ? 1.2 : 1.1);
                const speed = lerpR(sp.speed, mid || full ? 0.5 : 0) * walk * spdMul * (x.slow || 1);   // blue: a hit it ploughs through slows it to 0.6x for the rest of this roll
                if (x.v === undefined) x.v = x.d * speed;
                const acc = speed / 22;
                x.v += Math.max(-acc, Math.min(acc, x.d * speed - x.v));
                this.vx = x.v / (this.grounded ? WORLD.friction : WORLD.airFriction); if (Math.abs(x.v) > speed * 0.15) this.facing = x.v > 0 ? 1 : -1;
                const sz = lerpR(sp.w, c);
                // life: red 60, white 84 (1.4×), blue 90 — jump cancel does NOT extend this
                const life = full ? 90 : (mid ? 84 : 60);
                const rb = sp.rocketBkb != null ? sp.rocketBkb : 9.12, rk = sp.rocketKbg != null ? sp.rocketKbg : 0.684;
                // delayed jump-cancel: ride the ball 0.6 s then drop it (life still ends on schedule)
                if (x.jumpCancelT > 0) {
                    x.jumpCancelT--;
                    if (x.jumpCancelT <= 0) { this.endRoll(); return; }
                }
                // past stage side edges / under stage → end roll (skip if you STARTED already in that void)
                // so side-F still works when used from off-stage / under-stage recovery spots
                if (!x.fromVoid) {
                    const top = STAGE.y, bot = STAGE.y + STAGE.height;
                    const L = STAGE.x + 12, R = STAGE.x + STAGE.width - 12;
                    let pastSide = false;
                    if (this.x < L) { this.x = L; pastSide = true; }
                    else if (this.x > R) { this.x = R; pastSide = true; }
                    const under = this.y > bot + 4
                        || (this.y > top + 8 && (this.x <= L || this.x >= R));
                    if (pastSide || under) { this.endRoll(); return; }
                }
                // tick cadence: red every 6, white every 5, blue every 2 → 1 dmg
                x.tickN = (x.tickN || 0) + 1;
                const every = full ? 2 : (mid ? 5 : 6);
                const isTick = (x.tickN % every) === 0;
                if (isTick) this.swingHitSet = new Set();
                this.activeMove = { type: 'BLINK', t: 2 };
                // remaining frames — red deals 2 on each of the last 5 tick beats only
                const left = life - x.t;
                const ticksRemaining = Math.ceil(Math.max(0, left) / every);
                const redLate = !full && !mid && isTick && ticksRemaining <= 5 && ticksRemaining >= 1;
                // red / white / blue all carry (blue = faster white); tick dmg only on red late
                this.activeHitbox = { x: this.x, y: this.y, w: sz, h: sz, type: 'BLINK', ttl: 3, multi: true, mirror: true,
                    damage: 0, bkb: 0, kbg: 0, angle: -0.6,
                    rollCarry: true,
                    fixed: { vx: this.vx, vy: this.vy, hitstun: 10 } };
                // keep carried foes glued to us
                for (const f of foesOf(this)) {
                    if (f._rollCarry === this && f.hitstun > 0) {
                        const cox = f.x, coy = f.y; f.x = this.x; f.y = this.y; f.vx = this.vx; f.vy = this.vy; f.grounded = false; pushOutOfStage(f, cox, coy);
                    }
                }
                // RED: last 5 ticks × 2 damage (direct, reliable)
                if (redLate) {
                    if (!x.redTickHit) x.redTickHit = new Set(); // per tick beat, not per foe forever
                    const beat = Math.floor(x.tickN / every);
                    if (x.redBeat !== beat) { x.redBeat = beat; x.redTickHit = new Set(); }
                    for (const f of foesOf(this)) {
                        if (!isAlive(f) || f.invincibleTimer > 0 || x.redTickHit.has(f)) continue;
                        const hw = sz / 2 + f.width / 2, hh = sz / 2 + f.height / 2;
                        if (Math.abs(f.x - this.x) > hw || Math.abs(f.y - this.y) > hh) continue;
                        if (f._rollCarry !== this && !(Math.abs(f.x - this.x) <= hw && Math.abs(f.y - this.y) <= hh)) continue;
                        x.redTickHit.add(f);
                        if (!S.sdNoDmg) f.damage += 2;
                        f.lastHitBy = this; f.lastHitT = 0;
                        createParticles(f.x, f.y, '#fb923c', 4);
                        fx('hit', f.x, f.y, 4, -0.5);
                        audio.playHit(false);
                    }
                }
                const trail = full ? '#38bdf8' : (mid ? '#e2e8f0' : '#ef4444');
                if (x.t % 2 === 0) fx('ember', this.x, this.y + this.height / 2, -Math.sign(x.v || x.d), c, st);
                if (x.t % 3 === 0) createParticles(this.x - x.d * 20, this.y + 10, trail, 2);
                if (x.t >= life) this.endRoll();
            }
        } else if (x.k === 'thunder') {                            // arms stretched out, hanging in the air, until the ball is gone
            this.vx = this.vy = 0; this.activeMove = null; this.grounded = false;
            if (!orbs.some(o => o.id === x.oid) && x.t > 2) { this.sx = null; this.actionLock = Math.max(this.actionLock, 10); }
            else if (x.t % 5 === 0) createParticles(this.x, this.y, '#fde047', 2);
        } else if (x.k === 'wind') {                              // Umbra's Shadow Step startup: a purple blast gathers (an indicator only), then he vanishes
            this.vx = 0; this.activeMove = null;
            const sp = spec(this.char, 'S');
            if (x.t % 6 === 1) { fx('gust', this.x, this.y, 60 + x.t * 2.4, 1, 'dark'); fx('explosion', this.x, this.y, 30 + x.t, 0.2, 'dark'); }
            if (x.t === sp.windup - 4) fx('explosion', this.x, this.y, 120, 0.8, 'dark');
            if (x.t >= sp.windup) { const d = x.d; this.sx = null; this._wound = true; this.startBlink(d, sp); this._wound = false; }
        } else if (x.k === 'bolt') {
            const sp = spec(this.char, 'U');
            if (x.ph === 'freeze') {                                   // hanging in the air, crackling, for 0.3 s
                this.vx = 0; this.vy = -WORLD.gravity; this.grounded = false; this.activeMove = { type: 'SPIRAL', t: 2 }; this.invincibleTimer = Math.max(this.invincibleTimer, 2);
                const a = aimOf(this); if (Math.abs(a.x - this.x) > 8) this.facing = a.x > this.x ? 1 : -1;
                if (x.fz % 3 === 0) createParticles(this.x, this.y, '#fde047', 3);
                if (--x.fz <= 0) { x.ph = 'go'; x.t = 0; this.boltStrike(sp); }
            } else if (x.t >= 10) {
                if (x.left > 0) { x.left--; x.ph = 'freeze'; x.fz = sp.freeze2 || 14; this.swingHitSet = new Set(); }
                else { this.sx = null; this.activeMove = null; }
            }
        }
    }

    spawnPillars(pl) {
        const feet = this.y + this.height / 2, st = STYLE_OF[this.char], w = STAGE.width * pl.w;
        for (const sd of [-1, 1]) {
            pillars.push({ x: this.x + sd * pl.off, feet, w, aw: w * 2.6, h: pl.h, dmg: pl.dmg, burn: pl.burn, tick: pl.tick, life: 24, owner: this, hit: new Set() });
            fx('pillar', this.x + sd * pl.off, feet, w * 1.6, pl.h, st + '!@'); fx('quake', this.x + sd * pl.off, feet, w * 2.2, 0, st + '@');
        }
        S.screenShake = Math.max(S.screenShake, 12); audio.playHit(true);
    }

    /** Bulwark's swords / Terra's rocks: they rain down on the path just travelled and land a moment later */
    dropAt(px, dr) {
        const y0 = this.y - 520, v = dr.speed || 26;
        let yl = Math.min(BLAST_ZONES.bottom, STAGE.y + 40), surface = false;                       // they keep falling until a stage / platform stops them, or they leave through the kill zone
        if (onStageX(px) && STAGE.y > y0 && STAGE.y < yl) { yl = STAGE.y; surface = true; }
        for (const pl of STAGE.platforms || []) if (px >= pl.x && px <= pl.x + pl.w && pl.y > y0 && pl.y < yl) { yl = pl.y; surface = true; }
        const frames = Math.max(2, Math.ceil((yl - y0) / v));
        drops.push({ x: px, y: y0, yl, off: 0, v, surface, owner: this, hit: new Set(), ...dr });
        fx('drop', px, y0, frames, yl, dr.kind);
    }

    /** Bulwark lets go of his Up-F sword: it keeps rising a moment (knocking foes aside), then falls like a Shield Rush sword */
    /** Bulwark lands: a small stomp (3 damage, 0.3x of the old knockback, half the reach). pause = the longer freeze after hopping off the sword early */
    landStomp(pause) {
        const fy = this.y + this.height / 2;
        for (const t of foesOf(this)) {
            if (t.stocks <= 0 || t.invincibleTimer > 0 || Math.hypot(t.x - this.x, t.y - fy) > 95 + t.width / 2) continue;
            if (interaction('SPIRAL', t, true) === 'hit') launch(this, t, { damage: 3, bkb: 2.4, kbg: 0.21, angle: -1.2, mirror: true, x: this.x, y: fy });
        }
        fx('stomp', this.x, fy, 130, 0, 'iron'); S.screenShake = Math.max(S.screenShake, pause ? 8 : 4); audio.playStomp();
        this.freezeTimer = Math.max(this.freezeTimer, 18); this.vx = 0;           // 0.3 s of the same get-up animation as his Down-air stomp
    }

    launchSwordFly() {
        const rem = Math.max(0, this._swordRemain || 0); this._swordRemain = 0;              // hopped off early: the sword still climbs the rest of the way up before it drops
        const v0 = 12.15, N = 16 + 2 * rem, g = 0.9, y0 = this.y + this.height / 2 - 103, px = this.x;
        const yA = y0 - v0 * N / 2;
        let yl = Math.min(BLAST_ZONES.bottom, STAGE.y + 40), surface = false;
        if (onStageX(px) && STAGE.y > yA && STAGE.y < yl) { yl = STAGE.y; surface = true; }
        for (const pl of STAGE.platforms || []) if (px >= pl.x && px <= pl.x + pl.w && pl.y > yA && pl.y < yl) { yl = pl.y; surface = true; }
        const stop = yl - (surface ? SWORD_OFF : 0);
        let F = N + 1; while (yA + 0.5 * g * (F - N) * (F - N) < stop && F < 400) F++;
        drops.push({ x: px, y: y0, yl: stop, v: 0, surface, owner: this, hit: new Set(), hitUp: new Set(), kind: 'sword', caught: (this._carry || []).filter(isAlive), off: surface ? SWORD_OFF : 0, dmg: 6, bkb: 8, kbg: 0.7, w: 70 * SWORD_SCALE, h: 150 * SWORD_SCALE, fly: { y0, yA, v0, N, g, f: 0 } });
        fx('swordfly', px, y0, F, stop, N); this._carry = [];
    }

    endSpiral() {
        if (!(this.swordRide && this.char === 'bulwark' && this.spiralT <= 0)) this._carry = [];
        if (this.swordRide && this.char === 'bulwark' && this.spiralT <= 0) this.launchSwordFly();
        this.activeMove = null; this.swordRide = false;
        const overStage = this.x > STAGE.x - 40 && this.x < STAGE.x + STAGE.width + 40 && this.y < STAGE.y;
        if (this.char === 'bulwark' && spec('bulwark', 'U').sword) { this.actionLock = Math.max(this.actionLock, 18); this.cd.SPIRAL = Math.max(this.cd.SPIRAL, 18); }      // Sword Lift: only 0.3 s of tiredness before any move (and Up) is ready again
        else if (!overStage) this.actionLock = Math.max(this.actionLock, 96);   // missed the stage -> extra lag
    }

    diveImpact() {
        const sp = spec(this.char, 'DA');
        this.diving = false;
        this.vy = 0;
        const w = STAGE.width * sp.impactW;                   // Headbutt: 1/8 of the stage
        const hit = sp.stun ? { damage: sp.impactDmg, bkb: 0, kbg: 0, angle: -Math.PI / 2, stun: sp.stunFrames || trainStun() }
                            : { damage: sp.impactDmg, bkb: sp.bkb, kbg: sp.kbg, angle: sp.ang, mirror: true, multi: true };
        this.activeHitbox = { x: this.x, y: this.y + this.height / 2 - 30, w, h: 64, type: 'HEADBUTT', ttl: 8, ...hit };
        this.activeMove = { type: 'HEADBUTT', t: 10 };
        this.specialKind = null; this.specialDur = 0;
        if (this.char === 'bulwark') this.clashStunTimer = Math.max(this.clashStunTimer, 36);       // Down air: 0.6 s stun on landing
        this.freezeTimer = lk(this, sp.lock !== undefined ? sp.lock : FREEZE);
        if (sp.vx) { this.vy = -8; this.grounded = false; this.freezeTimer = Math.min(this.freezeTimer, 8); }   // the diagonal kick bounces back up
        if (hit.multi) this.swingHitSet = new Set();
        fx('stomp', this.x, this.y + this.height / 2, w, 0, STYLE_OF[this.char] + '@');
        if (sp.impactDmg >= 20) fx('quake', this.x, this.y + this.height / 2, w, 0, STYLE_OF[this.char] + '@');
        S.screenShake = Math.max(S.screenShake, 14);
        audio.playHit(true);
    }

    // ------------------------------------------------------------ F special: input
    canStartF(dir) {
        if (this.actionBlocked()) return false;
        if (!this.grounded && this.airSpecials >= airFOf(this)) return false;
        if (dir === 'NEUTRAL' && this.cd.CORE > 0) return false;
        return true;
    }
    fPress(dir) {
        if (!this.canStartF(dir)) return false;
        this.fActive = true;
        this.fNeutral = dir === 'NEUTRAL';
        this.fDirPress = dir;
        this.chargeFrames = 0;
        this.aiChargeGoal = 0;
        return true;
    }
    cancelF() { this.fActive = false; this.chargeFrames = 0; this.aiChargeGoal = 0; if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'charge') this.sx = null; }
    /** F released: held >= 0.5 s (or neutral aim) -> CBG Core, otherwise the directional variant */
    fRelease(dir, tx, ty) {
        if (!this.fActive) return false;
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'charge') { this.fActive = false; this.chargeFrames = 0; this.launchRoll(); return true; }
        const held = this.chargeFrames, neutral = this.fNeutral, dp = this.fDirPress;
        this.cancelF();
        if (neutral || held >= HOLD_TO_CORE) {
            return this.useSpecial('CORE', tx, ty, Math.min(1, held / CHARGE_MAX));
        }
        const d = dir !== 'NEUTRAL' ? dir : dp;
        switch (d) {
            case 'SIDE_LEFT': return this.useSpecial('BLINK', this.x - 100, this.y, Math.min(1, held / ROLL_CHARGE));
            case 'SIDE_RIGHT': return this.useSpecial('BLINK', this.x + 100, this.y, Math.min(1, held / ROLL_CHARGE));
            case 'UP': return this.useSpecial('SPIRAL', tx, ty);
            case 'DOWN': return this.useSpecial(this.grounded ? 'SUPLEX' : 'HEADBUTT', tx, ty);
            default: return this.useSpecial('CORE', tx, ty, 0);
        }
    }

    useSpecial(kind, tx, ty, charge = 0) {
        if (this.isHanging) return false;    // ledge: jump only
        // Tide can press Side-F again while the water bubble is travelling to detonate it early.
        if (kind === 'BLINK' && this.char === 'tide') {
            const bubble = orbs.find(o => o && o.owner === this && o.kind === 'bubble');
            if (bubble) { dropOrb(bubble); explodeOrb(bubble); audio.playHit(false); return true; }
        }
        if (this.actionBlocked()) return false;
        if (this.cd[kind] > 0) return false;
        if (kind === 'SUPLEX' && !this.grounded) return false;
        if (kind === 'SUPLEX' && this.char === 'ember' && this.bombShots <= 0 && this.bombLockT <= 0 && !orbs.some(o => o && o.owner === this && o.kind === 'bomb')) {   // Ember's Down-F first PRIMES the cluster bomb (neutral melee throws it); once primed or while bombs live it is the fire pillars
            this.bombShots = 2; this.bombPrimed = true; this.cd.SUPLEX = 24; this.actionLock = Math.max(this.actionLock, lk(this, 16));
            fx('explosion', this.x, this.y, 46, 0.3, STYLE_OF[this.char]); createParticles(this.x, this.y, '#fb923c', 14); audio.playGrab(); return true;
        }
        if (kind === 'HEADBUTT' && this.grounded) return false;
        if (!this.grounded && kind !== 'SUPLEX' && this.airSpecials >= airFOf(this)) return false;

        const sp = spec(this.char, SLOT_OF[kind]);
        if (!this.grounded) this.airSpecials++;
        this.cd[kind] = Math.round((sp.cd !== undefined ? sp.cd : CD[kind]) * (1 + perkOf(this, 'cd')));
        if (kind === 'SPIRAL') this.upT = (sp.frames || 20) + (sp.windup || 0) + 12;
        if (kind === 'BLINK' && sp.kind !== 'roll' && sp.kind !== 'bubble' && this.char !== 'umbra') this.sideT = (sp.frames || 0) + (sp.windup || 0) + 22;
        this.actionLock = lk(this, sp.lock !== undefined ? sp.lock : trainLock());

        switch (kind) {
            case 'CORE': this.startCore(tx, ty, charge); break;
            case 'BLINK': {
                const d = tx >= this.x ? 1 : -1;
                if (sp.kind === 'roll') { if (this.cd.BLINK > 0) return false; this.startRollCharge(d); this.launchRoll(charge); } else if (sp.kind === 'dash') this.startDash(d, sp); else if (sp.kind === 'bubble') this.startBubble(d, sp); else this.startBlink(d, sp);
                break;
            }
            case 'SPIRAL': if (sp.kind === 'rocket') this.startRocket(sp); else if (sp.kind === 'erupt') this.startErupt(sp); else if (sp.kind === 'bolt') this.startBolt(sp); else this.startSpiral(tx); break;
            case 'SUPLEX': if (sp.kind === 'pound') this.startPound(sp); else this.startSuplex(tx); break;
            case 'HEADBUTT': this.startHeadbutt(); break;
        }
        return true;
    }

    startCore(tx, ty, charge) {
        const sp = spec(this.char, 'N');
        if (sp.kind === 'thunder') return this.startThunder(sp, charge);
        if (sp.kind === 'burst') return this.startSx('burst', charge);
        if (sp.kind === 'breath') {
            // Same aim rules as Luminent Core: aim-matrix / touchAim vector first, else tx/ty
            // (set by setAim from the matrix drag), else facing / move direction as fallback.
            let dx, dy;
            if (mouse.touchAim && mouse.touchAim.length === 2) {
                dx = mouse.touchAim[0]; dy = mouse.touchAim[1];
            } else {
                const ax = tx !== undefined ? tx : aimOf(this).x;
                const ay = ty !== undefined ? ty : aimOf(this).y;
                dx = ax - this.x; dy = ay - this.y;
            }
            let len = Math.hypot(dx, dy);
            if (len < 0.15) { dx = this.facing; dy = 0; len = 1; }
            dx /= len; dy /= len;
            if (Math.abs(dx) > 0.15) this.facing = dx > 0 ? 1 : -1;
            return this.startSx('breath', charge, { ang: Math.atan2(dy, dx), dx, dy });
        }
        let dx = tx - this.x, dy = ty - this.y;
        let len = Math.hypot(dx, dy);
        if (len < 1) { dx = this.facing; dy = 0; len = 1; }
        dx /= len; dy /= len;
        if (Math.abs(dx) > 0.2) this.facing = dx > 0 ? 1 : -1;
        const speed = lerpR(sp.speed, charge);
        const r = lerpR(sp.r, charge);
        const full = charge >= 1;
        const color = full ? (this.superColor || (this === p1 ? '#a855f7' : '#fb923c')) : this.color;   // full charge: blue -> purple, red -> orange
        orbs.push({
            x: this.x + dx * (40 + r * 0.4), y: this.y + dy * (40 + r * 0.4),
            vx: dx * speed, vy: dy * speed, r, charge, owner: this, life: sp.life, color, id: ++orbSerial,
            d: lerpR(sp.dmg, charge), R: lerpR(sp.R, charge), bkb: lerpR(sp.bkb, charge), kbg: sp.kbg,
            grav: sp.grav || 0, curve: sp.curve || 0, wobble: sp.wobble || 0, pull: sp.pull || 0, age: 0, kind: sp.look || 0,
            // Terra Boulder (and any look:'boulder'): pierces / breaks shields on contact + AOE
            pierce: sp.look === 'boulder' || sp.pierce === true,
        });                                                   // flies straight along the aim (Umbra's curves a little, Terra's arcs)
        this.setMove('CORE', 24);
        if (this.char === 'luminent') this.actionLock = Math.max(this.actionLock, 12);          // Luminent: 0.2 s tired after the Core leaves his hand
        this.specialKind = 'CORE'; this.specialT = 0; this.specialDur = 24;
        audio.playDash();
        fx('core', this.x, this.y, charge, Math.atan2(dy, dx));
    }

    /** Volt's Enlightened: he hangs in the air with his arms out while a thunder ball falls from above him and is steered (mouse on PC, joystick on phones) */
    startThunder(sp, charge) {
        const c = Math.max(0, Math.min(1, charge));
        const minS = 8.5 * charOf('volt').walk, maxS = 2 * 8.5 * charOf('zephyr').walk;
        const id = ++orbSerial, spd = minS + (maxS - minS) * c;
        const o = { x: this.x, y: this.y - 300, vx: 0, vy: spd * 0.6, r: 16 + 10 * c, charge: c, owner: this, life: sp.life, color: '#fde047', id,
            d: sp.dmg[0] + (sp.dmg[1] - sp.dmg[0]) * c, R: lerpR(sp.R, c), bkb: lerpR(sp.bkb, c), kbg: lerpR(sp.kbg, c), stun: sp.stun, grav: 0, curve: 0, wobble: 0, pull: 0, age: 0,
            kind: 'thunder', ctrl: this, spd, ang: Math.PI / 2 };
        orbs.push(o);
        this.sx = { k: 'thunder', t: 0, c, tx: null, ty: null, d: 1, oid: id };
        this.activeMove = null; this.specialKind = null; this.specialDur = 0; this.vx = this.vy = 0; this.grounded = false;
        fx('pillar', this.x, this.y - 300, 40, 600, 'volt!'); fx('core', this.x, this.y - 300, c, Math.PI / 2, 'volt'); fx('gust', this.x, this.y, 100, 0, 'volt');
        S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true);
    }
    canRollStart() { return this.cd.BLINK <= 0 && this.actionLock <= 0 && this.hitstun <= 0 && this.clashStunTimer <= 0 && this.freezeTimer <= 0 && (this.grounded || this.airSpecials < airFOf(this)); }
    /** Ember's Fireball Roll, step 1: charge under gravity (1.2 s to full). A hit now stuns for 1 s. */
    startRollCharge(d) {
        this.facing = d;
        this.sx = { k: 'roll', t: 0, c: 0, tx: null, ty: null, d, ph: 'charge', fullT: 0 };
        this.activeMove = null; this.specialKind = null; this.specialDur = 0;
        // keep current velocity — gravity continues to apply while charging
        audio.playDash();
    }
    /** step 2: let go. Speed, contact damage and burn all scale with the charge. */
    launchRoll(charge) {
        const x = this.sx; if (!x || x.k !== 'roll') return;
        const sp = spec(this.char, 'S');
        if (charge !== undefined && x.ph === 'charge') x.c = Math.max(x.c, Math.min(1, charge));
        x.ph = 'roll'; x.t = 0;
        // if you already started off-stage / under stage, allow the roll (don't auto-cancel on frame 1)
        x.fromVoid = rollInVoidZone(this);
        this.cd.BLINK = sp.cd; this.fActive = false; this.chargeFrames = 0;
        this.swingHitSet = new Set();
        this.setMove('BLINK', 6); this.activeMove = null;
        fx('rocket', this.x, this.y, 0, 0, 'fire');
        S.screenShake = Math.max(S.screenShake, 6);
        try { audio.playF(this.char, 's'); } catch (e) {}
    }
    endRoll() {
        const x = this.sx;
        if (x && x.k === 'roll' && x.ph === 'roll') {
            const sp = spec(this.char, 'S'), c = x.c || 0;
            let rb = sp.rocketBkb != null ? sp.rocketBkb : 9.12, rk = sp.rocketKbg != null ? sp.rocketKbg : 0.684;
            const full = c >= 0.9, mid = c >= 0.4 && !full;
            if (full) { rb *= 0.7; rk *= 0.7; }   // blue end knockback 0.7×
            // white end 8; blue end 12 (1.5× white) — both drag then launch
            const endDmg = full ? 12 : (mid ? 8 : 0);
            // white/blue end KB aims where the user is pointing (mouse PC / joystick+matrix mobile)
            const aim = aimOf(this);
            let adx = aim.x - this.x, ady = aim.y - this.y;
            let alen = Math.hypot(adx, ady);
            if (alen < 8) { adx = this.facing || 1; ady = -0.25; alen = Math.hypot(adx, ady); }
            const aimAng = Math.atan2(ady, adx);
            for (const f of foesOf(this)) {
                if (f._rollCarry !== this) continue;
                f._rollCarry = null;
                if (endDmg) {
                    f.grounded = false;
                    launch(this, f, { damage: endDmg, bkb: rb * (1 + 0.7 * c), kbg: rk * (1 + 0.7 * c), angle: aimAng, x: this.x, y: this.y });
                } else {
                    // red: grey stun 0.5 s, no knockback
                    f.clashStunTimer = Math.max(f.clashStunTimer, 30);
                    f.vx *= 0.2; f.vy *= 0.2;
                    fx('hit', f.x, f.y, 6, -0.5);
                }
            }
            // white/blue: also hit anyone still overlapping even if not flagged carried
            if (endDmg) {
                const sz2 = lerpR(sp.w, c);
                for (const f of foesOf(this)) {
                    if (!isAlive(f) || f.invincibleTimer > 0) continue;
                    if (Math.abs(f.x - this.x) > sz2 / 2 + f.width / 2 + 10 || Math.abs(f.y - this.y) > sz2 / 2 + f.height / 2 + 10) continue;
                    if (f.lastHitBy === this && f.lastHitT < 3) continue;
                    f.grounded = false;
                    launch(this, f, { damage: endDmg, bkb: rb * (1 + 0.7 * c), kbg: rk * (1 + 0.7 * c), angle: aimAng, x: this.x, y: this.y });
                }
            }
        }
        if (this.sx && this.sx.k === 'roll') for (const f of fighters) if (f._rollCarry === this) f._rollCarry = null;
        this.sx = null; this.activeHitbox = null; this.activeMove = null;
        // 0.7 s halt: keep horizontal speed, decelerate (not an instant stop)
        this.haltT = 42;
        this.haltElapsed = 0;
        // the slide always covers 1/4 of the SMALL map (1520 / 4 = 380 px), whatever arena it is: pick the per-frame decay k so v*(1-k^42)/(1-k) = 380
        const v0 = Math.abs(this.vx), dir = this.vx < 0 ? -1 : 1, want = 380;
        let k = 1;
        if (v0 > 0.01 && v0 * 42 > want) {
            let lo = 0, hi = 0.9999;
            for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (v0 * (1 - Math.pow(m, 42)) / (1 - m) > want) ? (hi = m) : (lo = m); }
            k = (lo + hi) / 2;
        }
        this.haltV = v0 * dir; this.haltK = k;
        if (v0 > 0.01 && v0 * 42 <= want) this.haltK = 1;
    }

    startSx(k, charge = 0, extra = {}) {
        this.sx = { k, t: 0, c: Math.round(charge * 100) / 100, tx: null, ty: null, d: 1, ...extra };
        this.setMove(k === 'dash' ? 'BLINK' : k === 'pound' ? 'SPIRAL' : 'CORE', 6);
        this.specialKind = 'CORE'; this.specialT = 0; this.specialDur = 30;
        audio.playDash();
    }

    startPound(sp) {
        this.startSx('pound');
        if (sp.armor) this.armorT = sp.windup + 8;
        if (sp.atTarget) {
            const foe = nearestOf(this, foesOf(this));
            if (foe && Math.hypot(foe.x - this.x, foe.y - this.y) < 700) { this.sx.tx = foe.x; this.sx.ty = foe.y + 20 - sp.h / 2 + 30; fx('stomp', foe.x, foe.y + 34, STAGE.width * sp.w, 0, '@'); }
            else { this.sx.tx = this.x + this.facing * 170; this.sx.ty = this.y + this.height / 2 - sp.h / 2; }
        }
    }

    /** Tide's fast water bubble pops on contact; pressing Side-F again detonates it early. */
    startBubble(d, sp) {
        this.facing = d;
        orbs.push({
            x: this.x + d * 64, y: this.y - 12, vx: d * sp.speed, vy: 0, r: sp.r, charge: 0.3, owner: this, life: sp.life, color: '#7dd3fc', id: ++orbSerial,
            d: sp.popDmg, R: sp.R, bkb: sp.bkb, kbg: sp.kbg, grav: 0, curve: 0, wobble: 0, pull: 0, age: 0, kind: 'bubble', noKb: true, trap: false, cap: null, capT: 0,
        });
        this.setMove('CORE', 20);
        this.specialKind = 'CORE'; this.specialT = 0; this.specialDur = 20;
        audio.playDash();
        fx('core', this.x, this.y, 0.4, d > 0 ? 0 : Math.PI, 'water');
    }

    /** Up-F rocket: fly toward where you aim, steering as you go (mouse / stick) */
    startRocket(sp) {
        const aim = aimOf(this);
        let ang = Math.atan2(aim.y - this.y, aim.x - this.x);
        if (Math.sin(ang) > 0.3) ang = -ang;                                    // a recovery: never aimed down into the floor
        this.grounded = false; this.y -= 4;
        this.startSx('rocket', 0, { ang, hits: 0, charge: (sp.ghost || sp.jet) ? 0 : 36 });
        this.swingHitSet = new Set();
        if (sp.armor) this.armorT = sp.frames + 6;
        this.facing = Math.cos(ang) >= 0 ? 1 : -1;
        this.specialKind = 'SPIRAL'; this.specialDur = sp.frames + ((sp.ghost || sp.jet) ? 0 : 36);
        this.setMove('SPIRAL', sp.frames + ((sp.ghost || sp.jet) ? 0 : 36));
        fx('rocket', this.x, this.y, 0, 0, STYLE_OF[this.char]);
    }

    /** Volt's Lightning Rod: vanish and strike upward instantly, zapping and stunning everything along the bolt */
    /** Volt's Lightning Rod: blink a short way up, hang in the air for 0.3 s (the aim can still move), then strike to wherever the aim points */
    startBolt(sp) {
        if (this.char === 'volt') audio.playZap();
        const fx0 = this.x, fy0 = this.y;
        this.jumpsLeft = Math.max(0, this.jumpsLeft - 1);
        { const c = clipTeleport(this, fx0, fy0, fx0, fy0 - (sp.hop || 110)); this.x = c.x; this.y = c.y; }
        this.vx = this.vy = 0; this.grounded = false;
        this.startSx('bolt', 0, { ph: 'freeze', fz: sp.freeze || 18, left: (sp.strikes || 2) - 1 });
        this.invincibleTimer = Math.max(this.invincibleTimer, 10);
        const tot = (sp.freeze || 18) + 14 + ((sp.strikes || 2) - 1) * ((sp.freeze2 || 14) + 12); this.setMove('SPIRAL', tot); this.specialKind = 'SPIRAL'; this.specialDur = tot;
        for (let i = 1; i <= 4; i++) this.ghosts.push({ x: fx0, y: fy0 + (this.y - fy0) * i / 5, alpha: 0.8 - i * 0.12, color: '#fde047' });
        fx('blink', fx0, fy0, this.x, this.y); fx('gust', this.x, this.y, 90, 0, STYLE_OF[this.char]);
        audio.playHit(false);
    }
    /** the strike itself: instantly to the aim point (limited reach), zapping and stunning everything along the path */
    boltStrike(sp) {
        if (this.char === 'volt') audio.playZap();
        const aim = aimOf(this), fx0 = this.x, fy0 = this.y;
        let dx = aim.x - this.x, dy = aim.y - this.y; const d = Math.hypot(dx, dy) || 1, reach = Math.min(d, sp.dist2 || 480);
        dx = dx / d * Math.max(reach, 60); dy = dy / d * Math.max(reach, 60);
        { const tx = Math.min(WORLD.width - 20, Math.max(20, this.x + dx)), c = clipTeleport(this, fx0, fy0, tx, this.y + dy); this.x = c.x; this.y = c.y; dx = this.x - fx0; dy = this.y - fy0; }
        if (Math.abs(dx) > 8) this.facing = dx > 0 ? 1 : -1;
        { const len = Math.hypot(dx, dy) || 1; this.vx = dx / len * 3; this.vy = dy / len * 3; } this.grounded = false;
        this.invincibleTimer = Math.max(this.invincibleTimer, 10);
        this.swingHitSet = new Set();
        this.activeHitbox = { x: (fx0 + this.x) / 2, y: (fy0 + this.y) / 2, w: Math.abs(this.x - fx0) + sp.w, h: Math.abs(this.y - fy0) + sp.w, type: 'SPIRAL', ttl: 8, multi: true,
            damage: sp.dmg, bkb: 0, kbg: 0, angle: -1.5, stun: sp.stun, lift: 4 };
        this.setMove('SPIRAL', 12);
        for (let i = 1; i <= 6; i++) this.ghosts.push({ x: fx0 + (this.x - fx0) * i / 7, y: fy0 + (this.y - fy0) * i / 7, alpha: 0.8 - i * 0.09, color: '#fde047' });
        fx('blink', fx0, fy0, this.x, this.y); fx('gust', this.x, this.y, 120, 0, STYLE_OF[this.char]);
        zapTrails.push({ x1: fx0, y1: fy0, x2: this.x, y2: this.y, life: 24, owner: this, hit: new Set(), push: 24 }); fx('zigzag', fx0, fy0, this.x, this.y, 'volt');
        S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true);
    }

    /** Up-F eruption (attack only): a tall pillar erupts at your feet; you barely rise */
    startErupt(sp) {
        this.startSx('erupt');
        this.sx.tx = this.x; this.sx.ty = this.y + this.height / 2;          // always right below Tide, even high in the air
        this.setMove('SPIRAL', sp.windup + sp.rideFrames + 6);
        this.specialKind = 'SPIRAL'; this.specialDur = sp.windup + sp.rideFrames + 6;
        fx('pillar', this.x, this.y + this.height / 2, STAGE.width * sp.w, sp.h * 0.25, STYLE_OF[this.char] + '@');     // the warning swell under his feet
    }

    startDash(d, sp) {
        this.facing = d;
        this.startSx('dash', 0, { d });
        this.setMove('BLINK', sp.frames + 3);
        if (sp.armor) this.armorT = sp.frames + 6;
        this.attackKind = d > 0 ? 'SIDE_RIGHT' : 'SIDE_LEFT';
        this.attackTimer = ATTACK_FRAMES; this.attackSerial++;
        this.swing = SWING['SP_' + this.char + '_S'];
        this.swingHit = false;
        this.swingHitSet = this.swing.multi ? new Set() : null;
        this.vy = Math.min(this.vy, 0.5);
    }

    startBlink(d, sp = spec(this.char, 'S')) {
        if (this.char === 'volt') audio.playZap();
        this.facing = d;
        if (sp.windup && !this._wound) { this.sx = { k: 'wind', t: 0, c: 0, tx: null, ty: null, d }; this.vx = 0; audio.playDash(); return; }
        const fromX = this.x, fromY = this.y;
        let nx = this.x + d * sp.dist;
        if (sp.behind) {                                      // Shadow Step: appear behind the nearest foe
            const foe = nearestOf(this, foesOf(this));
            if (foe && Math.hypot(foe.x - this.x, foe.y - this.y) < (sp.near || 520)) {
                d = foe.x >= this.x ? 1 : -1; this.facing = d;
                nx = foe.x - d * 70; this.y = foe.y;
            }
        }
        this.x = Math.min(WORLD.width - 20, Math.max(20, nx));
        { const c = clipTeleport(this, fromX, fromY, this.x, this.y); this.x = c.x; this.y = c.y; }
        this.vy = Math.min(this.vy, 1.5);
        this.vx = d * 2;
        this.invincibleTimer = Math.max(this.invincibleTimer, 8);
        for (let i = 1; i <= 6; i++) {
            this.ghosts.push({ x: fromX + (this.x - fromX) * i / 7, y: fromY, alpha: 0.75 - i * 0.08, color: '#a78bfa' });
        }
        fx('blink', fromX, fromY, this.x, this.y);
        if (sp.trail) { zapTrails.push({ x1: fromX, y1: fromY, x2: this.x, y2: this.y, life: 24, owner: this, hit: new Set() }); fx('zigzag', fromX, fromY, this.x, this.y, 'volt'); }
        this.attackKind = d > 0 ? 'SIDE_RIGHT' : 'SIDE_LEFT';
        this.attackTimer = ATTACK_FRAMES;
        this.attackSerial++;
        this.swing = SWING[sp.swing] || SWING.BLINK;
        this.swingHit = false;
        this.setMove('BLINK', 18);
        if (this.char === 'umbra') this.cd.BLINK = 60;                // Shadow Step: Side F is tired for 1 s after the stab lands
        audio.playDash();
    }

    startSpiral(tx) {
        const sp = spec(this.char, 'U');
        this.jumpsLeft = Math.max(0, this.jumpsLeft - SPIRAL_JUMP_COST);   // recovery that costs a couple of jumps
        this.grounded = false;
        this.y -= 4;
        this.vy = -sp.vy;
        if (tx !== undefined && Math.abs(tx - this.x) > 20) this.facing = tx > this.x ? 1 : -1;
        this.spiralT = sp.frames;
        if (sp.armor) this.armorT = sp.frames;
        if (sp.inv) this.invincibleTimer = Math.max(this.invincibleTimer, sp.inv);
        this.specialKind = 'SPIRAL'; this.specialT = 0; this.specialDur = sp.frames;
        this.swordRide = !!sp.sword; this._swordHit = new Set(); this._carry = [];
        if (sp.kind === 'lift') {                             // no attack: a gust that only shoves, or a smoke vanish
            fx('gust', this.x, this.y, sp.gust || 90, 0, STYLE_OF[this.char]);
            if (sp.gust) for (const t of foesOf(this)) { const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy); if (d < sp.gust && t.invincibleTimer <= 0 && !t.armorT) { t.vx += (dx / (d || 1)) * 9; t.vy -= 4; t.grounded = false; } }
        }
        if (sp.start) {                                       // Rubble Launch: a blast under you throws foes away, then you rise
            const e = sp.start; this.swingHitSet = new Set();
            this.activeHitbox = { x: this.x, y: this.y + 20, w: e.R * 2, h: e.R * 1.6, type: 'SPIRAL', ttl: 6, multi: true, radial: true, damage: e.dmg, bkb: e.bkb, kbg: e.kbg, angle: -0.9 };
            fx('explosion', this.x, this.y + 30, e.R, 0.6, STYLE_OF[this.char]); fx('quake', this.x, this.y + this.height / 2, e.R * 2, 0, STYLE_OF[this.char] + '@');
            S.screenShake = Math.max(S.screenShake, 12);
        }
        this.setMove('SPIRAL', sp.frames);
        audio.playJump();
        fx('spiral', this.x, this.y);
    }

    /** Ground Down-F: dash forward like a grab; if it connects, carry the opponent up and slam them down. */
    startSuplex(tx) {
        if (tx !== undefined && Math.abs(tx - this.x) > 20) this.facing = tx > this.x ? 1 : -1;
        this.suplexPending = true;
        this.isGrabDashing = true;
        // homing: lock onto an opponent inside 0.45 of the stage length, otherwise it is a blank dash forward
        const foe = nearestOf(this, foesOf(this));
        const inRange = foe && Math.hypot(foe.x - this.x, foe.y - this.y) <= STAGE.width * SUPLEX_DETECT;
        this.suplexTarget = inRange ? foe : null;
        if (inRange) {
            this.facing = foe.x >= this.x ? 1 : -1;
            this.grabDashTimer = Math.min(50, Math.ceil(Math.abs(foe.x - this.x) / SUPLEX_SPEED) + 8);
        } else {
            this.grabDashTimer = 14;
        }
        this.vx = this.facing * SUPLEX_SPEED;
        this.vy = 0;
        this.setMove('GRAB', 14);                              // counters / is countered exactly like a grab
        audio.playDash();
    }
    beginSuplex(d) {
        this.suplexPending = false;
        this.isGrabDashing = false;
        this.grabDashTimer = 0;
        this.grabHolding = null;
        this.vx = 0; this.vy = 0;
        d.interrupt();
        d.isShielding = false;
        d.grabbedBy = this;
        d.hitstun = 90;
        this.suplexT = 1; this.suplexN = 0; this.suplexPhase = 'rise';
        this.suplexAng = 0;
        this.grabVictim = d;
        this.specialKind = 'SUPLEX'; this.specialT = 0; this.specialDur = 999;
        this.activeMove = null;
        audio.playGrab();
        fx('grab', d.x, d.y);
    }
    /** let go of anyone we are holding (called when the grabber is hit, interrupted or grabbed himself, so the victim is never left stuck to him) */
    releaseGrabHold() {
        const t = this.grabHolding;
        if (t) { this.grabHolding = null; if (t.grabbedBy === this) { t.grabbedBy = null; t.hitstun = Math.max(0, Math.min(t.hitstun, 10)); } }
    }
    releaseSuplexVictim() {
        const d = this.grabVictim;
        if (d && d.grabbedBy === this) { d.grabbedBy = null; d.hitstun = 10; }
        this.grabVictim = null;
        if (this.suplexT > 0) { this.specialKind = null; this.specialDur = 0; }
    }
    updateSuplex() {
        const d = this.grabVictim;
        if (!d || d.grabbedBy !== this) { this.endSuplex(); return; }
        this.suplexN++;
        // a backwards half backflip: hop up and back while rotating, the victim is carried round with you
        if (this.suplexPhase === 'rise') {
            const u = Math.min(1, this.suplexN / SUPLEX_RISE);
            this.vy = -13.5 * (1 - u * 0.6); this.vx = -this.facing * 3.2;
            this.suplexAng = Math.PI * 0.62 * u * u * (3 - 2 * u);
            this.x += this.vx; this.y += this.vy;
            if (this.y < TOP_LIMIT) {                          // reached the top of the map: cancel
                this.endSuplex();
                this.actionLock = Math.max(this.actionLock, 60);
                return;
            }
            if (this.suplexN >= SUPLEX_RISE) { this.suplexPhase = 'slam'; this.suplexN = 0; }
        } else {
            const u = Math.min(1, this.suplexN / 9);
            this.vy = Math.min(26, 6 + this.suplexN * 2.6); this.vx = -this.facing * 2.2;
            this.suplexAng = Math.PI * (0.62 + 0.38 * u);
            this.x += this.vx; this.y += this.vy;
            this.checkStageCollision();
            if (this.grounded) { this.suplexImpact(d); return; }
            if (this.suplexN > 45 || this.y > STAGE.y + 300) { this.endSuplex(); return; }   // never found the floor
        }
    }
    suplexImpact(d) {
        d.grabbedBy = null;
        this.grabVictim = null;
        this.suplexT = 0;
        this.specialKind = null; this.specialDur = 0;
        d.x = this.x - this.facing * 34;
        d.y = this.y;
        this.vx = 0; this.vy = 0;
        if (this.char === 'bulwark') this.clashStunTimer = Math.max(this.clashStunTimer, 45);       // ...and 0.75 s after the Suplex slam
        this.suplexAng = 0; this.landFlipT = 12;               // the backflip finishes with a quick landing roll
        fx('stomp', this.x, this.y + this.height / 2, STAGE.width / 8, 0, '@');
        S.screenShake = Math.max(S.screenShake, 16);
        launch(this, d, {
            damage: 14, bkb: 7, kbg: 0.7,
            angle: this.facing === 1 ? Math.PI + Math.PI / 3 : -Math.PI / 3,   // thrown up and behind
        });
    }
    endSuplex() {
        this.releaseSuplexVictim();
        this.suplexT = 0; this.suplexAng = 0;
        this.specialKind = null; this.specialDur = 0;
        this.vx = 0; this.vy = 0;
    }

    startHeadbutt() {
        const sp = spec(this.char, 'DA');
        this.diving = true;
        this.diveT = 0;
        this.diveHit = false;
        this.vx = sp.vx ? this.facing * sp.vx : 0;
        this.vy = sp.vy;
        this.specialKind = 'HEADBUTT'; this.specialT = 0; this.specialDur = 999;
        this.setMove('HEADBUTT', 3);
        audio.playDash();
    }

    // ------------------------------------------------------------ ledges
    checkLedgeMagnet() {
        if (this.grounded || this.isHanging || this.hitstun > 0 || this.ledgeBan > 0 || this.diving || this.sx) return;

        const leftLedgeX = STAGE.x;
        const rightLedgeX = STAGE.x + STAGE.width;
        const ledgeY = STAGE.y;

        // magnet × 1.4 vs previous size
        const magnetRangeX = 225 * 0.65 * 0.5 * 1.3 * 1.4;
        const magnetRangeY = 165 * 0.65 * 0.5 * 1.3 * 1.4;

        const trySide = (side) => {
            const lx = side < 0 ? leftLedgeX : rightLedgeX;
            const attachX = lx + side * 12;
            const attachY = ledgeY + 12;
            const inX = side < 0
                ? (this.x >= lx - magnetRangeX && this.x <= lx + 40)
                : (this.x >= lx - 40 && this.x <= lx + magnetRangeX);
            const inY = this.y >= ledgeY - 30 && this.y <= ledgeY + magnetRangeY && this.vy >= -4;
            if (!inX || !inY) return false;
            // soft stick to the lip (no fling): damp velocity, ease position, hang when close
            const dx = attachX - this.x, dy = attachY - this.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            this.vx *= 0.55; this.vy *= 0.4;
            this.x += dx * 0.22;
            this.y += dy * 0.22;
            this.vx += dx * 0.06;
            this.vy += dy * 0.05;
            // clamp residual so you never get yeeted past the stage
            this.vx = Math.max(-6, Math.min(6, this.vx));
            this.vy = Math.max(-5, Math.min(5, this.vy));
            this.grounded = false;
            if (dist < 36 || Math.hypot(attachX - this.x, attachY - this.y) < 22) this.hangLedge(side);
            return true;
        };
        if (!trySide(-1)) trySide(1);
    }

    /** leave the ledge: any remaining ledge invincibility is stripped immediately */
    leaveLedge() {
        if (!this.isHanging) return;
        this.isHanging = false;
        this.hangTimer = 0;
        this.invincibleTimer = 0;
        // after dropping off a ledge you can't re-grab for 1 s (stops AI ledge thrash / frame spikes)
        this.ledgeBan = Math.max(this.ledgeBan, 60);
    }

    hangLedge(side) {
        // one fighter per ledge: second arrival kicks the first off — unless the occupant still has ledge invinc (priority)
        for (const other of fighters) {
            if (other === this || !other.active || !other.isHanging || other.hangSide !== side) continue;
            if (other.invincibleTimer > 0) return;   // they keep the ledge during invinc
            other.kickFromLedge(KICK_BAN);
        }

        this.isHanging = true;
        this.hangSide = side;
        this.hangTimer = 0;
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.fActive = false; this.chargeFrames = 0;
        this.actionLock = 0;
        this.sx = null; this.activeMove = null; this.activeHitbox = null;

        this.jumpsLeft = this.maxJumps;
        this.canGrab = true;
        // 1.5 s ledge invinc (90 frames) — priority vs challengers while it lasts
        this.invincibleTimer = 90;
    }

    kickFromLedge(ban) {
        const side = this.hangSide;
        this.leaveLedge();
        this.ledgeBan = ban;
        this.vx = side * 5;
        this.vy = 3;
        this.grounded = false;
        // no fx / particles / sfx — laggy when AIs cycle ledges
    }

    checkStageCollision(bounce = false) {
        if (!STAGE.segs) return this._stageCollide(bounce);
        const x0 = STAGE.x, w0 = STAGE.width;                 // the split stage: collide with each solid piece in turn
        let on = false;                                       // standing on ANY piece counts (each piece's pass resets `grounded`, which wiped the landing from the piece before it)
        for (const q of STAGE.segs) { STAGE.x = q.l; STAGE.width = q.r - q.l; this._stageCollide(bounce); if (this.grounded) on = true; }
        this.grounded = on;
        STAGE.x = x0; STAGE.width = w0;
    }
    _stageCollide(bounce = false) {
        // Use actual frame motion (x - px) when vx/vy were zeroed by a special (rocket, dash, etc.)
        // so fast moves cannot tunnel through the stage or platforms.
        const mx = this.x - (this.px !== undefined ? this.px : this.x);
        const my = this.y - (this.py !== undefined ? this.py : this.y);
        const vx0 = Math.abs(this.vx) > 0.01 ? this.vx : mx;
        const vy0 = Math.abs(this.vy) > 0.01 ? this.vy : my;
        const BOUNCE = 1.0;                                       // a ragdolled fighter's velocity is reflected straight back off the stage
        const TANGENT = 1.0, MIN_BOUNCE = 3.2;
        const platLeft = STAGE.x;
        const platRight = STAGE.x + STAGE.width;
        const platTop = STAGE.y;
        const platBottom = STAGE.y + STAGE.height;

        const fLeft = this.x - this.width / 2;
        const fRight = this.x + this.width / 2;
        const fTop = this.y - this.height / 2;
        const fBottom = this.y + this.height / 2;
        const prevBottom = (this.py !== undefined ? this.py : this.y) + this.height / 2;
        const prevTop = (this.py !== undefined ? this.py : this.y) - this.height / 2;
        const prevLeft = (this.px !== undefined ? this.px : this.x) - this.width / 2;
        const prevRight = (this.px !== undefined ? this.px : this.x) + this.width / 2;

        // (the 0.5 tolerance keeps a fighter standing exactly on the surface "grounded" every
        //  frame; the strict comparison used to flicker grounded on/off, which made rolls and
        //  ground-only moves fail about half of the time)
        if (fRight > platLeft && fLeft < platRight && fBottom > platTop - 0.5 && fTop < platBottom) {
            const overlapLeft = fRight - platLeft;
            const overlapRight = platRight - fLeft;
            const overlapTop = fBottom - platTop;
            const overlapBottom = platBottom - fTop;

            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            // Prefer the axis we were moving along; otherwise smaller overlap
            const preferY = Math.abs(vy0) >= Math.abs(vx0) * 0.85 || minOverlapY <= minOverlapX + 0.5;

            if (preferY && minOverlapY <= minOverlapX + 2) {
                // Landing / ceiling: use motion direction, not raw vy (rocket zeros vy)
                const goingDown = vy0 >= -0.01 || prevBottom <= platTop + 2;
                const goingUp = vy0 < -0.01 || prevTop >= platBottom - 2;
                if (goingDown && overlapTop <= overlapBottom + 1) {
                    this.y = platTop - this.height / 2;
                    if (bounce && vy0 > MIN_BOUNCE) {
                        this.vy = -vy0 * BOUNCE;
                        this.vx = vx0 * TANGENT;
                        this.grounded = false;
                        fx('hit', this.x, platTop, Math.min(16, vy0 * 0.6), -Math.PI / 2);
                        S.screenShake = Math.max(S.screenShake, Math.min(10, vy0 * 0.4));
                        return;
                    }
                    this.vy = 0;
                    if (bounce) this.vx *= this.bounceReflectT > 0 ? 0.98 : 0.35;
                    this.grounded = true;
                    this.jumpsLeft = this.maxJumps;
                    this.canGrab = true;
                    this.leaveLedge();
                    this.airSpecials = 0;
                    // stop a rocket / similar special from driving further into the floor
                    if (this.sx && this.sx.k === 'rocket') {
                        this.sx.ang = Math.atan2(Math.min(0, Math.sin(this.sx.ang)), Math.cos(this.sx.ang));
                    }
                } else if (goingUp || overlapBottom < overlapTop) {
                    this.y = platBottom + this.height / 2;
                    this.vy = bounce ? Math.abs(vy0) * BOUNCE : 0;
                    if (this.sx && this.sx.k === 'rocket') {
                        this.sx.ang = Math.atan2(Math.max(0, Math.sin(this.sx.ang)), Math.cos(this.sx.ang));
                    }
                }
            } else {
                if (overlapLeft < overlapRight) {
                    this.x = platLeft - this.width / 2;
                } else {
                    this.x = platRight + this.width / 2;
                }
                this.vx = bounce ? -vx0 * BOUNCE : 0;
                if (bounce && Math.abs(vx0) > MIN_BOUNCE) fx('hit', this.x, this.y, Math.min(16, Math.abs(vx0) * 0.6), vx0 > 0 ? Math.PI : 0);
                if (this.sx && this.sx.k === 'rocket') {
                    this.sx.ang = Math.atan2(Math.sin(this.sx.ang), -Math.cos(this.sx.ang));
                }
            }
        } else {
            this.grounded = false;
        }

        // Soft platforms (Frontier / custom arena): land when the swept body crosses the top
        // from above. No "bottom < pl.y + 60" cap — that let rockets tunnel through.
        if (!this.grounded && STAGE.platforms.length && this.dropT <= 0 && vy0 >= -0.01) {
            for (const pl of STAGE.platforms) {
                const halfW = this.width / 2;
                if (this.x + halfW <= pl.x || this.x - halfW >= pl.x + pl.w) continue;
                // swept crossing of the platform surface this frame (or standing on it)
                const crossed = prevBottom <= pl.y + 3 && fBottom >= pl.y - 0.5;
                const resting = Math.abs(fBottom - pl.y) <= 1.5 && vy0 >= -0.01;
                if (crossed || resting) {
                    this.y = pl.y - this.height / 2;
                    if (bounce && vy0 > MIN_BOUNCE) {
                        this.vy = -vy0 * BOUNCE; this.vx = vx0 * TANGENT;
                        fx('hit', this.x, pl.y, Math.min(16, vy0 * 0.6), -Math.PI / 2);
                        break;
                    }
                    this.vy = 0;
                    if (bounce) this.vx *= this.bounceReflectT > 0 ? 0.98 : 0.35;
                    this.grounded = true;
                    this.jumpsLeft = this.maxJumps;
                    this.canGrab = true;
                    this.leaveLedge();
                    this.airSpecials = 0;
                    if (this.sx && this.sx.k === 'rocket') {
                        this.sx.ang = Math.atan2(Math.min(0, Math.sin(this.sx.ang)), Math.cos(this.sx.ang));
                    }
                    break;
                }
            }
        }

        // Solid inverted-triangle keel under the stage (matches the 3D crystal under the map)
        {
            const keelTop = STAGE.y + STAGE.height;
            const keelH = 320;
            const keelBot = keelTop + keelH;
            const cx = STAGE.x + STAGE.width / 2;
            const halfTop = STAGE.width * 0.48;
            const fL = this.x - this.width / 2, fR = this.x + this.width / 2;
            const fT = this.y - this.height / 2, fB = this.y + this.height / 2;
            if (fB > keelTop + 0.5 && fT < keelBot) {
                // sample half-width at the fighter's vertical centre (tapered triangle)
                const midY = Math.max(keelTop, Math.min(keelBot, this.y));
                const t = (midY - keelTop) / keelH;
                const half = halfTop * Math.max(0, 1 - t);
                const left = cx - half, right = cx + half;
                if (fR > left && fL < right) {
                    // push out to the nearer sloping side
                    const toL = fR - left, toR = right - fL;
                    if (toL < toR) {
                        this.x = left - this.width / 2;
                        if (this.vx > 0) this.vx = bounce ? -Math.abs(vx0) * BOUNCE : 0;
                    } else {
                        this.x = right + this.width / 2;
                        if (this.vx < 0) this.vx = bounce ? Math.abs(vx0) * BOUNCE : 0;
                    }
                    // upward into the keel from below: bounce down a bit
                    if (vy0 < 0 && fT < keelBot && this.y > keelTop + keelH * 0.5) {
                        this.vy = bounce ? Math.abs(vy0) * BOUNCE : Math.max(this.vy, 0);
                    }
                    if (this.sx && this.sx.k === 'rocket') {
                        // deflect rocket away from centre
                        const away = this.x < cx ? Math.PI : 0;
                        this.sx.ang = away * 0.35 + this.sx.ang * 0.65;
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------ moves
    /** Roll: ONLY while shielding (hold E + scroll wheel), 2 s cooldown, never over the void. */
    executeRoll(force = false, dirOverride = 0) {
        // static training bot never acts — including rolls
        if (this.isAI && (this.level === 'static' || (S.gameMode === 'training' && (!S.train || !S.train.botType || S.train.botType === 'static')))) return false;
        if (!this.grounded || this.hitstun > 0 || this.dizzyTimer > 0 || this.clashStunTimer > 0 || this.isRolling ||
            this.freezeTimer > 0 || this.suplexT > 0 || this.diving || this.spiralT > 0 || this.sx || this.grabbedBy || this.grabHolding) return false;
        if (this.rollCooldown > 0) return false;
        if (!force && !this.isShielding) return false;

        this.isShielding = false;
        this.cancelF();

        let rollDir = this.facing;
        if (dirOverride) rollDir = dirOverride;
        else if (Math.abs(mouse.worldX - this.x) > 10) rollDir = mouse.worldX > this.x ? 1 : -1;

        this.facing = rollDir;
        this.isRolling = true;
        this.rollTotal = ROLL_FRAMES;
        this.rollTimer = ROLL_FRAMES;
        this.rollCooldown = ROLL_COOLDOWN;
        this.actionLock = trainLock();
        this.rollVx = rollDir * (ROLL_DISTANCE / ROLL_FRAMES);

        audio.playDash();
        createParticles(this.x, this.y, '#38bdf8', 12);
        return true;
    }

    jump() {
        if (this.buryT > 0) { this._wantOut = true; return false; }          // jumping while buried in a whirlpool = getting out of it
        if (this.hitstun > 0 || this.isShielding || this.dizzyTimer > 0 || this.clashStunTimer > 0 || this.grabbedBy || this.grabHolding || this.isRolling) return false;
        if (this.freezeTimer > 0 || this.suplexT > 0 || this.diving || this.spiralT > 0) return false;
        // rolling: jump WITH the ball (same height); cancel only after 0.6 s — does not extend roll life
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'roll') {
            if (this.sx.jumpCancelT > 0) return false;          // already mid jump-cancel
            if (this.actionLock > JUMP_OK) return false;
            let did = false;
            if (this.grounded) {
                this.vy = -15.2; this.grounded = false; this.jumpsLeft = Math.max(0, this.jumpsLeft - 1); did = true;
            } else if (this.jumpsLeft > 0) {
                this.vy = -13.5; this.jumpsLeft--; did = true;
            }
            if (!did) return false;
            this.sx.jumpCancelT = 36;                           // 0.6 s then endRoll (life timer still runs)
            audio.playJump();
            createParticles(this.x, this.y + this.height / 2, '#fb923c', 10);
            return true;
        }
        if (this.sx) return false;                              // other specials still lock jump
        // post-roll halt: can jump only after 0.4 s into the 0.7 s slowdown
        if (this.haltT > 0 && this.haltElapsed < 24) return false;
        if (this.actionLock > JUMP_OK) return false;

        if (this.isHanging) {
            // only jump gets you off; blocked for the first 0.6 s on the ledge
            if (this.hangTimer < 36) return false;
            const side = this.hangSide;
            this.leaveLedge();
            this.vy = -14.5;
            this.vx = -side * 9;
            this.jumpsLeft = this.maxJumps;
            this.canGrab = true;
            audio.playJump();
            createParticles(this.x, this.y, '#38bdf8', 10);
            return true;
        }

        if (this.grounded) {
            this.vy = -15.2;
            this.grounded = false;
            this.jumpsLeft--;
            audio.playJump();
            createParticles(this.x, this.y + this.height/2, '#38bdf8', 8);
        } else if (this.jumpsLeft > 0) {
            this.vy = -13.5;
            this.jumpsLeft--;
            audio.playJump();
            createParticles(this.x, this.y + this.height/2, '#06b6d4', 10);
        }
        else return false;
        return true;
    }

    executeGrabDash(targetWorldX, targetWorldY) {
        if (this.heldItem && !this.actionBlocked()) return throwHeldItem(this, targetWorldX, targetWorldY);   // aimed grab with an item = throw it
        if (!this.canGrab || this.actionBlocked()) return false;

        const dx = targetWorldX - this.x;
        const dy = targetWorldY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return false;

        this.canGrab = false;
        this.actionLock = trainLock();

        const grabDashSpeed = 23;
        this.vx = (dx / dist) * grabDashSpeed;
        this.vy = (dy / dist) * grabDashSpeed;

        this.isGrabDashing = true;
        this.grabDashTimer = 16;
        this.setMove('GRAB', 16);
        audio.playDash();
        return true;
    }


    /** The "J" attack (now on right click / the aim-matrix attack). The hitbox follows the animation. */
    attack(aimDirection, hold = false) {
        if (this.isHanging) return false;    // ledge: jump only
        if (this.char === 'bulwark' && this.swordRide && this.spiralT > 0) { this._swordRemain = this.spiralT; this.swordGroundCd = true; this.spiralT = 0; this.endSpiral(); this.specialKind = null; this.specialDur = 0; this.actionLock = 18; this.vy *= 0.3; return true; }   // melee hops off the floating sword
        if (this.attackTimer > 0 || this.actionBlocked()) return false;
        if (this.char === 'bulwark' && !['UP', 'DOWN', 'SIDE_LEFT', 'SIDE_RIGHT'].includes(aimDirection)) return this.startRiposte();
        if (this.char === 'terra' && !['UP', 'DOWN', 'SIDE_LEFT', 'SIDE_RIGHT'].includes(aimDirection)) return this.throwRock();      // Terra's neutral melee throws a rock

        if (this.char === 'ember') {                       // cluster bomb: Neutral melee throws 3 bubbles (2 throws per prime); Side / Up / Down melee detonates every live bubble
            const neutral = !['UP', 'DOWN', 'SIDE_LEFT', 'SIDE_RIGHT'].includes(aimDirection);
            if (neutral && this.bombShots > 0) return this.throwBombs();
            if (!neutral) {
                const live = orbs.filter(o => o && o.owner === this && o.kind === 'bomb');
                if (live.length) { for (const o of live) bombBurst(o); this.actionLock = Math.max(this.actionLock, 14); return true; }
            }
        }
        let kind = 'JAB';
        switch (aimDirection) {
            case 'UP': kind = 'UP'; break;
            case 'DOWN': kind = 'DOWN'; break;
            case 'SIDE_LEFT': kind = 'SIDE_LEFT'; this.facing = -1; break;
            case 'SIDE_RIGHT': kind = 'SIDE_RIGHT'; this.facing = 1; break;
        }
        if (kind === 'JAB' && this.char === 'tide') return enterWhirl(this);                  // Tide's neutral melee only dives into his own whirlpool
        this.attackKind = kind;
        this.attackSerial++;
        this.attackTimer = ATTACK_FRAMES;
        this.swing = (kind === 'JAB' && (this.char === 'luminent' || this.char === 'umbra' || this.char === 'volt')) ? SWING.JABR : SWING[kind];
        this.swingHit = false;
        if (kind === 'JAB' && this.char === 'zephyr') { spawnWind(this); this.swingHit = true; }   // Zephyr's neutral only sends out the wind tube: no hitbox
        this.swingHitSet = this.swing.multi ? new Set() : null;
        this.attackHeld = !!(hold && this.swing.chargeable);
        this.meleeCharge = 0;
        this.activeHitbox = null;
        this.actionLock = lk(this, trainLock()) + (this.heldItem && this.heldItem.type === 'FIRESTICK' ? 12 : 0);   // firestick: 0.2 s more aftermath
        audio.playHit(false);
        return true;
    }
    /** Bulwark's neutral melee: a sword uppercut counter. 0.7 s open window, 0.7 s aftermath if nothing came, then a 1 s cooldown */
    startRiposte() {
        if (this.riposteCd > 0 || this.riposteT > 0 || this.riposteAfter > 0 || this.stabT > 0) return false;
        this.riposteT = 42; this.actionLock = Math.max(this.actionLock, 84); this.activeMove = { type: 'RIPOSTE', t: 2 };
        this.vx *= 0.3; audio.playHit(false); fx('spiral', this.x, this.y); createParticles(this.x, this.y - 10, '#e2e8f0', 6);
        return true;
    }
    tickRiposte() {
        if (this.riposteT > 0) {
            this.riposteT--; this.activeMove = { type: 'RIPOSTE', t: 2 };
            if (this.riposteT === 0) this.riposteAfter = 42;                    // nothing came: 0.7 s of aftermath
        } else if (this.riposteAfter > 0) {
            if (--this.riposteAfter === 0) this.riposteCd = 60;
        } else if (this.stabT > 0) {
            const v = this._stabVictim;
            this.vx = 0; this.vy = 0; this.invincibleTimer = Math.max(this.invincibleTimer, 3);
            if (v && isAlive(v)) { v.vx = 0; v.vy = 0; v.hitstun = Math.max(v.hitstun, 4); v.invincibleTimer = Math.max(v.invincibleTimer, 3); v.x += (this.x + this.facing * 40 - v.x) * 0.3; pushOutOfStage(v, v.x, v.y); }
            if (this.stabT === 45 && v) { createParticles(v.x, v.y - 6, '#dc2626', 16); fx('hit', v.x, v.y, 14, this.facing > 0 ? 0 : Math.PI); S.screenShake = Math.max(S.screenShake, 10); audio.playHit(true); }
            if (--this.stabT === 0) {                       // the kick: Bulwark boots the foe off the sword; they fall on their back for 1 s (i-frames until 0.2 s after)
                if (v && isAlive(v)) {
                    v.facing = this.facing; v.vx = this.facing * 4; v.vy = -3; v.grounded = false; v.hitstun = 60; v.backT = 60; v.invincibleTimer = Math.max(v.invincibleTimer, 74);
                    fx('hit', v.x, v.y, 12, this.facing > 0 ? 0 : Math.PI); createParticles(v.x, v.y, '#e2e8f0', 10); S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true);
                }
                this._stabVictim = null;
            }
        } else if (this.riposteCd > 0) this.riposteCd--;
    }
    /** Ember's cluster bomb: three sticky fire bubbles (middle one on the aim, two 22 degrees either side) */
    throwBombs() {
        const aim = aimOf(this); const a0 = Math.atan2(aim.y - this.y, aim.x - this.x);
        if (Math.cos(a0) !== 0) this.facing = Math.cos(a0) >= 0 ? 1 : -1;
        for (const da of [-22, 0, 22]) {
            const a = a0 + da * Math.PI / 180;
            orbs.push({ x: this.x + Math.cos(a) * 60, y: this.y + Math.sin(a) * 60, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, r: this.height * 0.65 * 1.2, charge: 0.3, owner: this, life: 180, color: '#fb923c', id: ++orbSerial,
                d: 2, R: this.height * 1.75 * 1.25, bkb: 9.6 * 0.3, kbg: 0.72 * 0.3, grav: 0, curve: 0, wobble: 0, pull: 0, age: 0, kind: 'bomb', stuck: false, flat: true });
        }
        this.bombShots--; this.bombPrimed = this.bombShots > 0;
        { const V0 = 31, N = 10; this.recoilT = N; this.recoilX = -Math.cos(a0) * V0; this.recoilY = -Math.sin(a0) * V0; if (this.recoilY > 0 && this.grounded) this.recoilY = 0; }   // recoil: a quick backwards dash that decays (about 210 px in all)
        this.actionLock = Math.max(this.actionLock, 20); this.throwFxT = 14; audio.playThrow(); fx('explosion', this.x + Math.cos(a0) * 30, this.y + Math.sin(a0) * 30, 36, 0.2, STYLE_OF[this.char]);
        return true;
    }
    /** Terra's neutral melee: a rock thrown as fast as the ball (and pulled down by gravity the same way), ball-sized, 5 damage and half the ball's knockback */
    throwRock() {
        if (this.rockT > 0) return false;
        const aim = aimOf(this); let dx = aim.x - this.x, dy = aim.y - this.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        if (Math.abs(dx) > 0.15) this.facing = dx > 0 ? 1 : -1;
        orbs.push({ x: this.x + dx * 40, y: this.y + dy * 40 - 4, vx: dx * 19, vy: dy * 19, r: 24, charge: 0.1, owner: this, life: 200, color: '#a8a29e', id: ++orbSerial,
            d: 5, R: 45, bkb: 4, kbg: 0.45, grav: WORLD.gravity * 0.55 * 0.85, curve: 0, wobble: 0, pull: 0, age: 0, kind: 'boulder' });
        this.rockT = 60; this.actionLock = Math.max(this.actionLock, 18); this.throwFxT = 14;
        audio.playThrow();
        return true;
    }
    /** melee button released: a charging swing is let go */
    releaseAttack() { this.attackHeld = false; }

    /** drop (and destroy) whatever item is in hand */
    dropHeld() {
        if (this.heldItem) { this.heldItem.st = 'dead'; this.heldItem.holder = null; }
        this.heldItem = null; this.heldId = 0;
    }

    takeKO() {
        if (S.gameMode === 'training') {                      // training: infinite stocks for everyone, nobody wins or loses
            audio.playKO(); createExplosion(this.x, this.y); fx('ko', this.x, this.y);
            this.stocks = 3; this.lastHitBy = null; this.lastHitT = 9999;
            this.reset(false);
            return;
        }

        { const k = this.lastHitBy; S.lastKO = { att: k && k !== this && this.lastHitT < 360 ? idxOf(k) : -1, def: idxOf(this) }; }      // the replay camera follows these two
        if (S.online !== 'guest' && !S.demo) captureKill(this);
        if (this === viewerFighter() && !S.demo) {                          // "why did I die": one line about the last hit that got through
            const h = this._lastHit;
            notify(h && h.by && h.by !== this && this.lastHitT < 360
                ? `KO'd by ${h.by.name || 'a foe'} (${h.by.char}) with ${MOVE_NAMES[h.type] || String(h.type).toLowerCase()} at ${Math.round(this.damage)}%${h.combo >= 3 ? ` · hit ${h.combo} of a combo` : ''}`
                : `You fell out at ${Math.round(this.damage)}%`);
        }
        const timerMode = !!(S.match && S.match.mode === 'timer' && !S.sudden);
        if (!timerMode) this.stocks--;
        this.deaths++;
        if (S.online !== 'guest') {                         // kill credit: whoever hit this fighter in the last 6 s (self-KO costs a point)
            const k = this.lastHitBy;
            if (k && k !== this && this.lastHitT < 360) k.kills++; else if (timerMode) this.kills = Math.max(-99, this.kills - 1);
        }
        this.lastHitBy = null; this.lastHitT = 9999;
        audio.playKO();
        createExplosion(this.x, this.y);
        fx('ko', this.x, this.y);

        if (S.online === 'host') outbox.push({ k: 'b', e: [this.x, this.y] });
        koBeams.push({
            startX: this.x,
            startY: this.y,
            targetX: STAGE.x + STAGE.width / 2,
            targetY: STAGE.y,
            alpha: 1.0,
            width: 32
        });

        if (timerMode) { this.reset(false); return; }      // timer match: nobody is ever eliminated
        if (this.stocks <= 0 && S.match) {                 // custom match: out of the game, the match may be over
            this.out = true; this.vx = 0; this.vy = 0; this.isShielding = false; this.fActive = false;
            if (S.online !== 'guest') checkMatchEnd();
            return;
        }
        if (this.stocks <= 0) {
            saveBotMemory();
            if (S.online === 'host') {                       // human vs human: the other fighter wins
                const winner = this === p1 ? p2 : p1;
                triggerDramaticZoom(winner);
                S.iWon = S.online === 'host' ? winner === p1 : winner === p2;
                endGame(winner === p1 ? 'YOU WIN!' : 'YOU LOSE!', winner === p1 ? 'host' : 'guest');
                return;
            }
            triggerDramaticZoom(this.isAI ? p1 : p2);
            endGame(this.isAI ? "PLAYER 1 WINS!" : "AI BOT WINS!");
        } else {
            this.reset(false);
        }
    }
}

// ============================================================================
//  BOT
//  The bot uses exactly the same move rules as the player (lock, cooldowns, air limit).
//  It also *trains*: it watches which moves you use, remembers that (saved in the browser
//  between matches) and shifts its choices to beat your habits.
// ============================================================================
const BOT_MEM_KEY = 'luminary.botMemory.v1';
const botMem = (() => {
    try { return JSON.parse(localStorage.getItem(BOT_MEM_KEY)) || {}; } catch (e) { return {}; }
})();
function saveBotMemory() { try { localStorage.setItem(BOT_MEM_KEY, JSON.stringify(botMem)); } catch (e) { /* storage unavailable */ } }
/** per difficulty: how well each character's special moves worked for the bots ("char:slot" -> {use, hit}); starts from the self-play priors */
export const aiStats = { easy: {}, medium: {}, hard: {} };
for (const lv of Object.keys(aiStats)) for (const k of Object.keys((AI_PRIOR && AI_PRIOR[lv]) || {})) aiStats[lv][k] = { ...AI_PRIOR[lv][k] };
const aiRate = (lv, key) => { const e = aiStats[lv] && aiStats[lv][key]; return e ? (e.hit + 1) / (e.use + 2) : 0.5; };
const MEM_KEYS = ['SHIELD', 'J', 'GRAB', 'CORE', 'BLINK', 'SPIRAL', 'SUPLEX', 'HEADBUTT'];
/** how often the player uses `k` (0..1, smoothed so a short history can't be extreme) */
function habitOf(k) {
    let total = 0;
    for (const m of MEM_KEYS) total += botMem[m] || 0;
    return ((botMem[k] || 0) + 1) / (total + MEM_KEYS.length);
}

class AIBot extends Fighter {
    constructor(x, y, color, name) {
        super(x, y, color, name, true);
        this.actionTimer = 0;
        this.shieldHold = 0;
        this.lastSeen = null;
        this.memSaveT = 0;
        this.diff = null;                       // 'easy' | 'medium' | 'hard' | 'expert' | 'master' | 'apex' per bot
        this.mod = '';                          // bot style: 'rusher' | 'zoner' | 'turtle' | 'trickster'
    }

    get skill() { return SKILL[this.diff] || 1; }

    get level() {
        if (this.diff) return SKILL[this.diff] ? 'hard' : this.diff;           // Expert / Master / Apex play the hard-bot brain, faster and tougher
        // training static dummy must never be treated as hard (that enabled counter-rolls)
        if (S.gameMode === 'training') return (S.train && S.train.botType && S.train.botType !== 'static') ? S.train.botType : 'static';
        return S.gameMode === 'easy' ? 'easy' : S.gameMode === 'medium' ? 'medium' : 'hard';
    }

    /** watch the player (learn their habits) */
    observe(target) {
        const m = target.isShielding ? 'SHIELD' : (target.activeMove ? target.activeMove.type : null);
        if (m && m !== this.lastSeen && MEM_KEYS.includes(m)) botMem[m] = (botMem[m] || 0) + 1;
        this.lastSeen = m;
        if (++this.memSaveT >= 600) { this.memSaveT = 0; saveBotMemory(); }
    }

    raiseShield(frames) { this.shieldHold = frames; }

    beginCore(target, frames) {
        if (!this.canStartF('NEUTRAL')) return false;
        this.fActive = true; this.fNeutral = true; this.fDirPress = 'NEUTRAL';
        this.chargeFrames = 0; this.aiChargeGoal = frames;
        this.facing = target.x >= this.x ? 1 : -1;
        return true;
    }

    /** how much this bot has practised the kill barrier. Easy: 1 attempt. Apex: 50. */
    barrierPractice() {
        const lv = this.diff || this.level;
        return { easy: 1, medium: 10, hard: 22, expert: 32, master: 41, apex: 50 }[lv] || 1;
    }
    /** steer out of the kill box. Returns true when this frame is spent surviving (skip the fight). */
    respectBarrier() {
        const sk = this.barrierPractice() / 50;
        const B = BLAST_ZONES, sudden = !!S.sudden;
        const padX = 24 + sk * (sudden ? 420 : 150);
        const padY = 24 + sk * (sudden ? 300 : 110);
        const dl = this.x - B.left, dr = B.right - this.x, dt = this.y - B.top, db = B.bottom - this.y;
        const room = Math.min(dl, dr, dt, db);
        if (room > Math.max(padX, padY)) return false;
        const cx = Math.max(B.left + 50, Math.min(B.right - 50, STAGE.x + STAGE.width / 2));
        const ty = Math.max(B.top + 50, Math.min(STAGE.y - 20, B.bottom - 60));
        const dir = cx >= this.x ? 1 : -1;
        this.facing = dir;
        this.cancelF();
        this.vx += dir * (0.9 + sk * 2.6);
        const off = this.y > STAGE.y + 6 || this.x < STAGE.x || this.x > STAGE.x + STAGE.width || db < padY || dt < padY * 0.55;
        if (!off) return false;
        if (this.jumpsLeft > 0 && this.vy > -4 && Math.random() < 0.3 + sk * 0.7) this.jump();
        if (this.actionTimer % (sk > 0.5 ? 2 : 7) === 0) {
            if (this.cd.SPIRAL <= 0) this.useSpecial('SPIRAL', cx, ty);
            else if (this.cd.BLINK <= 0 && sk > 0.12) this.useSpecial('BLINK', cx, ty);
        }
        return true;
    }
    /** a recovery decision for when the bot is off the stage */
    recover() {
        const B = BLAST_ZONES;
        const inset = 48 + (this.barrierPractice() / 50) * (S.sudden ? 190 : 36);
        const safeL = Math.max(STAGE.x + 50, B.left + inset), safeR = Math.min(STAGE.x + STAGE.width - 50, B.right - inset);
        const cx = safeL < safeR ? (safeL + safeR) / 2 : (B.left + B.right) / 2;
        const belowMap = this.y > STAGE.y + 8;
        const offL = this.x < STAGE.x - 20, offR = this.x > STAGE.x + STAGE.width + 20;
        // Prefer landing ON the stage top (not only the ledge). Below map → full priority stage.
        let tx, ty;
        if (belowMap) {
            if (offL) tx = Math.max(safeL, STAGE.x + 140);
            else if (offR) tx = Math.min(safeR, STAGE.x + STAGE.width - 140);
            else {                                                  // UNDER the stage: use a ledge only because the solid floor blocks a direct climb.
                // Pick the reachable lip using both horizontal distance and vertical route distance.
                const leftX = Math.max(B.left + 70, STAGE.x - 90), rightX = Math.min(B.right - 70, STAGE.x + STAGE.width + 90);
                const routeCost = (x) => Math.hypot(this.x - x, (this.y - (STAGE.y + 60)) * 0.65);
                const side = routeCost(leftX) <= routeCost(rightX) ? -1 : 1;
                tx = side < 0 ? leftX : rightX;
                ty = Math.min(B.bottom - 80, STAGE.y + 60);           // get outside the platform first, then climb to the top
            }
            if (offL || offR) ty = Math.max(B.top + 40, STAGE.y - 90);
            else ty = Math.min(B.bottom - 80, STAGE.y + 60);
        } else if (offL || offR) {
            // above stage height but off side: drift to center / stage top
            tx = cx;
            ty = STAGE.y - 110;
        } else {
            tx = cx; ty = STAGE.y - 90;
        }
        // Keep the stage interior as the first recovery target. Underneath the stage,
        // the earlier branch chooses the nearer lip using the bot's X and Y route.
        const dir = tx > this.x ? 1 : -1;
        const dxAbs = Math.abs(tx - this.x);
        const below = this.y - STAGE.y;
        const hard = this.level === 'hard';
        const med = this.level === 'medium';

        this.cancelF();
        this.facing = dir;
        this.vx += dir * (hard ? 2.1 : med ? 1.7 : 1.35);
        // climb bias when under the stage
        const underStage = belowMap && !offL && !offR;
        if (underStage) this.vx += dir * (hard ? 1.2 : 0.8);          // swim out sideways, stronger than the usual nudge
        // (no free upward push: it cancelled gravity and let bots hover beside the ledge, frozen and wobbling. Recovery is jumps + the Up special only.)

        // light dodge vs incoming projectiles while recovering (stage return still primary)
        const threat = orbs.find(o => o.owner && foesOf(this).includes(o.owner) && Math.hypot(o.x - this.x, o.y - this.y) < 160);
        if (threat && this.actionTimer % 3 === 0) {
            this.vx += (this.x < threat.x ? -1.2 : 1.2);
            if (this.jumpsLeft > 0 && this.vy > 0 && Math.random() < 0.4) this.jump();
        }

        let acted = false;
        // Up-F toward stage surface (not only ledge)
        if (this.actionTimer % 2 === 0 && (belowMap || this.jumpsLeft === 0 || offL || offR) && dxAbs < 520) {
            acted = this.useSpecial('SPIRAL', tx, ty);
        }
        if (!acted && hard && this.char === 'ember' && this.actionTimer % 5 === 0 && dxAbs > 50 && this.cd.BLINK <= 0) {
            acted = this.useSpecial('BLINK', tx, ty, 0.35);
        }
        if (!acted && this.actionTimer % 5 === 0 && dxAbs > 100 && below < 340) {
            acted = this.useSpecial('BLINK', tx, ty);
        }
        if (!acted && this.actionTimer % 6 === 0) acted = this.executeGrabDash(tx, ty);
        if (this.jumpsLeft > 0 && this.vy > -3 && this.actionTimer % 3 === 0) this.jump();
    }

    /** Soft-platform know-how for the big arenas: drop through a platform to reach a foe below, climb up to one to reach a foe above. Returns true when it took the frame. */
    platformNav(target, dx, dy) {
        const lv = this.level, halfW = this.width / 2, bottom = this.y + this.height / 2;
        const p = (lv === 'easy' ? 0.35 : lv === 'medium' ? 0.7 : 1);
        if (this.grounded) {
            const pl = STAGE.platforms.find(q => Math.abs(bottom - q.y) <= 3 && this.x + halfW > q.x && this.x - halfW < q.x + q.w);
            if (pl && dy > 110 && this.actionTimer % 6 === 0 && Math.random() < p) {          // foe is below: step off the platform edge or fall straight through it
                this.dropT = 14; this.vy = 2; this.grounded = false; return true;
            }
            if (dy < -150 && !pl || (pl && dy < -260)) {                                      // foe is above: find the nearest higher platform and jump onto it
                let best = null, bd = 1e9;
                for (const q of STAGE.platforms) { const rise = bottom - q.y; if (rise < 30 || rise > 380) continue; const cx = Math.max(q.x + 20, Math.min(q.x + q.w - 20, this.x)); const d = Math.abs(cx - this.x); if (d < bd) { bd = d; best = { q, cx }; } }
                if (best && bd < 900 && Math.random() < p + 0.2) {
                    const gap = best.cx - this.x;
                    if (Math.abs(gap) > 24) { this.vx = Math.sign(gap) * 8.5 * charOf(this.char).walk; this.facing = gap > 0 ? 1 : -1; }
                    else this.jump();
                    return Math.abs(gap) > 24 || this.hitstun > 0 ? false : true;
                }
            }
        } else if (dy < -150 && this.vy > 0 && this.jumpsLeft > 0 && this.dropT <= 0) {        // falling short of a platform above: use the air jump
            const q = STAGE.platforms.find(q => this.x + halfW > q.x + 10 && this.x - halfW < q.x + q.w - 10 && q.y < bottom && bottom - q.y < 320);
            if (q && Math.random() < p) { this.jump(); return true; }
        }
        return false;
    }

    /** bot styles for the harder ranks. Returns true when the style took this frame. */
    modTick(t) {
        if (this.actionBlocked() || this.actionLock > 0 || !t) return false;
        const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy), dir = dx >= 0 ? 1 : -1, n = this.actionTimer;
        const foeAttacking = (t.attackTimer > 0 || t.activeMove) && dist < 230;
        switch (this.mod) {
            case 'rusher':                                                                           // never stops coming: closes the gap and keeps swinging
                if (this.grounded && Math.abs(dx) > 100 && Math.abs(dx) < 900) { this.vx += dir * 0.8; this.facing = dir; }
                if (dist < 150 && n % 12 === 0 && Math.random() < 0.75) return this.attack(dy < -40 ? 'UP' : 'NEUTRAL');
                if (n % 50 === 0 && dist > 300 && dist < 800 && Math.random() < 0.5 && this.grounded) { this.jump(); }
                return false;
            case 'zoner':                                                                            // keeps its distance and fills the air with specials
                if (this.grounded && dist < 300 && n % 3 === 0) { this.vx -= dir * 1.3; this.facing = dir; }
                if (n % 22 === 0 && dist > 260 && dist < 950 && Math.random() < 0.6) return this.aiSpecial(t, dist, dx, dy);
                return false;
            case 'turtle':                                                                           // shields up, waits for the swing, then punishes it
                if (foeAttacking && this.canShield() && Math.random() < 0.4) { this.shieldHold = 16; this.isShielding = true; return true; }
                if ((t.hitstun > 0 || t.clashStunTimer > 0 || t.dizzyTimer > 0) && dist < 170 && n % 4 === 0) return this.attack(dy < -40 ? 'UP' : 'NEUTRAL');
                return false;
            case 'trickster':                                                                        // hops around and blinks behind you
                if (n % 45 === 0 && Math.random() < 0.35) {
                    if (this.cd.BLINK <= 0 && dist > 140 && dist < 700 && this.useSpecial('BLINK', t.x - dir * 140, t.y)) return true;
                    if (this.grounded) this.jump();
                }
                if (n % 25 === 0 && dist < 200 && Math.random() < 0.4) return this.attack('DOWN');
                return false;
        }
        return false;
    }

    updateAI(target) {
        // static / training dummy: zero input, no rolls, no attacks
        if (this.level === 'static' || (S.gameMode === 'training' && (!S.train || !S.train.botType || S.train.botType === 'static'))) {
            this.isShielding = false;
            this.shieldHold = 0;
            return;
        }
        if (S.gameMode === 'training' && this.level !== 'easy' && this.level !== 'medium' && this.level !== 'hard') {
            this.isShielding = false;
            return;
        }
        // nobody visible (Umbra cloaked, or no foe): still recover and stay inside the kill barrier
        if (!target) {
            this.actionTimer++;
            this.isShielding = false;
            this.shieldHold = 0;
            if (this.hitstun > 0 || this.dizzyTimer > 0 || this.clashStunTimer > 0 || this.grabbedBy || this.freezeTimer > 0) return;
            if (this.respectBarrier()) return;
            const off = this.x < STAGE.x - 8 || this.x > STAGE.x + STAGE.width + 8 || this.y > STAGE.y + 8;
            if (off) this.recover();
            else {
                const cx = STAGE.x + STAGE.width / 2;
                this.facing = cx >= this.x ? 1 : -1;
                this.vx += this.facing * (0.55 + this.barrierPractice() / 80);
            }
            return;
        }

        if (this.level === 'hard') this.observe(target);

        if (this.hitstun > 0 || this.dizzyTimer > 0 || this.clashStunTimer > 0 || this.grabbedBy || this.freezeTimer > 0) {
            this.shieldHold = 0;
            this.isShielding = false;
            return;
        }

        if (this.shieldHold > 0) {
            this.shieldHold--;
            this.isShielding = this.canShield();
        } else {
            this.isShielding = false;
        }

        this.actionTimer++;
        if (this.respectBarrier()) return;
        if (this.mod && !S.demo && this.modTick(target)) return;
        const stageCenterX = STAGE.x + STAGE.width / 2;

        // HARD: force Side-F often (combo or gap) — cache-bust build so this is visible
        if (!S.demo && this.level === 'hard' && this.cd.BLINK <= 0 && !this.actionBlocked() && (this.haltT|0) <= 0 && this.actionTimer % 6 === 0) {
            const adx = Math.abs(target.x - this.x), ady = Math.abs(target.y - this.y);
            const combo = target.hitstun > 4 || target.clashStunTimer > 2 || (target.lastHitBy === this && target.lastHitT < 50);
            const gap = adx > 100 && adx < (this.char === 'ember' ? 1400 : 800) && ady < (this.char === 'ember' ? 260 : 200);
            if (combo || gap) {
                const c = this.char === 'ember' ? (combo ? 0.2 + Math.random() * 0.4 : 0.5 + Math.random() * 0.45) : 0;
                if (this.useSpecial('BLINK', target.x, target.y, c)) return;
            }
        }

        // Ember's cluster bomb: prime it, throw it at the foe, and set it off when the foe is inside the blast
        if (this.char === 'ember' && (this.level === 'hard' || this.level === 'medium') && !this.actionBlocked() && this.actionLock <= 0 && this.actionTimer % 5 === 0) {
            const mine = orbs.filter(o => o && o.owner === this && o.kind === 'bomb'), dT = Math.hypot(target.x - this.x, target.y - this.y);
            if (this.bombShots > 0 && dT < 650 && dT > 110 && (!mine.length || mine.every(o => o.age > 20)) && this.attack('NEUTRAL')) return;
            if (mine.length) { if ((mine.some(o => Math.hypot(o.x - target.x, o.y - target.y) < o.R * 0.8) || mine.some(o => o.age > 150)) && this.attack('UP')) return; }
            else if (!mine.length && this.bombShots <= 0 && this.grounded && this.cd.SUPLEX <= 0 && dT > 250 && Math.random() < 0.2 && this.useSpecial('SUPLEX', target.x, target.y)) return;
        }

        if (this.isHanging) {
            // climb toward stage centre — jump only after 0.6 s (same rule as players)
            const onto = this.x < stageCenterX ? 10 : -10;
            if (this.hangTimer >= 36) {
                if (!this.jump()) {
                    // jump failed (lock etc.): still leave only via jump path — wait
                }
            }
            this.vx = 0;   // stay locked on ledge until jump
            // all non-static bots: after climb, hard commits recovery specials near the edge
            if (this.level !== 'static' && this.level === 'hard' && this.actionTimer % 8 === 0) {
                const lx = this.x < stageCenterX ? STAGE.x + 40 : STAGE.x + STAGE.width - 40;
                this.useSpecial('SPIRAL', lx, STAGE.y - 40);
            }
            return;
        }

        // steer through moves already in progress
        if (this.spiralT > 0) {
            this.vx = Math.max(-6, Math.min(6, this.vx + (this.x < stageCenterX ? 0.9 : -0.9)));
            return;
        }
        if (this.aiMove && --this.aiMove.t <= 0) this.aiMove = null;
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'roll' && this.level === 'hard') {      // hard bots bail out of the side-F (a jump cancels it) before it carries them off the stage, so they can recover
            const margin = 90, off = this.x < STAGE.x + margin || this.x > STAGE.x + STAGE.width - margin;
            const falling = !this.grounded && this.y > STAGE.y + 20;
            if (falling || (off && this.vx * (this.x < stageCenterX ? -1 : 1) > 0 && !this.grounded) || (off && this.sx.d * (this.x < stageCenterX ? -1 : 1) > 0 && this.y > STAGE.y - 60)) {
                this.endRoll(); this.vx = (this.x < stageCenterX ? 1 : -1) * 4; this.jump(); return;
            }
        }
        if (this.sx && this.sx.k === 'roll' && this.sx.ph === 'roll') { const dd = target.x - this.x; if (Math.abs(dd) > 40) this.sx.d = dd > 0 ? 1 : -1; }   // steer the fireball roll at the foe
        if (this.suplexT > 0 || this.diving || this.isRolling || this.sx) return;

        const isOverVoid = this.x < STAGE.x || this.x > STAGE.x + STAGE.width;
        if (isOverVoid) {
            this.recover();
            return;
        }

        const distToTargetX = target.x - this.x;
        const distToTargetY = target.y - this.y;
        const dist = Math.sqrt(distToTargetX * distToTargetX + distToTargetY * distToTargetY);

        // charging a CBG Core: stand still, then fire it straight at where the target is heading
        if (this.fActive) {
            this.vx *= 0.8;
            this.facing = distToTargetX > 0 ? 1 : -1;
            if (this.chargeFrames >= this.aiChargeGoal) {
                const flight = Math.min(30, dist / 20);
                const lead = this.level === 'hard' ? flight * 0.6 : 0;
                this.fRelease('NEUTRAL', target.x + target.vx * lead, target.y + target.vy * lead * 0.5);
            }
            return;
        }

        if (STAGE.platforms.length && this.platformNav(target, distToTargetX, distToTargetY)) return;      // big arenas: drop through / climb the soft platforms

        if (items.length && this.actionTimer % 18 === 0 && !this.grabHolding) {      // use items: throw what we hold, chase what lies near
            if (this.heldItem) {
                if (dist < 650 && Math.random() < (this.level === 'easy' ? 0.15 : 0.5) && this.executeGrabDash(target.x, target.y)) return;
            } else if (this.canGrab && this.level !== 'easy') {
                const it = items.find(i => i.st === 'idle' && Math.hypot(i.x - this.x, i.y - this.y) < 420 && Math.abs(i.y - this.y) < 200);
                if (it && Math.random() < 0.6 && this.executeGrabDash(it.x, it.y)) return;
            }
        }

        if (this.level === 'easy') {
            const reactionRate = Math.max(12, Math.round(35 / this.skill));
            const movementSpeed = 0.55;

            if (this.actionTimer % reactionRate === 0) {
                this.facing = distToTargetX > 0 ? 1 : -1;

                if (Math.abs(distToTargetX) > 100) {
                    this.vx += this.facing * movementSpeed;
                }

                if (this.char === 'terra' && this.rockT <= 0 && dist > 160 && dist < 700 && Math.random() < 0.3 && this.attack('NEUTRAL')) return;
                if (Math.random() < 0.12 && this.aiSpecial(target, dist, distToTargetX, distToTargetY)) return;
                if (dist < 130 && Math.random() < 0.65) {
                    this.raiseShield(54);
                } else if (dist < 90 && Math.random() < 0.3) {
                    this.attack(distToTargetY < -30 ? 'UP' : 'NEUTRAL');
                } else if (dist > 380 && dist < 900 && Math.random() < 0.18 && this.grounded) {
                    this.beginCore(target, 15 + Math.random() * 17);     // the odd slow, small core
                }
            }

            const nearLeftEdge = this.x < STAGE.x + 100;
            const nearRightEdge = this.x > STAGE.x + STAGE.width - 100;
            if (nearLeftEdge || nearRightEdge || this.y > STAGE.y + 20) {
                const targetX = STAGE.x + STAGE.width / 2;
                this.vx += (targetX - this.x > 0 ? 0.6 : -0.6);
                if (this.y > STAGE.y + 20) this.recover();
                else if (this.vy > 1 && this.jumpsLeft > 0 && this.actionTimer % 25 === 0) {
                    this.jump();
                }
            }
            return;
        }

        // ------------------------------------------------------------ medium / hard (medium: slower, no habit learning, fewer counters)
        const med = this.level === 'medium';
        const habit = (k) => med ? 0 : habitOf(k);
        const nearLeftEdge = this.x < STAGE.x + 180;
        const nearRightEdge = this.x > STAGE.x + STAGE.width - 180;
        const isOffStage = nearLeftEdge || nearRightEdge || this.y > STAGE.y + 20;

        // below the stage or far off the sides → recovery first; near-edge on stage stays neutral
        const belowMap = this.y > STAGE.y + 12;
        const farOffSide = this.x < STAGE.x - 50 || this.x > STAGE.x + STAGE.width + 50;
        if (belowMap || (farOffSide && !this.grounded)) {
            this.recover();
            return;
        }
        // soft near-edge: drift toward center, keep fighting (don't soft-lock on ledge tech)
        if (isOffStage && this.grounded) {
            const cx = STAGE.x + STAGE.width / 2;
            this.vx += (cx > this.x ? 0.6 : -0.6);
        }

        const speedMultiplier = (isOffStage ? 1.4 : 1.365) * (med ? 0.78 : 1);

        const targetIsOffStage = target.x < STAGE.x - 20 || target.x > STAGE.x + STAGE.width + 20 || target.y > STAGE.y + 10 || target.isHanging;
        const targetOnEdge = target.isHanging || target.x < STAGE.x + 140 || target.x > STAGE.x + STAGE.width - 140;

        // the player is on / over the edge: shoot a CBG Core at them from range
        if ((targetIsOffStage || targetOnEdge) && this.grounded && dist > 280 && this.cd.CORE <= 0 &&
            this.actionTimer % 10 === 0 && Math.random() < (med ? 0.25 : 0.55)) {
            if (this.beginCore(target, 35 + Math.random() * 28)) return;
        }

        if (targetIsOffStage) {
            if (S.sudden) {
                const sk = this.barrierPractice() / 50, B = BLAST_ZONES;
                const targetRoom = Math.min(target.x - B.left, B.right - target.x, target.y - B.top, B.bottom - target.y);
                if (targetRoom < 36 + sk * 280) { this.recover(); return; }   // don't follow them into the closing box
            }
            // Can we still recover if we chase off-stage?
            const hasUp = this.cd.SPIRAL <= 0;
            const hasSide = this.cd.BLINK <= 0;
            const canReturn = this.jumpsLeft >= 1 || hasUp || hasSide;
            const deep = target.y > STAGE.y + 80 || target.x < STAGE.x - 120 || target.x > STAGE.x + STAGE.width + 120;
            // easy: always safe on-stage guard
            // medium: sometimes risks a chase
            // hard: often leaves stage to secure the stock when recovery tools remain
            let risk = 0;
            if (this.level === 'easy') risk = 0;
            else if (this.level === 'medium') risk = canReturn ? 0.45 : 0.1;
            else risk = canReturn ? (deep ? 0.85 : 0.7) : 0.25;

            const chase = this.level !== 'easy' && Math.random() < risk;
            if (!chase) {
                if (this.grounded || this.y < STAGE.y + 40) {
                    const guardLedgeX = target.x < STAGE.x + STAGE.width / 2 ? STAGE.x + 70 : STAGE.x + STAGE.width - 70;
                    const guardDir = guardLedgeX > this.x ? 1 : -1;
                    this.facing = guardDir;
                    this.vx += guardDir * 1.4;
                    if (Math.abs(this.x - guardLedgeX) < 120 && this.actionTimer % 12 === 0) {
                        if (this.cd.CORE <= 0 && Math.random() < 0.4) this.beginCore(target, 28 + Math.random() * 20);
                        else this.attack('DOWN');
                    }
                }
                return;
            }
            // risk: leave stage to secure the stock (recover() pulls us back when deep)
            this.facing = target.x >= this.x ? 1 : -1;
            this.vx += this.facing * (this.level === 'hard' ? 2.0 : 1.5);
            if (this.y > target.y - 40 && this.jumpsLeft > 0 && this.actionTimer % 5 === 0) this.jump();
            if (this.actionTimer % 6 === 0) {
                const adx = Math.abs(target.x - this.x);
                if (adx < 220 && this.attack(target.y < this.y - 30 ? 'UP' : 'DOWN')) return;
                if (hasSide && adx > 80 && adx < 520 && this.useSpecial('BLINK', target.x, target.y, this.char === 'ember' ? 0.45 : 0)) return;
                if (hasUp && (target.y < this.y - 40 || deep) && this.useSpecial('SPIRAL', target.x, target.y)) return;
                if (this.cd.CORE <= 0 && adx > 180) this.beginCore(target, 30 + Math.random() * 25);
            }
            if (this.y > STAGE.y + 160 || (this.jumpsLeft === 0 && this.cd.SPIRAL > 0 && this.cd.BLINK > 0)) {
                this.recover();
                return;
            }
            return;
        }

        if (this.actionTimer % (med ? 12 : 7) === 0) {
            this.facing = distToTargetX > 0 ? 1 : -1;
            const tMove = target.isShielding ? 'SHIELD' : (target.activeMove ? target.activeMove.type : null);
            const aim = distToTargetY < -40 ? 'UP' : (distToTargetY > 40 ? 'DOWN' : (this.facing === 1 ? 'SIDE_RIGHT' : 'SIDE_LEFT'));

            if (Math.abs(distToTargetX) > 70) {
                this.vx += this.facing * 1.05 * speedMultiplier;
            }
            // hard Side-F: ONLY when far (close the gap) OR when a combo is open
            if (!med && this.cd.BLINK <= 0 && !this.grabHolding && this.actionTimer % 7 === 0) {
                const combo = target.hitstun > 8 || target.clashStunTimer > 4 || (target.lastHitBy === this && target.lastHitT < 40);
                const far = Math.abs(distToTargetX) > 260 && Math.abs(distToTargetX) < 780 && Math.abs(distToTargetY) < 160;
                if (combo && Math.abs(distToTargetX) < 480 && Math.abs(distToTargetY) < 140 && Math.random() < 0.75) {
                    const c = this.char === 'ember' ? (0.2 + Math.random() * 0.35) : 0;
                    if (this.useSpecial('BLINK', target.x, target.y, c)) return;
                } else if (far && !combo && Math.random() < 0.5) {
                    const c = this.char === 'ember' ? (0.55 + Math.random() * 0.4) : 0;
                    if (this.useSpecial('BLINK', target.x, target.y, c)) return;
                }
            }

            // 1) a core is coming: raise the shield (counters everything but grab)
            const incoming = orbs.find(o => o.owner === target && Math.hypot(o.x - this.x, o.y - this.y) < 300);
            if (incoming && Math.random() < (med ? 0.4 : 0.75)) { this.raiseShield(40); return; }

            // 2) the player is mid-attack right next to us: counter it
            if (dist < 170 && (target.isGrabDashing || (tMove && tMove !== 'SHIELD' && tMove !== 'GRAB'))) {
                const r = Math.random();
                if (target.isGrabDashing) {                      // grab is beaten by every active move: J it
                    if (r < 0.6 && this.attack(aim)) return;
                } else if (r < 0.3 + 0.4 * habit('J')) {
                    this.raiseShield(26); return;                // shield counters it
                } else if (r < 0.75 && this.attack(aim)) return; // J counters everything but shield
            }

            // 3) the player turtles in a shield: grab beats shield
            if (target.isShielding && dist < 170 && this.canGrab && Math.random() < 0.55 + 0.4 * habit('SHIELD')) {
                if (this.executeGrabDash(target.x, target.y)) return;
            }

            // 4) player is above us: spiral / up slash / jump
            const targetIsAirborne = !target.grounded && target.y < STAGE.y - 10;
            if (targetIsAirborne) {
                if (this.grounded && Math.random() < 0.6) this.jump();
                if (dist < 190 && Math.abs(distToTargetX) < 140 && distToTargetY < -50 && Math.random() < 0.4 &&
                    this.useSpecial('SPIRAL', target.x, target.y)) return;
                if (dist < 150 && this.canGrab && Math.random() < 0.5 && this.executeGrabDash(target.x, target.y)) return;
            }

            // 5) we are above the player over the stage: headbutt dive
            if (!this.grounded && distToTargetY > 80 && Math.abs(distToTargetX) < 90 && this.y < STAGE.y - 120 &&
                this.x > STAGE.x + 60 && this.x < STAGE.x + STAGE.width - 60 && Math.random() < 0.55 &&
                this.useSpecial('HEADBUTT', target.x, target.y)) return;

            if (distToTargetY < -90 && this.grounded) {
                this.jump();
            }

            // 5a) Terra throws his neutral rock at range
            if (this.char === 'terra' && this.rockT <= 0 && dist > 140 && dist < 800 && Math.abs(distToTargetY) < 260 && Math.random() < (med ? 0.35 : 0.6)) { if (this.attack('NEUTRAL')) return; }

            // 5b) the character's own special moves
            if (!this.grabHolding && Math.random() < (med ? 0.4 : 0.85) && this.aiSpecial(target, dist, distToTargetX, distToTargetY)) return;

            // 6) neutral game at close / mid range
            if (dist < 130 && !this.grabHolding) {
                const opts = [];
                opts.push([3, () => this.attack(aim)]);
                if (this.canGrab) opts.push([1 + 3 * habit('SHIELD'), () => this.executeGrabDash(target.x, target.y)]);
                if (this.grounded && target.grounded && dist < 260) opts.push([2, () => this.useSpecial('SUPLEX', target.x, target.y)]);
                if (this.cd.BLINK <= 0 && Math.abs(distToTargetY) < 60 && dist > 80) opts.push([1, () => this.useSpecial('BLINK', target.x, target.y)]);
                this.pickWeighted(opts);
            } else if (dist < 330 && Math.abs(distToTargetY) < 70 && this.cd.BLINK <= 0 && Math.random() < 0.3) {
                this.useSpecial('BLINK', target.x, target.y);        // blink slash to close the gap
            } else if (dist > 330 && this.grounded && this.cd.CORE <= 0 && Math.random() < 0.25) {
                this.beginCore(target, 14 + Math.random() * 28);     // zoning with cores
            } else if (dist < 120) {
                this.attack(aim);
            }

            // 7) incoming attack at close range and nothing better to do: shield
            if (dist < 90 && target.activeHitbox && Math.random() < 0.5) {
                this.raiseShield(24);
            }
        }
    }


    /** Special moves for every character (Luminent keeps its classic plan): picks by range / height, weighted by what has worked for this level */
    aiSpecial(t, dist, dx, dy) {
        const lv = this.level, adx = Math.abs(dx), ch = this.char, g = this.grounded;
        if (ch === 'luminent' || (lv !== 'easy' && lv !== 'medium' && lv !== 'hard')) return false;
        if (this.actionBlocked() || this.actionLock > 0) return false;
        const N = spec(ch, 'N'), S1 = spec(ch, 'S'), U = spec(ch, 'U'), DG = spec(ch, 'DG'), DA = spec(ch, 'DA');
        const opts = [], add = (w, slot, fn) => opts.push([w * (0.35 + 1.65 * aiRate(lv, ch + ':' + slot)), slot, fn]);
        const charge = lv === 'hard' ? 0.4 + Math.random() * 0.6 : lv === 'medium' ? Math.random() * 0.7 : Math.random() * 0.4;
        const cdOk = (k) => this.cd[k] <= 0;
        if (cdOk('CORE')) {
            if (N.kind === 'burst' && adx < 290 && Math.abs(dy) < 200) add(3, 'N', () => this.useSpecial('CORE', t.x, t.y, charge));
            else if (N.kind === 'breath' && dist < (lv === 'hard' && ch === 'ember' ? 190 : 360)) add(3, 'N', () => this.useSpecial('CORE', t.x, t.y, charge));
            else if (N.kind === 'thunder' && g && dist > 220 && dist < 900) add(2, 'N', () => this.useSpecial('CORE', t.x, t.y, lv === 'hard' ? 0.6 + Math.random() * 0.4 : charge));
        }
        if (cdOk('BLINK')) {
            const dd = S1.dist || 300;
            if (lv === 'hard') {
                // Side-F is a primary pressure / combo tool
                if (S1.kind === 'roll') {
                    const combo = t.hitstun > 8 || t.clashStunTimer > 4 || (t.lastHitBy === this && t.lastHitT < 40);
                    const far = adx > (ch === 'ember' ? 200 : 260) && adx < (ch === 'ember' ? 1400 : 800) && Math.abs(dy) < (ch === 'ember' ? 260 : 160);
                    if (combo && adx < 500 && Math.abs(dy) < 150) {
                        // combo string: light charge so you can keep hitting
                        add(9.0, 'S', () => this.useSpecial('BLINK', t.x, t.y, 0.2 + Math.random() * 0.35));
                    } else if (far) {
                        // far: higher charge to cover distance / send
                        let c = 0.55 + Math.random() * 0.4;
                        if (t.damage > 70 || t.isHanging) c = 0.9 + Math.random() * 0.1;
                        add(ch === 'ember' ? (g ? 14 : 8) : (g ? 7.0 : 4.0), 'S', () => this.useSpecial('BLINK', t.x, t.y, c));
                    }
                } else if (S1.kind === 'dash' && adx > 50 && adx < dd + 240 && Math.abs(dy) < 150) {
                    add(6.0, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                } else if (S1.kind === 'bubble' && adx > 90 && adx < 740 && Math.abs(dy) < 190) {
                    add(5.5, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                } else if (S1.kind === 'tp' && (adx < dd + 180 && Math.abs(dy) < 160)) {
                    add(5.8, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                } else if (adx > 70 && adx < 560 && Math.abs(dy) < 170) {
                    add(4.5, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                }
            } else {
                if (S1.kind === 'roll' && g && adx > 130 && adx < 720 && Math.abs(dy) < 130) add(3, 'S', () => this.useSpecial('BLINK', t.x, t.y, lv === 'easy' ? 0.1 : charge));
                else if (S1.kind === 'dash' && adx > 70 && adx < dd + 170 && Math.abs(dy) < 120) add(3, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                else if (S1.kind === 'bubble' && adx > 140 && adx < 680 && Math.abs(dy) < 160) add(2.5, 'S', () => this.useSpecial('BLINK', t.x, t.y));
                else if (S1.kind === 'tp' && adx < dd + 100 && Math.abs(dy) < 130) add(3, 'S', () => this.useSpecial('BLINK', t.x, t.y));
            }
        }
        if (cdOk('SPIRAL')) {
            const uw = lv === 'hard' ? 7.0 : 3.0;   // hard: Up-F weight matches Side-F combo pressure
            if (U.ghost) { if (dist > 650) add(uw * 0.5, 'U', () => this.useSpecial('SPIRAL', t.x, t.y)); }      // Umbra's Shadow Flight does no damage: only worth it to close a big gap
            else if (U.kind === 'bolt' && dist < (U.dist || 320) + 60 && dy < 90) add(uw, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
            else if (U.kind === 'rocket' && dist > 90 && dist < 480) add(uw * 0.9, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
            else if (U.kind === 'erupt' && adx < 150 && dy < -40 && dy > -320) add(uw, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
            else if (U.kind === 'rise' && adx < 150 && dy < -30 && dy > -230) add(uw * 0.9, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
            else if (lv === 'hard' && dist < 400 && !U.ghost) add(uw * 0.55, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
        }
        if (cdOk('SUPLEX') && g) {
            const reach = DG.atTarget ? 620 : Math.max(170, STAGE.width * (DG.w || 0.1) * 0.5 + 40);
            if (adx < reach && Math.abs(dy) < 130) add(3, 'DG', () => this.useSpecial('SUPLEX', t.x, t.y));
        }
        if (cdOk('HEADBUTT') && !g && dy > 60 && this.y < STAGE.y - 100 && adx < (DA.vx ? 260 : ch === 'umbra' ? 55 : 110)) add(3, 'DA', () => { this.facing = dx > 0 ? 1 : -1; return this.useSpecial('HEADBUTT', t.x, t.y); });
        // hard: Side-F combo pressure ≈ Up-F (same weight class)
        if (this.level === 'hard' && cdOk('BLINK') && (t.hitstun > 0 || t.clashStunTimer > 0 || (t.lastHitBy === this && t.lastHitT < 50))) {
            const c = this.char === 'ember' ? (0.25 + Math.random() * 0.4) : 0;
            add(7.5, 'S', () => this.useSpecial('BLINK', t.x, t.y, c));
        }
        if (this.level === 'hard' && cdOk('SPIRAL') && !spec(ch, 'U').ghost && (t.hitstun > 0 || (t.lastHitBy === this && t.lastHitT < 40))) {
            add(7.5, 'U', () => this.useSpecial('SPIRAL', t.x, t.y));
        }
        if (!opts.length) return false;
        let tot = 0; for (const o of opts) tot += o[0];
        let r = Math.random() * tot, pick = opts[0];
        for (const o of opts) { r -= o[0]; if (r <= 0) { pick = o; break; } }
        if (!pick[2]()) return false;
        const key = ch + ':' + pick[1]; const e = aiStats[lv][key] || (aiStats[lv][key] = { use: 0, hit: 0 });
        e.use++; this.aiMove = { slot: pick[1], t: 100, hit: false };
        return true;
    }

    pickWeighted(opts) {
        let total = 0;
        for (const o of opts) total += o[0];
        let r = Math.random() * total;
        for (const o of opts) {
            r -= o[0];
            if (r <= 0) return o[1]();
        }
    }
}

const particles = [];
function dripBlood(x, y) {
    const room = Math.max(0, 220 - particles.length);
    const n = Math.min(9, room);
    for (let i = 0; i < n; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 16, y: y - 6,
            vx: (Math.random() - 0.5) * 1.4, vy: 1.4 + Math.random() * 2.8,
            z: (Math.random() - 0.5) * 10, vz: 0,
            radius: 2.4 + Math.random() * 3.4,
            color: Math.random() < 0.45 ? '#450a0a' : '#7f1d1d',
            alpha: 1, life: 40, drip: true,
        });
    }
}
function createParticles(x, y, color, count = 10) {
    if (S.gameState === 'playing' && !S.replay && recBuf.p.length < 60) recBuf.p.push([x, y, color, count]);
    if (S.online === 'host') outbox.push({ k: 'p', e: [x, y, color, count] });
    // hard cap so ledge thrash / KO spam can't melt the frame rate
    const room = Math.max(0, 220 - particles.length);
    count = Math.min(count, room);
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.5) * 14,
            z: (Math.random() - 0.5) * 50,
            vz: (Math.random() - 0.5) * 9,
            radius: Math.random() * 5 + 2,
            color: color,
            alpha: 1,
            life: 25
        });
    }
}

function createExplosion(x, y) {
    createParticles(x, y, '#ef4444', 40);
    createParticles(x, y, '#f59e0b', 40);
    createParticles(x, y, '#ffffff', 25);
    S.screenShake = 22;
}

const p1 = new Fighter(STAGE.x + 300, STAGE.y - 100, '#06b6d4', 'Player 1');
const p2 = new AIBot(STAGE.x + 1200, STAGE.y - 100, '#f43f5e', 'AI Bot');
/** every possible fighter: p1 = this browser's player (or the host), p2 = the bot / first guest, p3..p8 = more guests in custom matches */
export const fighters = [p1, p2];
for (let i = 2; i < 8; i++) { const f = new AIBot(STAGE.x + 300 * i, STAGE.y - 100, '#9ca3af', 'Player ' + (i + 1)); f.active = false; fighters.push(f); }
fighters.forEach((f, i) => { f.slot = i; });
const isAlive = (f) => f.active && !f.out;
/** where this fighter is aiming: the mouse / stick for a local player, the guest's aim for a remote one, a sensible target for a bot */
function aimOf(f) {
    if (f.isAI) {
        const cx = STAGE.x + STAGE.width / 2;
        if (f.x < STAGE.x - 20 || f.x > STAGE.x + STAGE.width + 20 || f.y > STAGE.y) return { x: cx, y: STAGE.y - 220 };
        const foe = nearestOf(f, foesOf(f)); return foe ? { x: foe.x, y: foe.y } : { x: cx, y: STAGE.y - 300 };
    }
    const a = f.remoteAim ? f.remoteAim : { x: mouse.worldX, y: mouse.worldY };
    return a;
}
/** who this fighter can hurt: everyone still in the match, except teammates in team matches */
const foesOf = (f) => fighters.filter(o => o !== f && isAlive(o) && !(S.match && S.match.teams && f.team && o.team === f.team));
const nearestOf = (f, list) => list.reduce((b, o) => (!b || Math.hypot(o.x - f.x, o.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y)) ? o : b, null);


// ============================================================================
//  Items (custom matches): Ball, Strawberry, Balloon, Firestick, Clock
//  Picked up and used with an AIMED GRAB (the grab dash touches the item). Balloon is used with jump.
// ============================================================================
export const items = [];
let itemSerial = 0;
const ITEM_R = { BALL: 24, STRAWBERRY: 22, BALLOON: 26, FIRESTICK: 22, CLOCK: 26 };
const CLOCK_RADIUS = 760, CLOCK_HELD_RADIUS = 380;   // thrown: full size; carried: half size and it goes with its holder
const clockR = (it) => it.st === 'held' ? CLOCK_HELD_RADIUS : CLOCK_RADIUS;
//                // diameter 1520 = 0.4 x the ORIGINAL 3800-wide map (it does not grow with the big arena)
const CLOCK_SLOW = 0.3;
const CLOCK_ARM = 60;                   // 1 s after the throw the bubble starts
const CLOCK_LIFE = 480;                 // the clock lasts 8 s in total from the moment it is first picked up (held or thrown, it can run out in your hand)
const REST_LIFE = { BALL: 3600, STRAWBERRY: 1800, BALLOON: 1800, FIRESTICK: 1800, CLOCK: 1800 };
const STICK_MAX_LEN = 5;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function spawnItem(type) {
    // only ever above a surface: the main stage or one of the soft platforms
    const surfaces = [{ x: STAGE.x, w: STAGE.width, y: STAGE.y }, ...STAGE.platforms];
    const sf = surfaces[Math.random() * surfaces.length | 0];
    const pad = Math.min(60, sf.w * 0.15);
    const x = sf.x + pad + Math.random() * Math.max(10, sf.w - pad * 2);
    const y = sf.y - 300;
    items.push({ id: ++itemSerial, type, x, y, py: y, vx: 0, vy: 0, r: ITEM_R[type], st: 'idle', age: 0, rest: 0, owner: null, grace: 0,
        rot: 0, spin: 0, hold: -1, hitCool: 0, throws: 0, len: STICK_MAX_LEN, reductions: 0, act: false, armed: false, tT: 0, holder: null });
    fx('pickup', x, y);
}

/** the fighter this screen belongs to (null when nobody: showcase / demo) */
export const viewerFighter = () => S.demo ? null : S.match ? fighters[S.mySlot] : p1;
/** perks (bought in the shop, equipped per character): only the fighter this screen belongs to carries them */
const hasPerk = (f, id) => !!f && f === viewerFighter() && S.online !== 'guest' && perksFor(f.char).includes(id);
/** harder bots (Expert / Master / Apex) fight with built-in stat bundles, the same kind of numbers as the shop perks */
const SKILL = { expert: 1.3, master: 1.6, apex: 2 };
const BOT_STATS = {
    expert: { dmg: 0.08, taken: -0.10, kbTaken: -0.06, cd: -0.12 },
    master: { dmg: 0.16, taken: -0.18, kbTaken: -0.12, cd: -0.22, walk: 0.06 },
    apex:   { dmg: 0.28, taken: -0.28, kbTaken: -0.20, cd: -0.35, walk: 0.10 },
};
export const APEX_TUNE = { luminent: 1.95, zephyr: 1.95, ember: 1.95, umbra: 1.95, volt: 1.95 };   // per-character multiplier on the Apex stat bundle (from tools tuning run; capped at 1.95)
const perkOf = (f, stat) => !f ? 0 : ((f === viewerFighter() && S.online !== 'guest') ? perkStat(perksFor(f.char), stat) : 0) + ((f.isAI && f.diff && BOT_STATS[f.diff]) ? (BOT_STATS[f.diff][stat] || 0) * (f.diff === 'apex' ? (APEX_TUNE[f.char] || 1) : 1) : 0);
/** match stats of the human player (for coins, daily challenges, the ladder) */
const newStats = () => ({ dealt: 0, taken: 0, hits: 0, combo: 0, backstabs: 0, counters: 0, grabs: 0, items: 0, frames: 0, maxDmg: 0 });
const bump = (f, k, n = 1) => { if (f && f === viewerFighter() && S.stats) S.stats[k] = (S.stats[k] || 0) + n; };
/** per-fighter match stats (every fighter, not only the viewer): feeds the end-of-match pages and the kills replay */
const msOf = (i) => { const a = S.ms || (S.ms = []); return a[i] || (a[i] = { dealt: 0, taken: 0, hits: 0, combo: 0, falls: 0 }); };
const MOVE_NAMES = { J: 'melee', CORE: 'Neutral F', BLINK: 'Side F', SPIRAL: 'Up F', HEADBUTT: 'Down air', GRAB: 'grab', SUPLEX: 'Down F' };
/** what a bot sees of a foe: a cloaked Umbra is completely invisible to bots. The only hints are what a person could also see:
 *  the flash and particles of a move (a fixed spot for 2/3 s) and, rarely, a fast dash's trail (a rough spot nearby for 0.4 s). No hint = null: the bot has nothing to chase. */
function aiSeen(bot, foe) {
    if (!foe || !(foe.cloakT > 0)) { if (bot) bot._lost = null; return foe; }
    const g = bot._lost && bot._lost.foe === foe ? bot._lost : (bot._lost = { foe, x: 0, y: 0, t: 0 });
    const d = Math.hypot(foe.x - bot.x, foe.y - bot.y);
    const acting = (foe.attackTimer > 0 || !!foe.swing || !!foe.activeMove) && d < 900;
    if (acting) { g.x = foe.x; g.y = foe.y; g.t = 40; }
    else if (g.t <= 0 && d < 450 && Math.hypot(foe.vx || 0, foe.vy || 0) > 12) { g.x = foe.x + (Math.random() - 0.5) * 220; g.y = foe.y + (Math.random() - 0.5) * 120; g.t = 24; }
    if (g.t <= 0) return null;
    g.t--;
    const px = Object.create(foe); px.x = g.x; px.y = g.y; px.vx = 0; px.vy = 0; px.cloakT = 0;
    return px;
}
export function spawnTrainItem(type) { if (type === 'CLEAR') { for (const it of items) { if (it.holder) { it.holder.heldItem = null; it.holder.heldId = 0; } it.st = 'dead'; } return; } if (ITEM_R[type]) { spawnItem(type); const it = items[items.length - 1]; it.x = p1.x + p1.facing * 160; it.y = p1.y - 120; it.py = it.y; } }

/** 0.3 inside any active clock bubble (a held clock's half-size bubble follows its holder), 1 elsewhere. Slows EVERY projectile and item; fighters are never slowed. */
/** an enemy of the clock's owner standing in a bubble moves at 0.3x (the owner and their team are never slowed) */
function clockSlowFor(f) {
    for (const it of items) {
        if (it.type !== 'CLOCK' || !it.act || Math.hypot(it.x - f.x, it.y - f.y) >= clockR(it)) continue;
        const c = it.owner;
        if (c && (f === c || (S.match && S.match.teams && f.team && f.team === c.team))) continue;
        return CLOCK_SLOW;
    }
    return 1;
}
/** clinging to a Bulwark sword (riding up on it or dragged down by it): can't be grabbed */
function onSword(t) { return fighters.some(f => f._carry && f._carry.includes(t)) || drops.some(d => d.caught && d.caught.includes(t)); }
function slowAt(x, y) {
    for (const it of items) {
        if (it.type !== 'CLOCK' || !it.act || Math.hypot(it.x - x, it.y - y) >= clockR(it)) continue;
        return CLOCK_SLOW;
    }
    return 1;
}

function burnItem(it) {
    it.reductions++;
    it.len = STICK_MAX_LEN - 0.5 * it.reductions;
    fx('burn', it.x, it.y);
    if (it.reductions >= 6) { it.st = 'dead'; if (it.holder) { it.holder.heldItem = null; it.holder.heldId = 0; it.holder = null; } }
}
function burnStick(f) { if (f.heldItem && f.heldItem.type === 'FIRESTICK') burnItem(f.heldItem); }

function pickUp(f, it) {
    bump(f, 'items');
    if (it.type === 'STRAWBERRY') {
        if (!S.sdNoDmg) f.damage = Math.max(0, f.damage - 30);
        fx('heal', f.x, f.y); audio.playGrab(); it.st = 'dead'; return true;
    }
    if (it.type === 'BALLOON') {
        if (!f.balloon) { f.balloon = true; f.maxJumps += 3; f.jumpsLeft += 3; }          // adds 3 jumps on top of the character's own
        fx('pickup', f.x, f.y - 30); audio.playGrab(); it.st = 'dead'; return true;
    }
    if (f.heldItem || it.used) return false;
    it.st = 'held'; it.holder = f; it.hold = f.slot; it.armed = false; it.tT = 0; it.vx = it.vy = 0; it.grace = 0; it.owner = f; if (it.type === 'CLOCK') { it.act = true; if (!it.started) { it.started = true; it.life = CLOCK_LIFE; } }     // a held clock is the holder's: its (half-size) bubble goes with them
    f.heldItem = it; f.heldId = it.id;
    f.isGrabDashing = false; f.suplexPending = false; f.vx *= 0.2; f.vy *= 0.2;
    fx('pickup', it.x, it.y); audio.playGrab();
    return true;
}

function throwHeldItem(f, tx, ty) {
    const it = f.heldItem; if (!it) return false;
    let dx = tx - f.x, dy = ty - f.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (Math.abs(dx) > 0.15) f.facing = dx > 0 ? 1 : -1;
    const sp = it.type === 'CLOCK' ? 15 : it.type === 'FIRESTICK' ? 17 : 19;
    it.st = 'thrown'; it.holder = null; it.hold = -1; it.owner = f; if (it.type === 'CLOCK') it.act = false; it.grace = 16; it.hitCool = 0; it.rest = 0;
    it.x = f.x + dx * 40; it.y = f.y + dy * 40 - 4; it.py = it.y; it.vx = dx * sp; it.vy = dy * sp;
    it.spin = (dx >= 0 ? 1 : -1) * (it.type === 'FIRESTICK' ? 0.5 : it.type === 'BALL' ? 0.3 : 0.15);
    if (it.type === 'BALL') it.throws++;
    if (it.type === 'CLOCK') { it.armed = true; it.tT = 0; it.used = true; }       // once thrown, nobody can pick it up again
    f.heldItem = null; f.heldId = 0;
    f.actionLock = Math.max(f.actionLock, 18); f.throwFxT = 14;
    audio.playThrow();
    return true;
}

function releasePins(it, recharge) {
    it.hitCool = 40;
    for (const f of fighters) if (f.stuckTo === it.id) {
        f.stuckTo = 0; f.vy = Math.min(f.vy, -2);
        if (recharge) { f.jumpsLeft = f.maxJumps; f.airSpecials = 0; f.canGrab = true; }
    }
}

function landOn(it) {
    const bottom = it.y + it.r, prevBottom = it.py + it.r;
    if (onStageX(it.x, 6) && prevBottom <= STAGE.y + 4 && bottom >= STAGE.y) { it.y = STAGE.y - it.r; return true; }
    if (it.vy >= 0) for (const p of STAGE.platforms) {
        if (it.x > p.x && it.x < p.x + p.w && prevBottom <= p.y + 4 && bottom >= p.y) { it.y = p.y - it.r; return true; }
    }
    return false;
}

function updateItems() {
    const cfg = S.match && S.match.items;
    if (cfg && cfg.on && cfg.types.length && S.gameState === 'playing') {
        if (--S.itemTimer <= 0) {
            S.itemTimer = Math.max(60, cfg.interval * 60);
            if (items.filter(i => i.st !== 'held' && i.st !== 'dead').length < 4) spawnItem(cfg.types[Math.floor(Math.random() * cfg.types.length)]);
        }
    }
    for (let n = items.length - 1; n >= 0; n--) {
        const it = items[n];
        if (it.st === 'dead') { if (it.holder) { it.holder.heldItem = null; it.holder.heldId = 0; } if (it.type === 'FIRESTICK') releasePins(it, false); items.splice(n, 1); continue; }
        it.age++;
        if (it.type === 'CLOCK' && it.started && --it.life <= 0) { it.st = 'dead'; fx('pickup', it.x, it.y); continue; }
        if (it.st === 'held') {
            const h = it.holder;
            if (!h || !isAlive(h) || h.heldItem !== it) { it.st = 'idle'; it.holder = null; it.hold = -1; it.vx = 0; it.vy = 0; if (it.type === 'CLOCK') it.act = false; continue; }
            it.x = h.x + h.facing * 30; it.y = h.y - 2; it.py = it.y;
            continue;
        }
        if (it.type === 'CLOCK' && it.armed) {                       // the thrown clock: bubble after 1 s, gone after 15 s
            it.tT++;
            if (!it.act && it.tT >= CLOCK_ARM) { it.act = true; it.st = 'zone'; it.vx = 0; it.vy = 0; fx('bubble', it.x, it.y, CLOCK_RADIUS); audio.playShield(); }       // thrown: normal size again, can't be picked up
        }
        if (it.st === 'zone') continue;                              // frozen where it started the bubble
        const k = it.type === 'CLOCK' ? 1 : slowAt(it.x, it.y);
        it.py = it.y;
        if (it.grace > 0) it.grace--;
        const thrown = it.st === 'thrown';
        it.vy = Math.min(thrown ? 16 : 14, it.vy + WORLD.gravity * (thrown ? 0.55 : 1) * (it.type === 'BALL' ? 0.85 : 1) * k);
        it.x += it.vx * k; it.y += it.vy * k;
        it.rot += (thrown ? it.spin : 0) * k;
        // stage body: slide out sideways instead of tunnelling in
        if (it.y > STAGE.y + 4 && it.y < STAGE.y + STAGE.height && it.x > STAGE.x - it.r && it.x < STAGE.x + STAGE.width + it.r) {
            it.x = it.x < STAGE.x + STAGE.width / 2 ? STAGE.x - it.r : STAGE.x + STAGE.width + it.r; it.vx *= -0.5;
        }
        const landed = landOn(it);
        if (it.type === 'FIRESTICK') {
            for (const f of fighters) if (f.stuckTo === it.id) {                 // pinned fighters ride the spear
                if (!isAlive(f)) { f.stuckTo = 0; continue; }
                f.x = it.x; f.y = it.y; f.px = f.x; f.py = f.y; f.vx = f.vy = 0; f.hitstun = Math.max(f.hitstun, 2); f.grounded = false;
            }
            if (landed) releasePins(it, false);                                   // hits the ground: they come off
            else if (it.y > STAGE.y + 24 && (it.x < STAGE.x || it.x > STAGE.x + STAGE.width)) releasePins(it, true);   // fell below the stage tip: free, with the ground's recharge
        }
        if (landed) {
            if (it.type === 'BALL' && thrown) {
                it.vy = Math.abs(it.vy) > 2.5 ? -it.vy * 0.5 : 0;
                it.vx *= 0.9;
            } else { it.vy = 0; it.vx *= 0.8; }
            if (it.vy === 0) it.vx *= (it.type === 'BALL' ? 0.94 : 0.8);
        }
        if (thrown) {
            const sp = Math.hypot(it.vx, it.vy);
            if (landed && (it.type !== 'BALL' || sp < 1.4)) {          // came to rest
                it.st = it.type === 'CLOCK' && it.armed ? 'idle' : 'idle'; it.vx = 0; it.vy = 0; it.spin = 0;
                if (it.type === 'BALL' && it.throws >= 2) { it.st = 'dead'; fx('pickup', it.x, it.y); continue; }   // second throw used up: it breaks
            }
        } else if (landed || it.vy === 0) {
            if (!it.armed && ++it.rest > REST_LIFE[it.type]) { it.st = 'dead'; continue; }
        }
        if (it.x < BLAST_ZONES.left - 400 || it.x > BLAST_ZONES.right + 400 || it.y > BLAST_ZONES.bottom + 400 || it.y < BLAST_ZONES.top - 1600) it.st = 'dead';
    }
}

/** grab-dash pickups and thrown ball / firestick hits */
function itemInteractions() {
    if (!items.length) return;
    for (const f of fighters) {
        if (!isAlive(f) || !f.isGrabDashing || f.suplexPending) continue;
        for (const it of items) {
            if ((it.st !== 'idle' && it.st !== 'thrown') || it.used || (it.st === 'thrown' && (it.type !== 'BALL' || (it.owner === f && it.grace > 0)))) continue;
            if (Math.hypot(it.x - f.x, it.y - f.y) < 72 + it.r) { if (pickUp(f, it)) break; }
        }
    }
    for (const it of items) {
        if (it.st !== 'thrown' || (it.type !== 'BALL' && it.type !== 'FIRESTICK')) continue;
        if (it.hitCool > 0) { it.hitCool--; continue; }
        const speed = Math.hypot(it.vx, it.vy);
        if (it.type === 'BALL' && speed < 2.5) continue;
        const R = it.type === 'FIRESTICK' ? 26 + 14 * it.len : it.r;
        for (const f of fighters) {
            if (!isAlive(f)) continue;
            if (it.owner && f === it.owner && it.grace > 0) continue;
            if (it.owner && f !== it.owner && S.match && S.match.teams && f.team && f.team === it.owner.team) continue;
            if (f.riposteT > 0 && it.owner !== f && Math.abs(f.x - it.x) < f.width / 2 + R + 70 && Math.abs(f.y - it.y) < f.height / 2 + R + 50) {      // Bulwark's counter returns thrown items too
                const prev = it.owner, a = prev ? Math.atan2(prev.y - it.y, prev.x - it.x) : (it.vx >= 0 ? Math.PI : 0), sp2 = Math.min(34, Math.max(10, speed * 2));
                it.vx = Math.cos(a) * sp2; it.vy = Math.sin(a) * sp2; it.owner = f; it.grace = 0; it.hitCool = 6;
                f.riposteT = 0; f.riposteAfter = 0; f.riposteCd = 0; f.actionLock = 0; f.activeMove = null;
                audio.playShield(); S.screenShake = Math.max(S.screenShake, 8); fx('counter', f.x, f.y); createParticles(it.x, it.y, '#e2e8f0', 10);
                break;
            }
            const hb = f.activeHitbox;
            if (it.type === 'BALL' && hb && !(it.owner === f)) {                      // the ball counters every attack except a grab
                if (Math.abs(hb.x - it.x) < hb.w / 2 + it.r && Math.abs(hb.y - it.y) < hb.h / 2 + it.r) {
                    f.activeHitbox = null; f.swingHit = true;
                    audio.playHit(true); fx('counter', it.x, it.y);
                    counterStun(f, it);
                    it.vx = (it.vx >= 0 ? -1 : 1) * Math.max(4, Math.abs(it.vx) * 0.6); it.vy = -5; it.hitCool = 10; it.grace = 0;
                    break;
                }
            }
            if (f.invincibleTimer > 0) continue;
            const cx = clampN(it.x, f.x - f.width / 2, f.x + f.width / 2), cy = clampN(it.y, f.y - f.height / 2, f.y + f.height / 2);
            if (Math.hypot(it.x - cx, it.y - cy) > R) continue;
            if (it.type === 'BALL' && f.isGrabDashing && f !== it.owner) { pickUp(f, it); break; }   // grabbing the ball catches it
            const dirx = it.vx >= 0 ? 1 : -1;
            if (f.isShielding) {
                audio.playShield(); f.shieldHealth = Math.max(0, f.shieldHealth - 10); fx('block', it.x, it.y);
            } else if (it.type === 'FIRESTICK') {                                      // thrown like a spear: pins whoever it hits and carries them
                if (f.stuckTo === it.id) continue;
                f.interrupt(); if (!S.sdNoDmg) f.damage += 15; f.lastHitBy = it.owner || f; f.lastHitT = 0;
                f.stuckTo = it.id; f.vx = f.vy = 0; f.hitstun = Math.max(f.hitstun, 3);
                S.screenShake = Math.max(S.screenShake, 12); audio.playHit(true); fx('hit', f.x, f.y, 15, dirx > 0 ? -0.2 : Math.PI + 0.2);
                burnItem(it);
                continue;                                                              // keeps flying (no bounce back), may pin others too
            } else {
                launch(it.owner || f, f, { damage: 10, bkb: 8, kbg: 0.9, angle: dirx > 0 ? -0.5 : Math.PI + 0.5 });
            }
            it.vx = -dirx * Math.max(4, Math.abs(it.vx) * 0.6); it.vy = -6; it.hitCool = 14; it.grace = 0;      // bounces back
            break;
        }
    }
}

/** pull the kill box in toward the stage. t is frames since sudden death started. */
function applySuddenBlast(t) {
    const b = S.sdBase;
    if (!b) return;
    const u = Math.min(1, (t || 0) / (60 * 26));   // half the previous close speed (26 s)
    const e = u * u * (3 - 2 * u);
    const cx = STAGE.x + STAGE.width / 2, hw = (STAGE.width + 320) * 0.75 / 2;      // final box 1.5x the last size, still centred
    const hh = 420 * 1.5;
    const L = cx - hw, R = cx + hw;
    const T = STAGE.y - hh, B = STAGE.y + hh;
    BLAST_ZONES.left = b.left + (L - b.left) * e;
    BLAST_ZONES.right = b.right + (R - b.right) * e;
    BLAST_ZONES.top = b.top + (T - b.top) * e;
    BLAST_ZONES.bottom = b.bottom + (B - b.bottom) * e;
}
let cdTimer = null;
function runCountdown() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    S.gameState = 'countdown';
    S.cdN = 3;
    const screen = document.getElementById('countdownScreen');
    const text = document.getElementById('countdownText');
    if (screen) screen.classList.remove('hidden');
    if (text) text.textContent = '3';
    let count = 3;
    cdTimer = setInterval(() => {
        count--;
        if (count > 0) { S.cdN = count; if (text) text.textContent = String(count); }
        else if (count === 0) { S.cdN = 0; if (text) text.textContent = 'GO!'; }
        else {
            clearInterval(cdTimer); cdTimer = null;
            S.cdN = -1;
            if (screen) screen.classList.add('hidden');
            if (S.gameState === 'countdown') S.gameState = 'playing';
        }
    }, 1000);
}
/** tied for the fewest deaths: only they come back, at 200%, and the blast zone closes in */
function beginSuddenDeath(tied) {
    S.sudden = true;
    S.sdNoDmg = true;          // sudden death: percent stays at 200, only the kill barrier can KO
    S.sdT = 0;
    S.timeLeft = 60 * 60;
    const a = ARENAS[S.arena] || ARENAS.normal;
    S.sdBase = { left: a.bz.left, right: a.bz.right, top: a.bz.top, bottom: a.bz.bottom };
    Object.assign(BLAST_ZONES, S.sdBase);
    orbs.length = 0; drops.length = 0; pillars.length = 0; zapTrails.length = 0;
    whirlpools.length = 0; tornadoes.length = 0; winds.length = 0;
    const set = new Set(tied);
    const n = Math.max(1, tied.length), span = STAGE.width * 0.7;
    tied.forEach((f, i) => {
        f.out = false; f.stocks = 1;
        f.startX = STAGE.x + STAGE.width * 0.15 + (n > 1 ? span * i / (n - 1) : span / 2);
        f.reset(false);
        f.damage = 200; f.stocks = 1; f.out = false;
        f.invincibleTimer = 40; f.spawnT = 0;
        f.y = STAGE.y - f.height / 2; f.grounded = true; f.vx = f.vy = 0;
    });
    for (const f of fighters) {
        if (!f.active || set.has(f)) continue;
        f.out = true; f.stocks = 0; f.vx = f.vy = 0; f.isShielding = false; f.fActive = false; f.sx = null;
        f.x = STAGE.x + STAGE.width / 2; f.y = STAGE.y - 40;
    }
    try { notify('SUDDEN DEATH'); } catch (e) { /* hud */ }
    runCountdown();
}
/** timer matches: fewest deaths wins. A tie for first is sudden death. */
function finishTimer() {
    if (!S.match || S.gameState !== 'playing' || S.sudden) return;
    const live = fighters.filter(f => f.active && !f.out);
    const keyOf = (f) => S.match.teams && f.team ? 't:' + f.team : 'p:' + f.slot;
    const score = new Map(), members = new Map();
    for (const f of live) {
        const k = keyOf(f);
        score.set(k, (score.get(k) || 0) + (f.deaths || 0));
        if (!members.has(k)) members.set(k, []);
        members.get(k).push(f);
    }
    let best = Infinity, winners = [];
    for (const [k, sc] of score) {
        if (sc < best) { best = sc; winners = [k]; }
        else if (sc === best) winners.push(k);
    }
    const wf = winners.flatMap(k => members.get(k) || []);
    if (winners.length > 1 && wf.length >= 2) { beginSuddenDeath(wf); return; }
    S.winnerSlots = wf.map(f => f.slot);
    const w = wf[0];
    S.winnerLabel = w ? (S.match.teams && w.team ? `${TEAM_NAMES[w.team]} TEAM` : String(w.name).toUpperCase()) : 'NOBODY';
    S.iWon = !!(w && S.winnerSlots.includes(S.mySlot || 0));
    triggerDramaticZoom(w || p1);
    endGame(!w ? 'DRAW!' : (S.iWon ? 'YOU WIN!' : `${S.winnerLabel} WINS!`), 'lobby');
}

// ============================================================================
//  Combat resolution
// ============================================================================
/** the attacker's move was stopped (shield / counter / clash): effects + punishment */
const STUN_IFRAMES = 84;                                    // grab stun / counter stun: 1.4 s of i-frames from the moment the stun starts
function counterStun(attacker, defender) {
    bump(defender, 'counters');
    attacker.interrupt();
    attacker.clashStunTimer = STUN;                         // 0.5 s
    attacker.invincibleTimer = Math.max(attacker.invincibleTimer, STUN_IFRAMES);
    attacker.vx = (attacker.x < defender.x ? -1 : 1) * 5;
    attacker.vy = -4;
}

/** Bulwark's riposte lands: both are thrown apart; up close the sword goes into the chest (stun 1.8 s + bleeding) */
function bulwarkRiposte(bw, atk) {
    const dx = atk.x - bw.x, dy = atk.y - bw.y, close = Math.abs(dx) < 120 && Math.abs(dy) < 110;
    bw.riposteT = 0; bw.riposteAfter = 0; bw.facing = dx >= 0 ? 1 : -1;
    audio.playHit(true); S.screenShake = Math.max(S.screenShake, 12);
    fx('burn', (bw.x + atk.x) / 2, (bw.y + atk.y) / 2, 0, 0, 'blood'); dripBlood((bw.x + atk.x) / 2, (bw.y + atk.y) / 2);
    atk.interrupt();
    if (close) { audio.playStab();
        bw.stabT = 60; bw.actionLock = 60; bw._stabVictim = atk; bw.activeMove = null; bw.vx = bw.vy = 0;                   // the stab-and-pull animation takes 0.8 s; both are untouchable for 1 s
        bw.invincibleTimer = Math.max(bw.invincibleTimer, 64); atk.invincibleTimer = Math.max(atk.invincibleTimer, 64);
        atk.hitstun = 108; atk.vx = 0; atk.vy = 0; atk.bleedT = 240; atk.bleedTick = 0; atk._bleedBy = bw; atk.lastHitBy = bw; atk.lastHitT = 0;
    } else {
        const d = dx >= 0 ? 1 : -1;
        atk.clashStunTimer = STUN; atk.invincibleTimer = Math.max(atk.invincibleTimer, STUN_IFRAMES); atk.vx = d * 9; atk.vy = -4; bw.vx = -d * 6; bw.vy = -3; bw.actionLock = 0; bw.riposteCd = 0;   // a successful counter has no cooldown
    }
}
/** a projectile met Bulwark's riposte: homing ones home back to their owner, straight ones go back twice as fast */
function reflectOrb(o, bw) {
    const prev = o.owner; if (!prev) return;
    if (o.homing || o.curve) { o.homing = prev; o.curve = 0; o.homingDelay = 0; o.homingTurn = 0.25; o.spd = o.spd || Math.hypot(o.vx, o.vy) || 10; }
    else { const a = Math.atan2(prev.y - o.y, prev.x - o.x), sp = Math.min(40, (Math.hypot(o.vx, o.vy) || 8) * 2); o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp; o.grav = 0; }
    o.owner = bw; o.age = 0; o.life = Math.max(o.life || 0, 160); o.reflected = true;
    bw.riposteT = 0; bw.riposteAfter = 0; bw.riposteCd = 0; bw.actionLock = 0; bw.activeMove = null;      // parried: counter (and every other move) is ready again at once
    if (o.ctrl && o.ctrl.sx && o.ctrl.sx.k === 'thunder') { o.ctrl.sx = null; o.ctrl.actionLock = Math.max(o.ctrl.actionLock, 10); } o.ctrl = null; o.shieldCounter = false; o.cap = null;
    audio.playParry(); S.screenShake = Math.max(S.screenShake, 8); fx('counter', bw.x, bw.y); createParticles(o.x, o.y, '#e2e8f0', 10);
}

function handleBlocked(res, attacker, defender) {
    if (res === 'riposte') { bulwarkRiposte(defender, attacker); return; }
    if (res === 'downclash') {                                  // Bulwark's counter meets a down move: both are stunned exactly like a grab clash
        audio.playShield(); S.screenShake = Math.max(S.screenShake, 12);
        const mx = (attacker.x + defender.x) / 2, my = (attacker.y + defender.y) / 2; createParticles(mx, my, '#e2e8f0', 16); fx('block', mx, my);
        for (const f of [attacker, defender]) { f.interrupt(); f.vx = f.vy = 0; f.clashStunTimer = 120; f.invincibleTimer = Math.max(f.invincibleTimer, STUN_IFRAMES); }
        defender.riposteT = 0; defender.riposteAfter = 0; return;
    }
    if (res === 'shield') {
        audio.playShield();
        defender.shieldHealth = Math.max(0, defender.shieldHealth - 10);
        createParticles(defender.x, defender.y, '#22d3ee', 10);
        fx('block', defender.x, defender.y);
        counterStun(attacker, defender);
    } else if (res === 'countered') {
        audio.playHit(true);
        S.screenShake = Math.max(S.screenShake, 10);
        createParticles(defender.x, defender.y, '#f472b6', 14);
        fx('counter', defender.x, defender.y);
        counterStun(attacker, defender);
    } else {                                                // clash: both moves cancel
        audio.playShield();
        const mx = (attacker.x + defender.x) / 2, my = (attacker.y + defender.y) / 2;
        createParticles(mx, my, '#e0f2fe', 14);
        fx('block', mx, my);
        const d = attacker.x < defender.x ? -1 : 1;
        attacker.activeHitbox = null; defender.activeHitbox = null;
        attacker.swingHit = true; defender.swingHit = true;
        attacker.vx = d * 6; defender.vx = -d * 6;
    }
}

/** speed of a grab throw: 0.7x the knockback of a side melee hit at the victim's current percent */
function grabThrowSpeed(victim) {
    const m = SWING.SIDE_RIGHT;
    const eff = victim.damage / 2;
    const force = ((eff / 10) + (eff * m.damage / 20)) * m.kbg + m.bkb;
    return force * 0.85 * GRAB_KB_SCALE * charOf(victim.char).kb;
}

/** apply damage + knockback / stun for a landed hit */
/** hitting someone with a melee while holding a balloon pops it: they get a floaty 2 s (0.65x gravity) */
function balloonPop(attacker, defender, hb) {
    if (!attacker.balloon || (hb.type && hb.type !== 'J')) return;
    attacker.balloon = false; attacker.maxJumps = charOf(attacker.char).jumps; attacker.jumpsLeft = Math.min(attacker.jumpsLeft, attacker.maxJumps);
    defender.gravT = 120;
    fx('burn', attacker.x, attacker.y - 40); audio.playHit(false);
}

/** Ember (rolling) vs a foe in the middle of a Side-F move: cancel the foe's move and stun them. True when it happened. */
function rollInVoidZone(f) {
    const top = STAGE.y, bot = STAGE.y + STAGE.height;
    const L = STAGE.x + 12, R = STAGE.x + STAGE.width - 12;
    if (f.x < L || f.x > R) return true;
    if (f.y > bot + 4) return true;
    if (f.y > top + 8 && (f.x <= L || f.x >= R)) return true;
    return false;
}

function rollTier(c) { return c >= 0.9 ? 2 : (c >= 0.4 ? 1 : 0); }   // 0 red, 1 white, 2 blue

/** Ember Fireball Roll beats other side/up specials; white beats red, blue beats white when both rolling */
function emberCounter(em, foe) {
    if (!em.sx || em.sx.k !== 'roll' || em.sx.ph !== 'roll') return false;
    const nearBody = (a, b, pad = 8) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + pad && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + pad;
    // roll vs roll: higher tier wins
    if (foe.sx && foe.sx.k === 'roll' && foe.sx.ph === 'roll') {
        if (!nearBody(em, foe, 12)) return false;
        const te = rollTier(em.sx.c || 0), tf = rollTier(foe.sx.c || 0);
        if (te === tf) {                                     // same tier: both bounce out
            em.endRoll(); foe.endRoll();
            em.vx = -em.facing * 6; foe.vx = -foe.facing * 6;
            fx('block', (em.x + foe.x) / 2, (em.y + foe.y) / 2); S.screenShake = Math.max(S.screenShake, 10);
            return true;
        }
        if (te < tf) return false;                           // handled when roles swap
        // em wins: cancel foe roll, stun + light hit
        foe.sx = null; foe.activeHitbox = null; foe.activeMove = null; foe._rollCarry = null;
        for (const f of fighters) if (f._rollCarry === foe) f._rollCarry = null;
        foe.armorT = 0; foe.invincibleTimer = 0; foe.actionLock = Math.max(foe.actionLock, 24);
        const ang = Math.atan2(foe.y - em.y - 25, (foe.x - em.x) || em.facing || 1);
        const dmg = te >= 2 ? 19 : 8;
        launch(em, foe, { damage: dmg, bkb: te >= 2 ? 9.6 * 0.4 : 8, kbg: te >= 2 ? 0.72 * 0.4 : 0.7, angle: ang, x: em.x, y: em.y });
        fx('block', foe.x, foe.y); S.screenShake = Math.max(S.screenShake, 10);
        return true;
    }
    // Fireball Roll also beats a foe who is still charging any neutral Core.
    if (foe.fActive && foe.fNeutral && Math.hypot(em.x - foe.x, em.y - foe.y) < 92) {
        foe.interrupt(); foe.clashStunTimer = Math.max(foe.clashStunTimer, 36);
        fx('block', foe.x, foe.y); S.screenShake = Math.max(S.screenShake, 8);
        return true;
    }
    if (!em.activeHitbox || (foe.sideT <= 0 && foe.upT <= 0)) return false;
    const h = em.activeHitbox;
    const near = (b) => Math.abs(b.x - foe.x) < (b.w + foe.width) / 2 && Math.abs(b.y - foe.y) < (b.h + foe.height) / 2;
    const fb = foe.activeHitbox, hitEm = fb && Math.abs(fb.x - em.x) < (fb.w + em.width) / 2 && Math.abs(fb.y - em.y) < (fb.h + em.height) / 2;
    if (!near(h) && !hitEm) return false;
    foe.sideT = 0; foe.upT = 0; foe.spiralT = 0; foe.sx = null; foe.activeHitbox = null; foe.activeMove = null; foe.armorT = 0; foe.invincibleTimer = 0;
    foe.attackTimer = 0; foe.swing = null; foe.actionLock = Math.max(foe.actionLock, 20);
    (em.swingHitSet || (em.swingHitSet = new Set())).add(foe);
    fx('block', foe.x, foe.y); S.screenShake = Math.max(S.screenShake, 8);
    launch(em, foe, { ...h, stun: 36, bkb: 0, kbg: 0 });
    return true;
}

/** Kill cam ("final blow"): when a hit will really knock the victim out, play freezes completely for a moment (zoom + blue screen for the two involved),
 *  then the hit's velocity is released. The prediction follows the knockback, the whole stun (hit-stun + any stun after it) and then asks whether the victim could
 *  still get back with their own jumps from where the stun leaves them. */
const KC_DUR = 1.2;                                          // seconds of real time (72 frozen steps)
export function willKO(def) {
    let x = def.x, y = def.y, vx = def.vx, vy = def.vy;
    const hs = Math.max(0, def.hitstun), H = hs + Math.max(0, def.clashStunTimer) + Math.max(0, def._stunAfter || 0);          // the whole time they cannot act
    const sx0 = STAGE.x, sx1 = STAGE.x + STAGE.width, top = STAGE.y, bot = STAGE.y + STAGE.height, hh = (def.height || 80) / 2, hw = (def.width || 50) / 2;
    for (let i = 0; i < H; i++) {
        const py = y, px = x;
        if (i < hs) { vx *= 0.98; vy = Math.min(vy + WORLD.gravity * 0.75, WORLD.terminalVelocity); }                                   // tumbling
        else { vx = 0; vy = Math.min(vy + WORLD.gravity, WORLD.terminalVelocity); }                                                    // stunned: no sideways movement at all
        x += vx; y += vy;
        if (x < BLAST_ZONES.left || x > BLAST_ZONES.right || y < BLAST_ZONES.top || y > BLAST_ZONES.bottom) return true;                // gone before they can do anything
        const feet = y + hh, pfeet = py + hh;
        if (x > sx0 - hw && x < sx1 + hw && feet > top && pfeet < bot + 40) {                                                           // ran into the stage block (feet / body, not the centre)
            if (pfeet <= top + 3) { if (i >= hs) return false; y = top - hh; vy = -Math.abs(vy) * 0.35; vx *= 0.9; }                    // lands on top (bounces while still ragdolled)
            else if (px <= sx0 - hw || px >= sx1 + hw) { x = px; vx = -vx * 0.5; }                                                      // bounces off the side wall
            else { y = py; vy = Math.abs(vy) * 0.3; }                                                                                  // bonks the underside
        }
    }
    // control is back: only a victim who is far beyond what their jumps and a recovery move can reach counts (they can always cancel upward speed by diving)
    const ch = charOf(def.char), jumps = Math.max(1, ch.jumps || 3), walk = ch.walk || 1;
    const dyBelow = Math.max(0, y - top) + Math.max(0, vy) * 12;
    const dxOut = Math.max(0, sx0 - x, x - sx1) + (((x < sx0 && vx < -4) || (x > sx1 && vx > 4)) ? Math.abs(vx) * 6 : 0);
    const reachY = 2250 + jumps * 100, reachX = 1550 + jumps * 100 * walk;
    return dyBelow > reachY || dxOut > reachX || dyBelow / reachY + dxOut / reachX > 1.25;
}
function applyKillCam(ai, di) {
    S.kcT = KC_DUR; S.kcDur = KC_DUR; S.kcDef = di; S.kcAtt = ai;
    const me = S.demo ? -1 : (S.match ? S.mySlot : 0);
    S.kcFull = !S.demo && (me === ai || me === di);
}
function startKillCam(att, def) {
    if (S.kcT > 0 || S.replay || S.demo || S.gameMode === 'training' || S.online === 'guest' || !att || att === def) return;
    if (def.stocks <= 0 || def.out || !willKO(def)) return;
    def._kcInv = 400;
    const ai = idxOf(att), di = idxOf(def);
    S.kcHold = { f: def, x: def.x, y: def.y, vx: def.vx, vy: def.vy, hitstun: def.hitstun };                // exactly this is released after the freeze
    S.kcPause = Math.round(KC_DUR * 60);
    applyKillCam(ai, di);
    fx('killcam', def.x, def.y, ai, di, 1);
}
function launch(attacker, defender, hb) {
    if (attacker && attacker !== defender && attacker.ghostT > 0) return;           // ghosted by Ember's Phoenix Dash or Tide's bubble release: attacks do nothing
    if (defender && defender !== attacker && defender.invincibleTimer > 0) return; // protected fighters cannot take damage
    if (S.sdNoDmg) hb = { ...hb, damage: 0 };                       // timer sudden death: hits do not add percent
    if (attacker && attacker !== defender && hb.damage !== undefined) {                          // perks
        const m = (1 + perkOf(attacker, 'dmg') + (attacker.stocks === 1 ? perkOf(attacker, 'last') : 0)) * (1 + perkOf(defender, 'taken'));
        const k = (1 + perkOf(attacker, 'kb')) * (1 + perkOf(defender, 'kbTaken'));
        if (m !== 1 || k !== 1) hb = { ...hb, damage: (hb.damage || 0) * m, bkb: (hb.bkb || 0) * k };
    }
    if (attacker && attacker !== defender && DMG_MULT[attacker.char] && hb.damage) hb = { ...hb, damage: hb.damage * DMG_MULT[attacker.char] };      // balance pass
    if (attacker && attacker !== defender && attacker._edgeBoost && attacker.cloakT > 0 && hb.damage) { hb = { ...hb, damage: hb.damage * 1.5 }; attacker._edgeBoost = false; }      // Umbra: the hit after a re-backstab inside the cloak
    if (attacker && attacker !== defender && attacker.bleedT > 0) hb = { ...hb, damage: (hb.damage || 0) * 0.5, bkb: (hb.bkb || 0) * 0.5, kbg: (hb.kbg || 0) * 0.5 }; // bleeding fighters deal 50% less damage and knockback
    if (attacker && attacker !== defender) {                          // COMBO LIMIT (everyone): hits inside a 1.5 s window stack; from the 4th the knockback grows,
        if (defender.comboT <= 0) defender.comboN = 0;                // from the 5th any stun turns into knockback, and the 6th is a big finisher that breaks the combo
        if (defender.comboT <= 78 || defender.comboN === 0) { defender.comboN++; defender.comboT = 90; }       // one move's multi-hit counts once
        const n = defender.comboN;
        if (n >= 4) {
            const k = n - 3;
            hb = { ...hb, bkb: (hb.bkb || 0) + 2.2 * k, kbg: (hb.kbg || 0) * (1 + 0.3 * k) };
            if (n >= 5 && hb.stun) hb = { ...hb, stun: 0, lift: 0, radial: false, mirror: false, bkb: Math.max(hb.bkb, 9), kbg: Math.max(hb.kbg, 0.9), angle: defender.x >= attacker.x ? -0.6 : Math.PI + 0.6 };
            if (n >= 6) { hb = { ...hb, bkb: Math.max(hb.bkb, 10.5), kbg: Math.max(hb.kbg, 1) }; defender.comboN = 0; defender.comboT = 0; defender.invincibleTimer = Math.max(defender.invincibleTimer, 40); }
        }
    }
    if (attacker && attacker !== defender) {
        bump(attacker, 'dealt', hb.damage || 0); bump(attacker, 'hits');
        if (!S.demo && S.gameMode !== 'training') { const a = msOf(idxOf(attacker)), d = msOf(idxOf(defender)); defender._lhN = S.recN || 0; a.dealt += hb.damage || 0; a.hits++; d.taken += hb.damage || 0; a.combo = Math.max(a.combo, defender.comboN || 1); }
        if (attacker === viewerFighter() && S.stats) S.stats.combo = Math.max(S.stats.combo, defender.comboN || 0);
        bump(defender, 'taken', hb.damage || 0);
        defender._lastHit = { by: attacker, type: hb.type || 'J', combo: defender.comboN || 1, t: 0 };
    }
    if (attacker && attacker !== defender && attacker.char === 'volt') {
        if (hb.stun && zapGate(defender)) {       // Volt's 3rd stun on the same foe inside 10 s is a plain melee-strength knockback instead
            hb = { ...hb, stun: 0, lift: 0, radial: false, mirror: false, damage: hb.damage, bkb: 9, kbg: 0.9, angle: defender.x >= attacker.x ? -0.6 : Math.PI + 0.6 };
        } else if (hb.stun) hb = { ...hb, stun: 30 };                 // every Volt stun lasts 0.5 s
        defender.invincibleTimer = Math.max(defender.invincibleTimer, 36);   // 0.6 s of i-frames for anyone Volt hits
    }
    if (attacker && attacker !== defender && defender.sx && defender.sx.k === 'roll' && defender.sx.ph === 'roll') {   // rolling Ember: takes 90% damage, no knockback, the roll just PAUSES 0.5 s (the roll's timer pauses too) and then carries on
        defender.damage += hb.damage * 0.9; defender.lastHitBy = attacker; defender.lastHitT = 0; defender.sx.pause = 30;
        S.screenShake = Math.max(S.screenShake, 6); audio.playHit(false); createParticles(defender.x, defender.y, '#fb923c', 8); fx('hit', defender.x, defender.y, 10, hb.angle);
        return;
    }
    if (attacker && attacker !== defender && defender.sx && defender.sx.k === 'roll' && defender.sx.ph === 'roll' && (defender.sx.c || 0) >= 0.9) {
        // BLUE fireball: nothing stops it. It still takes the damage, but ploughs straight through with no flinch, knockback or stun;
        // the hit costs it speed (0.6x) for the rest of this roll, and it keeps damaging whatever it touches.
        defender.damage += hb.damage; defender.lastHitBy = attacker; defender.lastHitT = 0;
        defender.sx.slow = 0.6;
        S.screenShake = Math.max(S.screenShake, 5); audio.playHit(false);
        createParticles(defender.x, defender.y, '#38bdf8', 10); fx('block', defender.x, defender.y);
        return;
    }
    if (hb.phoenix && attacker !== defender) { defender.invincibleTimer = Math.max(defender.invincibleTimer, 60); defender.ghostT = 60; }   // hit by the rockets / the last 5 frames of the dash: 1 s of invincibility
    if (attacker && attacker.aiMove && !attacker.aiMove.hit && attacker !== defender) { attacker.aiMove.hit = true; const e = aiStats[attacker.level] && aiStats[attacker.level][attacker.char + ':' + attacker.aiMove.slot]; if (e) e.hit++; }
    if (hb.radial || hb.mirror) {                           // area hits push away from their centre / mirror to the victim's side
        hb = { ...hb };
        if (hb.radial) hb.angle = Math.atan2(defender.y - hb.y - 20, (defender.x - hb.x) || 1);
        else if (defender.x < hb.x) hb.angle = Math.PI - hb.angle;
    }
    if (defender.armorT > 0 && !hb.stun) {                  // armour: it hurts, but no flinch and no knockback
        defender.damage += hb.damage; defender.lastHitBy = attacker; defender.lastHitT = 0;
        if (defender.heldItem && defender.heldItem.type === 'FIRESTICK') burnStick(defender);
        S.screenShake = Math.max(S.screenShake, 6); audio.playHit(false);
        createParticles(defender.x, defender.y, '#e2e8f0', 8); fx('block', defender.x, defender.y);
        return;
    }
    if (defender.trapId) { const i = orbs.findIndex(o => o.id === defender.trapId); if (i >= 0) { fx('explosion', orbs[i].x, orbs[i].y, 80, 0, 'water'); orbs.splice(i, 1); } defender.trapId = 0; defender.invincibleTimer = Math.max(defender.invincibleTimer, 60); defender.ghostT = Math.max(defender.ghostT, 60); return; }
    if (defender.sx && defender.sx.k === 'roll' && defender.sx.ph === 'charge') {   // hit while charging the roll: a 1 s frozen stun (like a broken shield), no knockback
        defender.damage += hb.damage; defender.lastHitBy = attacker; defender.lastHitT = 0;
        defender.sx = null; defender.fActive = false; defender.chargeFrames = 0; defender.clashStunTimer = 60; defender.vx = defender.vy = 0;
        S.screenShake = Math.max(S.screenShake, 10); audio.playHit(true); createParticles(defender.x, defender.y, '#fb923c', 14); fx('hit', defender.x, defender.y, 12, hb.angle);
        return;
    }
    defender.interrupt();
    defender.damage += hb.damage;
    if (S.gameMode === 'training' && attacker && attacker !== defender) {                // numbers for the training readout
        const mv = (attacker.specialKind || attacker.attackKind || hb.type || 'hit'), key = attacker.char + ' ' + mv;
        S.lastHit = { char: attacker.char, move: mv, dmg: hb.damage, combo: defender.comboN, def: defender, stunMax: 0, age: 0 };
        S.moveStats = S.moveStats || {}; const ms = S.moveStats[key] || (S.moveStats[key] = { n: 0, dmg: 0, stun: 0 });
        ms.n++; ms.dmg += hb.damage; S.lastHit.stat = ms;
    }
    if (hb.burn) { defender.burnT = hb.burn.t; defender.burnDmg = hb.burn.dmg; defender.burnBy = attacker; }
    defender.lastHitBy = attacker; defender.lastHitT = 0;
    if (defender.heldItem && defender.heldItem.type === 'FIRESTICK') burnStick(defender);      // getting hit shortens the firestick

    if (defender.isAI && defender.level === 'hard' && defender.level !== 'static') {
        defender.incomingHitCount++;
        if (!hb.stun && defender.grounded && defender.incomingHitCount >= (defender.skill >= 1.6 ? 2 : 3) && defender.rollCooldown <= 0) {
            defender.incomingHitCount = 0;
            const away = Math.sign(defender.x - attacker.x) || 1;
            if (defender.executeRoll(true, away)) {            // the bot slips out of the combo with a roll
                audio.playHit(false);
                fx('hit', defender.x, defender.y, 8, hb.angle);
                return;
            }
        }
    } else if (!defender.isAI) {
        attacker.incomingHitCount = 0;
    }

    if (hb.stun) {                                          // headbutt: freeze them for 0.5 s, no launch
        defender.clashStunTimer = hb.stun;
        defender.vx = 0;
        defender.vy = hb.lift ? -hb.lift : 0;
        S.screenShake = Math.max(S.screenShake, 14);
        audio.playHit(true);
        createParticles(defender.x, defender.y, '#a78bfa', 18);
        fx('hit', defender.x, defender.y, 14, hb.angle);
        return;
    }

    if (hb.pull) {                                          // Whirlpool / Bubble: drag them toward the centre
        const px = hb.px !== undefined ? hb.px : hb.x, py = hb.py !== undefined ? hb.py : hb.y;
        const dx = px - defender.x, dy = py - defender.y, d = Math.hypot(dx, dy) || 1;
        const pv = Math.min(hb.pull, d * 0.5);                  // a very strong pull still stops at the centre
        defender.vx = dx / d * pv; defender.vy = dy / d * pv - 1;
        defender.hitstun = 22; defender.grounded = false;
        S.screenShake = Math.max(S.screenShake, 6); audio.playHit(false);
        createParticles(defender.x, defender.y, '#7dd3fc', 10); fx('hit', defender.x, defender.y, 6, hb.angle);
        return;
    }

    if (hb.fixed) {                                         // Spiral's chained hits keep the victim in the whirlwind
        defender.vx = hb.fixed.vx;
        defender.vy = hb.fixed.vy;
        defender.hitstun = hb.fixed.hitstun;
        defender.grounded = false;
        if (hb.rollCarry) defender._rollCarry = attacker;   // Ember roll: stick to the roller
        S.screenShake = Math.max(S.screenShake, 5);
        audio.playHit(false);
        createParticles(defender.x, defender.y, '#c4b5fd', 8);
        fx('hit', defender.x, defender.y, 8, hb.angle);
        return;
    }

    const effectiveDamage = defender.damage / 2;
    const percentFactor = (effectiveDamage / 10) + (effectiveDamage * hb.damage / 20);
    const kbForce = ((percentFactor * hb.kbg) + hb.bkb) * charOf(defender.char).kb;      // slow characters take less, fast ones more

    defender.vx = Math.cos(hb.angle) * kbForce * 0.85;
    defender.vy = Math.sin(hb.angle) * kbForce * 0.85;
    defender.hitstun = hb.hs || 60; defender._stunAfter = hb.stunAfter || 0;
    defender.grounded = false;

    S.screenShake = Math.min(25, Math.floor(kbForce));
    audio.playHit(kbForce > 18);
    createParticles(defender.x, defender.y, '#f59e0b', Math.floor(kbForce));
    fx('hit', defender.x, defender.y, kbForce, hb.angle);
    startKillCam(attacker, defender);
}

function explodeOrb(o) {
    if (o.ctrl && o.ctrl.sx && o.ctrl.sx.k === 'thunder') { o.ctrl.sx = null; o.ctrl.actionLock = Math.max(o.ctrl.actionLock, 10); }
    if (o.trap) for (const f of fighters) if (f.trapId === o.id) { f.trapId = 0; f.invincibleTimer = Math.max(f.invincibleTimer, 60); f.ghostT = Math.max(f.ghostT, 60); }
    const R = o.R !== undefined ? o.R : 80 + 90 * o.charge;
    const baseDmg = o.d !== undefined ? o.d : 4 + 16 * o.charge;  // Luminent: min 4, max 20; every character has its own numbers
    const dmg = baseDmg * (o.owner && o.owner.bleedT > 0 ? 0.5 : 1);
    fx('explosion', o.x, o.y, R, o.charge, o.owner ? STYLE_OF[o.owner.char] : 0);
    S.screenShake = Math.max(S.screenShake, 8 + 10 * o.charge);
    audio.playHit(o.charge > 0.5);
    createParticles(o.x, o.y, o.color, 18 + Math.floor(24 * o.charge));
    createParticles(o.x, o.y, '#ffffff', 10);

    const pierce = !!(o.pierce || o.kind === 'boulder');   // Terra Boulder: breaks shield, full knockback
    for (const t of foesOf(o.owner)) {
        if ((t.invincibleTimer > 0 && !o.shieldPass) || t.stocks <= 0) continue;
        const cx = Math.max(t.x - t.width / 2, Math.min(o.x, t.x + t.width / 2));
        const cy = Math.max(t.y - t.height / 2, Math.min(o.y, t.y + t.height / 2));
        if (Math.hypot(o.x - cx, o.y - cy) > R) continue;

        if (pierce) {
            // hard-break shield: no block VFX, normal launch
            if (t.isShielding) {
                t.isShielding = false;
                t.shieldHold = 0;
                t.shieldHealth = 0;
                fx('counter', t.x, t.y);
            }
            launch(o.owner, t, {
                damage: dmg, bkb: o.bkb !== undefined ? o.bkb : (10 + 8 * o.charge) / 2, kbg: o.kbg !== undefined ? o.kbg : 1.1 / 2,
                angle: Math.atan2(t.y - o.y - 25, (t.x - o.x) || o.vx), x: o.x, y: o.y, pull: o.pull || 0, stun: o.stun || 0, phoenix: !!o.phoenix,
            });
            continue;
        }

        const res = o.shieldPass ? 'hit' : interaction('CORE', t);
        if (res === 'hit' && o.noKb) {                       // Tide's bubble: damage only, no knockback, no stun, no hit-reaction
            if (!S.sdNoDmg) t.damage += dmg; t.lastHitBy = o.owner; t.lastHitT = 0; fx('hit', t.x, t.y, 6, 0); createParticles(t.x, t.y, '#7dd3fc', 8);
        } else if (res === 'hit') {
            launch(o.owner, t, {
                damage: dmg, bkb: o.bkb !== undefined ? o.bkb : (10 + 8 * o.charge) / 2, kbg: o.kbg !== undefined ? o.kbg : 1.1 / 2,
                angle: Math.atan2(t.y - o.y - 25, (t.x - o.x) || o.vx), x: o.x, y: o.y, pull: o.pull || 0, stun: o.stun || 0, phoenix: !!o.phoenix,
            });
        } else if (res === 'shield') {
            audio.playShield();
            t.shieldHealth = Math.max(0, t.shieldHealth - 10);
            fx('block', t.x, t.y);
        } else {
            fx('counter', t.x, t.y);
        }
    }
}

/** Ember's cluster bomb ball: flies straight (no gravity), sticks to the first surface it meets, goes off when a foe touches it, on the owner's melee, or after 3 s */
function updateBomb(o, ok) {
    o.life -= ok;
    if (!o.stuck) {
        o.x += o.vx * ok; o.y += o.vy * ok;
        if (o.x < -600 || o.x > WORLD.width + 600 || o.y < -600 || o.y > WORLD.height + 600) { dropOrb(o); return; }
        const r = o.r * 0.45;                                       // the surface only stops the bubble's core, so a big bubble can skim along the floor; it sticks when it flies INTO a face
        if (o.x + r > STAGE.x && o.x - r < STAGE.x + STAGE.width && o.y + r > STAGE.y && o.y - r < STAGE.y + STAGE.height) {
            const dl = o.x + r - STAGE.x, dr = STAGE.x + STAGE.width - (o.x - r), dt = o.y + r - STAGE.y, db = STAGE.y + STAGE.height - (o.y - r), m = Math.min(dl, dr, dt, db);
            const into = (m === dt && o.vy > 0.5) || (m === db && o.vy < -0.5) || (m === dl && o.vx > 0.5) || (m === dr && o.vx < -0.5);
            if (into) {
                if (m === dt) o.y = STAGE.y - r; else if (m === db) o.y = STAGE.y + STAGE.height + r; else if (m === dl) o.x = STAGE.x - r; else o.x = STAGE.x + STAGE.width + r;
                o.stuck = true; o.vx = o.vy = 0;
            }
        } else for (const pf of STAGE.platforms) {
            if (o.vy > 0.5 && o.x > pf.x && o.x < pf.x + pf.w && Math.abs(o.y - pf.y) < r + 6) { o.y = pf.y - r; o.stuck = true; o.vx = o.vy = 0; break; }
        }
    }
    if (o.age % 3 === 0) createParticles(o.x + (Math.random() - 0.5) * o.r, o.y + (Math.random() - 0.5) * o.r, '#fb923c', 1);       // the burn-tick sparks drifting inside the bubble
    for (const t of foesOf(o.owner)) {
        if (t.stocks <= 0 || !isAlive(t)) continue;
        const cx = Math.max(t.x - t.width / 2, Math.min(o.x, t.x + t.width / 2)), cy = Math.max(t.y - t.height / 2, Math.min(o.y, t.y + t.height / 2));
        if (Math.hypot(o.x - cx, o.y - cy) < o.r) { bombBurst(o); return; }
    }
    if (o.life <= 0) bombBurst(o);
}
function bombBurst(o) {
    if (!orbs.includes(o)) return;
    dropOrb(o);
    fx('explosion', o.x, o.y, o.R, 0.7, STYLE_OF[o.owner.char]); S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true); createParticles(o.x, o.y, '#fb923c', 22);
    for (const t of foesOf(o.owner)) {
        if (t.stocks <= 0 || !isAlive(t) || t.invincibleTimer > 0) continue;
        const cx = Math.max(t.x - t.width / 2, Math.min(o.x, t.x + t.width / 2)), cy = Math.max(t.y - t.height / 2, Math.min(o.y, t.y + t.height / 2));
        if (Math.hypot(o.x - cx, o.y - cy) > o.R) continue;
        if (t.isShielding) { audio.playShield(); t.shieldHealth = Math.max(0, t.shieldHealth - 10); fx('block', t.x, t.y); continue; }
        launch(o.owner, t, { damage: o.d, bkb: o.bkb, kbg: o.kbg, angle: Math.atan2(t.y - o.y - 25, (t.x - o.x) || 1), x: o.x, y: o.y });          t.hitstun = Math.max(t.hitstun, 30);   // 2 damage, 0.3x rocket knockback, 0.5 s stun, then the burn
        t.bombN = 5; t.bombT = 0; t.bombBy = o.owner;            // 5 ticks of 2 over 3 s (re-getting hit restarts it, it does not stack)
    }
}
function dropOrb(o) { const k = orbs.indexOf(o); if (k >= 0) orbs.splice(k, 1); }
function updateDrops() {
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.owner && !d.parried) {                                            // Bulwark's open counter also catches falling swords and rocks: the drop breaks and its owner is stunned
            const bw = fighters.find(e => e.riposteT > 0 && isAlive(e) && e !== d.owner && foesOf(e).includes(d.owner) &&
                Math.abs(e.x - d.x) < e.width / 2 + d.w / 2 + 60 && Math.abs(e.y - d.y) < e.height / 2 + d.h / 2 + 60);
            if (bw) {
                drops.splice(i, 1); bw.riposteT = 0; bw.riposteAfter = 0; bw.riposteCd = 0; bw.actionLock = 0; bw.activeMove = null;
                audio.playParry(); S.screenShake = Math.max(S.screenShake, 10); fx('counter', d.x, d.y); createParticles(d.x, d.y, d.kind === 'rock' ? '#a8a29e' : '#e2e8f0', 14);
                counterStun(d.owner, bw); continue;
            }
        }
        let up = false;
        const sl = slowAt(d.x, d.y);                                        // clock bubbles slow falling swords and rocks too; they leave 2x faster
        if (sl < 1) d._wasSlow = true; else if (d._wasSlow) { d._wasSlow = false; d._boost = true; fx('block', d.x, d.y); }
        const dk = sl < 1 ? sl : d._boost ? 2 : 1;
        if (d.fly) {                                            // Bulwark's released Up-F sword: rises while slowing, then falls
            const F = d.fly; F.f += dk;
            up = F.f <= F.N;
            d.y = up ? F.y0 - (F.v0 * F.f - F.v0 * F.f * F.f / (2 * F.N)) : F.yA + 0.5 * F.g * (F.f - F.N) * (F.f - F.N);
            if (up) for (const t of foesOf(d.owner)) {
                if (d.hitUp.has(t) || t.invincibleTimer > 0 || t.stocks <= 0) continue;
                if (Math.abs(t.x - d.x) < d.w / 2 + t.width / 2 && Math.abs(t.y - d.y) < d.h / 2 + t.height / 2) {
                    d.hitUp.add(t);
                    if (interaction('SPIRAL', t, true) === 'hit') { t.interrupt(); t.lastHitBy = d.owner; t.lastHitT = 0; t.hitstun = Math.max(t.hitstun, 4); d.caught.push(t); S.screenShake = Math.max(S.screenShake, 6); audio.playSpear(); createParticles(t.x, t.y, '#e2e8f0', 10); fx('hit', t.x, t.y, 10, -Math.PI / 2); }      // speared on the way up: it carries them along
                }
            }
        } else d.y += d.v * dk;
        if (!up) for (const t of foesOf(d.owner)) {                      // anyone in the path gets hit once
            if (d.hit.has(t) || t.invincibleTimer > 0 || t.stocks <= 0 || (d.caught && d.caught.includes(t))) continue;
            if (Math.abs(t.x - d.x) < d.w / 2 + t.width / 2 && Math.abs(t.y - d.y) < d.h / 2 + t.height / 2) {
                d.hit.add(t);
                const res = interaction('SPIRAL', t, true);
                if (res === 'hit' && d.fly) {            // the Up-F sword spears them and drags them down with it
                    t.interrupt(); if (!S.sdNoDmg) t.damage += d.dmg; t.lastHitBy = d.owner; t.lastHitT = 0; t.hitstun = Math.max(t.hitstun, 4); d.caught.push(t);
                    S.screenShake = Math.max(S.screenShake, 8); audio.playSpear(); createParticles(t.x, t.y, '#e2e8f0', 12); fx('hit', t.x, t.y, 12, Math.PI / 2);
                } else if (res === 'hit') launch(d.owner, t, { damage: d.dmg, bkb: d.bkb, kbg: d.kbg, angle: -1.25, mirror: true, x: d.x, y: d.y });
                else if (res === 'shield') { audio.playShield(); t.shieldHealth = Math.max(0, t.shieldHealth - 8); fx('block', t.x, t.y); }
            }
        }
        if (d.caught && d.caught.length) for (const t of d.caught) {                // caught foes ride the sword up and then down
            if (!isAlive(t)) continue;
            t.x += (d.x - t.x) * 0.6; t.y = d.y + (up ? 0 : d.h * 0.22); t.vx = t.vy = 0; t.grounded = false; t.hitstun = Math.max(t.hitstun, 3); t.px = t.x; t.py = t.y;
        }
        if (d.fly && !d.surface && !up && d.y >= STAGE.y + 40) {                          // fell past the stage level with nothing to land on: it bursts right there
            drops.splice(i, 1);
            for (const t of foesOf(d.owner)) {
                const caught = d.caught.includes(t);
                if (t.stocks <= 0 || (t.invincibleTimer > 0 && !caught)) continue;
                if (!caught && Math.hypot(t.x - d.x, t.y - d.y) > 230 + t.width / 2) continue;
                if (!caught && interaction('SPIRAL', t, true) !== 'hit') continue;
                launch(d.owner, t, { damage: caught ? 7 : 5, bkb: 11, kbg: 0.9, angle: caught ? -1.4 : -1.0, mirror: !caught, x: d.x, y: d.y });
                if (caught) t.invincibleTimer = Math.max(t.invincibleTimer, t.hitstun + 2);
            }
            fx('quake', d.x, d.y, 460, 0, STYLE_OF[d.owner.char] + '@'); fx('stomp', d.x, d.y, d.w * 2, 0, 'iron'); S.screenShake = Math.max(S.screenShake, 14); audio.playBurst();
            continue;
        }
        if (d.y >= d.yl && !up) {
            drops.splice(i, 1);
            if (d.fly && d.surface) {                                            // impact: area knockback; anyone dragged to or below the surface is thrown up
                const sy = d.yl + d.off, R = 230;
                for (const t of foesOf(d.owner)) {
                    const caught = d.caught.includes(t);
                    if (t.stocks <= 0 || (t.invincibleTimer > 0 && !caught)) continue;
                    if (!caught && Math.hypot(t.x - d.x, t.y - sy) > R + t.width / 2) continue;
                    if (caught) { if (t.y + t.height / 2 > sy) t.y = sy - t.height / 2; t.px = t.x; t.py = t.y; }
                    else if (interaction('SPIRAL', t, true) !== 'hit') continue;
                    launch(d.owner, t, { damage: caught ? 7 : 5, bkb: 11, kbg: 0.9, angle: caught ? -1.4 : -1.0, mirror: !caught, x: d.x, y: sy });
                    if (caught) t.invincibleTimer = Math.max(t.invincibleTimer, t.hitstun + 2);      // speared then launched: untouchable until they are out of the stun
                }
                fx('quake', d.x, sy, R * 2, 0, STYLE_OF[d.owner.char] + '@'); S.screenShake = Math.max(S.screenShake, 14); audio.playBurst();
            }
            if (d.surface) {
                const sy = d.yl + (d.off || 0); fx('stomp', d.x, sy, d.w * 1.4, 0, d.kind === 'rock' ? 'rock' : 'iron'); S.screenShake = Math.max(S.screenShake, 4); audio.playHit(false);
                createParticles(d.x, sy, d.kind === 'rock' ? '#a8a29e' : '#cbd5e1', 8);
            }
        }
    }
}

/** Ember's twin fire pillars: a direct hit deals damage and sets you on fire; standing in the flames only burns */
/** Volt's lightning trail: whoever touches it is stunned 0.7 s and has inverted controls for 2 s after */
/** count a Volt stun on this foe; true when it is the 3rd within 10 s (that one must be a knockback, and the count starts over) */
const DMG_MULT = { terra: 0.85, bulwark: 0.95, umbra: 1.1, ember: 1.08, zephyr: 1.1, volt: 1.12, tide: 1.1 };      // outgoing damage tuning per character
function zapGate(f) {
    f.zapN++; f.zapT = 600;
    if (f.zapN >= 3) { f.zapN = 0; f.zapT = 0; return true; }
    return false;
}
/** side / up / down F (and every character's version, including the charge) is "in a move" */
function inSpecialMove(f) {
    return !!(f.sx || f.sideT > 0 || f.upT > 0 || f.spiralT > 0 || f.diving || f.suplexT > 0 || f.fActive
        || (f.activeMove && ['BLINK', 'SPIRAL', 'SUPLEX', 'HEADBUTT', 'CORE'].includes(f.activeMove.type)));
}
function updateZapTrails() {
    for (let i = zapTrails.length - 1; i >= 0; i--) {
        const z = zapTrails[i];
        if (--z.life <= 0 || !z.owner) { zapTrails.splice(i, 1); continue; }
        const dx = z.x2 - z.x1, dy = z.y2 - z.y1, L2 = dx * dx + dy * dy || 1;
        for (const f of foesOf(z.owner)) {
            if (z.hit.has(f) || f.invincibleTimer > 0 || f.zapImmuneT > 0 || f.stocks <= 0 || f.out) continue;
            const stunned = f.hitstun > 0 || f.clashStunTimer > 0 || f.dizzyTimer > 0 || f.freezeTimer > 0;
            if (inSpecialMove(f) && !stunned) continue;   // trail ignores anyone mid side / up / down F unless they are stunned
            const tt = Math.max(0, Math.min(1, ((f.x - z.x1) * dx + (f.y - z.y1) * dy) / L2));
            if (Math.hypot(f.x - (z.x1 + dx * tt), f.y - (z.y1 + dy * tt)) > 46 + f.height * 0.25) continue;
            z.hit.add(f);
            if (z.push) {                                                // Lightning Rod trail: only shoves them the way the bolt travelled
                const L = Math.sqrt(L2); f.interrupt(); f.invincibleTimer = Math.max(f.invincibleTimer, 36); f.vx = dx / L * z.push; f.vy = dy / L * z.push - 2; f.hitstun = Math.max(f.hitstun || 0, 14); f.zapImmuneT = f.hitstun + 78; f.lastHitBy = z.owner; f.lastHitT = 0;
                S.screenShake = Math.max(S.screenShake, 6); audio.playHit(false); createParticles(f.x, f.y, z.wind ? '#e0f2fe' : '#60a5fa', 10); fx('hit', f.x, f.y, 10, 0); continue;
            }
            if (zapGate(f)) {                                              // 3rd stun in 10 s: knocked away like a melee hit instead
                z.hit.add(f); launch(z.owner, f, { damage: 0, bkb: 9, kbg: 0.9, angle: f.x >= z.owner.x ? -0.6 : Math.PI + 0.6, x: f.x, y: f.y });
                f.zapImmuneT = Math.max(f.hitstun, 0) + 78;
                continue;
            }
            f.interrupt(); f.clashStunTimer = 30; f.zapImmuneT = 30 + 78; f.invincibleTimer = Math.max(f.invincibleTimer, 36); f.vx = 0; f.vy = Math.min(f.vy, 0); f.lastHitBy = z.owner; f.lastHitT = 0;
            S.screenShake = Math.max(S.screenShake, 8); audio.playHit(true); createParticles(f.x, f.y, '#60a5fa', 16); fx('hit', f.x, f.y, 12, 0);
        }
    }
}
function updatePillars() {
    for (let i = pillars.length - 1; i >= 0; i--) {
        const p = pillars[i];
        if (--p.life <= 0) { pillars.splice(i, 1); continue; }
        for (const t of foesOf(p.owner)) {
            if (p.hit.has(t) || t.invincibleTimer > 0 || t.stocks <= 0) continue;
            const dy = Math.abs(t.y - (p.feet - p.h / 2));
            if (dy > p.h / 2 + t.height / 2) continue;
            const ax = Math.abs(t.x - p.x);
            if (ax < p.w / 2 + t.width / 2) {
                const res = interaction('SPIRAL', t, true);
                if (res === 'hit') { p.hit.add(t); launch(p.owner, t, { damage: p.dmg, bkb: 0, kbg: 0, angle: -1.4, stun: 60, lift: 5, burn: { t: p.burn, dmg: p.tick }, x: p.x, y: p.feet }); }
                else if (res === 'shield') { p.hit.add(t); audio.playShield(); t.shieldHealth = Math.max(0, t.shieldHealth - 8); fx('block', t.x, t.y); }
            } else if (ax < p.aw / 2 + t.width / 2) {
                p.hit.add(t); t.burnT = Math.max(t.burnT, p.burn); t.burnDmg = p.tick; t.burnBy = p.owner; fx('burn', t.x, t.y - 30);
            }
        }
    }
}

// ------------------------------------------------------------ stage hazards (an option for custom matches and training). Host-only; guests just see the effects and the hits.
// Every map: lightning strikes + geysers (also on the platforms). Frontier: falling meteors. Horizon: the stage splits into pieces that drift apart and come back.
const HAZ = { t: 0, list: [], met: [] };
let metId = 0;
function resetHazards() {
    if (SPL.base) { STAGE.x = SPL.base.x; STAGE.width = SPL.base.w; for (const q of STAGE.platforms) if (q.bx !== undefined) { q.x = q.bx; delete q.bx; } }
    HAZ.t = 0; HAZ.list.length = 0; HAZ.met.length = 0; SPL.base = null; SPL.cuts = []; SPL.t = 0; SPL.off = []; STAGE.segs = null;
}
function hazardHit(f, h) {
    f.interrupt && f.interrupt();
    if (h.kind === 'meteor') {
        if (!S.sdNoDmg) f.damage += h.dmg; f.grounded = false; f.vx = (f.x - h.x) * 0.1 + 4; f.vy = -11 - Math.min(8, f.damage * 0.03);
        f.hitstun = Math.max(f.hitstun, 26); fx('hit', f.x, f.y, 25, -0.5); audio.playHit(true); S.screenShake = Math.max(S.screenShake, 10);
        return;
    }
    const storm = h.kind === 'storm', dir = f.x >= h.x ? 1 : -1;
    if (!S.sdNoDmg) f.damage += h.dmg; f.grounded = false; f.vx = storm ? dir * 6 : (f.x - h.x) * 0.06; f.vy = -(storm ? 13 : 19) - Math.min(8, f.damage * 0.03);
    f.hitstun = Math.max(f.hitstun, storm ? 28 : 22); fx('hit', f.x, f.y, 25, dir > 0 ? -0.6 : Math.PI + 0.6); audio.playHit(true); S.screenShake = Math.max(S.screenShake, 10);
}
/** every solid top a strike can come from: the stage piece(s) and the platforms */
function hazSurfaces() {
    const out = [];
    const add = (l, r, y) => { l += 30; r -= 30; if (r < l) { const m = (l + r) / 2; l = r = m; } out.push({ x0: l, x1: r, y, w: r - l + 1 }); };
    if (STAGE.segs) for (const q of STAGE.segs) add(q.l, q.r, STAGE.y); else add(STAGE.x + 40, STAGE.x + STAGE.width - 40, STAGE.y);
    for (const q of STAGE.platforms) add(q.x, q.x + q.w, q.y);
    return out;
}
const pickSurface = (ss) => { let n = Math.random() * ss.reduce((a, q) => a + q.w + 200, 0); for (const q of ss) { n -= q.w + 200; if (n <= 0) return q; } return ss[0]; };
function spawnPillar(kind, x, y) {
    const storm = kind === 'storm', h = { kind, x, y, w: storm ? 90 : 120, h: storm ? 760 : 380, dmg: storm ? 13 : 8, t: 0, warn: storm ? 55 : 50, hit: new Set() };
    HAZ.list.push(h); fx('pillar', x, y, h.w, h.h, (storm ? 'volt' : 'water') + '@'); createParticles(x, y - 6, storm ? '#fde047' : '#7dd3fc', 8);
}
function meteorBurst(m, dmg = 12) {
    fx('meteorend', m.x, m.y, 0, 0, m.id); fx('explosion', m.x, m.y, 100, 0.3, 'fire'); createParticles(m.x, m.y, '#fb923c', 16); audio.playHit(true); S.screenShake = Math.max(S.screenShake, 11);
    for (const f of fighters) if (isAlive(f) && f.invincibleTimer <= 0 && Math.hypot(f.x - m.x, f.y - m.y) < 110 + f.width * 0.4) hazardHit(f, { kind: 'meteor', x: m.x, dmg });
}
function spawnMeteor() {
    const K = Math.max(1, WORLD.height / 2100), vx = 8.5, vy = 11.5, sy = STAGE.y - 1450 * K, alive = fighters.filter(isAlive);
    let tx, ty;
    if (alive.length && Math.random() < 0.55) { const f = alive[Math.floor(Math.random() * alive.length)]; tx = f.x + (Math.random() - 0.5) * 120; ty = f.y; }
    else { const q = pickSurface(hazSurfaces()); tx = q.x0 + Math.random() * (q.x1 - q.x0); ty = q.y - 20; }
    const T = Math.max(20, (ty - sy) / vy), m = { id: ++metId, x: tx - vx * T, y: sy, vx, vy, r: 44 };
    HAZ.met.push(m); fx('meteor', m.x, m.y, vx, vy, m.id);
}
// ---- the Horizon split: 5 s whole, 5 s apart (1 s of shaking, then a smooth drift), 5 s coming back together
const SPL_CYCLE = 900;
const ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
function splitAmt(t) { const c = t % SPL_CYCLE; return c < 360 ? 0 : c < 480 ? ease((c - 360) / 120) : c < 600 ? 1 : 1 - ease((c - 600) / 300); }
export const splitClock = () => SPL.t;
export const splitCuts = () => SPL.cuts;
export function splitShake(t) { const c = t % SPL_CYCLE; return c >= 300 && c < 360 ? 0.4 + 0.6 * (c - 300) / 60 : c >= 360 && c < 480 ? 0.4 : c >= 600 && c < 900 ? 0.18 : 0; }
function applySplit(carry = true) {
    if (!SPL.cuts.length) return;
    if (!SPL.base) SPL.base = { x: STAGE.x, w: STAGE.width };
    const X0 = SPL.base.x, W0 = SPL.base.w, fr = [0, ...SPL.cuts, 1], n = fr.length - 1, G = W0 * 0.085 * splitAmt(SPL.t);
    const offs = []; for (let k = 0; k < n; k++) offs.push(n === 2 ? (k === 0 ? -G : G) : (k - 1) * G);
    const prev = SPL.off.length === n ? SPL.off : new Array(n).fill(0);
    const pieceOf = (bx) => { for (let k = 0; k < n; k++) if (bx < X0 + fr[k + 1] * W0) return k; return n - 1; };
    if (carry) {
        for (const f of fighters) {
            if (!isAlive(f) || !f.grounded || f.isHanging) continue;
            const bottom = f.y + f.height / 2;
            if (Math.abs(bottom - STAGE.y) < 4) { const k = pieceOf(f.x - prev[pieceOf(f.x)]); f.x += offs[k] - prev[k]; }
        }
        for (const q of STAGE.platforms) {
            if (q.bx === undefined) q.bx = q.x;
            const k = pieceOf(q.bx + q.w / 2), nx = q.bx + offs[k], d = nx - q.x;
            if (d) for (const f of fighters) if (isAlive(f) && f.grounded && !f.isHanging && Math.abs(f.y + f.height / 2 - q.y) < 4 && f.x > q.x - 6 && f.x < q.x + q.w + 6) f.x += d;
        }
    }
    for (const q of STAGE.platforms) { if (q.bx === undefined) q.bx = q.x; q.x = q.bx + offs[pieceOf(q.bx + q.w / 2)]; }
    SPL.off = offs;
    if (G < 0.01) { STAGE.segs = null; STAGE.x = X0; STAGE.width = W0; return; }
    STAGE.segs = offs.map((o, k) => ({ l: X0 + fr[k] * W0 + o, r: X0 + fr[k + 1] * W0 + o, off: o }));
    STAGE.x = STAGE.segs[0].l; STAGE.width = STAGE.segs[n - 1].r - STAGE.segs[0].l;
}
function updateHazards() {
    if (!S.hazards || S.gameState !== 'playing' || S.kcPause > 0) return;
    const horizon = S.theme === 'horizon';
    if (S.online === 'guest') { if (horizon && SPL.cuts.length) { SPL.t++; applySplit(false); } return; }
    HAZ.t++;
    if (HAZ.t > 180 && HAZ.t % 210 === 0) {                                  // lightning: on a fighter's stage / platform (or anywhere)
        const alive = fighters.filter(isAlive), ss = hazSurfaces();
        let q = null, x = 0;
        if (alive.length && Math.random() < 0.6) {
            const f = alive[Math.floor(Math.random() * alive.length)];
            q = ss.filter(z => f.x > z.x0 - 40 && f.x < z.x1 + 40 && z.y >= f.y - 40).sort((a, b) => a.y - b.y)[0];
            if (q) x = Math.max(q.x0, Math.min(q.x1, f.x));
        }
        if (!q) { q = pickSurface(ss); x = q.x0 + Math.random() * (q.x1 - q.x0); }
        spawnPillar('storm', x, q.y);
    }
    if (HAZ.t > 180 && HAZ.t % 260 === 120) {                                // geysers: two at once, from the stage or the platforms
        const ss = hazSurfaces(), used = new Set();
        for (let i = 0; i < 2; i++) { const q = pickSurface(ss); if (used.has(q) && ss.length > 1) continue; used.add(q); spawnPillar('geyser', q.x0 + Math.random() * (q.x1 - q.x0), q.y); }
    }
    for (let i = HAZ.list.length - 1; i >= 0; i--) {
        const h = HAZ.list[i]; h.t++;
        if (h.t === h.warn) { fx('pillar', h.x, h.y, h.w, h.h, (h.kind === 'storm' ? 'volt' : 'water') + '!@'); audio.playZap(); S.screenShake = Math.max(S.screenShake, 6); }
        if (h.t >= h.warn && h.t < h.warn + 8) {
            for (const f of fighters) {
                if (!isAlive(f) || h.hit.has(f) || f.invincibleTimer > 0) continue;
                if (Math.abs(f.x - h.x) < h.w / 2 + f.width / 2 && f.y < h.y + 40 && f.y > h.y - h.h) { h.hit.add(f); hazardHit(f, h); }
            }
        }
        if (h.t >= h.warn + 8) HAZ.list.splice(i, 1);
    }
    if (!horizon) {                                                          // Frontier: meteors fall diagonally from the top left
        if (HAZ.t > 240 && HAZ.t % 170 === 0) spawnMeteor();
        const surf = [{ l: STAGE.x, r: STAGE.x + STAGE.width, y: STAGE.y }, ...STAGE.platforms.map(q => ({ l: q.x, r: q.x + q.w, y: q.y }))];
        for (let i = HAZ.met.length - 1; i >= 0; i--) {
            const m = HAZ.met[i], py = m.y; m.x += m.vx; m.y += m.vy;
            let boom = fighters.some(f => isAlive(f) && f.invincibleTimer <= 0 && Math.hypot(f.x - m.x, f.y - m.y) < m.r + f.width * 0.4);
            if (!boom) for (const q of surf) if (m.x > q.l - 10 && m.x < q.r + 10 && py + m.r <= q.y && m.y + m.r >= q.y) { boom = true; break; }
            if (boom) { meteorBurst(m); HAZ.met.splice(i, 1); }
            else if (m.y > BLAST_ZONES.bottom || m.x > BLAST_ZONES.right + 400) { fx('meteorend', m.x, m.y, 0, 0, m.id); HAZ.met.splice(i, 1); }
        }
    } else {                                                                 // Horizon: the stage splits at random places
        SPL.t++;
        const c = SPL.t % SPL_CYCLE;
        if (c === 300) {
            SPL.off = [];
            SPL.cuts = Math.random() < 0.5 ? [0.3 + Math.random() * 0.4] : [0.2 + Math.random() * 0.2, 0.6 + Math.random() * 0.2];
            SPL.cuts = SPL.cuts.map(v => Math.round(v * 1000) / 1000);
        }
        if (c >= 300 && c < 360 && c % 6 === 0) S.screenShake = Math.max(S.screenShake, 2 + 3 * (c - 300) / 60);
        if (SPL.cuts.length) applySplit();
    }
}

const tornadoes = [];
/** Zephyr's Roaming Twister: a tornado rolls across the ground; foes it touches are lifted and spun round inside it, and when it ends (or they have spun long enough) they are flung out forward. */
function updateTornadoes() {
    for (let i = tornadoes.length - 1; i >= 0; i--) {
        const t = tornadoes[i]; t.age++;
        const x0 = t.x; t.x += t.vx;
        if (t.x < STAGE.x - 200 || t.x > STAGE.x + STAGE.width + 200) t.life = Math.min(t.life, 1);
        if (--t.life <= 0 || !t.owner) {
            fx('twisterend', 0, 0, 0, 0, t.id);
            for (const [f] of t.caught) if (isAlive(f)) { f._inTwister = false; launch(t.owner, f, { damage: 5, bkb: 10, kbg: 0.95, angle: t.vx >= 0 ? -0.75 : Math.PI + 0.75, x: f.x, y: f.y }); }
            fx('gust', t.x, t.y, t.r * 1.6, 0, 'wind'); createParticles(t.x, t.y - 80, '#e0f2fe', 18); tornadoes.splice(i, 1); continue;
        }
        if (t.age % 4 === 0) createParticles(t.x + (Math.random() - 0.5) * t.r, t.y - Math.random() * t.h, '#e0f2fe', 2);
        for (const f of foesOf(t.owner)) {
            if (!isAlive(f) || f.invincibleTimer > 0) { t.caught.delete(f); continue; }
            const inT = Math.abs(f.x - t.x) < t.r + f.width * 0.3 && f.y > t.y - t.h - 40 && f.y < t.y + f.height * 0.6;
            if (!t.caught.has(f)) { if (!inT || f.hitstun > 18) continue; t.caught.set(f, 0); f.interrupt(); }
            const n = t.caught.get(f) + 1; t.caught.set(f, n); f._inTwister = true;
            if (f.hitstun > 26 && n > 3) { t.caught.delete(f); continue; }                  // a real hit from someone else knocks them free
            const wox = f.x, woy = f.y, a = n * 0.32, lift = Math.min(1, n / 40);
            f.x += (t.x + Math.cos(a) * 52 * (1 - 0.3 * lift) - f.x) * 0.45;
            f.y += (t.y - 36 - lift * 190 - Math.sin(n * 0.09) * 40 * lift - f.y) * 0.25;
            f.vx = 0; f.vy = 0; f.hitstun = Math.max(f.hitstun, 4); f.grounded = false; pushOutOfStage(f, wox, woy); f.px = f.x; f.py = f.y;
            if (n % 15 === 0) { if (!S.sdNoDmg) f.damage += 0.8; f.lastHitBy = t.owner; f.lastHitT = 0; audio.playHit(false); createParticles(f.x, f.y, '#e0f2fe', 5); }
            if (n >= 100) { t.caught.delete(f); f._inTwister = false; launch(t.owner, f, { damage: 5, bkb: 10, kbg: 0.95, angle: t.vx >= 0 ? -0.75 : Math.PI + 0.75, x: f.x, y: f.y }); }
        }
    }
}
/** Tide hops into his own whirlpool with a neutral melee: he rides it (moving it at walking speed) for 2 s, until he jumps */
function enterWhirl(t) {
    for (const w of whirlpools) {
        if (w.owner !== t || w.rider || Math.abs(t.x - w.x) > w.r + 30 || t.y < w.y - 170) continue;
        w.rider = t; w.rideT = 120; w.life = Math.max(w.life, 126); t._wantOut = false; t.interrupt();
        fx('gust', w.x, w.y, w.r * 0.6, 0, 'water'); createParticles(w.x, w.y - 10, '#38bdf8', 14); audio.playShield();
        return true;
    }
    return false;
}
/** The whirlpool disappears (timer ran out, or Tide jumped out): a burst through the whole pool hitbox that ignores i-frames, knocks everyone inside (buried or not) away
 *  like Zephyr's tornado release (no damage), and leaves Tide stunned 0.6 s and slowed to half walk speed for 1 s */
function popOut(w, t) {
    for (const f of foesOf(t)) {
        if (!isAlive(f)) continue;
        const buried = !!(w.caught && w.caught.has(f)), inside = Math.abs(w.x - f.x) <= w.r + f.width * 0.35 && w.y - f.y <= w.r + f.height * 0.5 && f.y <= w.y + f.height;
        if (!buried && !inside) continue;
        if (buried) w.caught.delete(f);
        const dir = f.x > w.x + 2 ? 1 : f.x < w.x - 2 ? -1 : (t.facing || 1);
        f.buryT = 0; f._wantOut = false; f._wpN = 0; f._wpT = 0; f.invincibleTimer = 0; f.zapImmuneT = 0;
        if (buried) { f.y = Math.min(f.y, w.y - f.height * 0.5); f.px = f.x; f.py = f.y; }
        f.grounded = false;
        launch(t, f, { damage: 0, bkb: 10, kbg: 0.95, angle: -0.75, x: dir > 0 ? f.x - 1 : f.x + 1, y: f.y });
        fx('gust', f.x, w.y, 110, 0, 'water'); createParticles(f.x, w.y - 20, '#7dd3fc', 12);
    }
    if (isAlive(t)) { t.clashStunTimer = Math.max(t.clashStunTimer, 36); t.slowT = 60; }
    fx('gust', w.x, w.y, w.r * 1.6, 0, 'water'); createParticles(w.x, w.y - 20, '#7dd3fc', 18); S.screenShake = Math.max(S.screenShake, 7); audio.playHit(true);
}
function updateWhirlpools() {
    for (let i = whirlpools.length - 1; i >= 0; i--) {
        const w = whirlpools[i];
        const t = w.rider;
        if (t) {                                            // the rider is underground inside the pool and steers it
            const h = t._in || {};
            if (!isAlive(t) || t._wantOut || --w.rideT <= 0 || t.hitstun > 0) {
                w.rider = null; t.buryT = 0; t._wantOut = false; t.y = w.y - t.height * 0.5 - 6; t.vy = -8; t.vx = 0; t.px = t.x; t.py = t.y; t.invincibleTimer = Math.max(t.invincibleTimer, 20);
                w.life = 0;                                      // Tide out = the pool disappears right now (the closing burst below frees everyone in it)
            } else {
                const spd = 17 * charOf(t.char).walk * (t.bleedT > 0 ? 0.3 : 1), d = (h.right ? 1 : 0) - (h.left ? 1 : 0);
                if (d) { w.x = Math.max(STAGE.x + 20, Math.min(STAGE.x + STAGE.width - 20, w.x + d * spd)); t.facing = d; }
                t.x = w.x; t.y = w.y + 6; t.px = t.x; t.py = t.y; t.vx = 0; t.vy = 0; t.buryT = 3; t.invincibleTimer = Math.max(t.invincibleTimer, 3); t.grounded = false;
                w.life = Math.max(w.life, 3);
            }
        }
        w.life--;
        if (w.life <= 0) {
            if (w.owner) popOut(w, w.owner);                 // the pool closing: everyone inside bursts out, foes close by are knocked back and stunned
            if (w.rider) { w.rider.buryT = 0; w.rider.y = w.y - w.rider.height * 0.5 - 6; w.rider.px = w.rider.x; w.rider.py = w.rider.y; }
            fx('poolend', 0, 0, 0, 0, w.id); whirlpools.splice(i, 1); continue;
        }
        if (w._lx !== w.x) { w._lx = w.x; fx('poolmove', w.x, w.y, 0, 0, w.id); }
        const caught = w.caught || (w.caught = new Set());
        for (const f of foesOf(w.owner || p1)) {
            if (!isAlive(f)) { caught.delete(f); continue; }
            if (caught.has(f)) {                            // buried: carried along under the pool until they jump out (or it ends)
                f._wpN = (f._wpN || 0) + 1;
                f._wantOut = false;                              // they can't jump out: they stay until the pool disappears
                f.x = w.x; f.y = w.y + 8; f.px = f.x; f.py = f.y; f.vx = 0; f.vy = 0; f.buryT = 3; f.hitstun = Math.max(f.hitstun, 3); f.invincibleTimer = Math.max(f.invincibleTimer, 3); f.grounded = false; f.clashStunTimer = 0;
                continue;
            }
            if (f._wpT > 0 || f.invincibleTimer > 0 || f.hitstun > 18) continue;
            if (Math.abs(w.x - f.x) > w.r + f.width * 0.35 || w.y - f.y > w.r + f.height * 0.5 || f.y > w.y + f.height) continue;
            caught.add(f); f._wpN = 0; f._wantOut = false; f.interrupt(); f.buryT = 3;
            fx('gust', f.x, w.y, 70, 0, 'water'); createParticles(f.x, w.y - 10, '#38bdf8', 10); audio.playHit(false);
        }
    }
}

// ---- Zephyr's passive: a neutral melee sends out a wind current (a DNA-strand helix of air) that lifts everything it touches
const winds = []; let windId = 0;
function spawnWind(z) {
    if (z._windCd > 0 || winds.some(w => w.owner === z)) return;
    const aim = aimOf(z), ang = Math.atan2(aim.y - z.y, aim.x - z.x), dx = Math.cos(ang), dy = Math.sin(ang);      // the tube points through the aim pip, in any direction
    if (Math.abs(dx) > 0.2) z.facing = dx >= 0 ? 1 : -1;
    const w = { id: ++windId, x: z.x + dx * 30, y: z.y + dy * 30, ang, dx, dy, len: 560, r: 78, life: 300, pushed: false, owner: z };
    winds.push(w); fx('helix', w.x, w.y, ang, w.len, w.id); audio.playZap();
}
function updateWinds() {
    for (const f of fighters) if (f._windCd > 0) f._windCd--;
    for (let i = winds.length - 1; i >= 0; i--) {
        const w = winds[i], o = w.owner;
        if (--w.life <= 0 || !isAlive(o)) { fx('helixend', 0, 0, 0, 0, w.id); if (o) o._windCd = 180; winds.splice(i, 1); continue; }
        const inTube = (px, py, pad) => { const rx = px - w.x, ry = py - w.y, along = rx * w.dx + ry * w.dy, perp = Math.abs(rx * w.dy - ry * w.dx); return along > -20 && along < w.len && perp < w.r + pad; };
        for (const f of fighters) {
            if (!f.active || !isAlive(f)) continue;
            if (!inTube(f.x, f.y, f.height * 0.4)) continue;
            if (f.isHanging || f.buryT > 0 || f.grabbedBy) continue;
            const vd = f.vx * w.dx + f.vy * w.dy;                                  // the current carries them along the tube (toward the pip), not upward
            if (vd < 15) { f.vx += w.dx * 2.4; f.vy += w.dy * 2.4; }
            if (w.dy < -0.25) f.grounded = false;
            if (!w.pushed) { w.pushed = true; w.life = Math.min(w.life, 120); }       // vanishes 2 s after the first thing is pushed (the user included)
        }
        for (const q of orbs) { if (inTube(q.x, q.y, 20)) { q.vx += w.dx * 0.9; q.vy += w.dy * 0.9; if (!w.pushed) { w.pushed = true; w.life = Math.min(w.life, 120); } } }
    }
}

function updateOrbs() {
    for (let i = Math.min(orbs.length, 64) - 1; i >= 0; i--) {
        const o = orbs[i];
        if (!o) continue;                                         // a pop
        if (o.owner && (o.charge || 0) < 1) {                     // Ember's rolling Side-F wipes out every thrown rock and uncharged projectile it touches
            const em = fighters.find(e => e.active && !e.out && e !== o.owner && e.sx && e.sx.k === 'roll' && e.sx.ph === 'roll' && foesOf(e).includes(o.owner) &&
                Math.abs(e.x - o.x) < (e.activeHitbox ? e.activeHitbox.w : e.width) / 2 + o.r && Math.abs(e.y - o.y) < (e.activeHitbox ? e.activeHitbox.h : e.height) / 2 + o.r);
            if (em) {
                if (o.ctrl && o.ctrl.sx && o.ctrl.sx.k === 'thunder') { o.ctrl.sx = null; o.ctrl.actionLock = Math.max(o.ctrl.actionLock, 10); }
                dropOrb(o); fx('block', o.x, o.y); createParticles(o.x, o.y, '#fb923c', 10); audio.playHit(false); continue;
            }
        }
        if (o.owner && !o.stuck && !o.cap) {                        // Bulwark's open counter parries every kind of projectile (cores, rocks, bubbles, rockets, homing balls)
            const bw = fighters.find(e => e.riposteT > 0 && isAlive(e) && e !== o.owner && foesOf(e).includes(o.owner) &&
                Math.abs(e.x - o.x) < e.width / 2 + o.r + 70 && Math.abs(e.y - o.y) < e.height / 2 + o.r + 50);
            if (bw) { reflectOrb(o, bw); continue; }
        }
        // a pop / explosion earlier in this pass removed orbs (this used to throw every frame and freeze the match)
        const ok = slowAt(o.x, o.y);
        if (ok < 1) o._wasSlow = true; else if (o._wasSlow) { o._wasSlow = false; o.vx *= 2; o.vy *= 2; if (o.spd) o.spd *= 2; fx('block', o.x, o.y); }     // a projectile leaving the bubble comes out 2x faster
        o.age = (o.age || 0) + 1;
        if (o.kind === 'bomb') { updateBomb(o, ok); continue; }
        if (o.curve) {                                            // Void Orb bends toward the nearest foe
            const foe = nearestOf(o, foesOf(o.owner).filter(isAlive));
            if (foe) {
                const sp = Math.hypot(o.vx, o.vy), cur = Math.atan2(o.vy, o.vx);
                let da = Math.atan2(foe.y - o.y, foe.x - o.x) - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
                const a = cur + Math.max(-o.curve, Math.min(o.curve, da)) * ok;
                o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp;
            }
        }
        if (o.ctrl) {                                             // Enlightened: steered by its caster
            const c = o.ctrl;
            if (!isAlive(c) || !c.sx || c.sx.k !== 'thunder' || c.sx.oid !== o.id) { dropOrb(o); explodeOrb(o); continue; }       // the caster got hit: it goes off
            let want;
            if (c === p1 && mouse.touchMode && mouse.joy) want = Math.atan2(mouse.joy[1], mouse.joy[0]);
            else if (c === p1 && mouse.touchMode) want = null;
            else { const a = aimOf(c); want = Math.atan2(a.y - o.y, a.x - o.x); }
            if (want !== null) { let da = want - o.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); o.ang += Math.max(-0.16, Math.min(0.16, da)); }
            o.vx = Math.cos(o.ang) * o.spd; o.vy = Math.sin(o.ang) * o.spd;
            if (Math.random() < 0.6) createParticles(o.x, o.y, '#fde047', 1);
        }
        if (o.homing && o.age >= (o.homingDelay || 0)) {       // fallback middle rocket flies straight for 0.5 s, then turns smoothly
            const h = o.homing;
            if (isAlive(h)) {
                const cur = Math.atan2(o.vy, o.vx), want = Math.atan2(h.y - o.y, h.x - o.x);
                let da = want - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
                const turn = o.homingTurn || 0.02;
                const a = cur + Math.max(-turn, Math.min(turn, da)) * ok;
                o.vx = Math.cos(a) * o.spd; o.vy = Math.sin(a) * o.spd;
            } else if (!o.vx && !o.vy) o.vx = o.spd;
        }
        if (o.cap) { o.capT++; o.vx *= 0.97; o.vy = -0.8; if (o.capT >= 180) { dropOrb(o); explodeOrb(o); continue; } }
        if (o.grav) o.vy += o.grav * ok;
        if (o.wobble) o.y += Math.sin(o.age * 0.22) * o.wobble * 0.35 * ok;
        o.x += o.vx * ok;
        o.y += o.vy * ok;
        o.life -= ok;

        if (o.x < -600 || o.x > WORLD.width + 600 || o.y < -600 || o.y > WORLD.height + 600) { dropOrb(o); continue; }

        const sr = o.r * 0.35;          // the stage only stops the orb's core, so big orbs can skim along the floor
        if (!o.flat && (!o.trap || o.cap) && o.x + sr > STAGE.x && o.x - sr < STAGE.x + STAGE.width && o.y + sr > STAGE.y && o.y - sr < STAGE.y + STAGE.height) {
            dropOrb(o);
            explodeOrb(o);
            continue;
        }

        if (o.cap) {                                              // a trapped fighter rides inside the bubble
            const f = o.cap;
            if (!isAlive(f)) { o.cap = null; }
            else { f.x = o.x; f.y = o.y; f.px = f.x; f.py = f.y; f.vx = f.vy = 0; f.hitstun = Math.max(f.hitstun, 2); f.grounded = false; }
            continue;
        }
        let hitOrb = false;
        for (const t of foesOf(o.owner)) {
            if ((t.invincibleTimer > 0 && !o.homing && o.kind !== 'bubble') || t.stocks <= 0) continue;
            const cx = Math.max(t.x - t.width / 2, Math.min(o.x, t.x + t.width / 2));
            const cy = Math.max(t.y - t.height / 2, Math.min(o.y, t.y + t.height / 2));
            if (Math.hypot(o.x - cx, o.y - cy) < o.r + (o.homing ? 6 : 0)) {
                if (t.riposteT > 0 && o.owner !== t) { reflectOrb(o, t); hitOrb = true; break; }       // Bulwark's riposte sends it back
                if (o.shieldCounter && t.isShielding) {
                    dropOrb(o); audio.playShield();
                    t.shieldHealth = Math.max(0, t.shieldHealth - 10);
                    fx('block', t.x, t.y); hitOrb = true; break;
                }
                if (o.shieldPass) { dropOrb(o); explodeOrb(o); hitOrb = true; break; }
                const pierce = !!(o.pierce || o.kind === 'boulder');
                if (o.trap && !pierce) {
                    const res0 = interaction('CORE', t);
                    if (res0 === 'hit') {
                        t.interrupt(); t.trapId = o.id; t.lastHitBy = o.owner; t.lastHitT = 0; o.cap = t; o.capT = 0; o.life = 200; o.r = 50;
                        fx('explosion', o.x, o.y, 50, 0, 'water'); audio.playGrab();
                        hitOrb = true; break;
                    }
                }
                // boulder: always explode (AOE + launch), never stop on shield
                if (pierce) {
                    if (t.isShielding) { t.isShielding = false; t.shieldHold = 0; t.shieldHealth = 0; }
                    dropOrb(o);
                    explodeOrb(o);
                    hitOrb = true;
                    break;
                }
                const res = interaction('CORE', t);
                dropOrb(o);
                if (res === 'hit') explodeOrb(o);
                else if (res === 'shield') {
                    audio.playShield();
                    t.shieldHealth = Math.max(0, t.shieldHealth - 10);
                    createParticles(o.x, o.y, '#22d3ee', 10);
                    fx('block', o.x, o.y);
                } else {
                    createParticles(o.x, o.y, '#f472b6', 10);
                    fx('counter', o.x, o.y);
                }
                hitOrb = true;
                break;
            }
        }
        if (hitOrb) continue;

        if (o.life <= 0) { dropOrb(o); explodeOrb(o); }
    }
}

function checkCombatCollisions(attacker, defender) {
    const isMutualGrab = (
        (attacker.isGrabDashing && defender.isGrabDashing) ||
        (attacker.isGrabDashing && defender.grabHolding !== null) ||
        (defender.isGrabDashing && attacker.grabHolding !== null)
    );

    if (isMutualGrab) {
        const colliding = (
            attacker.x - attacker.width/2 < defender.x + defender.width/2 &&
            attacker.x + attacker.width/2 > defender.x - defender.width/2 &&
            attacker.y - attacker.height/2 < defender.y + defender.height/2 &&
            attacker.y + attacker.height/2 > defender.y - defender.height/2
        );

        if (colliding || Math.hypot(attacker.x - defender.x, attacker.y - defender.y) < 70) {
            attacker.vx = 0;
            attacker.vy = 0;
            defender.vx = 0;
            defender.vy = 0;

            attacker.clashStunTimer = 120; attacker.invincibleTimer = Math.max(attacker.invincibleTimer, STUN_IFRAMES);
            defender.clashStunTimer = 120; defender.invincibleTimer = Math.max(defender.invincibleTimer, STUN_IFRAMES);

            attacker.isGrabDashing = false;
            defender.isGrabDashing = false;
            attacker.grabHolding = null;
            defender.grabHolding = null;
            attacker.grabbedBy = null;
            defender.grabbedBy = null;
            attacker.isRolling = false;
            defender.isRolling = false;

            const clashX = (attacker.x + defender.x) / 2;
            const clashY = (attacker.y + defender.y) / 2;

            shockwaves.push({
                x: clashX,
                y: clashY,
                radius: 10,
                maxRadius: STAGE.width * 1.15,
                expansionSpeed: 6.5,
                alpha: 1.0,
                color: '#38bdf8'
            });

            audio.playHit(true);
            S.screenShake = 18;
            createParticles(clashX, clashY, '#38bdf8', 35);
            createParticles(clashX, clashY, '#ffffff', 20);
            fx('clash', clashX, clashY);
            return;
        }
    }

    // ---- grab: beats a shield, loses to every other active move (except headbutt)
    if (attacker.isGrabDashing && !attacker.grabHolding && defender.invincibleTimer <= 0 && !onSword(defender)) {
        const dx = defender.x - attacker.x;
        const dy = defender.y - attacker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const enlargedGrabHitboxRadius = (defender.char === 'ember' && defender.sx && defender.sx.k === 'rocket') ? 72 + 95 : 72;      // a grab catches a Phoenix Dash across the whole of its (big) flame

        if (dist < enlargedGrabHitboxRadius) {
            const res = interaction('GRAB', defender, !!attacker.suplexPending);
            if (res !== 'hit') {
                attacker.isGrabDashing = false;
                handleBlocked(res, attacker, defender);
                return;
            }

            if (attacker.suplexPending) {                     // Down-F on the ground: carry them up and suplex
                bump(attacker, 'grabs'); attacker.beginSuplex(defender);
                createParticles(defender.x, defender.y, '#ef4444', 20);
                return;
            }

            defender.interrupt();
            defender.isShielding = false;
            attacker.isGrabDashing = false;
            bump(attacker, 'grabs');
            attacker.grabHolding = defender;
            attacker.grabTimer = 90;
            defender.grabbedBy = attacker;
            defender.hitstun = 90;

            audio.playGrab();
            createParticles(defender.x, defender.y, '#ef4444', 20);
            fx('grab', defender.x, defender.y);
            return;
        }
    }

    // ---- Ember's Fireball Roll beats every other Side-F move (except Tide's bubble and Umbra's step): it cancels the move, ignores armour / vanish and stuns
    if (emberCounter(attacker, defender) || emberCounter(defender, attacker)) return;

    // ---- Ember's Phoenix Dash hitbox lets a grab dash THROUGH it: the grab connects (and counters the dash) instead of the drill taking the grabber
    if (attacker.char === 'ember' && attacker.sx && attacker.sx.k === 'rocket' && defender.isGrabDashing && !defender.grabHolding) return;

    // ---- swings, headbutt, spiral
    if (!attacker.activeHitbox || defender.invincibleTimer > 0) return;

    const hb = attacker.activeHitbox;
    const defLeft = defender.x - defender.width / 2;
    const defRight = defender.x + defender.width / 2;
    const defTop = defender.y - defender.height / 2;
    const defBottom = defender.y + defender.height / 2;

    const hbLeft = hb.x - hb.w / 2;
    const hbRight = hb.x + hb.w / 2;
    const hbTop = hb.y - hb.h / 2;
    const hbBottom = hb.y + hb.h / 2;

    if (hbLeft < defRight && hbRight > defLeft && hbTop < defBottom && hbBottom > defTop) {
        const res = interaction(hb.type || 'J', defender, ((hb.type || 'J') === 'J' && attacker.attackKind === 'DOWN') || hb.type === 'HEADBUTT', attacker.char);
        if (hb.multi) {                                      // sword spin: hits everyone around you once, the swing carries on
            const set = attacker.swingHitSet || (attacker.swingHitSet = new Set());
            if (set.has(defender)) return;
            set.add(defender);
            if (res !== 'hit') { handleBlocked(res, attacker, defender); return; }
            launch(attacker, defender, umbraEdge(attacker, defender, hb));
            balloonPop(attacker, defender, hb);
            if (hb.fire) burnStick(attacker);
            return;
        }
        attacker.activeHitbox = null;
        attacker.swingHit = true;
        if (res !== 'hit') {
            handleBlocked(res, attacker, defender);
            return;
        }
        launch(attacker, defender, umbraEdge(attacker, defender, hb));
        balloonPop(attacker, defender, hb);
        if (hb.fire) burnStick(attacker);
    }
}
/** Umbra's passive SHADOW EDGE (neutral melee): hitting a foe who faces the same way Umbra does (stunned foes: the way they faced before the stun) is a backstab: +40% damage, +20% knockback,
 *  and a successful backstab makes him 1.7x faster and invisible for 5 s. */
function umbraEdge(att, def, hb) {
    if (att.char !== 'umbra' || (hb.type || 'J') !== 'J' || att.attackKind === 'DOWN') return hb;
    // backstab = the foe's model faces the same way Umbra does (looking away from him); a stunned foe counts as facing the way they were before the stun
    const stunned = def.hitstun > 0 || def.clashStunTimer > 0 || def.dizzyTimer > 0;
    const defFace = (stunned && def._freeFace) ? def._freeFace : (def.facing || 1);
    const behind = defFace === (att.facing || 1);
    if (!behind) return hb;
    bump(att, 'backstabs');
    if (att.cloakT > 0) { att._boostWait = true; att._shadowT = 360; att.cloakT = 360; }   // backstab while already invisible: reset the cloak to 6 s, next hit deals 1.5x
    else { att._shadowT = 300; att.cloakT = 300; }             // first backstab: 1.7x speed and invisible for 5 s
    fx('counter', def.x, def.y - 4); fx('burn', def.x, def.y - 4, 0, 0, 'dark'); fx('explosion', att.x, att.y, 50, 0.25, 'dark');
    createParticles(def.x, def.y - 6, '#a855f7', 18); S.screenShake = Math.max(S.screenShake, 7); audio.playStab();
    return { ...hb, damage: (hb.damage || 0) * 1.4, bkb: (hb.bkb || 0) * 1.2 };
}

let fBadge = null;
let rosterKey = '';
function renderRoster() {
    let el = document.getElementById('rosterHud');
    if (!el) {
        el = document.createElement('div'); el.id = 'rosterHud';
        el.style.cssText = 'position:fixed;right:12px;top:64px;z-index:12;display:flex;flex-direction:column;gap:4px;pointer-events:none;font:700 12px system-ui,sans-serif;color:#e2e8f0';
        document.body.appendChild(el);
    }
    let tm = document.getElementById('matchTimer');
    if (!tm) {
        tm = document.createElement('div'); tm.id = 'matchTimer';
        tm.style.cssText = 'position:fixed;left:50%;top:44px;transform:translateX(-50%);z-index:13;pointer-events:none;font:800 22px system-ui,sans-serif;letter-spacing:.08em;color:#e2e8f0;background:rgba(8,12,24,.72);border:1px solid rgba(148,163,184,.35);padding:2px 14px;border-radius:12px;display:none';
        document.body.appendChild(tm);
    }
    const lbl = document.getElementById('aiDiffLabel');
    const aiPanel = lbl && lbl.closest('.glass-panel');
    if (aiPanel) { const v = S.match ? 'hidden' : ''; if (aiPanel.style.visibility !== v) aiPanel.style.visibility = v; }
    if (!S.match || S.gameState === 'start') { if (el.style.display !== 'none') el.style.display = 'none'; tm.style.display = 'none'; return; }
    el.style.display = 'flex';
    const timer = S.match.mode === 'timer';
    const sdMode = S.match.mode === 'sudden';
    if (timer || sdMode) {
        const txt = (S.sudden || sdMode) ? 'SUDDEN DEATH' : (() => { const sec = Math.max(0, Math.ceil((S.timeLeft || 0) / 60)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); })();
        tm.style.display = 'block';
        if (tm.textContent !== txt) tm.textContent = txt;
        tm.style.color = (S.sudden || sdMode) || (!S.sudden && Math.ceil((S.timeLeft || 0) / 60) <= 10) ? '#fb7185' : '#e2e8f0';
    } else tm.style.display = 'none';
    const rows = fighters.filter(f => f.active).map(f => {
        const pips = timer && !S.sudden ? ('D-' + (f.deaths || 0)) : (f.out ? 'OUT' : '●'.repeat(Math.max(0, f.stocks)));
        const nm = String(f.name).replace(/[<>&"]/g, '');
        return `<div style="display:flex;gap:8px;align-items:center;background:rgba(8,12,24,.72);border-left:4px solid ${f.color};padding:4px 8px;border-radius:8px;min-width:190px;opacity:${f.out ? .45 : 1}${f.slot === (S.mySlot || 0) ? ';outline:1px solid #fff6' : ''}"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nm}</span><span style="color:${f.damage > 120 ? '#fb7185' : f.damage > 60 ? '#fbbf24' : '#fff'}">${Math.floor(f.damage)}%</span><span style="color:${f.color};letter-spacing:1px">${pips}</span></div>`;
    }).join('');
    if (rows !== rosterKey) { rosterKey = rows; el.innerHTML = rows; }
}

// HUD writes are cached: touching the DOM every frame was a source of lag
const hudCache = {};
function hudText(id, v) { const k = 't' + id; if (hudCache[k] !== v) { hudCache[k] = v; document.getElementById(id).textContent = v; } }
function hudClass(id, v) { const k = 'c' + id; if (hudCache[k] !== v) { hudCache[k] = v; document.getElementById(id).className = v; } }
const dmgClass = (d) => d > 120 ? 'smash-font text-5xl font-bold tracking-tight text-rose-500 pulse-glow-red leading-none' : d > 60 ? 'smash-font text-5xl font-bold tracking-tight text-amber-400 leading-none' : 'smash-font text-5xl font-bold tracking-tight text-white leading-none';
function hudPips(id, n, cls) {
    const key = 'p' + id + ':' + n;
    if (hudCache['k' + id] === key) return;
    hudCache['k' + id] = key;
    const box = document.getElementById(id);
    box.innerHTML = Array.from({ length: n }, () => `<div class="${cls}"></div>`).join('');
}

function renderHUD() {
    const me = S.match ? (fighters[S.mySlot || 0] || p1) : p1;
    renderRoster();
    hudText('p1Damage', String(Math.floor(me.damage)));
    hudClass('p1Damage', dmgClass(me.damage));
    hudPips('p1Stocks', Math.max(0, me.stocks), 'w-3.5 h-3.5 rounded-full bg-cyan-400 border border-cyan-200 shadow-md shadow-cyan-500/50');

    // F-special status: charge meter while charging, otherwise how many air F moves are left
    const fAnchor = document.querySelector('#p1DashBadge, #p1FAnchor');
    if (!fBadge && fAnchor) {
        fBadge = document.createElement('span');
        fBadge.id = 'p1FBadge';
        fBadge.style.marginLeft = '6px';
        fAnchor.insertAdjacentElement('afterend', fBadge);
        fBadge.style.whiteSpace = 'nowrap';
    }
    if (fBadge) {
        let cls, txt, col;
        if (me.charging) { col = '#ddd6fe'; cls = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-500/60'; txt = `CORE ${Math.min(100, Math.round(me.chargeFrames / CHARGE_MAX * 100))}%`; }
        else if (!me.grounded && me.airSpecials >= airFOf(me)) { col = '#64748b'; cls = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-500 border border-slate-700'; txt = 'AIR F: 0 LEFT'; }
        else { col = '#c4b5fd'; cls = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-950 text-violet-300 border border-violet-500/40'; txt = `AIR F: ${airFOf(me) - me.airSpecials}/${airFOf(me)}`; }
        const key = cls + txt + col;
        if (hudCache.fb !== key) { hudCache.fb = key; fBadge.className = cls; fBadge.textContent = txt; fBadge.style.color = col; }
    }

    const jk = 'j' + me.maxJumps + ':' + me.jumpsLeft;
    if (hudCache.jk !== jk) {
        hudCache.jk = jk;
        document.getElementById('p1JumpDots').innerHTML = Array.from({ length: me.maxJumps }, (_, i) => `<div class="w-2.5 h-2.5 rounded-full ${i < me.jumpsLeft ? 'bg-cyan-400' : 'bg-slate-700'}"></div>`).join('');
    }

    hudText('p2Damage', String(Math.floor(p2.damage)));
    tickExtras(S, fighters, me);
    hudClass('p2Damage', dmgClass(p2.damage));
    hudPips('p2Stocks', Math.max(0, S.gameMode === 'training' ? 3 : p2.stocks), 'w-3.5 h-3.5 rounded-full bg-rose-500 border border-rose-300 shadow-md shadow-rose-500/50');
}

function triggerDramaticZoom(winnerCharacter) {
    dramaticZoom.active = true;
    dramaticZoom.targetX = winnerCharacter.x;
    dramaticZoom.targetY = winnerCharacter.y;
    dramaticZoom.currentZoom = 1;
    dramaticZoom.progress = 0;
}

const TEAM_COLORS = { red: '#ef4444', blue: '#3b82f6', yellow: '#facc15', green: '#22c55e' };
/** name above a fighter: username / guest, or Easy/Medium/Hard Bot (numbered when several of the same) */
export function assignTagNames() {
    const bots = {};
    for (const f of fighters) {
        if (!f.active) { f.tagName = ''; continue; }
        if (f.isAI) {
            // Training static dummy is not a Hard Bot
            if (S.gameMode === 'training' && (!f.diff || (S.train && S.train.botType === 'static'))) {
                f.tagName = 'Static Bot';
                continue;
            }
            const lv = f.diff || (typeof f.level === 'string' ? f.level : null)
                || (S.gameMode === 'easy' ? 'easy' : S.gameMode === 'medium' ? 'medium' : 'hard');
            const base = (BOT_NAMES[lv] || 'Hard Bot') + (f.mod ? ' · ' + MOD_NAMES[f.mod] : '');
            (bots[base] || (bots[base] = [])).push(f);
        } else {
            f.tagName = (f === p1) ? (displayName() || f.name || 'Player') : (f.name || 'Player');
        }
    }
    for (const [base, list] of Object.entries(bots)) {
        if (list.length === 1) list[0].tagName = base;
        else list.forEach((f, i) => { f.tagName = base + ' ' + (i + 1); });
    }
}

/** The start menu's live showcase: two hard bots fight on a random map (the camera work and the cuts live in render/showcase.js). Silent, no HUD. */
export const DEMO_CHARS = ['luminent', 'bulwark', 'zephyr', 'ember', 'tide', 'volt', 'umbra', 'terra'];
export function startDemo(map, chars) {
    if (S.gameState !== 'start' && !S.demo) return null;
    S.demo = true; S.gameMode = 'demo'; S.online = null; audio.muted = true;
    S.match = { teams: false, startDamage: 0, stocks: 99, mode: 'stock', timeLimit: 5, items: { on: false, types: [], interval: 15 } };
    S.matchCfg = null; S.mySlot = 2; S.winnerRole = null; S.hazards = false;
    const m = setArenaByMap(map || 'rand');
    const pool = DEMO_CHARS.slice(), pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const cs = chars || [pick(), pick()];
    fighters.forEach((f) => { f.active = false; f.out = false; f.team = null; });
    [2, 3].forEach((slot, i) => {
        const f = fighters[slot];
        f.char = charOf(cs[i]).id; f.active = true; f.name = ''; f.tagName = ''; f.isAI = true; f.diff = 'hard'; f.shieldHold = 0;
        f.color = ['#06b6d4', '#f43f5e'][i]; f.superColor = null; f.stocks = 99; f.kills = 0;
        f.startX = STAGE.x + STAGE.width * (0.3 + 0.4 * i); f.startY = STAGE.y - 120;
        f.reset(true); f.shieldHold = 0; f.remoteAim = null; f.maxJumps = charOf(f.char).jumps; f.jumpsLeft = f.maxJumps;
    });
    orbs.length = 0; drops.length = 0; pillars.length = 0; zapTrails.length = 0; whirlpools.length = 0; tornadoes.length = 0; winds.length = 0; items.length = 0;
    return { map: m, chars: cs };
}

const FFA_COLORS = ['#06b6d4', '#f43f5e', '#a3e635', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
/** cfg (custom match): { players: [{slot, name, team}], teams: bool, startDamage, stocks, mySlot } */
function startMatchSequence(mode, cfg) {
    resetHazards(); S.fxClear++; S.kcT = 0; S.kcPause = 0; S.kcHold = null; S.lastKO = null; S.sudden = false; S.sdNoDmg = false; S.sdT = 0; S.sdBase = null; S.cdN = -1; S.gameMode = mode; S.stats = newStats(); S.replay = null; S.rec = []; S.ms = []; S.recN = 0; S.clips = []; S.clipsPend = []; S.klog = []; S.kr = null; S.rewardShown = false; if (!['easy', 'medium', 'hard'].includes(mode)) S.ranked = false;
    S.demo = false; audio.muted = false;
    if (mode === 'lobby' && cfg) {
        const ic = cfg.items || {};
        const lim = clampN(+cfg.timeLimit || 5, 1, 10);
        const sdPick = cfg.mode === 'sudden';
        S.match = {
            teams: !!cfg.teams, startDamage: sdPick ? 200 : clampN(+cfg.startDamage || 0, 0, 249), stocks: sdPick ? 1 : (cfg.stocks || 3),
            mode: cfg.mode === 'timer' ? 'timer' : sdPick ? 'sudden' : 'stock', timeLimit: lim,
            items: ic.on ? { on: true, types: (ic.types || []).filter(t => ITEM_TYPES.includes(t)), interval: clampN(+ic.interval || 15, 5, 60) } : { on: false, types: [], interval: 15 },
        };
        S.timeLeft = Math.round(lim * 3600);
        S.itemTimer = Math.round(S.match.items.interval * 30);
        S.mySlot = cfg.mySlot || 0;
        S.matchCfg = cfg;
        S.hazards = !!cfg.hazards;
        cfg.map = setArenaByMap(cfg.map);                     // a random pick is resolved here (the host's choice is sent to guests already resolved)
    } else {
        S.match = null; S.mySlot = 0; S.matchCfg = null; S.hazards = S.gameMode === 'training' && !!ensureTrain().hazards;
        if (S.gameMode === 'easy' || S.gameMode === 'medium' || S.gameMode === 'hard') setArenaByMap('rand');     // bot modes: a random map every game
        else if (S.arena !== 'normal' || S.theme !== 'frontier') setArena('normal');
        for (let i = 2; i < fighters.length; i++) fighters[i].active = false;
        p1.active = p2.active = true; p1.team = p2.team = null; p1.out = p2.out = false; p2.diff = null; p2.isAI = true;
        for (const f of [p1, p2]) { f.color = f.home.color; f.name = f.home.name; }
        placeDuel(false);
    }
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverModal').classList.add('hidden');
    dramaticZoom.active = false;
    orbs.length = 0; drops.length = 0; pillars.length = 0; zapTrails.length = 0;
    whirlpools.length = 0; tornadoes.length = 0; winds.length = 0;
    items.length = 0; guestItems.clear(); inputBuf.a = null;

    if (S.match) {
        const n = cfg.players.length, span = STAGE.width * 0.7;
        fighters.forEach((f) => { f.active = false; f.out = false; f.team = null; });
        cfg.players.forEach((pl, i) => {
            // the local player is always drawn as p1 (slot 0 locally): swap slot 0 and my slot
            const f = fighters[pl.slot];
            f.char = charOf(pl.char).id; f.active = true; f.name = pl.name; f.team = S.match.teams ? pl.team : null; f.isAI = !!pl.bot; f.diff = pl.bot || null; f.mod = SKILL[pl.bot] ? ['rusher', 'zoner', 'turtle', 'trickster'][Math.floor(Math.random() * 4)] : ''; f.shieldHold = 0;
            f.color = S.match.teams && pl.team ? TEAM_COLORS[pl.team] : FFA_COLORS[pl.slot % 8];
            f.superColor = null;
            f.startX = STAGE.x + STAGE.width * 0.15 + (n > 1 ? span * i / (n - 1) : span / 2);
            f.startY = STAGE.y - 120;
            f.reset(true); f.shieldHold = 0; f.remoteAim = null;
        });
        if (S.match.mode === 'sudden') {
            S.sudden = true; S.sdNoDmg = true; S.sdT = 0;
            const a = ARENAS[S.arena] || ARENAS.normal;
            S.sdBase = { left: a.bz.left, right: a.bz.right, top: a.bz.top, bottom: a.bz.bottom };
            Object.assign(BLAST_ZONES, S.sdBase);
        }
    } else {
    p1.char = getMyChar();
    p2.char = S.online === 'host' ? (S.peerChar || DEFAULT_CHAR) : S.online === 'guest' ? DEFAULT_CHAR : getMyChar();   // bots wear the character you have equipped
    p1.reset(true);
    p2.reset(true);
    p2.shieldHold = 0;
    p2.isAI = !S.online;                                   // online: p2 is a person
    }
    if (!S.match) {
        p1.name = displayName() || p1.name || 'Player';
        if (p2.isAI) {
            p2.diff = S.gameMode === 'easy' ? 'easy' : S.gameMode === 'medium' ? 'medium' : S.gameMode === 'hard' ? 'hard' : (p2.diff || 'hard');
            if (S.rankBot && (S.ranked || S.freeBot)) { p2.diff = S.rankBot; p2.mod = S.rankMod || ''; }
            else p2.mod = '';
            p2.name = (BOT_NAMES[p2.diff] || 'Hard Bot') + (p2.mod ? ' · ' + MOD_NAMES[p2.mod] : '');
        } else if (S.opponentName) {
            p2.name = S.opponentName;
        }
    }
    assignTagNames();

    p2.remoteAim = null;
    S.winnerRole = null;
    remote.helds = {};
    resetSnapshotState();
    for (const [, g] of guestOrbs) { const i = orbs.indexOf(g); if (i >= 0) orbs.splice(i, 1); }
    guestOrbs.clear();
    for (const f of fighters) { f._tx = undefined; f._ty = undefined; }

    const modeLabel = document.getElementById('modeDisplayLabel');
    const aiDiffLabel = document.getElementById('aiDiffLabel');
    const aiDescText = document.getElementById('aiDescText');

    if (S.gameMode === 'lobby') {
        modeLabel.textContent = (S.match.mode === 'sudden' ? 'SUDDEN DEATH • ' : S.match.mode === 'timer' ? 'TIMER • ' : '') + (S.match.teams ? 'CUSTOM MATCH • TEAMS' : 'CUSTOM MATCH • FREE FOR ALL');
    } else if (S.gameMode === 'easy') {
        modeLabel.textContent = "MODE: EASY";
        aiDiffLabel.textContent = "Easy Bot";
        aiDescText.textContent = "Slower movement, passive attacks & defensive shield";
    } else if (S.gameMode === 'medium') {
        modeLabel.textContent = "MODE: MEDIUM";
        aiDiffLabel.textContent = "Medium Bot";
        aiDescText.textContent = "Uses every move, but reacts slower and doesn't learn your habits";
    } else if (S.gameMode === 'hard') {
        const rb = (S.rankBot && (S.ranked || S.freeBot) && SKILL[S.rankBot]) ? S.rankBot : null;
        modeLabel.textContent = rb ? "MODE: " + rb.toUpperCase() : "MODE: HARD";
        aiDiffLabel.textContent = rb ? p2.name : "Hard Bot";
        aiDescText.textContent = rb ? "Tougher stats, faster reactions • Fighting style: " + (MOD_NAMES[p2.mod] || '—') : "Learns your habits • Core zoning • Ledge Guard & Counter-Rolls";
    } else if (S.gameMode === 'online') {
        modeLabel.textContent = "MODE: ONLINE 1v1";
        aiDiffLabel.textContent = S.opponentName || 'Opponent';
        aiDescText.textContent = S.online === 'host' ? 'You are hosting: you are the blue fighter' : 'Connected to the host: you are the blue fighter';
    } else if (S.gameMode === 'training') {
        modeLabel.textContent = "MODE: TRAINING";
        aiDiffLabel.textContent = "Static Bot";
        aiDescText.textContent = "Static Bot — stationary practice dummy with infinite stocks";
    }

    document.getElementById('gameHud').classList.remove('hidden');
    document.getElementById('aimMatrixHud').classList.remove('hidden');
    document.getElementById('inGameMenuContainer').classList.remove('hidden');

    // Training: apply prefs, no countdown — jump straight into playing
    if (S.gameMode === 'training') {
        applyTrainPrefs();
        document.getElementById('countdownScreen').classList.add('hidden');
        S.gameState = 'playing';
        return;
    }

    S.gameState = 'countdown';
    const countdownScreen = document.getElementById('countdownScreen');
    const countdownText = document.getElementById('countdownText');
    countdownScreen.classList.remove('hidden');

    let count = 3;
    countdownText.textContent = count;

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownText.textContent = count;
        } else if (count === 0) {
            countdownText.textContent = 'GO!';
        } else {
            clearInterval(countdownInterval);
            countdownScreen.classList.add('hidden');
            S.gameState = 'playing';
        }
    }, 1000);
}

/** Apply S.train to arena, p1/p2 characters, bot type */
/** party training: a friend takes over the training dummy (p2) through the online room, and gives it back when they leave */
export function trainAttach(name, char) {
    S.online = 'host'; S.opponentName = name; S.peerChar = charOf(char).id;
    p2.isAI = false; p2.diff = null; p2.char = S.peerChar; p2.name = name; p2.reset(true); p2.shieldHold = 0; p2.remoteAim = null; remote.helds = {}; resetSnapshotState();
}
export function trainDetach() { S.online = null; S.opponentName = null; applyTrainPrefs(); p2.reset(true); }
export function applyTrainPrefs() {
    const t = ensureTrain();
    const stg = t.stage === 'frontier' ? 'lobby' : t.stage;
    const kind = (stg === 'lobby' || stg === 'bighorizon') ? 'lobby' : 'normal', theme = (stg === 'horizon' || stg === 'bighorizon') ? 'horizon' : 'frontier';
    if (S.arena !== kind || S.theme !== theme) { setArena(kind, theme); placeDuel(true); }
    if (!!S.hazards !== !!t.hazards) { S.hazards = !!t.hazards; resetHazards(); S.fxClear++; }
    if (t.char) { p1.char = charOf(t.char).id; }
    else p1.char = getMyChar();
    p1.maxJumps = trainJumps(p1); p1.jumpsLeft = p1.maxJumps;
    const bt = t.botType || 'static';
    p2.isAI = true;
    if (bt === 'static') { p2.diff = null; p2.name = 'Static Bot'; }
    else { p2.diff = bt; p2.name = BOT_NAMES[bt] || 'Hard Bot'; }
    p2.char = charOf(t.botChar || t.char || getMyChar()).id;
    p2.maxJumps = charOf(p2.char).jumps; p2.jumpsLeft = p2.maxJumps;
    try { assignTagNames(); } catch (e) { /* ok */ }
    const btn = document.getElementById('trainMenuBtn');
    if (btn) btn.classList.toggle('hidden', S.gameMode !== 'training');
}

const gameOverModal = document.getElementById('gameOverModal');
let endHook = null;
export function setEndHook(f) { endHook = f; }
function endGame(winnerText, winnerRole = null) {
    if (S.sdBase) { Object.assign(BLAST_ZONES, S.sdBase); S.sdBase = null; }
    S.sudden = false; S.sdT = 0; S.cdN = -1;
    const customMatch = !!S.match && !S.viaQueue && !S.ranked && !S.rankedQ;           // custom matches (lobby or private room) give no coins, challenges or rating
    if (customMatch && S.gameState === 'playing' && !S.rewardShown && !S.demo && S.gameMode !== 'training') { S.rewardShown = true; try { notify('Custom match: no coins or rating'); } catch (e) { /* hud */ } }
    else if (S.gameState === 'playing' && !S.rewardShown && !S.demo && S.gameMode !== 'training') {
        S.rewardShown = true; if (!S.stats) S.stats = newStats();
        const v = viewerFighter(), won = /YOU WIN|PLAYER 1 WINS/.test(winnerText);
        S.stats.deaths = v ? v.deaths : 0; S.stats.kills = v ? v.kills : 0;
        try { showReward(reportMatch(S.stats, { won, char: v ? v.char : 'luminent', mode: S.gameMode, ranked: !!S.ranked || !!S.rankedQ, online: !!S.rankedQ, draw: /DRAW/.test(winnerText), secs: S.stats.frames / 60, maxDmg: S.stats.maxDmg })); } catch (e) { /* meta is optional */ }
    }
    if (S.clipsPend && S.clipsPend.length) { S.clipsPend[S.clipsPend.length - 1].final = true; for (const c of S.clipsPend) finishClip(c); S.clipsPend = []; }      // the KO that ended the match is already slowed by the game itself
    S.gameState = 'gameover';
    S.winnerRole = winnerRole;
    document.getElementById('winnerText').textContent = winnerText;
    setTimeout(() => {
        const show = () => { if (S.gameState === 'gameover') gameOverModal.classList.remove('hidden'); };
        if (endHook && !S.demo && S.gameMode !== 'training' && S.online !== 'guest' && S.ms) endHook(show); else show();       // the match stats come first, then the win / lose screen
    }, 800);
}

// ---------------------------------------------------------------------------
//  Fixed-timestep simulation (60 Hz)
// ---------------------------------------------------------------------------


const TEAM_NAMES = { red: 'RED', blue: 'BLUE', yellow: 'YELLOW', green: 'GREEN' };
/** custom match: the match ends when only one team (or one fighter, in a free-for-all) is still standing */
function checkMatchEnd() {
    if (!S.match || S.gameState !== 'playing') return;
    const live = fighters.filter(isAlive);
    const keyOf = (f) => S.match.teams && f.team ? 't:' + f.team : 'p:' + f.slot;
    if (new Set(live.map(keyOf)).size > 1) return;
    S.winnerSlots = live.map(f => f.slot);
    const w = live[0];
    S.winnerLabel = !w ? 'NOBODY' : (S.match.teams && w.team ? `${TEAM_NAMES[w.team]} TEAM` : String(w.name).toUpperCase());
    S.iWon = S.winnerSlots.includes(S.mySlot || 0);
    triggerDramaticZoom(w || p1);
    endGame(S.iWon ? 'YOU WIN!' : `${S.winnerLabel} WINS!`, 'lobby');
}

/** bots accelerate by themselves; give them their character's walk speed too */
function aiWalk(f) {
    const w = charOf(f.char).walk;
    if (w !== 1 && f.hitstun === 0 && f.grounded && !f.isShielding) f.vx *= 1 + (w - 1) * 0.12;
}

/** walking / shielding for one fighter from a held-input state ({left,right,shield,drop}) */
function drive(f, h) {
    f._in = h;
    const free = f.hitstun === 0 && f.dizzyTimer === 0 && f.clashStunTimer === 0 && !f.grabHolding &&
        !f.isRolling && f.freezeTimer === 0;
    if (free) {
        // you can always walk (even during the 0.7 s move lock) - except while diving
        const meleeCharging = f.attackHeld && f.attackTimer > 0;     // charging a melee: movement input is ignored (momentum carries on)
        const swinging = f.attackTimer > 0 && f.swing;                // the side you swing toward stays the side you swing toward
        if (f.sx && f.sx.k === 'roll' && f.sx.ph === 'roll') { if (h.left) f.sx.d = -1; else if (h.right) f.sx.d = 1; }      // the roll is steered with left / right
        if (!f.diving && !meleeCharging && !f.sx) {
            const spd = (f.fActive ? 6.75 : (f.spiralT > 0 ? 4.5 : 8.5)) * charOf(f.char).walk * (f === p1 ? trainWalk() : 1) * (f.bleedT > 0 ? 0.3 : 1) * (f._shadowT > 0 ? 1.7 : 1) * (f.soakT > 0 ? 0.75 : 1) * (f.slowT > 0 ? 0.5 : 1) * (1 + perkOf(f, 'walk'));   // training walk mult for p1; bleeding slows movement by 70%
            if (f.glide && !f.grounded) {                       // Tide's glide: same way keeps the speed, the opposite way slows it, up / down nudge it a little (gravity still applies)
                const dr = h.left ? -1 : h.right ? 1 : 0;
                if (dr) { if (f.vx * dr > 0) { if (Math.abs(f.vx) < spd) f.vx = dr * spd; } else f.vx *= 0.92; }
                const jy = (f === p1 || !f.isAI) && mouse.joy ? mouse.joy[1] : 0;
                if (h.drop || jy > 0.5) f.vy = Math.min(f.vy + 0.45, 7);
                else if (jy < -0.5 && f.vy > -3.5) f.vy -= 0.5;
            } else {
            // on ledge: only jump gets you off; during Ember post-roll halt: no walk input
            if (!f.isHanging && f.haltT <= 0) {
                if (h.left) { f.vx = -spd; if (!swinging) f.facing = -1; }
                if (h.right) { f.vx = spd; if (!swinging) f.facing = 1; }
            }
            }
        }
        f.isShielding = !!h.shield && f.canShield();
        if (h.drop) f.dropT = 12;
    } else {
        f.isShielding = false;
    }
}

// ============================================================================
//  Online play (host-authoritative). The host runs the whole simulation: its own
//  fighter is p1, the guest's fighter is p2 steered by `remote`. The guest runs no
//  simulation: it sends inputs and mirrors the host's snapshots, with itself as p1.
// ============================================================================
let netTick = 0;
const NOHELD = { left: false, right: false, shield: false, drop: false };
export const remote = { helds: {} };              // slot -> held inputs of each guest

/** an input event from the guest, applied to their fighter (host only) */
export function removeFighter(slot) {
    const f = fighters[slot];
    if (!f || !f.active || !S.match) return;
    f.dropHeld();
    f.out = true; f.stocks = 0; f.vx = f.vy = 0;
    checkMatchEnd();
}
export function applyRemote(ev, slot = 1) {
    if (S.online !== 'host') return;
    const f = fighters[slot];
    if (!f || !f.active) return;
    if (ev.t === 'held') { remote.helds[slot] = { left: !!ev.left, right: !!ev.right, shield: !!ev.shield, drop: !!ev.drop }; }
    if (ev.wx !== undefined) f.remoteAim = { x: ev.wx, y: ev.wy };
    if (ev.t !== 'act' || S.gameState !== 'playing' || f.out) return;
    if (!(remote.helds[slot] && remote.helds[slot].shield)) f.isShielding = false;   // shield was released before this action
    switch (ev.a) {
        case 'jump': f.jump(); break;
        case 'attack': f.attack(ev.dir, !!ev.hold); break;
        case 'attackUp': f.releaseAttack(); break;
        case 'grab': f.executeGrabDash(ev.wx, ev.wy); break;
        case 'roll': f.executeRoll(); break;
        case 'special': f.fPress(ev.dir); break;
        case 'specialUp': f.fRelease(ev.dir, ev.wx, ev.wy); break;
        case 'cancelF': f.cancelF(); break;
    }
}

const FKEYS = Object.keys(new Fighter(0, 0, '#000', 'k')).filter(k => !['color', 'name', 'isAI', 'startX', 'width', 'height', 'home', 'heldItem', 'lastHitBy', 'burnBy', 'swingHitSet', '_acc', '_since', '_slowK', '_upd', 'px', 'py'].includes(k));
const REFS = ['grabHolding', 'grabbedBy', 'grabVictim', 'suplexTarget', 'bombBy'];
const SWING_NAMES = Object.keys(SWING);
const r2 = (v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
const idxOf = (f) => fighters.indexOf(f);
let lastSent = Array.from({ length: 8 }, () => ({}));
let fullEvery = 0;

function packFighter(f) {
    const o = {};
    for (const k of FKEYS) {
        if (REFS.includes(k)) { o[k] = idxOf(f[k]); continue; }
        const v = f[k];
        if (k === 'swing') o[k] = v ? SWING_NAMES.find(n => SWING[n] === v) || null : null;
        else if (k === 'ghosts') o[k] = v.slice(-6).map(g => ({ x: r2(g.x), y: r2(g.y), alpha: r2(g.alpha), color: g.color }));
        else if (k === 'activeHitbox') o[k] = v ? { ...v, x: r2(v.x), y: r2(v.y) } : null;
        else if (k === 'cd' && v) { const q = {}; for (const n in v) q[n] = v[n] > 0 ? Math.ceil(v[n] / 6) * 6 : 0; o[k] = q; }   // cooldowns in 0.1 s steps: far fewer changes to send
        else if (k === 'activeMove' || k === 'sx') o[k] = v ? { ...v } : v;
        else if (typeof v === 'number') o[k] = r2(v);
        else o[k] = v;
    }
    return o;
}

/** a compact (delta-coded) description of the whole match for the guest */
export function snapshot() {
    const tick = fullEvery++;
    const fs = (S.match ? fighters : [p1, p2]).map((f, i) => {
        if (!f.active && S.match) return null;
        const full = (tick % 8) === (i % 8);                      // refresh one fighter per snapshot, so no single message is huge
        const cur = packFighter(f), out = {};
        for (const k in cur) {
            const v = cur[k], j = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
            if (full || lastSent[i][k] !== j) { out[k] = v; lastSent[i][k] = j; }
        }
        return out;
    });
    const ev = outbox.splice(0, outbox.length);
    return {
        f: fs, m: S.match ? 1 : 0, gs: S.gameState, win: S.winnerRole || null,
        ws: S.winnerSlots || null, wl: S.winnerLabel || null, sh: Math.round(S.screenShake * 10) / 10,
        o: orbs.map(o => ({ id: o.id, x: r2(o.x), y: r2(o.y), vx: r2(o.vx), vy: r2(o.vy), r: r2(o.r), c: r2(o.charge), own: idxOf(o.owner), k: o.kind || 0, cap: o.cap ? 1 : 0 })),
        it: items.map(i => ({ id: i.id, t: i.type, x: r2(i.x), y: r2(i.y), vx: r2(i.vx), vy: r2(i.vy), st: i.st, len: i.len, act: i.act ? 1 : 0, rot: r2(i.rot), sp: r2(i.spin), h: i.hold })),
        tl: S.match && S.match.mode === 'timer' ? S.timeLeft : 0,
        sp: SPL.cuts.length ? [SPL.t, ...SPL.cuts] : 0, sd: S.sudden ? 1 : 0, sdt: S.sdT || 0, cd: S.sudden ? (S.cdN == null ? -1 : S.cdN) : -1,
        ev,
    };
}
export function resetSnapshotState() { lastSent = Array.from({ length: 8 }, () => ({})); fullEvery = 0; outbox.length = 0; }

const guestOrbs = new Map();
const guestItems = new Map();
const guestFlip = (i) => i < 0 ? -1 : (S.match ? i : 1 - i);   // 1v1: host's p1 is the guest's p2 and vice versa; custom matches use absolute slots
let interpMs = 90, snapAvg = 33, snapDev = 6, lastSnapAt = 0;   // the guest shows the world this far in the past; it adapts to how steady the packets are (steady link = less delay, bursty = more)
function trackSnapRate() {
    const now = performance.now();
    if (lastSnapAt) {
        const gap = Math.min(400, now - lastSnapAt);
        snapAvg += (gap - snapAvg) * 0.08; snapDev += (Math.abs(gap - snapAvg) - snapDev) * 0.08;
        const want = Math.max(36, Math.min(150, snapAvg * 1.5 + snapDev * 3));
        interpMs += (want - interpMs) * 0.05;
    }
    lastSnapAt = now;
}
const ownGuestFighter = () => S.spectating ? null : S.match ? fighters[S.mySlot] : p1;
function guestSmooth() {
    const rt = performance.now() - interpMs;
    for (const f of (S.match ? fighters : [p1, p2])) {
        if (!f.active) continue;
        f.px = f.x; f.py = f.y;
        f._since2 = (f._since2 || 0) + 1;
        if (f._since2 === 1 && f._atChg && f.attackTimer > 0) f.attackTimer--;      // animation timer: tick it on the frame between two snapshots so attacks play smoothly
        const buf = f._buf;
        if (!buf || !buf.length) continue;
        while (buf.length > 2 && buf[1].t <= rt) buf.shift();   // drop samples we have passed
        const a = buf[0], b = buf[1];
        let x, y;
        if (!b) {                                         // starved: carry on with the last known velocity for a moment
            const fr = Math.min(8, Math.max(0, (rt - a.t) / 16.7));
            x = a.x + (f.vx || 0) * fr; y = a.y + (f.vy || 0) * fr;
        } else if (rt >= b.t) { x = b.x; y = b.y; }
        else if (rt <= a.t) { x = a.x; y = a.y; }
        else if (b.tp) { x = a.x; y = a.y; }               // a teleport (blink, respawn): hold, then jump
        else { const u = (rt - a.t) / (b.t - a.t); x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u; }
        if (Math.hypot(x - f.x, y - f.y) > 260) { f._teleported = true; } else f._teleported = false;
        if (f === ownGuestFighter()) {                    // YOUR fighter: no interpolation delay. Show the newest snapshot pushed ahead by the trip time, and start walking the instant a key goes down
            const last = buf[buf.length - 1];
            if (last && !last.tp && !(f.hitstun > 0) && !f.grabbedBy) {
                const lat = Math.min(10, (performance.now() - last.t) / 16.7 + ((NETHOOK.rtt && NETHOOK.rtt()) || 40) / 33);
                const dir = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
                f._held = dir !== 0 && dir === f._heldDir ? f._held + 1 : (dir !== 0 ? 1 : 0); f._heldDir = dir;
                const free = f.grounded && !f.sx && !f.activeMove && !f.isShielding && !f.attackTimer;
                const walk = 8.5 * charOf(f.char).walk * (f.bleedT > 0 ? 0.3 : 1) * (f._shadowT > 0 ? 1.7 : 1) * (f.soakT > 0 ? 0.75 : 1) * (f.slowT > 0 ? 0.5 : 1);
                const lead = free && dir ? Math.max(0, dir * walk * Math.min(lat, f._held) - (f.vx || 0) * Math.min(lat, f._held)) : 0;
                const tx = last.x + (f.vx || 0) * lat + lead, ty = last.y + (f.vy || 0) * lat * 0.6;
                f._px = f._px === undefined ? tx : f._px + (tx - f._px) * 0.5; f._py = f._py === undefined ? ty : f._py + (ty - f._py) * 0.5;
                if (Math.hypot(f._px - x, f._py - y) < 160) { x = f._px; y = f._py; }
            }
        }
        f.x = x; f.y = y;
    }
    for (const o of orbs) { o.x += o.vx * 0.5; o.y += o.vy * 0.5; }
    for (const g of items) if (g.st === 'held') { const h = fighters[g.hold]; if (h && h.active) { g.x = h.x + (h.facing || 1) * 30; g.y = h.y - 2; } }      // a carried item sticks to the hand as it is drawn (the fighter is shown slightly ahead of the host's copy of the item)
    for (const g of items) if (g.st !== 'held' && !g.act && g.st !== 'zone') { g.x += g.vx * 0.5; g.y += g.vy * 0.5; g.rot += (g.spin || 0) * 0.5; }
}
export function applySnapshot(s) {
    if (S.replay) return;                                 // watching a replay: ignore the live feed
    trackSnapRate();
    const mine = s.m ? fighters : [p2, p1];               // snapshot index -> local fighter
    s.f.forEach((d, i) => {
        const f = mine[i];
        if (!d || !f) return;
        f._since2 = 0; f._atChg = d.attackTimer !== undefined;
        for (const k in d) {
            const v = d[k];
            if (k === 'x') { if (f._tx === undefined) { f.x = v; } f._tx = v; }
            else if (k === 'y') { if (f._ty === undefined) { f.y = v; } f._ty = v; }
            else if (k === 'px' || k === 'py') continue;
            else if (k === 'swing') f.swing = v ? SWING[v] : null;
            else if (REFS.includes(k)) { const g = guestFlip(v); f[k] = g < 0 ? null : fighters[g]; }
            else if (k === 'facing') f.facing = v;
            else f[k] = v;
        }
        if (f._tx !== undefined) {
            const buf = f._buf || (f._buf = []);
            buf.push({ t: performance.now(), x: f._tx, y: f._ty, tp: !!d._teleported });
            if (buf.length > 24) buf.shift();
        }
    });
    // orbs, matched by id so the renderer keeps one object per projectile
    const seen = new Set();
    for (const o of s.o) {
        seen.add(o.id);
        const og = guestFlip(o.own);
        const own = og < 0 ? p1 : fighters[og];
        const color = o.c >= 1 ? (S.match ? '#a855f7' : (own === p1 ? '#a855f7' : '#fb923c')) : own.color;
        let g = guestOrbs.get(o.id);
        if (!g) { g = { id: o.id }; guestOrbs.set(o.id, g); orbs.push(g); }
        const had = g.x !== undefined, gx = g.x, gy = g.y;
        Object.assign(g, { x: o.x, y: o.y, vx: o.vx, vy: o.vy, r: o.r, charge: o.c, owner: own, color, life: 200, kind: o.k || 0, cap: !!o.cap });
        if (had && Math.hypot(gx - o.x, gy - o.y) < 90) { g.x = gx + (o.x - gx) * 0.5; g.y = gy + (o.y - gy) * 0.5; }
    }
    for (const [id, g] of guestOrbs) if (!seen.has(id)) { guestOrbs.delete(id); const i = orbs.indexOf(g); if (i >= 0) orbs.splice(i, 1); }
    // items, matched by id
    const seenIt = new Set();
    for (const o of (s.it || [])) {
        seenIt.add(o.id);
        let g = guestItems.get(o.id);
        if (!g) { g = { id: o.id }; guestItems.set(o.id, g); items.push(g); }
        const had = g.x !== undefined && g.st !== 'held', gx = g.x, gy = g.y;
        Object.assign(g, { type: o.t, x: o.x, y: o.y, vx: o.vx, vy: o.vy, st: o.st, len: o.len, act: !!o.act, rot: o.rot, spin: o.sp, hold: guestFlip(o.h), r: ITEM_R[o.t] });
        if (had && o.st !== 'held' && Math.hypot(gx - o.x, gy - o.y) < 90) { g.x = gx + (o.x - gx) * 0.5; g.y = gy + (o.y - gy) * 0.5; }      // loose items glide to the new position instead of snapping
    }
    for (const [id, g] of guestItems) if (!seenIt.has(id)) { guestItems.delete(id); const i = items.indexOf(g); if (i >= 0) items.splice(i, 1); }
    for (const f of (S.match ? fighters : [p1, p2])) f.heldItem = f.heldId ? (guestItems.get(f.heldId) || null) : null;     // the stick in a hand is drawn from heldItem, which only the host had
    if (s.tl) S.timeLeft = s.tl;
    if (s.sp) { SPL.t = s.sp[0]; SPL.cuts = s.sp.slice(1); applySplit(false); }
    if (s.sd) {
        S.sudden = true;
        S.sdT = s.sdt || 0;
        if (!S.sdBase) { const a = ARENAS[S.arena] || ARENAS.normal; S.sdBase = { left: a.bz.left, right: a.bz.right, top: a.bz.top, bottom: a.bz.bottom }; }
        applySuddenBlast(S.sdT);
        const screen = document.getElementById('countdownScreen'), text = document.getElementById('countdownText');
        if (s.cd >= 0) {
            if (screen) screen.classList.remove('hidden');
            if (text) text.textContent = s.cd === 0 ? 'GO!' : String(s.cd);
        } else if (screen && S.gameState !== 'playing') screen.classList.add('hidden');
    } else if (S.sudden) {
        S.sudden = false; S.sdT = 0;
        if (S.sdBase) Object.assign(BLAST_ZONES, S.sdBase);
    }
    S.screenShake = Math.max(S.screenShake, s.sh || 0);
    // game state
    if (s.gs === 'gameover') {
        if (S.gameState !== 'gameover' && s.m) {
            S.winnerSlots = s.ws || []; S.winnerLabel = s.wl || 'NOBODY';
            S.iWon = S.winnerSlots.includes(S.mySlot);
            triggerDramaticZoom(fighters[S.winnerSlots[0]] || fighters[S.mySlot] || p1);
            endGame(S.winnerLabel === 'DRAW' ? 'DRAW!' : S.iWon ? 'YOU WIN!' : `${S.winnerLabel} WINS!`, 'lobby');
        } else if (S.gameState !== 'gameover') {
            const winner = s.win === 'host' ? p2 : p1;
            triggerDramaticZoom(winner);
            endGame(s.win === 'guest' ? 'YOU WIN!' : 'YOU LOSE!', s.win);
        }
    } else if (S.gameState !== 'countdown' || s.gs === 'playing') S.gameState = s.gs;
    // effects, sounds, particles the host produced since the last snapshot
    for (const e of s.ev) {
        if (e.k === 'f' && e.e[0] === 'killcam') applyKillCam(e.e[3], e.e[4]);
        if (e.k === 'f') { fxEvents.push({ type: e.e[0], x: e.e[1], y: e.e[2], a: e.e[3], b: e.e[4], c: e.e[5] || 0 }); if (recBuf.fx.length < 80) recBuf.fx.push(e.e.slice(0, 6)); }
        else if (e.k === 'a') { try { audio[e.m](...e.a); } catch (err) { /* sound not available */ } }
        else if (e.k === 'p') createParticles(...e.e);
        else if (e.k === 'b') koBeams.push({ startX: e.e[0], startY: e.e[1], targetX: STAGE.x + STAGE.width / 2, targetY: STAGE.y, alpha: 1.0, width: 32 });
    }
}

const dispName = (f, i) => (f && f.name) || (f && f.isAI ? 'CPU ' + (i + 1) : 'Player ' + (i + 1));
/** a KO just happened: keep the 5 s before it (the replay ring) and the ~1.7 s after, with who/what/how for the overlay */
function captureKill(def) {
    if (!S.rec || S.rec.length < 20) return;
    const di = idxOf(def), ai = S.lastKO ? S.lastKO.att : -1, att = ai >= 0 ? fighters[ai] : null, h = def._lastHit;
    const hit = h && h.by === att && att ? h : null;
    msOf(di).falls++;
    const meta = {
        n: (S.klog ? S.klog.length : 0) + 1, t: S.stats ? S.stats.frames : 0, att: ai, def: di,
        an: att ? dispName(att, ai) : '', ac: att ? att.char : '', dn: dispName(def, di), dc: def.char,
        move: hit ? (MOVE_NAMES[hit.type] || String(hit.type).toLowerCase()) : '', combo: hit ? hit.combo : 0,
        dmg: Math.round(def.damage || 0), left: Math.max(0, def.stocks - ((S.match && S.match.mode === 'timer' && !S.sudden) ? 0 : 1)),
    };
    (S.klog || (S.klog = [])).push(meta);
    // a clip = 6 s before the KO (or, if the blow that killed was older than that, from that blow on) and 0.5 s after
    const ko0 = S.rec.length - 1, age = def._lhN !== undefined ? (S.recN || 0) - def._lhN : -1, hit0 = age >= 0 && age <= ko0 ? ko0 - age : -1;
    def._lhN = undefined;
    const begin = Math.max(0, hit0 >= 0 ? Math.min(ko0 - 360, hit0 - 24) : ko0 - 360);
    const clip = { frames: S.rec.slice(begin), ko: ko0 - begin, hit: hit0 >= 0 ? hit0 - begin : Math.max(0, ko0 - begin - 20), post: 0, meta };
    (S.clipsPend || (S.clipsPend = [])).push(clip);
}
function pumpClips(fr) {
    const P = S.clipsPend; if (!P || !P.length) return;
    for (let i = P.length - 1; i >= 0; i--) { const c = P[i]; c.frames.push(fr); if (++c.post >= 30) { P.splice(i, 1); finishClip(c); } }
}
function finishClip(c) { const L = S.clips || (S.clips = []); L.push(c); while (L.length > 16) L.shift(); }
const REC_FRAMES = 900;                                  // the replay is the last 5 s of the match, with every effect and the kill-cam camera
function recordFrame() {
    const rec = S.rec || (S.rec = []);
    rec.push({ it: items.map(i => ({ id: i.id, t: i.type, x: r2(i.x), y: r2(i.y), vx: r2(i.vx), vy: r2(i.vy), st: i.st, len: i.len, act: i.act ? 1 : 0, rot: r2(i.rot), sp: r2(i.spin), h: i.hold })), f: fighters.map(f => { if (!f.active) return null; const d = packFighter(f); d._slowK = f._slowK || 1; d._teleported = f._teleported; return d; }), o: orbs.slice(0, 24).map(o => ({ id: o.id, vx: o.vx, vy: o.vy, x: o.x, y: o.y, r: o.r, c: o.charge, own: idxOf(o.owner), k: o.kind || 0, col: o.color })), sh: S.screenShake, fx: recBuf.fx.splice(0), pt: recBuf.p.splice(0), kc: S.kcT > 0 ? [S.kcT, S.kcFull ? 1 : 0, S.kcDef] : null, snd: recBuf.snd.splice(0), bz: [BLAST_ZONES.left, BLAST_ZONES.right, BLAST_ZONES.top, BLAST_ZONES.bottom].map(Math.round), sd: S.sudden ? 1 : 0, sdt: S.sdT || 0, sp: SPL.cuts.length ? [SPL.t, ...SPL.cuts] : 0 });
    if (rec.length > REC_FRAMES) rec.shift();
    S.recN = (S.recN || 0) + 1;
    pumpClips(rec[rec.length - 1]);
}
function applyReplayFrame(fr) {
    fr.f.forEach((d, i) => {
        const f = fighters[i]; if (!d || !f) return;
        for (const k in d) {
            const v = d[k];
            if (k === 'swing') f.swing = v ? SWING[v] : null;
            else if (REFS.includes(k)) f[k] = v < 0 ? null : fighters[v];
            else f[k] = v;
        }
        f.px = f.x; f.py = f.y; f._upd = true;
    });
    const seenIt = new Set();
    for (const o of (fr.it || [])) {
        seenIt.add(o.id);
        let g = guestItems.get(o.id);
        if (!g) { g = { id: o.id }; guestItems.set(o.id, g); items.push(g); }
        const had = g.x !== undefined && g.st !== 'held', gx = g.x, gy = g.y;
        Object.assign(g, { type: o.t, x: o.x, y: o.y, vx: o.vx, vy: o.vy, st: o.st, len: o.len, act: !!o.act, rot: o.rot, spin: o.sp, hold: guestFlip(o.h), r: ITEM_R[o.t] });
        if (had && o.st !== 'held' && Math.hypot(gx - o.x, gy - o.y) < 90) { g.x = gx + (o.x - gx) * 0.5; g.y = gy + (o.y - gy) * 0.5; }      // loose items glide to the new position instead of snapping
    }
    for (const [id, g] of guestItems) if (!seenIt.has(id)) { guestItems.delete(id); const i = items.indexOf(g); if (i >= 0) items.splice(i, 1); }
    for (const f of fighters) f.heldItem = f.heldId ? (guestItems.get(f.heldId) || null) : null;
    orbs.length = 0;
    for (const o of fr.o) { const own = o.own < 0 ? p1 : fighters[o.own]; orbs.push({ id: o.id === undefined ? -1 : o.id, x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, r: o.r, charge: o.c, owner: own, color: o.col, life: 200, kind: o.k }); }
    S.screenShake = fr.sh || 0;
    for (const e of fr.fx || []) { fxEvents.push({ type: e[0], x: e[1], y: e[2], a: e[3], b: e[4], c: e[5] || 0 }); }
    for (const q of fr.pt || []) createParticles(q[0], q[1], q[2], q[3]);
    if (fr.sp) { SPL.t = fr.sp[0]; SPL.cuts = fr.sp.slice(1); applySplit(false); }
    if (fr.bz) { BLAST_ZONES.left = fr.bz[0]; BLAST_ZONES.right = fr.bz[1]; BLAST_ZONES.top = fr.bz[2]; BLAST_ZONES.bottom = fr.bz[3]; S.sudden = !!fr.sd; S.sdT = fr.sdt || 0; }     // the closing kill barrier
    for (const q of fr.snd || []) { try { audio[q[0]](...q.slice(1)); } catch (e) { /* audio unavailable */ } }
    if (fr.kc) { S.kcT = fr.kc[0]; S.kcFull = !!fr.kc[1]; S.kcDef = fr.kc[2]; S.kcImpT = fr.kc[0]; } else { S.kcT = 0; S.kcImpT = 0; }
}
/** replay of the last 5 s (offline matches). onDone is called when it ends */
export function startReplay(onDone, clip) {
    const src = clip ? clip.frames : S.rec;
    if (!src || src.length < 30) return false;
    items.length = 0; guestItems.clear();                    // the replay draws its own copies of the items
    S.fxClear++; whirlpools.length = 0; tornadoes.length = 0; winds.length = 0; pillars.length = 0; zapTrails.length = 0; particles.length = 0;       // nothing from the live match is left on screen
    dramaticZoom.active = false;
    S.replay = { frames: src.slice(), i: 0, n: -1, clip: clip || null, done: onDone || null, saved: { bz: { ...BLAST_ZONES }, sudden: S.sudden, sdT: S.sdT } };
    return true;
}
export function stopReplay() { S.kcImpT = 0; if (S.replay) { S.fxClear++; particles.length = 0; orbs.length = 0; const d = S.replay.done, sv = S.replay.saved; if (sv) { Object.assign(BLAST_ZONES, sv.bz); S.sudden = sv.sudden; S.sdT = sv.sdT; } S.replay = null; S.kcT = 0; if (d) d(); } }
function tickReplay() {
    const R = S.replay, c = R.clip;
    R.i += c && !c.final && R.i > c.hit - 8 && R.i < c.hit + 26 ? 0.25 : 1;           // kill clips: the last hit the victim died to plays in slow motion (replays only, never in the match)
    if (c && R.i >= R.frames.length - 1) { R.i = R.frames.length - 1; R.ended = true; }      // a kill clip stops on its last frame: the viewer moves on by hand
    const n = Math.floor(R.i);
    if (n >= R.frames.length) { stopReplay(); return; }
    if (n !== R.n) { R.n = n; applyReplayFrame(R.frames[n]); }
    if (c && !R.ended) {                                                    // zoom in on the victim from just before the blow until the KO has happened
        const s0 = c.hit - 14, e0 = c.ko + 14, el = R.i - s0;
        if (el >= 0 && R.i < e0) { S.kcDur = Math.max(1.2, (e0 - s0) / 60); S.kcT = S.kcDur - el / 60; S.kcFull = true; S.kcDef = c.meta.def; }
    }
}
let _kr = null;
/** play every KO of the match, one clip after another: onClip(i, total, meta) as each starts, onEnd(skipped) after the last */
export function startKillsReplay(onClip, onEnd) {
    const clips = (S.clips || []).slice();
    if (!clips.length) return false;
    _kr = { i: -1, clips, onClip, onEnd, skip: false };
    const next = () => {
        const k = _kr; if (!k) return;
        k.i++;
        if (k.skip || k.i >= k.clips.length) { _kr = null; k.onEnd && k.onEnd(k.skip); return; }
        const c = k.clips[k.i];
        S.lastKO = { att: c.meta.att, def: c.meta.def };
        k.onClip && k.onClip(k.i, k.clips.length, c.meta);
        if (!startReplay(next, c)) next();
    };
    next();
    return true;
}
export function skipKillsReplay() { if (_kr) { _kr.skip = true; stopReplay(); } }
/** next kill (d = 1) or the one before (d = -1; from deep into a clip it first restarts that clip) */
export function stepKillsReplay(d) {
    if (!_kr || !S.replay) return;
    if (d < 0) _kr.i -= (S.replay.i > 90 ? 1 : 2); else if (_kr.i >= _kr.clips.length - 1) { _kr.skip = true; }
    if (_kr.i < -1) _kr.i = -1;
    stopReplay();
}
/** scrub inside the clip that is playing: seconds back (negative) or forward */
export function seekKillsReplay(secs) { const R = S.replay; if (!_kr || !R) return; R.i = Math.max(0, Math.min(R.frames.length - 2, R.i + secs * 60)); R.n = -1; R.ended = false; }
export function killsReplayActive() { return !!_kr; }
export function matchStatsData() {
    const rows = fighters.map((f, i) => ({ i, name: dispName(f, i), char: f.char, color: f.color, active: f.active !== false, team: f.team, kos: (S.klog || []).filter(k => k.att === i).length, falls: (S.klog || []).filter(k => k.def === i).length, stocks: Math.max(0, f.stocks || 0), ...msOf(i) })).filter(r => r.active);
    return { rows, kills: (S.klog || []).slice(), secs: S.stats ? S.stats.frames / 60 : 0, clips: (S.clips || []).length };
}
export function step() {
    if (S.replay) { tickReplay(); return; }
    if (S.kcPause > 0) {                                     // final blow
        if (S.gameState === 'playing' && !S.demo && S.gameMode !== 'training') recordFrame();                  // the freeze is part of the replay too: everything is frozen, then the hit's velocity is released unchanged
        if (--S.kcPause === 0 && S.kcHold) { const h = S.kcHold; Object.assign(h.f, { x: h.x, y: h.y, vx: h.vx, vy: h.vy, hitstun: h.hitstun, px: h.x, py: h.y }); S.kcHold = null; }
        return;
    }
    if (S.sudden && S.online !== 'guest' && (S.gameState === 'playing' || S.gameState === 'countdown')) { S.sdT = (S.sdT || 0) + 1; applySuddenBlast(S.sdT); }
    if (S.gameState === 'playing' && !S.demo && S.gameMode !== 'training') { recordFrame(); if (S.stats) { S.stats.frames++; if (viewerFighter()) S.stats.maxDmg = Math.max(S.stats.maxDmg, viewerFighter().damage || 0); } }
    const bubble = S.online !== 'guest' && items.length > 0;       // the clock bubble slows every projectile, item and ENEMY fighter inside it (not its owner or their team)
    for (const f of fighters) {
        if (!f.active) continue;
        if (bubble) {                                       // clock bubble: fighters inside only advance 3 of every 10 frames
            const k = clockSlowFor(f);
            f._slowK = k;
            if (k < 1) { f._acc += k; if (f._acc >= 1) { f._acc -= 1; f._upd = true; } else f._upd = false; }
            else { f._acc = 0; f._upd = true; }
        } else { f._slowK = 1; f._acc = 0; f._upd = true; }
        if (f._upd) { f.px = f.x; f.py = f.y; f._teleported = false; f._since = 0; } else f._since++;
        if (f.throwFxT > 0 && f._upd) f.throwFxT--;
    }

    if (S.online === 'guest') {
        guestSmooth();                                      // the host simulates; we only show what it sends
    } else if ((S.gameState === 'playing' || S.demo) && S.match) {      // custom match: up to 8 fighters, steered by their players (the menu showcase runs the same loop with two bots)
        const live = fighters.filter(isAlive);
        flushBuffered();
        for (const f of live) {
            if (!f._upd) continue;
            if (f.isAI) { const fs = foesOf(f), vis = fs.filter(x => !(x.cloakT > 0)), foe = nearestOf(f, vis.length ? vis : fs); const seen = foe ? aiSeen(f, foe) : null; f.updateAI(seen || null); aiWalk(f); f.update(); continue; }
            drive(f, f === p1 ? { left: isDown('left'), right: isDown('right'), shield: isDown('shield'), drop: isDown('drop') } : (remote.helds[f.slot] || NOHELD));
            f.update();
        }
        updateWhirlpools(); updateTornadoes(); updateWinds(); updateHazards();
        updateOrbs(); updateDrops(); updatePillars(); updateZapTrails();
        updateItems();
        const live2 = fighters.filter(isAlive);
        for (const a of live2) for (const b of live2) {
            if (a !== b && !(S.match.teams && a.team && a.team === b.team)) checkCombatCollisions(a, b);
        }
        itemInteractions();
        if (!S.sudden && S.match.mode === 'timer' && S.online !== 'guest' && S.gameState === 'playing' && --S.timeLeft <= 0) finishTimer();
    } else if (S.gameState === 'playing') {
        flushBuffered();
        drive(p1, { left: isDown('left'), right: isDown('right'), shield: isDown('shield'), drop: isDown('drop') });
        if (p1._upd) p1.update();
        if (S.online === 'host') drive(p2, remote.helds[1] || NOHELD);   // the guest's fighter, steered by their inputs
        else {
            const staticBot = S.gameMode === 'training' && (!S.train || !S.train.botType || S.train.botType === 'static');
            if (!staticBot) { const seen = aiSeen(p2, p1); p2.updateAI(seen || null); aiWalk(p2); }
        }
        if (p2._upd) p2.update();

        updateWhirlpools(); updateTornadoes(); updateWinds(); updateHazards();
        updateOrbs(); updateDrops(); updatePillars(); updateZapTrails();
        updateItems();

        checkCombatCollisions(p1, p2);
        checkCombatCollisions(p2, p1);
        itemInteractions();
    }
    if (S.online === 'host' && NETHOOK.send && (++netTick % ((NETHOOK.fast && NETHOOK.fast()) ? 1 : 2)) === 0) NETHOOK.send(snapshot());     // 60 snapshots/s on a direct link, 30 through the relay

    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += sw.expansionSpeed;

        const progress = sw.radius / sw.maxRadius;
        if (progress > 0.75) {
            sw.alpha -= 0.025;
        }

        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
            shockwaves.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.drip) { p.vy += 0.42; p.vx *= 0.98; }
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.alpha -= p.drip ? 0.028 : 0.04;
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    for (let i = koBeams.length - 1; i >= 0; i--) {
        const beam = koBeams[i];
        beam.alpha -= 0.02;
        if (beam.alpha <= 0) {
            koBeams.splice(i, 1);
        }
    }

    if (dramaticZoom.active) {
        dramaticZoom.progress += 0.02;
        dramaticZoom.currentZoom += (dramaticZoom.targetZoom - dramaticZoom.currentZoom) * 0.08;
    } else if (S.screenShake > 0) {
        S.screenShake *= 0.88;
        if (S.screenShake < 0.5) S.screenShake = 0;
    }
}

export { spawnItem };
export {
    WORLD, STAGE, BLAST_ZONES, dramaticZoom, keys, mouse, particles, p1, p2,
    Fighter, AIBot, updateAimMatrix, renderHUD, startMatchSequence, endGame, gameOverModal,
    CHARGE_MAX, triggerDramaticZoom, launch,
};
export { applyKillCam, bulwarkRiposte, umbraEdge, pickUp, throwHeldItem, slowAt };
