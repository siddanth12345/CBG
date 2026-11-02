// Procedural SFX (Web Audio) + sampled BGM. Two volume buses: music & sfx (0–1, saved).
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
        this.muted = false;                       // menu showcase fights silently
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
        a.volume = this._vol.sfx;
        a.play().catch(() => {});
    }

    _beep(type, f0, f1, dur, vol) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, this.ctx.currentTime);
        if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), this.ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol * this._vol.sfx, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
        osc.connect(gain); gain.connect(this.dest());
        osc.start(); osc.stop(this.ctx.currentTime + dur);
    }

    playJump() { this._beep('sine', 180, 480, 0.12, 0.15); }
    playDash() { this._beep('sawtooth', 250, 850, 0.16, 0.2); }
    playHit(heavy = false) {
        if (!this.ctx || this._vol.sfx <= 0) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = heavy ? 'sawtooth' : 'square';
        const duration = heavy ? 0.35 : 0.15;
        osc.frequency.setValueAtTime(heavy ? 160 : 280, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(heavy ? 30 : 80, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime((heavy ? 0.35 : 0.2) * this._vol.sfx, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.dest());
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    }
    playGrab() { this._beep('triangle', 450, 120, 0.3, 0.3); }
    playThrow() { this._beep('sawtooth', 320, 980, 0.22, 0.35); }
    playShield() { this._beep('sine', 540, null, 0.08, 0.12); }
    playKO() { this._beep('sawtooth', 160, 25, 0.7, 0.45); }
}
