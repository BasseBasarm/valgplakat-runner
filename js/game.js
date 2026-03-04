// ============================================================
// VALGPLAKAT RUNNER – Kampen om Dronning Louises Bro
// Clean 2D side-view with parallax depth
// ============================================================

// ============== PARTY DATA ==============
const PARTIES = [
    { letter: 'A', name: 'Socialdemokratiet', bg: '#C60C30', text: '#FFFFFF' },
    { letter: 'F', name: 'Socialistisk Folkeparti', bg: '#2E8B57', text: '#FFFFFF' },
    { letter: 'I', name: 'Liberal Alliance', bg: '#1E4ED8', text: '#FFFFFF' },
    { letter: 'V', name: 'Venstre', bg: '#005DAA', text: '#FFFFFF' },
    { letter: 'O', name: 'Dansk Folkeparti', bg: '#F2C300', text: '#000000' },
    { letter: 'Ø', name: 'Enhedslisten', bg: '#B5121B', text: '#FFFFFF' },
    { letter: 'C', name: 'Det Konservative Folkeparti', bg: '#004B2D', text: '#FFFFFF' },
    { letter: 'Æ', name: 'Danmarksdemokraterne', bg: '#6A2C91', text: '#FFFFFF' },
    { letter: 'M', name: 'Moderaterne', bg: '#F36F21', text: '#FFFFFF' },
    { letter: 'B', name: 'Radikale Venstre', bg: '#C3007A', text: '#FFFFFF' },
    { letter: 'Å', name: 'Alternativet', bg: '#00A651', text: '#FFFFFF' },
    { letter: 'H', name: 'Borgernes Parti', bg: '#6B1E1E', text: '#FFFFFF' },
];

// ============== NPC DIALOGUE ==============
const NPC_SHOUTS_RUNNING = [
    'Den pæl er min!', 'Skynd dig!', 'Jeg tager toppen!',
    'Du blokerer!', 'Vi mangler én her!', 'Kom nu!',
    'Ud af vejen!', 'Hurtigere!', 'Dér er en ledig!',
    'Flyt dig lige!', 'Du er for langsom!', 'Toppladsen, tak!',
    'Ikke den dér!', 'Kom nuuu!', 'Det her er vores område!',
    'Jeg så den pæl først!', 'Ha! For sent!', 'Næste pæl er min!',
];
const NPC_SHOUTS_PLACING = ['Sådan!', 'Op med den!', 'Yes!', 'Perfekt!', 'Så sidder den!', 'Bingo!', 'Den hænger!'];
const NPC_SHOUTS_CLIMBING = ['Op, op, op!', 'Højere!', 'Næsten deroppe!', 'Hold godt fast!'];
const NPC_SHOUTS_PASSING = ['Haha, for langsom!', 'Ses deroppe!', 'Undskyld, jeg skal forbi!', 'Farvel!'];
const NPC_SHOUTS_PLAYER_FALL = ['Av!', 'Pas på!', 'Du skal holde bedre fast!', 'Hovsa!', 'Det så smerteligt ud!'];

// ============== SCORING ==============
const SLOT_POINTS = [1, 2, 3, 5];
const SLOT_TIME_BONUS = [0, 0, 0, 0]; // No time bonus — fixed countdown
const SLOT_NAMES = ['Nederst', 'Midt', 'Øverst', 'Top'];
const DOMINANCE_BONUS = 5;

// ============== GAME CONSTANTS ==============
const NUM_LAMP_POSTS = 14;
const SLOTS_PER_POST = 4;
const GAME_DURATION = 60;
const NUM_NPCS = 5;
const BRIDGE_LENGTH = 3200;  // world pixels, horizontal
const FALL_STUN_TIME = 2.5;
const CLIMB_SPEED = 55;
const PLAYER_RUN_SPEED = 220;
const NPC_RUN_SPEED_MIN = 114;   // +20% from 95
const NPC_RUN_SPEED_MAX = 168;   // +20% from 140
const POSTER_HANG_TIME = 0.8;
const FALL_CHANCE_BASE = 0.002;
const FALL_CHANCE_HEIGHT_MULT = 0.0015;

// ============== LAYOUT CONSTANTS ==============
// Y positions in screen space (from top). These define the scene layers.
const BRIDGE_Y = 0.62;       // bridge deck as fraction of canvas height
const POLE_HEIGHT = 210;     // pixel height of lamp posts
const CHAR_HEIGHT = 36;      // character pixel height

// ============== GAME STATE ==============
const GameState = { MENU: 'menu', COUNTDOWN: 'countdown', PLAYING: 'playing', DISQUALIFIED: 'disqualified', RESULTS: 'results' };

// ============== GLOBALS ==============
let canvas, ctx;
// Logical (CSS pixel) dimensions — updated on resize
let logicalWidth = 0, logicalHeight = 0;
let gameState = GameState.MENU;
let selectedPartyIndex = -1;
let gameTime = GAME_DURATION;
let lastTimestamp = 0;
let cameraX = 0;
let player = null;
let npcs = [];
let lampPosts = [];
let speechBubbles = [];
let particles = [];
let backgroundEntities = [];
let birds = [];
let keys = {};
let timeBonus = 0;
let timeBonusFlash = 0;
let shownClimbHint = false;
let climbHintTimer = 0;
let removeWarningActive = false;
let removeWarningTimer = 0;

// ============== SPICE EVENTS ==============
const SPICE_EVENTS = [
    { id: 'tourist', text: 'Turist i vejen.', duration: 5, icon: '📷' },
    { id: 'wind', text: 'Vindstød!', duration: 4, icon: '💨' },
    { id: 'zipties', text: 'Stripsene driller.', duration: 6, icon: '🔧' },
    { id: 'paperjam', text: 'Plakaten krøller.', duration: 3, icon: '📄' },
    { id: 'police', text: 'Kommunen kigger forbi.', duration: 5, icon: '👷' },
    { id: 'ufo', text: 'UFO stjæler en plakat!', duration: 4, icon: '🛸' },
];
let activeEvent = null;         // { id, text, icon, timer, duration, postIndex?, slotIndex?, ufoPhase?, ufoX?, ufoY?, stolenParty? }
let eventCooldown = 0;          // seconds until next event can trigger
let eventsThisRun = 0;          // exactly 2 per run
let nextEventTime = 0;          // scheduled time for next event
let scheduledEventTimes = [];   // pre-scheduled times for guaranteed 2 events

// Pre-generated scenery
let skylineNorrebro = [];
let skylineIndreby = [];
let bridgePiers = [];

// ============== AUDIO ==============
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function playTone(freq, dur, type = 'square', vol = 0.15) {
    try { const ac = getAudioCtx(), o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur); } catch(e){}
}
function playPlaceSound() { playTone(600, 0.15, 'square', 0.12); setTimeout(() => playTone(800, 0.1, 'square', 0.08), 50); }
function playFallSound() { playTone(200, 0.4, 'sawtooth', 0.15); }
function playClimbSound() { playTone(400 + Math.random() * 100, 0.08, 'triangle', 0.06); }
function playCountdownBeep() { playTone(440, 0.2, 'sine', 0.2); }
function playStartHorn() { playTone(523, 0.5, 'sawtooth', 0.2); setTimeout(() => playTone(659, 0.5, 'sawtooth', 0.2), 100); }
function playDisqualifyBuzz() { playTone(100, 1.0, 'sawtooth', 0.3); }
function playVictoryChime() { playTone(523, 0.2, 'sine', 0.15); setTimeout(() => playTone(659, 0.2, 'sine', 0.15), 150); setTimeout(() => playTone(784, 0.3, 'sine', 0.15), 300); }
function playBicycleBell() { playTone(1200, 0.08, 'sine', 0.04); setTimeout(() => playTone(1500, 0.06, 'sine', 0.03), 80); }
function playDistantSiren() {
    const ac = getAudioCtx(), o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(600, ac.currentTime);
    o.frequency.linearRampToValueAtTime(800, ac.currentTime + 0.8);
    o.frequency.linearRampToValueAtTime(600, ac.currentTime + 1.6);
    g.gain.setValueAtTime(0.012, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.0);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 2.0);
}
function playBassThump() {
    const ac = getAudioCtx(), o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 55 + Math.random() * 15;
    g.gain.setValueAtTime(0.04, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.3);
}
function playFootsteps() {
    // Soft click-like footstep burst
    for (let i = 0; i < 3; i++) {
        setTimeout(() => playTone(180 + Math.random() * 60, 0.04, 'triangle', 0.015), i * 120 + Math.random() * 40);
    }
}
function playLaughter() {
    // Quick chirpy tones to suggest distant laughter
    const ac = getAudioCtx();
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = 'sine'; o.frequency.value = 350 + Math.random() * 200;
            g.gain.setValueAtTime(0.01, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
            o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.08);
        }, i * 70 + Math.random() * 30);
    }
}

// ============== AMBIENT SOUND ENGINE ==============
let ambientNodes = null;
let bgMusicNodes = null;
let ambientTimers = { bell: 0, siren: 0, thump: 0, footsteps: 0, laughter: 0 };

function startAmbientSound() {
    if (ambientNodes) return;
    const ac = getAudioCtx();
    const master = ac.createGain();
    master.gain.value = 0.08;
    master.connect(ac.destination);

    // === Warm tonal drone — soft chords, not noise ===
    const droneG = ac.createGain(); droneG.gain.value = 0.25;
    const droneFilt = ac.createBiquadFilter();
    droneFilt.type = 'lowpass'; droneFilt.frequency.value = 400; droneFilt.Q.value = 0.3;
    droneG.connect(droneFilt); droneFilt.connect(master);

    // Two detuned sine oscillators for a warm hum (C2 + G2)
    const droneOscs = [];
    const droneFreqs = [65.41, 98.00, 130.81]; // C2, G2, C3
    for (const freq of droneFreqs) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8;
        osc.connect(droneG);
        osc.start();
        droneOscs.push(osc);
    }

    // Slow LFO on drone filter for breathing effect
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.08; lfo.type = 'sine';
    const lfoG = ac.createGain(); lfoG.gain.value = 80;
    lfo.connect(lfoG); lfoG.connect(droneFilt.frequency);
    lfo.start();

    // === Subtle city hum — very low, barely there ===
    const humOsc = ac.createOscillator();
    humOsc.type = 'sine'; humOsc.frequency.value = 50;
    const humG = ac.createGain(); humG.gain.value = 0.06;
    humOsc.connect(humG); humG.connect(master);
    humOsc.start();

    ambientNodes = { master, droneOscs, lfo, humOsc, droneFilt };
}

function stopAmbientSound() {
    if (!ambientNodes) return;
    try {
        ambientNodes.droneOscs.forEach(o => o.stop());
        ambientNodes.lfo.stop();
        ambientNodes.humOsc.stop();
    } catch(e){}
    ambientNodes = null;
}

function updateAmbientTimers(dt) {
    ambientTimers.bell -= dt;
    ambientTimers.siren -= dt;
    ambientTimers.thump -= dt;
    ambientTimers.footsteps -= dt;
    ambientTimers.laughter -= dt;
    if (ambientTimers.bell <= 0) { ambientTimers.bell = 4 + Math.random() * 10; playBicycleBell(); }
    if (ambientTimers.siren <= 0) { ambientTimers.siren = 30 + Math.random() * 60; playDistantSiren(); }
    if (ambientTimers.thump <= 0) { ambientTimers.thump = 12 + Math.random() * 25; playBassThump(); }
    if (ambientTimers.footsteps <= 0) { ambientTimers.footsteps = 3 + Math.random() * 6; playFootsteps(); }
    if (ambientTimers.laughter <= 0) { ambientTimers.laughter = 8 + Math.random() * 18; playLaughter(); }
}

// ============== BACKGROUND MUSIC ==============
function startBgMusic() {
    if (bgMusicNodes) return;
    const ac = getAudioCtx();
    const master = ac.createGain();
    master.gain.value = 0.10;
    master.connect(ac.destination);

    // === Transportabelt musikanlæg — tung bass og rytme ===

    // Speaker character: slight resonance like a portable PA/boombox
    const speakerFilt = ac.createBiquadFilter();
    speakerFilt.type = 'peaking'; speakerFilt.frequency.value = 2000; speakerFilt.Q.value = 0.8; speakerFilt.gain.value = 3;
    speakerFilt.connect(master);

    // Sub-bass boost (the rumble you feel from a musikanlæg)
    const subBoost = ac.createBiquadFilter();
    subBoost.type = 'peaking'; subBoost.frequency.value = 70; subBoost.Q.value = 1.0; subBoost.gain.value = 9;
    subBoost.connect(speakerFilt);

    const bpm = 124;
    const beatTime = 60 / bpm;

    // === HEAVY KICK DRUM (sub-bass punch) ===
    const kickBuf = ac.createBuffer(1, ac.sampleRate * 0.25, ac.sampleRate);
    const kd = kickBuf.getChannelData(0);
    for (let i = 0; i < kd.length; i++) {
        const t = i / ac.sampleRate;
        // Deep sub kick with pitch drop
        kd[i] = Math.sin(t * Math.PI * 2 * (180 - t * 500)) * Math.exp(-t * 12) * 0.9
               + Math.sin(t * Math.PI * 2 * 55) * Math.exp(-t * 8) * 0.5; // sub layer
    }

    // === PUNCHY SNARE (crack + body) ===
    const snareBuf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
    const sd = snareBuf.getChannelData(0);
    for (let i = 0; i < sd.length; i++) {
        const t = i / ac.sampleRate;
        sd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.5  // noise body
              + Math.sin(t * Math.PI * 2 * 200) * Math.exp(-t * 40) * 0.35; // tonal crack
    }

    // === CRISP HIHAT ===
    const hhBuf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
    const hd = hhBuf.getChannelData(0);
    for (let i = 0; i < hd.length; i++) {
        const t = i / ac.sampleRate;
        hd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.2;
    }

    // === OPEN HIHAT ===
    const ohBuf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
    const ohd = ohBuf.getChannelData(0);
    for (let i = 0; i < ohd.length; i++) {
        const t = i / ac.sampleRate;
        ohd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 0.12;
    }

    // === BASS SYNTH (bouncy, syncopated) ===
    const bassG = ac.createGain(); bassG.gain.value = 0.55;
    const bassFilt = ac.createBiquadFilter(); bassFilt.type = 'lowpass'; bassFilt.frequency.value = 450; bassFilt.Q.value = 3;
    bassG.connect(bassFilt); bassFilt.connect(subBoost);

    // Bass pattern: syncopated 8th notes per bar (C-G-Am-F progression)
    // Each sub-array is 8 eighth-note slots per bar (0=rest)
    const bassPatterns = [
        [130.81, 0, 130.81, 130.81, 0, 130.81, 0, 130.81], // C
        [196.00, 0, 196.00, 196.00, 0, 196.00, 0, 196.00], // G
        [110.00, 0, 110.00, 110.00, 0, 110.00, 0, 110.00], // Am
        [174.61, 0, 174.61, 174.61, 0, 174.61, 0, 174.61], // F
    ];

    // === CHORD STABS (short punchy, not droning) ===
    const chordNotes = [
        [261.63, 329.63, 392.00], // C
        [196.00, 246.94, 293.66], // G (low voicing)
        [220.00, 261.63, 329.63], // Am
        [174.61, 220.00, 261.63], // F
    ];

    // Schedule everything
    const startTime = ac.currentTime + 0.1;
    const totalBeats = Math.ceil(GAME_DURATION / beatTime) + 16;

    for (let beat = 0; beat < totalBeats; beat++) {
        const t = startTime + beat * beatTime;
        const bar = Math.floor(beat / 4);
        const beatInBar = beat % 4;

        // --- KICK: four-on-the-floor (every beat) ---
        const kickSrc = ac.createBufferSource(); kickSrc.buffer = kickBuf;
        const kg = ac.createGain(); kg.gain.value = 0.45;
        kickSrc.connect(kg); kg.connect(subBoost);
        kickSrc.start(t);

        // --- SNARE: beats 2 and 4 ---
        if (beatInBar === 1 || beatInBar === 3) {
            const snareSrc = ac.createBufferSource(); snareSrc.buffer = snareBuf;
            const sg = ac.createGain(); sg.gain.value = 0.25;
            snareSrc.connect(sg); sg.connect(speakerFilt);
            snareSrc.start(t);
        }

        // --- HIHAT: every 8th note ---
        for (let eighth = 0; eighth < 2; eighth++) {
            const ht = t + eighth * beatTime * 0.5;
            const isOffbeat = eighth === 1;
            // Open hihat on offbeat of beat 2 and 4
            if (isOffbeat && (beatInBar === 1 || beatInBar === 3)) {
                const ohSrc = ac.createBufferSource(); ohSrc.buffer = ohBuf;
                const og = ac.createGain(); og.gain.value = 0.12;
                ohSrc.connect(og); og.connect(speakerFilt);
                ohSrc.start(ht);
            } else {
                const hhSrc = ac.createBufferSource(); hhSrc.buffer = hhBuf;
                const hg = ac.createGain(); hg.gain.value = isOffbeat ? 0.08 : 0.14;
                hhSrc.connect(hg); hg.connect(speakerFilt);
                hhSrc.start(ht);
            }
        }

        // --- BASS: syncopated pattern (8th notes) ---
        const bassLine = bassPatterns[bar % 4];
        for (let eighth = 0; eighth < 2; eighth++) {
            const slot = beatInBar * 2 + eighth;
            const freq = bassLine[slot];
            if (freq > 0) {
                const bt = t + eighth * beatTime * 0.5;
                const bassOsc = ac.createOscillator();
                bassOsc.type = 'sawtooth';
                bassOsc.frequency.value = freq;
                const bg = ac.createGain();
                bg.gain.setValueAtTime(0.35, bt);
                bg.gain.exponentialRampToValueAtTime(0.001, bt + beatTime * 0.45);
                bassOsc.connect(bg); bg.connect(bassG);
                bassOsc.start(bt); bassOsc.stop(bt + beatTime * 0.5);
            }
        }

        // --- CHORD STABS: short stabs on beat 1 and the "and" of beat 2 ---
        if (beatInBar === 0 || (beatInBar === 1)) {
            const stabTime = beatInBar === 0 ? t : t + beatTime * 0.5; // "and" of 2
            const chord = chordNotes[bar % 4];
            for (let v = 0; v < 3; v++) {
                const osc = ac.createOscillator();
                osc.type = v === 0 ? 'square' : 'sawtooth';
                osc.frequency.value = chord[v] * 2; // octave up for brightness
                osc.detune.value = [-6, 10, -4][v];
                const cg = ac.createGain();
                cg.gain.setValueAtTime(0.06, stabTime);
                cg.gain.exponentialRampToValueAtTime(0.001, stabTime + 0.12);
                osc.connect(cg); cg.connect(speakerFilt);
                osc.start(stabTime); osc.stop(stabTime + 0.15);
            }
        }
    }

    bgMusicNodes = { master, speakerFilt, subBoost, bassFilt, scheduleStart: ac.currentTime };
}

