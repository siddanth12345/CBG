// Playable characters. All share the same hitboxes and moves; they differ in walk speed, a few special
// tunings, their model and how their melee animations look. Team / FFA colours still drive the glow and
// armour tint, so `look` only adds shape, props and a suit/trim palette.
import { SP } from './specials.js';
export const CHAR_IDS = ['luminent', 'bulwark', 'zephyr', 'ember', 'tide', 'volt', 'umbra', 'terra'];
export const DEFAULT_CHAR = 'luminent';

export const CHARS = {
    luminent: {
        id: 'luminent', name: 'Luminent', role: 'All-rounder', walk: 1.0, orb: 1.0, blink: 1.0, scale: 1.0,
        desc: 'The original fighter of light. Balanced speed, a blade of light and a halo on its back. Nothing is its weakness, nothing is its trick.',
        look: { suit: 0x0f172a, trim: 0xcbd5e1, head: 'crest', weapon: 'blade', anim: 'sword', extra: 'halo' },
        art: { skin: '#cbd5e1', feature: 'crest' },
    },
    bulwark: {
        id: 'bulwark', name: 'Bulwark', role: 'Tank', walk: 0.936, orb: 0.85, blink: 0.8, scale: 1.14,
        desc: 'An armoured knight who walks slowly but never hurries. Swings a heavy tower shield. Armoured specials and the hardest hits.',
        look: { suit: 0x1e293b, trim: 0x94a3b8, head: 'bucket', weapon: 'slab', anim: 'heavy', extra: 'shieldback' },
        art: { skin: '#94a3b8', feature: 'bucket' },
    },
    zephyr: {
        id: 'zephyr', name: 'Zephyr', role: 'Light, very fast', walk: 1.35, orb: 1.15, blink: 1.15, scale: 0.92,
        desc: 'A wind dancer who fights with spins and kicks, no weapon. The fastest walker. Long dashes, wind bursts, very few big hits.',
        look: { suit: 0x134e4a, trim: 0xe2e8f0, head: 'ribbon', weapon: 'fist', anim: 'kick', extra: 'scarf' },
        art: { skin: '#e2e8f0', feature: 'ribbon' },
    },
    ember: {
        id: 'ember', name: 'Ember', role: 'Brawler', walk: 1.0, orb: 1.0, blink: 1.0, scale: 1.0,
        desc: 'A fire monk with bare hands. Palm strikes, flaming kicks, flame hair. Normal speed.',
        look: { suit: 0x3b1d0f, trim: 0xfdba74, head: 'flame', weapon: 'fist', anim: 'palm', extra: 'sash' },
        art: { skin: '#fdba74', feature: 'flame' },
    },
    tide: {
        id: 'tide', name: 'Tide', role: 'Zoner', walk: 0.9, orb: 1.1, blink: 1.0, scale: 1.0,
        desc: 'A water caster with a long staff. Sweeping reach and long-range water specials.',
        look: { suit: 0x0c4a6e, trim: 0x7dd3fc, head: 'fin', weapon: 'staff', anim: 'staff', extra: 'staffback' },
        art: { skin: '#7dd3fc', feature: 'fin' },
    },
    volt: {
        id: 'volt', name: 'Volt', role: 'Rushdown', walk: 1.2, orb: 1.05, blink: 1.2, scale: 0.97,
        desc: 'A bare-fisted sprinter crackling with static. Fast, rapid punches and double stomps, shocking specials.',
        look: { suit: 0x1e1b4b, trim: 0xfde047, head: 'spikes', weapon: 'fist', anim: 'rush', extra: 'bolt' },
        art: { skin: '#fde047', feature: 'spikes' },
    },
    umbra: {
        id: 'umbra', name: 'Umbra', role: 'Trickster', walk: 1.15, orb: 1.0, blink: 1.1, scale: 0.96,
        desc: 'A shadow assassin with twin daggers, a hood and a cape. Quick on its feet, slashes in tight crosses.',
        look: { suit: 0x111827, trim: 0x6b7280, head: 'hood', weapon: 'dagger', anim: 'dagger', extra: 'cape' },
        art: { skin: '#6b7280', feature: 'hood' },
    },
    terra: {
        id: 'terra', name: 'Terra', role: 'Heavy', walk: 0.806, orb: 0.8, blink: 0.75, scale: 1.2,
        desc: 'A rock golem. The slowest walker, with huge fists and slow, crushing specials. Hits like a landslide.',
        look: { suit: 0x292524, trim: 0xa8a29e, head: 'rocks', weapon: 'fist', anim: 'heavy', extra: 'rocks' },
        art: { skin: '#a8a29e', feature: 'rocks' },
    },
};

