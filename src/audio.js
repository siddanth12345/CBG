// Energetic industrial BGM + punchy Smash-style SFX. Music/SFX volume buses (0–1).
const VOL_KEY = 'cbg.vol';
const loadVol = () => {
    try {
        const v = JSON.parse(localStorage.getItem(VOL_KEY) || '{}');
        return {
            music: Math.max(0, Math.min(1, v.music != null ? +v.music : 0.8)),
            sfx: Math.max(0, Math.min(1, v.sfx != null ? +v.sfx : 0.9)),
        };
    } catch (e) { return { music: 0.8, sfx: 0.9 }; }
};
const saveVol = (v) => { try { localStorage.setItem(VOL_KEY, JSON.stringify(v)); } catch (e) { /* blocked */ } };

const BGM = {
    title: 'audio/bgm/01_title_start_screen.wav?v=4',
    duel: 'audio/bgm/02_duel_1v1.wav?v=4',
    frontier: 'audio/bgm/03_stage_frontier.wav?v=4',
    frontier_big: 'audio/bgm/04_stage_frontier_big.wav?v=4',
    horizon: 'audio/bgm/05_stage_horizon.wav?v=4',
    horizon_big: 'audio/bgm/06_stage_horizon_big.wav?v=4',
};

export class SoundEngine {
    constructor() {
        this._ctx = null;
        this.muted = false;                       // SFX only (showcase); music still plays
        this._vol = loadVol();
        this._sfxGain = null;
        this._music = null;
        this._musicKey = null;
        this._musicUnlocked = false;
    }
    get ctx() { return this.muted ? null : this._ctx; }
    get musicVolume() { return this._vol.music; }
    get sfxVolume() { return this._vol.sfx; }

    setMusicVolume(v) {
        this._vol.music = Math.max(0, Math.min(1, +v || 0));
        saveVol(this._vol);
        if (this._music) this._music.volume = this._vol.music;
    }
    setSfxVolume(v) {
        this._vol.sfx = Math.max(0, Math.min(1, +v || 0));
        saveVol(this._vol);
        if (this._sfxGain) this._sfxGain.gain.value = this._vol.sfx;
    }

