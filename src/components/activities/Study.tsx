import { useEffect, useState } from 'react'

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
const MODE_ICON: Record<StudyMode, string> = { focus: 'fa-bolt', short: 'fa-mug-hot', long: 'fa-moon' }
const MODE_ACCENT: Record<StudyMode, string> = { focus: 'ember-400', short: 'mint-300', long: 'mint-300' }
const MODE_TEXT: Record<StudyMode, string> = { focus: 'text-white', short: 'text-cocoa-900', long: 'text-cocoa-900' }

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
    const accentText = MODE_TEXT[state.mode]

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
        const durations = { ...state.durations, [mode]: Math.max(5, Math.min(120, state.durations[mode] + delta)) }
        const remainingMs = mode === state.mode && !state.running ? durations[mode] * 60000 : state.remainingMs
        onChange({ ...state, durations, remainingMs })
    }

    return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-6">
            <div className={`absolute top-3 left-3 flex items-center gap-2 transition-all duration-300 ${hovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                <button
                    onClick={onLeave}
                    title="back to activities"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-arrow-left text-xs" />
                </button>
                <button
                    onClick={() => setSettingsOpen(v => !v)}
                    title="Timer settings"
                    className={`flex items-center justify-center h-9 w-9 rounded-full backdrop-blur-md border transition-colors ${settingsOpen ? `bg-${accent} border-transparent ${accentText}` : 'bg-black/40 border-white/10 text-white/90 hover:bg-black/60'}`}
                >
                    <i className="fa-solid fa-sliders text-xs" />
                </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-cocoa-900/80 backdrop-blur p-1">
                {(['focus', 'short', 'long'] as StudyMode[]).map(m => (
                    <button
                        key={m}
                        onClick={() => pickMode(m)}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                            state.mode === m ? `bg-${MODE_ACCENT[m]} ${MODE_TEXT[m]}` : 'text-ember-100/45 hover:text-ember-100/80'
                        }`}
                    >
                        <i className={`fa-solid ${MODE_ICON[m]} text-[10px] ${state.mode === m ? 'opacity-90' : 'opacity-50'}`} />
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
                        cycle {state.cycle} &middot; next {state.mode === 'focus' ? ((state.cycle + 1) % state.longBreakEvery === 0 ? 'long break' : 'short break') : 'focus'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={reset}
                    title="Reset"
                    className="flex items-center justify-center h-11 w-11 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                >
                    <i className="fa-solid fa-rotate-left" />
                </button>
                <button
                    onClick={state.running ? pause : start}
                    className={`flex items-center justify-center h-14 w-14 rounded-full bg-${accent} ${accentText} hover:opacity-90 transition-opacity`}
                >
                    <i className={`fa-solid ${state.running ? 'fa-pause' : 'fa-play'} text-lg ${state.running ? '' : 'ml-0.5'}`} />
                </button>
                <button
                    onClick={skip}
                    title="Skip to next segment"
                    className="flex items-center justify-center h-11 w-11 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                >
                    <i className="fa-solid fa-forward-step" />
                </button>
            </div>

            <div
                className={`absolute bottom-5 w-[min(92%,23rem)] transition-all duration-300 ease-out ${
                    settingsOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
                }`}
            >
                <div className="rounded-[1.25rem] bg-cocoa-900/95 backdrop-blur-xl border border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
                        <span className="text-xs font-bold text-ember-100/45">durations</span>
                        <button
                            onClick={() => setSettingsOpen(false)}
                            className="flex items-center justify-center h-6 w-6 rounded-full text-ember-100/40 hover:text-ember-100 hover:bg-cocoa-800 transition-colors"
                        >
                            <i className="fa-solid fa-xmark text-[11px]" />
                        </button>
                    </div>
                    <div className="flex flex-col gap-1 px-3 pb-2">
                        {(['focus', 'short', 'long'] as StudyMode[]).map(m => (
                            <div key={m} className="flex items-center justify-between gap-3 px-2 py-1.5">
                                <span className="flex items-center gap-2.5">
                                    <span className={`flex items-center justify-center h-7 w-7 rounded-full bg-${MODE_ACCENT[m]}/15 text-${MODE_ACCENT[m]}`}>
                                        <i className={`fa-solid ${MODE_ICON[m]} text-[11px]`} />
                                    </span>
                                    <span className="text-sm font-bold text-ember-50">{MODE_LABEL[m]}</span>
                                </span>
                                <span className="flex items-center gap-3">
                                    <button
                                        onClick={() => adjustDuration(m, -5)}
                                        className="flex items-center justify-center h-7 w-7 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                                    >
                                        <i className="fa-solid fa-minus text-[10px]" />
                                    </button>
                                    <span className="w-10 text-center text-xs font-bold tabular-nums text-ember-50">{state.durations[m]}m</span>
                                    <button
                                        onClick={() => adjustDuration(m, 5)}
                                        className="flex items-center justify-center h-7 w-7 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                                    >
                                        <i className="fa-solid fa-plus text-[10px]" />
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                        <span className="text-xs font-bold text-ember-100/45">long break every</span>
                        <span className="flex items-center gap-3">
                            <button
                                onClick={() => onChange({ ...state, longBreakEvery: Math.max(2, state.longBreakEvery - 1) })}
                                className="flex items-center justify-center h-6 w-6 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                            >
                                <i className="fa-solid fa-minus text-[9px]" />
                            </button>
                            <span className="w-16 text-center text-xs font-bold tabular-nums text-ember-50">{state.longBreakEvery} cycles</span>
                            <button
                                onClick={() => onChange({ ...state, longBreakEvery: Math.min(8, state.longBreakEvery + 1) })}
                                className="flex items-center justify-center h-6 w-6 rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100 hover:bg-cocoa-700 transition-colors"
                            >
                                <i className="fa-solid fa-plus text-[9px]" />
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}