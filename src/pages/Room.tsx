import { useCallback, useEffect, useRef, useState } from 'react'
import { pack, unpack } from '../lib/messages'
import { type Peer, send } from '../lib/rtc'
import { Player, type PlayerHandle } from '../components/Player'

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
    title?: string
    thumb?: string
}

interface Props {
    peer: Peer
    name: string
    leave: () => void
}

const toGroups = (messages: Message[], name: string): Group[] => {
    const groups: Group[] = []
    for (const m of messages) {
        const last = groups[groups.length - 1]
        const mine = m.sender === name
        if (last && last.sender === m.sender && m.stamp - last.stamp < 120000) {
            last.texts.push(m.text)
            last.stamp = m.stamp
        } else {
            groups.push({ id: m.id, sender: mine ? 'you' : m.sender, texts: [m.text], mine, stamp: m.stamp })
        }
    }
    return groups
}

const av = (n: string) => n.slice(0, 2).toUpperCase()

const isYT = (url: string) =>
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url.trim())

const normalize = (url: string): string =>
    /^https?:\/\//i.test(url) ? url : `https://${url}`

const ytID = (url: string): string | null => {
    try {
        const u = new URL(normalize(url))
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0] || null
        if (u.hostname.includes('youtube.com')) {
            if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null
            return u.searchParams.get('v')
        }
    } catch {
        return null
    }
    return null
}

const ytThumb = (url: string): string | undefined => {
    const id = ytID(url)
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined
}

