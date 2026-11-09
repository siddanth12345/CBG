// Shop, perk "Sort" picker, and the Daily & Ranked screen (all reading src/meta.js).
import { PERKS, PERK_IDS, TIER_STYLE, CHALLENGES, TIERS, tierOf, getMeta, buyPerk, owns, setSlot, perksFor, todaysChallenges, isDone, onMetaChange } from './meta.js';
import { CHARS } from './characters.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function modal(root, title) {
    const el = document.createElement('div');
    el.className = 'lm-modal lm-hidden';
    el.innerHTML = `<div class="lm-panel" role="dialog" aria-label="${title}"><div class="lm-head"><h2>${title}</h2><span class="mu-coins" style="margin-left:auto;margin-right:10px;font-weight:800;color:#fde047"></span><button class="lm-x" data-close aria-label="Close">✕</button></div><div class="lm-body" data-body></div></div>`;
    root.appendChild(el);
    return el;
}

export class MetaUI {
    constructor({ root, shopBtn, dailyBtn, onRanked }) {
        this.onRanked = onRanked;
        this.shop = modal(root, 'Shop');
        this.sort = modal(root, 'Sort');
        this.daily = modal(root, 'Daily & Ranked');
        this.sortChar = 'luminent';
        for (const el of [this.shop, this.sort, this.daily]) el.style.zIndex = '500';       // above the character menu
        for (const el of [this.shop, this.sort, this.daily]) {
            el.addEventListener('click', (e) => {
                if (e.target === el || e.target.closest('[data-close]')) { el.classList.add('lm-hidden'); return; }
                this.click(e, el);
            });
        }
        if (shopBtn) shopBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openShop(); });
        if (dailyBtn) dailyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openDaily(); });
        onMetaChange(() => this.refresh());
    }
    refresh() { for (const el of [this.shop, this.sort, this.daily]) if (!el.classList.contains('lm-hidden')) this.render(el); }
    openShop() { this.shop.classList.remove('lm-hidden'); this.render(this.shop); }
    openSort(char) { this.sortChar = char; this.sort.classList.remove('lm-hidden'); this.render(this.sort); }
    openDaily() { this.daily.classList.remove('lm-hidden'); this.render(this.daily); }
    click(e, el) {
        const buy = e.target.closest('[data-buy]');
        if (buy) { const r = buyPerk(buy.dataset.buy); this.msg = r.msg; this.render(el); return; }
        const slot = e.target.closest('[data-slot]');
        if (slot) { const [i, id] = slot.dataset.slot.split(':'); setSlot(this.sortChar, +i, id === '-' ? null : id); this.render(el); return; }
        if (e.target.closest('[data-ranked]')) { el.classList.add('lm-hidden'); if (this.onRanked) this.onRanked(); return; }
        const go = e.target.closest('[data-goshop]');
        if (go) { el.classList.add('lm-hidden'); this.openShop(); }
    }
    render(el) {
        const M = getMeta();
        el.querySelector('.mu-coins').textContent = `🪙 ${M.coins}`;
        const body = el.querySelector('[data-body]');
        const card = 'padding:10px 12px;border-radius:12px;background:rgba(30,41,59,.7);border:1px solid rgba(148,163,184,.25);margin-bottom:8px;display:flex;align-items:center;gap:10px;';
        if (el === this.shop) {
            body.innerHTML = `<p class="lm-note">Earn coins from matches, daily challenges and the ranked ladder. Perks are small, balanced edges: equip two per character with the <b>Sort</b> button in the Characters menu.${this.msg ? `<br><b style="color:#fde047">${esc(this.msg)}</b>` : ''}</p>` + PERK_IDS.map(id => {
                const p = PERKS[id], has = owns(id), ts = TIER_STYLE[p.tier];
                return `<div style="${card}border:2px solid ${p.tier ? ts.color : 'rgba(148,163,184,.25)'};${p.tier ? `box-shadow:0 0 14px ${ts.color}55;` : ''}"><span style="font-size:26px">${p.icon}</span><div style="flex:1"><b>${p.name}</b>${p.tier ? ` <small style="color:${ts.color};font-weight:800">${ts.name.toUpperCase()}</small>` : ''}<br><small>${p.desc}</small></div>${has ? '<span style="color:#86efac;font-weight:800">Owned</span>' : `<button class="lm-btn lm-mini" data-buy="${id}" ${M.coins < p.cost ? 'style="opacity:.55"' : ''}>🪙 ${p.cost}</button>`}</div>`;
            }).join('');
        } else if (el === this.sort) {
            const c = CHARS[this.sortChar], cur = (M.slots[this.sortChar] || []).concat([null, null]).slice(0, 2).map(x => (x && owns(x)) ? x : null);
            const slotHtml = (i) => `<div style="${card}flex-direction:column;align-items:stretch"><b>Perk ${i + 1}: ${cur[i] ? PERKS[cur[i]].icon + ' ' + PERKS[cur[i]].name : 'empty'}</b>
                <div style="display:flex;flex-wrap:wrap;gap:6px">${PERK_IDS.filter(id => owns(id)).map(id => `<button class="lm-btn lm-mini ${cur[i] === id ? '' : 'lm-btn-ghost'}" data-slot="${i}:${id}" title="${PERKS[id].desc}" style="${PERKS[id].tier ? `outline:2px solid ${TIER_STYLE[PERKS[id].tier].color};outline-offset:1px;` : ''}${cur[1 - i] === id ? 'opacity:.4' : ''}" ${cur[1 - i] === id ? 'disabled' : ''}>${PERKS[id].icon} ${PERKS[id].name}</button>`).join('') || '<small>You own no perks yet.</small>'}
                ${cur[i] ? `<button class="lm-btn lm-mini lm-btn-ghost" data-slot="${i}:-">Clear</button>` : ''}</div></div>`;
            body.innerHTML = `<p class="lm-note">Sorting <b>${c ? c.name : this.sortChar}</b>: pick up to two perks you own. They apply whenever you play as this character in bot matches, custom matches, training and ranked.</p>${slotHtml(0)}${slotHtml(1)}<button class="lm-btn lm-mini lm-btn-ghost" data-goshop>Open the shop</button>`;
        } else {
            const t = tierOf(M.rating), next = TIERS.find(x => x.min > M.rating);
            const today = todaysChallenges();
            body.innerHTML = `<div style="${card}"><div style="flex:1"><b style="color:${t.color};font-size:20px">${t.name}</b> · ${M.rating}<br><small>${M.wins} wins · ${M.losses} losses${next ? ` · ${next.min - M.rating} to ${next.name}` : ' · top tier'}</small></div><button class="lm-btn" data-ranked>Play ranked (${t.bot})</button></div>
                <p class="lm-note">Ranked is a 1v1 against a ${t.bot} bot as your equipped character. Win +25 (+10 flawless), lose −18, and bonus coins. <b>Online matches against real players are ranked too and move your rating 3x faster</b> (+75 / −54).</p>
                <h3 style="margin:10px 0 6px">Today's challenges</h3>
                ${today.map(c => `<div style="${card}"><span style="font-size:20px">${isDone(c.id) ? '✅' : '🎯'}</span><div style="flex:1"><b>${c.name}</b><br><small>${c.desc}</small></div><b style="color:#fde047">🪙 ${c.coins}</b></div>`).join('')}
                <p class="lm-note">${CHALLENGES.length} challenge types rotate daily. They count in bot matches and custom matches (not training).</p>`;
        }
    }
}
