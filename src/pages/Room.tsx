import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
    link: string
}

interface Toast {
    id: string
    text: string
    kind: 'info' | 'success' | 'error'
}

type SinkAudio = HTMLAudioElement & {
    setSinkId?: (id: string) => Promise<void>
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

const audioConstraints = (deviceId?: string): MediaTrackConstraints => ({
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: false },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
})

const tuneAudio = async (conn: RTCPeerConnection) => {
    for (const sender of conn.getSenders()) {
        if (sender.track?.kind !== 'audio') continue
        sender.track.contentHint = 'speech'
        try {
            const params = sender.getParameters()
            if (!params.encodings?.length) params.encodings = [{}]
            params.encodings = params.encodings.map(enc => ({ ...enc, maxBitrate: 64000 }))
            await sender.setParameters(params)
        } catch {
            return
        }
    }
}

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
const DURATION = '380ms'

const SidePanel = ({ open, width, side, children }: {
    open: boolean
    width: number
    side: 'left' | 'right'
    children: React.ReactNode
}) => (
    <div
        className="flex flex-col self-stretch shrink-0 overflow-hidden"
        style={{
            width: open ? `${width}px` : '0px',
            opacity: open ? 1 : 0,
            transform: open ? 'translateX(0)' : `translateX(${side === 'left' ? '-16px' : '16px'})`,
            marginRight: side === 'left' ? (open ? '0' : '-12px') : undefined,
            marginLeft: side === 'right' ? (open ? '0' : '-12px') : undefined,
            transition: `width ${DURATION} ${EASE}, opacity ${DURATION} ${EASE}, transform ${DURATION} ${EASE}, margin ${DURATION} ${EASE}`,
            pointerEvents: open ? 'auto' : 'none',
        }}
    >
        {children}
    </div>
)

const NavBtn = ({ active, onClick, icon, label, dot, badge, disabled }: {
    active: boolean
    onClick: () => void
    icon: string
    label: string
    dot?: 'mint' | 'ember'
    badge?: string
    disabled?: boolean
}) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-plum-900 text-ember-100/70' : 'bg-cocoa-800 text-ember-100/45 hover:text-ember-100/80 hover:bg-cocoa-700'}`}
    >
        <i className={`${icon} text-[0.6rem]`} />
        <span>{label}</span>
        {dot === 'mint' && <span className="h-1.5 w-1.5 rounded-full bg-mint-300" />}
        {dot === 'ember' && <span className="h-1.5 w-1.5 rounded-full bg-ember-400 animate-pulse" />}
        {badge && (
            <span className="h-4 min-w-[1rem] rounded-full bg-ember-400 grid place-items-center text-[0.55rem] font-bold text-white px-1">
                {badge}
            </span>
        )}
    </button>
)

const DeviceSelect = ({ icon, value, options, fallback, onChange, disabled }: {
    icon: string
    value: string
    options: MediaDeviceInfo[]
    fallback: string
    onChange: (value: string) => void | Promise<void>
    disabled?: boolean
}) => (
    <label className="flex items-center gap-2 rounded-xl bg-cocoa-800 px-2.5 py-1.5 text-ember-100/55 ring-1 ring-ember-100/5 focus-within:ring-ember-400/40">
        <i className={`${icon} w-3 text-center text-[0.6rem] text-ember-100/35`} />
        <select
            className="min-w-0 flex-1 bg-transparent text-xs font-bold text-ember-100/70 outline-none disabled:opacity-50"
            value={value}
            onChange={e => { void onChange(e.target.value) }}
            disabled={disabled}
        >
            <option value="">{fallback}</option>
            {options.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                    {device.label || fallback}
                </option>
            ))}
        </select>
    </label>
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

    const onDragStart = (i: number) => { dragItem.current = i; setDragging(i) }
    const onDragEnter = (i: number) => { dragOver.current = i }
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

