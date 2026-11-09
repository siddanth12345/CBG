// Meta progression: coins, the perk shop, per-character perk "sorting", 20 daily-challenge types, and the ranked ladder.
// Everything is stored in this browser (localStorage key luminary/meta); the game core only reads perks and reports stats.
const KEY = 'luminary/meta';

/** balanced perks: each is a small edge, a character carries two */
export const PERKS = {
    sharp:  { name: 'Sharp Edge',   icon: '🗡️', cost: 120, desc: '+6% damage dealt.' },
    heavy:  { name: 'Heavy Hands',  icon: '🥊', cost: 120, desc: '+6% knockback dealt.' },
    tough:  { name: 'Tough Skin',   icon: '🛡️', cost: 140, desc: '-8% damage taken.' },
    iron:   { name: 'Iron Will',    icon: '⚓', cost: 140, desc: '-6% knockback taken.' },
    swift:  { name: 'Swift Feet',   icon: '👟', cost: 100, desc: '+6% walk speed.' },
    wind2:  { name: 'Second Wind',  icon: '🌬️', cost: 150, desc: '+1 s of invincibility after you respawn.' },
    quick:  { name: 'Quick Hands',  icon: '⏱️', cost: 160, desc: 'Special-move cooldowns are 10% shorter.' },
    last:   { name: 'Last Stand',   icon: '🔥', cost: 130, desc: '+12% damage dealt while on your last stock.' },
    magnet: { name: 'Coin Magnet',  icon: '🧲', cost: 90,  desc: '+25% coins from matches.' },
};
export const PERK_IDS = Object.keys(PERKS);

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
    const mult = M.owned.length && perksFor(cx.char).includes('magnet') ? 1.25 : 1;
    let gain = 10 + (cx.won ? 15 : 0) + Math.min(25, Math.floor(st.dealt / 20)) + Math.min(10, st.kills * 3);
    const done = [];
    for (const ch of todaysChallenges()) {
        if (isDone(ch.id) || !ch.check(st, cx)) continue;
        doneToday().push(ch.id); gain += ch.coins; done.push(ch);
    }
    let rank = null;
    if (cx.ranked) {
        const before = M.rating, tb = tierOf(before);
        M.rating = Math.max(0, M.rating + (cx.won ? 25 + (st.deaths === 0 ? 10 : 0) : -18));
        if (cx.won) M.wins++; else M.losses++;
        M.hist = [...M.hist.slice(-29), { r: M.rating, w: cx.won ? 1 : 0, t: Date.now() }];
        rank = { before, after: M.rating, tier: tierOf(M.rating), up: tierOf(M.rating).name !== tb.name && M.rating > before, down: tierOf(M.rating).name !== tb.name && M.rating < before };
        gain += cx.won ? 20 : 6;
    }
    gain = Math.round(gain * mult);
    M.coins += gain; changed();
    return { gain, done, rank, coins: M.coins };
}

export function resetMeta() { M = blank(); changed(); }
