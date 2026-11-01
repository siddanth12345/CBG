// Training menu: Configure / Characters / Bots, with saved preferences (up to 10).
import { S, p1, p2, ensureTrain, DEFAULT_TRAIN, applyTrainPrefs, setArena, assignTagNames } from './core.js';
import { CHAR_IDS, CHARS, charOf, getMyChar, setMyChar } from './characters.js';
import { Party } from './net/party.js';

const PKEY = 'luminary.trainPrefs.v1', MAX = 10;
const loadPrefs = () => { try { const a = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(a) ? a.slice(0, MAX) : []; } catch (e) { return []; } };
const savePrefs = (a) => { try { localStorage.setItem(PKEY, JSON.stringify(a)); } catch (e) { /* blocked */ } };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const BOTS = [
    { id: 'static', label: 'Static Bot' },
    { id: 'easy', label: 'Easy Bot' },
    { id: 'medium', label: 'Medium Bot' },
    { id: 'hard', label: 'Hard Bot' },
];

function snap() {
    const t = ensureTrain();
    return {
        stage: t.stage || 'normal',
        stun: t.stun ?? 30,
        lock: t.lock ?? 36,
        jumps: t.jumps,
        airF: t.airF ?? 2,
        walk: t.walk ?? 1,
        char: t.char || getMyChar(),
        botType: t.botType || 'static',
        botChar: t.botChar || t.char || getMyChar(),
    };
}

function applySnap(s, live = true) {
    const t = ensureTrain();
    Object.assign(t, {
        stage: s.stage || 'normal',
        stun: +s.stun || 30,
        lock: +s.lock || 36,
        jumps: s.jumps == null || s.jumps === '' ? null : +s.jumps,
        airF: +s.airF || 2,
        walk: Math.max(0.4, Math.min(2, +s.walk || 1)),
        char: s.char || getMyChar(),
        botType: s.botType || 'static',
        botChar: s.botChar || s.char || getMyChar(),
    });
    if (t.char) setMyChar(t.char);
    if (live && S.gameMode === 'training' && S.gameState === 'playing') applyTrainPrefs();
}

