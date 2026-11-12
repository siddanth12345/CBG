// Account bar (start screen) + sign-in dialog + toast notifications.
import { ACC, onAccount, displayName, getStats, signIn, signUp, signOut, playAsGuest, backend, myEmail, requestEmailCode, confirmEmailCode, recoveryAvailable, requestResetCode, confirmReset, emailReady } from './account.js';
import { borgCount, getRequests, onBorgs } from './friends.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Toasts {
    constructor(root) { this.el = document.createElement('div'); this.el.className = 'lm-toasts'; root.appendChild(this.el); }
    show({ text, actions = [], ttl = 8000 }) {
        const n = document.createElement('div'); n.className = 'lm-toast';
        n.innerHTML = `<span>${esc(text)}</span>`;
        const close = () => { n.remove(); };
        for (const a of actions) {
            const b = document.createElement('button'); b.className = 'lm-btn lm-btn-sm' + (a.ghost ? ' lm-btn-ghost' : ''); b.textContent = a.label;
            b.addEventListener('click', (e) => { e.stopPropagation(); close(); a.fn && a.fn(); });
            n.appendChild(b);
        }
        this.el.appendChild(n);
        if (ttl) setTimeout(close, ttl);
        return n;
    }
}

export class AccountUI {
    constructor({ root, startScreen, openBorgs, onChange }) {
        this.openBorgs = openBorgs; this.onChange = onChange || (() => {});
        this.mode = 'login';

        // ---- bar on the start screen
        this.bar = document.createElement('div'); this.bar.className = 'lm-accbar';
        startScreen.appendChild(this.bar);
        this.bar.addEventListener('click', (e) => {
            const a = e.target.closest('[data-a]'); if (!a) return; e.stopPropagation();
            if (a.dataset.a === 'borgs') this.openBorgs();
            if (a.dataset.a === 'login') this.open('login');
            if (a.dataset.a === 'signup') this.open('signup');
            if (a.dataset.a === 'logout') this.logout();
            if (a.dataset.a === 'email') this.openRecovery('connect');
        });

        // ---- dialog
        this.el = document.createElement('div'); this.el.className = 'lm-modal lm-hidden';
        this.el.innerHTML = `
            <div class="lm-panel lm-panel-sm" role="dialog" aria-label="Account">
                <div class="lm-head"><h2 data-title>Log in</h2><button class="lm-x" data-close aria-label="Close">✕</button></div>
                <div class="lm-body">
                    <div class="lm-tabs"><button class="lm-tab" data-mode="login">Log in</button><button class="lm-tab" data-mode="signup">Create account</button></div>
                    <form data-form autocomplete="off">
                        <label class="lm-field"><span>Username</span><input data-user maxlength="20" autocomplete="username" spellcheck="false"></label>
                        <label class="lm-field"><span>Password</span><input data-pass type="password" maxlength="20" autocomplete="current-password"></label>
                        <label class="lm-check" data-transferrow><input type="checkbox" data-transfer checked><span>Bring my guest progress (borgs, record, controls) into this account</span></label>
                        <p class="lm-rules" data-rules>Username 3-20 letters, numbers or _. Password 3-20 characters with 1 uppercase, 1 lowercase and 1 number.</p>
                        <p class="lm-status bad" data-err></p>
                        <button class="lm-btn lm-wide-btn" type="submit" data-submit>Log in</button>
                        <button type="button" class="lm-btn lm-btn-ghost lm-wide-btn lm-hidden" data-forgot style="margin-top:8px">Forgot password?</button>
                    </form>
                    <div class="lm-or"><span>or</span></div>
                    <button class="lm-btn lm-btn-ghost lm-wide-btn" data-guest>Play as guest</button>
                    <p class="lm-note" data-backend></p>
                </div>
            </div>`;
        root.appendChild(this.el);
        this.q = (s) => this.el.querySelector(s);
        this.el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
        this.q('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
        this.q('[data-guest]').addEventListener('click', () => { playAsGuest(); this.close(false); });
        this.el.addEventListener('click', (e) => { if (e.target === this.el || e.target.closest('[data-close]')) this.close(true); });
        for (const inp of this.el.querySelectorAll('input')) inp.addEventListener('keydown', (e) => e.stopPropagation());   // typing must not trigger game keys

        // ---- e-mail dialog (connect an e-mail with a code / reset a forgotten password)
        this.rec = document.createElement('div'); this.rec.className = 'lm-modal lm-hidden';
        this.rec.innerHTML = `<div class="lm-panel lm-panel-sm" role="dialog" aria-label="E-mail"><div class="lm-head"><h2 data-rtitle>E-mail</h2><button class="lm-x" data-rclose aria-label="Close">✕</button></div><div class="lm-body" data-rbody></div></div>`;
        root.appendChild(this.rec);
        this.rec.addEventListener('click', (e) => { if (e.target === this.rec || e.target.closest('[data-rclose]')) this.rec.classList.add('lm-hidden'); });
        this.rec.addEventListener('keydown', (e) => e.stopPropagation());
        this.q('[data-forgot]').addEventListener('click', () => this.openRecovery('forgot', this.q('[data-user]').value.trim()));
        let ft = 0; this.q('[data-user]').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(async () => { const u = this.q('[data-user]').value.trim(); this.q('[data-forgot]').classList.toggle('lm-hidden', this.mode !== 'login' || !(await recoveryAvailable(u))); }, 250); });

