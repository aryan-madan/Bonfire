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
        if (last && last.mine === mine && m.stamp - last.stamp < 120000) {
            last.texts.push(m.text)
            last.stamp = m.stamp
        } else {
            groups.push({ id: m.id, sender: m.sender, texts: [m.text], mine, stamp: m.stamp })
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

const bubbleRadius = (mine: boolean, total: number, i: number): string => {
    if (total === 1) return 'rounded-[1.15rem]'
    if (mine) {
        if (i === 0) return 'rounded-[1.15rem] rounded-br-[0.35rem]'
        if (i === total - 1) return 'rounded-[1.15rem] rounded-tr-[0.35rem]'
        return 'rounded-[1.15rem] rounded-r-[0.35rem]'
    }
    if (i === 0) return 'rounded-[1.15rem] rounded-bl-[0.35rem]'
    if (i === total - 1) return 'rounded-[1.15rem] rounded-tl-[0.35rem]'
    return 'rounded-[1.15rem] rounded-l-[0.35rem]'
}

export const Room = ({ peer, name, leave }: Props) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [queue, setQueue] = useState<Item[]>([])
    const [current, setCurrent] = useState<Item | null>(null)
    const [draft, setDraft] = useState('')
    const [input, setInput] = useState('')
    const [ytError, setYtError] = useState(false)
    const [showQueue, setShowQueue] = useState(false)
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
    const [videoHovered, setVideoHovered] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [chatOpen, setChatOpen] = useState(true)
    const bottom = useRef<HTMLDivElement>(null)
    const player = useRef<PlayerHandle>(null)
    const localVid = useRef<HTMLVideoElement>(null)
    const remoteVid = useRef<HTMLVideoElement>(null)
    const localRef = useRef<MediaStream | null>(null)
    const remoteRef = useRef<MediaStream | null>(null)
    const trackIds = useRef(new Set<string>())
    const timer = useRef<number | null>(null)
    const hoverTimer = useRef<number | null>(null)
    const remoteAudioEl = useRef<HTMLAudioElement | null>(null)

    const bc = useCallback((kind: Parameters<typeof pack>[0], payload: unknown) => {
        send(peer, pack(kind, payload))
    }, [peer])

    const makingOffer = useRef(false)
    const ignoreOffer = useRef(false)

    const negotiate = useCallback(async () => {
        if (peer.channel?.readyState !== 'open') return
        ignoreOffer.current = false
        makingOffer.current = true
        try {
            await peer.conn.setLocalDescription(await peer.conn.createOffer())
            await waitForIce(peer.conn)
            bc('media-offer', peer.conn.localDescription)
        } finally {
            makingOffer.current = false
        }
    }, [bc, peer])

    const answer = useCallback(async (desc: RTCSessionDescriptionInit) => {
        const collision = desc.type === 'offer' && (makingOffer.current || peer.conn.signalingState !== 'stable')
        ignoreOffer.current = !peer.polite && collision
        if (ignoreOffer.current) return
        try {
            if (collision) await peer.conn.setLocalDescription({ type: 'rollback' })
            await peer.conn.setRemoteDescription(desc)
            await peer.conn.setLocalDescription(await peer.conn.createAnswer())
            await waitForIce(peer.conn)
            bc('media-answer', peer.conn.localDescription)
        } catch {
            return
        }
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
        if (msg.kind === 'media-answer') void peer.conn.setRemoteDescription(msg.payload as RTCSessionDescriptionInit).catch(() => {})
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
        const conn = peer.conn
        const channel = peer.channel
        const handleMessage = (e: MessageEvent) => receive(e.data)
        const handleTrack = (e: RTCTrackEvent) => {
            const incoming = e.streams[0]?.getTracks() ?? [e.track]
            if (!incoming.length) return
            const stream = new MediaStream(remoteRef.current?.getTracks() ?? [])
            for (const track of incoming) {
                if (!stream.getTracks().some(t => t.id === track.id)) stream.addTrack(track)
            }
            remoteRef.current = stream
            setRemote(stream)
            if (remoteAudioEl.current) {
                remoteAudioEl.current.srcObject = stream
                void remoteAudioEl.current.play().catch(() => {})
            }
        }
        const handleClose = () => {
            setLeft(true)
        }
        const handleNegotiationNeeded = () => { void negotiate() }
        const handleConnectionStateChange = () => {
            const state = conn.connectionState
            if (state === 'connected') {
                if (timer.current) window.clearTimeout(timer.current)
                timer.current = null
                setLeft(false)
                return
            }
            if (state === 'failed' || state === 'closed') { setLeft(true); return }
            if (state === 'disconnected' && !timer.current) {
                timer.current = window.setTimeout(() => {
                    if (conn.connectionState === 'disconnected') setLeft(true)
                    timer.current = null
                }, 10000)
            }
        }
        channel?.addEventListener('message', handleMessage)
        channel?.addEventListener('close', handleClose)
        conn.addEventListener('track', handleTrack)
        conn.addEventListener('negotiationneeded', handleNegotiationNeeded)
        conn.addEventListener('connectionstatechange', handleConnectionStateChange)
        return () => {
            channel?.removeEventListener('message', handleMessage)
            channel?.removeEventListener('close', handleClose)
            conn.removeEventListener('track', handleTrack)
            conn.removeEventListener('negotiationneeded', handleNegotiationNeeded)
            conn.removeEventListener('connectionstatechange', handleConnectionStateChange)
        }
    }, [negotiate, peer, receive])

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
    }, [local])

    useEffect(() => {
        if (!remote) return
        if (remoteAudioEl.current) {
            remoteAudioEl.current.srcObject = remote
            void remoteAudioEl.current.play().catch(() => {})
        }
        if (remoteVid.current) {
            const videoOnly = new MediaStream(remote.getVideoTracks())
            remoteVid.current.srcObject = videoOnly
        }
    }, [remote])

    useEffect(() => {
        const remoteAudio = remoteAudioEl.current
        return () => {
            if (timer.current) window.clearTimeout(timer.current)
            if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
            localRef.current?.getTracks().forEach(t => t.stop())
            if (remoteAudio) { remoteAudio.srcObject = null }
        }
    }, [])

    const startMedia = async (withVideo: boolean) => {
        setBusy(true)
        setError('')
        try {
            let stream = localRef.current
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1,
                    },
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

    const reorderQueue = (next: Item[]) => {
        setQueue(next)
        bc('queue', next)
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

    const handleVideoMouseEnter = () => {
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
        setVideoHovered(true)
    }

    const handleVideoMouseLeave = () => {
        hoverTimer.current = window.setTimeout(() => setVideoHovered(false), 500)
    }

    const groups = toGroups(messages, name)
    const label = left ? `${other || 'they'} left` : other ? `${name} + ${other}` : 'waiting for a friend'

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-cocoa-900 text-ember-50">
            <audio ref={remoteAudioEl} autoPlay className="hidden" />

            <header className="flex items-center gap-2 px-3 pt-3 pb-0 shrink-0 h-14">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-ember-400/15 text-ember-400 shrink-0">
                        <i className="fa-solid fa-fire text-sm" />
                    </div>
                    <span className="text-sm font-bold text-ember-50">bonfire</span>
                    <span className="text-xs font-semibold text-ember-100/30 truncate">· {label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={() => setSidebarOpen(v => !v)}
                        title={sidebarOpen ? 'hide call' : 'show call'}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${sidebarOpen ? 'bg-plum-900 text-ember-100/70' : 'bg-cocoa-800 text-ember-100/45 hover:text-ember-100/80 hover:bg-cocoa-700'}`}
                    >
                        <i className="fa-solid fa-phone text-[0.6rem]" />
                        <span>call</span>
                        {(local || remote) && (
                            <span className="h-1.5 w-1.5 rounded-full bg-mint-300" />
                        )}
                    </button>

                    <button
                        onClick={() => setChatOpen(v => !v)}
                        title={chatOpen ? 'hide chat' : 'show chat'}
                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${chatOpen ? 'bg-plum-900 text-ember-100/70' : 'bg-cocoa-800 text-ember-100/45 hover:text-ember-100/80 hover:bg-cocoa-700'}`}
                    >
                        <i className="fa-regular fa-comment text-[0.6rem]" />
                        <span>chat</span>
                        {!chatOpen && messages.length > 0 && (
                            <span className="h-4 min-w-[1rem] rounded-full bg-ember-400 grid place-items-center text-[0.55rem] font-bold text-white px-1">
                                {messages.length > 9 ? '9+' : messages.length}
                            </span>
                        )}
                    </button>

                    <div className="w-px h-4 bg-ember-100/10 mx-1" />

                    <button
                        onClick={leave}
                        className="flex items-center gap-1.5 rounded-xl bg-berry-300/10 hover:bg-berry-300/20 px-3 py-1.5 text-xs font-bold text-berry-300/70 hover:text-berry-300 transition-all"
                    >
                        <i className="fa-solid fa-arrow-right-from-bracket text-[0.6rem]" />
                        <span>leave</span>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 gap-3 p-3 min-h-0">

                <div
                    className="flex flex-col gap-3 shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ width: sidebarOpen ? '260px' : '0px', opacity: sidebarOpen ? 1 : 0, marginRight: sidebarOpen ? '0' : '-12px' }}
                >
                    <div className="rounded-[1.5rem] bg-plum-900 overflow-hidden w-[260px]">
                        <div className="px-4 pt-3 pb-1">
                            <span className="text-xs font-bold text-ember-50">call</span>
                        </div>
                        <div className="px-3 pb-3 flex flex-col gap-2">
                            <CallTile
                                label={other || 'friend'}
                                vidRef={remoteVid}
                                active={!!remote && remoteCam}
                                muted={false}
                                mic={remoteMic}
                                hasStream={!!remote}
                            />
                            <CallTile
                                label={name || 'you'}
                                vidRef={localVid}
                                active={!!local && cam}
                                muted
                                mic={mic}
                                hasStream={!!local}
                                isMe
                            />
                            {!local ? (
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button
                                        className="rounded-full bg-cocoa-800 py-2.5 text-xs font-bold text-ember-100/70 hover:bg-cocoa-700 disabled:opacity-40 transition-colors"
                                        disabled={busy}
                                        onClick={() => startMedia(false)}
                                    >
                                        <i className="fa-solid fa-microphone mr-1" />
                                        voice
                                    </button>
                                    <button
                                        className="rounded-full bg-ember-400 py-2.5 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-40 transition-colors"
                                        disabled={busy}
                                        onClick={() => startMedia(true)}
                                    >
                                        <i className="fa-solid fa-video mr-1" />
                                        video
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button
                                        onClick={toggleMic}
                                        className={`rounded-full py-2.5 text-xs font-bold transition-colors ${mic ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'}`}
                                    >
                                        <i className={`fa-solid ${mic ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                                    </button>
                                    <button
                                        onClick={toggleCam}
                                        className={`rounded-full py-2.5 text-xs font-bold transition-colors ${cam ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'}`}
                                    >
                                        <i className={`fa-solid ${cam ? 'fa-video' : 'fa-video-slash'}`} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <main className="flex-1 flex flex-col gap-3 min-w-0">
                    {error && (
                        <div className="shrink-0 rounded-2xl bg-berry-300/15 px-4 py-3 text-sm font-bold text-berry-300">
                            <i className="fa-solid fa-triangle-exclamation mr-2" />
                            {error}
                        </div>
                    )}

                    <section
                        className="relative flex-1 rounded-[1.75rem] overflow-hidden bg-cocoa-800 min-h-0"
                        onMouseEnter={handleVideoMouseEnter}
                        onMouseLeave={handleVideoMouseLeave}
                    >
                        {current ? (
                            <>
                                <Player
                                    url={current.url}
                                    ref={player}
                                    onPlay={() => bc('play', null)}
                                    onPause={() => bc('pause', null)}
                                    onSeek={t => bc('seek', t)}
                                />
                                <div
                                    className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${videoHovered ? 'opacity-100' : 'opacity-0'}`}
                                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.6) 100%)' }}
                                />
                                <div className={`absolute top-0 right-0 flex items-center gap-2 px-4 py-3 transition-all duration-200 ${videoHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                                    <button
                                        onClick={skip}
                                        className="flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur px-4 py-2 text-xs font-bold text-white/80 hover:bg-black/70 transition-colors"
                                    >
                                        <i className="fa-solid fa-forward-step" />
                                        skip
                                    </button>
                                    <button
                                        onClick={stop}
                                        className="flex items-center gap-1.5 rounded-full bg-berry-300/20 backdrop-blur px-4 py-2 text-xs font-bold text-berry-300 hover:bg-berry-300/35 transition-colors"
                                    >
                                        <i className="fa-solid fa-stop" />
                                        stop
                                    </button>
                                </div>
                                <div className={`absolute bottom-0 left-0 right-0 transition-all duration-200 ${videoHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                                    <QueueBar
                                        show={showQueue}
                                        setShow={setShowQueue}
                                        ytError={ytError}
                                        input={input}
                                        setInput={setInput}
                                        setYtError={setYtError}
                                        add={addYT}
                                        current={current}
                                        queue={queue}
                                        onReorder={reorderQueue}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="grid h-full place-items-center px-6 text-center">
                                <div className="max-w-sm space-y-5">
                                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.5rem] bg-ember-400/15 text-3xl text-ember-400">
                                        <i className="fa-solid fa-fire" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-ember-50">ready when you are</h2>
                                        <p className="mt-2 text-sm font-semibold leading-6 text-ember-100/45">
                                            {left ? `${other} left the room.` : other ? 'add a youtube video to get started.' : 'waiting for someone to join.'}
                                        </p>
                                    </div>
                                    {other && !left && (
                                        <QueueBar
                                            show={false}
                                            setShow={() => {}}
                                            ytError={ytError}
                                            input={input}
                                            setInput={setInput}
                                            setYtError={setYtError}
                                            add={addYT}
                                            current={null}
                                            queue={queue}
                                            onReorder={reorderQueue}
                                            inline
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </section>
                </main>

                <aside
                    className="shrink-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ width: chatOpen ? '320px' : '0px', opacity: chatOpen ? 1 : 0, marginLeft: chatOpen ? '0' : '-12px' }}
                >
                    <div className="flex-1 flex flex-col rounded-[1.75rem] bg-plum-900 overflow-hidden min-h-0 w-[320px]">
                        <div className="px-4 py-3 shrink-0">
                            <h2 className="text-sm font-bold text-ember-50">chat</h2>
                            <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                                {other && !left ? `with ${other}` : left ? `${other} left` : 'waiting'}
                            </p>
                        </div>

                        {left && (
                            <div className="mx-3 mb-2 shrink-0 rounded-[1.1rem] bg-berry-300/15 px-3 py-2 text-xs font-bold text-berry-300">
                                {other} disconnected. They can rejoin with the same link.
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-0">
                            {groups.length === 0 && (
                                <div className="grid h-full place-items-center text-center text-sm font-semibold text-ember-100/35 py-8">
                                    <div className="space-y-2">
                                        <i className="fa-regular fa-comment text-2xl" />
                                        <p>no messages yet</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-4">
                                {groups.map(g => (
                                    <div key={g.id} className={`flex items-end gap-2 ${g.mine ? 'flex-row-reverse' : ''}`}>
                                        <div className={`h-7 w-7 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0 mb-0.5 ${g.mine ? 'bg-ember-400' : 'bg-mint-300'}`}>
                                            {av(g.sender)}
                                        </div>
                                        <div className={`flex max-w-[78%] flex-col gap-1 ${g.mine ? 'items-end' : 'items-start'}`}>
                                            {!g.mine && <span className="px-2 text-xs font-bold text-ember-100/35">{g.sender}</span>}
                                            {g.texts.map((t, i) => (
                                                <span
                                                    key={i}
                                                    className={`break-words px-3 py-2 text-sm font-semibold leading-5 ${g.mine ? 'bg-ember-400 text-white' : 'bg-cocoa-800 text-ember-50'} ${bubbleRadius(g.mine, g.texts.length, i)}`}
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div ref={bottom} />
                        </div>

                        <div className="p-3 shrink-0">
                            <div className="flex items-center gap-2 rounded-[1.25rem] bg-cocoa-800 px-3 py-2">
                                <input
                                    className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 focus:outline-none"
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMsg()}
                                    placeholder={other && !left ? `message ${other}` : 'say something'}
                                />
                                <button
                                    className="grid h-9 w-9 place-items-center rounded-full bg-ember-400 text-white hover:bg-ember-500 disabled:opacity-30 transition-colors shrink-0"
                                    onClick={sendMsg}
                                    disabled={!draft.trim()}
                                >
                                    <i className="fa-solid fa-paper-plane text-xs" />
                                </button>
                            </div>
                        </div>
                    </div>
                </aside>

            </div>
        </div>
    )
}

const CallTile = ({ label, vidRef, active, muted, mic, hasStream, isMe = false }: {
    label: string
    vidRef: React.RefObject<HTMLVideoElement | null>
    active: boolean
    muted: boolean
    mic: boolean
    hasStream: boolean
    isMe?: boolean
}) => (
    <div className="relative overflow-hidden rounded-[1.25rem] bg-cocoa-800" style={{ aspectRatio: '16/9' }}>
        <video ref={vidRef} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${active ? 'block' : 'hidden'}`} />
        {!active && (
            <div className="grid h-full place-items-center py-4">
                <div className="text-center space-y-2">
                    <div className={`mx-auto h-14 w-14 rounded-full grid place-items-center text-base font-bold ${isMe ? 'bg-ember-400 text-white' : 'bg-mint-300 text-white'}`}>
                        {av(label)}
                    </div>
                    <p className="text-xs font-bold text-ember-100/40">{label}</p>
                </div>
            </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-cocoa-900/75 px-2 py-1">
            {hasStream && (
                <i className={`fa-solid text-[0.55rem] ${mic ? 'fa-microphone text-ember-100/50' : 'fa-microphone-slash text-berry-300/80'}`} />
            )}
            <span className="text-[0.6rem] font-bold text-ember-100/70">{label}</span>
        </div>
    </div>
)

const QueueBar = ({ show, setShow, ytError, input, setInput, setYtError, add, current, queue, onReorder, inline = false }: {
    show: boolean
    setShow: (v: boolean | ((v: boolean) => boolean)) => void
    ytError: boolean
    input: string
    setInput: (v: string) => void
    setYtError: (v: boolean) => void
    add: () => void
    current: Item | null
    queue: Item[]
    onReorder: (next: Item[]) => void
    inline?: boolean
}) => {
    const total = queue.length + (current ? 1 : 0)
    const dragItem = useRef<number | null>(null)
    const dragOver = useRef<number | null>(null)
    const [dragging, setDragging] = useState<number | null>(null)

    const onDragStart = (i: number) => {
        dragItem.current = i
        setDragging(i)
    }
    const onDragEnter = (i: number) => {
        dragOver.current = i
    }
    const onDragEnd = () => {
        if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
            const next = [...queue]
            const [moved] = next.splice(dragItem.current, 1)
            next.splice(dragOver.current, 0, moved)
            onReorder(next)
        }
        dragItem.current = null
        dragOver.current = null
        setDragging(null)
    }

    return (
        <div className={`${inline ? '' : 'px-4 py-3'}`}>
            {show && total > 0 && (
                <div className="mb-2 rounded-[1.25rem] overflow-hidden bg-cocoa-900/85 backdrop-blur max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {current && (
                        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.07]">
                            <div className="h-2 w-2 rounded-full bg-ember-400 animate-pulse shrink-0" />
                            {current.thumb
                                ? <img className="h-10 w-16 rounded-xl object-cover shrink-0" src={current.thumb} alt="" />
                                : <div className="h-10 w-16 rounded-xl bg-cocoa-700 grid place-items-center shrink-0"><i className="fa-solid fa-play text-[0.6rem] text-ember-100/30" /></div>
                            }
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-ember-50 truncate">{current.title || 'YouTube video'}</p>
                                <p className="text-[0.6rem] font-semibold text-ember-400 mt-0.5">playing now</p>
                            </div>
                        </div>
                    )}
                    {queue.map((item, i) => (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={() => onDragStart(i)}
                            onDragEnter={() => onDragEnter(i)}
                            onDragEnd={onDragEnd}
                            onDragOver={e => e.preventDefault()}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0 cursor-grab active:cursor-grabbing select-none transition-all ${dragging === i ? 'opacity-40 bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                        >
                            <i className="fa-solid fa-grip-vertical text-[0.6rem] text-ember-100/25 shrink-0" />
                            <span className="text-[0.6rem] font-bold text-ember-100/30 w-4 text-center shrink-0">{i + 1}</span>
                            {item.thumb
                                ? <img className="h-10 w-16 rounded-xl object-cover shrink-0" src={item.thumb} alt="" />
                                : <div className="h-10 w-16 rounded-xl bg-cocoa-700 grid place-items-center shrink-0"><i className="fa-solid fa-play text-[0.6rem] text-ember-100/30" /></div>
                            }
                            <p className="text-xs font-semibold text-ember-100/75 truncate flex-1">{item.title || 'YouTube video'}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <div className={`flex items-center gap-2 flex-1 rounded-full px-4 py-2.5 transition-all ${inline ? 'bg-cocoa-800' : 'bg-cocoa-900/80 backdrop-blur'} ${ytError ? 'ring-1 ring-berry-300/60' : ''}`}>
                    <i className={`fa-brands fa-youtube text-sm shrink-0 ${ytError ? 'text-berry-300' : 'text-ember-100/30'}`} />
                    <input
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 focus:outline-none"
                        value={input}
                        onChange={e => { setInput(e.target.value); setYtError(false) }}
                        onKeyDown={e => e.key === 'Enter' && add()}
                        placeholder={ytError ? 'youtube links only' : 'paste a youtube link...'}
                    />
                    <button
                        className="shrink-0 rounded-full bg-ember-400 px-4 py-1.5 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-30 transition-colors"
                        onClick={add}
                        disabled={!input.trim()}
                    >
                        add
                    </button>
                </div>

                {!inline && total > 0 && (
                    <button
                        onClick={() => setShow(v => !v)}
                        className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-xs font-bold backdrop-blur transition-all shrink-0 ${show ? 'bg-ember-400/20 text-ember-400' : 'bg-cocoa-900/80 text-ember-100/60 hover:text-ember-50'}`}
                    >
                        <i className="fa-solid fa-list-ul" />
                        <span>{total}</span>
                    </button>
                )}
            </div>
        </div>
    )
}