export class TrainUI {
    constructor({ root, isGuideActive }) {
        this.isGuideActive = isGuideActive || (() => false);
        this.tab = 'configure';
        this.prefs = loadPrefs();
        this.renaming = null;
        this.msg = '';
        this.el = document.createElement('div');
        this.el.className = 'lm-modal lm-hidden';
        this.el.innerHTML = `<div class="lm-panel lm-train-panel" role="dialog" aria-label="Training menu">
            <div class="lm-head"><h2>Training menu</h2><button class="lm-x" data-close aria-label="Close">✕</button></div>
            <div class="lm-tabs lm-train-tabs">
                <button class="lm-tab on" data-tab="configure">Configure</button>
                <button class="lm-tab" data-tab="characters">Characters</button>
                <button class="lm-tab" data-tab="bots">Bots</button>
            </div>
            <div class="lm-body" data-body></div>
        </div>`;
        root.appendChild(this.el);
        this.body = this.el.querySelector('[data-body]');
        this.el.addEventListener('click', (e) => this.onClick(e));
        this.el.addEventListener('input', (e) => this.onInput(e));
        this.el.addEventListener('change', (e) => this.onInput(e));
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
            if (this.isGuideActive()) return; // tutorial owns Enter
            if (S.gameMode !== 'training' || S.gameState === 'start') return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            if (document.querySelector('.lm-modal:not(.lm-hidden)') && this.el.classList.contains('lm-hidden')) return;
            e.preventDefault();
            if (!e.repeat) this.toggle();
        });
    }

    open() {
        if (S.gameMode !== 'training') return;
        ensureTrain();
        this.msg = '';
        this.el.classList.remove('lm-hidden');
        this.render();
    }
    close() { this.el.classList.add('lm-hidden'); }
    toggle() { if (this.el.classList.contains('lm-hidden')) this.open(); else this.close(); }
    get open_() { return !this.el.classList.contains('lm-hidden'); }

    onClick(e) {
        const b = e.target.closest('[data-a],[data-tab],[data-close],[data-char],[data-bot],[data-botchar]');
        if (!b) return;
        if (b.dataset.close !== undefined) { this.close(); return; }
        if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(); return; }
        const a = b.dataset.a;
        if (a === 'reset') {
            const cur = snap();
            Object.assign(ensureTrain(), { ...DEFAULT_TRAIN, char: cur.char, botChar: cur.botChar, botType: 'static' });
            applySnap(ensureTrain(), true);
            this.msg = 'Reset to defaults.';
            this.render();
        } else if (a === 'save') {
            if (this.prefs.length >= MAX) { this.msg = 'Max 10 preferences. Delete one first.'; this.render(); return; }
            let n = 1; while (this.prefs.some(p => p.name === 'Training ' + n)) n++;
            this.prefs.push({ id: 't' + Date.now().toString(36), name: 'Training ' + n, s: snap() });
            savePrefs(this.prefs);
            this.msg = 'Saved.';
            this.render();
        } else if (a === 'apply') {
            const p = this.prefs.find(x => x.id === b.dataset.id);
            if (p) { applySnap(p.s, true); this.msg = 'Loaded "' + p.name + '".'; this.render(); }
        } else if (a === 'update') {
            const p = this.prefs.find(x => x.id === b.dataset.id);
            if (p) { p.s = snap(); savePrefs(this.prefs); this.msg = 'Updated "' + p.name + '".'; this.render(); }
        } else if (a === 'del') {
            this.prefs = this.prefs.filter(x => x.id !== b.dataset.id);
            savePrefs(this.prefs);
            this.msg = 'Deleted.';
            this.render();
        } else if (a === 'prename') {
            this.renaming = b.dataset.id; this.render();
            const inp = this.body.querySelector('[data-rename]');
            if (inp) { inp.focus(); inp.select(); }
        } else if (a === 'party') {
            if (Party.role === 'leader' && Party.t) {
                for (let i = 0; i < 3; i++) setTimeout(() => Party.t && Party.t.send({ t: 'go', kind: 'training', code: 'train' }), i * 300);
                this.msg = 'Party invited to training.';
            } else this.msg = 'Create a party first, then invite.';
            this.render();
        }
        if (b.dataset.char) {
            ensureTrain().char = b.dataset.char;
            setMyChar(b.dataset.char);
            applySnap(snap(), true);
            this.render();
        }
        if (b.dataset.bot) {
            ensureTrain().botType = b.dataset.bot;
            applySnap(snap(), true);
            this.render();
        }
        if (b.dataset.botchar) {
            ensureTrain().botChar = b.dataset.botchar;
            applySnap(snap(), true);
            this.render();
        }
    }

    onInput(e) {
        const el = e.target;
        if (el.matches('[data-rename]') && e.type === 'change') {
            const p = this.prefs.find(x => x.id === this.renaming);
            if (p) { p.name = (el.value || p.name).slice(0, 24); savePrefs(this.prefs); }
            this.renaming = null; this.render(); return;
        }
        if (!el.matches('[data-k]')) return;
        const t = ensureTrain();
        const k = el.dataset.k;
        let v = el.type === 'number' ? +el.value : el.value;
        if (k === 'jumps' && (v === '' || el.value === '')) v = null;
        if (k === 'walk') v = Math.max(0.4, Math.min(2, +v || 1));
        if (k === 'stun' || k === 'lock' || k === 'airF') v = Math.max(0, Math.min(k === 'stun' ? 120 : k === 'lock' ? 120 : 6, +v || 0));
        t[k] = v;
        if (k === 'stage') applySnap(snap(), true);
        else if (S.gameMode === 'training' && S.gameState === 'playing') {
            if (k === 'char' || k === 'botType' || k === 'botChar') applyTrainPrefs();
            // stun/lock/walk/jumps/airF read live via helpers
            if (k === 'jumps') { p1.maxJumps = (t.jumps != null ? t.jumps : charOf(p1.char).jumps); p1.jumpsLeft = p1.maxJumps; }
        }
    }

    render() {
        const t = snap();
        this.el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
        let html = '';
        if (this.tab === 'configure') {
            html = `<div class="lm-card"><h4>Stage & feel</h4>
                <div class="lm-setrow"><span>Stage</span><span>
                    <button class="lm-btn lm-mini ${t.stage === 'normal' ? '' : 'lm-btn-ghost'}" data-a="stage" data-k="stage" data-v="normal">€Frontier</button>
                    <button class="lm-btn lm-mini ${t.stage === 'lobby' ? '' : 'lm-btn-ghost'}" data-a="stage" data-k="stage" data-v="lobby">¥Frontier</button>
                    <button class="lm-btn lm-mini ${t.stage === 'horizon' ? '' : 'lm-btn-ghost'}" data-a="stage" data-k="stage" data-v="horizon">€Horizon</button>
                    <button class="lm-btn lm-mini ${t.stage === 'bighorizon' ? '' : 'lm-btn-ghost'}" data-a="stage" data-k="stage" data-v="bighorizon">¥Horizon</button>
                </span></div>
                <div class="lm-setrow"><span>Stun (frames)</span><input data-k="stun" type="number" min="0" max="120" value="${t.stun}"></div>
                <div class="lm-setrow"><span>Move cooldown (frames)</span><input data-k="lock" type="number" min="0" max="120" value="${t.lock}"></div>
                <div class="lm-setrow"><span>Jumps (blank = character default)</span><input data-k="jumps" type="number" min="1" max="10" placeholder="default" value="${t.jumps == null ? '' : t.jumps}"></div>
                <div class="lm-setrow"><span>Air F specials</span><input data-k="airF" type="number" min="0" max="6" value="${t.airF}"></div>
                <div class="lm-setrow"><span>Walk speed (×)</span><input data-k="walk" type="number" min="0.4" max="2" step="0.05" value="${t.walk}"></div>
                <p class="lm-note">30 frames ≈ 0.5 s. Default lock is 36 (~0.6 s).</p>
                <div class="lm-foot2" style="margin-top:10px">
                    <button class="lm-btn lm-btn-ghost" data-a="reset">Reset to default</button>
                    <button class="lm-btn" data-a="save">Save preferences</button>
                    <button class="lm-btn lm-btn-ghost" data-a="party">Invite party</button>
                </div>
            </div>${this.prefsBlock()}`;
        } else if (this.tab === 'characters') {
            html = `<div class="lm-card"><h4>Your character</h4>
                <div class="lm-chargrid">${CHAR_IDS.map(id => {
                    const c = CHARS[id];
                    const on = t.char === id;
                    return `<button class="lm-charpick ${on ? 'on' : ''}" data-char="${id}"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></button>`;
                }).join('')}</div>
            </div>`;
        } else {
            html = `<div class="lm-card"><h4>Training bot</h4>
                <div class="lm-botrow">${BOTS.map(b => `<button class="lm-btn lm-mini ${t.botType === b.id ? '' : 'lm-btn-ghost'}" data-bot="${b.id}">${esc(b.label)}</button>`).join('')}</div>
                <h4 style="margin-top:12px">Bot character</h4>
                <div class="lm-chargrid">${CHAR_IDS.map(id => {
                    const c = CHARS[id];
                    const on = t.botChar === id;
                    return `<button class="lm-charpick ${on ? 'on' : ''}" data-botchar="${id}"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></button>`;
                }).join('')}</div>
                <div class="lm-foot2" style="margin-top:10px">
                    <button class="lm-btn lm-btn-ghost" data-a="reset">Reset to default</button>
                    <button class="lm-btn" data-a="save">Save preferences</button>
                </div>
            </div>${this.prefsBlock()}`;
        }
        if (this.msg) html += `<p class="lm-status">${esc(this.msg)}</p>`;
        this.body.innerHTML = html;

        // stage buttons via data-k on click path - wire stage buttons
        this.body.querySelectorAll('[data-v][data-k="stage"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                ensureTrain().stage = btn.dataset.v;
                applySnap(snap(), true);
                this.render();
            });
        });
    }

    prefsBlock() {
        const rows = this.prefs.map(p => `<div class="lm-preset">
            <div class="lm-pmain">${this.renaming === p.id
                ? `<input data-rename maxlength="24" value="${esc(p.name)}">`
                : `<button class="lm-pname" data-a="apply" data-id="${p.id}"><b>${esc(p.name)}</b></button>`}</div>
            <div class="lm-pbtns">
                <button class="lm-btn lm-btn-ghost lm-mini" data-a="prename" data-id="${p.id}">Rename</button>
                <button class="lm-btn lm-btn-ghost lm-mini" data-a="update" data-id="${p.id}">Update</button>
                <button class="lm-btn lm-btn-ghost lm-mini lm-danger" data-a="del" data-id="${p.id}">Delete</button>
            </div></div>`).join('');
        return `<div class="lm-card"><h4>Saved preferences ${this.prefs.length} / ${MAX}</h4>
            <div class="lm-plist">${rows || '<p class="lm-note">No saved preferences yet.</p>'}</div></div>`;
    }
}