    init() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._sfxGain = this._ctx.createGain();
            this._sfxGain.gain.value = this._vol.sfx;
            this._sfxGain.connect(this._ctx.destination);
        }
        if (this._ctx.state === 'suspended') this._ctx.resume();
        this._musicUnlocked = true;
        // retry title if we failed autoplay earlier
        if (this._music && this._music.paused) this._music.play().catch(() => {});
    }

    dest() {
        if (!this._ctx) return null;
        return this._sfxGain || this._ctx.destination;
    }

    playMusic(key, { loop = true } = {}) {
        const src = BGM[key];
        if (!src) return;
        // already playing this track
        if (this._musicKey === key && this._music && !this._music.paused) return;
        // same track paused (autoplay block) → just try play again
        if (this._musicKey === key && this._music) {
            this._music.volume = this._vol.music;
            this._music.play().then(() => { this._musicUnlocked = true; }).catch(() => {});
            return;
        }
        this.stopMusic();
        this._musicKey = key;
        const a = new Audio(src);
        a.loop = loop;
        a.volume = this._vol.music;
        a.preload = 'auto';
        const tryPlay = () => a.play().then(() => { this._musicUnlocked = true; }).catch(() => {});
        a.addEventListener('canplaythrough', tryPlay, { once: true });
        tryPlay();
        this._music = a;
    }
    stopMusic() {
        if (this._music) {
            try { this._music.pause(); this._music.removeAttribute('src'); this._music.load(); } catch (e) { /* */ }
            this._music = null;
        }
        this._musicKey = null;
    }
    musicForMap(map) {
        if (map === 'horizon') return 'horizon';
        if (map === 'bighorizon') return 'horizon_big';
        if (map === 'big') return 'frontier_big';
        return 'frontier';
    }

    playF(char, slot) {
        if (this._vol.sfx <= 0 || this.muted) return;
        const name = { n: 'neutral', s: 'side', u: 'up', dg: 'down_ground', da: 'down_air' }[slot] || slot;
        this._sample('f/' + char + '_' + slot + '_' + name, 1, 'f');
    }

    /** play a pre-rendered effect (audio/sfx/*.wav, audio/f/*.wav). Cloned from one preloaded element so rapid repeats overlap; very fast repeats are thinned. */
    _sample(name, gain = 1, dir = 'sfx') {
        if (this.muted || this._vol.sfx <= 0) return false;
        const key = name.includes('/') ? name : dir + '/' + name;
        const now = performance.now();
        this._sfxLast = this._sfxLast || {}; this._sfxEls = this._sfxEls || {};
        if (now - (this._sfxLast[key] || 0) < 35) return true;
        this._sfxLast[key] = now;
        let a = this._sfxEls[key];
        if (!a) { a = new Audio('audio/' + key + '.wav?v=4'); a.preload = 'auto'; this._sfxEls[key] = a; }
        try { const c = a.cloneNode(true); c.volume = Math.max(0, Math.min(1, this._vol.sfx * gain)); c.play().catch(() => {}); } catch (e) { /* */ }
        return true;
    }

    // ---- punchy Smash-like SFX (short, sharp, filtered) ----
    _tone({ type = 'square', f0 = 220, f1 = null, dur = 0.1, vol = 0.22, filter = 2800 }) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t0);
        if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(filter, t0);
        filt.frequency.exponentialRampToValueAtTime(Math.max(200, filter * 0.4), t0 + dur);
        const v = vol * this._vol.sfx;
        gain.gain.setValueAtTime(v, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(filt); filt.connect(gain); gain.connect(this.dest());
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    _noise(dur = 0.08, vol = 0.15, filter = 2000) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const t0 = this.ctx.currentTime;
        const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / n * 5);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(filter, t0);
        filt.Q.setValueAtTime(0.8, t0);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * this._vol.sfx, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filt); filt.connect(gain); gain.connect(this.dest());
        src.start(t0); src.stop(t0 + dur);
    }

    playJump() {
        if (this._sample('jump', 0.85)) return;
        this._tone({ type: 'square', f0: 280, f1: 520, dur: 0.09, vol: 0.16, filter: 3200 });
        this._noise(0.04, 0.06, 2500);
    }
    playDash() {
        if (this._sample('dash', 0.9)) return;
        this._tone({ type: 'sawtooth', f0: 200, f1: 480, dur: 0.11, vol: 0.18, filter: 2200 });
        this._noise(0.07, 0.12, 1800);
    }
    playHit(heavy = false) {
        if (this._sample(heavy ? 'hit_heavy' : 'hit_light', heavy ? 1 : 0.9)) return;
        if (heavy) {
            this._tone({ type: 'square', f0: 140, f1: 55, dur: 0.2, vol: 0.32, filter: 1200 });
            this._noise(0.16, 0.22, 900);
            this._tone({ type: 'sine', f0: 80, f1: 40, dur: 0.25, vol: 0.2, filter: 600 });
        } else {
            this._tone({ type: 'square', f0: 260, f1: 110, dur: 0.09, vol: 0.22, filter: 2400 });
            this._noise(0.06, 0.14, 2000);
        }
    }
    playGrab() {
        if (this._sample('grab', 0.9)) return;
        this._tone({ type: 'square', f0: 320, f1: 160, dur: 0.12, vol: 0.18, filter: 2000 });
    }
    playThrow() {
        if (this._sample('throw', 0.9)) return;
        this._tone({ type: 'sawtooth', f0: 300, f1: 700, dur: 0.14, vol: 0.22, filter: 2800 });
        this._noise(0.08, 0.1, 2200);
    }
    playShield() {
        if (this._sample('shield', 0.8)) return;
        this._tone({ type: 'triangle', f0: 520, f1: 400, dur: 0.06, vol: 0.12, filter: 3000 });
    }
    playKO() {
        if (this._sample('ko', 1)) return;
        this._tone({ type: 'sawtooth', f0: 180, f1: 35, dur: 0.55, vol: 0.35, filter: 1000 });
        this._noise(0.4, 0.25, 700);
    }
}
