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
    luminent: {                                                                                                                                 // side: one 1.2 s thrust-hold-kick (sword stays in, auto kick, no second input)
        H: m(72, [s(5, 12, 124, 36, 82, -4, 6, 0, 0, 0, { cmb: 1 }), s(48, 62, 96, 72, 58, 12, 6, 12, 1.2, -0.55)]),                              // thrust 6 dmg → kick 6 dmg + KB
        T: m(30, [s(4, 14, 100, 44, (k) => 40 + 30 * k, 8, 5, 9, 1.1, -1.3)]),                                                                  // running: a slide (animation only) that knocks foes up
        K: m(30, [s(6, 11, 104, 58, 62, -4, 3, 3, 0.3, -0.3), s(17, 23, 104, 58, 62, -4, 5, 10, 1.1, -0.4)]),                                  // backwards: a mini boomerang swing, out and back
        UG: m(26, [s(5, 14, 84, 132, 24, -52, 6, 11, 1.2, -PI / 2)]),                                                                           // up: a spiralling uppercut
        DG: m(26, [s(5, 14, 200, 70, 0, 0, 5, 10, 1.1, -0.5, { radial: true })]),                                                               // ground down: a quick 360 spin, knocks foes away from him
        DA: m(26, [s(7, 18, 56, 100, 12, 56, 5, 9, 1, PI / 2)]),                                                                                // air down: a downward kick wrapped in a glowing spiral
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
        K: m(60, [s(6, 11, 112, 110, 50, -34, 3, 0.5, 0, -PI / 4), s(14, 19, 112, 110, 50, -34, 3, 0.5, 0, -PI / 4), s(22, 27, 112, 110, 50, -34, 3, 0.5, 0, -PI / 4), s(30, 35, 112, 110, 50, -34, 3, 0.5, 0, -PI / 4), s(38, 43, 112, 110, 50, -34, 3, 0.5, 0, -PI / 4), s(48, 54, 112, 110, 52, -34, 3, 10, 1.1, -PI / 4)]),                                                                            // backwards: a sideways tornado spin kick (a red twister), launching 45 degrees
        UA: m(28, [s(8, 18, 150, 140, 0, -14, 3, 10, 1.1, -PI / 2)]),                                                                           // air up: an around-the-world fire kick trailing cluster sparks and flame
        UG: m(34, [s(5, 9, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(11, 15, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(17, 21, 74, 112, 46, -46, 3, 0.5, 0, -0.9), s(23, 27, 82, 118, 48, -48, 3, 9, 1, -0.9)]),   // ground up: a small core-charge flamethrower, three licks then a push
        DA: m(26, [s(8, 18, 56, 96, 12, 54, 3, 8, 1, PI / 2)]),                                                                                 // air down: a fiery rock-kick spike
        DG: m(30, [s(8, 22, 176, 68, 0, 0, 3, 8, 1, -PI / 2, { twin: true })]),                                                                                 // ground down: cluster sparks spread along the floor both ways, smoke rising, throws foes up
    },
    tide: {                                                                                                                                     // Tide's golden trident (no melee moves him)
        H: m(24, [s(8, 13, 128, 34, 76, -2, 6, 9, 1, -0.3)]),                                                                                   // a trident thrust straight ahead (ground and air)
        T: m(24, [s(8, 13, 128, 34, 76, -2, 6, 9, 1, -0.3)]),                                                                                   // running: the same thrust with a lunge (animation only)
        K: m(28, [s(8, 16, 132, 64, 72, -2, 6, 10, 1.1, -0.35)]),                                                                               // backwards: he spins 180 degrees slicing the trident behind him
        UG: m(38, [s(21, 27, 120, 170, 0, -96, 7, 11, 1.2, -PI / 2)]),                                                                          // up: a blue orb forms on the raised trident, pops and splashes upward
        DA: m(38, [s(21, 27, 120, 170, 0, 96, 7, 10, 1.1, PI / 2)]),                                                                            // air down: trident pointed down, a blue orb forms, pops and splashes foes downward
        DG: m(40, [s(8, 32, 200, 56, 0, 6, 4, 9, 1, -1.0, { radial: true })]),                                                                  // ground down: a breakdance with splashes all around
    },
    terra: {                                                                                                                                    // Terra's rock melees (no melee moves him)
        H: m(26, [s(9, 14, 112, 62, 64, -6, 10, 12, 1.25, -0.4)]),                                                                              // a haymaker with a rock in his fist (ground and air)
        T: m(34, [s(10, 18, 60, 56, 58, 16, 9, 12, 1.2, -1.2)]),                                                                                // running: he leaps forward onto his belly (animation only), the landing launches whoever is in front (area cut by 70%)
        K: m(32, [s(8, 17, 150, 90, 70, 0, 10, 12, 1.2, -0.4)]),                                                                                // backwards: a spin with a much larger rock
        UG: m(26, [s(9, 16, 66, 150, 34, -30, 10, 13, 1.3, -PI / 2)]),                                                                          // an uppercut
        DG: m(30, [s(10, 16, 200, 50, 0, 28, 9, 11, 1.1, -1.0, { radial: true })]),                                                             // ground down: a stomp, a shockwave both ways
        DA: m(44, [s(18, 32, 84, 150, 0, 76, 9, 10, 1.1, PI / 2)]),                                                                             // air down: he turns to face the screen, lifts a rock overhead, flips and slams it down onto the foe
    },
    bulwark: {                                                                                                                                  // no running lunge: running side attacks use his normal great-sword sweep
        K: m(26, [s(8, 16, 120, 36, 95, -6, 8, 11, 1.2, -0.25)], { leap: { vx: 10, vy: 0, g: false } }),                                      // thrusts the great-sword straight out behind him
    },
};

/** build the playable swing for one move and one direction (d = +1 / -1: the way the move is aimed) */
export function buildMelee(spec, d) {
    const st = spec.st.map((q) => ({
        a: q.a, b: q.b, w: q.w, h: q.h, damage: q.dmg, bkb: q.bkb, kbg: q.kbg, stun: q.stun || 0, twin: !!q.twin, cmb: q.cmb || 0, pull: !!q.pull, step: q.step || 0, radial: !!q.radial,
        path: () => null, px: q.x, py: q.y,
        angle: () => q.pull ? (d === 1 ? PI + 0.15 : -0.15) : (d === 1 ? q.ang : PI - q.ang),
    }));
    return { type: 'J', chargeable: !!spec.ch, a: st[0].a, b: st[st.length - 1].b, stages: st, damage: st[0].damage, bkb: st[0].bkb, kbg: st[0].kbg, w: st[0].w, h: st[0].h, path: () => ({ x: 0, y: 0 }), angle: st[0].angle, n: spec.n, leap: spec.leap || null, lock: spec.lock || null, d };
}