function updateBgMusic() {
    if (!bgMusicNodes) return;
    // Build energy as timer runs down — speaker opens up, bass gets heavier
    const tension = 1 - (gameTime / GAME_DURATION);
    bgMusicNodes.speakerFilt.frequency.value = 2000 + tension * 1500;
    bgMusicNodes.subBoost.gain.value = 9 + tension * 5;
    bgMusicNodes.master.gain.value = 0.10 + tension * 0.06;
}

function stopBgMusic() {
    if (!bgMusicNodes) return;
    try {
        bgMusicNodes.master.gain.linearRampToValueAtTime(0, getAudioCtx().currentTime + 0.3);
    } catch(e) {}
    setTimeout(() => { bgMusicNodes = null; }, 400);
}

// ============== 2D COORDINATE HELPERS ==============
// World X → screen X (with camera)
function wx(worldX) {
    return worldX - cameraX + logicalWidth / 2;
}
// Bridge deck screen Y
function bridgeY() {
    return logicalHeight * BRIDGE_Y;
}
// Screen position for a character or object on the bridge
function worldToScreen(worldX, heightAboveBridge = 0) {
    return { x: wx(worldX), y: bridgeY() - heightAboveBridge };
}

// ============== LAMP POST ==============
class LampPost {
    constructor(index, worldX) {
        this.index = index;
        this.worldX = worldX;
        this.slots = [null, null, null, null];
        this.slotHeights = [50, 95, 140, 185]; // pixels above bridge
        this.poleHeight = POLE_HEIGHT;
    }
    isEmpty(i) { return this.slots[i] === null; }
    getLowestEmpty() { for (let i = 0; i < 4; i++) if (this.slots[i] === null) return i; return -1; }
    getHighestEmpty() { for (let i = 3; i >= 0; i--) if (this.slots[i] === null) return i; return -1; }
    hasEmptySlot() { return this.slots.some(s => s === null); }
    countParty(pi) { return this.slots.filter(s => s === pi).length; }
    isDominated() { if (this.slots.some(s => s === null)) return false; const f = this.slots[0]; return this.slots.every(s => s === f) ? f : false; }

