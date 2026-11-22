// Race tracks: every map has its own course (small and big versions of a theme share the look, not the track).
// A track is a chain of soft platforms [gap, rise (negative = up), width] after the start island; the last one is the finish island.
const START = { x: 300, y: 3125, w: 1300 };
const CH = {
    // Neon Sprint: a rhythm of short hops, then a long thin bridge between two pillars, a dive, and a final staircase
    frontier:   [[170, 0, 240], [190, -60, 200], [190, 60, 200], [210, -110, 160], [180, 0, 520], [200, 90, 140], [210, 0, 140], [230, -40, 140], [200, 110, 360], [190, -70, 220], [200, -80, 220], [200, -80, 220], [210, 60, 700]],
    // Skyline Climb: a tower of ledges zig-zagging upward, then a long glide down the other side
    big:        [[190, -90, 260], [210, -120, 200], [190, 0, 160], [210, -120, 200], [180, -110, 260], [230, -60, 140], [210, 100, 200], [200, 120, 200], [200, 100, 460], [220, 40, 160], [210, -30, 160], [230, 0, 160], [220, -80, 700]],
    // Cloud Hop: lots of little clouds, every jump a commitment (needs the double jump), with a wide cloud to catch your breath
    horizon:    [[210, -30, 150], [240, 50, 130], [250, -70, 150], [250, 20, 130], [240, -90, 150], [220, 0, 520], [250, 60, 130], [260, -40, 120], [250, 70, 130], [250, -80, 120], [240, 30, 130], [230, -50, 130], [230, 0, 700]],
    // Waterfall Descent: big drops down a cascade of ledges, a rushing flat in the middle, then back up the far wall
    bighorizon: [[170, 90, 260], [200, 130, 200], [190, 120, 200], [200, 110, 340], [200, -20, 440], [210, 120, 160], [200, 100, 200], [210, -90, 200], [200, -120, 180], [210, -120, 180], [200, -110, 200], [200, -60, 700]],
    // Magma Dash: tiny stepping stones over the lava, one long cooled bridge, a final leap
    lava:       [[180, 0, 140], [200, -40, 120], [210, 40, 120], [200, -60, 120], [210, 30, 120], [200, 0, 560], [220, -70, 120], [230, 80, 110], [230, -60, 110], [230, 50, 110], [230, -90, 120], [240, -20, 140], [250, 0, 700]],
    // Volcano Ascent: a steep zig-zag climb around the crater, with a few wide ledges to rest on, and a summit
    biglava:    [[170, -100, 220], [190, -120, 160], [180, 70, 160], [200, -130, 160], [190, -120, 240], [190, 60, 140], [210, -120, 140], [190, -120, 180], [190, -110, 360], [210, 70, 140], [220, -110, 140], [200, -110, 160], [190, -90, 700]],
};
export const TRACK_NAMES = { frontier: 'Neon Sprint', big: 'Skyline Climb', horizon: 'Cloud Hop', bighorizon: 'Waterfall Descent', lava: 'Magma Dash', biglava: 'Volcano Ascent' };
// ---- the full course is three acts (about 3x the old length): the hand-made chain, its mirror with hazards, then a long flat run with big platforms, spinners and shots
const hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const themeOf = (m) => m === 'horizon' || m === 'bighorizon' ? 'horizon' : m === 'lava' || m === 'biglava' ? 'lava' : 'frontier';
export function raceTrack(map) {
    const base = CH[map] || CH.big, th = themeOf(map), R = rng(hash(map));
    const hops = [];                                              // {gap, rise, w, dyn?, rest?, plus?, cloud?, fin?}
    const SC = 0.6, sc = (v) => Math.round(v * SC);              // every course is 0.6x of the old size
    let plain = 0;
    const add = (gap, rise, w, o) => {
        hops.push(Object.assign({ gap, rise, w }, o));
        if (!o || !(o.dyn || o.plus || o.rest || o.cloud || o.fin)) { if (++plain % 3 === 0) hops.push({ gap: sc(230) + Math.round(R() * 40), rise: 0, w: sc(900) + Math.round(R() * 160), rest: 1, stage: 1 }); }      // a small-stage platform after every 3 platforms
    };
    const trap = th === 'frontier' ? 'star' : th === 'lava' ? 'fall' : null;
    // act 1: the hand-made chain of the map (scaled), then the first plus gap
    base.slice(0, -1).forEach(([g, r, w]) => add(sc(g), sc(r), sc(w)));
    // the creative middle: three-platform figures, picked at random for every course, each ending on a stage
    const FIG = {
        stairsUp: [[140, -70, 150], [150, -70, 150], [150, -70, 170]], stairsDown: [[140, 60, 160], [150, 70, 150], [150, 60, 170]],
        zig: [[150, -60, 140], [170, 80, 120], [150, -60, 140]], tiny: [[125, -20, 90], [135, 35, 90], [135, -35, 90]],
        longhop: [[190, 0, 260], [170, -40, 110], [200, 30, 260]], tower: [[130, -85, 110], [130, -85, 110], [130, 90, 120]],
        pits: [[160, 0, 300], [175, 0, 90], [175, 0, 300]], wave: [[150, -50, 140], [150, 0, 140], [150, 50, 140]],
    };
    const names = Object.keys(FIG);
    const fig = (name) => FIG[name].forEach(([g, r, w], i) => add(g + Math.round((R() - 0.5) * 30), r + Math.round((R() - 0.5) * 24), w + Math.round((R() - 0.5) * 30), (i === 1 && trap && R() < 0.4) ? { dyn: trap } : null));
    const plusGap = () => add(sc(1100), 0, sc(560), { plus: 1 });
    const bigGap = () => {
        if (th === 'horizon') { add(sc(640), sc(260), sc(440), { cloud: 1 }); add(sc(230), -sc(260), sc(440)); return; }
        add(sc(170), -12, sc(160), { dyn: trap }); add(sc(170), 18, sc(160), { dyn: trap }); add(sc(170), -12, sc(160), { dyn: trap }); add(sc(200), 6, sc(380));
    };
    plusGap();
    const order = []; for (let i = 0; i < 3; i++) order.push(names.splice(Math.floor(R() * names.length), 1)[0]);
    order.forEach((n, i) => { fig(n); if (i === 0) plusGap(); if (i === 1) bigGap(); });
    bigGap();
    add(sc(1100), 0, sc(700), { plus: 1 });
    add(sc(230), 0, sc(1500), { rest: 1, fin: 1 });
    let x = START.x + START.w, y = START.y;
    const platforms = [], obs = { spin: [], plus: [], shot: [], cloud: [] }, nodes = [{ l: START.x, r: START.x + START.w, y: START.y }];
    let prev = { l: START.x, r: START.x + START.w, y: START.y }, nrm = 0;
    hops.forEach((h, i) => {
        if (h.plus) {                                              // a big plus sign in the middle of the gap: its horizontal arm is a platform for part of every quarter turn
            const r = Math.round(450 * 0.6), cx = prev.r + h.gap / 2, o = { by: prev.y, r, sp: (R() < 0.5 ? -1 : 1) * 0.011, ph: R() * 1.5 };
            const pp = { x: cx - r, y: prev.y, w: r * 2, plus: o }; o.p = pp; nodes.push({ l: pp.x, r: pp.x + pp.w, y: prev.y, dyn: 2 }); obs.plus.push(o);
        }
        x += h.gap; y += h.rise;
        const p = { x, y, w: h.w }; if (h.dyn) { p.dyn = h.dyn; p.by = y; }
        const n = { l: x, r: x + h.w, y, dyn: h.dyn || 0 };
        platforms.push(p); nodes.push(n); n.p = p; if (!h.dyn) { nrm++; if (nrm % 10 === 0) n.cp = 1; }  // a checkpoint on every 10th ordinary platform (trap / plus platforms are skipped, the next normal one takes it)
        if (h.cloud) obs.cloud.push({ x0: prev.r - 10, x1: x + 10, y0: Math.min(prev.y, y) - 340, y1: y + 30 });
        x += h.w; prev = n;
    });
    const last = platforms[platforms.length - 1];
    obs.shot.forEach((o, i) => { o.id = i; });
    return {
        stage: { x: START.x, y: START.y, width: START.w, height: 225 },
        platforms, nodes, finishX: last.x + last.w * 0.5, finishY: last.y, obs, theme: th,
        killY: Math.max(...nodes.map(n => n.y)) + 800, name: TRACK_NAMES[map] || 'Race',
    };
}
/** obstacle motion is a pure function of the race clock, so the host, the guests and the replay all see the same thing */
export const spinAngle = (o, t) => o.ph + o.sp * t;
export const shotPos = (o, k, t) => { const span = o.x1 - o.x0, pos = (t * o.sp + o.off + k * span / o.n) % span; return o.dir > 0 ? o.x0 + pos : o.x1 - pos; };

/** a plus-sign platform is solid while one of its arms is within 30 degrees of level, and gone while it turns through the diagonal */
export const plusSolid = (o, t) => true; const _plusSolidOld = (o, t) => { const m = (((spinAngle(o, t) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)); return Math.min(m, Math.PI / 2 - m) < 0.52; };
