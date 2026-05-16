import { useState, useEffect, useRef } from 'react'
import { host, join, poll, type Peer } from '../lib/rtc'
import { Room } from './Room'

type Mode = 'idle' | 'create' | 'join'
type Status = 'idle' | 'generating' | 'waiting' | 'connecting' | 'connected'

export function Home() {
    const [mode, setMode] = useState<Mode>('idle')
    const [name, setName] = useState(() => localStorage.getItem('name') ?? '')
    const [status, setStatus] = useState<Status>('idle')
    const peer = useRef<Peer | null>(null)

    function save(value: string) {
        setName(value)
        localStorage.setItem('name', value)
    }

    function cleanup() {
        peer.current?.conn.close()
        peer.current = null
        setMode('idle')
        setStatus('idle')
        window.history.replaceState(null, '', window.location.pathname)
    }

    function onopen() { setStatus('connected') }
    function onmessage(data: string) { console.log('msg', data) }

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const room = params.get('room')
        if (room) {
            window.history.replaceState(null, '', window.location.pathname)
            setMode('join')
        }
    }, [])

    const named = name.trim().length > 0

    if (status === 'connected' && peer.current) {
        return <Room peer={peer.current} name={name} leave={cleanup} />
    }

    function handleJoinLink(link: string) {
        try {
            const url = new URL(link)
            const room = new URLSearchParams(url.hash.slice(1)).get('room')
            if (!room) return
            setStatus('connecting')
            join(room, onopen, onmessage).then(p => { peer.current = p })
        } catch { }
    }

    return (
        <main className="home">
            <div className="content">
                <div className="logo pop pop-1">
                    <i className="fa-solid fa-fire" /> bonfire
                </div>
                <h1 className="title pop pop-2">
                    watchy<br />watchy :3
                </h1>
                <div className="panel pop pop-3">
                    <div className="wrap">
                        <i className="fa-solid fa-user field-icon" />
                        <input
                            className="field"
                            value={name}
                            onChange={e => save(e.target.value)}
                            placeholder="your name"
                            maxLength={32}
                        />
                    </div>
                    <div className="inner">
                        {mode === 'idle' && (
                            <MeetBar
                                named={named}
                                onNew={() => setMode('create')}
                                onJoinSubmit={handleJoinLink}
                            />
                        )}
                        {mode === 'create' && (
                            <Create peer={peer} setStatus={setStatus} onopen={onopen} onmessage={onmessage} back={cleanup} />
                        )}
                        {mode === 'join' && (
                            <Join peer={peer} setStatus={setStatus} onopen={onopen} onmessage={onmessage} back={cleanup} />
                        )}
                    </div>
                </div>
                <p className="sub pop pop-3">no accounts · no servers · just you two</p>
            </div>
        </main>
    )
}

function MeetBar({ named, onNew, onJoinSubmit }: {
    named: boolean
    onNew: () => void
    onJoinSubmit: (link: string) => void
}) {
    const [link, setLink] = useState('')
    const hasLink = link.trim().length > 0

    function tryJoin() {
        if (hasLink) onJoinSubmit(link.trim())
    }

    return (
        <div className="meet-bar pop">
            <button
                className="meet-new"
                onClick={onNew}
                disabled={!named}
            >
                <i className="fa-solid fa-fire" />
                new room
            </button>

            <div className="meet-input-wrap">
                <i className="fa-solid fa-keyboard meet-input-icon" />
                <input
                    className="meet-input"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && tryJoin()}
                    placeholder="enter a code or link"
                    disabled={!named}
                />
            </div>

            <button
                className={`meet-join ${hasLink && named ? 'active' : ''}`}
                onClick={tryJoin}
                disabled={!named || !hasLink}
            >
                join
            </button>
        </div>
    )
}

function Create({
    peer, setStatus, onopen, onmessage, back
}: {
    peer: React.MutableRefObject<Peer | null>
    setStatus: (s: Status) => void
    onopen: () => void
    onmessage: (data: string) => void
    back: () => void
}) {
    const [invite, setInvite] = useState('')
    const [copied, setCopied] = useState(false)
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true
        setStatus('generating')
        host(onopen, onmessage).then(({ peer: p, link, room }) => {
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
            return `${u.host}/#room=${room}`
        } catch { return url }
    }

    return (
        <div className="mode pop">
            <div className="wrap link" onClick={copy}>
                <i className="fa-solid fa-link field-icon" />
                <span className="field" style={{ cursor: 'pointer' }}>
                    {invite ? truncate(invite) : 'generating...'}
                </span>
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} copy-icon`} />
            </div>
            <div className="row">
                <span className="hint"><i className="fa-solid fa-clock" /> waiting for them...</span>
                <button className="home-btn ghost" onClick={back}>cancel</button>
            </div>
        </div>
    )
}

function Join({
    peer, setStatus, onopen, onmessage, back
}: {
    peer: React.MutableRefObject<Peer | null>
    setStatus: (s: Status) => void
    onopen: () => void
    onmessage: (data: string) => void
    back: () => void
}) {
    const [link, setLink] = useState('')
    const started = useRef(false)

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const room = params.get('room')
        if (room && !started.current) {
            started.current = true
            connect(room)
        }
    }, [])

    async function connect(room: string) {
        setStatus('connecting')
        const p = await join(room, onopen, onmessage)
        peer.current = p
    }

    async function manual() {
        if (!link.trim() || started.current) return
        started.current = true
        try {
            const url = new URL(link.trim())
            const room = new URLSearchParams(url.hash.slice(1)).get('room')
            if (!room) return
            await connect(room)
        } catch { }
    }

    return (
        <div className="mode pop">
            <div className="wrap">
                <i className="fa-solid fa-link field-icon" />
                <input
                    className="field"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && manual()}
                    placeholder="paste invite link"
                    autoFocus
                />
            </div>
            <div className="row">
                <button className="home-btn" disabled={!link.trim()} onClick={manual}>
                    <i className="fa-solid fa-arrow-right" /> join
                </button>
                <span className="divider">/</span>
                <button className="home-btn ghost" onClick={back}>back</button>
            </div>
        </div>
    )
}