    draw() {
        const sx = wx(this.worldX);
        const by = bridgeY();
        const topY = by - this.poleHeight;

        // Pole shadow on bridge
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(sx + 4, by + 2, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // --- Ornate pole ---
        // Base pedestal
        const baseGrad = ctx.createLinearGradient(sx - 8, by - 24, sx + 8, by);
        baseGrad.addColorStop(0, '#A07830');
        baseGrad.addColorStop(0.5, '#C09840');
        baseGrad.addColorStop(1, '#705020');
        ctx.fillStyle = baseGrad;
        // Wide base
        ctx.fillRect(sx - 10, by - 8, 20, 8);
        // Tapered lower section
        ctx.beginPath();
        ctx.moveTo(sx - 8, by - 8);
        ctx.lineTo(sx - 5, by - 24);
        ctx.lineTo(sx + 5, by - 24);
        ctx.lineTo(sx + 8, by - 8);
        ctx.closePath();
        ctx.fill();
        // Decorative bulge
        ctx.beginPath();
        ctx.ellipse(sx, by - 24, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main shaft
        const shaftGrad = ctx.createLinearGradient(sx - 3, 0, sx + 3, 0);
        shaftGrad.addColorStop(0, '#8A6A28');
        shaftGrad.addColorStop(0.4, '#C09840');
        shaftGrad.addColorStop(1, '#6A4A18');
        ctx.fillStyle = shaftGrad;
        ctx.fillRect(sx - 3, topY + 30, 6, by - 24 - (topY + 30));

        // Mid decorative ring
        const midY = by - this.poleHeight * 0.45;
        ctx.fillStyle = '#B08830';
        ctx.beginPath();
        ctx.ellipse(sx, midY, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Globe lantern bracket
        ctx.strokeStyle = '#5A4010';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 1, topY + 30);
        ctx.quadraticCurveTo(sx - 10, topY + 15, sx, topY + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + 1, topY + 30);
        ctx.quadraticCurveTo(sx + 10, topY + 15, sx, topY + 8);
        ctx.stroke();

        // Globe
        ctx.fillStyle = 'rgba(210,230,210,0.45)';
        ctx.beginPath();
        ctx.arc(sx, topY + 2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5A6050';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Cage lines
        ctx.beginPath(); ctx.moveTo(sx, topY - 8); ctx.lineTo(sx, topY + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 10, topY + 2); ctx.lineTo(sx + 10, topY + 2); ctx.stroke();

        // Warm glow — multi-layer bloom
        const glow1 = ctx.createRadialGradient(sx, topY + 2, 0, sx, topY + 2, 50);
        glow1.addColorStop(0, 'rgba(255,220,140,0.2)');
        glow1.addColorStop(0.3, 'rgba(255,200,100,0.1)');
        glow1.addColorStop(0.7, 'rgba(255,180,80,0.03)');
        glow1.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = glow1;
        ctx.beginPath();
        ctx.arc(sx, topY + 2, 50, 0, Math.PI * 2);
        ctx.fill();
        // Inner bright glow
        ctx.fillStyle = 'rgba(255,240,200,0.15)';
        ctx.beginPath();
        ctx.arc(sx, topY + 2, 14, 0, Math.PI * 2);
        ctx.fill();
        // Light cone downward
        ctx.fillStyle = 'rgba(255,220,140,0.04)';
        ctx.beginPath();
        ctx.moveTo(sx - 20, topY + 12);
        ctx.lineTo(sx + 20, topY + 12);
        ctx.lineTo(sx + 35, by);
        ctx.lineTo(sx - 35, by);
        ctx.closePath();
        ctx.fill();

        // Finial
        ctx.fillStyle = '#5A4010';
        ctx.beginPath();
        ctx.arc(sx, topY - 10, 3, 0, Math.PI * 2);
        ctx.fill();

        // --- Posters ---
        for (let i = 0; i < 4; i++) {
            const py = by - this.slotHeights[i];
            const pw = 26, ph = 34;
            if (this.slots[i] !== null) {
                const party = PARTIES[this.slots[i]];
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.fillRect(sx + 8 + 2, py - ph/2 + 2, pw, ph);
                // Poster body
                ctx.fillStyle = party.bg;
                ctx.fillRect(sx + 8, py - ph/2, pw, ph);
                // Border
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx + 8, py - ph/2, pw, ph);
                // Inner white line
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.strokeRect(sx + 10, py - ph/2 + 2, pw - 4, ph - 4);
                // Cable tie marks (small lines connecting to pole)
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(sx + 3, py - 6); ctx.lineTo(sx + 8, py - 6); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(sx + 3, py + 6); ctx.lineTo(sx + 8, py + 6); ctx.stroke();
                // Letter
                ctx.fillStyle = party.text;
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(party.letter, sx + 8 + pw/2, py);
            } else {
                // Empty slot hint
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(sx + 8, py - ph/2, pw, ph);
                ctx.setLineDash([]);
            }
        }
    }
}

// ============== APPEARANCE POOL (50/50 gender, ethnic diversity) ==============
const SKIN_TONES = [
    '#FFD5B4', // light Scandinavian
    '#F5C6A0', // light warm
    '#E8B88A', // medium light
    '#C68E5B', // medium (Turkish/Middle Eastern)
    '#A0724A', // medium-dark (Arab)
    '#6B4226', // dark (African)
];
const HAIR_COLORS_MALE = ['#5D4037','#3E2723','#212121','#8D6E63','#FDD835','#D7CCC8']; // brown, dark, black, auburn, blond, grey
const HAIR_COLORS_FEMALE = ['#5D4037','#3E2723','#8D6E63','#FDD835','#B71C1C','#212121']; // brown, dark, auburn, blond, red, black

function randomAppearance() {
    const female = Math.random() < 0.5;
    const skinIdx = Math.random();
    let skin;
    // Weighted: ~55% light Scandinavian tones, ~25% medium, ~20% darker
    if (skinIdx < 0.30) skin = SKIN_TONES[0];
    else if (skinIdx < 0.55) skin = SKIN_TONES[1];
    else if (skinIdx < 0.70) skin = SKIN_TONES[2];
    else if (skinIdx < 0.82) skin = SKIN_TONES[3];
    else if (skinIdx < 0.92) skin = SKIN_TONES[4];
    else skin = SKIN_TONES[5];
    const hairPool = female ? HAIR_COLORS_FEMALE : HAIR_COLORS_MALE;
    const hair = hairPool[Math.floor(Math.random() * hairPool.length)];
    return { female, skin, hair };
}

// ============== CHARACTER BASE ==============
class Character {
    constructor(partyIndex) {
        this.partyIndex = partyIndex;
        this.worldX = 200;
        this.worldZ = 0; // height above bridge
        this.state = 'idle';
        this.currentPost = null;
        this.currentSlot = -1;
        this.climbProgress = 0;
        this.hangTimer = 0;
        this.stunTimer = 0;
        this.facingRight = true;
        this.animTimer = 0;
        this.speed = PLAYER_RUN_SPEED;
        this.score = 0;
        this.postersPlaced = 0;
        // Appearance
        const app = randomAppearance();
        this.female = app.female;
        this.skinColor = app.skin;
        this.hairColor = app.hair;
    }
    getParty() { return PARTIES[this.partyIndex]; }

    update(dt) {
        this.animTimer += dt;
        this.updateFalling(dt);
        if (this.state === 'stunned') {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) { this.state = 'idle'; this.worldZ = 0; this.currentPost = null; this.currentSlot = -1; }
        }
    }

    draw() {
        const pos = worldToScreen(this.worldX, this.worldZ);
        const party = this.getParty();
        const stunned = this.state === 'stunned';
        const falling = this.state === 'falling';
        const climbing = this.state === 'climbing' || this.state === 'hanging';
        const running = this.state === 'running';

        ctx.save();
        if (stunned) ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
        if (falling) ctx.globalAlpha = 0.8;

        const t = this.animTimer * 40;

        // Soft shadow with gradient
        if (this.worldZ === 0) {
            const shadowGrad = ctx.createRadialGradient(pos.x, bridgeY() + 2, 0, pos.x, bridgeY() + 2, 12);
            shadowGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
            shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.10)');
            shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = shadowGrad;
            ctx.beginPath();
            ctx.ellipse(pos.x + 2, bridgeY() + 2, 12, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.worldZ > 0) {
            // Shadow on ground gets smaller/fainter with height
            const sf = 1 - Math.min(this.worldZ / 200, 0.7);
            ctx.fillStyle = `rgba(0,0,0,${0.08 * sf})`;
            ctx.beginPath();
            ctx.ellipse(pos.x + 2, bridgeY() + 2, 6 * sf, 2 * sf, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Legs
        const legKick = running ? Math.sin(t) * 4 : 0;
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(pos.x - 4, pos.y - 4 + legKick, 3, 8);
        ctx.fillRect(pos.x + 1, pos.y - 4 - legKick, 3, 8);

        // Shoes
        ctx.fillStyle = '#111';
        ctx.fillRect(pos.x - 5, pos.y + 3 + legKick, 4, 3);
        ctx.fillRect(pos.x + 1, pos.y + 3 - legKick, 4, 3);

        // Torso
        ctx.fillStyle = party.bg;
        roundRect(ctx, pos.x - 7, pos.y - 18, 14, 16, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(pos.x - 5, pos.y - 17, 4, 13);

        // Arms
        ctx.fillStyle = party.bg;
        if (falling) {
            // Flailing arms — waving wildly
            const flail = Math.sin(Date.now() * 0.02) * 8;
            ctx.save();
            ctx.translate(pos.x - 9, pos.y - 18);
            ctx.rotate((-0.5 + flail * 0.08));
            ctx.fillRect(0, 0, 3, 12);
            ctx.restore();
            ctx.save();
            ctx.translate(pos.x + 9, pos.y - 18);
            ctx.rotate((0.5 - flail * 0.08));
            ctx.fillRect(-3, 0, 3, 12);
            ctx.restore();
        } else if (climbing) {
            ctx.fillRect(pos.x - 10, pos.y - 26, 3, 12);
            ctx.fillRect(pos.x + 7, pos.y - 26, 3, 12);
            ctx.fillStyle = this.skinColor;
            ctx.fillRect(pos.x - 10, pos.y - 27, 3, 3);
            ctx.fillRect(pos.x + 7, pos.y - 27, 3, 3);
        } else if (running) {
            const sw = Math.sin(t) * 5;
            ctx.fillRect(pos.x - 11, pos.y - 16 + sw, 3, 10);
            ctx.fillRect(pos.x + 8, pos.y - 16 - sw, 3, 10);
        } else {
            ctx.fillRect(pos.x - 11, pos.y - 16, 3, 10);
            ctx.fillRect(pos.x + 8, pos.y - 16, 3, 10);
        }

        // Party letter on torso
        ctx.fillStyle = party.text;
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(party.letter, pos.x, pos.y - 11);

        // Head
        ctx.fillStyle = this.skinColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 24, 6, 0, Math.PI * 2);
        ctx.fill();
        // Hair
        ctx.fillStyle = this.hairColor;
        if (this.female) {
            // Longer hair for women — full top + sides
            ctx.beginPath();
            ctx.arc(pos.x, pos.y - 26, 6.5, Math.PI * 0.85, Math.PI * 2.15);
            ctx.fill();
            // Side hair strands
            ctx.fillRect(pos.x - 7, pos.y - 26, 2.5, 10);
            ctx.fillRect(pos.x + 4.5, pos.y - 26, 2.5, 10);
        } else {
            // Short hair for men — just top
            ctx.beginPath();
            ctx.arc(pos.x, pos.y - 26, 6, Math.PI, Math.PI * 2);
            ctx.fill();
        }
        // Eyes
        ctx.fillStyle = '#333';
        const ed = this.facingRight ? 1 : -1;
        ctx.fillRect(pos.x - 2 + ed, pos.y - 25, 1.5, 1.5);
        ctx.fillRect(pos.x + 2 + ed, pos.y - 25, 1.5, 1.5);

        // Player marker
        if (this === player) {
            const a = 0.6 + Math.sin(Date.now() * 0.004) * 0.3;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - 38);
            ctx.lineTo(pos.x - 5, pos.y - 44);
            ctx.lineTo(pos.x + 5, pos.y - 44);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = stunned ? 0.5 : 1;
        }

        // Stun stars
        if (stunned) {
            ctx.fillStyle = '#FFE066';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            for (let i = 0; i < 3; i++) {
                const ang = Date.now() * 0.003 + i * Math.PI * 2 / 3;
                ctx.fillText('★', pos.x + Math.cos(ang) * 12, pos.y - 32 + Math.sin(ang) * 6);
            }
        }
        ctx.restore();
    }

    startClimbing(post) {
        this.currentPost = post;
        this.state = 'climbing';
        this.worldX = post.worldX;
        this.climbProgress = 0;
        this.currentSlot = -1;
    }

    fall() {
        this.fallFromZ = this.worldZ; // remember height for fall animation
        this.fallAnimTimer = 0.4;     // fall animation duration
        this.state = 'falling';
        this.currentPost = null;
        this.currentSlot = -1;
        playFallSound();
    }

    updateFalling(dt) {
        if (this.state !== 'falling') return;
        this.fallAnimTimer -= dt;
        const prog = 1 - Math.max(0, this.fallAnimTimer) / 0.4;
        this.worldZ = this.fallFromZ * (1 - prog * prog); // accelerating fall
        if (this.fallAnimTimer <= 0) {
            this.worldZ = 0;
            this.state = 'stunned';
            this.stunTimer = FALL_STUN_TIME;
            const pos = worldToScreen(this.worldX, 0);
            for (let i = 0; i < 8; i++) {
                particles.push({ x: pos.x, y: pos.y, vx: (Math.random()-0.5)*80, vy: -Math.random()*60, life: 0.6, color: '#FFE066', size: 2+Math.random()*2 });
            }
        }
    }

    placePoster(slotIndex) {
        if (this.currentPost && this.currentPost.isEmpty(slotIndex)) {
            this.currentPost.slots[slotIndex] = this.partyIndex;
            this.score += SLOT_POINTS[slotIndex];
            this.postersPlaced++;
            const dom = this.currentPost.isDominated();
            if (dom !== false && dom === this.partyIndex) this.score += DOMINANCE_BONUS;
            // No time bonus — fixed countdown
            playPlaceSound();
            return true;
        }
        return false;
    }
}

// ============== PLAYER ==============
class Player extends Character {
    constructor(partyIndex) {
        super(partyIndex);
        this.worldX = 300;
    }

    update(dt) {
        super.update(dt);
        if (this.state === 'stunned' || this.state === 'falling') return;

        if (this.state === 'idle' || this.state === 'running') {
            let moving = false;
            if (keys['ArrowLeft'] || keys['a'] || keys['A']) { this.worldX -= this.speed * dt; this.facingRight = false; moving = true; }
            if (keys['ArrowRight'] || keys['d'] || keys['D']) { this.worldX += this.speed * dt; this.facingRight = true; moving = true; }
            this.worldX = Math.max(40, Math.min(BRIDGE_LENGTH - 40, this.worldX));
            this.state = moving ? 'running' : 'idle';

            if (keys['ArrowUp'] || keys['w'] || keys['W']) {
                const p = this.findNearPost();
                if (p && p.hasEmptySlot()) {
                    const pIdx = lampPosts.indexOf(p);
                    if (isPostBlockedByTourist(pIdx)) {
                        // Tourist blocks — can't climb this post right now
                    } else {
                        this.startClimbing(p);
                        if (!shownClimbHint) { shownClimbHint = true; climbHintTimer = 4.0; }
                    }
                }
            }
        } else if (this.state === 'climbing') {
            if (climbHintTimer > 0) climbHintTimer -= dt;
            if (keys['ArrowUp'] || keys['w'] || keys['W']) {
                this.climbProgress += CLIMB_SPEED * dt;
                if (Math.random() < 0.5) playClimbSound();
                const hf = this.climbProgress / 200;
                if (Math.random() < (FALL_CHANCE_BASE + FALL_CHANCE_HEIGHT_MULT * hf + getEventFallChanceBonus())) {
                    this.fall();
                    addSpeechBubble(this.worldX, 'Av!', 1.5);
                    npcs.forEach(n => { if (Math.random() < 0.3) addSpeechBubble(n.worldX, NPC_SHOUTS_PLAYER_FALL[Math.floor(Math.random()*NPC_SHOUTS_PLAYER_FALL.length)], 2); });
                    return;
                }
                // Snap to slots when climbing UP (only snap to slots at or above current pos)
                for (let i = 0; i < 4; i++) {
                    const sh = this.currentPost.slotHeights[i];
                    if (sh >= this.climbProgress - 2 && Math.abs(this.climbProgress - sh) < 6 && this.currentSlot !== i) {
                        this.currentSlot = i;
                        this.climbProgress = sh;
                        break;
                    }
                }
                if (this.climbProgress >= this.currentPost.slotHeights[3]) { this.climbProgress = this.currentPost.slotHeights[3]; this.currentSlot = 3; }
            }
            // Safe descent with ↓ — always possible, never blocked
            if (keys['ArrowDown'] || keys['s'] || keys['S']) {
                const prevHeight = this.climbProgress;
                this.climbProgress -= CLIMB_SPEED * dt;
                if (this.climbProgress <= 0) { this.climbProgress = 0; this.state = 'idle'; this.worldZ = 0; this.currentPost = null; this.currentSlot = -1; return; }
                // Only snap to slots STRICTLY BELOW where we were before this tick
                let snapped = false;
                for (let i = 3; i >= 0; i--) {
                    const sh = this.currentPost.slotHeights[i];
                    // Skip any slot at or above our previous height — only snap downward
                    if (sh >= prevHeight) continue;
                    if (Math.abs(this.climbProgress - sh) < 6) {
                        this.currentSlot = i; this.climbProgress = sh; snapped = true; break;
                    }
                }
                if (!snapped) this.currentSlot = -1;
                // Push NPCs on the same post out of the way during descent
                npcs.forEach(n => {
                    if (n.currentPost === this.currentPost && n.state === 'climbing' && Math.abs(n.climbProgress - this.climbProgress) < 20) {
                        n.climbProgress = Math.max(0, n.climbProgress - CLIMB_SPEED * dt * 1.5);
                        n.worldZ = n.climbProgress;
                    }
                });
            }
            this.worldZ = this.climbProgress;

            // Remove mechanic: R key for tearing down opponent poster
            if (keys['r'] || keys['R']) {
                if (this.currentSlot >= 0 && !this.currentPost.isEmpty(this.currentSlot) && this.currentPost.slots[this.currentSlot] !== this.partyIndex) {
                    removeWarningActive = true;
                    removeWarningTimer += dt;
                    if (removeWarningTimer >= 1.5) { disqualifyPlayer(); return; }
                } else { removeWarningActive = false; removeWarningTimer = 0; }
            } else { removeWarningActive = false; removeWarningTimer = 0; }

            // Place poster with space (only on EMPTY slots now)
            // Blocked by police event or tourist blocking this post
            if (keys[' '] || keys['Space']) {
                const postIdx = lampPosts.indexOf(this.currentPost);
                if (isPlacingBlockedByPolice()) {
                    // Can't place while police are watching — do nothing
                } else if (isPostBlockedByTourist(postIdx)) {
                    // Tourist blocks this post
                } else if (this.currentSlot >= 0 && this.currentPost.isEmpty(this.currentSlot)) {
                    if (this.state !== 'hanging') { this.state = 'hanging'; this.hangTimer = POSTER_HANG_TIME * getEventHangTimeMultiplier(); }
                }
            }

            // Wind drift while climbing — shakes you around and increases fall risk
            const wind = getEventWindDrift();
            if (wind !== 0) {
                this.climbProgress += wind * dt * 10;
                this.climbProgress = Math.max(0, this.climbProgress);
                this.worldZ = this.climbProgress;
            }
        } else if (this.state === 'hanging') {
            // Police event freezes hanging progress — you must wait
            if (!isPlacingBlockedByPolice()) {
                this.hangTimer -= dt;
            }
            if (this.hangTimer <= 0) {
                if (this.currentSlot >= 0 && this.currentPost.isEmpty(this.currentSlot)) { this.placePoster(this.currentSlot); addSpeechBubble(this.worldX, 'Sådan!', 1.5); }
                this.state = 'climbing';
            }
            this.worldZ = this.climbProgress;
        }
    }

    findNearPost() {
        let best = null, bestD = 50;
        for (const p of lampPosts) { const d = Math.abs(this.worldX - p.worldX); if (d < bestD) { bestD = d; best = p; } }
        return best;
    }
}

// ============== NPC ==============
class NPC extends Character {
    constructor(partyIndex, idx) {
        super(partyIndex);
        this.speed = NPC_RUN_SPEED_MIN + Math.random() * (NPC_RUN_SPEED_MAX - NPC_RUN_SPEED_MIN);
        this.worldX = 200 + idx * 280 + Math.random() * 100;
        this.thinkTimer = Math.random() * 0.5;
        this.shoutTimer = 3 + Math.random() * 5;
        this.targetPostIndex = -1;
        this.preferHigh = Math.random() > 0.4;
        this.hesitateTimer = 0;        // pause before climbing
        this.preHangDelay = 0;          // delay before hanging poster
        this.abandonChance = 0.005;     // reduced — NPCs more committed
        this.lastPassShout = 0;         // cooldown for passing shouts
    }

    update(dt) {
        super.update(dt);
        if (this.state === 'stunned') return;

        // Hesitation timer — NPC pauses before certain actions
        if (this.hesitateTimer > 0) { this.hesitateTimer -= dt; return; }
        // Pre-hang delay — NPC pauses before placing poster
        if (this.preHangDelay > 0) { this.preHangDelay -= dt; return; }

        this.shoutTimer -= dt;
        if (this.shoutTimer <= 0) {
            this.shoutTimer = 4 + Math.random() * 8;
            if (this.state === 'running') addSpeechBubble(this.worldX, NPC_SHOUTS_RUNNING[Math.floor(Math.random()*NPC_SHOUTS_RUNNING.length)], 2);
        }

        if (this.state === 'idle' || this.state === 'running') {
            this.thinkTimer -= dt;
            if (this.thinkTimer <= 0 || this.targetPostIndex < 0) { this.pickTarget(); this.thinkTimer = 1.5 + Math.random() * 3; }
            // Shout when passing the player
            if (player && this.state === 'running' && Math.abs(this.worldX - player.worldX) < 30) {
                this.lastPassShout -= dt;
                if (this.lastPassShout <= 0 && Math.random() < 0.02) {
                    addSpeechBubble(this.worldX, NPC_SHOUTS_PASSING[Math.floor(Math.random()*NPC_SHOUTS_PASSING.length)], 1.5);
                    this.lastPassShout = 8; // cooldown
                }
            }

            if (this.targetPostIndex >= 0) {
                const t = lampPosts[this.targetPostIndex];
                const dx = t.worldX - this.worldX;
                if (Math.abs(dx) < 20) {
                    if (t.hasEmptySlot()) {
                        // Shorter hesitation — NPCs feel more "on it"
                        this.hesitateTimer = 0.2 + Math.random() * 0.5;
                        this.startClimbing(t);
                        // Shout when starting to climb
                        if (Math.random() < 0.4) addSpeechBubble(this.worldX, NPC_SHOUTS_CLIMBING[Math.floor(Math.random()*NPC_SHOUTS_CLIMBING.length)], 1.5);
                    } else { this.targetPostIndex = -1; }
                } else {
                    this.worldX += Math.sign(dx) * this.speed * dt;
                    this.facingRight = dx > 0;
                    this.state = 'running';
                    this.worldX = Math.max(40, Math.min(BRIDGE_LENGTH - 40, this.worldX));
                }
            }
        } else if (this.state === 'climbing') {
            // Random abandonment — NPC gives up and climbs back down
            if (Math.random() < this.abandonChance) {
                addSpeechBubble(this.worldX, 'Hmm...', 1.5);
                this.climbProgress = 0; this.worldZ = 0; this.state = 'idle';
                this.currentPost = null; this.currentSlot = -1; this.targetPostIndex = -1;
                return;
            }
            let ts = this.preferHigh ? this.currentPost.getHighestEmpty() : this.currentPost.getLowestEmpty();
            if (ts < 0) { this.climbProgress -= CLIMB_SPEED * dt; if (this.climbProgress <= 0) { this.state='idle'; this.worldZ=0; this.currentPost=null; this.currentSlot=-1; this.targetPostIndex=-1; } this.worldZ=Math.max(0,this.climbProgress); return; }
            const th = this.currentPost.slotHeights[ts];
            if (this.climbProgress < th) {
                this.climbProgress += CLIMB_SPEED * 1.0 * dt; // NPCs climb at full speed now
                const hf = this.climbProgress / 200;
                if (Math.random() < (FALL_CHANCE_BASE * 0.6 + FALL_CHANCE_HEIGHT_MULT * 0.4 * hf)) { this.fall(); return; }
            }
            if (Math.abs(this.climbProgress - th) < 5) {
                this.climbProgress = th; this.currentSlot = ts;
                this.state = 'hanging';
                // Shorter pre-hang delay — NPCs feel snappier
                this.preHangDelay = 0.2 + Math.random() * 0.3;
                this.hangTimer = POSTER_HANG_TIME + Math.random() * 0.5;
            }
            this.worldZ = this.climbProgress;
        } else if (this.state === 'hanging') {
            this.hangTimer -= dt;
            this.worldZ = this.climbProgress;
            if (this.hangTimer <= 0) {
                if (this.currentSlot >= 0 && this.currentPost && this.currentPost.isEmpty(this.currentSlot)) { this.placePoster(this.currentSlot); addSpeechBubble(this.worldX, NPC_SHOUTS_PLACING[Math.floor(Math.random()*NPC_SHOUTS_PLACING.length)], 1.5); }
                if (this.currentPost && this.currentPost.hasEmptySlot()) { this.state = 'climbing'; } else { this.climbProgress=0; this.worldZ=0; this.state='idle'; this.currentPost=null; this.currentSlot=-1; this.targetPostIndex=-1; }
            }
        }
    }

    pickTarget() {
        // 10% chance to pick a random available post (less suboptimal now)
        if (Math.random() < 0.10) {
            const avail = lampPosts.map((p, i) => p.hasEmptySlot() ? i : -1).filter(i => i >= 0);
            if (avail.length > 0) { this.targetPostIndex = avail[Math.floor(Math.random() * avail.length)]; return; }
        }
        let best = -1, bestS = -Infinity;
        for (let i = 0; i < lampPosts.length; i++) {
            const p = lampPosts[i];
            if (!p.hasEmptySlot()) continue;
            const d = Math.abs(this.worldX - p.worldX);
            let s = -d * 0.02 + p.slots.filter(x => x === null).length * 2 + p.countParty(this.partyIndex) * 8;
            s -= [...npcs, player].filter(c => c !== this && c.currentPost === p && (c.state === 'climbing' || c.state === 'hanging')).length * 20;
            s -= npcs.filter(c => c !== this && c.targetPostIndex === i && c.state === 'running').length * 10;
            s += (Math.random() - 0.5) * 10; // more randomness in scoring
            if (s > bestS) { bestS = s; best = i; }
        }
        this.targetPostIndex = best;
    }
}

// ============== BACKGROUND ENTITIES (bikes, pedestrians, ladcykler) ==============
class BgEntity {
    constructor() {
        this.worldX = Math.random() * BRIDGE_LENGTH;
        this.speed = 30 + Math.random() * 50;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.lane = Math.random(); // 0 = far, 1 = near
        const r = Math.random();
        if (r < 0.22) this.type = 'cyclist';
        else if (r < 0.36) this.type = 'ladcykel';
        else if (r < 0.46) this.type = 'bycykel';
        else if (r < 0.58) this.type = 'pedestrian';
        else if (r < 0.66) this.type = 'jogger';
        else if (r < 0.74) this.type = 'barnevogn';
        else if (r < 0.82) this.type = 'tourist';
        else if (r < 0.90) this.type = 'dogwalker';
        else this.type = 'couple';

        if (this.type === 'cyclist' || this.type === 'ladcykel' || this.type === 'bycykel') this.speed *= 2;
        if (this.type === 'jogger') this.speed *= 1.5;
        if (this.type === 'tourist') this.speed *= 0.4; // tourists are slow
        if (this.type === 'couple') this.speed *= 0.6;
        this.color = ['#3A3A50','#2D3748','#5A3A2A','#1A365D','#4A2A5A','#2A4A3A'][Math.floor(Math.random()*6)];
        // Diverse appearance
        const app = randomAppearance();
        this.skinColor = app.skin;
        this.hairColor = app.hair;
        this.female = app.female;
    }

    update(dt) {
        this.worldX += this.speed * this.dir * dt;
        if (this.worldX < -80) this.worldX = BRIDGE_LENGTH + 80;
        if (this.worldX > BRIDGE_LENGTH + 80) this.worldX = -80;
    }

    draw() {
        const sx = wx(this.worldX);
        if (sx < -60 || sx > logicalWidth + 60) return;
        const by = bridgeY();
        // Vertical offset based on lane (near/far feel via slight Y shift)
        const yOff = -4 + this.lane * 8;
        const y = by + yOff;
        const alpha = 0.25 - this.lane * 0.08;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        const d = this.dir;

        if (this.type === 'cyclist') {
            ctx.fillRect(sx - 4, y - 12, 8, 8);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 16, 3, 0, Math.PI * 2); ctx.fill();
            // Hair for women
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 3.5, y - 19, 2, 5); ctx.fillRect(sx + 1.5, y - 19, 2, 5); }
            ctx.strokeStyle = this.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx - 7*d, y, 5, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx + 7*d, y, 5, 0, Math.PI * 2); ctx.stroke();
        } else if (this.type === 'ladcykel') {
            ctx.fillRect(sx - 3, y - 10, 6, 8);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 14, 3, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 3.5, y - 17, 2, 5); ctx.fillRect(sx + 1.5, y - 17, 2, 5); }
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(sx + 6*d, y - 6, 14*d, 8);
            ctx.strokeStyle = this.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx - 6*d, y + 1, 4, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx + 16*d, y + 1, 4, 0, Math.PI * 2); ctx.stroke();
        } else if (this.type === 'bycykel') {
            ctx.fillRect(sx - 3, y - 10, 6, 8);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 14, 3, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 3.5, y - 17, 2, 5); ctx.fillRect(sx + 1.5, y - 17, 2, 5); }
            ctx.fillStyle = '#888';
            ctx.fillRect(sx - 8, y - 3, 16, 5);
            ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx - 8, y + 1, 4, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx + 8, y + 1, 4, 0, Math.PI * 2); ctx.stroke();
        } else if (this.type === 'pedestrian') {
            ctx.fillRect(sx - 3, y - 13, 6, 9);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 17, 3.5, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 4, y - 20, 2, 6); ctx.fillRect(sx + 2, y - 20, 2, 6); }
            else { ctx.fillStyle = this.hairColor; ctx.beginPath(); ctx.arc(sx, y - 19, 3.5, Math.PI, Math.PI*2); ctx.fill(); }
        } else if (this.type === 'jogger') {
            ctx.fillRect(sx - 3, y - 13, 6, 9);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 17, 3.5, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 4, y - 20, 2, 6); ctx.fillRect(sx + 2, y - 20, 2, 6); }
            else { ctx.fillStyle = this.hairColor; ctx.beginPath(); ctx.arc(sx, y - 19, 3.5, Math.PI, Math.PI*2); ctx.fill(); }
            const k = Math.sin(Date.now() * 0.01) * 3;
            ctx.fillStyle = this.color;
            ctx.fillRect(sx - 5, y - 8 + k, 2, 6);
            ctx.fillRect(sx + 3, y - 8 - k, 2, 6);
        } else if (this.type === 'barnevogn') {
            ctx.fillRect(sx - 3, y - 13, 6, 9);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 17, 3.5, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 4, y - 20, 2, 6); ctx.fillRect(sx + 2, y - 20, 2, 6); }
            else { ctx.fillStyle = this.hairColor; ctx.beginPath(); ctx.arc(sx, y - 19, 3.5, Math.PI, Math.PI*2); ctx.fill(); }
            ctx.fillStyle = '#666';
            ctx.fillRect(sx + 6*d, y - 8, 10*d, 8);
            ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx + 8*d, y + 1, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx + 14*d, y + 1, 3, 0, Math.PI * 2); ctx.stroke();
        } else if (this.type === 'tourist') {
            ctx.fillRect(sx - 3, y - 13, 6, 9);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 17, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#333';
            ctx.fillRect(sx + 4*d, y - 14, 5*d, 4);
            ctx.fillStyle = '#E8C840';
            ctx.fillRect(sx - 5, y - 21, 10, 3);
        } else if (this.type === 'dogwalker') {
            ctx.fillRect(sx - 3, y - 13, 6, 9);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx, y - 17, 3.5, 0, Math.PI * 2); ctx.fill();
            if (this.female) { ctx.fillStyle = this.hairColor; ctx.fillRect(sx - 4, y - 20, 2, 6); ctx.fillRect(sx + 2, y - 20, 2, 6); }
            else { ctx.fillStyle = this.hairColor; ctx.beginPath(); ctx.arc(sx, y - 19, 3.5, Math.PI, Math.PI*2); ctx.fill(); }
            ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx + 3*d, y - 6); ctx.lineTo(sx + 18*d, y - 2); ctx.stroke();
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(sx + 14*d, y - 4, 8*d, 5);
            ctx.beginPath(); ctx.arc(sx + 22*d, y - 3, 3, 0, Math.PI * 2); ctx.fill();
            const dk = Math.sin(Date.now() * 0.008) * 2;
            ctx.fillRect(sx + 15*d, y, 2, 4 + dk);
            ctx.fillRect(sx + 20*d, y, 2, 4 - dk);
            ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(sx + 14*d, y - 3);
            ctx.quadraticCurveTo(sx + 10*d, y - 8 + Math.sin(Date.now()*0.01)*3, sx + 12*d, y - 7);
            ctx.stroke();
        } else if (this.type === 'couple') {
            // Two people — use own + random second appearance
            ctx.fillRect(sx - 5, y - 13, 5, 9);
            ctx.fillRect(sx + 2, y - 12, 5, 8);
            ctx.fillStyle = this.skinColor;
            ctx.beginPath(); ctx.arc(sx - 2, y - 17, 3, 0, Math.PI * 2); ctx.fill();
            // Second person slightly different tone
            const skin2 = SKIN_TONES[Math.floor(Math.abs(Math.sin(this.worldX * 0.1)) * SKIN_TONES.length)];
            ctx.fillStyle = skin2;
            ctx.beginPath(); ctx.arc(sx + 5, y - 16, 3, 0, Math.PI * 2); ctx.fill();
            // One with longer hair (woman)
            ctx.fillStyle = this.hairColor;
            if (this.female) {
                ctx.fillRect(sx - 4, y - 20, 1.5, 5); ctx.fillRect(sx - 0.5, y - 20, 1.5, 5);
            } else {
                ctx.fillRect(sx + 3.5, y - 19, 1.5, 5); ctx.fillRect(sx + 6.5, y - 19, 1.5, 5);
            }
        }
        ctx.globalAlpha = 1;
    }
}

