import { useCallback, useEffect, useRef, useState } from 'react'
import { host, join, poll, type Peer } from '../lib/rtc'
import { Room } from './Room'

type Mode = 'idle' | 'create' | 'joining'
type Status = 'idle' | 'generating' | 'waiting' | 'connecting' | 'connected'

const roomCodePattern = /^[a-zA-Z0-9-]{4,32}$/

function extractRoom(raw: string): string | null {
    const value = raw.trim()
    if (!value) return null
    try {
        const url = new URL(value)
        return new URLSearchParams(url.hash.slice(1)).get('room')
    } catch {
        return roomCodePattern.test(value) ? value : null
    }
}

function roomFromHash(): string {
    return new URLSearchParams(window.location.hash.slice(1)).get('room') ?? ''
}

export function Home() {
    const pendingRoom = useRef(roomFromHash())
    const [mode, setMode] = useState<Mode>('idle')
    const [name, setName] = useState(() => localStorage.getItem('bf-name') ?? '')
    const [joinInput, setJoinInput] = useState(roomFromHash)
    const [joinError, setJoinError] = useState('')
    const [status, setStatus] = useState<Status>('idle')
    const [activePeer, setActivePeer] = useState<Peer | null>(null)

    const named = name.trim().length > 0
    const joinValid = !!extractRoom(joinInput)

    function saveName(v: string) {
        setName(v)
        localStorage.setItem('bf-name', v)
    }

    function cleanup() {
        activePeer?.conn.close()
        setActivePeer(null)
        setMode('idle')
        setStatus('idle')
        setJoinError('')
        window.history.replaceState(null, '', window.location.pathname)
    }

    const startJoin = useCallback(async (raw = joinInput) => {
        const room = extractRoom(raw)
        if (!name.trim()) {
            setJoinError('add your name first')
            return
        }
        if (!room) {
            setJoinError('paste a room link or code')
            return
        }
        try {
            setJoinError('')
            setStatus('connecting')
            setMode('joining')
            setActivePeer(await join(room, () => setStatus('connected'), () => {}))
        } catch {
            setJoinError('room not found — check the code and try again')
            setStatus('idle')
            setMode('idle')
        }
    }, [joinInput, name])

    useEffect(() => {
        if (!pendingRoom.current) return
        window.history.replaceState(null, '', window.location.pathname)
        if (!name.trim()) return
        const room = pendingRoom.current
        pendingRoom.current = ''
        void startJoin(room)
    }, [name, startJoin])

    if (status === 'connected' && activePeer) {
        return <Room peer={activePeer} name={name.trim()} leave={cleanup} />
    }

    return (
        <main className="grid min-h-screen place-items-center bg-cocoa-900 px-4 py-8 text-ember-50">
            <section className="w-full max-w-[400px]">

                <header className="mb-8 text-center">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[1.25rem] bg-ember-400 text-xl text-white">
                        <i className="fa-solid fa-fire" />
                    </div>
                    <h1 className="text-5xl font-bold leading-none tracking-tight">bonfire</h1>
                </header>

                <div className="grid gap-2.5">
                    <NameField value={name} onChange={saveName} />

                    <div
                        className={`grid gap-2.5 overflow-hidden transition-all duration-300 ease-in-out ${named ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}
                    >
                        {mode === 'idle' && (
                            <>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <ActionCard
                                        icon="fa-solid fa-plus"
                                        label="New room"
                                        sublabel="Start a session"
                                        onClick={() => setMode('create')}
                                        accent="plum"
                                    />
                                    <ActionCard
                                        icon="fa-solid fa-arrow-right-to-bracket"
                                        label="Join room"
                                        sublabel="Enter a code"
                                        onClick={() => {}}
                                        accent="mint"
                                        disabled
                                        visualOnly
                                    />
                                </div>

                                <JoinField
                                    value={joinInput}
                                    onChange={v => { setJoinInput(v); setJoinError('') }}
                                    onSubmit={() => void startJoin()}
                                    error={joinError}
                                    isValid={joinValid}
                                />
                            </>
                        )}

                        {mode === 'create' && (
                            <CreateRoom
                                setPeer={setActivePeer}
                                setStatus={setStatus}
                                onopen={() => setStatus('connected')}
                                back={cleanup}
                            />
                        )}

                        {mode === 'joining' && (
                            <JoiningState status={status} onCancel={cleanup} />
                        )}
                    </div>


                </div>
            </section>
        </main>
    )
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <label className="group flex items-center gap-3 rounded-2xl bg-cocoa-800 px-4 py-3.5 ring-1 ring-transparent transition focus-within:bg-cocoa-700 focus-within:ring-ember-400/30">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ember-400/15 text-ember-400">
                <i className="fa-regular fa-face-smile text-sm" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-ember-100/50 transition group-focus-within:text-ember-400">
                    your name
                </span>
                <input
                    className="w-full bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 outline-none"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="how should we call you?"
                    autoFocus
                    maxLength={32}
                />
            </span>
            {value.trim().length > 0 && (
                <span className="shrink-0 text-ember-400">
                    <i className="fa-solid fa-check text-xs" />
                </span>
            )}
        </label>
    )
}

function ActionCard({ icon, label, sublabel, onClick, accent, disabled = false, visualOnly = false }: {
    icon: string
    label: string
    sublabel: string
    onClick: () => void
    accent: 'plum' | 'mint'
    disabled?: boolean
    visualOnly?: boolean
}) {
    const accentClasses = {
        plum: 'bg-plum-800 hover:bg-plum-700 text-ember-50',
        mint: 'bg-cocoa-800 text-ember-50/50',
    }
    const iconClasses = {
        plum: 'bg-plum-700 text-ember-300',
        mint: 'bg-cocoa-700 text-ember-100/30',
    }

    return (
        <button
            className={`flex flex-col gap-3 rounded-2xl px-4 py-4 text-left transition ${accentClasses[accent]} ${disabled && !visualOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={visualOnly ? undefined : onClick}
            disabled={disabled && !visualOnly}
            tabIndex={visualOnly ? -1 : undefined}
            style={visualOnly ? { pointerEvents: 'none' } : undefined}
        >
            <span className={`grid h-8 w-8 place-items-center rounded-xl text-xs ${iconClasses[accent]}`}>
                <i className={icon} />
            </span>
            <span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs text-ember-100/50">{sublabel}</span>
            </span>
        </button>
    )
}

function JoinField({ value, onChange, onSubmit, error, isValid }: {
    value: string
    onChange: (v: string) => void
    onSubmit: () => void
    error: string
    isValid: boolean
}) {
    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && isValid) onSubmit()
    }

    return (
        <div>
            <div className={`group flex items-center gap-3 rounded-2xl bg-cocoa-800 px-4 py-3.5 transition focus-within:bg-cocoa-700 focus-within:ring-ember-400/30 ${error ? 'ring-berry-400/70' : isValid ? 'ring-mint-300/35 focus-within:ring-mint-300/65' : 'ring-ember-100/10 focus-within:ring-ember-400/55'}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm transition ${isValid ? 'bg-mint-300/15 text-mint-300' : 'bg-cocoa-700 text-ember-100/30'}`}>
                    <i className="fa-solid fa-link text-xs" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-ember-100/50 transition group-focus-within:text-ember-400">
                        room link or code
                    </span>
                    <input
                        className="w-full bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 outline-none"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="paste link or type code"
                        maxLength={256}
                    />
                </span>
                {isValid && (
                    <button
                        className="shrink-0 rounded-xl bg-mint-300 px-3 py-1.5 text-xs font-bold text-cocoa-900 transition hover:bg-mint-300/85"
                        onClick={onSubmit}
                    >
                        Join
                    </button>
                )}
            </div>
            {error && (
                <p className="mt-1.5 flex items-center gap-1.5 px-2 text-xs font-semibold text-berry-300">
                    <i className="fa-solid fa-circle-exclamation" />
                    {error}
                </p>
            )}
        </div>
    )
}