const toastIcon = (kind: Toast['kind']) => {
    if (kind === 'success') return 'fa-solid fa-circle-check'
    if (kind === 'error') return 'fa-solid fa-triangle-exclamation'
    return 'fa-solid fa-circle-info'
}

const toastColor = (kind: Toast['kind']) => {
    if (kind === 'success') return 'text-mint-300'
    if (kind === 'error') return 'text-berry-300'
    return 'text-ember-400'
}

const ToastStack = ({ toasts }: { toasts: Toast[] }) => createPortal(
    <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2">
        <style>{`
            @keyframes toastIn {
                from { opacity: 0; transform: translateY(-10px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
        `}</style>
        {toasts.map(t => (
            <div
                key={t.id}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-cocoa-800/95 backdrop-blur border border-white/[0.06] px-4 py-2.5 shadow-lg"
                style={{ animation: 'toastIn 260ms cubic-bezier(0.4,0,0.2,1) both' }}
            >
                <i className={`${toastIcon(t.kind)} text-xs ${toastColor(t.kind)}`} />
                <span className="text-xs font-bold text-ember-50">{t.text}</span>
            </div>
        ))}
    </div>,
    document.body
)

const VideoTile = ({ isLocal, expanded, local, remote, cam, mic, remoteCam, remoteMic, name, other, localVidRef, remoteVidRef }: {
    isLocal: boolean
    expanded: boolean
    local: MediaStream | null
    remote: MediaStream | null
    cam: boolean
    mic: boolean
    remoteCam: boolean
    remoteMic: boolean
    name: string
    other: string
    localVidRef: (el: HTMLVideoElement | null) => void
    remoteVidRef: (el: HTMLVideoElement | null) => void
}) => {
    const hasStream = isLocal ? !!local : !!remote
    const hasVideo = isLocal ? (!!local && cam) : (!!remote && remoteCam)
    const hasMic = isLocal ? mic : remoteMic
    const displayName = isLocal ? name : (other || 'connecting...')
    const avatarBg = isLocal ? 'bg-ember-400' : 'bg-mint-300'
    const avatarGlow = isLocal ? 'rgba(251,146,60,0.15)' : 'rgba(110,231,183,0.15)'
    const avatarSize = expanded ? 'h-20 w-20 text-xl' : 'h-14 w-14 text-base'

    return (
        <div className={`relative overflow-hidden bg-cocoa-800 min-h-0 flex-1 ${expanded ? 'rounded-[1.75rem]' : 'rounded-[1.15rem]'}`}>
            <video
                ref={isLocal ? localVidRef : remoteVidRef}
                autoPlay
                playsInline
                muted={isLocal}
                style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
                className={`h-full w-full object-cover transition-opacity duration-300 ${hasVideo ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
            />
            {!hasVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div
                        className={`${avatarSize} rounded-full grid place-items-center font-bold text-white ${avatarBg}`}
                        style={expanded ? { boxShadow: `0 0 60px ${avatarGlow}` } : undefined}
                    >
                        {(!isLocal && !other) ? <i className="fa-solid fa-user" /> : av(displayName)}
                    </div>
                    {expanded && <span className="text-sm font-bold text-ember-100/40">{displayName}</span>}
                </div>
            )}
            <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5 rounded-full bg-cocoa-900/70 backdrop-blur-sm px-2.5 py-1.5 w-fit max-w-[calc(100%-1rem)]">
                {hasStream && (
                    <i className={`fa-solid text-[0.55rem] shrink-0 ${hasMic ? 'fa-microphone text-ember-100/50' : 'fa-microphone-slash text-berry-300/80'}`} />
                )}
                <span className="text-[0.6rem] font-bold text-ember-100/70 truncate">{displayName}</span>
            </div>
        </div>
    )
}

const TypingDots = () => (
    <div className="flex items-center gap-1 rounded-[1.15rem] rounded-bl-[0.35rem] bg-cocoa-800 px-3.5 py-3 w-fit">
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
)

export const Room = ({ peer, name, leave, link }: Props) => {
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
    const [toasts, setToasts] = useState<Toast[]>([])
    const [linkCopied, setLinkCopied] = useState(false)
    const [videoHovered, setVideoHovered] = useState(false)
    const [watchOpen, setWatchOpen] = useState(true)
    const [callOpen, setCallOpen] = useState(true)
    const [messagesOpen, setMessagesOpen] = useState(true)
    const [mics, setMics] = useState<MediaDeviceInfo[]>([])
    const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
    const [micDevice, setMicDevice] = useState('')
    const [speakerDevice, setSpeakerDevice] = useState('')
    const [callDuration, setCallDuration] = useState(0)
    const [otherTyping, setOtherTyping] = useState(false)
    const bottom = useRef<HTMLDivElement>(null)
    const player = useRef<PlayerHandle>(null)

    const localVidEls = useRef<Set<HTMLVideoElement>>(new Set())
    const remoteVidEls = useRef<Set<HTMLVideoElement>>(new Set())
    const localStream = useRef<MediaStream | null>(null)
    const remoteStream = useRef<MediaStream | null>(null)

    const localVidRef = useCallback((el: HTMLVideoElement | null) => {
        if (!el) return
        localVidEls.current.add(el)
        if (localStream.current) el.srcObject = localStream.current
    }, [])

    const remoteVidRef = useCallback((el: HTMLVideoElement | null) => {
        if (!el) return
        remoteVidEls.current.add(el)
        if (remoteStream.current) {
            const videoOnly = new MediaStream(remoteStream.current.getVideoTracks())
            el.srcObject = videoOnly
        }
    }, [])

    const localRef = useRef<MediaStream | null>(null)
    const remoteRef = useRef<MediaStream | null>(null)
    const trackIds = useRef(new Set<string>())
    const timer = useRef<number | null>(null)
    const hoverTimer = useRef<number | null>(null)
    const remoteAudioEl = useRef<HTMLAudioElement | null>(null)
    const callStart = useRef<number | null>(null)
    const durationTimer = useRef<number | null>(null)
    const otherRef = useRef('')
    const reconnectingRef = useRef(false)
    const typingTimer = useRef<number | null>(null)
    const typingActive = useRef(false)
    const remoteTypingTimer = useRef<number | null>(null)

    const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
        setToasts(prev => {
            if (prev.some(t => t.text === text)) return prev
            const item: Toast = { id: crypto.randomUUID(), text, kind }
            setTimeout(() => setToasts(p => p.filter(t => t.id !== item.id)), 3500)
            return [...prev, item]
        })
    }, [])

    useEffect(() => {
        otherRef.current = other
    }, [other])

    const bc = useCallback((kind: Parameters<typeof pack>[0], payload: unknown) => {
        send(peer, pack(kind, payload))
    }, [peer])

    const refreshDevices = useCallback(async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return
        const devices = await navigator.mediaDevices.enumerateDevices()
        setMics(devices.filter(d => d.kind === 'audioinput'))
        setSpeakers(devices.filter(d => d.kind === 'audiooutput'))
    }, [])

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
        if (msg.kind === 'media-answer') void peer.conn.setRemoteDescription(msg.payload as RTCSessionDescriptionInit).catch(() => { })
        if (msg.kind === 'media-state') {
            const state = msg.payload as { camOn?: boolean; micOn?: boolean }
            setRemoteCam(!!state.camOn)
            setRemoteMic(!!state.micOn)
        }
        if (msg.kind === 'typing') {
            const state = msg.payload as { typing: boolean }
            setOtherTyping(state.typing)
            if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current)
            if (state.typing) {
                remoteTypingTimer.current = window.setTimeout(() => setOtherTyping(false), 3000)
            }
        }
        if (msg.kind === 'name') {
            const incoming = (msg.payload as { name: string }).name
            setOther(prev => {
                if (!prev) toast(`${incoming} joined`, 'success')
                return incoming
            })
            setLeft(false)
        }
    }, [answer, peer, toast])

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
            remoteStream.current = stream
            setRemote(stream)
            if (remoteAudioEl.current) {
                remoteAudioEl.current.srcObject = stream
                void remoteAudioEl.current.play().catch(() => { })
            }
            const videoOnly = new MediaStream(stream.getVideoTracks())
            remoteVidEls.current.forEach(el => { el.srcObject = videoOnly })
        }
        const handleClose = () => {
            setLeft(true)
            setOtherTyping(false)
            toast(`${otherRef.current || 'they'} disconnected`, 'error')
        }
        const handleNegotiationNeeded = () => { void negotiate() }
        const handleConnectionStateChange = () => {
            const state = conn.connectionState
            if (state === 'connected') {
                void tuneAudio(conn)
                if (timer.current) window.clearTimeout(timer.current)
                timer.current = null
                if (reconnectingRef.current) {
                    reconnectingRef.current = false
                    toast('Reconnected', 'success')
                }
                setLeft(false)
                if (!callStart.current) {
                    callStart.current = Date.now()
                    durationTimer.current = window.setInterval(() => {
                        setCallDuration(Math.floor((Date.now() - callStart.current!) / 1000))
                    }, 1000)
                }
                return
            }
            if (state === 'failed' || state === 'closed') { setLeft(true); return }
            if (state === 'disconnected' && !timer.current) {
                reconnectingRef.current = true
                timer.current = window.setTimeout(() => {
                    if (conn.connectionState === 'disconnected') {
                        setLeft(true)
                        toast(`${otherRef.current || 'they'} disconnected`, 'error')
                    }
                    timer.current = null
                }, 30000)
            }
        }
        channel?.addEventListener('message', handleMessage)
        channel?.addEventListener('close', handleClose)
        conn.addEventListener('track', handleTrack)
        conn.addEventListener('negotiationneeded', handleNegotiationNeeded)
        conn.addEventListener('connectionstatechange', handleConnectionStateChange)
        navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
        return () => {
            channel?.removeEventListener('message', handleMessage)
            channel?.removeEventListener('close', handleClose)
            conn.removeEventListener('track', handleTrack)
            conn.removeEventListener('negotiationneeded', handleNegotiationNeeded)
            conn.removeEventListener('connectionstatechange', handleConnectionStateChange)
            navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
        }
    }, [negotiate, peer, receive, refreshDevices, toast])

    useEffect(() => {
        const t = setTimeout(() => send(peer, pack('name', { name })), 600)
        return () => clearTimeout(t)
    }, [name, peer])

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, otherTyping])

    useEffect(() => {
        if (current) {
            const t = setTimeout(() => player.current?.playVideo(), 800)
            return () => clearTimeout(t)
        }
    }, [current])

    useEffect(() => {
        localStream.current = local
        localVidEls.current.forEach(el => { el.srcObject = local })
    }, [local])

    useEffect(() => {
        if (!remote) return
        remoteStream.current = remote
        if (remoteAudioEl.current) {
            remoteAudioEl.current.srcObject = remote
            void remoteAudioEl.current.play().catch(() => { })
        }
        const videoOnly = new MediaStream(remote.getVideoTracks())
        remoteVidEls.current.forEach(el => { el.srcObject = videoOnly })
    }, [remote])

    useEffect(() => {
        const audio = remoteAudioEl.current as SinkAudio | null
        if (!audio?.setSinkId || !speakerDevice) return
        void audio.setSinkId(speakerDevice).catch(() => { })
    }, [speakerDevice])

    useEffect(() => {
        const remoteAudio = remoteAudioEl.current
        return () => {
            if (timer.current) window.clearTimeout(timer.current)
            if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
            if (durationTimer.current) window.clearInterval(durationTimer.current)
            if (typingTimer.current) window.clearTimeout(typingTimer.current)
            if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current)
            localRef.current?.getTracks().forEach(t => t.stop())
            if (remoteAudio) { remoteAudio.srcObject = null }
        }
    }, [])

    const fmtDuration = (s: number) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
        const sec = (s % 60).toString().padStart(2, '0')
        return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`
    }

    const startMedia = async (withVideo: boolean) => {
        setBusy(true)
        try {
            let stream = localRef.current
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints(micDevice),
                    video: withVideo,
                })
                void refreshDevices()
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
            await tuneAudio(peer.conn)
            localRef.current = stream
            setLocal(stream)
            const nextMic = stream.getAudioTracks().some(t => t.enabled)
            const nextCam = stream.getVideoTracks().some(t => t.enabled)
            setMic(nextMic)
            setCam(nextCam)
            bc('media-state', { micOn: nextMic, camOn: nextCam })
        } catch {
            toast('camera or microphone permission was blocked', 'error')
        } finally {
            setBusy(false)
        }
    }

    const switchMic = async (deviceId: string) => {
        setMicDevice(deviceId)
        const stream = localRef.current
        if (!stream?.getAudioTracks().length) return
        setBusy(true)
        try {
            const next = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false })
            const track = next.getAudioTracks()[0]
            if (!track) return
            track.enabled = mic
            track.contentHint = 'speech'
            const sender = peer.conn.getSenders().find(s => s.track?.kind === 'audio')
            if (sender) {
                await sender.replaceTrack(track)
            } else {
                peer.conn.addTrack(track, stream)
                trackIds.current.add(track.id)
            }
            stream.getAudioTracks().forEach(t => {
                t.stop()
                stream.removeTrack(t)
                trackIds.current.delete(t.id)
            })
            stream.addTrack(track)
            trackIds.current.add(track.id)
            await tuneAudio(peer.conn)
            setLocal(new MediaStream(stream.getTracks()))
            localRef.current = stream
            void refreshDevices()
        } catch {
            toast('microphone switch failed', 'error')
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

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
            if (typing || e.ctrlKey || e.metaKey || e.altKey) return
            const key = e.key.toLowerCase()
            if (key === 'm') { e.preventDefault(); toggleMic() }
            if (key === 'v') { e.preventDefault(); toggleCam() }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    })

    const stopTyping = () => {
        if (typingTimer.current) window.clearTimeout(typingTimer.current)
        typingTimer.current = null
        if (typingActive.current) {
            typingActive.current = false
            bc('typing', { typing: false })
        }
    }

    const handleDraftChange = (v: string) => {
        setDraft(v)
        if (v.trim()) {
            if (!typingActive.current) {
                typingActive.current = true
                bc('typing', { typing: true })
            }
            if (typingTimer.current) window.clearTimeout(typingTimer.current)
            typingTimer.current = window.setTimeout(stopTyping, 2000)
        } else {
            stopTyping()
        }
    }

    const sendMsg = () => {
        if (!draft.trim()) return
        stopTyping()
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

    const toggleCall = () => {
        if (callOpen && !watchOpen) return
        setCallOpen(v => !v)
    }

    const toggleWatch = () => {
        if (watchOpen && !callOpen) return
        setWatchOpen(v => !v)
    }

    const copyLink = () => {
        void navigator.clipboard.writeText(link).then(() => {
            setLinkCopied(true)
            toast('Link copied', 'success')
            setTimeout(() => setLinkCopied(false), 1800)
        })
    }

    const groups = toGroups(messages, name)
    const label = left ? `${other || 'they'} left` : other ? `${name} + ${other}` : 'waiting...'

    const callControls = (
        <>
            {!local ? (
                <div className="grid grid-cols-2 gap-2 mt-1 w-full shrink-0">
                    <button
                        className="w-full rounded-full bg-cocoa-800 py-2 text-xs font-bold text-ember-100/70 hover:bg-cocoa-700 disabled:opacity-40 transition-colors"
                        disabled={busy}
                        onClick={() => startMedia(false)}
                    >
                        <i className="fa-solid fa-microphone mr-1" />
                        voice
                    </button>
                    <button
                        className="w-full rounded-full bg-ember-400 py-2 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-40 transition-colors"
                        disabled={busy}
                        onClick={() => startMedia(true)}
                    >
                        <i className="fa-solid fa-video mr-1" />
                        camera
                    </button>
                </div>
            ) : (
                <div className="mt-1 flex flex-col gap-2 w-full shrink-0">
                    <div className="grid grid-cols-2 gap-2 w-full">
                        <button
                            onClick={toggleMic}
                            title="Toggle mic (M)"
                            className={`w-full rounded-full py-2 text-xs font-bold transition-colors ${mic ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'}`}
                        >
                            <i className={`fa-solid ${mic ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                        </button>
                        <button
                            onClick={toggleCam}
                            title="Toggle camera (V)"
                            className={`w-full rounded-full py-2 text-xs font-bold transition-colors ${cam ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/15 text-berry-300 hover:bg-berry-300/25'}`}
                        >
                            <i className={`fa-solid ${cam ? 'fa-video' : 'fa-video-slash'}`} />
                        </button>
                    </div>
                    {(mics.length > 1 || speakers.length > 1) && (
                        <div className="flex flex-col gap-1.5 w-full">
                            {mics.length > 1 && (
                                <DeviceSelect
                                    icon="fa-solid fa-microphone"
                                    value={micDevice}
                                    options={mics}
                                    fallback="Default microphone"
                                    onChange={switchMic}
                                    disabled={busy}
                                />
                            )}
                            {speakers.length > 1 && (
                                <DeviceSelect
                                    icon="fa-solid fa-headphones"
                                    value={speakerDevice}
                                    options={speakers}
                                    fallback="Default output"
                                    onChange={setSpeakerDevice}
                                    disabled={busy}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    )

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-cocoa-900 text-ember-50">
            <audio ref={remoteAudioEl} autoPlay className="hidden" />

            <ToastStack toasts={toasts} />

            <header className="flex items-center gap-2 px-3 pt-3 pb-0 shrink-0 h-14">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-sm font-bold text-ember-50 ml-2">bonfire</span>
                    <span className="text-xs font-semibold text-ember-100/30 truncate">· {label}</span>
                    {callDuration > 0 && (
                        <span className="ml-1 text-xs font-bold tabular-nums text-mint-300/70">
                            · {fmtDuration(callDuration)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {link && (
                        <button
                            onClick={copyLink}
                            title="Copy room link"
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${linkCopied ? 'bg-mint-300/20 text-mint-300' : 'bg-cocoa-800 text-ember-100/45 hover:text-ember-100/80 hover:bg-cocoa-700'}`}
                        >
                            <i className={`fa-solid ${linkCopied ? 'fa-check' : 'fa-link'} text-[0.6rem]`} />
                            <span>{linkCopied ? 'copied' : 'copy link'}</span>
                        </button>
                    )}
                    <NavBtn
                        active={callOpen}
                        onClick={toggleCall}
                        icon="fa-solid fa-users"
                        label="call"
                        dot={(local || remote) ? 'mint' : undefined}
                        disabled={callOpen && !watchOpen}
                    />
                    <NavBtn
                        active={watchOpen}
                        onClick={toggleWatch}
                        icon="fa-brands fa-youtube"
                        label="watch"
                        dot={current ? 'ember' : undefined}
                        disabled={watchOpen && !callOpen}
                    />
                    <NavBtn
                        active={messagesOpen}
                        onClick={() => setMessagesOpen(v => !v)}
                        icon="fa-regular fa-comment"
                        label="chat"
                        badge={!messagesOpen && messages.length > 0 ? (messages.length > 9 ? '9+' : String(messages.length)) : undefined}
                    />
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

                <SidePanel open={callOpen && watchOpen} width={300} side="left">
                    <div className="w-full rounded-[1.5rem] bg-plum-900 overflow-hidden flex flex-col flex-1 min-h-0">
                        <div className="px-4 pt-3 pb-1 shrink-0">
                            <span className="text-xs font-bold text-ember-50">call</span>
                        </div>
                        <div className="w-full px-4 pb-4 flex flex-col gap-2 box-border flex-1 min-h-0">
                            <VideoTile
                                isLocal={false}
                                expanded={false}
                                local={local}
                                remote={remote}
                                cam={cam}
                                mic={mic}
                                remoteCam={remoteCam}
                                remoteMic={remoteMic}
                                name={name}
                                other={other}
                                localVidRef={localVidRef}
                                remoteVidRef={remoteVidRef}
                            />
                            <VideoTile
                                isLocal={true}
                                expanded={false}
                                local={local}
                                remote={remote}
                                cam={cam}
                                mic={mic}
                                remoteCam={remoteCam}
                                remoteMic={remoteMic}
                                name={name}
                                other={other}
                                localVidRef={localVidRef}
                                remoteVidRef={remoteVidRef}
                            />
                            {callControls}
                        </div>
                    </div>
                </SidePanel>

                <div
                    className="flex-1 flex flex-col self-stretch min-w-0 min-h-0 gap-3"
                    style={{ display: !watchOpen && callOpen ? 'flex' : 'none' }}
                >
                    <style>{`
                        @keyframes callExpand {
                            from { opacity: 0; transform: scale(0.97) translateY(8px); }
                            to   { opacity: 1; transform: scale(1) translateY(0); }
                        }
                    `}</style>
                    <div
                        className="relative flex flex-1 gap-3 min-h-0 rounded-[1.75rem] overflow-hidden"
                        style={{ animation: 'callExpand 380ms cubic-bezier(0.4,0,0.2,1) both' }}
                    >
                        <VideoTile
                            isLocal={false}
                            expanded={true}
                            local={local}
                            remote={remote}
                            cam={cam}
                            mic={mic}
                            remoteCam={remoteCam}
                            remoteMic={remoteMic}
                            name={name}
                            other={other}
                            localVidRef={localVidRef}
                            remoteVidRef={remoteVidRef}
                        />
                        <VideoTile
                            isLocal={true}
                            expanded={true}
                            local={local}
                            remote={remote}
                            cam={cam}
                            mic={mic}
                            remoteCam={remoteCam}
                            remoteMic={remoteMic}
                            name={name}
                            other={other}
                            localVidRef={localVidRef}
                            remoteVidRef={remoteVidRef}
                        />

                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
                            {!local ? (
                                <div className="flex items-center gap-3">
                                    <button
                                        className="flex items-center gap-2 rounded-full bg-cocoa-800/90 backdrop-blur px-5 py-2.5 text-xs font-bold text-ember-100/70 hover:bg-cocoa-700 disabled:opacity-40 transition-all"
                                        disabled={busy}
                                        onClick={() => startMedia(false)}
                                    >
                                        <i className="fa-solid fa-microphone" />
                                        voice only
                                    </button>
                                    <button
                                        className="flex items-center gap-2 rounded-full bg-ember-400/90 backdrop-blur px-5 py-2.5 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-40 transition-all"
                                        disabled={busy}
                                        onClick={() => startMedia(true)}
                                    >
                                        <i className="fa-solid fa-video" />
                                        join with camera
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 rounded-full bg-cocoa-900/80 backdrop-blur px-4 py-2.5">
                                    <button
                                        onClick={toggleMic}
                                        title="Toggle mic (M)"
                                        className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold transition-all ${mic ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/20 text-berry-300 hover:bg-berry-300/30'}`}
                                    >
                                        <i className={`fa-solid ${mic ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                                    </button>
                                    <button
                                        onClick={toggleCam}
                                        title="Toggle camera (V)"
                                        className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold transition-all ${cam ? 'bg-mint-300 text-cocoa-900 hover:bg-mint-300/85' : 'bg-berry-300/20 text-berry-300 hover:bg-berry-300/30'}`}
                                    >
                                        <i className={`fa-solid ${cam ? 'fa-video' : 'fa-video-slash'}`} />
                                    </button>
                                    {(mics.length > 1 || speakers.length > 1) && (
                                        <>
                                            <div className="w-px h-5 bg-ember-100/10 mx-1" />
                                            {mics.length > 1 && (
                                                <DeviceSelect
                                                    icon="fa-solid fa-microphone"
                                                    value={micDevice}
                                                    options={mics}
                                                    fallback="Default mic"
                                                    onChange={switchMic}
                                                    disabled={busy}
                                                />
                                            )}
                                            {speakers.length > 1 && (
                                                <DeviceSelect
                                                    icon="fa-solid fa-headphones"
                                                    value={speakerDevice}
                                                    options={speakers}
                                                    fallback="Default output"
                                                    onChange={setSpeakerDevice}
                                                    disabled={busy}
                                                />
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {watchOpen && (
                    <main className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
                        <section
                            className="relative flex-1 rounded-[1.75rem] overflow-hidden bg-cocoa-800 min-h-0"
                            onMouseEnter={handleVideoMouseEnter}
                            onMouseLeave={handleVideoMouseLeave}
                        >
                            <div className={current ? 'contents' : 'hidden'}>
                                <Player
                                    url={current?.url ?? ''}
                                    ref={player}
                                    onPlay={() => bc('play', null)}
                                    onPause={() => bc('pause', null)}
                                    onSeek={t => bc('seek', t)}
                                />
                                <div
                                    className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${videoHovered ? 'opacity-100' : 'opacity-0'}`}
                                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.7) 100%)' }}
                                />
                                <div className={`absolute top-3 right-3 flex items-center gap-2 transition-all duration-300 ${videoHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                                    <button
                                        onClick={skip}
                                        className="flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-xs font-bold text-white/90 hover:bg-black/60 transition-colors"
                                    >
                                        <i className="fa-solid fa-forward-step" />
                                        skip
                                    </button>
                                    <button
                                        onClick={stop}
                                        className="flex items-center gap-1.5 rounded-full bg-berry-300/20 backdrop-blur-md border border-berry-300/20 px-4 py-2 text-xs font-bold text-berry-300 hover:bg-berry-300/35 transition-colors"
                                    >
                                        <i className="fa-solid fa-stop" />
                                        stop
                                    </button>
                                </div>
                                <div className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ${videoHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
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
                            </div>

                            {!current && (
                                <div className="grid h-full place-items-center px-6 text-center">
                                    <div className="max-w-sm space-y-5">
                                        <div className="mx-auto grid h-20 w-15 place-items-center rounded-[1.5rem] text-3xl text-ember-400">
                                            <img src="assets/logo.svg" alt="Bonfire logo" />
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
                                                setShow={() => { }}
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
                )}

                <SidePanel open={messagesOpen} width={320} side="right">
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
                            {groups.length === 0 && !otherTyping && (
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
                                {otherTyping && !left && (
                                    <div className="flex items-end gap-2">
                                        <div className="h-7 w-7 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0 mb-0.5 bg-mint-300">
                                            {av(other || '?')}
                                        </div>
                                        <TypingDots />
                                    </div>
                                )}
                            </div>
                            <div ref={bottom} />
                        </div>
                        <div className="p-3 shrink-0">
                            <div className="flex items-center gap-2 rounded-[1.25rem] bg-cocoa-800 px-3 py-2">
                                <input
                                    className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 focus:outline-none"
                                    value={draft}
                                    onChange={e => handleDraftChange(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMsg()}
                                    onBlur={stopTyping}
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
                </SidePanel>
            </div>
        </div>
    )
}