// Tutorial + controls settings. Both are plain DOM modals built here; styles live in ui/style.css (.lm-*).
import { charOf, getMyChar, brief } from './characters.js';
import { S } from './gameCore.js';
import { Guide } from './guide.js';
import { getLayout, setMode } from './layout.js';
import { getGfx, setGfx, getHitboxes, setHitboxes, getZoom, setZoom } from './gfx.js';
import { getNfToggle, setNfToggle, getNfBtn, setNfBtn } from './controls.js';
import { touchMode } from './layout.js';
import { audio } from './gameCore.js';
import { ACTIONS, bindings, keyLabel, codeName, setBinding, resetBindings } from './controls.js';

const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** pages are functions so key names always show the player's current bindings */
const PAGES = [
    {
        title: 'The Goal',
        html: (k) => `
            <div class="lm-guidecta"><div><b>Want to learn by doing?</b><br><span>Play the character based tutorial inside the map: every step asks you to do one thing, and moves on by itself when you do it. <kbd>Backspace</kbd> goes back a step, <kbd>Enter</kbd> skips one, <kbd>${k('fullscreen')}</kbd> toggles fullscreen.</span></div>
                <button class="lm-btn" data-start-guide>▶ Start guided tutorial</button></div>
            <p class="lm-lead">You are <b>${esc(charOf(getMyChar()).name)}</b>. Knock the bot off the stage. Reach <b>250%</b> damage and you are KO'd instantly. Everyone has 3 stocks (custom matches can use a 1 to 10 minute kill timer instead).</p>
            <div class="lm-grid">
                <div class="lm-card"><h4>Aim matrix</h4>
                    <p>Your mouse is measured <b>from your fighter</b>. Inside the small centre circle it reads <b>NEUTRAL</b>; outside it reads <b>UP / DOWN / SIDE</b>. The matrix at the bottom of the screen shows what you are aiming. Hold <kbd>${k('neutral')}</kbd> to force NEUTRAL without moving the mouse.</p></div>
                <div class="lm-card"><h4>Camera</h4>
                    <p>The camera frames both fighters and zooms in when you are close, out when you are far apart (never past the whole map).</p></div>
                <div class="lm-card"><h4>Damage</h4>
                    <p>The higher your %, the farther every hit launches you. Moves have been tuned to be low-damage: jabs 6, slashes 8 to 10, Suplex 14, Headbutt 2 per dive hit and 15 for the slam, Core 4 to 20.</p></div>
                <div class="lm-card"><h4>Practice</h4>
                    <p>Pick <b>Training Mode</b> on the start screen for a dummy that takes knockback in every direction and never fights back.</p></div>
            </div>`,
    },
    {
        title: 'Move & Ledges',
        html: (k) => `
            <div class="lm-grid">
                <div class="lm-card"><h4>Walk &amp; jump</h4>
                    <p><kbd>${k('left')}</kbd> / <kbd>${k('right')}</kbd> walk. <kbd>${k('jump')}</kbd> jumps (you have <b>3 to 5 jumps</b> depending on your character, refilled on the ground or a ledge).</p></div>
                <div class="lm-card"><h4>Move lag</h4>
                    <p>After <b>any</b> move you wait <b>0.7 s</b> before the next one. You can always walk, and you can jump again after <b>0.3 s</b>.</p></div>
                <div class="lm-card"><h4>Ledges</h4>
                    <p>Drift near the stage edge and you grab the ledge (a big magnet, with brief invincibility). <kbd>${k('jump')}</kbd> jumps off it.</p></div>
                <div class="lm-card"><h4>Ledge rules</h4>
                    <ul><li>One fighter per ledge: if someone grabs a ledge you are on, <b>you are kicked off</b> and can't grab a ledge for <b>3 s</b>.</li>
                    <li>Stay on a ledge for <b>3 s</b> and you are kicked off for <b>4 s</b>.</li></ul></div>
            </div>`,
    },
    {
        title: 'Attacks',
        html: (k) => `
            <div class="lm-grid">
                <div class="lm-card"><h4>Melee · PC <kbd>${k('attack')}</kbd> · Mobile: aim grid</h4>
                    <p>You are <b>${esc(charOf(getMyChar()).name)}</b>. Aim picks the swing (PC: mouse; mobile: which arrow). The hit only lasts during the swing. <b>Hold</b> side, up, or down to charge (1.7 s) for up to +30% damage and knockback. Neutral cannot be charged. Melee hitboxes are 1.3× bigger than before.</p>
                    <table class="lm-table"><tr><th>Aim</th><th>Move</th></tr>
                        <tr><td>Neutral</td><td>Neutral melee all the way around (ground or air), knocks up only; can't be charged</td></tr><tr><td>Side</td><td>Side slash</td></tr>
                        <tr><td>Up</td><td>Up slash</td></tr><tr><td>Down</td><td>Down strike (launches on the ground, spikes in the air)</td></tr></table></div>
                <div class="lm-card"><h4>Grab · PC <kbd>${k('grab')}</kbd> · Mobile: Grab button</h4>
                    <p>PC: aim with the mouse, press grab. Mobile: <b>drag the Grab button</b> toward your target and <b>release</b> (it snaps back; a grab only fires once aimed and released). Grab <b>beats shield</b>, loses to nearly everything else, and its knockback is 0.7x a melee and grows with damage. It also picks up and throws items.</p></div>
                <div class="lm-card"><h4>Items (custom matches)</h4>
                    <p>Grab an item to pick it up or use it. <b>Ball</b>: throw for 10 damage, bounces back, 2 throws. <b>Strawberry</b>: heals 30%. <b>Balloon</b>: 7 jumps (Jump); a melee hit pops it and floats the victim for 2 s. <b>Firestick</b>: 5x melee reach, shrinks 0.5 per hit; thrown like a spear it pins its victim for 15 damage until it lands. <b>Clock</b>: throw it, and after 1 s a bubble slows orbs and items inside to 0.3x for 15 s (never the fighters).</p></div>
            </div>`,
    },
    {
        title: 'F Specials',
        html: (k) => {
            const c = charOf(getMyChar()), b = brief(c.id);
            const row = (aim, slot) => `<tr><td>${aim}</td><td><b>${esc(b[slot][0])}</b></td><td>${b[slot][1]}</td></tr>`;
            return `
            <p class="lm-lead">This page is for <b>${esc(c.name)}</b>. <kbd>${k('special')}</kbd> is F. <b>Hold it</b> (mobile: hold the red centre and drag to aim) for the neutral special. <b>Tap it</b> while aiming side, up, or down for that special.</p>
            <table class="lm-table lm-wide">
                <tr><th>Aim</th><th>Move</th><th>What it does</th></tr>
                ${row('Neutral / hold', 'N')}
                ${row('Side', 'S')}
                ${row('Up', 'U')}
                ${row('Down, on the ground', 'DG')}
                ${row('Down, in the air', 'DA')}
            </table>
            <div class="lm-grid">
                <div class="lm-card"><h4>Air limit</h4><p>Only <b>2 F moves in the air</b>. Touch the ground to get them back (a ledge does not). The HUD shows <i>AIR F</i>.</p></div>
                <div class="lm-card"><h4>After a move</h4><p>You wait <b>0.7 s</b> before the next move. You can still walk, and jump again after <b>0.3 s</b>. Each special has its own cooldown.</p></div>
            </div>`;
        },
    },
    {
        title: 'Shield & Roll',
        html: (k) => `
            <div class="lm-grid">
                <div class="lm-card"><h4>Shield · hold <kbd>${k('shield')}</kbd></h4>
                    <p>Blocks and <b>counters everything except a grab</b>: whoever hit it is stunned for 0.5 s. It drains while held and breaks (you get dizzy) when empty, and each blocked hit costs shield.</p></div>
                <div class="lm-card"><h4>Roll · shield + scroll wheel (or <kbd>${k('roll')}</kbd>)</h4>
                    <p>Only possible <b>while shielding</b>. A fast, invincible roll toward your cursor, <b>2 s cooldown</b>. It can't carry you over the void: it stops at the ledge.</p></div>
                <div class="lm-card"><h4>Stun &amp; freeze</h4>
                    <p><b>Stun</b> (0.5 s): you can't act or move. Caused by the Headbutt's floor slam, and by running into a counter.</p>
                    <p><b>Freeze</b> (0.3 s): the get-up after a Headbutt.</p></div>
            </div>`,
    },
    {
        title: 'Counters',
        html: () => {
            const c = charOf(getMyChar()), b = brief(c.id);
            return `
            <p class="lm-lead"><b>${esc(c.name)}</b>: if two moves meet, the one that counters wins and the other is stunned. If both counter each other, they clash and bounce.</p>
            <table class="lm-table lm-wide">
                <tr><th>Move</th><th>Beats</th><th>Loses to</th></tr>
                <tr><td><b>Shield</b></td><td>Most hits, including a spare homing rocket</td><td>Grab</td></tr>
                <tr><td><b>Grab</b></td><td>Shield, and ${esc(b.U[0])} while it is the dash (not its rockets)</td><td>Melee, side, up, down, and cores</td></tr>
                <tr><td><b>Melee</b></td><td>Grab, a charging core, and ${esc(b.U[0])}. Hitbox is 1.3× bigger.</td><td>Shield</td></tr>
                <tr><td><b>${esc(b.S[0])}</b></td><td>Grab, charging cores, and ${esc(b.U[0])}</td><td>Shield and melee</td></tr>
                <tr><td><b>${esc(b.N[0])}</b></td><td>Grab and most dashes while it is live</td><td>Shield, melee, and a side move that beats cores</td></tr>
                <tr><td><b>Up / down F</b></td><td>Grab, and ${esc(b.U[0])} during the dash</td><td>Shield and melee</td></tr>
            </table>
            <p class="lm-note">A move only counters while it is live. Rockets fired after a missed ${esc(b.U[0])} are blocked by shield.</p>`;
        },
    },
    {
        title: 'The Bots',
        html: () => `
            <div class="lm-grid">
                <div class="lm-card"><h4>Easy</h4><p>Slow, defensive, shields a lot and throws the odd small Core.</p></div>
                <div class="lm-card"><h4>Medium</h4><p>Between Easy and Hard: it uses every move, but reacts more slowly, shields and counters less often, and does not learn your habits. In custom matches you can add Easy, Medium or Hard CPUs.</p></div>
                <div class="lm-card"><h4>Hard</h4><p>Uses every move under the same rules you do. It fires Cores when you are on or near an edge, shields incoming Cores, grabs shielders, counters your attacks, and rolls out of combos.</p></div>
                <div class="lm-card"><h4>It learns</h4><p>The Hard bot watches which moves you favour and remembers it between matches in this browser, then leans toward whatever beats your habits.</p></div>
                <div class="lm-card"><h4>Training</h4><p>An idle dummy with infinite stocks and normal physics. Good for practising counters and combos.</p></div>
            </div>`,
    },
    {
        title: 'Mobile Controls',
        html: () => `
            <div class="lm-grid">
                <div class="lm-card"><h4>Move</h4><p>Touch anywhere on the <b>left half</b> of the screen: a joystick appears under your thumb. Left / right walks, pushing down drops through platforms.</p></div>
                <div class="lm-card"><h4>Aim grid</h4><p><b>Tap the red centre</b> for the sword spin. <b>Tap an arrow</b> for the up / side / down melee, or <b>hold</b> it to charge. <b>Hold the red centre 0.4 s</b> for the neutral F (CBG Core), or <b>drag it onto an arrow</b> for that F move (Spiral, Blink, Suplex / Headbutt).</p></div>
                <div class="lm-card"><h4>Shield &amp; grab</h4><p>Hold <b>Shield</b> (it does not drag). While shielding, move the joystick left or right to roll. Use the separate <b>Grab</b> button to grab: drag to aim, release to fire.</p></div>
                <div class="lm-card"><h4>Jump</h4><p>Tap <b>Jump</b> (up to four in the air).</p></div>
                <div class="lm-card"><h4>Your layout</h4><p>Open <b>Settings</b> and choose <b>Edit layout</b> to move the buttons and change their size. You can also force PC or Mobile controls there.</p></div>
            </div>`,
    },
    {
        title: 'Your Controls',
        html: (k) => `
            <table class="lm-table lm-wide lm-keys">
                ${ACTIONS.map(a => `<tr><td>${esc(a.label)}</td><td><kbd>${esc(k(a.id))}</kbd></td></tr>`).join('')}
                <tr><td>Roll (alternative)</td><td><kbd>Shield + Scroll</kbd></td></tr>
            </table>
            <p class="lm-note">Everything above can be changed in <b>Settings</b> (start screen or pause menu).</p>
            <button class="lm-btn lm-btn-ghost" data-open-settings>Open settings…</button>`,
    },
];