// ============== BIRD (small birds flying across sky) ==============
class Bird {
    constructor() {
        this.reset();
    }
    reset() {
        this.worldX = -200 - Math.random() * 400;
        this.y = 20 + Math.random() * 80;
        this.speed = 70 + Math.random() * 90;
        this.wingPhase = Math.random() * Math.PI * 2;
        this.size = 0.35 + Math.random() * 0.3; // smaller than seagulls — city birds
        this.driftY = Math.random() * 0.4;
    }
    update(dt) {
        this.worldX += this.speed * dt;
        this.y += Math.sin(Date.now() * 0.0015 + this.wingPhase) * this.driftY * dt * 8;
        this.wingPhase += dt * 9;
        if (this.worldX > BRIDGE_LENGTH + 500) this.reset();
    }
    draw() {
        const sx = wx(this.worldX);
        if (sx < -30 || sx > logicalWidth + 30) return;
        const s = this.size;
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#3A3A3A';
        ctx.lineWidth = 1.2 * s;
        const wing = Math.sin(this.wingPhase) * 5 * s;
        ctx.beginPath();
        ctx.moveTo(sx - 8*s, this.y + wing);
        ctx.quadraticCurveTo(sx - 2*s, this.y - 2*s + wing*0.3, sx, this.y);
        ctx.quadraticCurveTo(sx + 2*s, this.y - 2*s - wing*0.3, sx + 8*s, this.y - wing);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

// ============== SPEECH BUBBLES & PARTICLES ==============
function addSpeechBubble(wx, text, dur = 2) { speechBubbles.push({ worldX: wx, text, life: dur, maxLife: dur, offY: 0 }); }
function updateSpeechBubbles(dt) { for (let i = speechBubbles.length-1; i>=0; i--) { speechBubbles[i].life -= dt; speechBubbles[i].offY -= 18*dt; if (speechBubbles[i].life<=0) speechBubbles.splice(i,1); } }
function drawSpeechBubbles() {
    for (const b of speechBubbles) {
        const sx = wx(b.worldX), sy = bridgeY() - 55 + b.offY;
        ctx.globalAlpha = Math.min(1, b.life / (b.maxLife * 0.3));
        ctx.font = 'bold 11px Arial';
        const m = ctx.measureText(b.text);
        const pw = m.width + 14, ph = 22;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        roundRect(ctx, sx - pw/2, sy - ph/2, pw, ph, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.text, sx, sy);
        ctx.globalAlpha = 1;
    }
}
function updateParticles(dt) { for (let i = particles.length-1; i>=0; i--) { const p = particles[i]; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 200*dt; p.life -= dt; if (p.life<=0) particles.splice(i,1); } }
function drawParticles() { for (const p of particles) { ctx.globalAlpha = Math.max(0,p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size); } ctx.globalAlpha = 1; }

function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
    c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}

// ============== SCENERY GENERATION ==============
function generateScenery() {
    // Nørrebro side (left end) — colorful, dense, slightly chaotic
    skylineNorrebro = [];
    const nbColors = ['#D4A070','#C08060','#B07050','#E0C8A0','#C4A878','#D08868','#AA7050','#E8D4B8','#BB8866'];
    let nx = -400;
    while (nx < 500) {
        const w = 30 + Math.random() * 50;
        const h = 40 + Math.random() * 70;
        skylineNorrebro.push({ x: nx, w, h, color: nbColors[Math.floor(Math.random()*nbColors.length)], floors: Math.floor(h/16), hasRoof: Math.random()>0.4 });
        nx += w + 1 + Math.random() * 5;
    }

    // Indre By side (right end) — neoclassical, lighter, more uniform
    skylineIndreby = [];
    const ibColors = ['#E8E0D0','#D8D0C0','#F0E8D8','#C8C0B0','#E0D8C8','#D0C8B8','#F0E0D0'];
    let ix = BRIDGE_LENGTH - 400;
    while (ix < BRIDGE_LENGTH + 500) {
        const w = 35 + Math.random() * 55;
        const h = 45 + Math.random() * 60;
        skylineIndreby.push({ x: ix, w, h, color: ibColors[Math.floor(Math.random()*ibColors.length)], floors: Math.floor(h/16), hasRoof: Math.random()>0.3, spire: Math.random()>0.85 });
        ix += w + 1 + Math.random() * 6;
    }

    // Bridge piers in the water
    bridgePiers = [];
    const pierSpacing = BRIDGE_LENGTH / 6;
    for (let i = 1; i < 6; i++) {
        bridgePiers.push(pierSpacing * i);
    }
}

// ============== WORLD DRAWING ==============
function drawWorld() {
    const by = bridgeY();
    const waterY = by + 18; // water starts below bridge deck
    const skyH = waterY;

    // --- SKY (warm dusk gradient) ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
    skyGrad.addColorStop(0, '#7A9CC6');
    skyGrad.addColorStop(0.25, '#B8A8C8');
    skyGrad.addColorStop(0.5, '#D4B8A8');
    skyGrad.addColorStop(0.75, '#E8C8A0');
    skyGrad.addColorStop(1, '#D8C0A0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, logicalWidth, skyH);

    // Subtle sun glow near horizon
    const sunX = logicalWidth * 0.7;
    const sunY = skyH - 20;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 180);
    sunGlow.addColorStop(0, 'rgba(255,220,160,0.25)');
    sunGlow.addColorStop(0.5, 'rgba(255,200,140,0.08)');
    sunGlow.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, logicalWidth, skyH);

