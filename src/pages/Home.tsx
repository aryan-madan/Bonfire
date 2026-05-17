import { useState, useEffect, useRef } from 'react'
import { host, join, poll, type Peer } from '../lib/rtc'
import { Room } from './Room'

type Mode = 'idle' | 'create' | 'joining'
type Status = 'idle' | 'generating' | 'waiting' | 'connecting' | 'connected'

export function Home() {
    const [mode, setMode] = useState<Mode>('idle')
    const [name, setName] = useState(() => localStorage.getItem('bf-name') ?? '')
    const [status, setStatus] = useState<Status>('idle')
    const [link, setLink] = useState('')
    const peer = useRef<Peer | null>(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const room = params.get('room')
        if (room && name.trim()) {
            window.history.replaceState(null, '', window.location.pathname)
            setStatus('connecting')
            setMode('joining')
            join(room, () => setStatus('connected'), () => { }).then(p => { peer.current = p })
        } else if (room) {
            window.history.replaceState(null, '', window.location.pathname)
        }
    }, [])

    function saveName(v: string) {
        setName(v)
        localStorage.setItem('bf-name', v)
    }

    function cleanup() {
        peer.current?.conn.close()
        peer.current = null
        setMode('idle')
        setStatus('idle')
        setLink('')
        window.history.replaceState(null, '', window.location.pathname)
    }

    function onopen() { setStatus('connected') }

    function extractRoom(raw: string): string | null {
        try {
            const url = new URL(raw.trim())
            return new URLSearchParams(url.hash.slice(1)).get('room')
        } catch { return null }
    }

    function handleLinkChange(v: string) {
        setLink(v)
        const room = extractRoom(v)
        if (room && name.trim()) {
            setStatus('connecting')
            setMode('joining')
            join(room, onopen, () => { }).then(p => { peer.current = p })
        }
    }

    const named = name.trim().length > 0

    if (status === 'connected' && peer.current) {
        return <Room peer={peer.current} name={name} leave={cleanup} />
    }

    return (
        <main className="h-shell">
            <div className="h-card">
                <div className="h-logo">
                    bonfire
                </div>

                <div className="h-hero">
                    <h1 className="h-title">watch<br />together</h1>
                    <p className="h-sub">p2p · no accounts · just you two</p>
                </div>

                <div className="h-form">
                    <Field
                        label="your name"
                        value={name}
                        onChange={saveName}
                        placeholder="what do people call you?"
                        autoFocus
                    />

                    {mode === 'idle' && (
                        <div className="h-actions">
                            <button
                                className="h-btn-primary"
                                disabled={!named}
                                onClick={() => setMode('create')}
                            >
                                new room
                            </button>
                            <Field
                                label="invite link"
                                value={link}
                                onChange={handleLinkChange}
                                placeholder="paste an invite link…"
                                disabled={!named}
                            />
                        </div>
                    )}

                    {mode === 'create' && (
                        <CreateRoom peer={peer} setStatus={setStatus} onopen={onopen} back={cleanup} />
                    )}

                    {mode === 'joining' && (
                        <div className="h-status">
                            <div className="h-spinner" />
                            <span>{status === 'connecting' ? 'connecting…' : 'joining…'}</span>
                            <button className="h-text-btn" onClick={cleanup}>cancel</button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}

function Field({ label, value, onChange, placeholder, disabled = false, autoFocus = false }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    disabled?: boolean
    autoFocus?: boolean
}) {
    return (
        <div className="h-field-wrap">
            <label className="h-label">{label}</label>
            <input
                className="h-field"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                maxLength={32}
            />
        </div>
    )
}

function CreateRoom({ peer, setStatus, onopen, back }: {
    peer: React.MutableRefObject<Peer | null>
    setStatus: (s: Status) => void
    onopen: () => void
    back: () => void
}) {
    const [invite, setInvite] = useState('')
    const [copied, setCopied] = useState(false)
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true
        setStatus('generating')
        host(onopen, () => { }).then(({ peer: p, link, room }) => {
            peer.current = p
            setInvite(link)
            setStatus('waiting')
            poll(room, p).then(() => setStatus('connected')).catch(() => { })
        })
    }, [])

    function copy() {
        navigator.clipboard.writeText(invite)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    function truncate(url: string): string {
        try {
            const u = new URL(url)
            const room = new URLSearchParams(u.hash.slice(1)).get('room') ?? ''
            return `${u.host}/#room=${room.slice(0, 10)}…`
        } catch { return url }
    }

    return (
        <div className="h-create">
            <div className="h-waiting">
                <div className="h-spinner" />
                <span>waiting for them to join…</span>
            </div>
            <button
                className={`h-invite-btn${copied ? ' h-invite-btn--ok' : ''}`}
                onClick={copy}
                disabled={!invite}
            >
                <span className="h-invite-url">{invite ? truncate(invite) : 'generating…'}</span>
                <span className="h-invite-cta">{copied ? 'copied!' : 'copy link'}</span>
            </button>
            <button className="h-text-btn" onClick={back}>cancel</button>
        </div>
    )
}