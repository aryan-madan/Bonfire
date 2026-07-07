import { useEffect, useRef, useState } from 'react'

export type StudyMode = 'focus' | 'short' | 'long'

export interface StudyState {
    mode: StudyMode
    running: boolean
    endsAt: number | null
    remainingMs: number
    cycle: number
    durations: { focus: number; short: number; long: number }
    longBreakEvery: number
}

export const defaultStudyState: StudyState = {
    mode: 'focus',
    running: false,
    endsAt: null,
    remainingMs: 25 * 60 * 1000,
    cycle: 0,
    durations: { focus: 25, short: 5, long: 15 },
    longBreakEvery: 4,
}

const MODE_LABEL: Record<StudyMode, string> = { focus: 'focus', short: 'short break', long: 'long break' }
const MODE_ACCENT: Record<StudyMode, string> = { focus: 'ember-400', short: 'mint-300', long: 'mint-300' }

const remainingOf = (s: StudyState, now: number) =>
    s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remainingMs

const totalOf = (s: StudyState) => s.durations[s.mode] * 60000

const fmt = (ms: number) => {
    const total = Math.ceil(ms / 1000)
    const m = Math.floor(total / 60).toString().padStart(2, '0')
    const sec = (total % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
}

export const nextAfter = (s: StudyState): StudyState => {
    if (s.mode === 'focus') {
        const cycle = s.cycle + 1
        const mode: StudyMode = cycle % s.longBreakEvery === 0 ? 'long' : 'short'
        return { ...s, mode, cycle, running: true, endsAt: Date.now() + s.durations[mode] * 60000, remainingMs: s.durations[mode] * 60000 }
    }
    return { ...s, mode: 'focus', running: true, endsAt: Date.now() + s.durations.focus * 60000, remainingMs: s.durations.focus * 60000 }
}

interface Props {
    state: StudyState
    onChange: (next: StudyState) => void
    onLeave: () => void
    hovered: boolean
}

export const StudyTogether = ({ state, onChange, onLeave, hovered }: Props) => {
    const [now, setNow] = useState(Date.now())
    const [settingsOpen, setSettingsOpen] = useState(false)

    useEffect(() => {
        if (!state.running) return
        const id = window.setInterval(() => setNow(Date.now()), 250)
        return () => window.clearInterval(id)
    }, [state.running])

    const remaining = remainingOf(state, now)
    const total = totalOf(state)
    const fraction = total > 0 ? 1 - remaining / total : 0
    const radius = 90
    const circumference = 2 * Math.PI * radius
    const accent = MODE_ACCENT[state.mode]

    const start = () => {
        const dur = state.remainingMs > 0 ? state.remainingMs : totalOf(state)
        onChange({ ...state, running: true, endsAt: Date.now() + dur })
    }
    const pause = () => {
        if (!state.running) return
        onChange({ ...state, running: false, endsAt: null, remainingMs: remainingOf(state, Date.now()) })
    }
    const reset = () => {
        onChange({ ...state, running: false, endsAt: null, remainingMs: totalOf(state) })
    }
    const skip = () => onChange(nextAfter({ ...state, running: false }))
    const pickMode = (mode: StudyMode) => {
        if (mode === state.mode) return
        onChange({ ...state, mode, running: false, endsAt: null, remainingMs: state.durations[mode] * 60000 })
    }
    const adjustDuration = (mode: StudyMode, delta: number) => {
        const durations = { ...state.durations, [mode]: Math.max(5, state.durations[mode] + delta) }
        const remainingMs = mode === state.mode && !state.running ? durations[mode] * 60000 : state.remainingMs
        onChange({ ...state, durations, remainingMs })
    }

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-6">
            <div className={`absolute top-3 right-3 flex items-center gap-2 transition-all duration-300 ${hovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                <button
                    onClick={() => setSettingsOpen(v => !v)}
                    title="Timer settings"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-sliders text-xs" />
                </button>
                <button
                    onClick={onLeave}
                    title="back to activities"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-arrow-left text-xs" />
                </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-cocoa-800 p-1">
                {(['focus', 'short', 'long'] as StudyMode[]).map(m => (
                    <button
                        key={m}
                        onClick={() => pickMode(m)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${state.mode === m ? `bg-${MODE_ACCENT[m]} text-cocoa-900` : 'text-ember-100/45 hover:text-ember-100/80'}`}
                    >
                        {MODE_LABEL[m]}
                    </button>
                ))}
            </div>

            <div className="relative grid place-items-center">
                <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
                    <circle cx="110" cy="110" r={radius} fill="none" strokeWidth="10" className="stroke-cocoa-800" />
                    <circle
                        cx="110" cy="110" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
                        className={`stroke-${accent} transition-[stroke-dashoffset] duration-200 ease-linear`}
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - fraction)}
                    />
                </svg>
                <div className="absolute flex flex-col items-center gap-1">
                    <span className="text-5xl font-bold tabular-nums text-ember-50">{fmt(remaining)}</span>
                    <span className="text-xs font-bold text-ember-100/40">
                        cycle {state.cycle} · next {state.mode === 'focus' ? ((state.cycle + 1) % state.longBreakEvery === 0 ? 'long break' : 'short break') : 'focus'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={reset}
                    title="Reset"
                    className="flex items-center justify-center h-11 w-11 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 transition-colors"
                >
                    <i className="fa-solid fa-rotate-left" />
                </button>
                <button
                    onClick={state.running ? pause : start}
                    className={`flex items-center justify-center h-14 w-14 rounded-full bg-${accent} text-cocoa-900 hover:opacity-90 transition-opacity`}
                >
                    <i className={`fa-solid ${state.running ? 'fa-pause' : 'fa-play'} text-lg`} />
                </button>
                <button
                    onClick={skip}
                    title="Skip to next segment"
                    className="flex items-center justify-center h-11 w-11 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 transition-colors"
                >
                    <i className="fa-solid fa-forward-step" />
                </button>
            </div>

            {settingsOpen && (
                <div className="absolute bottom-5 flex items-center gap-4 rounded-[1.1rem] bg-cocoa-900/90 backdrop-blur px-5 py-3">
                    {(['focus', 'short', 'long'] as StudyMode[]).map(m => (
                        <div key={m} className="flex items-center gap-2">
                            <span className="text-xs font-bold text-ember-100/45 w-16">{MODE_LABEL[m]}</span>
                            <button onClick={() => adjustDuration(m, -5)} className="h-6 w-6 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 text-xs">–</button>
                            <span className="w-10 text-center text-xs font-bold tabular-nums text-ember-50">{state.durations[m]}m</span>
                            <button onClick={() => adjustDuration(m, 5)} className="h-6 w-6 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 text-xs">+</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}