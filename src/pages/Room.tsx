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
    thumbnail?: string
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
            last.stamp = m.stamp
        } else {
            groups.push({ id: m.id, sender: mine ? 'you' : m.sender, texts: [m.text], mine, stamp: m.stamp })
        }
    }
    return groups
}

function av(n: string) {
    return n.slice(0, 2).toUpperCase()
}

function isYT(url: string) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url.trim())
}

function normalizeYT(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function ytID(url: string): string | null {
    try {
        const u = new URL(normalizeYT(url))
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

function ytThumb(url: string): string | undefined {
    const id = ytID(url)
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined
}

async function ytDetails(url: string): Promise<Pick<Item, 'title' | 'thumbnail'>> {
    const thumbnail = ytThumb(url)
    try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(normalizeYT(url))}`)
        if (!res.ok) throw new Error('metadata unavailable')
        const data = await res.json() as { title?: string; thumbnail_url?: string }
        return {
            title: data.title?.trim() || 'YouTube video',
            thumbnail: data.thumbnail_url || thumbnail,
        }
    } catch {
        return { title: 'YouTube video', thumbnail }
    }
}

function waitForIce(conn: RTCPeerConnection): Promise<void> {
    if (conn.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise(resolve => {
        const done = () => {
            conn.removeEventListener('icegatheringstatechange', onState)
            resolve()
        }
        const onState = () => {
            if (conn.iceGatheringState === 'complete') done()
        }
        conn.addEventListener('icegatheringstatechange', onState)
        setTimeout(done, 1800)
    })
}

export function Room({ peer, name, leave }: Props) {
    const [messages, setMessages] = useState<Message[]>([])
    const [queue, setQueue] = useState<Item[]>([])
    const [current, setCurrent] = useState<Item | null>(null)
    const [draft, setDraft] = useState('')
    const [ytInput, setYtInput] = useState('')
    const [ytError, setYtError] = useState(false)
    const [showQueue, setShowQueue] = useState(false)
    const [chatOpen, setChatOpen] = useState(true)
    const [sideOpen, setSideOpen] = useState(true)
    const [other, setOther] = useState('')
    const [otherLeft, setOtherLeft] = useState(false)
    const [localStream, setLocalStream] = useState<MediaStream | null>(null)
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
    const [micOn, setMicOn] = useState(false)
    const [camOn, setCamOn] = useState(false)
    const [remoteCamOn, setRemoteCamOn] = useState(false)
    const [mediaBusy, setMediaBusy] = useState(false)
    const [mediaError, setMediaError] = useState('')
    const bottom = useRef<HTMLDivElement>(null)
    const player = useRef<PlayerHandle>(null)
    const localVideo = useRef<HTMLVideoElement>(null)
    const remoteVideo = useRef<HTMLVideoElement>(null)
    const localStreamRef = useRef<MediaStream | null>(null)
    const addedTrackIds = useRef(new Set<string>())
    const disconnectTimer = useRef<number | null>(null)

    const bc = useCallback((kind: Parameters<typeof pack>[0], payload: unknown) => {
        send(peer, pack(kind, payload))
    }, [peer])

    const negotiateMedia = useCallback(async () => {
        if (peer.channel?.readyState !== 'open') return
        await peer.conn.setLocalDescription(await peer.conn.createOffer())
        await waitForIce(peer.conn)
        bc('media-offer', peer.conn.localDescription)
    }, [bc, peer])

    const answerMediaOffer = useCallback(async (description: RTCSessionDescriptionInit) => {
        await peer.conn.setRemoteDescription(description)
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
        if (msg.kind === 'media-offer') void answerMediaOffer(msg.payload as RTCSessionDescriptionInit)
        if (msg.kind === 'media-answer') void peer.conn.setRemoteDescription(msg.payload as RTCSessionDescriptionInit)
        if (msg.kind === 'media-state') {
            const state = msg.payload as { camOn?: boolean }
            setRemoteCamOn(!!state.camOn)
        }
        if (msg.kind === 'name') {
            setOther((msg.payload as { name: string }).name)
            setOtherLeft(false)
        }
    }, [answerMediaOffer, peer])

    useEffect(() => {
        if (peer.channel) peer.channel.onmessage = e => receive(e.data)
        peer.onmessage = receive

        peer.conn.ontrack = e => {
            const stream = e.streams[0]
            if (stream) setRemoteStream(stream)
        }

        const channel = peer.channel
        if (channel) {
            const origClose = channel.onclose
            channel.onclose = e => {
                setOtherLeft(true)
                if (typeof origClose === 'function') origClose.call(channel, e)
            }
        }

        peer.conn.onconnectionstatechange = () => {
            const state = peer.conn.connectionState
            if (state === 'connected') {
                if (disconnectTimer.current) window.clearTimeout(disconnectTimer.current)
                disconnectTimer.current = null
                setOtherLeft(false)
                return
            }
            if (state === 'failed' || state === 'closed') {
                setOtherLeft(true)
                return
            }
            if (state === 'disconnected' && !disconnectTimer.current) {
                disconnectTimer.current = window.setTimeout(() => {
                    if (peer.conn.connectionState === 'disconnected') setOtherLeft(true)
                    disconnectTimer.current = null
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
        if (localVideo.current) localVideo.current.srcObject = localStream
        if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream
    }, [localStream, remoteStream])

    useEffect(() => {
        return () => {
            if (disconnectTimer.current) window.clearTimeout(disconnectTimer.current)
            localStreamRef.current?.getTracks().forEach(track => track.stop())
        }
    }, [])

    async function ensureMedia(withVideo: boolean) {
        setMediaBusy(true)
        setMediaError('')
        try {
            let stream = localStreamRef.current
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
                const video = await navigator.mediaDevices.getUserMedia({ video: true })
                video.getVideoTracks().forEach(track => stream?.addTrack(track))
            }

            for (const track of stream.getTracks()) {
                if (!addedTrackIds.current.has(track.id)) {
                    peer.conn.addTrack(track, stream)
                    addedTrackIds.current.add(track.id)
                }
                track.enabled = true
            }

            localStreamRef.current = stream
            setLocalStream(stream)
            const nextMicOn = stream.getAudioTracks().some(track => track.enabled)
            const nextCamOn = stream.getVideoTracks().some(track => track.enabled)
            setMicOn(nextMicOn)
            setCamOn(nextCamOn)
            await negotiateMedia()
            bc('media-state', { micOn: nextMicOn, camOn: nextCamOn })
        } catch {
            setMediaError('camera or microphone permission was blocked')
        } finally {
            setMediaBusy(false)
        }
    }

    function toggleMic() {
        const stream = localStreamRef.current
        if (!stream?.getAudioTracks().length) {
            void ensureMedia(false)
            return
        }
        const next = !micOn
        stream.getAudioTracks().forEach(track => { track.enabled = next })
        setMicOn(next)
        bc('media-state', { micOn: next, camOn })
    }

    function toggleCam() {
        const stream = localStreamRef.current
        if (!stream?.getVideoTracks().length) {
            void ensureMedia(true)
            return
        }
        const next = !camOn
        stream.getVideoTracks().forEach(track => { track.enabled = next })
        setCamOn(next)
        bc('media-state', { micOn, camOn: next })
    }

    function sendMsg() {
        if (!draft.trim()) return
        const m: Message = { id: crypto.randomUUID(), sender: name, text: draft.trim(), stamp: Date.now() }
        setMessages(prev => [...prev, m])
        bc('chat', m)
        setDraft('')
    }

    async function addYT() {
        const url = ytInput.trim()
        if (!url) return
        if (!isYT(url)) {
            setYtError(true)
            setTimeout(() => setYtError(false), 1800)
            return
        }
        const normalized = normalizeYT(url)
        const details = await ytDetails(normalized)
        const item: Item = { id: crypto.randomUUID().slice(0, 8), url: normalized, ...details }
        const next = [...queue, item]
        setQueue(next)
        bc('queue', next)
        setYtInput('')
        if (!current) advance(item, next)
    }

    function advance(item: Item, remaining: Item[]) {
        setCurrent(item)
        bc('next', item)
        const rest = remaining.filter(i => i.id !== item.id)
        setQueue(rest)
        bc('queue', rest)
    }

    function skip() {
        if (!queue.length) {
            setCurrent(null)
            bc('next', null)
            return
        }
        advance(queue[0], queue)
    }

    function stop() {
        setCurrent(null)
        bc('next', null)
        setQueue([])
        bc('queue', [])
    }

    const groups = toGroups(messages, name)
    const connectedLabel = otherLeft ? `${other || 'they'} left` : other ? `${name} + ${other}` : 'waiting for a friend'

    return (
        <div className="flex h-screen flex-col gap-3 overflow-hidden bg-cocoa-900 p-3 text-ember-50">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-plum-900 px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-bold text-ember-50">
                        <i className="fa-solid fa-fire text-ember-400" />
                        bonfire
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-ember-100/55">{connectedLabel}</p>
                </div>

                <div className="flex items-center gap-2">
                    <ToolbarButton active={chatOpen} tone="panel" onClick={() => setChatOpen(v => !v)} title={chatOpen ? 'hide chat' : 'show chat'}>
                        <i className="fa-regular fa-comments" />
                    </ToolbarButton>
                    <ToolbarButton active={sideOpen} tone="panel" onClick={() => setSideOpen(v => !v)} title={sideOpen ? 'hide panels' : 'show panels'}>
                        <i className="fa-solid fa-table-columns" />
                    </ToolbarButton>
                    <ToolbarButton active={showQueue} tone="panel" onClick={() => { setShowQueue(v => !v); setSideOpen(true) }} title="queue">
                        <i className="fa-solid fa-list-ul" />
                        {queue.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-berry-300 px-1 text-[0.65rem] font-bold text-white">{queue.length}</span>}
                    </ToolbarButton>
                    <ToolbarButton active={micOn} danger={!micOn && !!localStream} tone="media" onClick={toggleMic} title={micOn ? 'mute mic' : 'start voice'}>
                        <i className={`fa-solid ${micOn ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                    </ToolbarButton>
                    <ToolbarButton active={camOn} danger={!camOn && !!localStream} tone="media" onClick={toggleCam} title={camOn ? 'turn camera off' : 'start video'}>
                        <i className={`fa-solid ${camOn ? 'fa-video' : 'fa-video-slash'}`} />
                    </ToolbarButton>
                    {current && (
                        <>
                            <ToolbarButton onClick={skip} title="skip">
                                <i className="fa-solid fa-forward-step" />
                            </ToolbarButton>
                            <ToolbarButton danger onClick={stop} title="stop">
                                <i className="fa-solid fa-stop" />
                            </ToolbarButton>
                        </>
                    )}
                    <ToolbarButton danger onClick={leave} title="leave">
                        <i className="fa-solid fa-arrow-right-from-bracket" />
                    </ToolbarButton>
                </div>
            </header>

            {mediaError && (
                <div className="shrink-0 rounded-[1.25rem] bg-berry-300/15 px-4 py-3 text-sm font-bold text-berry-300">
                    {mediaError}
                </div>
            )}

            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
                <div className={`hidden shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out xl:block ${chatOpen ? 'w-[300px] opacity-100 translate-x-0' : 'w-0 -translate-x-3 opacity-0 pointer-events-none'}`}>
                    <ChatPanel
                        groups={groups}
                        other={other}
                        otherLeft={otherLeft}
                        draft={draft}
                        setDraft={setDraft}
                        sendMsg={sendMsg}
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
                                            {otherLeft ? `${other} left the room.` : other ? 'Add a video or start a call.' : 'Waiting for someone to join.'}
                                        </p>
                                    </div>
                                    {other && !otherLeft && (
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
                                placeholder={other && !otherLeft ? `message ${other}` : 'say something'}
                            />
                            <button className="grid h-10 w-10 place-items-center rounded-full bg-ember-400 text-white transition hover:bg-ember-500 disabled:opacity-30" onClick={sendMsg} disabled={!draft.trim()}>
                                <i className="fa-solid fa-paper-plane text-sm" />
                            </button>
                        </div>
                    )}
                </main>

                <div className={`hidden shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out xl:block ${sideOpen ? 'w-[320px] opacity-100 translate-x-0' : 'w-0 translate-x-3 opacity-0 pointer-events-none'}`}>
                    <aside className="grid h-full min-h-0 gap-3 xl:grid-rows-[auto_1fr]">
                        <CallPanel
                            name={name}
                            other={other}
                            otherLeft={otherLeft}
                            remoteStream={remoteStream}
                            remoteCamOn={remoteCamOn}
                            localStream={localStream}
                            camOn={camOn}
                            localVideo={localVideo}
                            remoteVideo={remoteVideo}
                            mediaBusy={mediaBusy}
                            ensureMedia={ensureMedia}
                        />

                        <QueuePanel
                            showQueue={showQueue}
                            setShowQueue={setShowQueue}
                            ytError={ytError}
                            ytInput={ytInput}
                            setYtInput={setYtInput}
                            setYtError={setYtError}
                            addYT={addYT}
                            current={current}
                            queue={queue}
                        />
                    </aside>
                </div>
            </div>
        </div>
    )
}

function ChatPanel({ groups, other, otherLeft, draft, setDraft, sendMsg, bottom }: {
    groups: Group[]
    other: string
    otherLeft: boolean
    draft: string
    setDraft: (value: string) => void
    sendMsg: () => void
    bottom: React.RefObject<HTMLDivElement | null>
}) {
    return (
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] bg-plum-900">
            <div className="flex items-center justify-between px-4 py-3">
                <div>
                    <h2 className="text-sm font-bold text-ember-50">chat</h2>
                    <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                        {other && !otherLeft ? `with ${other}` : otherLeft ? `${other} left` : 'waiting'}
                    </p>
                </div>
            </div>

            {otherLeft && (
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
                                <span
                                    key={i}
                                    className={`break-words rounded-[1.15rem] px-3 py-2 text-sm font-semibold leading-6 ${g.mine ? 'bg-ember-400 text-white' : 'bg-cocoa-800 text-ember-50'}`}
                                >
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
                        onKeyDown={e => e.key === 'Enter' && sendMsg()}
                        placeholder={other && !otherLeft ? `message ${other}` : 'say something'}
                    />
                    <button className="grid h-9 w-9 place-items-center rounded-full bg-ember-400 text-white transition hover:bg-ember-500 disabled:opacity-30" onClick={sendMsg} disabled={!draft.trim()}>
                        <i className="fa-solid fa-paper-plane text-xs" />
                    </button>
                </div>
            </div>
        </aside>
    )
}

function CallPanel({ name, other, otherLeft, remoteStream, remoteCamOn, localStream, camOn, localVideo, remoteVideo, mediaBusy, ensureMedia }: {
    name: string
    other: string
    otherLeft: boolean
    remoteStream: MediaStream | null
    remoteCamOn: boolean
    localStream: MediaStream | null
    camOn: boolean
    localVideo: React.RefObject<HTMLVideoElement | null>
    remoteVideo: React.RefObject<HTMLVideoElement | null>
    mediaBusy: boolean
    ensureMedia: (withVideo: boolean) => void
}) {
    return (
        <section className="grid min-h-0 gap-3 rounded-[1.75rem] bg-plum-900 p-3">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-ember-50">call</h2>
                    <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                        {other && !otherLeft ? 'connected' : otherLeft ? 'disconnected' : 'idle'}
                    </p>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <VideoTile label={other || 'friend'} videoRef={remoteVideo} active={!!remoteStream && remoteCamOn} muted={false} />
                <VideoTile label={name || 'you'} videoRef={localVideo} active={!!localStream && camOn} muted />
            </div>

            {!localStream && (
                <div className="grid grid-cols-2 gap-2">
                    <button className="rounded-full bg-cocoa-800 px-4 py-3 text-sm font-bold text-ember-100 hover:bg-cocoa-700 disabled:opacity-40" disabled={mediaBusy} onClick={() => ensureMedia(false)}>
                        voice
                    </button>
                    <button className="rounded-full bg-ember-400 px-4 py-3 text-sm font-bold text-white hover:bg-ember-500 disabled:opacity-40" disabled={mediaBusy} onClick={() => ensureMedia(true)}>
                        video
                    </button>
                </div>
            )}
        </section>
    )
}

function QueuePanel({ showQueue, setShowQueue, ytError, ytInput, setYtInput, setYtError, addYT, current, queue }: {
    showQueue: boolean
    setShowQueue: (value: boolean | ((value: boolean) => boolean)) => void
    ytError: boolean
    ytInput: string
    setYtInput: (value: string) => void
    setYtError: (value: boolean) => void
    addYT: () => void
    current: Item | null
    queue: Item[]
}) {
    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] bg-plum-900 p-3">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-bold text-ember-50">queue</h2>
                    <p className="mt-0.5 text-xs font-bold text-ember-100/45">{queue.length + (current ? 1 : 0)} videos</p>
                </div>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-50" onClick={() => setShowQueue(v => !v)}>
                    <i className={`fa-solid ${showQueue ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
                </button>
            </div>

            {showQueue && (
                <>
                    <div className={`mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[1.2rem] bg-cocoa-800 px-3 py-2 ${ytError ? 'bg-berry-300/15' : ''}`}>
                        <input
                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30"
                            value={ytInput}
                            onChange={e => { setYtInput(e.target.value); setYtError(false) }}
                            onKeyDown={e => e.key === 'Enter' && addYT()}
                            placeholder={ytError ? 'youtube only' : 'youtube url'}
                        />
                        <button className="w-14 shrink-0 rounded-full bg-ember-400 py-2 text-sm font-bold text-white hover:bg-ember-500 disabled:opacity-30" onClick={addYT} disabled={!ytInput.trim()}>
                            add
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {current && <QueueItem index="now" item={current} active />}
                        {queue.map((item, i) => <QueueItem key={item.id} index={`${i + 1}`} item={item} />)}
                        {!current && !queue.length && <p className="py-4 text-center text-sm font-semibold text-ember-100/35">nothing here yet</p>}
                    </div>
                </>
            )}
        </section>
    )
}

function Avatar({ name, tone, small = false }: { name: string; tone: 'me' | 'them'; small?: boolean }) {
    const color = tone === 'me' ? 'bg-ember-400 text-white' : 'bg-mint-300 text-white'
    return (
        <div className={`${small ? 'h-7 w-7 text-[0.65rem]' : 'h-10 w-10 text-xs'} grid shrink-0 place-items-center rounded-full font-bold ${color}`}>
            {av(name)}
        </div>
    )
}

function ToolbarButton({ children, active = false, danger = false, tone = 'default', onClick, title }: {
    children: React.ReactNode
    active?: boolean
    danger?: boolean
    tone?: 'default' | 'panel' | 'media'
    onClick: () => void
    title: string
}) {
    const classes = danger
        ? 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'
        : active
            ? tone === 'media'
                ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85'
                : tone === 'panel'
                    ? 'bg-plum-700 text-ember-50 hover:bg-cocoa-700'
                    : 'bg-ember-400 text-white hover:bg-ember-500'
            : 'bg-cocoa-800 text-ember-100/65 hover:bg-cocoa-700 hover:text-ember-50'

    return (
        <button className={`relative grid h-11 w-11 place-items-center rounded-full transition ${classes}`} onClick={onClick} title={title}>
            {children}
        </button>
    )
}

function VideoTile({ label, videoRef, active, muted }: {
    label: string
    videoRef: React.RefObject<HTMLVideoElement | null>
    active: boolean
    muted: boolean
}) {
    return (
        <div className="relative min-h-36 overflow-hidden rounded-[1.75rem] bg-plum-900">
            <video ref={videoRef} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${active ? 'block' : 'hidden'}`} />
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
            <span className="absolute bottom-3 left-3 rounded-full bg-cocoa-900/80 px-3 py-1 text-xs font-bold text-white">
                {label}
            </span>
        </div>
    )
}

function QueueItem({ index, item, active = false }: { index: string; item: Item; active?: boolean }) {
    return (
        <div className={`flex items-center gap-3 rounded-[1.1rem] px-3 py-2 ${active ? 'bg-ember-400/15' : 'bg-cocoa-800'}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-ember-400 text-white' : 'bg-plum-700 text-ember-100/55'}`}>
                {index}
            </span>
            {item.thumbnail ? (
                <img className="h-12 w-20 shrink-0 rounded-[0.75rem] object-cover" src={item.thumbnail} alt="" />
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
}