function JoiningState({ status, onCancel }: { status: Status; onCancel: () => void }) {
    return (
        <div className="flex items-center justify-between rounded-2xl bg-cocoa-800 px-5 py-4 [animation:soft-pop_0.25s_ease_both]">
            <span className="flex items-center gap-3 text-sm font-semibold text-ember-100">
                <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-ember-400 opacity-75 [animation:ping_1s_ease_infinite]" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-ember-400" />
                </span>
                {status === 'connecting' ? 'Connecting to room…' : 'Almost there…'}
            </span>
            <button
                className="text-xs font-bold text-ember-100/50 transition hover:text-ember-50"
                onClick={onCancel}
            >
                cancel
            </button>
        </div>
    )
}

function CreateRoom({ setPeer, setStatus, onopen, back }: {
    setPeer: (peer: Peer) => void
    setStatus: (s: Status) => void
    onopen: () => void
    back: () => void
}) {
    const [invite, setInvite] = useState('')
    const [roomCode, setRoomCode] = useState('')
    const [copied, setCopied] = useState<'link' | 'code' | null>(null)
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true
        setStatus('generating')
        host(onopen, () => {}).then(({ peer: p, link, room }) => {
            setPeer(p)
            setInvite(link)
            setRoomCode(room)
            setStatus('waiting')
            poll(room, p).then(() => setStatus('connected')).catch(() => {})
        })
    }, [onopen, setPeer, setStatus])

    function copy(text: string, kind: 'link' | 'code') {
        void navigator.clipboard.writeText(text)
        setCopied(kind)
        setTimeout(() => setCopied(null), 1800)
    }

    const isReady = !!invite && !!roomCode

    return (
        <div className="grid gap-2.5 [animation:soft-pop_0.28s_ease_both]">
            <div className="flex items-center gap-3 rounded-2xl bg-cocoa-800 px-5 py-4">
                {isReady ? (
                    <>
                        <span className="relative flex h-3 w-3 shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-ember-300 opacity-75 [animation:ping_1.2s_ease_infinite]" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-ember-300" />
                        </span>
                        <span className="text-sm font-semibold text-ember-100">Waiting for someone to join…</span>
                    </>
                ) : (
                    <>
                        <span className="h-3 w-3 shrink-0 rounded-full bg-cocoa-600 [animation:soft-pop_0.8s_ease_infinite_alternate]" />
                        <span className="text-sm font-semibold text-ember-100/50">Setting up your room…</span>
                    </>
                )}
            </div>

            <div className={`grid grid-cols-2 gap-2.5 transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <button
                    className="flex flex-col justify-between gap-4 rounded-2xl bg-cocoa-800 px-4 py-4 text-left transition hover:bg-cocoa-700"
                    onClick={() => copy(roomCode, 'code')}
                    disabled={!roomCode}
                >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-ember-100/50">Room code</span>
                    <span>
                        <span className="block font-mono text-2xl font-bold tracking-widest text-ember-50">
                            {roomCode || '——'}
                        </span>
                        <span className={`mt-1 block text-xs font-bold transition ${copied === 'code' ? 'text-mint-300' : 'text-ember-100/40'}`}>
                            {copied === 'code' ? '✓ copied' : 'tap to copy'}
                        </span>
                    </span>
                </button>

                <button
                    className="flex flex-col justify-between gap-4 rounded-2xl bg-cocoa-800 px-4 py-4 text-left transition hover:bg-cocoa-700"
                    onClick={() => copy(invite, 'link')}
                    disabled={!invite}
                >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-ember-100/50">Invite link</span>
                    <span>
                        <span className="block truncate text-xs font-semibold text-ember-100/60 leading-relaxed">
                            {invite ? invite.replace(/^https?:\/\//, '') : '—'}
                        </span>
                        <span className={`mt-1 block text-xs font-bold transition ${copied === 'link' ? 'text-mint-300' : 'text-ember-100/40'}`}>
                            {copied === 'link' ? '✓ copied' : 'tap to copy'}
                        </span>
                    </span>
                </button>
            </div>

            <button
                className="py-2 text-xs font-bold text-ember-100/35 transition hover:text-ember-100/70"
                onClick={back}
            >
                cancel
            </button>
        </div>
    )
}