    // Clouds — warmer tones
    const ct = Date.now() * 0.00002;
    for (let i = 0; i < 10; i++) {
        const cx = ((i * 180 + ct * 500) % (logicalWidth + 500)) - 250;
        const cy = 15 + (i % 4) * 28;
        const cloudAlpha = 0.2 + (i % 3) * 0.05;
        ctx.fillStyle = `rgba(255,240,220,${cloudAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 22 + i*2, 0, Math.PI*2);
        ctx.arc(cx+20, cy-5, 18+i*1.5, 0, Math.PI*2);
        ctx.arc(cx+38, cy+1, 20+i*2, 0, Math.PI*2);
        ctx.arc(cx+14, cy+4, 14, 0, Math.PI*2);
        ctx.fill();
    }

    // --- BIRDS in sky ---
    birds.forEach(b => b.draw());

    // --- SKYLINE (parallax) ---
    drawSkylineSection(skylineNorrebro, 0.25, by - 5);
    drawSkylineSection(skylineIndreby, 0.25, by - 5);

    // --- TREES along lakeside (behind bridge, parallax) ---
    drawTrees(by);

    // --- WATER (Søerne) ---
    drawWater(waterY);

    // --- BRIDGE ---
    drawBridge(by);
}

function drawSkylineSection(buildings, parallax, baseY) {
    ctx.globalAlpha = 0.5;
    for (const b of buildings) {
        const sx = b.x - cameraX * parallax + (logicalWidth/2 - cameraX * (1 - parallax));
        // Simplified: just offset from camera
        const screenX = wx(b.x) * parallax + (1 - parallax) * (b.x - cameraX * parallax + logicalWidth * 0.1);
        const finalX = b.x - cameraX * parallax;
        if (finalX + b.w < -100 || finalX > logicalWidth + 100) continue;

        ctx.fillStyle = b.color;
        ctx.fillRect(finalX, baseY - b.h, b.w, b.h);

        // Windows
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let f = 0; f < b.floors; f++) {
            for (let w = 0; w < Math.floor(b.w/11); w++) {
                ctx.fillRect(finalX + 4 + w*11, baseY - b.h + 6 + f*16, 5, 8);
            }
        }

        // Roof
        if (b.hasRoof) {
            ctx.fillStyle = '#5A5A5A';
            ctx.beginPath();
            ctx.moveTo(finalX - 1, baseY - b.h);
            ctx.lineTo(finalX + b.w/2, baseY - b.h - 10);
            ctx.lineTo(finalX + b.w + 1, baseY - b.h);
            ctx.closePath();
            ctx.fill();
        }

        // Spire (Indre By churches)
        if (b.spire) {
            ctx.fillStyle = '#4A6A5A';
            ctx.beginPath();
            ctx.moveTo(finalX + b.w/2 - 2, baseY - b.h - 10);
            ctx.lineTo(finalX + b.w/2, baseY - b.h - 35);
            ctx.lineTo(finalX + b.w/2 + 2, baseY - b.h - 10);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}

function drawTrees(baseY) {
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 30; i++) {
        const tx = i * 110 + 20 - cameraX * 0.15;
        if (tx < -25 || tx > logicalWidth + 25) continue;
        const ty = baseY - 2 + Math.sin(i * 2.3) * 4;
        ctx.fillStyle = '#4A6A3A';
        ctx.beginPath(); ctx.arc(tx, ty - 14, 10 + Math.sin(i)*2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#5A7A4A';
        ctx.beginPath(); ctx.arc(tx+3, ty - 16, 7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(tx - 1.5, ty - 6, 3, 8);
    }
    ctx.globalAlpha = 1;
}

function drawWater(waterY) {
    // Water fills below bridge — warmer, richer tones
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, logicalHeight);
    waterGrad.addColorStop(0, '#6A94A8');
    waterGrad.addColorStop(0.2, '#5A8898');
    waterGrad.addColorStop(0.5, '#4A7888');
    waterGrad.addColorStop(1, '#2A5A70');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waterY, logicalWidth, logicalHeight - waterY);

    // Bridge piers in water
    for (const px of bridgePiers) {
        const sx = wx(px);
        if (sx < -30 || sx > logicalWidth + 30) continue;
        // Stone pier
        ctx.fillStyle = '#8A8878';
        ctx.fillRect(sx - 12, waterY - 5, 24, logicalHeight - waterY + 10);
        // Pier cap
        ctx.fillStyle = '#9A9888';
        ctx.fillRect(sx - 15, waterY - 5, 30, 8);
        // Water splash at pier base
        ctx.fillStyle = 'rgba(180,220,240,0.3)';
        const t = Date.now() * 0.002;
        ctx.beginPath();
        ctx.ellipse(sx - 14, waterY + 8 + Math.sin(t + px*0.01) * 2, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + 14, waterY + 8 + Math.sin(t + px*0.01 + 1) * 2, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Water shimmer / ripples
    const t = Date.now() * 0.001;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#8AC0D8';
    for (let i = 0; i < 50; i++) {
        const rx = ((i * 75 + t * 12) % (logicalWidth + 60)) - 30;
        const ry = waterY + 15 + (i % 10) * 18 + Math.sin(t * 0.7 + i * 0.6) * 4;
        ctx.fillRect(rx, ry, 20 + Math.sin(t + i * 0.4) * 8, 1.5);
    }
    ctx.globalAlpha = 1;

    // Swans (2-3 floating)
    for (let i = 0; i < 3; i++) {
        const swX = ((i * 400 + t * 8) % (logicalWidth + 200)) - 100;
        const swY = waterY + 30 + i * 25 + Math.sin(t * 0.5 + i) * 3;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.35;
        // Body
        ctx.beginPath(); ctx.ellipse(swX, swY, 8, 4, 0, 0, Math.PI*2); ctx.fill();
        // Neck
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(swX + 5, swY - 2); ctx.quadraticCurveTo(swX + 10, swY - 12, swX + 7, swY - 14); ctx.stroke();
        // Head
        ctx.beginPath(); ctx.arc(swX + 7, swY - 15, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function drawBridge(by) {
    const leftEnd = wx(0);
    const rightEnd = wx(BRIDGE_LENGTH);

    // Shadow under bridge on water
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(leftEnd, by + 18, rightEnd - leftEnd, 12);

    // Bridge side wall (stone)
    ctx.fillStyle = '#7A7868';
    ctx.fillRect(leftEnd, by + 4, rightEnd - leftEnd, 14);
    // Stone block lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let bx = leftEnd; bx < rightEnd; bx += 40) {
        ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by + 18); ctx.stroke();
    }

    // Bridge deck — richer asphalt
    const deckGrad = ctx.createLinearGradient(0, by - 4, 0, by + 4);
    deckGrad.addColorStop(0, '#727272');
    deckGrad.addColorStop(0.5, '#646464');
    deckGrad.addColorStop(1, '#585858');
    ctx.fillStyle = deckGrad;
    ctx.fillRect(leftEnd, by - 2, rightEnd - leftEnd, 6);

    // Cobblestone sidewalk strip — warmer tones with texture
    const cobbleGrad = ctx.createLinearGradient(0, by - 7, 0, by - 1);
    cobbleGrad.addColorStop(0, '#A8A090');
    cobbleGrad.addColorStop(0.5, '#9A9484');
    cobbleGrad.addColorStop(1, '#8A8474');
    ctx.fillStyle = cobbleGrad;
    ctx.fillRect(leftEnd, by - 7, rightEnd - leftEnd, 6);

    // Cobblestone texture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let cx = leftEnd; cx < rightEnd; cx += 12) {
        ctx.beginPath(); ctx.moveTo(cx, by - 7); ctx.lineTo(cx, by - 1); ctx.stroke();
    }

    // Deck highlight line (warm light reflection)
    ctx.fillStyle = 'rgba(255,240,200,0.06)';
    ctx.fillRect(leftEnd, by - 7, rightEnd - leftEnd, 1);

    // Bike lane marking (subtle blue)
    ctx.fillStyle = 'rgba(30,80,180,0.08)';
    ctx.fillRect(leftEnd, by - 1, rightEnd - leftEnd, 3);

    // Road dash lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(leftEnd, by + 1);
    ctx.lineTo(rightEnd, by + 1);
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Stone balustrade / railing — warm granite tones ---
    const railGrad = ctx.createLinearGradient(0, by - 20, 0, by - 6);
    railGrad.addColorStop(0, '#DCD8CC');
    railGrad.addColorStop(0.3, '#D0CCBF');
    railGrad.addColorStop(1, '#C4C0B4');
    ctx.fillStyle = railGrad;
    ctx.fillRect(leftEnd, by - 18, rightEnd - leftEnd, 12);
    // Railing cap with highlight
    ctx.fillStyle = '#E8E4D8';
    ctx.fillRect(leftEnd, by - 20, rightEnd - leftEnd, 3);
    ctx.fillStyle = 'rgba(255,250,230,0.12)';
    ctx.fillRect(leftEnd, by - 20, rightEnd - leftEnd, 1);

    // Railing pillar rhythm with shadow
    for (let px = leftEnd + 15; px < rightEnd; px += 35) {
        ctx.fillStyle = '#B8B4A8';
        ctx.fillRect(px, by - 18, 4, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px, by - 18, 1, 12);
    }

    // --- Bridge ends connect to city streets ---
    drawStreetExtension(by, leftEnd, 'left');
    drawStreetExtension(by, rightEnd, 'right');
}

// Deterministic hash for stable per-frame building generation
function seededRand(seed) {
    let x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function drawStreetExtension(by, edgeX, side) {
    const extLen = 400; // how far the road extends beyond bridge
    const dir = side === 'left' ? -1 : 1;
    const startX = edgeX;
    const endX = edgeX + dir * extLen;
    const x0 = Math.min(startX, endX);
    const x1 = Math.max(startX, endX);

    // Road surface continuation (asphalt)
    const roadGrad = ctx.createLinearGradient(0, by - 4, 0, by + 16);
    roadGrad.addColorStop(0, '#686868');
    roadGrad.addColorStop(0.3, '#606060');
    roadGrad.addColorStop(1, '#505050');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(x0, by - 2, x1 - x0, 18);

    // Pavement / sidewalk on top
    ctx.fillStyle = '#9A9488';
    ctx.fillRect(x0, by - 7, x1 - x0, 6);

    // Curb line
    ctx.fillStyle = '#B0AC9C';
    ctx.fillRect(x0, by - 8, x1 - x0, 2);

    // Road markings
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(x0, by + 5);
    ctx.lineTo(x1, by + 5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Transition ramp — slight gradient to blend railing end
    const rampW = 30;
    const rampX = side === 'left' ? edgeX - rampW : edgeX;
    const rampGrad = ctx.createLinearGradient(rampX, 0, rampX + rampW, 0);
    if (side === 'left') {
        rampGrad.addColorStop(0, 'rgba(200,196,184,0)');
        rampGrad.addColorStop(1, 'rgba(200,196,184,0.8)');
    } else {
        rampGrad.addColorStop(0, 'rgba(200,196,184,0.8)');
        rampGrad.addColorStop(1, 'rgba(200,196,184,0)');
    }
    ctx.fillStyle = rampGrad;
    ctx.fillRect(rampX, by - 20, rampW, 12);

    // --- Street-level buildings (deterministic sizes) ---
    const buildingColors = side === 'left'
        ? ['#C08060','#B07050','#D4A070','#C4A878','#AA7050']
        : ['#D8D0C0','#E0D8C8','#C8C0B0','#E8E0D0','#D0C8B8'];
    let bx = side === 'left' ? x0 : startX + 10;
    const bEnd = side === 'left' ? startX - 10 : x1;
    let bIdx = 0;
    const baseSeed = side === 'left' ? 1337 : 7331;
    while (bx < bEnd) {
        const bw = 28 + seededRand(baseSeed + bIdx * 2) * 40;
        const bh = 50 + seededRand(baseSeed + bIdx * 2 + 1) * 60;
        const col = buildingColors[bIdx % buildingColors.length];

        // Building body
        ctx.fillStyle = col;
        ctx.fillRect(bx, by - 8 - bh, bw, bh + 8);

        // Windows
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let fy = 0; fy < Math.floor(bh / 14); fy++) {
            for (let fw = 0; fw < Math.floor(bw / 10); fw++) {
                ctx.fillRect(bx + 3 + fw * 10, by - 8 - bh + 5 + fy * 14, 5, 7);
            }
        }
        // Lit windows (deterministic via sin)
        ctx.fillStyle = 'rgba(255,220,120,0.15)';
        for (let fy = 0; fy < Math.floor(bh / 14); fy++) {
            for (let fw = 0; fw < Math.floor(bw / 10); fw++) {
                if (Math.sin(bIdx * 5.3 + fy * 3.1 + fw * 2.7) > 0.3) {
                    ctx.fillRect(bx + 3 + fw * 10, by - 8 - bh + 5 + fy * 14, 5, 7);
                }
            }
        }

        // Roof
        ctx.fillStyle = '#5A5A52';
        ctx.beginPath();
        ctx.moveTo(bx - 1, by - 8 - bh);
        ctx.lineTo(bx + bw/2, by - 8 - bh - 8);
        ctx.lineTo(bx + bw + 1, by - 8 - bh);
        ctx.closePath();
        ctx.fill();

        // Door at ground level
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(bx + bw/2 - 3, by - 14, 6, 10);

        bx += bw + 1;
        bIdx++;
    }

    // Fill below road to bottom of screen (ground / basement)
    ctx.fillStyle = '#4A4840';
    ctx.fillRect(x0, by + 16, x1 - x0, logicalHeight - by);
}

// ============== CLIMBING INDICATOR ==============
function drawClimbingIndicator() {
    if (!player.currentPost) return;
    const post = player.currentPost;
    const by = bridgeY();
    for (let i = 0; i < 4; i++) {
        const py = by - post.slotHeights[i];
        const sx = wx(post.worldX);
        const isCur = player.currentSlot === i;
        const empty = post.isEmpty(i);
        if (isCur) {
            ctx.strokeStyle = empty ? '#2ecc71' : '#e74c3c';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(sx + 6, py - 19, 30, 38);
            ctx.setLineDash([]);
            if (empty) {
                ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
                ctx.fillText('MELLEMRUM', sx + 21, py + 26);
                ctx.fillText(`(${SLOT_NAMES[i]}: ${SLOT_POINTS[i]} p.)`, sx + 21, py + 38);
            } else if (post.slots[i] !== player.partyIndex) {
                ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
                ctx.fillText('OPTAGET', sx + 21, py + 26);
                ctx.fillStyle = '#ff6b6b'; ctx.font = '8px Arial';
                ctx.fillText('[R] riv ned', sx + 21, py + 37);
            }
        }
    }
    if (player.state === 'hanging') {
        const prog = 1 - player.hangTimer / POSTER_HANG_TIME;
        const pos = worldToScreen(player.worldX, player.worldZ);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(pos.x - 15, pos.y - 42, 30, 4);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(pos.x - 15, pos.y - 42, 30 * prog, 4);
    }
}

// ============== GAME INIT ==============
function initGame() {
    lampPosts = [];
    const spacing = BRIDGE_LENGTH / (NUM_LAMP_POSTS + 1);
    for (let i = 0; i < NUM_LAMP_POSTS; i++) {
        lampPosts.push(new LampPost(i, spacing * (i + 1)));
    }
    player = new Player(selectedPartyIndex);
    npcs = [];
    const avail = PARTIES.map((_, i) => i).filter(i => i !== selectedPartyIndex);
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [avail[i],avail[j]] = [avail[j],avail[i]]; }
    for (let i = 0; i < NUM_NPCS && i < avail.length; i++) npcs.push(new NPC(avail[i], i));
    backgroundEntities = [];
    for (let i = 0; i < 28; i++) backgroundEntities.push(new BgEntity());
    birds = [];
    for (let i = 0; i < 6; i++) { const b = new Bird(); b.worldX = Math.random() * BRIDGE_LENGTH; birds.push(b); }
    gameTime = GAME_DURATION;
    speechBubbles = []; particles = [];
    timeBonus = 0; timeBonusFlash = 0;
    generateScenery();
}

// ============== DISQUALIFICATION ==============
function disqualifyPlayer() {
    gameState = GameState.DISQUALIFIED;
    stopAmbientSound(); stopBgMusic();
    playDisqualifyBuzz();
    showScreen('disqualified-screen');
    document.getElementById('game-hud').classList.add('hidden');
}

// ============== RESULTS ==============
function showResults() {
    gameState = GameState.RESULTS;
    playVictoryChime();
    const all = [player, ...npcs].sort((a, b) => b.score - a.score);
    const sb = document.getElementById('results-scoreboard');
    sb.innerHTML = '';
    all.forEach((c, i) => {
        const p = c.getParty(), isP = c === player;
        const row = document.createElement('div');
        row.className = `results-row${isP ? ' player-row' : ''}`;
        row.innerHTML = `<span class="results-rank">#${i+1}</span><div class="results-party-badge" style="background:${p.bg};color:${p.text}">${p.letter}</div><span class="results-party-name">${p.name}${isP?' (dig)':''}</span><span class="results-points">${c.score} point</span>`;
        sb.appendChild(row);
    });
    const rank = all.indexOf(player) + 1;
    const msg = document.getElementById('results-message');
    if (rank === 1) msg.textContent = `Du dominerede broen. Broen tilhører ${player.getParty().letter}.`;
    else if (rank === 2) msg.textContent = 'Du kom på 2. pladsen. Du var tæt på.';
    else if (rank === 3) msg.textContent = 'Du kom på 3. pladsen. Næste gang tager du toppen.';
    else msg.textContent = 'Næste gang tager du toppen.';
    showScreen('results-screen');
    document.getElementById('game-hud').classList.add('hidden');
}

// ============== SHARE / SCREENSHOT ==============
function generateResultImage() {
    const sc = document.getElementById('share-canvas');
    const sctx = sc.getContext('2d');
    const w = 600, h = 400;
    sc.width = w; sc.height = h;

    // Background — dusk gradient
    const bg = sctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2A3A5C');
    bg.addColorStop(0.5, '#4A3A5C');
    bg.addColorStop(1, '#C08060');
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, w, h);

    // Subtle overlay
    sctx.fillStyle = 'rgba(0,0,0,0.3)';
    sctx.fillRect(0, 0, w, h);

    // Title
    sctx.fillStyle = '#fff';
    sctx.font = 'bold 28px Arial';
    sctx.textAlign = 'center';
    sctx.fillText('VALGPLAKAT RUNNER', w / 2, 44);
    sctx.font = 'italic 14px Arial';
    sctx.fillStyle = '#D8A070';
    sctx.fillText('Kampen om Dronning Louises Bro', w / 2, 66);

    // Scoreboard
    const all = [player, ...npcs].sort((a, b) => b.score - a.score);
    const startY = 95;
    const rowH = 38;
    all.forEach((c, i) => {
        const p = c.getParty();
        const isP = c === player;
        const y = startY + i * rowH;

        // Row background
        if (isP) {
            sctx.fillStyle = 'rgba(255,255,255,0.12)';
            sctx.beginPath();
            sctx.roundRect(40, y - 4, w - 80, rowH - 4, 6);
            sctx.fill();
        }

        // Rank
        sctx.font = 'bold 16px Arial';
        sctx.textAlign = 'left';
        if (i === 0) sctx.fillStyle = '#f5c518';
        else if (i === 1) sctx.fillStyle = '#c0c0c0';
        else if (i === 2) sctx.fillStyle = '#cd7f32';
        else sctx.fillStyle = '#888';
        sctx.fillText(`#${i + 1}`, 55, y + 18);

        // Party badge
        sctx.fillStyle = p.bg;
        sctx.beginPath();
        sctx.roundRect(90, y + 2, 28, 24, 4);
        sctx.fill();
        sctx.fillStyle = p.text;
        sctx.font = 'bold 14px Arial';
        sctx.textAlign = 'center';
        sctx.fillText(p.letter, 104, y + 18);

        // Name
        sctx.textAlign = 'left';
        sctx.fillStyle = isP ? '#fff' : '#ccc';
        sctx.font = isP ? 'bold 14px Arial' : '14px Arial';
        sctx.fillText(p.name + (isP ? ' (dig)' : ''), 130, y + 18);

        // Score
        sctx.textAlign = 'right';
        sctx.fillStyle = '#fff';
        sctx.font = 'bold 15px Arial';
        sctx.fillText(`${c.score} pt`, w - 55, y + 18);
    });

    // Message at bottom
    const rank = all.indexOf(player) + 1;
    sctx.font = 'italic 15px Arial';
    sctx.textAlign = 'center';
    sctx.fillStyle = '#D8A070';
    let msg = '';
    if (rank === 1) msg = `Broen tilhører ${player.getParty().letter}!`;
    else if (rank <= 3) msg = `${rank}. plads — tæt på toppen!`;
    else msg = 'Næste gang tager jeg toppen!';
    sctx.fillText(msg, w / 2, h - 30);

    // Watermark
    sctx.font = '11px Arial';
    sctx.fillStyle = 'rgba(255,255,255,0.3)';
    sctx.fillText('valgplakatrunner.dk', w / 2, h - 10);

    return sc;
}