const ytDetails = async (url: string): Promise<Pick<Item, 'title' | 'thumb'>> => {
    const thumb = ytThumb(url)
    try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(normalize(url))}`)
        if (!res.ok) throw new Error('unavailable')
        const data = await res.json() as { title?: string; thumbnail_url?: string }
        return { title: data.title?.trim() || 'YouTube video', thumb: data.thumbnail_url || thumb }
    } catch {
        return { title: 'YouTube video', thumb }
    }
}

const waitForIce = (conn: RTCPeerConnection): Promise<void> => {
    if (conn.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise(resolve => {
        const done = () => {
            conn.removeEventListener('icegatheringstatechange', onState)
            resolve()
        }
        const onState = () => { if (conn.iceGatheringState === 'complete') done() }
        conn.addEventListener('icegatheringstatechange', onState)
        setTimeout(done, 1800)
    })
}

export const Room = ({ peer, name, leave }: Props) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [queue, setQueue] = useState<Item[]>([])
    const [current, setCurrent] = useState<Item | null>(null)
    const [draft, setDraft] = useState('')
    const [input, setInput] = useState('')
    const [ytError, setYtError] = useState(false)
    const [showQueue, setShowQueue] = useState(false)
    const [chatOpen, setChatOpen] = useState(true)
    const [sideOpen, setSideOpen] = useState(true)
    const [other, setOther] = useState('')
    const [left, setLeft] = useState(false)
    const [local, setLocal] = useState<MediaStream | null>(null)
    const [remote, setRemote] = useState<MediaStream | null>(null)
    const [mic, setMic] = useState(false)
    const [cam, setCam] = useState(false)
    const [remoteCam, setRemoteCam] = useState(false)
    const [remoteMic, setRemoteMic] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const bottom = useRef<HTMLDivElement>(null)
    const player = useRef<PlayerHandle>(null)
    const localVid = useRef<HTMLVideoElement>(null)
    const remoteVid = useRef<HTMLVideoElement>(null)
    const localRef = useRef<MediaStream | null>(null)
    const trackIds = useRef(new Set<string>())
    const timer = useRef<number | null>(null)

    const bc = useCallback((kind: Parameters<typeof pack>[0], payload: unknown) => {
        send(peer, pack(kind, payload))
    }, [peer])

    const negotiate = useCallback(async () => {
        if (peer.channel?.readyState !== 'open') return
        await peer.conn.setLocalDescription(await peer.conn.createOffer())
        await waitForIce(peer.conn)
        bc('media-offer', peer.conn.localDescription)
    }, [bc, peer])

    const answer = useCallback(async (desc: RTCSessionDescriptionInit) => {
        await peer.conn.setRemoteDescription(desc)
        await peer.conn.setLocalDescription(await peer.conn.createAnswer())
        await waitForIce(peer.conn)
        bc('media-answer', peer.conn.localDescription)
    }, [bc, peer])

    const receive = useCallback((raw: string) => {
        const msg = unpack(raw)
        if (msg.kind === 'chat') setMessages(prev => [...prev, msg.payload as Message])
        if (msg.kind === 'queue') setQueue(msg.payload as Item[])
        if (msg.kind === 'next') setCurrent(msg.payload as Item | null)
        if (msg.kind === 'play') player.current?.playVideo()
        if (msg.kind === 'pause') player.current?.pauseVideo()
        if (msg.kind === 'seek') player.current?.seekTo(msg.payload as number, true)
        if (msg.kind === 'media-offer') void answer(msg.payload as RTCSessionDescriptionInit)
        if (msg.kind === 'media-answer') void peer.conn.setRemoteDescription(msg.payload as RTCSessionDescriptionInit)
        if (msg.kind === 'media-state') {
            const state = msg.payload as { camOn?: boolean; micOn?: boolean }
            setRemoteCam(!!state.camOn)
            setRemoteMic(!!state.micOn)
        }
        if (msg.kind === 'name') {
            setOther((msg.payload as { name: string }).name)
            setLeft(false)
        }
    }, [answer, peer])

    useEffect(() => {
        if (peer.channel) peer.channel.onmessage = e => receive(e.data)
        peer.onmessage = receive

        peer.conn.ontrack = e => {
            const stream = e.streams[0]
            if (stream) setRemote(stream)
        }

        const ch = peer.channel
        if (ch) {
            const orig = ch.onclose
            ch.onclose = e => {
                setLeft(true)
                if (typeof orig === 'function') orig.call(ch, e)
            }
        }

        peer.conn.onconnectionstatechange = () => {
            const state = peer.conn.connectionState
            if (state === 'connected') {
                if (timer.current) window.clearTimeout(timer.current)
                timer.current = null
                setLeft(false)
                return
            }
            if (state === 'failed' || state === 'closed') { setLeft(true); return }
            if (state === 'disconnected' && !timer.current) {
                timer.current = window.setTimeout(() => {
                    if (peer.conn.connectionState === 'disconnected') setLeft(true)
                    timer.current = null
                }, 10000)
            }
        }
    }, [peer, receive])

    useEffect(() => {
        const t = setTimeout(() => send(peer, pack('name', { name })), 600)
        return () => clearTimeout(t)
    }, [name, peer])

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        if (current) {
            const t = setTimeout(() => player.current?.playVideo(), 800)
            return () => clearTimeout(t)
        }
    }, [current])

    useEffect(() => {
        if (localVid.current) localVid.current.srcObject = local
        if (remoteVid.current) remoteVid.current.srcObject = remote
    }, [local, remote])

    useEffect(() => {
        return () => {
            if (timer.current) window.clearTimeout(timer.current)
            localRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [])

    const startMedia = async (withVideo: boolean) => {
        setBusy(true)
        setError('')
        try {
            let stream = localRef.current
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
                    video: withVideo,
                })
            } else if (withVideo && !stream.getVideoTracks().length) {
                const vid = await navigator.mediaDevices.getUserMedia({ video: true })
                vid.getVideoTracks().forEach(t => stream?.addTrack(t))
            }

            for (const track of stream.getTracks()) {
                if (!trackIds.current.has(track.id)) {
                    peer.conn.addTrack(track, stream)
                    trackIds.current.add(track.id)
                }
                track.enabled = true
            }

            localRef.current = stream
            setLocal(stream)
            const nextMic = stream.getAudioTracks().some(t => t.enabled)
            const nextCam = stream.getVideoTracks().some(t => t.enabled)
            setMic(nextMic)
            setCam(nextCam)
            await negotiate()
            bc('media-state', { micOn: nextMic, camOn: nextCam })
        } catch {
            setError('camera or microphone permission was blocked')
        } finally {
            setBusy(false)
        }
    }

    const toggleMic = () => {
        const stream = localRef.current
        if (!stream?.getAudioTracks().length) { void startMedia(false); return }
        const next = !mic
        stream.getAudioTracks().forEach(t => { t.enabled = next })
        setMic(next)
        bc('media-state', { micOn: next, camOn: cam })
    }

    const toggleCam = () => {
        const stream = localRef.current
        if (!stream?.getVideoTracks().length) { void startMedia(true); return }
        const next = !cam
        stream.getVideoTracks().forEach(t => { t.enabled = next })
        setCam(next)
        bc('media-state', { micOn: mic, camOn: next })
    }

    const sendMsg = () => {
        if (!draft.trim()) return
        const m: Message = { id: crypto.randomUUID(), sender: name, text: draft.trim(), stamp: Date.now() }
        setMessages(prev => [...prev, m])
        bc('chat', m)
        setDraft('')
    }

    const addYT = async () => {
        const url = input.trim()
        if (!url) return
        if (!isYT(url)) { setYtError(true); setTimeout(() => setYtError(false), 1800); return }
        const norm = normalize(url)
        const details = await ytDetails(norm)
        const item: Item = { id: crypto.randomUUID().slice(0, 8), url: norm, ...details }
        const next = [...queue, item]
        setQueue(next)
        bc('queue', next)
        setInput('')
        if (!current) advance(item, next)
    }

    const advance = (item: Item, remaining: Item[]) => {
        setCurrent(item)
        bc('next', item)
        const rest = remaining.filter(i => i.id !== item.id)
        setQueue(rest)
        bc('queue', rest)
    }

    const skip = () => {
        if (!queue.length) { setCurrent(null); bc('next', null); return }
        advance(queue[0], queue)
    }

    const stop = () => {
        setCurrent(null)
        bc('next', null)
        setQueue([])
        bc('queue', [])
    }

    const groups = toGroups(messages, name)
    const label = left ? `${other || 'they'} left` : other ? `${name} + ${other}` : 'waiting for a friend'

    return (
        <div className="flex h-screen flex-col gap-3 overflow-hidden bg-cocoa-900 p-3 text-ember-50">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-plum-900 px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-bold text-ember-50">
                        <i className="fa-solid fa-fire text-ember-400" />
                        bonfire
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-ember-100/55">{label}</p>
                </div>

                <div className="flex items-center gap-2">
                    <Btn active={chatOpen} tone="panel" onClick={() => setChatOpen(v => !v)} title={chatOpen ? 'hide chat' : 'show chat'}>
                        <i className="fa-regular fa-comments" />
                    </Btn>
                    <Btn active={sideOpen} tone="panel" onClick={() => setSideOpen(v => !v)} title={sideOpen ? 'hide panels' : 'show panels'}>
                        <i className="fa-solid fa-table-columns" />
                    </Btn>
                    <Btn active={showQueue} tone="panel" onClick={() => { setShowQueue(v => !v); setSideOpen(true) }} title="queue">
                        <i className="fa-solid fa-list-ul" />
                        {queue.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-berry-300 px-1 text-[0.65rem] font-bold text-white">{queue.length}</span>}
                    </Btn>
                    <Btn active={mic} danger={!mic && !!local} tone="media" onClick={toggleMic} title={mic ? 'mute mic' : 'start voice'}>
                        <i className={`fa-solid ${mic ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                    </Btn>
                    <Btn active={cam} danger={!cam && !!local} tone="media" onClick={toggleCam} title={cam ? 'turn camera off' : 'start video'}>
                        <i className={`fa-solid ${cam ? 'fa-video' : 'fa-video-slash'}`} />
                    </Btn>
                    {current && (
                        <>
                            <Btn onClick={skip} title="skip">
                                <i className="fa-solid fa-forward-step" />
                            </Btn>
                            <Btn danger onClick={stop} title="stop">
                                <i className="fa-solid fa-stop" />
                            </Btn>
                        </>
                    )}
                    <Btn danger onClick={leave} title="leave">
                        <i className="fa-solid fa-arrow-right-from-bracket" />
                    </Btn>
                </div>
            </header>

            {error && (
                <div className="shrink-0 rounded-[1.25rem] bg-berry-300/15 px-4 py-3 text-sm font-bold text-berry-300">
                    {error}
                </div>
            )}

            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
                <div className={`hidden shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out xl:block ${chatOpen ? 'w-[300px] opacity-100 translate-x-0' : 'w-0 -translate-x-3 opacity-0 pointer-events-none'}`}>
                    <Chat
                        groups={groups}
                        other={other}
                        left={left}
                        draft={draft}
                        setDraft={setDraft}
                        send={sendMsg}
                        bottom={bottom}
                    />
                </div>

                <main className="flex min-w-0 flex-1 flex-col gap-3 transition-all duration-300 ease-out">
                    <section className="relative min-h-[360px] flex-1 overflow-hidden rounded-[1.75rem] bg-cocoa-800">
                        {current ? (
                            <Player
                                url={current.url}
                                ref={player}
                                onPlay={() => bc('play', null)}
                                onPause={() => bc('pause', null)}
                                onSeek={t => bc('seek', t)}
                            />
                        ) : (
                            <div className="grid h-full place-items-center px-6 text-center">
                                <div className="max-w-sm space-y-4">
                                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] bg-ember-400/15 text-3xl text-ember-400">
                                        <i className="fa-solid fa-fire" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-ember-50">ready when you are</h2>
                                        <p className="mt-2 text-sm font-semibold leading-6 text-ember-100/45">
                                            {left ? `${other} left the room.` : other ? 'Add a video or start a call.' : 'Waiting for someone to join.'}
                                        </p>
                                    </div>
                                    {other && !left && (
                                        <button className="rounded-full bg-ember-400 px-5 py-3 text-sm font-bold text-white hover:bg-ember-500" onClick={() => { setShowQueue(true); setSideOpen(true) }}>
                                            <i className="fa-solid fa-plus mr-2" />
                                            add video
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {!chatOpen && (
                        <div className="flex items-center gap-2 rounded-[1.35rem] bg-plum-900 px-3 py-2 xl:hidden">
                            <input
                                className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-ember-50 placeholder:text-ember-100/30"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMsg()}
                                placeholder={other && !left ? `message ${other}` : 'say something'}
                            />
                            <button className="grid h-10 w-10 place-items-center rounded-full bg-ember-400 text-white transition hover:bg-ember-500 disabled:opacity-30" onClick={sendMsg} disabled={!draft.trim()}>
                                <i className="fa-solid fa-paper-plane text-sm" />
                            </button>
                        </div>
                    )}
                </main>

                <div className={`hidden shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out xl:block ${sideOpen ? 'w-[320px] opacity-100 translate-x-0' : 'w-0 translate-x-3 opacity-0 pointer-events-none'}`}>
                    <aside className="grid h-full min-h-0 gap-3 xl:grid-rows-[auto_1fr]">
                        <Call
                            name={name}
                            other={other}
                            left={left}
                            remote={remote}
                            remoteCam={remoteCam}
                            remoteMic={remoteMic}
                            local={local}
                            cam={cam}
                            mic={mic}
                            localVid={localVid}
                            remoteVid={remoteVid}
                            busy={busy}
                            start={startMedia}
                        />

                        <Queue
                            show={showQueue}
                            setShow={setShowQueue}
                            ytError={ytError}
                            input={input}
                            setInput={setInput}
                            setYtError={setYtError}
                            add={addYT}
                            current={current}
                            queue={queue}
                        />
                    </aside>
                </div>
            </div>
        </div>
    )
}

const Chat = ({ groups, other, left, draft, setDraft, send, bottom }: {
    groups: Group[]
    other: string
    left: boolean
    draft: string
    setDraft: (v: string) => void
    send: () => void
    bottom: React.RefObject<HTMLDivElement | null>
}) => (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] bg-plum-900">
        <div className="flex items-center justify-between px-4 py-3">
            <div>
                <h2 className="text-sm font-bold text-ember-50">chat</h2>
                <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                    {other && !left ? `with ${other}` : left ? `${other} left` : 'waiting'}
                </p>
            </div>
        </div>

        {left && (
            <div className="mx-3 mb-2 rounded-[1.1rem] bg-berry-300/15 px-3 py-2 text-xs font-bold text-berry-300">
                {other} disconnected. They can rejoin with the same link or code.
            </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.length === 0 && (
                <div className="grid h-full place-items-center text-center text-sm font-semibold text-ember-100/35">
                    <div className="space-y-2">
                        <i className="fa-regular fa-comment text-2xl" />
                        <p>no messages yet</p>
                    </div>
                </div>
            )}
            {groups.map(g => (
                <div key={g.id} className={`flex items-end gap-2 ${g.mine ? 'flex-row-reverse' : ''}`}>
                    {!g.mine && <Avatar name={g.sender} small tone="them" />}
                    <div className={`flex max-w-[82%] flex-col gap-1 ${g.mine ? 'items-end' : 'items-start'}`}>
                        {!g.mine && <span className="px-2 text-xs font-bold text-ember-100/35">{g.sender}</span>}
                        {g.texts.map((t, i) => (
                            <span key={i} className={`break-words rounded-[1.15rem] px-3 py-2 text-sm font-semibold leading-6 ${g.mine ? 'bg-ember-400 text-white' : 'bg-cocoa-800 text-ember-50'}`}>
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
            <div ref={bottom} />
        </div>

        <div className="p-3">
            <div className="flex items-center gap-2 rounded-[1.25rem] bg-cocoa-800 px-3 py-2">
                <input
                    className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-ember-50 placeholder:text-ember-100/30"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && send()}
                    placeholder={other && !left ? `message ${other}` : 'say something'}
                />
                <button className="grid h-9 w-9 place-items-center rounded-full bg-ember-400 text-white transition hover:bg-ember-500 disabled:opacity-30" onClick={send} disabled={!draft.trim()}>
                    <i className="fa-solid fa-paper-plane text-xs" />
                </button>
            </div>
        </div>
    </aside>
)

const Call = ({ name, other, left, remote, remoteCam, remoteMic, local, cam, mic, localVid, remoteVid, busy, start }: {
    name: string
    other: string
    left: boolean
    remote: MediaStream | null
    remoteCam: boolean
    remoteMic: boolean
    local: MediaStream | null
    cam: boolean
    mic: boolean
    localVid: React.RefObject<HTMLVideoElement | null>
    remoteVid: React.RefObject<HTMLVideoElement | null>
    busy: boolean
    start: (withVideo: boolean) => void
}) => (
    <section className="grid min-h-0 gap-3 rounded-[1.75rem] bg-plum-900 p-3">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-sm font-bold text-ember-50">call</h2>
                <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                    {other && !left ? 'connected' : left ? 'disconnected' : 'idle'}
                </p>
            </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Tile label={other || 'friend'} ref={remoteVid} active={!!remote && remoteCam} muted={false} mic={remoteMic} stream={!!remote} />
            <Tile label={name || 'you'} ref={localVid} active={!!local && cam} muted mic={mic} stream={!!local} />
        </div>

        {!local && (
            <div className="grid grid-cols-2 gap-2">
                <button className="rounded-full bg-cocoa-800 px-4 py-3 text-sm font-bold text-ember-100 hover:bg-cocoa-700 disabled:opacity-40" disabled={busy} onClick={() => start(false)}>
                    voice
                </button>
                <button className="rounded-full bg-ember-400 px-4 py-3 text-sm font-bold text-white hover:bg-ember-500 disabled:opacity-40" disabled={busy} onClick={() => start(true)}>
                    video
                </button>
            </div>
        )}
    </section>
)

const Queue = ({ show, setShow, ytError, input, setInput, setYtError, add, current, queue }: {
    show: boolean
    setShow: (v: boolean | ((v: boolean) => boolean)) => void
    ytError: boolean
    input: string
    setInput: (v: string) => void
    setYtError: (v: boolean) => void
    add: () => void
    current: Item | null
    queue: Item[]
}) => (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] bg-plum-900 p-3">
        <div className="mb-3 flex items-center justify-between">
            <div>
                <h2 className="text-sm font-bold text-ember-50">queue</h2>
                <p className="mt-0.5 text-xs font-bold text-ember-100/45">{queue.length + (current ? 1 : 0)} videos</p>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-50" onClick={() => setShow(v => !v)}>
                <i className={`fa-solid ${show ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
            </button>
        </div>

        {show && (
            <>
                <div className={`mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[1.2rem] bg-cocoa-800 px-3 py-2 ${ytError ? 'bg-berry-300/15' : ''}`}>
                    <input
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30"
                        value={input}
                        onChange={e => { setInput(e.target.value); setYtError(false) }}
                        onKeyDown={e => e.key === 'Enter' && add()}
                        placeholder={ytError ? 'youtube only' : 'youtube url'}
                    />
                    <button className="w-14 shrink-0 rounded-full bg-ember-400 py-2 text-sm font-bold text-white hover:bg-ember-500 disabled:opacity-30" onClick={add} disabled={!input.trim()}>
                        add
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {current && <QItem index="now" item={current} active />}
                    {queue.map((item, i) => <QItem key={item.id} index={`${i + 1}`} item={item} />)}
                    {!current && !queue.length && <p className="py-4 text-center text-sm font-semibold text-ember-100/35">nothing here yet</p>}
                </div>
            </>
        )}
    </section>
)

const Avatar = ({ name, tone, small = false }: { name: string; tone: 'me' | 'them'; small?: boolean }) => (
    <div className={`${small ? 'h-7 w-7 text-[0.65rem]' : 'h-10 w-10 text-xs'} grid shrink-0 place-items-center rounded-full font-bold ${tone === 'me' ? 'bg-ember-400 text-white' : 'bg-mint-300 text-white'}`}>
        {av(name)}
    </div>
)

const Btn = ({ children, active = false, danger = false, tone = 'default', onClick, title }: {
    children: React.ReactNode
    active?: boolean
    danger?: boolean
    tone?: 'default' | 'panel' | 'media'
    onClick: () => void
    title: string
}) => {
    const cls = danger
        ? 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'
        : active
            ? tone === 'media' ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85'
                : tone === 'panel' ? 'bg-plum-700 text-ember-50 hover:bg-cocoa-700'
                    : 'bg-ember-400 text-white hover:bg-ember-500'
            : 'bg-cocoa-800 text-ember-100/65 hover:bg-cocoa-700 hover:text-ember-50'

    return (
        <button className={`relative grid h-11 w-11 place-items-center rounded-full transition ${cls}`} onClick={onClick} title={title}>
            {children}
        </button>
    )
}

const Tile = ({ label, ref, active, muted, mic, stream }: {
    label: string
    ref: React.RefObject<HTMLVideoElement | null>
    active: boolean
    muted: boolean
    mic: boolean
    stream: boolean
}) => (
    <div className="relative min-h-36 overflow-hidden rounded-[1.75rem] bg-plum-900">
        <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${active ? 'block' : 'hidden'}`} />
        {!active && (
            <div className="grid h-full min-h-36 place-items-center text-center">
                <div className="space-y-2">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cocoa-800 text-sm font-bold text-ember-100/55">
                        {av(label)}
                    </div>
                    <p className="text-xs font-bold uppercase text-ember-100/35">{label}</p>
                </div>
            </div>
        )}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-cocoa-900/80 px-2.5 py-1">
            {stream && (
                <i className={`fa-solid text-[0.6rem] ${mic ? 'fa-microphone text-ember-100/50' : 'fa-microphone-slash text-berry-300/70'}`} />
            )}
            <span className="text-xs font-bold text-white">{label}</span>
        </div>
    </div>
)

const QItem = ({ index, item, active = false }: { index: string; item: Item; active?: boolean }) => (
    <div className={`flex items-center gap-3 rounded-[1.1rem] px-3 py-2 ${active ? 'bg-ember-400/15' : 'bg-cocoa-800'}`}>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-ember-400 text-white' : 'bg-plum-700 text-ember-100/55'}`}>
            {index}
        </span>
        {item.thumb ? (
            <img className="h-12 w-20 shrink-0 rounded-[0.75rem] object-cover" src={item.thumb} alt="" />
        ) : (
            <span className="grid h-12 w-20 shrink-0 place-items-center rounded-[0.75rem] bg-plum-700 text-ember-100/45">
                <i className="fa-solid fa-play text-xs" />
            </span>
        )}
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ember-50">{item.title || 'YouTube video'}</span>
            <span className="block truncate text-xs font-semibold text-ember-100/45">{item.url}</span>
        </span>
    </div>
)