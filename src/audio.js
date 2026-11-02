// Smooth procedural SFX (Web Audio) + sampled BGM. Two volume buses: music & sfx (0–1, saved).
const VOL_KEY = 'cbg.vol';
const loadVol = () => {
    try {
        const v = JSON.parse(localStorage.getItem(VOL_KEY) || '{}');
        return {
            music: Math.max(0, Math.min(1, v.music != null ? +v.music : 0.55)),
            sfx: Math.max(0, Math.min(1, v.sfx != null ? +v.sfx : 0.85)),
        };
    } catch (e) { return { music: 0.55, sfx: 0.85 }; }
};
const saveVol = (v) => { try { localStorage.setItem(VOL_KEY, JSON.stringify(v)); } catch (e) { /* blocked */ } };

const BGM = {
    title: 'audio/bgm/01_title_start_screen.wav',
    duel: 'audio/bgm/02_duel_1v1.wav',
    frontier: 'audio/bgm/03_stage_frontier.wav',
    frontier_big: 'audio/bgm/04_stage_frontier_big.wav',
    horizon: 'audio/bgm/05_stage_horizon.wav',
    horizon_big: 'audio/bgm/06_stage_horizon_big.wav',
};

export class SoundEngine {
    constructor() {
        this._ctx = null;
        this.muted = false;
        this._vol = loadVol();
        this._sfxGain = null;
        this._music = null;
        this._musicKey = null;
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
    }

    dest() {
        if (!this._ctx) return null;
        return this._sfxGain || this._ctx.destination;
    }

    playMusic(key, { loop = true } = {}) {
        const src = BGM[key];
        if (!src) return;
        if (this._musicKey === key && this._music && !this._music.paused) return;
        this.stopMusic();
        this._musicKey = key;
        const a = new Audio(src);
        a.loop = loop;
        a.volume = this._vol.music;
        a.play().catch(() => {});
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
        const a = new Audio('audio/f/' + char + '_' + slot + '_' + name + '.wav');
        a.volume = this._vol.sfx * 0.9;
        a.play().catch(() => {});
    }

    /** soft tone through optional lowpass — avoids harsh square/saw “8-bit” hits */
    _tone({ type = 'sine', f0 = 220, f1 = null, dur = 0.15, vol = 0.2, filter = 1800, Q = 0.7 }) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t0);
        if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(filter, t0);
        filt.Q.setValueAtTime(Q, t0);
        const v = vol * this._vol.sfx;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, v), t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(filt); filt.connect(gain); gain.connect(this.dest());
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    }

    _noiseBurst(dur = 0.12, vol = 0.12, filter = 1200) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const t0 = this.ctx.currentTime;
        const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / n * 4);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(filter, t0);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * this._vol.sfx, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filt); filt.connect(gain); gain.connect(this.dest());
        src.start(t0); src.stop(t0 + dur);
    }

    playJump() {
        this._tone({ type: 'sine', f0: 240, f1: 520, dur: 0.11, vol: 0.12, filter: 2400 });
        this._noiseBurst(0.04, 0.04, 3000);
    }
    playDash() {
        this._tone({ type: 'triangle', f0: 180, f1: 420, dur: 0.14, vol: 0.14, filter: 1600 });
        this._noiseBurst(0.08, 0.08, 1400);
    }
    playHit(heavy = false) {
        if (heavy) {
            this._tone({ type: 'sine', f0: 120, f1: 45, dur: 0.28, vol: 0.28, filter: 800 });
            this._noiseBurst(0.18, 0.16, 900);
        } else {
            this._tone({ type: 'triangle', f0: 220, f1: 90, dur: 0.12, vol: 0.16, filter: 1400 });
            this._noiseBurst(0.08, 0.08, 1600);
        }
    }
    playGrab() {
        this._tone({ type: 'sine', f0: 360, f1: 140, dur: 0.22, vol: 0.18, filter: 1800 });
    }
    playThrow() {
        this._tone({ type: 'triangle', f0: 280, f1: 620, dur: 0.18, vol: 0.2, filter: 2200 });
        this._noiseBurst(0.1, 0.07, 2000);
    }
    playShield() {
        this._tone({ type: 'sine', f0: 480, f1: 360, dur: 0.07, vol: 0.09, filter: 2000 });
    }
    playKO() {
        this._tone({ type: 'sine', f0: 140, f1: 40, dur: 0.55, vol: 0.32, filter: 700 });
        this._noiseBurst(0.35, 0.18, 600);
    }
}