function downloadScreenshot() {
    const sc = generateResultImage();
    const link = document.createElement('a');
    link.download = 'valgplakat-resultat.png';
    link.href = sc.toDataURL('image/png');
    link.click();

    // Feedback
    const btn = document.getElementById('results-screenshot');
    btn.textContent = '✅ Gemt!';
    btn.classList.add('success');
    setTimeout(() => { btn.textContent = '📸 Screenshot'; btn.classList.remove('success'); }, 2500);
}

async function shareResult() {
    const sc = generateResultImage();
    const rank = [player, ...npcs].sort((a, b) => b.score - a.score).indexOf(player) + 1;
    const party = player.getParty();
    const text = `Jeg blev nr. ${rank} som ${party.name} i Valgplakat Runner! 🗳️🇩🇰\n${player.score} point på Dronning Louises Bro!`;

    // Try Web Share API with image
    if (navigator.share) {
        try {
            const blob = await new Promise(r => sc.toBlob(r, 'image/png'));
            const file = new File([blob], 'valgplakat-resultat.png', { type: 'image/png' });
            await navigator.share({ text, files: [file] });
            return;
        } catch (e) {
            // Fallback: share without image
            try { await navigator.share({ text }); return; } catch (e2) {}
        }
    }

    // Fallback: copy text to clipboard
    try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('results-share');
        btn.textContent = '✅ Kopieret!';
        btn.classList.add('success');
        setTimeout(() => { btn.textContent = '📤 Del resultat'; btn.classList.remove('success'); }, 2500);
    } catch (e) {
        // Last resort: download image
        downloadScreenshot();
    }
}

// ============== SCREENS ==============
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); if (id) document.getElementById(id).classList.add('active'); }

// ============== MENU BACKGROUND ==============
let menuCanvas, menuCtx, menuAnimId;
let menuTime = 0, menuLastTs = 0;
let menuMusicNodes = null;
let menuEntities = { stars: [], birds: [], silhouettes: [], cyclists: [], swans: [], particles: [], windows: [] };

function setupMenuCanvas() {
    menuCanvas = document.getElementById('menu-canvas');
    menuCtx = menuCanvas.getContext('2d');
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        menuCanvas.width = window.innerWidth * dpr;
        menuCanvas.height = window.innerHeight * dpr;
        menuCanvas.style.width = window.innerWidth + 'px';
        menuCanvas.style.height = window.innerHeight + 'px';
        menuCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        initMenuWindows(); // rebuild windows on resize
    }
    resize();
    window.addEventListener('resize', resize);
    initMenuEntities();
}

// ============== MENU ENTITIES ==============
function initMenuEntities() {
    const w = window.innerWidth, h = window.innerHeight;
    const by = h * 0.68;

    // Twinkling stars
    menuEntities.stars = [];
    for (let i = 0; i < 50; i++) {
        menuEntities.stars.push({
            x: Math.random() * w, y: Math.random() * (by * 0.45),
            twinklePhase: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.5 + Math.random() * 2.5,
            baseAlpha: 0.15 + Math.random() * 0.35,
            size: 1 + Math.random() * 1.5,
        });
    }

    // Birds
    menuEntities.birds = [];
    for (let i = 0; i < 6; i++) {
        menuEntities.birds.push({
            x: Math.random() * w, y: 20 + Math.random() * (by * 0.35),
            speed: 25 + Math.random() * 40,
            wingPhase: Math.random() * Math.PI * 2,
            size: 0.4 + Math.random() * 0.3,
        });
    }

    // Silhouettes (people running with posters)
    menuEntities.silhouettes = [];
    for (let i = 0; i < 3; i++) {
        menuEntities.silhouettes.push({
            x: Math.random() * w,
            speed: 35 + Math.random() * 35,
            dir: Math.random() < 0.5 ? 1 : -1,
            partyIndex: Math.floor(Math.random() * PARTIES.length),
            animPhase: Math.random() * Math.PI * 2,
            scale: 0.65 + Math.random() * 0.25,
        });
    }

    // Cyclists
    menuEntities.cyclists = [];
    for (let i = 0; i < 2; i++) {
        menuEntities.cyclists.push({
            x: w * 0.3 + Math.random() * w * 0.4,
            speed: 70 + Math.random() * 50,
            dir: i === 0 ? 1 : -1,
            wheelPhase: Math.random() * Math.PI * 2,
        });
    }

    // Swans
    menuEntities.swans = [];
    for (let i = 0; i < 2; i++) {
        menuEntities.swans.push({
            x: w * 0.25 + i * w * 0.45,
            y: by + 28 + i * 18,
            speed: 5 + Math.random() * 8,
            dir: i === 0 ? 1 : -1,
            neckPhase: Math.random() * Math.PI * 2,
            bobPhase: Math.random() * Math.PI * 2,
        });
    }

    // Floating particles (poster scraps / leaves)
    menuEntities.particles = [];
    const colors = ['#C08060','#D0A070','#A06040','#E8C8A0','#C60C30','#005DAA','#2E8B57','#F2C300'];
    for (let i = 0; i < 15; i++) {
        menuEntities.particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: -8 + Math.random() * 16,
            vy: 6 + Math.random() * 12,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 2,
            size: 2 + Math.random() * 3.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 0.12 + Math.random() * 0.18,
            swayPhase: Math.random() * Math.PI * 2,
        });
    }

    initMenuWindows();
}

function initMenuWindows() {
    const w = window.innerWidth, h = window.innerHeight;
    const by = h * 0.68;
    menuEntities.windows = [];
    let bx = 0;
    while (bx < w) {
        const bw = 25 + Math.sin(bx * 0.1) * 15 + 15;
        const bh = 30 + Math.sin(bx * 0.07 + 1) * 25 + 20;
        for (let wy = by - bh; wy < by - 5; wy += 12) {
            for (let wx = bx + 3; wx < bx + bw - 5; wx += 9) {
                menuEntities.windows.push({
                    wx, wy,
                    isLit: ((wx * 7 + wy * 13) % 10) > 3, // deterministic pseudo-random
                    flickerPhase: (wx * 3.7 + wy * 2.3) % (Math.PI * 2),
                    flickerSpeed: 0.3 + ((wx * 5 + wy * 3) % 10) * 0.15,
                    brightness: 0.5 + ((wx * 11 + wy * 7) % 10) * 0.05,
                });
            }
        }
        bx += bw + 1;
    }
}

function updateMenuEntities(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    const by = h * 0.68;

    // Birds
    for (const b of menuEntities.birds) {
        b.x += b.speed * dt;
        b.wingPhase += dt * 8;
        if (b.x > w + 40) { b.x = -40; b.y = 20 + Math.random() * (by * 0.35); }
    }

    // Silhouettes
    for (const s of menuEntities.silhouettes) {
        s.x += s.speed * s.dir * dt;
        s.animPhase += dt * 7;
        if (s.x > w + 60) { s.x = -60; s.partyIndex = Math.floor(Math.random() * PARTIES.length); }
        if (s.x < -60) { s.x = w + 60; s.partyIndex = Math.floor(Math.random() * PARTIES.length); }
    }

    // Cyclists
    for (const cy of menuEntities.cyclists) {
        cy.x += cy.speed * cy.dir * dt;
        cy.wheelPhase += dt * 12;
        if (cy.x > w + 70) cy.x = -70;
        if (cy.x < -70) cy.x = w + 70;
    }

    // Swans
    for (const sw of menuEntities.swans) {
        sw.x += sw.speed * sw.dir * dt;
        sw.neckPhase += dt * 0.8;
        sw.bobPhase += dt * 1.2;
        if (sw.x > w + 40) sw.dir = -1;
        if (sw.x < -40) sw.dir = 1;
    }

    // Particles
    for (const p of menuEntities.particles) {
        p.x += p.vx * dt + Math.sin(menuTime + p.swayPhase) * 6 * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotSpeed * dt;
        if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
        if (p.x > w + 20) p.x = -20;
        if (p.x < -20) p.x = w + 20;
    }
}

