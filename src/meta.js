// Meta progression: coins, the perk shop, per-character perk "sorting", 20 daily-challenge types, and the ranked ladder.
// Everything is stored in this browser (localStorage key luminary/meta); the game core only reads perks and reports stats.
const KEY = 'luminary/meta';

/** perks, weakest to greatest. tier 0 = plain, 1 = yellow outline, 2 = red, 3 = purple.
 *  stats (summed over the two equipped perks): dmg / kb dealt, taken (damage), kbTaken, walk, cd (cooldown), last (extra damage on the last stock), spawn (extra respawn i-frames), coins */
const P = (tier, name, icon, cost, desc, st) => ({ tier, name, icon, cost, desc, st });
export const PERKS = {
    swift:   P(0, 'Swift Feet',     '👟', 100, '+6% walk speed.', { walk: 0.06 }),
    magnet:  P(0, 'Coin Magnet',    '🧲', 90,  '+25% coins from matches.', { coins: 0.25 }),
    sharp:   P(0, 'Sharp Edge',     '🗡️', 120, '+6% damage dealt.', { dmg: 0.06 }),
    heavy:   P(0, 'Heavy Hands',    '🥊', 120, '+6% knockback dealt.', { kb: 0.06 }),
    last:    P(0, 'Last Stand',     '🔥', 130, '+12% damage dealt on your last stock.', { last: 0.12 }),
    tough:   P(0, 'Tough Skin',     '🛡️', 140, '-8% damage taken.', { taken: -0.08 }),
    iron:    P(0, 'Iron Will',      '⚓', 140, '-6% knockback taken.', { kbTaken: -0.06 }),
    wind2:   P(0, 'Second Wind',    '🌬️', 150, '+1 s of invincibility after you respawn.', { spawn: 60 }),
    quick:   P(0, 'Quick Hands',    '⏱️', 160, 'Special cooldowns 10% shorter.', { cd: -0.10 }),

    swift2:  P(1, 'Fleet Feet',     '👟', 240, '+10% walk speed.', { walk: 0.10 }),
    sharp2:  P(1, 'Keen Edge',      '🗡️', 280, '+10% damage dealt.', { dmg: 0.10 }),
    heavy2:  P(1, 'Crushing Hands', '🥊', 280, '+10% knockback dealt.', { kb: 0.10 }),
    tough2:  P(1, 'Hardened Skin',  '🛡️', 300, '-12% damage taken.', { taken: -0.12 }),
    iron2:   P(1, 'Anchor',         '⚓', 300, '-10% knockback taken.', { kbTaken: -0.10 }),
    quick2:  P(1, 'Rapid Hands',    '⏱️', 340, 'Special cooldowns 16% shorter.', { cd: -0.16 }),

    sharp3:  P(2, 'Razor Edge',     '🗡️', 520, '+15% damage dealt.', { dmg: 0.15 }),
    heavy3:  P(2, 'Titan Hands',    '🥊', 520, '+15% knockback dealt.', { kb: 0.15 }),
    tough3:  P(2, 'Ironclad',       '🛡️', 560, '-17% damage taken.', { taken: -0.17 }),
    coin2:   P(2, 'Gold Rush',      '💰', 480, '+50% coins from matches.', { coins: 0.5 }),
    last2:   P(2, 'Desperado',      '🔥', 520, '+25% damage dealt on your last stock.', { last: 0.25 }),
    phoenix: P(2, 'Phoenix',        '🪶', 540, '+2 s of invincibility after you respawn.', { spawn: 120 }),

    apex:    P(3, 'Apex',           '👑', 900, '+20% damage and +10% knockback dealt.', { dmg: 0.20, kb: 0.10 }),
    bastion: P(3, 'Bastion',        '🏰', 950, '-22% damage taken and -15% knockback taken.', { taken: -0.22, kbTaken: -0.15 }),
    timelord:P(3, 'Time Lord',      '⌛', 1000, 'Special cooldowns 25% shorter and +10% walk speed.', { cd: -0.25, walk: 0.10 }),
    legend:  P(3, 'Last Legend',    '⭐', 1000, '+40% damage dealt on your last stock and +1.5 s respawn invincibility.', { last: 0.40, spawn: 90 }),
    jackpot: P(3, 'Jackpot',        '🎰', 800, 'Double coins from matches.', { coins: 1.0 }),
};
export const PERK_IDS = Object.keys(PERKS);                                  // already ordered weakest to greatest
export const TIER_STYLE = [{ name: 'Standard', color: '#64748b' }, { name: 'Gold', color: '#facc15' }, { name: 'Red', color: '#ef4444' }, { name: 'Purple', color: '#a855f7' }];
/** summed stat of the given perk ids */
export const perkStat = (ids, stat) => ids.reduce((a, id) => a + ((PERKS[id] && PERKS[id].st[stat]) || 0), 0);