        onAccount(() => this.renderBar());
        onBorgs(() => this.renderBar());
        this.renderBar();
    }

    renderBar() {
        const st = ACC.status;
        if (st === 'loading') { this.bar.innerHTML = '<span class="lm-acc-name">Loading account…</span>'; return; }
        if (st === 'signedOut') { this.bar.innerHTML = '<button class="lm-btn lm-btn-sm" data-a="login">Log in</button><button class="lm-btn lm-btn-sm lm-btn-ghost" data-a="signup">Create account</button>'; return; }
        const s = getStats(), pend = getRequests().incoming.filter(r => !r.splintered).length;
        this.bar.innerHTML = `
            <span class="lm-acc-name">${st === 'guest' ? '👤 ' : '✓ '}<b>${esc(displayName())}</b>${st === 'guest' ? ' <i>(guest)</i>' : ''}</span>
            <span class="lm-acc-rec">${s.wins}W · ${s.losses}L</span>
            <button class="lm-btn lm-btn-sm lm-btn-ghost" data-a="borgs">Borgs ${borgCount()}${pend ? `<em class="lm-badge">${pend}</em>` : ''}</button>
            ${st === 'guest' ? '<button class="lm-btn lm-btn-sm" data-a="login">Log in</button><button class="lm-btn lm-btn-sm lm-btn-ghost" data-a="signup">Sign up</button>' : '<button class="lm-btn lm-btn-sm lm-btn-ghost" data-a="email">E-mail</button><button class="lm-btn lm-btn-sm lm-btn-ghost" data-a="logout">Log out</button>'}`;
    }

    setMode(m) {
        this.mode = m;
        const su = m === 'signup';
        this.q('[data-title]').textContent = su ? 'Create account' : 'Log in';
        this.q('[data-submit]').textContent = su ? 'Create account' : 'Log in';
                this.q('[data-rules]').classList.toggle('lm-hidden', !su);
        this.q('[data-transferrow]').classList.toggle('lm-hidden', ACC.status !== 'guest');
        this.q('[data-pass]').autocomplete = su ? 'new-password' : 'current-password';
        this.el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
        this.q('[data-err]').textContent = '';
        if (m !== 'login') this.q('[data-forgot]').classList.add('lm-hidden');
    }
    open(mode = 'login') {
        this.el.classList.remove('lm-hidden');
        this.q('[data-guest]').classList.toggle('lm-hidden', ACC.status === 'guest');
        this.q('[data-backend]').textContent = backend.name === 'local'
            ? 'No online server is set up (src/net/config.js), so accounts are saved in this browser only.'
            : 'Your account is saved on the online server.';
        this.setMode(mode);
        setTimeout(() => this.q('[data-user]').focus(), 50);
    }
    /** closing the dialog without choosing means "guest" (so the game is always playable) */
    close(asGuest) {
        this.el.classList.add('lm-hidden');
        if (asGuest && ACC.status === 'signedOut') playAsGuest();
    }
    async submit() {
        const u = this.q('[data-user]').value.trim(), p = this.q('[data-pass]').value, em = '';
        const transfer = ACC.status === 'guest' && this.q('[data-transfer]').checked;
        const btn = this.q('[data-submit]'); btn.disabled = true; this.q('[data-err]').textContent = '';
        const err = this.mode === 'signup' ? await signUp(u, p, em, transfer) : await signIn(u, p, transfer);
        btn.disabled = false;
        if (err) { this.q('[data-err]').textContent = err; return; }
        this.q('[data-pass]').value = '';
        this.el.classList.add('lm-hidden');
        this.onChange();
    }
    /** 'connect' = verify an e-mail for the signed-in account, 'forgot' = reset a password with the verified e-mail */
    async openRecovery(kind, username = '') {
        const body = this.rec.querySelector('[data-rbody]'), title = this.rec.querySelector('[data-rtitle]');
        this.rec.classList.remove('lm-hidden');
        const note = (r) => r.test ? `<p class="lm-note"><b>Test mode:</b> e-mail sending is not set up (src/net/config.js), so nothing was sent. Your code is <b>${esc(r.code)}</b>.</p>` : `<p class="lm-note">We sent a 6-digit code to <b>${esc(r.to)}</b>. It works for 10 minutes.</p>`;
        const draw = (h) => { body.innerHTML = h + '<p class="lm-status bad" data-rerr></p>'; const inp = body.querySelector('input'); if (inp) setTimeout(() => inp.focus(), 30); };
        const err = (t) => { const e = body.querySelector('[data-rerr]'); if (e) e.textContent = t || ''; };
        const wire = (sel, fn) => { const b = body.querySelector(sel); if (b) b.addEventListener('click', fn); };
        if (kind === 'connect') {
            title.textContent = 'Connect your e-mail';
            if (ACC.status !== 'user') { draw('<p class="lm-note">Log in to an account to connect an e-mail.</p>'); return; }
            const cur = await myEmail();
            const ask = () => { draw(`${cur ? `<p class="lm-note">Verified e-mail: <b>${esc(cur)}</b>. Enter a new one to replace it.</p>` : '<p class="lm-note">Connect an e-mail so you can reset your password if you forget it. We will send a 6-digit code to confirm it is yours.</p>'}
                <label class="lm-field"><span>E-mail</span><input data-em type="email" maxlength="80" autocomplete="email" spellcheck="false"></label><button class="lm-btn lm-wide-btn" data-send>Send code</button>`);
                wire('[data-send]', async () => { const em = body.querySelector('[data-em]').value.trim(); const r = await requestEmailCode(em); if (r.error) return err(r.error); verify(r); }); };
            const verify = (r) => { draw(`${note(r)}<label class="lm-field"><span>Code</span><input data-code maxlength="6" inputmode="numeric" autocomplete="one-time-code"></label><button class="lm-btn lm-wide-btn" data-ok>Verify</button><button class="lm-btn lm-btn-ghost lm-wide-btn" data-back style="margin-top:8px">Use a different e-mail</button>`);
                wire('[data-ok]', async () => { const x = await confirmEmailCode(body.querySelector('[data-code]').value); if (x.error) return err(x.error); draw(`<p class="lm-note">✓ <b>${esc(x.email)}</b> is now connected to your account.</p>`); }); wire('[data-back]', ask); };
            ask(); return;
        }
        title.textContent = 'Forgot password';
        const start = async () => {
            draw(`<label class="lm-field"><span>Username</span><input data-u maxlength="20" value="${esc(username)}" spellcheck="false"></label><button class="lm-btn lm-wide-btn" data-send>Send code to my e-mail</button>`);
            wire('[data-send]', async () => { username = body.querySelector('[data-u]').value.trim(); const r = await requestResetCode(username); if (r.error) return err(r.error); step2(r); });
        };
        const step2 = (r) => {
            draw(`${note(r)}<label class="lm-field"><span>Code</span><input data-code maxlength="6" inputmode="numeric" autocomplete="one-time-code"></label>
                <label class="lm-field"><span>New password</span><input data-np type="password" maxlength="20" autocomplete="new-password"></label><p class="lm-rules">3-20 characters with 1 uppercase, 1 lowercase and 1 number.</p><button class="lm-btn lm-wide-btn" data-ok>Change password</button>`);
            wire('[data-ok]', async () => { const x = await confirmReset(username, body.querySelector('[data-code]').value, body.querySelector('[data-np]').value); if (x.error) return err(x.error); draw('<p class="lm-note">✓ Password changed. You can log in with it now.</p>'); this.q('[data-user]').value = username; this.q('[data-pass]').value = ''; });
        };
        start();
    }
    async logout() { await signOut(); this.onChange(); this.open('login'); }
}
