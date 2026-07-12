type ToneEvent = {
    type: 'tone'
    freq: number
    start: number
    duration: number
    gain?: number
    waveform?: OscillatorType
    reverb?: number
}

type NoiseEvent = {
    type: 'noise'
    start: number
    duration: number
    gain?: number
    filterFreq?: number
    filterQ?: number
    filterType?: BiquadFilterType
    reverb?: number
}

type SweepEvent = {
    type: 'sweep'
    startFreq: number
    endFreq: number
    start: number
    duration: number
    gain?: number
    waveform?: OscillatorType
    reverb?: number
}

type ChimeEvent = ToneEvent | NoiseEvent | SweepEvent

const tones = (freqs: number[], opts?: { gap?: number; duration?: number; gain?: number; waveform?: OscillatorType; reverb?: number }): ToneEvent[] => {
    const gap = opts?.gap ?? 0.09
    const duration = opts?.duration ?? (freqs.length === 1 ? 0.16 : 0.34)
    const gain = opts?.gain ?? 0.13
    const reverb = opts?.reverb ?? 0.2
    return freqs.map((freq, i) => ({ type: 'tone', freq, start: i * gap, duration, gain, waveform: opts?.waveform ?? 'triangle', reverb }))
}

// note references (equal temperament)
const A3 = 220.0, B3 = 246.94
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0, B4 = 493.88
const C5 = 523.25, E5 = 659.25, G5 = 783.99

const CHIMES: Record<string, ChimeEvent[]> = {
    join: tones([C5, E5, G5], { gap: 0.085, duration: 0.36, gain: 0.14, reverb: 0.22 }),
    leave: tones([G5, E5, C5], { gap: 0.09, duration: 0.34, gain: 0.12, reverb: 0.22 }),

    end: tones([G4, D4, C4], { gap: 0.12, duration: 0.4, gain: 0.13, reverb: 0.32 }),

    mute: [
        { type: 'noise', start: 0, duration: 0.015, gain: 0.06, filterFreq: 1400, filterQ: 1.1, filterType: 'bandpass', reverb: 0.1 },
        { type: 'sweep', startFreq: 500, endFreq: 280, start: 0, duration: 0.32, gain: 0.045, reverb: 0.18 },
        { type: 'tone', freq: D4, start: 0.01, duration: 0.11, gain: 0.09, waveform: 'triangle', reverb: 0.18 },
        { type: 'tone', freq: B3, start: 0.075, duration: 0.13, gain: 0.08, waveform: 'triangle', reverb: 0.2 },
        { type: 'tone', freq: A3, start: 0.15, duration: 0.2, gain: 0.075, waveform: 'triangle', reverb: 0.24 },
    ],
    unmute: [
        { type: 'noise', start: 0, duration: 0.015, gain: 0.06, filterFreq: 1400, filterQ: 1.1, filterType: 'bandpass', reverb: 0.1 },
        { type: 'sweep', startFreq: 280, endFreq: 500, start: 0, duration: 0.3, gain: 0.045, reverb: 0.18 },
        { type: 'tone', freq: A3, start: 0.01, duration: 0.1, gain: 0.08, waveform: 'triangle', reverb: 0.18 },
        { type: 'tone', freq: B3, start: 0.075, duration: 0.12, gain: 0.085, waveform: 'triangle', reverb: 0.2 },
        { type: 'tone', freq: D4, start: 0.15, duration: 0.19, gain: 0.1, waveform: 'triangle', reverb: 0.24 },
    ],
    camOff: [
        { type: 'noise', start: 0, duration: 0.015, gain: 0.07, filterFreq: 1600, filterQ: 1.1, filterType: 'bandpass', reverb: 0.1 },
        { type: 'tone', freq: A4, start: 0.01, duration: 0.13, gain: 0.1, waveform: 'triangle', reverb: 0.2 },
        { type: 'tone', freq: E4, start: 0.09, duration: 0.17, gain: 0.09, waveform: 'triangle', reverb: 0.22 },
    ],
    camOn: [
        { type: 'noise', start: 0, duration: 0.015, gain: 0.07, filterFreq: 1600, filterQ: 1.1, filterType: 'bandpass', reverb: 0.1 },
        { type: 'tone', freq: E4, start: 0.01, duration: 0.13, gain: 0.09, waveform: 'triangle', reverb: 0.2 },
        { type: 'tone', freq: A4, start: 0.09, duration: 0.18, gain: 0.11, waveform: 'triangle', reverb: 0.22 },
    ],

    shutter: [
        { type: 'noise', start: 0, duration: 0.03, gain: 0.36, filterFreq: 2400, filterQ: 1.0, filterType: 'bandpass', reverb: 0.1 },
        { type: 'noise', start: 0.005, duration: 0.05, gain: 0.16, filterFreq: 800, filterQ: 0.7, filterType: 'lowpass', reverb: 0.1 },
        { type: 'noise', start: 0.075, duration: 0.025, gain: 0.22, filterFreq: 1800, filterQ: 1.1, filterType: 'bandpass', reverb: 0.1 },
    ],

    reactionSend: tones([B4], { duration: 0.12, gain: 0.1, reverb: 0.18 }),
    reactionReceive: [
        { type: 'tone', freq: G4, start: 0, duration: 0.14, gain: 0.11, waveform: 'triangle', reverb: 0.2 },
        { type: 'tone', freq: B4, start: 0.075, duration: 0.17, gain: 0.12, waveform: 'triangle', reverb: 0.2 },
    ],

    queueAdd: tones([D4, G4], { gap: 0.08, duration: 0.19, gain: 0.12, reverb: 0.18 }),
    skip: [{ type: 'sweep', startFreq: 440, endFreq: 760, start: 0, duration: 0.15, gain: 0.1, reverb: 0.15 }],

    focusStart: tones([C4, F4], { gap: 0.09, duration: 0.3, gain: 0.12, reverb: 0.25 }),
    breakStart: tones([A4, F4], { gap: 0.1, duration: 0.32, gain: 0.11, reverb: 0.25 }),

    whiteboardClear: [{ type: 'sweep', startFreq: 600, endFreq: 260, start: 0, duration: 0.22, gain: 0.09, reverb: 0.2 }],

    messageSend: tones([G4], { duration: 0.13, gain: 0.11, reverb: 0.2 }),
    messageReceive: tones([E4, A4], { gap: 0.095, duration: 0.16, gain: 0.12, reverb: 0.24 }),
}