// ============== MENU BACKGROUND DRAWING ==============
function drawMenuBackground() {
    const c = menuCtx, w = window.innerWidth, h = window.innerHeight;
    const by = h * 0.68;

    // Sky — dusk gradient
    const sky = c.createLinearGradient(0, 0, 0, by);
    sky.addColorStop(0, '#2A3A5C');
    sky.addColorStop(0.3, '#4A3A5C');
    sky.addColorStop(0.6, '#7A5A60');
    sky.addColorStop(0.85, '#C08060');
    sky.addColorStop(1, '#D8A070');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, by);

    // Sun glow
    const sunX = w * 0.65, sunY = by - 10;
    const sg = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, 200);
    sg.addColorStop(0, 'rgba(255,200,120,0.35)');
    sg.addColorStop(0.4, 'rgba(255,160,80,0.1)');
    sg.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = sg;
    c.fillRect(0, 0, w, by);

    // Twinkling stars
    for (const star of menuEntities.stars) {
        const twinkle = Math.sin(menuTime * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.baseAlpha + twinkle * 0.2;
        if (alpha < 0.05) continue;
        c.fillStyle = `rgba(255,255,240,${alpha.toFixed(2)})`;
        c.beginPath();
        c.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        c.fill();
        // Cross-sparkle for bright stars
        if (alpha > 0.4) {
            c.fillRect(star.x - star.size * 2.5, star.y - 0.4, star.size * 5, 0.8);
            c.fillRect(star.x - 0.4, star.y - star.size * 2.5, 0.8, star.size * 5);
        }
    }

    // Birds
    for (const bird of menuEntities.birds) {
        const s = bird.size;
        c.globalAlpha = 0.3;
        c.strokeStyle = '#2A2A3A';
        c.lineWidth = 1.2 * s;
        const wing = Math.sin(bird.wingPhase) * 5 * s;
        c.beginPath();
        c.moveTo(bird.x - 8*s, bird.y + wing);
        c.quadraticCurveTo(bird.x - 2*s, bird.y - 3*s + wing*0.3, bird.x, bird.y);
        c.quadraticCurveTo(bird.x + 2*s, bird.y - 3*s - wing*0.3, bird.x + 8*s, bird.y - wing);
        c.stroke();
        c.globalAlpha = 1;
    }

    // Skyline silhouettes (buildings only — windows drawn separately)
    c.fillStyle = '#1A1A2A';
    c.globalAlpha = 0.5;
    let bx = 0;
    while (bx < w) {
        const bw = 25 + Math.sin(bx * 0.1) * 15 + 15;
        const bh = 30 + Math.sin(bx * 0.07 + 1) * 25 + 20;
        c.fillRect(bx, by - bh - 5, bw, bh + 5);
        bx += bw + 1;
    }
    // Flickering windows
    for (const win of menuEntities.windows) {
        if (!win.isLit) continue;
        const flicker = Math.sin(menuTime * win.flickerSpeed + win.flickerPhase);
        const alpha = 0.10 + win.brightness * 0.08 + flicker * 0.03;
        c.fillStyle = `rgba(255,220,120,${Math.max(0.02, alpha).toFixed(3)})`;
        c.fillRect(win.wx, win.wy, 4, 6);
    }
    c.globalAlpha = 1;

    // Water
    const waterGrad = c.createLinearGradient(0, by, 0, h);
    waterGrad.addColorStop(0, '#3A5A6A');
    waterGrad.addColorStop(0.3, '#2A4A5A');
    waterGrad.addColorStop(1, '#1A3040');
    c.fillStyle = waterGrad;
    c.fillRect(0, by + 14, w, h - by);

    // Water reflections
    const t = menuTime;
    c.globalAlpha = 0.08;
    c.fillStyle = '#C08060';
    for (let i = 0; i < 30; i++) {
        const rx = ((i * 50 + t * 10) % (w + 40)) - 20;
        const ry = by + 20 + (i % 8) * 16 + Math.sin(t * 1.2 + i) * 3;
        c.fillRect(rx, ry, 15 + Math.sin(t * 0.6 + i) * 5, 1);
    }
    c.globalAlpha = 1;

    // Swans on water
    for (const sw of menuEntities.swans) {
        const bob = Math.sin(sw.bobPhase + menuTime) * 2;
        c.globalAlpha = 0.4;
        // Body
        c.fillStyle = '#fff';
        c.beginPath(); c.ellipse(sw.x, sw.y + bob, 10, 5, 0, 0, Math.PI * 2); c.fill();
        // Wake ripples
        c.globalAlpha = 0.08;
        c.strokeStyle = '#fff'; c.lineWidth = 0.5;
        for (let r = 0; r < 3; r++) {
            c.beginPath();
            c.ellipse(sw.x - (8 + r*6) * sw.dir, sw.y + bob + 2, 4 + r*3, 1.5 + r, 0, 0, Math.PI * 2);
            c.stroke();
        }
        c.globalAlpha = 0.4;
        // Neck
        const neckSway = Math.sin(sw.neckPhase + menuTime * 0.8) * 1.5;
        c.strokeStyle = '#fff'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(sw.x + 6 * sw.dir, sw.y - 3 + bob);
        c.quadraticCurveTo(sw.x + (12 + neckSway) * sw.dir, sw.y - 14 + bob, sw.x + 8 * sw.dir, sw.y - 16 + bob);
        c.stroke();
        // Head
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(sw.x + 8 * sw.dir, sw.y - 17 + bob, 2.5, 0, Math.PI * 2); c.fill();
        // Beak
        c.fillStyle = '#E88030';
        c.fillRect(sw.x + (10 + neckSway * 0.3) * sw.dir, sw.y - 18 + bob, 3 * sw.dir, 2);
        c.globalAlpha = 1;
    }

    // Bridge
    c.fillStyle = '#5A5850';
    c.fillRect(0, by - 2, w, 16);
    c.fillStyle = '#8A8878';
    c.fillRect(0, by - 14, w, 12);
    c.fillStyle = '#9A9888';
    c.fillRect(0, by - 15, w, 2);
    for (let px = 20; px < w; px += 40) {
        c.fillStyle = '#7A7868';
        c.fillRect(px, by - 14, 3, 12);
    }

    // Silhouettes on bridge (people running with posters)
    for (const s of menuEntities.silhouettes) {
        const x = s.x, baseY = by - 2;
        const sc = s.scale;
        const party = PARTIES[s.partyIndex];
        const legKick = Math.sin(s.animPhase) * 3 * sc;
        c.globalAlpha = 0.35 * sc;
        c.fillStyle = '#1A1A2A';
        // Legs
        c.fillRect(x - 3*sc, baseY - 3 + legKick, 2*sc, 6*sc);
        c.fillRect(x + 1*sc, baseY - 3 - legKick, 2*sc, 6*sc);
        // Body
        c.fillRect(x - 5*sc, baseY - 13*sc, 10*sc, 11*sc);
        // Head
        c.beginPath(); c.arc(x, baseY - 17*sc, 4*sc, 0, Math.PI * 2); c.fill();
        // Poster carried
        c.save();
        c.translate(x + 8*sc * s.dir, baseY - 8*sc);
        c.rotate(0.2 * s.dir);
        c.fillStyle = party.bg;
        c.globalAlpha = 0.3 * sc;
        c.fillRect(-4*sc, -10*sc, 8*sc, 14*sc);
        // Party letter on poster
        c.fillStyle = party.text;
        c.globalAlpha = 0.25 * sc;
        c.font = `bold ${Math.round(7*sc)}px Arial`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(party.letter, 0, -3*sc);
        c.restore();
        c.globalAlpha = 1;
    }

    // Cyclists on bridge
    for (const cy of menuEntities.cyclists) {
        const x = cy.x, baseY = by - 2;
        c.globalAlpha = 0.25;
        c.fillStyle = '#1A1A2A';
        // Body
        c.fillRect(x - 3, baseY - 12, 6, 8);
        // Head
        c.beginPath(); c.arc(x, baseY - 16, 3, 0, Math.PI * 2); c.fill();
        // Wheels
        c.strokeStyle = '#1A1A2A'; c.lineWidth = 1;
        const rw = 5;
        c.beginPath(); c.arc(x - 8 * cy.dir, baseY, rw, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(x + 8 * cy.dir, baseY, rw, 0, Math.PI * 2); c.stroke();
        // Spokes
        const sa = cy.wheelPhase;
        for (let spoke = 0; spoke < 2; spoke++) {
            const a = sa + spoke * Math.PI;
            c.beginPath();
            c.moveTo(x - 8*cy.dir + Math.cos(a)*rw*0.8, baseY + Math.sin(a)*rw*0.8);
            c.lineTo(x - 8*cy.dir - Math.cos(a)*rw*0.8, baseY - Math.sin(a)*rw*0.8);
            c.stroke();
        }
        c.globalAlpha = 1;
    }

    // Floating particles
    for (const p of menuEntities.particles) {
        c.save();
        c.globalAlpha = p.alpha;
        c.translate(p.x, p.y);
        c.rotate(p.rotation);
        c.fillStyle = p.color;
        c.fillRect(-p.size/2, -p.size*0.7, p.size, p.size * 1.4);
        c.restore();
    }

    // Lamp posts with pulsing glow
    const lpX = w * 0.12;
    const glowPulse1 = 1 + Math.sin(menuTime * 1.5) * 0.15;
    const glowAlpha1 = 0.15 + Math.sin(menuTime * 1.5) * 0.05;
    c.fillStyle = '#6A5420';
    c.fillRect(lpX - 3, by - 170, 6, 170);
    c.fillStyle = 'rgba(255,220,140,0.25)';
    c.beginPath(); c.arc(lpX, by - 175, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,240,200,0.12)';
    c.beginPath(); c.arc(lpX, by - 175, 7, 0, Math.PI * 2); c.fill();
    const glGrad = c.createRadialGradient(lpX, by - 175, 0, lpX, by - 175, 60 * glowPulse1);
    glGrad.addColorStop(0, `rgba(255,220,140,${glowAlpha1.toFixed(2)})`);
    glGrad.addColorStop(1, 'rgba(255,220,140,0)');
    c.fillStyle = glGrad;
    c.beginPath(); c.arc(lpX, by - 175, 60 * glowPulse1, 0, Math.PI * 2); c.fill();
    // Empty poster slots
    for (let i = 0; i < 4; i++) {
        const py = by - 40 - i * 32;
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        c.lineWidth = 1;
        c.setLineDash([3, 3]);
        c.strokeRect(lpX + 8, py - 14, 22, 28);
        c.setLineDash([]);
    }

    // Right lamp post
    const rX = w * 0.88;
    const glowPulse2 = 1 + Math.sin(menuTime * 1.5 + 1.0) * 0.15;
    const glowAlpha2 = 0.12 + Math.sin(menuTime * 1.5 + 1.0) * 0.04;
    c.fillStyle = '#6A5420';
    c.fillRect(rX - 3, by - 150, 6, 150);
    c.fillStyle = 'rgba(255,220,140,0.2)';
    c.beginPath(); c.arc(rX, by - 155, 10, 0, Math.PI * 2); c.fill();
    const glGrad2 = c.createRadialGradient(rX, by - 155, 0, rX, by - 155, 50 * glowPulse2);
    glGrad2.addColorStop(0, `rgba(255,220,140,${glowAlpha2.toFixed(2)})`);
    glGrad2.addColorStop(1, 'rgba(255,220,140,0)');
    c.fillStyle = glGrad2;
    c.beginPath(); c.arc(rX, by - 155, 50 * glowPulse2, 0, Math.PI * 2); c.fill();

    // Warm overlay
    c.fillStyle = 'rgba(180,120,60,0.06)';
    c.fillRect(0, 0, w, h);

    // Vignette
    const vig = c.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = vig;
    c.fillRect(0, 0, w, h);
}

// ============== MENU MUSIC — Copenhagen Evening Jazz ==============
function startMenuMusic() {
    if (menuMusicNodes) return;
    try {
        const ac = getAudioCtx();
        const master = ac.createGain();
        master.gain.value = 0.05;
        master.connect(ac.destination);

        // Lo-fi warmth filter
        const warmFilt = ac.createBiquadFilter();
        warmFilt.type = 'lowpass'; warmFilt.frequency.value = 2500; warmFilt.Q.value = 0.4;
        warmFilt.connect(master);

        // === Warm Pad (held chords) ===
        const padG = ac.createGain(); padG.gain.value = 0.12;
        const padFilt = ac.createBiquadFilter(); padFilt.type = 'lowpass'; padFilt.frequency.value = 800; padFilt.Q.value = 0.5;
        padG.connect(padFilt); padFilt.connect(warmFilt);

        // Chord progression: Cmaj7 → Am7 → Fmaj7 → G7
        const chords = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj7
            [220.00, 261.63, 329.63, 392.00], // Am7
            [174.61, 220.00, 261.63, 329.63], // Fmaj7
            [196.00, 246.94, 293.66, 349.23], // G7
        ];
        const bpm = 72;
        const beatTime = 60 / bpm;
        const barTime = beatTime * 4;

        // Create 4 pad oscillators (one per chord tone)
        const padOscs = [];
        for (let v = 0; v < 4; v++) {
            const osc = ac.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = chords[0][v];
            osc.detune.value = [-6, 8, -3, 5][v];
            osc.connect(padG);
            osc.start();
            padOscs.push(osc);
        }

        // Schedule chord changes
        const startTime = ac.currentTime + 0.1;
        for (let bar = 0; bar < 50; bar++) {
            const chord = chords[bar % 4];
            const t = startTime + bar * barTime;
            for (let v = 0; v < 4; v++) {
                padOscs[v].frequency.setValueAtTime(chord[v], t);
            }
        }

        // === Walking Bass ===
        const bassG = ac.createGain(); bassG.gain.value = 0.15;
        const bassFilt = ac.createBiquadFilter(); bassFilt.type = 'lowpass'; bassFilt.frequency.value = 300;
        bassG.connect(bassFilt); bassFilt.connect(warmFilt);

        const bassLines = [
            [65.41, 82.41, 98.00, 110.00],  // C2 E2 G2 A2
            [55.00, 65.41, 82.41, 98.00],    // A1 C2 E2 G2
            [87.31, 110.00, 65.41, 73.42],   // F2 A2 C2 D2
            [98.00, 123.47, 73.42, 87.31],   // G2 B2 D2 F2
        ];

        for (let bar = 0; bar < 50; bar++) {
            const line = bassLines[bar % 4];
            for (let beat = 0; beat < 4; beat++) {
                const t = startTime + bar * barTime + beat * beatTime;
                const bassOsc = ac.createOscillator();
                bassOsc.type = 'triangle';
                bassOsc.frequency.value = line[beat];
                const bg = ac.createGain();
                bg.gain.setValueAtTime(0.15, t);
                bg.gain.exponentialRampToValueAtTime(0.001, t + beatTime * 0.85);
                bassOsc.connect(bg); bg.connect(bassG);
                bassOsc.start(t); bassOsc.stop(t + beatTime);
            }
        }

        // === Brush texture (soft noise on each beat) ===
        const brushBuf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
        const bd = brushBuf.getChannelData(0);
        for (let i = 0; i < bd.length; i++) {
            const t2 = i / ac.sampleRate;
            bd[i] = (Math.random() * 2 - 1) * Math.exp(-t2 * 50) * 0.15;
        }

        for (let bar = 0; bar < 50; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                const t = startTime + bar * barTime + beat * beatTime;
                const src = ac.createBufferSource(); src.buffer = brushBuf;
                const bg = ac.createGain();
                bg.gain.value = (beat === 1 || beat === 3) ? 0.06 : 0.03;
                src.connect(bg); bg.connect(warmFilt);
                src.start(t);
            }
        }

        // === Rhodes-like stabs on beats 2 & 4 ===
        for (let bar = 0; bar < 50; bar++) {
            const chord = chords[bar % 4];
            for (let beat of [1, 3]) {
                const t = startTime + bar * barTime + beat * beatTime;
                for (let v = 0; v < 3; v++) {
                    const osc = ac.createOscillator();
                    osc.type = v === 0 ? 'sine' : 'triangle';
                    osc.frequency.value = chord[v] * 2; // octave up
                    osc.detune.value = [-5, 7, 3][v];
                    const g = ac.createGain();
                    g.gain.setValueAtTime(0.03, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                    osc.connect(g); g.connect(warmFilt);
                    osc.start(t); osc.stop(t + 0.4);
                }
            }
        }

        menuMusicNodes = { master, padOscs, padG, padFilt, warmFilt };
    } catch(e) { console.warn('Menu music failed:', e); }
}

function stopMenuMusic() {
    if (!menuMusicNodes) return;
    try {
        const ac = getAudioCtx();
        menuMusicNodes.master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
        const nodes = menuMusicNodes;
        setTimeout(() => {
            try { nodes.padOscs.forEach(o => o.stop()); } catch(e) {}
        }, 600);
    } catch(e) {}
    menuMusicNodes = null;
}