// knockback taken scales with speed: the slowest walker (Terra) takes 0.6x, the fastest (Zephyr) 1.5x, proportional in between.
// jumps in the air: 3 minimum, 5 maximum; slow tanks recover worst, the fastest has the most.
const BAL_KB = { terra: 1.12, ember: 0.94, umbra: 0.94, bulwark: 1.04 };
const JUMPS = { luminent: 3, bulwark: 3, zephyr: 5, ember: 4, tide: 4, volt: 4, umbra: 4, terra: 3 };
for (const c of Object.values(CHARS)) {
    const w = c.walk;
    c.kb = Math.round((w < 1 ? 1 - 0.4 * (1 - w) / 0.38 : 1 + 0.5 * (w - 1) / 0.35) * 1000) / 1000;
    // light/speedy: 1.15× weight → take less knockback
    if (c.id === 'zephyr' || c.id === 'volt' || c.id === 'umbra') c.kb = Math.round(c.kb / 1.15 * 1000) / 1000;
    c.kb = Math.round(c.kb * (BAL_KB[c.id] || 1) * 1000) / 1000;      // balance pass from bot round-robins: Terra was winning far too much, Ember/Umbra far too little
    c.jumps = JUMPS[c.id];
    const sp = SP[c.id];
    c.specials = [['Hold F', sp.N], ['Side F', sp.S], ['Up F', sp.U], ['Down F (ground)', sp.DG], ['Down F (air)', sp.DA]].map(([k, v]) => ({ key: k, name: v.name, desc: v.desc }));
}

