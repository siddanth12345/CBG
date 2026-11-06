// F specials per character. Slots:  N = neutral (hold F, charges), S = side, U = up, DG = down on the ground, DA = down in the air.
// On mobile these are the red-button hold (N) and the drag onto the side / up / down arrows.
// Every slot has a kind, tuning numbers and a short description. The engine in core.js reads these.
//
//   N  kinds: 'orb'   projectile (ranges are [uncharged, fully charged])
//             'burst' no projectile: a blast around you        'breath' a flame stream in front of you
//   S  kinds: 'tp' teleport + slash   'dash' travelling slash (armor optional)   'wave' a low projectile
//   U  kind : 'rise' recovery that rises (multi-hit or one big hit)
//   DG kinds: 'suplex' (the original grab)   'pound' windup + area hit (at your feet, in front, or at the foe)
//   DA kind : 'dive'  dive with an impact
//
// Damage plan: speedsters (Zephyr, Volt, Umbra) every special lands 8 to 17. Tanks reach 30 (Terra), Bulwark 28.
export const SP = {
    luminent: {
        N: { kind: 'orb', name: 'CBG Core', desc: 'Hold to charge a straight orb. Full charge is purple, bigger and stronger.', cd: 90,
             speed: [15.75, 14.8], r: [12, 39.7], dmg: [4, 20], R: [80, 170], bkb: [5, 9], kbg: 0.55, life: 260 },
        S: { kind: 'tp', name: 'Blink Slash', desc: 'Teleport 220 and slash.', cd: 60, dist: 220, swing: 'BLINK' },
        U: { kind: 'rise', name: 'Rising Spiral', desc: 'Multi-hit rise for recovery.', cd: 120, frames: 36, vy: 10.5, every: 6, hitDmg: 3, lastDmg: 6, lastBkb: 12, lastKbg: 1.1, w: 132, h: 118 },
        DG: { kind: 'suplex', name: 'Suplex', desc: 'Homing grab dash, backflip and slam for 14.', cd: 0 },
        DA: { kind: 'dive', name: 'Headbutt', desc: 'Dive with small hits, then a floor slam for 15 and a stun wave.', cd: 90, vy: 24, hitDmg: 2, every: 6, impactDmg: 15, impactW: 0.125, stun: true },
    },
    bulwark: {
        N: { kind: 'orb', name: 'Bastion Core', desc: 'A slow, huge orb that flies far. Big charge, up to 22 damage.', cd: 150,
             speed: [8, 7], r: [28, 56], dmg: [10, 22], R: [110, 200], bkb: [7, 12], kbg: 0.65, life: 440 },
        S: { kind: 'dash', name: 'Shield Rush', desc: 'An armoured charge that shoves foes along in front of you without hurting much; swords fall from the sky along the path you strode and keep falling until they hit the stage or leave through the kill zone (6 each), and the final shoulder-check at the end knocks them away (6 + 14).', cd: 110, dist: 300, frames: 17, armor: true, flow: true, dmg: 6, bkb: 0, kbg: 0, w: 96, h: 90, ang: 0.35, lock: 30, end: { fwd: 70, w: 130, h: 110, dmg: 14, bkb: 12, kbg: 0.95, ang: -0.35 }, drops: { kind: 'sword', dmg: 6, bkb: 8, kbg: 0.7, w: 70, h: 150, fall: 16 } },
        U: { kind: 'lift', name: 'Sword Lift', desc: 'You ride up on a floating sword, as high as Zephyr\'s Updraft at 0.9x the speed. Anyone above you is knocked off to a random side. Press melee to hop off early.', cd: 150, frames: 44, vy: 12.15, sword: true },
        DG: { kind: 'pound', name: 'Seismic Stomp', desc: 'Wind up, then a ground-pound shockwave (28). Slow but huge. Knockback is soft (0.3×).', cd: 150, windup: 20, w: 0.22, h: 70, dmg: 28, bkb: 3.6, kbg: 0.33, ang: -1.25, stun: 0, lock: 50, hits: 1 },
        DA: { kind: 'dive', name: 'Anvil Drop', desc: 'A fast, heavy plunge. No small hits, one 24-damage impact. Knockback is soft (0.3×).', cd: 140, vy: 30, hitDmg: 0, every: 99, impactDmg: 24, impactW: 0.16, stun: false, bkb: 3.6, kbg: 0.33, ang: -1.3, lock: 30 },
    },
    zephyr: {
        N: { kind: 'burst', name: 'Gale Burst', desc: 'No projectile: a close-range blast of wind that shoves everyone around you away. 7 to 12.', cd: 70,
             frames: 12, every: 12, R: [110, 160], dmg: [7, 12], bkb: [8, 10], kbg: 0.85, radial: true },
        S: { kind: 'dash', name: 'Gust Dash', desc: 'A very fast long dash. It slices through foes (5), spins at the end with a gust that flings them away (6) and you bounce back out.', cd: 50, dist: 320, frames: 8, armor: false, dmg: 5, bkb: 5, kbg: 0.5, w: 84, h: 80, ang: 0.15, multi: true, lock: 14, rebound: 6, end: { w: 210, h: 160, radial: true, dmg: 6, bkb: 7, kbg: 0.85 } },
        U: { kind: 'lift', name: 'Updraft', desc: 'No attack at all: a very high, very fast rise on a gust that only shoves nearby foes away.', cd: 100, frames: 40, vy: 13.5, gust: 170 },
        DG: { kind: 'pound', name: 'Cyclone Kick', desc: 'Spin on the spot: two quick pulses (9 each) that fling nearby foes away from you.', cd: 70, windup: 0, w: 0.09, h: 90, dmg: 9, bkb: 6, kbg: 0.7, ang: -1.2, stun: 0, lock: 22, hits: 2, every: 8, radial: true, centred: true },
        DA: { kind: 'dive', name: 'Dive Kick', desc: 'A quick diagonal kick dive (13) that bounces you up.', cd: 80, vy: 22, vx: 8, hitDmg: 0, every: 99, impactDmg: 13, impactW: 0.08, stun: false, bkb: 9, kbg: 1.0, ang: -1.0, lock: 10 },
    },
    ember: {
        N: { kind: 'breath', name: 'Flamethrower', desc: 'Omnidirectional fire stream aimed where you look (mouse / aim matrix). Hold longer for a longer flame and a stronger final burst. All ticks: 14 uncharged, 18 fully charged.', cd: 100,
             frames: 26, every: 5, w: [200, 330], h: 90, dmg: [2, 2], lastDmg: [4, 8], bkb: 9, kbg: 0.8 },
        S: { kind: 'roll', name: 'Fireball Roll', desc: 'Getting hit mid-roll costs 90% of the damage, no knockback: the roll just pauses 0.5 s (its timer too) and carries on. 0.7 s CD (hard lock). Red 1s / white 1.4× distance / blue full. White beats red, blue beats white. Jump rides 0.6s then cancels. Charge gravity 0.6×. Blue: faster white carry, end hit 12 (1.5× white), end KB 0.7×. White/blue end KB aims with stick/mouse.', cd: 42, speed: [1.6, 3.2], dmg: [0, 0], burn: [0, 0], tick: 0, w: [48, 66], life: [60, 84], rocketBkb: 9.12, rocketKbg: 0.684 },
        U: { kind: 'rocket', name: 'Phoenix Dash', desc: 'Charges for 0.6 s in place (you can still aim), then turn into a fire rocket and fly where you aim, steering sharply for 1.5 s. A grab dash goes straight through the flame and counters it. Foes you drill through stick to the flame and are carried along until the move ends. When it ends: nobody caught = three fire rockets (20 degrees apart, 3 each); the middle rocket flies straight for 0.5 s, then homes with a gentle turn rate like Umbra’s Void Orb; exactly one foe caught = Ember grabs them by the leg, swings them overhead and flings them with normal grab knockback; two or more caught = one fast homing rocket per foe (8 damage, goes through shields).', cd: 140, frames: 90, speed: 12, turn: 0.16, drill: true, maxHits: 6, dmg: 0.95, bkb: 0, kbg: 0, w: 175, h: 175, missile: { speed: 13, r: 12, R: 80, dmg: 3, bkb: 9.6, kbg: 0.72, life: 140 } },
        DG: { kind: 'pound', name: 'Twin Fire Pillars', desc: 'Cluster Bomb: the first press PRIMES you (you glow); then Neutral melee throws three sticky fire bubbles (aim, and 22 degrees either side; you can throw twice = 6, and each throw kicks you back) that stick to surfaces and burst when a foe touches them, when you press Side / Up / Down melee (detonate all), or after 3 s: a burst (2 damage, light knockback with a 0.5 s stun) that then burns foes 2 damage x5 over 3 s (each tick freezes them 0.2 s). Once primed, while bubbles are out, and for 2 s after the last one pops, Down-F is the fire pillars: two pillars of fire erupt in front of AND behind you. A direct hit deals 10 and stuns for 1 s; anything caught in the flames burns for 3 s (3 damage a tick).', cd: 90, windup: 10, lock: 26, hits: 1, pillars: { off: 170, w: 0.06, h: 260, dmg: 10, burn: 180, tick: 3 } },
        DA: { kind: 'dive', name: 'Meteor Fist', desc: 'A straight-down fiery punch; the floor slam deals 14 and stuns (grey) with no knockback.', cd: 110, vy: 26, hitDmg: 2, every: 6, impactDmg: 14, impactW: 0.12, stun: true, stunFrames: 30, lock: 20 },
    },
    tide: {
        N: { kind: 'orb', look: 'water', name: 'Water Orb', desc: 'A big wobbling water orb that drifts far (long range). Bursts and drags foes toward it. Charges 2x faster.', cd: 100,
             speed: [7, 6.5], r: [22, 40], dmg: [7, 15], R: [90, 150], bkb: [3, 5], kbg: 0.45, life: 460, wobble: 5, pull: 5 },
        S: { kind: 'bubble', name: 'Tide Bubble', desc: 'Fire a water bubble at 3x speed. It pops on contact and never traps opponents. Its blast only damages (7): no knockback, no stun. Press Side-F again while it is travelling to detonate it early.', cd: 48, speed: 16.5, r: 46, life: 160, popDmg: 7, R: 165, bkb: 10.4, kbg: 1.105 },
        U: { kind: 'erupt', name: 'Geyser', desc: 'A water pillar erupts right below you, even high in the air, and pushes you up. Foes in it are lifted and stunned (grey, 11 damage, no knockback). When the push ends you get a smooth boost toward your aim (≈3.15× walk speed, gravity still applies).', cd: 130, windup: 6, ride: 12, rideFrames: 14, h: 420, w: 0.06, dmg: 11, stun: 40, lift: 11 },
        DG: { kind: 'pound', name: 'Whirlpool', desc: 'A 3 s whirlpool. No damage, no stun — only grab-style pull to the centre inside the pool. One at a time. 1 s CD.', cd: 60, windup: 8, w: 0.28, h: 40, dmg: 0, bkb: 0, kbg: 0, ang: -1.0, stun: 0, lock: 30, hits: 1, pull: 1760, centred: true, zone: true, life: 180, R: 0.14, rPx: 319 },
        DA: { kind: 'dive', name: 'Splash Dive', desc: 'A plunge ending in a wide splash that shoves foes aside (12).', cd: 90, vy: 22, hitDmg: 0, every: 99, impactDmg: 12, impactW: 0.2, stun: false, bkb: 8, kbg: 0.9, ang: -0.7, lock: 20 },
    },
    volt: {
        N: { kind: 'thunder', name: 'Enlightened', desc: 'Hold to charge (fully charged in 0.7 s), release to freeze in the air with your arms out while a lightning ball drops from above you. Steer it (mouse on PC, joystick on phones). It is as fast as 2x Zephyr\'s walk at full charge (Volt\'s walk at the lowest), 7 to 20 damage with a stunning blast, and lasts 4 s unless it hits a foe or a wall, or you are hit.', cd: 18, life: 240, dmg: [7, 20], R: [90, 130], bkb: [2, 2.2], kbg: [0.2, 0.22], stun: 24 },
        S: { kind: 'tp', name: 'Thunder Dash', desc: 'Teleport a very long way and zap on arrival (normal knockback, 10). The path is left as a zigzag blue lightning trail for 1 s: anyone who touches it is stunned 0.7 s, then has inverted controls for 2 s. Hit while scrambled and they take 1.4x damage with no knockback, and the scramble ends.', cd: 18, dist: 340, swing: 'SP_volt_S', dmg: 10, bkb: 7, kbg: 0.8, stun: 0, trail: true, w: 120, h: 80 },
        U: { kind: 'bolt', name: 'Lightning Rod', desc: 'Blink a little upward, hang for 0.3 s, then teleport twice toward your aim (3 dashes total). Each bolt zaps and stuns what it passes (9) and leaves lightning that only shoves foes the way the bolt went (no stun, no invert). Volt has 3 air F moves instead of 2.', cd: 18, hop: 110, freeze: 18, dist2: 480, dist: 320, w: 100, dmg: 9, stun: 30 },
        DG: { kind: 'pound', name: 'Shock Slam', desc: 'A quick stomp that stuns everyone nearby (9).', cd: 18, windup: 6, w: 0.12, h: 70, dmg: 9, bkb: 2, kbg: 0.2, ang: -1.2, stun: 30, lock: 24, hits: 1, centred: true },
        DA: { kind: 'dive', name: 'Bolt Dive', desc: 'The fastest dive: a stunning impact (12).', cd: 18, vy: 32, hitDmg: 1, every: 5, impactDmg: 12, impactW: 0.1, stun: true, stunFrames: 28 },
    },
    umbra: {
        N: { kind: 'orb', look: 'void', name: 'Void Orb', desc: 'A slow orb that bends a little toward your foe. 8 to 12.', cd: 160,
             speed: [8.5, 7.5], r: [14, 22], dmg: [8, 12], R: [75, 105], bkb: [4, 6], kbg: 0.5, life: 300, curve: 0.02 },
        S: { kind: 'tp', name: 'Shadow Step', desc: 'Half a second of startup (a purple blast gathers around him), then he vanishes and stabs from behind the nearest foe (10). Slow to recover.', cd: 130, lock: 50, windup: 30, dist: 190, behind: true, near: 380, swing: 'SP_umbra_S', dmg: 10, bkb: 9, kbg: 0.9, w: 90, h: 70 },
        U: { kind: 'lift', name: 'Smoke Vanish', desc: 'No attack: you vanish in smoke, untouchable for a moment, and reappear high above.', cd: 150, frames: 20, vy: 13, inv: 18 },
        DG: { kind: 'pound', name: 'Void Pit', desc: 'Marks the foe\'s spot (or in front of you): after a clear delay a pillar of shadow erupts (12).', cd: 150, windup: 32, w: 0.07, h: 200, dmg: 12, bkb: 9, kbg: 0.9, ang: -1.35, stun: 0, lock: 24, hits: 1, atTarget: true },
        DA: { kind: 'dive', name: 'Dagger Plunge', desc: 'A steep stab-dive with a sharp impact (10).', cd: 120, vy: 27, hitDmg: 0, every: 99, impactDmg: 10, impactW: 0.07, stun: false, bkb: 8, kbg: 0.9, ang: -1.1, lock: 18 },
    },
    terra: {
        N: { kind: 'orb', look: 'boulder', pierce: true, name: 'Boulder', desc: 'A heavy boulder thrown in an arc: up to 22 damage. Breaks shields and knocks back normally (contact + AOE). Slow and loud.', cd: 170,
             speed: [9.5, 8.5], r: [32, 56], dmg: [10, 22], R: [110, 190], bkb: [7, 12], kbg: 0.65, life: 220, grav: 0.3 },
        S: { kind: 'dash', name: 'Boulder Roll', desc: 'An armoured roll for 16 damage; rocks fall from the sky along the path you rolled and keep falling until they hit the stage or leave through the kill zone (6 each). Long recovery.', cd: 160, dist: 340, frames: 17, armor: true, dmg: 16, bkb: 11, kbg: 0.95, w: 105, h: 100, ang: 0.4, lock: 70, drops: { kind: 'rock', dmg: 6, bkb: 9, kbg: 0.7, w: 110, h: 170, fall: 16 } },
        U: { kind: 'rise', name: 'Rubble Launch', desc: 'A rubble blast under your feet throws foes away (12), then an armoured slow lift (twice as long as before) with a hit at the top (8).', cd: 170, frames: 72, vy: 6.5, armor: true, every: 99, hitDmg: 0, lastDmg: 8, lastBkb: 11, lastKbg: 1.0, w: 160, h: 140, start: { R: 140, dmg: 12, bkb: 9, kbg: 0.95 } },
        DG: { kind: 'pound', name: 'Quake', desc: 'A slow ground pound: 22 damage in a (30% smaller) radius, armoured while winding up. Knockback matches Bulwark downs exactly (bkb 3.6, kbg 0.33).', cd: 180, windup: 30, armor: true, w: 0.224, h: 80, dmg: 22, bkb: 3.6, kbg: 0.33, ang: -1.3, stun: 0, lock: 70, hits: 1, centred: true },
        DA: { kind: 'dive', name: 'Landslide', desc: 'A heavy drop: one 20-damage impact. Knockback matches Bulwark downs exactly (bkb 3.6, kbg 0.33).', cd: 170, vy: 28, hitDmg: 0, every: 99, impactDmg: 20, impactW: 0.154, stun: false, bkb: 3.6, kbg: 0.33, ang: -1.3, lock: 40 },
    },
};

export const STYLE_OF = { luminent: 'core', bulwark: 'iron', zephyr: 'wind', ember: 'fire', tide: 'water', volt: 'volt', umbra: 'dark', terra: 'rock' };
export const spec = (id, slot) => (SP[id] || SP.luminent)[slot];
export const SLOT_OF = { CORE: 'N', BLINK: 'S', SPIRAL: 'U', SUPLEX: 'DG', HEADBUTT: 'DA' };
export const lerpR = (r, c) => r[0] + (r[1] - r[0]) * c;