// ============== MENU ANIMATION LOOP ==============
function startMenuAnimation() {
    menuTime = 0;
    menuLastTs = performance.now();
    function loop(ts) {
        if (gameState !== GameState.MENU) return;
        const dt = Math.min((ts - menuLastTs) / 1000, 0.05);
        menuLastTs = ts;
        menuTime += dt;
        updateMenuEntities(dt);
        drawMenuBackground();
        menuAnimId = requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

function stopMenuAnimation() {
    if (menuAnimId) { cancelAnimationFrame(menuAnimId); menuAnimId = null; }
}

// ============== PARTY SELECTION ==============
function buildPartyGrid() {
    const grid = document.getElementById('party-grid');
    grid.innerHTML = '';
    PARTIES.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'party-card';
        card.style.backgroundColor = p.bg;
        card.style.color = p.text;
        card.innerHTML = `<span class="party-letter">${p.letter}</span><span class="party-name">${p.name}</span>`;
        card.addEventListener('mouseenter', () => document.getElementById('party-tooltip').textContent = `Spil som frivillig for ${p.name}`);
        card.addEventListener('mouseleave', () => document.getElementById('party-tooltip').textContent = '');
        card.addEventListener('click', () => {
            document.querySelectorAll('.party-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedPartyIndex = i;
            document.getElementById('start-btn').disabled = false;
            document.getElementById('selected-party-text').textContent = `Du spiller som ${p.name}.`;
        });
        grid.appendChild(card);
    });
}

// ============== COUNTDOWN ==============
function startCountdown() {
    gameState = GameState.COUNTDOWN;
    stopMenuAnimation();
    stopMenuMusic();
    showScreen('countdown-screen');
    const el = document.getElementById('countdown-number');
    el.textContent = '3'; el.style.color = '#fff';
    playCountdownBeep();
    let c = 3;
    const iv = setInterval(() => {
        c--;
        if (c > 0) { el.textContent = c; playCountdownBeep(); }
        else if (c === 0) { el.textContent = 'Start!'; el.style.color = '#2ecc71'; playStartHorn(); }
        else { clearInterval(iv); el.style.color = '#fff'; startGame(); }
    }, 1000);
}

function startGame() {
    initGame();
    gameState = GameState.PLAYING;
    showScreen(null);
    document.getElementById('game-hud').classList.remove('hidden');
    const p = PARTIES[selectedPartyIndex];
    const ind = document.getElementById('hud-party-indicator');
    ind.style.backgroundColor = p.bg; ind.style.color = p.text; ind.textContent = p.letter;
    shownClimbHint = false; climbHintTimer = 0;
    removeWarningActive = false; removeWarningTimer = 0;
    activeEvent = null; eventsThisRun = 0; eventCooldown = 0;
    // Pre-schedule exactly 2 events with guaranteed timing
    const firstTime = GAME_DURATION - (12 + Math.random() * 10); // 12-22s in (gameTime ~48-38)
    const secondTime = firstTime - (12 + Math.random() * 8);     // 12-20s after first
    scheduledEventTimes = [firstTime, secondTime].filter(t => t > 5); // must leave 5s before end
    // Ensure we always have 2 events
    if (scheduledEventTimes.length < 2) {
        scheduledEventTimes = [GAME_DURATION - 15, GAME_DURATION - 35];
    }
    nextEventTime = scheduledEventTimes.shift();
    startAmbientSound();
    startBgMusic();
    lastTimestamp = performance.now();
    requestAnimationFrame(gameLoop);
}

// ============== SPICE EVENT SYSTEM ==============
function updateSpiceEvents(dt) {
    // Active event countdown
    if (activeEvent) {
        activeEvent.timer -= dt;

        // UFO animation update
        if (activeEvent.id === 'ufo') {
            updateUfoEvent(dt);
        }

        if (activeEvent.timer <= 0) {
            activeEvent = null; // event ends
        }
        return; // only one event at a time
    }

    // Check if it's time for a new event (exactly 2 per run)
    if (eventsThisRun >= 2) return;
    if (gameTime > nextEventTime) return; // not yet

    // Trigger event
    const pool = SPICE_EVENTS.slice();
    const picked = pool[Math.floor(Math.random() * pool.length)];
    activeEvent = {
        id: picked.id,
        text: picked.text,
        icon: picked.icon,
        duration: picked.duration,
        timer: picked.duration,
    };

    // Tourist event: pick a random lamp post near the player
    if (picked.id === 'tourist') {
        let nearest = 0, nd = Infinity;
        lampPosts.forEach((lp, i) => { const d = Math.abs(lp.worldX - player.worldX); if (d < nd) { nd = d; nearest = i; } });
        activeEvent.postIndex = nearest;
    }

    // UFO event: pick a random occupied poster to steal
    if (picked.id === 'ufo') {
        initUfoEvent();
    }

    eventsThisRun++;
    // Schedule next event from pre-scheduled times
    if (scheduledEventTimes.length > 0) {
        nextEventTime = scheduledEventTimes.shift();
    }

    // Play a subtle notification sound
    playTone(350, 0.15, 'sine', 0.08);
    setTimeout(() => playTone(450, 0.12, 'sine', 0.06), 100);
}

// ============== UFO EVENT ==============
function initUfoEvent() {
    // Find all occupied poster slots
    const occupied = [];
    lampPosts.forEach((lp, pi) => {
        lp.slots.forEach((s, si) => {
            if (s !== null) occupied.push({ postIndex: pi, slotIndex: si, partyIndex: s });
        });
    });

    if (occupied.length === 0) {
        // No posters to steal — downgrade to wind event
        activeEvent.id = 'wind';
        activeEvent.text = 'Vindstød!';
        activeEvent.icon = '💨';
        activeEvent.duration = 4;
        activeEvent.timer = 4;
        return;
    }

    const target = occupied[Math.floor(Math.random() * occupied.length)];
    const post = lampPosts[target.postIndex];
    activeEvent.postIndex = target.postIndex;
    activeEvent.slotIndex = target.slotIndex;
    activeEvent.stolenParty = target.partyIndex;
    activeEvent.ufoPhase = 'descend'; // descend → grab → ascend
    activeEvent.ufoX = post.worldX;
    activeEvent.ufoY = -80; // start above screen
    activeEvent.grabY = bridgeY() - post.slotHeights[target.slotIndex] - 10;
    activeEvent.posterGrabbed = false;

    // UFO descend sound — eerie
    playTone(200, 0.3, 'sine', 0.1);
    setTimeout(() => playTone(250, 0.3, 'sine', 0.08), 150);
    setTimeout(() => playTone(180, 0.4, 'sine', 0.06), 300);
}

function updateUfoEvent(dt) {
    if (!activeEvent || activeEvent.id !== 'ufo') return;

    const speed = 120; // pixels per second
    if (activeEvent.ufoPhase === 'descend') {
        activeEvent.ufoY += speed * dt;
        if (activeEvent.ufoY >= activeEvent.grabY) {
            activeEvent.ufoY = activeEvent.grabY;
            activeEvent.ufoPhase = 'grab';
            // Actually steal the poster
            const post = lampPosts[activeEvent.postIndex];
            post.slots[activeEvent.slotIndex] = null;
            activeEvent.posterGrabbed = true;
            // Grab sound
            playTone(600, 0.1, 'square', 0.1);
            setTimeout(() => playTone(800, 0.1, 'square', 0.08), 80);
        }
    } else if (activeEvent.ufoPhase === 'grab') {
        // Brief pause at grab point, then ascend
        activeEvent.ufoPhase = 'ascend';
    } else if (activeEvent.ufoPhase === 'ascend') {
        activeEvent.ufoY -= speed * 1.5 * dt;
    }
}

function drawUfoEvent() {
    if (!activeEvent || activeEvent.id !== 'ufo') return;

    const sx = wx(activeEvent.ufoX);
    const uy = activeEvent.ufoY;
    const by = bridgeY();

    if (sx < -150 || sx > logicalWidth + 150) return;

    // Tractor beam (from UFO down to target poster)
    if (activeEvent.ufoPhase === 'descend' || activeEvent.ufoPhase === 'grab') {
        const beamBottom = by - lampPosts[activeEvent.postIndex].slotHeights[activeEvent.slotIndex];
        const beamGrad = ctx.createLinearGradient(0, uy + 10, 0, beamBottom);
        beamGrad.addColorStop(0, 'rgba(120, 255, 120, 0.35)');
        beamGrad.addColorStop(0.5, 'rgba(120, 255, 120, 0.15)');
        beamGrad.addColorStop(1, 'rgba(120, 255, 120, 0.05)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(sx - 6, uy + 10);
        ctx.lineTo(sx - 18, beamBottom);
        ctx.lineTo(sx + 18, beamBottom);
        ctx.lineTo(sx + 6, uy + 10);
        ctx.closePath();
        ctx.fill();

        // Beam sparkles
        const t = performance.now() * 0.005;
        ctx.fillStyle = 'rgba(180, 255, 180, 0.6)';
        for (let i = 0; i < 5; i++) {
            const sparkY = uy + 15 + ((t * 40 + i * 50) % (beamBottom - uy - 15));
            const sparkX = sx + Math.sin(t + i * 2) * 8;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // UFO body — classic flying saucer
    ctx.save();
    const wobble = Math.sin(performance.now() * 0.004) * 2;

    // Dome (glass top)
    const domeGrad = ctx.createRadialGradient(sx, uy - 6 + wobble, 2, sx, uy - 4 + wobble, 10);
    domeGrad.addColorStop(0, 'rgba(200, 255, 200, 0.8)');
    domeGrad.addColorStop(1, 'rgba(100, 200, 100, 0.3)');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.ellipse(sx, uy - 4 + wobble, 10, 8, 0, Math.PI, 0);
    ctx.fill();

    // Main disc body
    const discGrad = ctx.createLinearGradient(sx - 22, uy + wobble, sx + 22, uy + wobble);
    discGrad.addColorStop(0, '#888');
    discGrad.addColorStop(0.3, '#CCC');
    discGrad.addColorStop(0.5, '#EEE');
    discGrad.addColorStop(0.7, '#CCC');
    discGrad.addColorStop(1, '#888');
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.ellipse(sx, uy + 2 + wobble, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Disc rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, uy + 1 + wobble, 21, 5, 0, Math.PI + 0.3, Math.PI * 2 - 0.3);
    ctx.stroke();

    // Blinking lights around rim
    const lightCount = 6;
    for (let i = 0; i < lightCount; i++) {
        const angle = (i / lightCount) * Math.PI * 2 + performance.now() * 0.003;
        const lx = sx + Math.cos(angle) * 18;
        const ly = uy + 2 + wobble + Math.sin(angle) * 4;
        const brightness = Math.sin(performance.now() * 0.01 + i * 1.2) > 0;
        ctx.fillStyle = brightness ? '#0F0' : '#0A0';
        ctx.beginPath();
        ctx.arc(lx, ly, 2, 0, Math.PI * 2);
        ctx.fill();
        if (brightness) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(lx, ly, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Bottom glow
    ctx.fillStyle = 'rgba(120, 255, 120, 0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, uy + 8 + wobble, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // If poster grabbed, draw it dangling below UFO
    if (activeEvent.posterGrabbed && activeEvent.stolenParty !== null) {
        const party = PARTIES[activeEvent.stolenParty];
        const posterY = uy + 14 + wobble;
        // Poster rectangle
        ctx.fillStyle = party.bg;
        ctx.fillRect(sx - 6, posterY, 12, 16);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx - 6, posterY, 12, 16);
        // Party letter
        ctx.fillStyle = party.text;
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(party.letter, sx, posterY + 8);
    }

    ctx.restore();
}

function isEventActive(eventId) {
    return activeEvent && activeEvent.id === eventId;
}

// Get event modifiers for player actions
function getEventHangTimeMultiplier() {
    if (isEventActive('zipties')) return 2.0;   // hanging takes 2x as long
    if (isEventActive('paperjam')) return 1.8;   // slight delay
    return 1.0;
}

function getEventWindDrift() {
    if (isEventActive('wind') && player.state === 'climbing') {
        return (Math.sin(performance.now() * 0.003) * 4.0); // strong gusts while climbing
    }
    return 0;
}

// Wind also increases fall chance — checked in player update
function getEventFallChanceBonus() {
    if (isEventActive('wind')) return 0.006; // significantly more dangerous
    return 0;
}

function isPostBlockedByTourist(postIndex) {
    return isEventActive('tourist') && activeEvent.postIndex === postIndex;
}

function isPlacingBlockedByPolice() {
    return isEventActive('police');
}

function drawSpiceEventBanner() {
    if (!activeEvent) return;
    const cx = logicalWidth / 2;
    const progress = activeEvent.timer / activeEvent.duration;
    const by = bridgeY();

    // === Draw event-specific visuals in game world ===

    if (activeEvent.id === 'tourist' && activeEvent.postIndex !== undefined) {
        // Draw a tourist standing at the blocked lamp post
        const post = lampPosts[activeEvent.postIndex];
        const sx = wx(post.worldX);
        if (sx > -100 && sx < logicalWidth + 100) {
            const ty = by - 2;
            // Tourist body (bright tourist clothes)
            ctx.fillStyle = '#E8C840'; // yellow jacket
            ctx.fillRect(sx + 12, ty - 16, 8, 12);
            // Head
            ctx.fillStyle = '#F5C6A0';
            ctx.beginPath(); ctx.arc(sx + 16, ty - 20, 4, 0, Math.PI * 2); ctx.fill();
            // Sun hat
            ctx.fillStyle = '#E8C840';
            ctx.fillRect(sx + 10, ty - 25, 12, 3);
            // Camera (held up, taking photo)
            ctx.fillStyle = '#333';
            ctx.fillRect(sx + 20, ty - 18, 6, 4);
            ctx.fillStyle = '#666';
            ctx.beginPath(); ctx.arc(sx + 24, ty - 16, 1.5, 0, Math.PI * 2); ctx.fill();
            // Flash blink
            if (Math.sin(performance.now() * 0.008) > 0.7) {
                ctx.fillStyle = 'rgba(255,255,200,0.6)';
                ctx.beginPath(); ctx.arc(sx + 25, ty - 17, 5, 0, Math.PI * 2); ctx.fill();
            }
            // Legs
            ctx.fillStyle = '#4A7A4A';
            ctx.fillRect(sx + 13, ty - 4, 3, 7);
            ctx.fillRect(sx + 17, ty - 4, 3, 7);
            // "Blocked" indicator — red circle with line
            ctx.strokeStyle = 'rgba(231,76,60,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(sx, by - POLE_HEIGHT * 0.3, 18, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx - 12, by - POLE_HEIGHT * 0.3 - 12); ctx.lineTo(sx + 12, by - POLE_HEIGHT * 0.3 + 12); ctx.stroke();
        }
    }

    if (activeEvent.id === 'police') {
        // Draw a kommune worker walking across the bridge near the player
        const px = wx(player.worldX) + 40 + Math.sin(performance.now() * 0.002) * 20;
        const py = by - 2;
        // Body (reflective vest)
        ctx.fillStyle = '#FF8C00';
        ctx.fillRect(px - 4, py - 16, 8, 12);
        // Reflective stripes
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(px - 4, py - 12, 8, 2);
        ctx.fillRect(px - 4, py - 8, 8, 2);
        // Head with hard hat
        ctx.fillStyle = '#E8B88A';
        ctx.beginPath(); ctx.arc(px, py - 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(px - 5, py - 25, 10, 3); // hard hat
        // Legs
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(px - 3, py - 4, 3, 7);
        ctx.fillRect(px + 1, py - 4, 3, 7);
        // Clipboard
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(px + 5, py - 14, 4, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 5.5, py - 13, 3, 4);
    }

    if (activeEvent.id === 'wind') {
        // Draw wind streaks across screen
        ctx.save();
        ctx.strokeStyle = 'rgba(200,220,255,0.3)';
        ctx.lineWidth = 1.5;
        const t = performance.now() * 0.003;
        for (let i = 0; i < 8; i++) {
            const wy = 80 + i * 50 + Math.sin(t + i) * 20;
            const wxStart = (t * 200 + i * 170) % (logicalWidth + 200) - 100;
            ctx.beginPath();
            ctx.moveTo(wxStart, wy);
            ctx.quadraticCurveTo(wxStart + 40, wy - 8, wxStart + 80, wy);
            ctx.quadraticCurveTo(wxStart + 120, wy + 8, wxStart + 160, wy);
            ctx.stroke();
        }
        ctx.restore();
    }

    if (activeEvent.id === 'ufo') {
        drawUfoEvent();
    }

    // === Banner overlay ===
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const bw = 320, bh = 44;
    const bx = cx - bw/2, byy = 60;
    ctx.beginPath();
    ctx.roundRect(bx, byy, bw, bh, 8);
    ctx.fill();

    // Progress bar
    ctx.fillStyle = 'rgba(255,180,60,0.5)';
    ctx.beginPath();
    ctx.roundRect(bx + 4, byy + bh - 8, (bw - 8) * progress, 4, 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#FFD080';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${activeEvent.icon}  ${activeEvent.text}`, cx, byy + bh/2 - 2);
    ctx.restore();
}

// ============== MAIN LOOP ==============
function gameLoop(ts) {
    if (gameState !== GameState.PLAYING) return;
    const dt = Math.min((ts - lastTimestamp) / 1000, 0.05);
    lastTimestamp = ts;
    gameTime -= dt;
    if (gameTime <= 0) { gameTime = 0; stopAmbientSound(); stopBgMusic(); showResults(); return; }
    if (timeBonusFlash > 0) timeBonusFlash -= dt * 2;

    updateSpiceEvents(dt);
    player.update(dt);
    npcs.forEach(n => n.update(dt));
    backgroundEntities.forEach(b => b.update(dt));
    birds.forEach(b => b.update(dt));
    updateSpeechBubbles(dt);
    updateParticles(dt);
    updateAmbientTimers(dt);
    updateBgMusic();

    // Camera follows player horizontally
    const targetCam = player.worldX;
    cameraX += (targetCam - cameraX) * 0.07;

    draw();
    updateHUD();
    requestAnimationFrame(gameLoop);
}

function draw() {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    drawWorld();

    // Draw all entities sorted by worldX for overlap
    const drawables = [];
    backgroundEntities.forEach(b => drawables.push({ x: b.worldX, z: -1, draw: () => b.draw() }));
    lampPosts.forEach(lp => drawables.push({ x: lp.worldX, z: 0, draw: () => lp.draw() }));
    drawables.push({ x: player.worldX, z: 1, draw: () => player.draw() });
    npcs.forEach(n => drawables.push({ x: n.worldX, z: 1, draw: () => n.draw() }));

    drawables.sort((a, b) => a.z - b.z || a.x - b.x);
    drawables.forEach(d => d.draw());

    drawSpeechBubbles();
    drawParticles();

    if (player.state === 'climbing' || player.state === 'hanging') drawClimbingIndicator();

    // First-time climb hint
    if (climbHintTimer > 0) {
        ctx.globalAlpha = Math.min(1, climbHintTimer / 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const hintW = 260, hintH = 36;
        const hx = logicalWidth / 2 - hintW / 2, hy = logicalHeight * 0.25;
        roundRect(ctx, hx, hy, hintW, hintH, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Hold ↓ for at kravle ned sikkert', logicalWidth / 2, hy + hintH / 2);
        ctx.globalAlpha = 1;
    }

    // Remove warning overlay
    if (removeWarningActive && removeWarningTimer > 0) {
        const prog = removeWarningTimer / 1.5;
        // Red glow on screen edges
        ctx.fillStyle = `rgba(231,76,60,${0.15 + prog * 0.2})`;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        // Warning text
        ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Tryk [R] for at rive ned (taber spillet)', logicalWidth / 2, logicalHeight * 0.20);
        // Progress bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(logicalWidth/2 - 80, logicalHeight * 0.20 + 14, 160, 6);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(logicalWidth/2 - 80, logicalHeight * 0.20 + 14, 160 * prog, 6);
    }

    // Spice event banner
    drawSpiceEventBanner();

    // Global warm light overlay (dusk atmosphere)
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#FFD080';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.globalAlpha = 1;

    // Subtle vignette
    const vigGrad = ctx.createRadialGradient(logicalWidth/2, logicalHeight/2, logicalHeight*0.4, logicalWidth/2, logicalHeight/2, logicalHeight*0.9);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // Proximity hint
    if (player.state === 'idle' || player.state === 'running') {
        const np = player.findNearPost();
        if (np && np.hasEmptySlot()) {
            const sx = wx(np.worldX);
            ctx.globalAlpha = 0.5 + Math.sin(Date.now()*0.005)*0.3;
            ctx.fillStyle = '#fff'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
            ctx.fillText('↑ Klatr', sx, bridgeY() + 18);
            ctx.globalAlpha = 1;
        }
    }
}

function updateHUD() {
    const te = document.getElementById('hud-time');
    const dt = Math.ceil(gameTime);
    te.textContent = dt;
    te.classList.remove('warning','critical');
    if (dt <= 10) te.classList.add('critical');
    else if (dt <= 30) te.classList.add('warning');
    document.getElementById('hud-score').textContent = player.score;
}

// ============== INPUT ==============
function setupInput() {
    window.addEventListener('keydown', e => {
        keys[e.key] = true;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        if (!audioCtx) getAudioCtx();
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
}

// ============== CANVAS ==============
function setupCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        logicalWidth = window.innerWidth;
        logicalHeight = window.innerHeight;
        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;
        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = logicalHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
}

// ============== UI ==============
function setupUI() {
    buildPartyGrid();
    document.getElementById('start-btn').addEventListener('click', () => { if (selectedPartyIndex >= 0) startCountdown(); });
    document.getElementById('disqualified-restart').addEventListener('click', resetToMenu);
    document.getElementById('results-restart').addEventListener('click', resetToMenu);
    document.getElementById('results-screenshot').addEventListener('click', downloadScreenshot);
    document.getElementById('results-share').addEventListener('click', shareResult);
    // Start menu music on first interaction (AudioContext policy)
    function tryStartMenuMusic() {
        if (!menuMusicNodes && gameState === GameState.MENU) {
            startMenuMusic();
            document.removeEventListener('click', tryStartMenuMusic);
            document.removeEventListener('keydown', tryStartMenuMusic);
            document.removeEventListener('touchstart', tryStartMenuMusic);
        }
    }
    document.addEventListener('click', tryStartMenuMusic);
    document.addEventListener('keydown', tryStartMenuMusic);
    document.addEventListener('touchstart', tryStartMenuMusic);
}

function resetToMenu() {
    gameState = GameState.MENU;
    stopAmbientSound(); stopBgMusic();
    showScreen('menu-screen');
    document.getElementById('game-hud').classList.add('hidden');
    selectedPartyIndex = -1;
    document.querySelectorAll('.party-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('start-btn').disabled = true;
    document.getElementById('selected-party-text').textContent = '';
    keys = {};
    initMenuEntities();
    startMenuAnimation();
    startMenuMusic(); // AudioContext already unlocked from previous interaction
    // Re-trigger CSS entrance animations
    const content = document.querySelector('.menu-content');
    content.style.animation = 'none';
    content.offsetHeight; // force reflow
    content.style.animation = '';
    // Re-trigger individual element animations
    ['.game-subtitle', '.menu-instruction', '.party-grid', '.start-btn'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) { el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; }
    });
}

// ============== BOOT ==============
window.addEventListener('DOMContentLoaded', () => { setupCanvas(); setupMenuCanvas(); setupInput(); setupUI(); startMenuAnimation(); });