/** One plain sentence per F slot, for the tutorial. Covers what the move actually does. */
export const BRIEF = {
    luminent: {
        N: ['CBG Core', 'Hold F to charge a straight orb. A full charge is bigger, stronger, and purple.'],
        S: ['Blink Slash', 'Tap side F to teleport a short way and slash. Good for getting back or chasing.'],
        U: ['Rising Spiral', 'Tap up F to rise while hitting. It does not spend a jump.'],
        DG: ['Suplex', 'On the ground, down F dashes and grabs. If you catch someone you slam them. It beats shield.'],
        DA: ['Headbutt', 'In the air, down F dives with small hits, then slams the floor and stuns nearby.'],
    },
    bulwark: {
        N: ['Bastion Core', 'Hold F for a slow, huge orb. A full charge hits very hard (up to 22).'],
        S: ['Shield Rush', 'Tap side F for an armoured charge. Swords fall along the path you ran.'],
        U: ['Sword Lift', 'Tap up F to ride up on a floating sword as high as Zephyr rises. Foes above you are speared and carried up. Melee hops you off early; the sword flies on, then falls dragging them down and bursts on landing. 0.3 s recovery.'],
        M: ['Riposte', 'Neutral melee is a sword uppercut counter: 0.7 s open window, 0.7 s aftermath if nothing comes, 1 s cooldown (none after a successful counter). A successful counter up close is a 0.8 s stab-and-pull (1 s of i-frames for both, 1.8 s stun, bleeding); a counter meeting a DOWN move clashes and stuns both of you like a grab clash. Every projectile (cores, rocks, bubbles, rockets, items) flies back (homing ones home to their owner, straight ones 2x faster); up close it ends in a stab: 1.8 s stun and bleeding.'],
        DG: ['Seismic Stomp', 'On the ground, down F winds up, then a big shockwave. Knockback is soft. Bulwark is stunned 0.75 s after the Suplex slam, and 0.67 s after a grab throw.'],
        DA: ['Anvil Drop', 'In the air, down F is one heavy plunge. No small hits. Knockback is soft. He is stunned 0.6 s when he lands.'],
        L: ['Landing stomp', 'Every time Bulwark lands from the air he stomps: 3 damage, light knockback, a small radius, and 0.3 s of get-up animation.'],
    },
    zephyr: {
        N: ['Gale Burst', 'Hold F for a close wind blast. It shoves everyone around you away. No projectile.'],
        S: ['Gust Dash', 'Tap side F for a very fast dash that slices, then a gust, then you bounce back.'],
        U: ['Updraft', 'Tap up F for a very high, very fast rise. It only shoves nearby people. No real hit.'],
        DG: ['Cyclone Kick', 'On the ground, down F spins in place. Two pulses fling people away.'],
        DA: ['Dive Kick', 'In the air, down F is a quick diagonal kick that bounces you back up.'],
    },
    ember: {
        N: ['Flamethrower', 'Hold F and aim a stream of fire. A longer hold means a longer flame and a stronger end burst.'],
        S: ['Fireball Roll', 'Tap side F to roll in a fireball. It carries people. Charge it: red carries, white then knocks back, blue is a faster white. It beats Core charges.'],
        U: ['Phoenix Dash', 'Tap up F, charge in place, then fly where you aim. Grab, melee, side, up, down, and Cores beat the dash itself. The homing rockets are separate.'],
        DG: ['Cluster Bomb', 'On the ground, down F primes you. Then a neutral melee throws sticky fire bubbles.'],
        DA: ['Meteor Fist', 'In the air, down F is a straight punch. The floor hit stuns and does not knock back.'],
    },
    tide: {
        N: ['Water Orb', 'Hold F for a big water orb that flies far and pulls people in. It charges twice as fast.'],
        S: ['Tide Bubble', 'Tap side F for a fast bubble. It only does damage: no knockback, no stun. Press side F again to pop it early.'],
        U: ['Geyser', 'Tap up F and a water pillar under you lifts you. People in it are stunned, not flung. Then you get a short aim boost.'],
        DG: ['Whirlpool', 'On the ground, down F makes a pool that pulls people to the centre. No damage. Only one at a time.'],
        DA: ['Splash Dive', 'In the air, down F plunges into a wide splash that shoves people aside.'],
    },
    volt: {
        N: ['Enlightened', 'Hold F, then release to hang in the air and steer a lightning ball (mouse or joystick). It explodes when it hits, ends, or you get hit.'],
        S: ['Thunder Dash', 'Tap side F to teleport a long way (it stops at walls). The path stays as a blue zigzag trail that stuns touchers 0.5 s; after that, trails ignore them for 1.3 s.'],
        U: ['Lightning Rod', 'Tap up F: a short hop, a 0.3 s hang, then two teleports toward your aim (3 dashes). Each leaves lightning that only shoves foes the way the bolt went.'],
        DG: ['Shock Slam', 'On the ground, down F stomps and stuns everyone nearby for 0.5 s. Every Volt move has a 0.6 s delay before the next, anyone he hits gets 0.6 s of i-frames, a 3rd stun inside 10 s becomes a knockback, and any active move or shield beats his attacks.'],
        DA: ['Bolt Dive', 'In the air, down F is a very fast dive with a stunning hit.'],
    },
    umbra: {
        N: ['Void Orb', 'Hold F for a slow orb that bends a little toward your opponent.'],
        S: ['Shadow Step', 'Tap side F. After a short purple startup you appear behind the nearest person and stab.'],
        U: ['Shadow Flight', 'Tap up F to fly where you aim for 1.1 s as an invisible shadow: invincible, harmless, and straight through walls.'],
        DG: ['Void Pit', 'On the ground, down F marks a spot. After a delay a shadow pillar hits there.'],
        DA: ['Dagger Plunge', 'In the air, down F is a steep stab dive.'],
        M: ['Shadow Edge', 'Passive. Melee hits on a foe who is facing away are backstabs: +40% damage, +20% knockback. A successful backstab makes him 1.7x faster and completely invisible (even his name) for 5 s; only he sees himself, glowing yellow. Bots cannot see him either: hard bots gamble on where he is.'],
    },
    terra: {
        N: ['Boulder', 'Hold F to throw a heavy rock in an arc. It breaks shields and knocks back normally.'],
        S: ['Boulder Roll', 'Tap side F for an armoured roll. Rocks fall along the path you rolled.'],
        U: ['Rubble Launch', 'Tap up F for a blast under your feet, then a slow armoured lift with a hit at the top.'],
        DG: ['Quake', 'On the ground, down F winds up (you are armoured), then a big pound. Knockback is soft.'],
        DA: ['Landslide', 'In the air, down F is one heavy drop. Knockback is soft.'],
    },
};
export const brief = (id) => BRIEF[id] || BRIEF.luminent;
const SLOT_LABEL = [['Hold F', 'N'], ['Side F', 'S'], ['Up F', 'U'], ['Down F (ground)', 'DG'], ['Down F (air)', 'DA'], ['Neutral melee', 'M'], ['Landing', 'L']];
for (const c of Object.values(CHARS)) {
    const b = BRIEF[c.id];
    if (!b) continue;
    c.specials = SLOT_LABEL.filter(([k, slot]) => b[slot]).map(([k, slot]) => ({ key: k, name: b[slot][0], desc: b[slot][1] }));
}

