// Every non-Zephyr character's side / up / down melees (Zephyr's own live in gameCore.js). Each move is a list of timed hit windows ("stages") so a move can hit several times in a row.
// Coordinates are for a right-facing fighter (x forward, y up = negative, centre of the body = 0,0) and are mirrored by the direction of the move; angles are for a right-facing hit (negative = upward).
//   H  = side melee                 T = side melee while running on the ground the way you face (a dash)
//   K  = side melee opposite to the way you face (a hop / leap in the aimed direction)
//   UG = up melee                   SL = down melee
// move: n = frames, leap = {vx, vy, g} (applied when any charge is released), lock = [frame, frames] (a stagger after the hit), ch = chargeable, st = hit windows:
//   a, b = first / last frame, w, h = box, x, y = centre (number or fn of k 0..1), dmg, bkb, kbg, ang, step = a little forward push at the start of the window, pull = launch toward the attacker, stun, radial.
const PI = Math.PI;
const m = (n, st, o = {}) => ({ n, st, ch: true, ...o });
const s = (a, b, w, h, x, y, dmg, bkb, kbg, ang, o = {}) => ({ a, b, w, h, x, y, dmg, bkb, kbg, ang, ...o });

export const MELEE = {
    luminent: {
        H: m(22, [s(5, 8, 56, 46, 52, -6, 5, 6, 0.6, -0.3), s(12, 15, 86, 30, 74, -4, 5, 11, 1.2, -0.5)]),                                  // draw-cut, then the light line it left detonates
        T: m(30, [s(4, 12, 70, 40, (k) => 30 + 30 * k, 0, 5, 5, 0.5, -0.2), s(17, 20, 84, 50, -44, 0, 6, 11, 1.2, -0.45)], { leap: { vx: 15, vy: 0, g: false } }),   // slide-through slash, the line explodes behind him
        K: m(24, [s(5, 9, 60, 56, 40, 0, 5, 6, 0.6, -0.3), s(10, 15, 72, 72, 112, -4, 6, 11, 1.2, -0.4)], { leap: { vx: 8, vy: -3, g: false } }),   // spin-back cut + a thrown crescent of light
        UG: m(22, [s(4, 9, 56, 74, 30, -36, 5, 5, 0.5, -PI / 2), s(12, 16, 112, 112, 0, -86, 6, 12, 1.25, -PI / 2)]),                          // rising flip, a sun-ring at the top
        SL: m(24, [s(5, 8, 40, 40, 44, 24, 4, 3, 0.3, -PI / 2), s(14, 18, 52, 74, 72, 16, 7, 12, 1.25, -1.2)]),                              // blade into the floor, a light spike erupts a beat later
    },
    umbra: {
        H: m(18, [s(4, 7, 120, 34, 84, -6, 4, 4, 0.4, -0.3), s(11, 14, 150, 38, 104, -4, 6, 11, 1.2, -0.35)]),                                // a rainbow whip: two long cracks, the second one lands hard
        T: m(28, [s(3, 14, 110, 36, (k) => 40 + 40 * k, 0, 4, 4, 0.4, -0.3), s(15, 18, 120, 36, 70, 0, 6, 11, 1.2, -0.4)], { leap: { vx: 17, vy: 0, g: false } }),   // slides in cracking the rainbow whip
        K: m(24, [s(5, 8, 56, 52, 56, -2, 4, 4, 0.4, -0.3), s(13, 16, 62, 56, 92, -2, 6, 11, 1.2, -0.35)], { leap: { vx: 7, vy: -2, g: false } }),  // three cards are flung out behind him
        UG: m(22, [s(4, 9, 50, 80, 28, -30, 3, 2.5, 0.2, -PI / 2), s(11, 14, 70, 92, 20, -56, 5, 10, 1.2, -PI / 2)]),                          // he takes his top hat off and hurls it upward
        SL: m(24, [s(6, 10, 56, 90, 0, 58, 5, 0, 0, -PI / 2, { stun: 24 }), s(16, 19, 66, 84, 0, 56, 5, 8, 1, -PI / 2)]),                    // cards fan out straight below him
    },
    volt: {
        H: m(24, [s(4, 6, 100, 34, 74, -4, 3, 3, 0.3, -0.2), s(9, 11, 108, 36, 82, -4, 3, 3, 0.3, -0.2), s(14, 17, 134, 42, 98, -4, 5, 11, 1.2, -0.35)], { leap: { vx: 9, vy: 0, g: false } }),   // a crackling yellow whip, three lashes while he glides forward (ground and air)
        T: m(28, [s(3, 14, 128, 44, (k) => 40 + 44 * k, -2, 7, 11, 1.2, -0.3)], { leap: { vx: 17, vy: 0, g: false }, lock: [16, 16] }),         // running: he slides in cracking the yellow whip ahead of him, then staggers
        K: m(22, [s(5, 9, 56, 44, 40, 8, 4, 5, 0.5, -0.3), s(11, 16, 122, 70, 62, -10, 5, 11, 1.2, -0.4)], { leap: { vx: 10, vy: -6, g: true } }),   // reverse kick, then arcs jump toward the foe
        UG: m(22, [s(4, 8, 46, 70, 26, -30, 5, 5, 0.5, -PI / 2), s(11, 15, 112, 92, 0, -62, 5, 11, 1.2, -PI / 2)]),                            // conductor uppercut, the arc catches anyone overhead
        SL: m(26, [s(8, 16, 200, 26, 0, 30, 8, 11, 1.2, -0.5, { radial: true })]),                                                              // grounding stomp: a flat shock ring both ways
    },
    ember: {                                                                                                                                    // Ember's reworked melees (no melee moves him: velocity is never touched)
        H: m(30, [s(10, 16, 92, 60, 58, -6, 3, 9, 1, -0.4)]),                                                                                   // a sideways swipe with a fiery fist: a 0.5 s swing, no stun
        T: m(30, [s(10, 16, 92, 60, 58, -6, 3, 9, 1, -0.4)]),                                                                                   // running: the same fiery swipe
        K: m(30, [s(8, 18, 104, 64, 54, -10, 3, 10, 1.1, -PI / 4)]),                                                                            // backwards: a sideways tornado spin kick (a red twister), launching 45 degrees
        UA: m(28, [s(8, 18, 150, 140, 0, -14, 3, 10, 1.1, -PI / 2)]),                                                                           // air up: an around-the-world fire kick trailing cluster sparks and flame
        UG: m(34, [s(5, 9, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(11, 15, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(17, 21, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(23, 27, 82, 118, 48, -48, 3, 9, 1, -0.9)]),   // ground up: a small core-charge flamethrower, three licks then a push
        DA: m(26, [s(8, 18, 56, 96, 12, 54, 3, 8, 1, PI / 2)]),                                                                                 // air down: a fiery rock-kick spike
        DG: m(30, [s(8, 22, 230, 92, 0, 0, 3, 8, 1, -PI / 2)]),                                                                                 // ground down: cluster sparks spread along the floor both ways, smoke rising, throws foes up
    },
    tide: {
        H: m(22, [s(6, 12, 100, 40, 60, 6, 6, 4, 0.4, 0, { pull: true }), s(15, 18, 56, 46, 36, 0, 5, 11, 1.2, -0.4)]),                       // staff sweep drags the foe in, then shoves them out
        T: m(28, [s(3, 16, 90, 60, (k) => 32 + 20 * k, -4, 7, 11, 1.2, -0.3)], { leap: { vx: 14, vy: 0, g: false }, lock: [18, 14] }),        // surf-ride tackle on a wave
        K: m(24, [s(4, 14, 90, 50, (k) => 50 + 30 * k, 0, 6, 11, 1.2, -0.4)], { leap: { vx: 13, vy: -3, g: false } }),                         // pushes off backward on a wave, sweeping as he goes
        UG: m(22, [s(8, 16, 50, 130, 60, -45, 7, 12, 1.3, -PI / 2)]),                                                                          // geyser flick
        SL: m(26, [s(6, 9, 44, 40, 36, 30, 3, 2, 0.2, -PI / 2), s(10, 20, 140, 20, 60, 34, 1, 0, 0, -PI / 2, { stun: 14 })]),                  // staff plant, a slowing puddle spreads
    },
    terra: {
        H: m(26, [s(8, 13, 64, 54, 50, -6, 10, 12, 1.25, -0.4), s(15, 19, 90, 36, 90, 4, 3, 5, 0.5, -0.3)]),                                  // boulder-fist hook, debris flies on
        T: m(30, [s(4, 16, 90, 70, (k) => 34 + 20 * k, -2, 9, 12, 1.25, -0.35)], { leap: { vx: 11, vy: 0, g: false }, lock: [18, 18] }),       // shoulder-plow
        K: m(26, [s(6, 9, 50, 40, 34, 30, 6, 8, 1, -0.6), s(11, 16, 90, 36, 100, 26, 4, 9, 1, -0.5)], { leap: { vx: 9, vy: -5, g: true } }),   // backward stone-stomp kicks debris at the foe
        UG: m(26, [s(10, 18, 50, 150, 70, -20, 10, 13, 1.3, -PI / 2)]),                                                                        // a pillar rises in front of him
        SL: m(28, [s(8, 11, 90, 50, 40, 26, 9, 10, 1.1, -1.2), s(13, 19, 120, 30, 110, 30, 4, 8, 1, -0.6)]),                                  // two-fist hammer, a ground wave runs out
    },
    bulwark: {                                                                                                                                  // no running lunge: running side attacks use his normal great-sword sweep
        K: m(26, [s(8, 16, 120, 36, 95, -6, 8, 11, 1.2, -0.25)], { leap: { vx: 10, vy: 0, g: false } }),                                      // thrusts the great-sword straight out behind him
    },
};

/** build the playable swing for one move and one direction (d = +1 / -1: the way the move is aimed) */
export function buildMelee(spec, d) {
    const st = spec.st.map((q) => ({
        a: q.a, b: q.b, w: q.w, h: q.h, damage: q.dmg, bkb: q.bkb, kbg: q.kbg, stun: q.stun || 0, pull: !!q.pull, step: q.step || 0, radial: !!q.radial,
        path: () => null, px: q.x, py: q.y,
        angle: () => q.pull ? (d === 1 ? PI + 0.15 : -0.15) : (d === 1 ? q.ang : PI - q.ang),
    }));
    return { type: 'J', chargeable: !!spec.ch, a: st[0].a, b: st[st.length - 1].b, stages: st, damage: st[0].damage, bkb: st[0].bkb, kbg: st[0].kbg, w: st[0].w, h: st[0].h, path: () => ({ x: 0, y: 0 }), angle: st[0].angle, n: spec.n, leap: spec.leap || null, lock: spec.lock || null, d };
}
