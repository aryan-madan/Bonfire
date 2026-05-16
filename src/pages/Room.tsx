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

function avatar(n: string): string {
    return n.slice(0, 2).toUpperCase()
}

export function Room({ peer, name, leave }: Props) {
    const [messages, setMessages] = useState<Message[]>([])
    const [queue, setQueue] = useState<Item[]>([])
    const [current, setCurrent] = useState<Item | null>(null)
    const [draft, setDraft] = useState('')
    const [input, setInput] = useState('')
    const [adding, setAdding] = useState(false)
    const [other, setOther] = useState('')
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
        if (msg.kind === 'name') setOther((msg.payload as any).name)
    }, [])

    useEffect(() => {
        if (peer.channel) peer.channel.onmessage = e => receive(e.data)
        peer.onmessage = receive
    }, [receive])

    useEffect(() => {
        const timer = setTimeout(() => send(peer, pack('name', { name })), 600)
        return () => clearTimeout(timer)
    }, [])

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function broadcast(kind: Parameters<typeof pack>[0], payload: unknown) {
        send(peer, pack(kind, payload))
    }

    function sendMsg() {
        if (!draft.trim()) return
        const m: Message = { id: crypto.randomUUID(), sender: name, text: draft.trim(), stamp: Date.now() }
        setMessages(prev => [...prev, m])
        broadcast('chat', m)
        setDraft('')
    }

    function addToQueue() {
        if (!input.trim()) return
        const item: Item = { id: crypto.randomUUID().slice(0, 8), url: input.trim() }
        const next = [...queue, item]
        setQueue(next)
        broadcast('queue', next)
        setInput('')
        setAdding(false)
        if (!current) advance(item, next)
    }

    function advance(item: Item, remaining: Item[]) {
        setCurrent(item)
        broadcast('next', item)
        const rest = remaining.filter(i => i.id !== item.id)
        setQueue(rest)
        broadcast('queue', rest)
    }

    function skip() {
        if (queue.length === 0) { setCurrent(null); broadcast('next', null); return }
        advance(queue[0], queue)
    }

    function stopVideo() {
        setCurrent(null); broadcast('next', null)
        setQueue([]); broadcast('queue', [])
    }

    const groups = toGroups(messages, name)

    return (
        <div className="room">

            <div className="rail">
                <div className="rail-logo">
                    <i className="fa-solid fa-fire" />
                </div>
<div className="rail-members" style={{ justifyContent: current ? 'flex-start' : 'center' }}>
    <div className="avatar mine" title={name}>{avatar(name)}</div>
    {other && <div className="avatar them" title={other}>{avatar(other)}</div>}
</div>
                <div className="rail-bottom">
                    <button className="rail-btn danger" onClick={leave} title="leave">
                        <i className="fa-solid fa-phone-slash" />
                    </button>
                </div>
            </div>

            <div className="sidebar">
                <div className="sidebar-head">
                    <span className="channel-name">
                        <i className="fa-solid fa-fire-flame-curved" /> bonfire
                    </span>
                    {other && (
                        <div className="in-call">
                            <span className="online-dot" />
                            <span>{name}</span>
                            <span style={{ opacity: 0.4 }}>&</span>
                            <span>{other}</span>
                        </div>
                    )}
                </div>

                <div className="msgs">
                    {groups.length === 0 && (
                        <div className="empty-chat">
                            <i className="fa-solid fa-fire" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }} />
                            say something :3
                        </div>
                    )}
                    {groups.map(g => (
                        <div key={g.id} className={`group ${g.mine ? 'mine' : 'theirs'}`}>
                            {!g.mine && <span className="sender">{g.sender}</span>}
                            <div className="bubbles">
                                {g.texts.map((t, i) => {
                                    const first = i === 0
                                    const last = i === g.texts.length - 1
                                    const br = g.mine
                                        ? `${first ? '1.2rem' : '0.3rem'} 0.3rem ${last ? '1.2rem' : '0.3rem'} 1.2rem`
                                        : `0.3rem ${first ? '1.2rem' : '0.3rem'} ${last ? '1.2rem' : '0.3rem'} 0.3rem`
                                    return <span key={i} className="bubble" style={{ borderRadius: br }}>{t}</span>
                                })}
                            </div>
                        </div>
                    ))}
                    <div ref={bottom} />
                </div>

                <div className="composer-wrap">
                    {adding ? (
                        <div className="composer adder-mode">
                            <i className="fa-brands fa-youtube" style={{ color: 'var(--rose)' }} />
                            <input
                                className="draft"
                                value={input}
                                autoFocus
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addToQueue(); if (e.key === 'Escape') setAdding(false) }}
                                placeholder="paste youtube url..."
                            />
                            <button className="send" onClick={addToQueue} disabled={!input.trim()}>add</button>
                            <button className="cancel" onClick={() => setAdding(false)}>
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                    ) : (
                        <div className="composer">
                            <button className="icon-btn" onClick={() => setAdding(true)} title="add video">
                                <i className="fa-solid fa-circle-play" />
                            </button>
                            <input
                                className="draft"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                                placeholder={`message bonfire...`}
                            />
                            {draft.trim() && (
                                <button className="send" onClick={sendMsg}>
                                    <i className="fa-solid fa-paper-plane" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="main">
                <div className="main-head">
                    <span className="main-title">
                        {current ? 'watching together' : 'bonfire room'}
                    </span>
                    <div className="main-actions">
                        {current && (
                            <>
                                <button className="top-btn" onClick={skip}>
                                    <i className="fa-solid fa-forward-step" /> skip
                                </button>
                                <button className="top-btn danger" onClick={stopVideo}>
                                    <i className="fa-solid fa-stop" /> stop
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="stage">
                    <Player
                        url={current?.url ?? null}
                        ref={player}
                        onPlay={() => broadcast('play', null)}
                        onPause={() => broadcast('pause', null)}
                        onSeek={t => broadcast('seek', t)}
                    />
                </div>

                {queue.length > 0 && (
                    <div className="queue-bar">
                        <span className="queue-label">
                            <i className="fa-solid fa-list" /> up next
                        </span>
                        <div className="queue-items">
                            {queue.map((item, i) => (
                                <div key={item.id} className="qitem">
                                    <span className="qnum">{i + 1}</span>
                                    <span className="qurl">{item.url}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

        </div>
    )
}