export const charOf = (id) => CHARS[id] || CHARS[DEFAULT_CHAR];

const KEY = 'luminary.char';
export const getMyChar = () => { try { const v = localStorage.getItem(KEY); return CHARS[v] ? v : DEFAULT_CHAR; } catch (e) { return DEFAULT_CHAR; } };
export const setMyChar = (id) => { if (!CHARS[id]) return; try { localStorage.setItem(KEY, id); } catch (e) { /* storage blocked */ } };

/** half-profile portrait (SVG) in the given accent colour: shoulders, a side-on head and the character's feature */
export function portraitSVG(id, accent = '#22d3ee') {
    const c = charOf(id), a = c.art;
    const F = {
        crest: `<path d="M64 26 L96 8 L98 38 Z" fill="#334155"/><path d="M70 22 L94 14" stroke="${accent}" stroke-width="3"/>`,
        bucket: `<rect x="48" y="22" width="52" height="14" rx="3" fill="#64748b"/><path d="M82 10 Q112 8 104 40 L92 34 Z" fill="${accent}" opacity=".85"/><rect x="82" y="46" width="22" height="26" rx="4" fill="#475569"/>`,
        ribbon: `<path d="M52 36 Q22 34 10 62 Q30 52 50 52" fill="${accent}" opacity=".9"/><path d="M52 44 Q26 52 18 84 Q40 68 52 60" fill="${accent}" opacity=".6"/><rect x="52" y="36" width="44" height="6" rx="3" fill="#0f766e"/>`,
        flame: `<path d="M56 34 Q50 8 66 14 Q64 -2 80 10 Q90 0 92 24 Q100 22 98 38 Z" fill="#fb923c"/><path d="M66 32 Q64 16 76 20 Q78 8 88 24 L88 34 Z" fill="#fde047"/>`,
        fin: `<path d="M50 40 Q30 20 54 6 Q50 22 66 28 Q60 14 78 6 Q76 24 90 34 Z" fill="${accent}"/><path d="M50 44 Q40 52 46 66" stroke="#0369a1" stroke-width="6" fill="none"/>`,
        spikes: `<path d="M54 36 L50 6 L66 26 L72 2 L82 26 L96 8 L96 38 Z" fill="#facc15"/><path d="M60 30 L64 18 M78 26 L82 12" stroke="#fff" stroke-width="2" opacity=".8"/>`,
        hood: `<path d="M44 74 Q36 14 74 10 Q110 14 102 56 L92 44 Q96 28 76 26 Q56 28 60 74 Z" fill="#1f2937"/><path d="M96 44 Q118 52 120 84 L104 74 Z" fill="#374151"/>`,
        rocks: `<path d="M52 34 L58 12 L72 24 L84 6 L94 28 L100 34 Z" fill="#78716c"/><circle cx="62" cy="62" r="6" fill="#57534e"/><circle cx="94" cy="58" r="5" fill="#57534e"/><path d="M46 80 L60 66 L72 82 Z" fill="#57534e"/>`,
    };
    return `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs><linearGradient id="pg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>
        <circle cx="64" cy="64" r="60" fill="url(#pg${id})"/>
        <path d="M6 128 Q10 92 42 84 L86 84 Q118 92 122 128 Z" fill="#1e293b"/>
        <path d="M6 128 Q10 92 42 84 L52 84 Q36 100 38 128 Z" fill="#0f172a"/>
        <path d="M18 112 Q40 98 66 100" stroke="${accent}" stroke-width="3" fill="none" opacity=".9"/>
        <rect x="58" y="70" width="20" height="18" rx="6" fill="#334155"/>
        <path d="M48 40 Q48 24 68 24 Q96 24 98 48 Q100 64 90 72 L66 74 Q50 70 48 56 Z" fill="${a.skin}"/>
        <path d="M80 44 L100 46 Q100 54 92 54 L80 52 Z" fill="${accent}"/>
        <path d="M80 44 L100 46" stroke="#fff" stroke-width="2" opacity=".9"/>
        ${F[a.feature] || ''}
    </svg>`;
}
