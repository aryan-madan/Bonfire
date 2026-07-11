const NOTES: Record<string, number[]> = {
    join: [523.25, 659.25],
    leave: [659.25, 523.25],
    end: [523.25, 392.00, 329.63],
    mute: [392.00],
    unmute: [493.88],
    camOff: [349.23],
    camOn: [440.00],
}

export const playChime = async (ctx: AudioContext, kind: keyof typeof NOTES) => {
    if (ctx.state === 'suspended') {
        try {
            await ctx.resume()
        } catch {
            return
        }
    }
    if (ctx.state !== 'running') return
    const now = ctx.currentTime
    const notes = NOTES[kind]
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const start = now + i * 0.1
        const duration = notes.length === 1 ? 0.18 : 0.4
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + duration + 0.05)
    })
}