/** the 20 challenge types. check(st, cx): st = match stats of the human player, cx = { won, char, mode, secs, stocksLeft, maxDmg } */
export const CHALLENGES = [
    { id: 'win',      name: 'First Blood',      desc: 'Win a match against a bot.',                     coins: 40, check: (s, c) => c.won },
    { id: 'flawless', name: 'Flawless',         desc: 'Win without losing a stock.',                    coins: 70, check: (s, c) => c.won && s.deaths === 0 },
    { id: 'hard',     name: 'Hard Mode',        desc: 'Win a match against a Hard bot.',                coins: 80, check: (s, c) => c.won && c.mode === 'hard' },
    { id: 'combo4',   name: 'Combo Artist',     desc: 'Land a 4-hit combo.',                            coins: 50, check: (s) => s.combo >= 4 },
    { id: 'dmg150',   name: 'Heavy Hitter',     desc: 'Deal 150 total damage in one match.',            coins: 50, check: (s) => s.dealt >= 150 },
    { id: 'stab3',    name: 'Backstabber',      desc: 'Land 3 backstabs (Umbra).',                      coins: 60, check: (s) => s.backstabs >= 3 },
    { id: 'parry2',   name: 'Parry Master',     desc: 'Land 2 counters (Bulwark).',                     coins: 60, check: (s) => s.counters >= 2 },
    { id: 'grab3',    name: 'Grab Happy',       desc: 'Land 3 grabs in one match.',                     coins: 50, check: (s) => s.grabs >= 3 },
    { id: 'item',     name: 'Loot Goblin',      desc: 'Pick up 2 items in a custom match.',             coins: 45, check: (s) => s.items >= 2 },
    { id: 'terra',    name: 'Terra Firma',      desc: 'Win as Terra.',                                  coins: 60, check: (s, c) => c.won && c.char === 'terra' },
    { id: 'ember',    name: 'Ember Ace',        desc: 'Win as Ember.',                                  coins: 60, check: (s, c) => c.won && c.char === 'ember' },
    { id: 'umbra',    name: 'Ghost Story',      desc: 'Win as Umbra.',                                  coins: 60, check: (s, c) => c.won && c.char === 'umbra' },
    { id: 'tide',     name: 'Tide Turner',      desc: 'Win as Tide.',                                   coins: 60, check: (s, c) => c.won && c.char === 'tide' },
    { id: 'volt',     name: 'Volt Rush',        desc: 'Win as Volt.',                                   coins: 60, check: (s, c) => c.won && c.char === 'volt' },
    { id: 'zephyr',   name: 'Gale Force',       desc: 'Win as Zephyr.',                                 coins: 60, check: (s, c) => c.won && c.char === 'zephyr' },
    { id: 'luminent', name: 'Luminary',         desc: 'Win as Luminent.',                               coins: 60, check: (s, c) => c.won && c.char === 'luminent' },
    { id: 'bulwark',  name: 'Unbreakable',      desc: 'Win as Bulwark.',                                coins: 60, check: (s, c) => c.won && c.char === 'bulwark' },
    { id: 'fast',     name: 'Speed Run',        desc: 'Win a match in under 90 seconds.',               coins: 70, check: (s, c) => c.won && c.secs < 90 },
    { id: 'comeback', name: 'Survivor',         desc: 'Win after being above 150% damage.',             coins: 70, check: (s, c) => c.won && c.maxDmg >= 150 },
    { id: 'marathon', name: 'Marathon',         desc: 'Win a match that lasts over 3 minutes.',         coins: 55, check: (s, c) => c.won && c.secs > 180 },
];