const noiseBufferCache = new WeakMap<AudioContext, Map<number, AudioBuffer>>()

const getNoiseBuffer = (ctx: AudioContext, duration: number): AudioBuffer => {
    let cache = noiseBufferCache.get(ctx)
    if (!cache) {
        cache = new Map()
        noiseBufferCache.set(ctx, cache)
    }
    const key = Math.round(duration * 1000)
    const cached = cache.get(key)
    if (cached) return cached
    const length = Math.max(1, Math.round(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    cache.set(key, buffer)
    return buffer
}

const impulseCache = new WeakMap<AudioContext, AudioBuffer>()

const getImpulseResponse = (ctx: AudioContext): AudioBuffer => {
    const cached = impulseCache.get(ctx)
    if (cached) return cached
    const duration = 1.4
    const decay = 2.8
    const rate = ctx.sampleRate
    const length = Math.floor(rate * duration)
    const impulse = ctx.createBuffer(2, length, rate)
    for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch)
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
        }
    }
    impulseCache.set(ctx, impulse)
    return impulse
}

const convolverCache = new WeakMap<AudioContext, ConvolverNode>()

const getSharedConvolver = (ctx: AudioContext): ConvolverNode => {
    const cached = convolverCache.get(ctx)
    if (cached) return cached
    const convolver = ctx.createConvolver()
    convolver.buffer = getImpulseResponse(ctx)
    convolver.connect(ctx.destination)
    convolverCache.set(ctx, convolver)
    return convolver
}