export class UI {
    constructor({ $, closeMenu }) {
        this.$ = $;
        this.closeMenu = closeMenu;
        this.page = 0;
        this.capturing = null;
        this.pausedByUI = false;
        const root = $('luminary-root');

        this.guide = new Guide({ root, isBlocked: () => this.isOpen() });

        this.tut = document.createElement('div');
        this.tut.className = 'lm-modal lm-hidden';
        this.tut.innerHTML = `
            <div class="lm-panel" role="dialog" aria-label="Character Based Tutorial">
                <div class="lm-head"><h2>Character Based Tutorial</h2><button class="lm-x" data-close aria-label="Close">✕</button></div>
                <div class="lm-tabs" role="tablist"></div>
                <div class="lm-body"></div>
                <div class="lm-foot">
                    <button class="lm-btn lm-btn-ghost" data-prev>← Back</button>
                    <span class="lm-count"></span>
                    <button class="lm-btn" data-next>Next →</button>
                </div>
            </div>`;
        root.appendChild(this.tut);

        this.set = document.createElement('div');
        this.set.className = 'lm-modal lm-page lm-hidden';
        this.set.innerHTML = `
            <div class="lm-panel lm-panel-page" role="dialog" aria-label="Settings">
                <div class="lm-head"><h2>Settings</h2><button class="lm-x" data-close aria-label="Close">✕</button></div>
                <p class="lm-note lm-hint">PC controls: click a control, then press the key or mouse button you want. Esc cancels. Binding something that is already used swaps the two.</p>
                <div class="lm-body lm-rows"></div>
                <div class="lm-foot">
                    <button class="lm-btn lm-btn-ghost" data-reset>Reset PC controls</button>
                    <button class="lm-btn" data-close>Done</button>
                </div>
            </div>`;
        root.appendChild(this.set);

        // modal wiring
        for (const m of [this.tut, this.set]) {
            m.addEventListener('click', (e) => {
                if (e.target === m || e.target.closest('[data-close]')) this.closeAll();
            });
        }
        this.tut.querySelector('[data-prev]').addEventListener('click', () => this.go(this.page - 1));
        this.tut.querySelector('[data-next]').addEventListener('click', () => this.go(this.page + 1));
        this.tut.addEventListener('click', (e) => {
            if (e.target.closest('[data-open-settings]')) { this.closeAll(); this.openSettings(); }
            if (e.target.closest('[data-start-guide]')) { this.closeAll(); this.closeMenu(); $('startScreen').classList.add('hidden'); this.guide.start(); }
        });
        this.set.querySelector('[data-reset]').addEventListener('click', () => { resetBindings(); this.renderSettings(); this.refreshLabels(); });

        // buttons that already exist in index.html
        const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
        on('tutorialBtnStart', () => this.openTutorial());
        on('settingsBtnStart', () => this.openSettings());
        on('toggleControlsBtn', () => this.toggleTutorial());

        // key / mouse capture for rebinding (capture phase: it runs before the game's own handlers)
        window.addEventListener('keydown', (e) => {
            if (this.capturing) { e.preventDefault(); e.stopImmediatePropagation(); this.finishCapture(e.code); return; }
            if (e.code === 'Escape' && this.isOpen()) { e.preventDefault(); this.closeAll(); }
        }, true);
        window.addEventListener('mousedown', (e) => {
            if (!this.capturing || performance.now() < this.capturing.armedAt) return;
            e.preventDefault(); e.stopImmediatePropagation();
            this.finishCapture('Mouse' + e.button);
            if (e.button === 0) {          // only a left press is followed by a click that must not hit a button underneath
                const swallow = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); window.removeEventListener('click', swallow, true); };
                window.addEventListener('click', swallow, true);
                setTimeout(() => window.removeEventListener('click', swallow, true), 400);
            }
        }, true);

        this.refreshLabels();
    }

    isOpen() { return !this.tut.classList.contains('lm-hidden') || !this.set.classList.contains('lm-hidden'); }

    /** keep the game frozen while a menu is open mid-match */
    pause() { if (S.gameState === 'playing' && !S.online && !window.__luminaryPaused) { window.__luminaryPaused = true; this.pausedByUI = true; } }
    resume() { if (this.pausedByUI) { window.__luminaryPaused = false; this.pausedByUI = false; } }

    closeAll() {
        this.cancelCapture();
        this.tut.classList.add('lm-hidden');
        this.set.classList.add('lm-hidden');
        this.resume();
    }
    openTutorial() { this.closeMenu(); this.set.classList.add('lm-hidden'); this.pause(); this.tut.classList.remove('lm-hidden'); this.renderTutorial(); }
    toggleTutorial() { if (!this.tut.classList.contains('lm-hidden')) this.closeAll(); else this.openTutorial(); }
    openSettings() { this.closeMenu(); this.tut.classList.add('lm-hidden'); this.pause(); this.set.classList.remove('lm-hidden'); this.renderSettings(); }

    go(i) { this.page = Math.max(0, Math.min(PAGES.length - 1, i)); this.renderTutorial(); }
    renderTutorial() {
        const tabs = this.tut.querySelector('.lm-tabs');
        tabs.innerHTML = PAGES.map((p, i) => `<button role="tab" class="lm-tab${i === this.page ? ' on' : ''}" data-i="${i}">${esc(p.title)}</button>`).join('');
        tabs.querySelectorAll('.lm-tab').forEach(b => b.addEventListener('click', () => this.go(+b.dataset.i)));
        this.tut.querySelector('.lm-body').innerHTML = `<h3 class="lm-title">${esc(PAGES[this.page].title)}</h3>` + PAGES[this.page].html(keyLabel);
        this.tut.querySelector('.lm-count').textContent = `${this.page + 1} / ${PAGES.length}`;
        this.tut.querySelector('[data-prev]').disabled = this.page === 0;
        this.tut.querySelector('[data-next]').disabled = this.page === PAGES.length - 1;
        this.tut.querySelector('.lm-body').scrollTop = 0;
    }

    renderSettings() {
        const rows = this.set.querySelector('.lm-rows');
        const L = getLayout();
        const gfx = getGfx();
        const mv = Math.round(audio.musicVolume * 100), sv = Math.round(audio.sfxVolume * 100);
        let group = '', html = `<h4 class="lm-group">Audio</h4>
            <div class="lm-row lm-row-stack"><span>Music<small class="lm-sub">Title, matches and stage themes. Drag to 0 to mute</small></span>
              <label class="lm-vol"><input type="range" min="0" max="100" value="${mv}" data-vol="music"><b data-vol-label="music">${mv}%</b></label></div>
            <div class="lm-row lm-row-stack"><span>Sound effects<small class="lm-sub">Hits, jumps, specials. Drag to 0 to mute</small></span>
              <label class="lm-vol"><input type="range" min="0" max="100" value="${sv}" data-vol="sfx"><b data-vol-label="sfx">${sv}%</b></label></div>
            <h4 class="lm-group">Layout &amp; video</h4>
            <div class="lm-row lm-row-wrap"><span>Control layout<small class="lm-sub">Auto uses touch controls on phones and tablets</small></span>
              <span class="lm-seg">${[['auto', 'Auto'], ['pc', 'PC'], ['mobile', 'Mobile']].map(([m, t]) => `<button class="lm-segb${L.mode === m ? ' on' : ''}" data-mode="${m}">${t}</button>`).join('')}</span></div>
            <div class="lm-row lm-row-wrap"><span>Mobile button layout<small class="lm-sub">Move the grid, jump and shield buttons and resize them</small></span><button class="lm-key" data-edit-layout>Edit layout…</button></div>
            <div class="lm-row lm-row-wrap"><span>Graphics quality<small class="lm-sub">Auto adapts to your device. High is sharpest (phones look pixelated on Low)</small></span>
              <span class="lm-seg">${[['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([m, t]) => `<button class="lm-segb${gfx === m ? ' on' : ''}" data-gfx="${m}">${t}</button>`).join('')}</span></div>
            <div class="lm-row lm-row-wrap"><span>Camera zoom<small class="lm-sub">Only YOUR view. All = every fighter · Stage = stage lock · Player = you + nearest · Full = whole arena</small></span>
              <span class="lm-seg lm-seg-wrap">${[['all', 'All'], ['stage', 'Stage'], ['player', 'Player'], ['full', 'Full']].map(([m, t]) => `<button class="lm-segb${getZoom() === m ? ' on' : ''}" data-zoom="${m}">${t}</button>`).join('')}</span></div>
            ${touchMode() ? `<div class="lm-row"><span>Neutral-force button (green)<small class="lm-sub">Adds a green button that forces every move to be NEUTRAL. Then drag the aim grid's red centre to aim neutral throws (Ember's bubbles, Terra's rock) and release</small></span>
              <span class="lm-seg">${[[0, 'Off'], [1, 'On']].map(([m, t]) => `<button class="lm-segb${(getNfBtn() ? 1 : 0) === m ? ' on' : ''}" data-nfbtn="${m}">${t}</button>`).join('')}</span></div>` : ''}
            <div class="lm-row"><span>Toggle neutral force<small class="lm-sub">Off = hold the neutral key / green button. On = press once to force neutral, press again to go back (PC and mobile)</small></span>
              <span class="lm-seg">${[[0, 'Hold'], [1, 'Toggle']].map(([m, t]) => `<button class="lm-segb${(getNfToggle() ? 1 : 0) === m ? ' on' : ''}" data-nftoggle="${m}">${t}</button>`).join('')}</span></div>
            <div class="lm-row"><span>Show hitboxes<small class="lm-sub">Draws the red attack boxes (for learning the moves). Off by default</small></span>
              <span class="lm-seg">${[[0, 'Off'], [1, 'On']].map(([m, t]) => `<button class="lm-segb${(getHitboxes() ? 1 : 0) === m ? ' on' : ''}" data-hb="${m}">${t}</button>`).join('')}</span></div>
            <div class="lm-row"><span>Fullscreen<small class="lm-sub">Also the corner button on phones</small></span><button class="lm-key" data-fs>Toggle fullscreen</button></div>
            <h4 class="lm-group">PC controls (keyboard &amp; mouse)</h4>`;
        group = 'PC';
        for (const a of ACTIONS) {
            if (a.group !== group) { group = a.group; html += `<h4 class="lm-group">${esc(group)}</h4>`; }
            html += `<div class="lm-row"><span>${esc(a.label)}</span><button class="lm-key" data-action="${a.id}">${esc(codeName(bindings[a.id]))}</button></div>`;
        }
        html += `<div class="lm-row"><span>Roll (alternative)</span><span class="lm-fixed">Shield + Scroll wheel</span></div>`;
        rows.innerHTML = html;
        rows.querySelectorAll('.lm-key[data-action]').forEach(b => b.addEventListener('click', () => this.startCapture(b.dataset.action, b)));
        rows.querySelectorAll('[data-gfx]').forEach(b => b.addEventListener('click', () => { setGfx(b.dataset.gfx); this.renderSettings(); }));
        rows.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => { setZoom(b.dataset.zoom); this.renderSettings(); }));
        rows.querySelectorAll('[data-nfbtn]').forEach(b => b.addEventListener('click', () => { setNfBtn(b.dataset.nfbtn === '1'); this.renderSettings(); }));
        rows.querySelectorAll('[data-nftoggle]').forEach(b => b.addEventListener('click', () => { setNfToggle(b.dataset.nftoggle === '1'); this.renderSettings(); }));
        rows.querySelectorAll('[data-hb]').forEach(b => b.addEventListener('click', () => { setHitboxes(b.dataset.hb === '1'); this.renderSettings(); }));
        rows.querySelectorAll('[data-vol]').forEach(inp => {
            const apply = () => {
                const v = (+inp.value) / 100;
                if (inp.dataset.vol === 'music') audio.setMusicVolume(v);
                else audio.setSfxVolume(v);
                const lab = rows.querySelector('[data-vol-label="' + inp.dataset.vol + '"]');
                if (lab) lab.textContent = Math.round(v * 100) + '%';
                audio.init();
            };
            inp.addEventListener('input', apply);
            inp.addEventListener('change', apply);
        });
        rows.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); this.renderSettings(); }));
        const fs = rows.querySelector('[data-fs]');
        if (fs) fs.addEventListener('click', () => document.dispatchEvent(new Event('cbg-fs')));
        const ed = rows.querySelector('[data-edit-layout]');
        if (ed) ed.addEventListener('click', () => {
            if (!this.layoutEditor) return;
            this.set.classList.add('lm-hidden');                       // the editor is its own full screen on top
            this.layoutEditor.open(() => { this.set.classList.remove('lm-hidden'); this.renderSettings(); });
        });
    }

    startCapture(action, btn) {
        this.cancelCapture();
        this.capturing = { action, btn, armedAt: performance.now() + 150 };
        btn.classList.add('listening');
        btn.textContent = 'Press a key or click…';
    }
    cancelCapture() {
        if (!this.capturing) return;
        this.capturing.btn.classList.remove('listening');
        this.capturing = null;
        this.renderSettings();
    }
    finishCapture(code) {
        if (!this.capturing) return;
        if (code === 'Escape') { this.cancelCapture(); return; }
        setBinding(this.capturing.action, code);
        this.capturing = null;
        this.renderSettings();
        this.refreshLabels();
    }

    /** on-screen hints that name a key */
    refreshLabels() {
        const btn = this.$('toggleControlsBtn');
        if (btn) btn.textContent = `Press '${keyLabel('tutorial')}' for Tutorial`;
    }
}
