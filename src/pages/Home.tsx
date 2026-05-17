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
            setActivePeer(await join(room, () => setStatus('connected'), () => { }))
        } catch {
            setJoinError('that room could not be found')
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

    const named = name.trim().length > 0

    if (status === 'connected' && activePeer) {
        return <Room peer={activePeer} name={name.trim()} leave={cleanup} />
    }

    return (
        <main className="grid min-h-screen place-items-center bg-cocoa-900 px-4 py-8 text-ember-50">
            <section className="w-full max-w-[430px] rounded-[2rem] bg-plum-900 p-5">
                <div className="mb-7 text-center">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[1.25rem] bg-ember-400 text-xl text-white">
                        <i className="fa-solid fa-fire" />
                    </div>
                    <h1 className="text-5xl font-bold leading-none tracking-normal">bonfire</h1>
                </div>

                <div className="grid gap-3">
                    <Field
                        icon="fa-regular fa-face-smile"
                        label="your name"
                        value={name}
                        onChange={saveName}
                        placeholder="name"
                        autoFocus
                    />

                    {mode === 'idle' && (
                        <>
                            <Field
                                icon="fa-solid fa-link"
                                label="room link or code"
                                value={joinInput}
                                onChange={v => { setJoinInput(v); setJoinError('') }}
                                placeholder="link or code"
                                disabled={!named}
                            />
                            {joinError && <p className="px-2 text-sm font-semibold text-berry-300">{joinError}</p>}

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    className="rounded-[1.35rem] bg-cocoa-800 px-5 py-4 text-sm font-bold text-ember-50 transition hover:bg-cocoa-700 disabled:opacity-40"
                                    disabled={!named}
                                    onClick={() => setMode('create')}
                                >
                                    new room
                                </button>
                                <button
                                    className="rounded-[1.35rem] bg-ember-400 px-5 py-4 text-sm font-bold text-white transition hover:bg-ember-500 disabled:opacity-40"
                                    disabled={!named}
                                    onClick={() => void startJoin()}
                                >
                                    join
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'create' && (
                        <CreateRoom setPeer={setActivePeer} setStatus={setStatus} onopen={() => setStatus('connected')} back={cleanup} />
                    )}

                    {mode === 'joining' && (
                        <div className="flex items-center justify-between rounded-[1.5rem] bg-cocoa-800 px-5 py-4">
                            <span className="flex items-center gap-3 text-sm font-bold text-ember-100">
                                <span className="h-3 w-3 rounded-full bg-ember-400 [animation:soft-pop_0.8s_ease_infinite_alternate]" />
                                {status === 'connecting' ? 'connecting...' : 'joining...'}
                            </span>
                            <button className="text-sm font-bold text-ember-100/70 hover:text-ember-50" onClick={cleanup}>
                                cancel
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </main>
    )
}

function Field({ icon, label, value, onChange, placeholder, disabled = false, autoFocus = false }: {
    icon: string
    label: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    disabled?: boolean
    autoFocus?: boolean
}) {
    return (
        <label className="group flex items-center gap-3 rounded-[1.35rem] bg-cocoa-800 px-4 py-3 transition focus-within:bg-cocoa-700">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-plum-700 text-ember-500">
                <i className={icon} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase text-ember-100/65 transition group-focus-within:text-ember-500">{label}</span>
                <input
                    className="w-full bg-transparent text-base font-semibold text-ember-50 placeholder:text-ember-100/45 disabled:opacity-40"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    maxLength={128}
                />
            </span>
        </label>
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
        host(onopen, () => { }).then(({ peer: p, link, room }) => {
            setPeer(p)
            setInvite(link)
            setRoomCode(room)
            setStatus('waiting')
            poll(room, p).then(() => setStatus('connected')).catch(() => { })
        })
    }, [onopen, setPeer, setStatus])

    function copy(text: string, kind: 'link' | 'code') {
        void navigator.clipboard.writeText(text)
        setCopied(kind)
        setTimeout(() => setCopied(null), 1800)
    }

    return (
        <div className="grid gap-3 [animation:soft-pop_0.32s_ease_both]">
            <div className="flex items-center gap-3 rounded-[1.5rem] bg-cocoa-800 px-5 py-4 text-sm font-bold text-ember-100/70">
                <span className="h-3 w-3 rounded-full bg-ember-300 [animation:soft-pop_0.8s_ease_infinite_alternate]" />
                waiting for someone to join...
            </div>

            <button
                className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-cocoa-800 px-5 py-4 text-left transition hover:bg-cocoa-700 disabled:opacity-40"
                onClick={() => copy(invite, 'link')}
                disabled={!invite}
            >
                <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase text-ember-100/65">invite link</span>
                    <span className="block truncate text-sm font-semibold text-ember-100/70">{invite || 'generating...'}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-ember-300">{copied === 'link' ? 'copied' : 'copy'}</span>
            </button>

            <button
                className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-cocoa-800 px-5 py-4 text-left transition hover:bg-cocoa-700 disabled:opacity-40"
                onClick={() => copy(roomCode, 'code')}
                disabled={!roomCode}
            >
                <span>
                    <span className="block text-xs font-bold uppercase text-ember-100/65">room code</span>
                    <span className="text-2xl font-bold tracking-normal text-ember-50">{roomCode || '--------'}</span>
                </span>
                <span className="shrink-0 text-sm font-bold text-mint-300">{copied === 'code' ? 'copied' : 'copy'}</span>
            </button>

            <button className="py-2 text-sm font-bold text-ember-100/45 hover:text-ember-50" onClick={back}>
                cancel
            </button>
        </div>
    )
}