const sendToReverb = (ctx: AudioContext, source: AudioNode, amount: number) => {
    if (!amount || amount <= 0) return
    const convolver = getSharedConvolver(ctx)
    const wetGain = ctx.createGain()
    wetGain.gain.value = amount
    source.connect(wetGain)
    wetGain.connect(convolver)
}

// plucked-note synth: two slightly detuned oscillators for a soft chorus-like body,
// paired with a lowpass filter envelope that sweeps from bright to dark as the note
// decays. That downward filter sweep is what makes it read as a soft mallet/pluck
// rather than either a flat metallic ping (static bright filter) or a dull thud
// (static dark filter).
const playTone = (ctx: AudioContext, now: number, e: ToneEvent) => {
    const start = now + e.start
    const gain = e.gain ?? 0.13
    const dur = e.duration
    const end = start + dur

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    const nyquist = ctx.sampleRate / 2 - 100
    const brightPeak = Math.min(nyquist, e.freq * 4.5)
    const darkFloor = Math.min(nyquist, Math.max(e.freq * 1.4, 200))
    filter.frequency.setValueAtTime(brightPeak, start)
    filter.frequency.exponentialRampToValueAtTime(darkFloor, end)
    filter.connect(ctx.destination)
    sendToReverb(ctx, filter, e.reverb ?? 0.2)

    const ampEnv = ctx.createGain()
    ampEnv.gain.setValueAtTime(0, start)
    ampEnv.gain.setTargetAtTime(gain, start, 0.008)
    ampEnv.gain.setValueAtTime(gain, start + Math.max(dur - 0.06, 0.02))
    ampEnv.gain.exponentialRampToValueAtTime(0.0001, end)
    ampEnv.connect(filter)

    const waveform = e.waveform ?? 'triangle'
    const detunes = [-6, 6]
    detunes.forEach(cents => {
        const osc = ctx.createOscillator()
        const oscGain = ctx.createGain()
        oscGain.gain.value = 0.5
        osc.type = waveform
        osc.frequency.value = e.freq
        osc.detune.value = cents
        osc.connect(oscGain)
        oscGain.connect(ampEnv)
        osc.start(start)
        osc.stop(end + 0.05)
    })
}

const playSweep = (ctx: AudioContext, now: number, e: SweepEvent) => {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.max(e.startFreq, e.endFreq) * 2.2
    filter.Q.value = 0.5
    osc.type = e.waveform ?? 'sine'
    const start = now + e.start
    const gain = e.gain ?? 0.11
    osc.frequency.setValueAtTime(e.startFreq, start)
    osc.frequency.linearRampToValueAtTime(e.endFreq, start + e.duration)
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.setTargetAtTime(gain, start, 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + e.duration)
    osc.connect(gainNode)
    gainNode.connect(filter)
    filter.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + e.duration + 0.05)
    sendToReverb(ctx, filter, e.reverb ?? 0.15)
}

const playNoise = (ctx: AudioContext, now: number, e: NoiseEvent) => {
    const source = ctx.createBufferSource()
    source.buffer = getNoiseBuffer(ctx, e.duration)
    const filter = ctx.createBiquadFilter()
    filter.type = e.filterType ?? 'bandpass'
    filter.frequency.value = e.filterFreq ?? 2000
    filter.Q.value = e.filterQ ?? 1
    const gainNode = ctx.createGain()
    const start = now + e.start
    const gain = e.gain ?? 0.16
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.005)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + e.duration)
    source.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)
    source.start(start)
    source.stop(start + e.duration + 0.02)
    sendToReverb(ctx, gainNode, e.reverb ?? 0.1)
}

export const playChime = async (ctx: AudioContext, kind: keyof typeof CHIMES) => {
    if (ctx.state === 'suspended') {
        try {
            await ctx.resume()
        } catch {
            return
        }
    }
    if (ctx.state !== 'running') return
    const now = ctx.currentTime
    const events = CHIMES[kind]
    if (!events) return
    events.forEach(e => {
        if (e.type === 'tone') playTone(ctx, now, e)
        else if (e.type === 'sweep') playSweep(ctx, now, e)
        else playNoise(ctx, now, e)
    })
}