export const TIERS = [
    { name: 'Bronze', min: 0, color: '#b45309', bot: 'easy' },
    { name: 'Silver', min: 1100, color: '#94a3b8', bot: 'medium' },
    { name: 'Gold', min: 1300, color: '#facc15', bot: 'hard' },
    { name: 'Platinum', min: 1500, color: '#67e8f9', bot: 'hard' },
    { name: 'Diamond', min: 1750, color: '#a78bfa', bot: 'hard' },
];
export const tierOf = (r) => { let t = TIERS[0]; for (const x of TIERS) if (r >= x.min) t = x; return t; };

const blank = () => ({ coins: 100, owned: [], slots: {}, rating: 1000, wins: 0, losses: 0, daily: { day: '', done: [] }, hist: [] });
let M = blank();
try { const raw = localStorage.getItem(KEY); if (raw) M = { ...blank(), ...JSON.parse(raw) }; } catch (e) { /* private window */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) { /* ignore */ } };
const listeners = new Set();
export const onMetaChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => { save(); for (const fn of listeners) fn(M); };

export const getMeta = () => M;
export const coins = () => M.coins;
export const owns = (id) => M.owned.includes(id);
export function buyPerk(id) {
    const p = PERKS[id];
    if (!p || owns(id)) return { ok: false, msg: 'Already owned.' };
    if (M.coins < p.cost) return { ok: false, msg: `Need ${p.cost - M.coins} more coins.` };
    M.coins -= p.cost; M.owned.push(id); changed();
    return { ok: true, msg: `Bought ${p.name}.` };
}
export const slotsOf = (char) => (M.slots[char] || []).filter(id => owns(id));
export function setSlot(char, idx, id) {
    const s = (M.slots[char] || []).slice(0, 2); while (s.length < 2) s.push(null);
    if (id && (!owns(id) || s.some((x, i) => x === id && i !== idx))) return false;
    s[idx] = id || null; M.slots[char] = s; changed(); return true;
}
/** perk ids the given character fights with */
export const perksFor = (char) => (M.slots[char] || []).filter(id => id && owns(id));

// ---- daily challenges: 3 a day, rotating through the 20 types
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
export function todaysChallenges() {
    const n = dayNum(), out = [];
    for (let i = 0; i < 3; i++) out.push(CHALLENGES[(n * 3 + i * 7 + i) % CHALLENGES.length]);
    return [...new Map(out.map(c => [c.id, c])).values()];
}
function doneToday() { if (M.daily.day !== dayKey()) { M.daily = { day: dayKey(), done: [] }; } return M.daily.done; }
export const isDone = (id) => doneToday().includes(id);

/** called by the game when a match against bots / custom match ends. Returns a summary to show */
export function reportMatch(st, cx) {
    const mult = 1 + perkStat(perksFor(cx.char), 'coins') + (cx.online ? 0 : 0);
    let gain = 10 + (cx.won ? 15 : 0) + Math.min(25, Math.floor(st.dealt / 20)) + Math.min(10, st.kills * 3);
    const done = [];
    for (const ch of todaysChallenges()) {
        if (isDone(ch.id) || !ch.check(st, cx)) continue;
        doneToday().push(ch.id); gain += ch.coins; done.push(ch);
    }
    let rank = null;
    if (cx.ranked) {
        const before = M.rating, tb = tierOf(before);
        const x = cx.online ? 3 : 1;                                   // online ranked climbs 3x faster
        if (!cx.draw) { M.rating = Math.max(0, M.rating + x * (cx.won ? 25 + (st.deaths === 0 ? 10 : 0) : -18)); if (cx.won) M.wins++; else M.losses++; }
        M.hist = [...M.hist.slice(-29), { r: M.rating, w: cx.won ? 1 : 0, t: Date.now() }];
        rank = { before, after: M.rating, tier: tierOf(M.rating), up: tierOf(M.rating).name !== tb.name && M.rating > before, down: tierOf(M.rating).name !== tb.name && M.rating < before };
        gain += cx.won ? 20 : 6;
    }
    gain = Math.round(gain * mult);
    M.coins += gain; changed();
    return { gain, done, rank, coins: M.coins };
}

export function resetMeta() { M = blank(); changed(); }
