type ToneEvent = {
    type: 'tone'
    freq: number
    start: number
    duration: number
    gain?: number
    waveform?: OscillatorType
}

type NoiseEvent = {
    type: 'noise'
    start: number
    duration: number
    gain?: number
    filterFreq?: number
    filterQ?: number
    filterType?: BiquadFilterType
}

type SweepEvent = {
    type: 'sweep'
    startFreq: number
    endFreq: number
    start: number
    duration: number
    gain?: number
    waveform?: OscillatorType
}

type ChimeEvent = ToneEvent | NoiseEvent | SweepEvent

const tones = (freqs: number[], opts?: { gap?: number; duration?: number; gain?: number; waveform?: OscillatorType }): ToneEvent[] => {
    const gap = opts?.gap ?? 0.1
    const duration = opts?.duration ?? (freqs.length === 1 ? 0.18 : 0.4)
    const gain = opts?.gain ?? 0.18
    return freqs.map((freq, i) => ({ type: 'tone', freq, start: i * gap, duration, gain, waveform: opts?.waveform }))
}

const CHIMES: Record<string, ChimeEvent[]> = {
    join: tones([523.25, 659.25]),
    leave: tones([659.25, 523.25]),

    end: tones([659.25, 523.25, 392.0], { gap: 0.1, duration: 0.3, gain: 0.16 }),

    mute: [{ type: 'tone', freq: 349.23, start: 0, duration: 0.14, gain: 0.15, waveform: 'triangle' }],
    unmute: [{ type: 'tone', freq: 440.0, start: 0, duration: 0.14, gain: 0.15, waveform: 'triangle' }],
    camOff: [{ type: 'tone', freq: 329.63, start: 0, duration: 0.16, gain: 0.14, waveform: 'triangle' }],
    camOn: [{ type: 'tone', freq: 392.0, start: 0, duration: 0.16, gain: 0.14, waveform: 'triangle' }],

    shutter: [
        { type: 'noise', start: 0, duration: 0.03, gain: 0.5, filterFreq: 2800, filterQ: 1.1, filterType: 'bandpass' },
        { type: 'noise', start: 0.005, duration: 0.05, gain: 0.22, filterFreq: 900, filterQ: 0.7, filterType: 'lowpass' },
        { type: 'noise', start: 0.075, duration: 0.025, gain: 0.32, filterFreq: 2200, filterQ: 1.2, filterType: 'bandpass' },
    ],

    reactionSend: [{ type: 'tone', freq: 880.0, start: 0, duration: 0.1, gain: 0.13 }],
    reactionReceive: [
        { type: 'tone', freq: 784.99, start: 0, duration: 0.13, gain: 0.13, waveform: 'triangle' },
        { type: 'tone', freq: 987.77, start: 0.06, duration: 0.16, gain: 0.14, waveform: 'triangle' },
    ],

    queueAdd: [
        { type: 'tone', freq: 587.33, start: 0, duration: 0.18, gain: 0.14 },
        { type: 'tone', freq: 739.99, start: 0.07, duration: 0.2, gain: 0.14 },
    ],
    skip: [{ type: 'sweep', startFreq: 420, endFreq: 900, start: 0, duration: 0.16, gain: 0.14 }],

    focusStart: tones([523.25, 698.46], { gap: 0.08, duration: 0.3, gain: 0.16, waveform: 'triangle' }),
    breakStart: tones([440.0, 349.23], { gap: 0.1, duration: 0.34, gain: 0.14, waveform: 'triangle' }),

    whiteboardClear: [{ type: 'sweep', startFreq: 700, endFreq: 260, start: 0, duration: 0.2, gain: 0.13 }],

    messageSend: [{ type: 'tone', freq: 1046.5, start: 0, duration: 0.05, gain: 0.09, waveform: 'sine' }],
    messageReceive: [
        { type: 'tone', freq: 987.77, start: 0, duration: 0.11, gain: 0.15, waveform: 'triangle' },
        { type: 'tone', freq: 1318.51, start: 0.06, duration: 0.17, gain: 0.16, waveform: 'triangle' },
    ],
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

const playTone = (ctx: AudioContext, now: number, e: ToneEvent) => {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.type = e.waveform ?? 'sine'
    osc.frequency.value = e.freq
    const start = now + e.start
    const gain = e.gain ?? 0.18
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + e.duration)
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + e.duration + 0.05)
}

const playSweep = (ctx: AudioContext, now: number, e: SweepEvent) => {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.type = e.waveform ?? 'sine'
    const start = now + e.start
    const gain = e.gain ?? 0.15
    osc.frequency.setValueAtTime(e.startFreq, start)
    osc.frequency.linearRampToValueAtTime(e.endFreq, start + e.duration)
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + e.duration)
    osc.connect(gainNode)
    gainNode.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + e.duration + 0.05)
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
    const gain = e.gain ?? 0.2
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.linearRampToValueAtTime(gain, start + 0.005)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + e.duration)
    source.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)
    source.start(start)
    source.stop(start + e.duration + 0.02)
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