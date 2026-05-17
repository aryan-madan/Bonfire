import { useState, useEffect, useRef, useCallback } from 'react'
import { type Peer, send } from '../lib/rtc'
import { pack, unpack } from '../lib/messages'
import { Player } from '../components/Player'

interface Message {
    id: string
    sender: string
    text: string
    stamp: number
}

interface Group {
    id: string
    sender: string
    texts: string[]
    mine: boolean
    stamp: number
}

interface Item {
    id: string
    url: string
}

interface Props {
    peer: Peer
    name: string
    leave: () => void
}

function toGroups(messages: Message[], name: string): Group[] {
    const groups: Group[] = []
    for (const m of messages) {
        const last = groups[groups.length - 1]
        const mine = m.sender === name
        if (last && last.sender === m.sender && m.stamp - last.stamp < 120000) {
            last.texts.push(m.text)
        } else {
            groups.push({ id: m.id, sender: mine ? 'you' : m.sender, texts: [m.text], mine, stamp: m.stamp })
        }
    }
    return groups
}

function av(n: string) { return n.slice(0, 2).toUpperCase() }

function isYT(url: string) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url.trim())
}

export function Room({ peer, name, leave }: Props) {
    const [messages, setMessages] = useState<Message[]>([])
    const [queue, setQueue] = useState<Item[]>([])
    const [current, setCurrent] = useState<Item | null>(null)
    const [draft, setDraft] = useState('')
    const [ytInput, setYtInput] = useState('')
    const [ytError, setYtError] = useState(false)
    const [showQueue, setShowQueue] = useState(false)
    const [other, setOther] = useState('')
    const [otherLeft, setOtherLeft] = useState(false)
    const bottom = useRef<HTMLDivElement>(null)
    const player = useRef<any>(null)

    const receive = useCallback((raw: string) => {
        const msg = unpack(raw)
        if (msg.kind === 'chat') setMessages(prev => [...prev, msg.payload as Message])
        if (msg.kind === 'queue') setQueue(msg.payload as Item[])
        if (msg.kind === 'next') setCurrent(msg.payload as Item | null)
        if (msg.kind === 'play') player.current?.playVideo()
        if (msg.kind === 'pause') player.current?.pauseVideo()
        if (msg.kind === 'seek') player.current?.seekTo(msg.payload as number, true)
        if (msg.kind === 'name') {
            setOther((msg.payload as any).name)
            setOtherLeft(false)
        }
    }, [])

    useEffect(() => {
        if (peer.channel) peer.channel.onmessage = e => receive(e.data)
        peer.onmessage = receive

        const channel = peer.channel
        if (channel) {
            const origClose = channel.onclose
            channel.onclose = (e) => {
                setOtherLeft(true)
                if (typeof origClose === 'function') origClose.call(channel, e)
            }
        }

        peer.conn.onconnectionstatechange = () => {
            const state = peer.conn.connectionState
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                setOtherLeft(true)
            }
        }
    }, [receive])

    useEffect(() => {
        const t = setTimeout(() => send(peer, pack('name', { name })), 600)
        return () => clearTimeout(t)
    }, [])

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        if (current) {
            const t = setTimeout(() => player.current?.playVideo(), 800)
            return () => clearTimeout(t)
        }
    }, [current?.id])

    function bc(kind: Parameters<typeof pack>[0], payload: unknown) {
        send(peer, pack(kind, payload))
    }

    function sendMsg() {
        if (!draft.trim()) return
        const m: Message = { id: crypto.randomUUID(), sender: name, text: draft.trim(), stamp: Date.now() }
        setMessages(prev => [...prev, m])
        bc('chat', m)
        setDraft('')
    }

    function addYT() {
        const url = ytInput.trim()
        if (!url) return
        if (!isYT(url)) { setYtError(true); setTimeout(() => setYtError(false), 1800); return }
        const item: Item = { id: crypto.randomUUID().slice(0, 8), url }
        const next = [...queue, item]
        setQueue(next); bc('queue', next)
        setYtInput('')
        if (!current) advance(item, next)
    }

    function advance(item: Item, remaining: Item[]) {
        setCurrent(item); bc('next', item)
        const rest = remaining.filter(i => i.id !== item.id)
        setQueue(rest); bc('queue', rest)
    }

    function skip() {
        if (!queue.length) { setCurrent(null); bc('next', null); return }
        advance(queue[0], queue)
    }

    function stop() {
        setCurrent(null); bc('next', null)
        setQueue([]); bc('queue', [])
    }

    const groups = toGroups(messages, name)

    return (
        <div className="r-shell">

            <div className="r-sidebar">
                <div className="r-sb-top">
                    <div className="r-sb-brand">
                        <i className="fa-solid fa-fire" />
                        <span>bonfire</span>
                    </div>
                    <button className="r-leave" onClick={leave} title="leave">
                        <i className="fa-solid fa-arrow-right-from-bracket" />
                    </button>
                </div>

                <div className="r-who">
                    <div className="r-av r-av--me" title={name}>{av(name)}</div>
                    {other && !otherLeft
                        ? <div className="r-av r-av--them" title={other}>{av(other)}</div>
                        : otherLeft
                            ? <div className="r-av r-av--left" title={`${other} left`}>{av(other)}</div>
                            : <div className="r-av r-av--ghost"><i className="fa-solid fa-ellipsis" /></div>
                    }
                    {other && !otherLeft && <span className="r-who-names">{name} & {other}</span>}
                    {otherLeft && (
                        <span className="r-who-left">
                            {other} left
                            <span className="r-rejoin-hint"> · share the link again to rejoin</span>
                        </span>
                    )}
                </div>

                {otherLeft && (
                    <div className="r-left-banner">
                        <i className="fa-solid fa-circle-exclamation" />
                        <span>{other} disconnected. They can rejoin using the same room link.</span>
                    </div>
                )}

                <div className="r-msgs">
                    {groups.length === 0 && (
                        <div className="r-msgs-empty">
                            <i className="fa-regular fa-comment" />
                            <span>no messages yet</span>
                        </div>
                    )}
                    {groups.map(g => (
                        <div key={g.id} className={`r-group ${g.mine ? 'r-group--mine' : ''}`}>
                            {!g.mine && <div className="r-group-av">{av(g.sender)}</div>}
                            <div className="r-group-col">
                                {!g.mine && <span className="r-group-name">{g.sender}</span>}
                                <div className="r-bubbles">
                                    {g.texts.map((t, i) => <span key={i} className="r-bubble">{t}</span>)}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={bottom} />
                </div>

                <div className="r-composer">
                    <input
                        className="r-draft"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMsg()}
                        placeholder={other && !otherLeft ? `message ${other}…` : 'say something…'}
                    />
                    <button className="r-send" onClick={sendMsg} disabled={!draft.trim()}>
                        <i className="fa-solid fa-paper-plane" />
                    </button>
                </div>
            </div>

            <div className="r-main">
                <div className="r-topbar">
                    <div className="r-tb-left">
                        {current
                            ? <span className="r-watching-pill"><i className="fa-solid fa-circle-play" /> watching together</span>
                            : <span className="r-idle-label">bonfire room</span>
                        }
                    </div>
                    <div className="r-tb-right">
                        {current && (
                            <>
                                <button className="r-tbtn" onClick={skip} title="skip">
                                    <i className="fa-solid fa-forward-step" />
                                </button>
                                <button className="r-tbtn r-tbtn--red" onClick={stop} title="stop">
                                    <i className="fa-solid fa-stop" />
                                </button>
                            </>
                        )}
                        <button
                            className={`r-tbtn ${showQueue ? 'r-tbtn--on' : ''}`}
                            onClick={() => setShowQueue(v => !v)}
                            title="queue"
                        >
                            <i className="fa-brands fa-youtube" />
                            {queue.length > 0 && <span className="r-badge">{queue.length}</span>}
                        </button>
                    </div>
                </div>

                <div className="r-stage">
                    {current ? (
                        <div className="r-player-wrap">
                            <Player
                                url={current.url}
                                ref={player}
                                onPlay={() => bc('play', null)}
                                onPause={() => bc('pause', null)}
                                onSeek={t => bc('seek', t)}
                            />
                        </div>
                    ) : (
                        <div className="r-idle-stage">
                            <div className="r-idle-fire"><i className="fa-solid fa-fire" /></div>
                            <p className="r-idle-msg">
                                {otherLeft
                                    ? `${other} left the room`
                                    : other
                                        ? 'add a youtube video to watch together'
                                        : 'waiting for someone to join…'
                                }
                            </p>
                            {other && !otherLeft && (
                                <button className="r-idle-add" onClick={() => setShowQueue(true)}>
                                    <i className="fa-brands fa-youtube" /> add video
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {showQueue && (
                    <div className="r-queue-panel">
                        <div className="r-qp-head">
                            <span><i className="fa-brands fa-youtube" /> queue</span>
                            <button className="r-qp-close" onClick={() => setShowQueue(false)}>
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>

                        <div className={`r-qp-adder ${ytError ? 'r-qp-adder--err' : ''}`}>
                            <input
                                className="r-qp-input"
                                value={ytInput}
                                autoFocus
                                onChange={e => { setYtInput(e.target.value); setYtError(false) }}
                                onKeyDown={e => e.key === 'Enter' && addYT()}
                                placeholder={ytError ? 'youtube links only…' : 'paste a youtube url…'}
                            />
                            <button className="r-qp-add" onClick={addYT} disabled={!ytInput.trim()}>
                                add
                            </button>
                        </div>

                        {current && (
                            <div className="r-qp-np">
                                <span className="r-qp-np-dot" />
                                <span className="r-qp-np-url">{current.url}</span>
                                <span className="r-qp-np-tag">playing</span>
                            </div>
                        )}

                        {queue.map((item, i) => (
                            <div className="r-qp-item" key={item.id}>
                                <span className="r-qp-num">{i + 1}</span>
                                <span className="r-qp-url">{item.url}</span>
                            </div>
                        ))}

                        {!current && !queue.length && (
                            <p className="r-qp-empty">nothing here yet</p>
                        )}
                    </div>
                )}
            </div>

        </div>
    )
}