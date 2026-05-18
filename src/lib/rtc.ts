const ICE: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
}

export const SIGNAL = 'https://bonfire.aryanmadan.workers.dev'

export interface Peer {
    conn: RTCPeerConnection
    channel: RTCDataChannel | null
    polite: boolean
    onopen: () => void
    onmessage: (data: string) => void
}

function encode(sdp: RTCSessionDescriptionInit): string {
    return btoa(JSON.stringify(sdp))
}

function decode(raw: string): RTCSessionDescriptionInit {
    return JSON.parse(atob(raw))
}

function gather(conn: RTCPeerConnection): Promise<string> {
    return new Promise(resolve => {
        if (conn.iceGatheringState === 'complete') {
            resolve(encode(conn.localDescription!))
            return
        }
        conn.onicegatheringstatechange = () => {
            if (conn.iceGatheringState === 'complete') {
                resolve(encode(conn.localDescription!))
            }
        }
    })
}

function id(): string {
    return crypto.randomUUID().slice(0, 8)
}

export async function host(
    onopen: () => void,
    onmessage: (data: string) => void
): Promise<{ peer: Peer; link: string; room: string }> {
    const conn = new RTCPeerConnection(ICE)
    const channel = conn.createDataChannel('bonfire')
    const peer: Peer = { conn, channel, polite: false, onopen, onmessage }

    channel.onopen = onopen
    channel.onmessage = e => onmessage(e.data)

    await conn.setLocalDescription(await conn.createOffer())
    const encoded = await gather(conn)
    const room = id()
    await fetch(`${SIGNAL}/${room}-offer`, { method: 'PUT', body: encoded })
    const link = `${window.location.origin}${window.location.pathname}#room=${room}`
    return { peer, link, room }
}

export async function poll(room: string, peer: Peer): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setInterval(async () => {
            try {
                const res = await fetch(`${SIGNAL}/${room}-answer`)
                if (res.status === 404) return
                const raw = await res.text()
                clearInterval(timer)
                await peer.conn.setRemoteDescription(decode(raw))
                resolve()
            } catch (e) {
                clearInterval(timer)
                reject(e)
            }
        }, 1500)
        setTimeout(() => { clearInterval(timer); reject(new Error('timeout')) }, 120_000)
    })
}

export async function join(
    room: string,
    onopen: () => void,
    onmessage: (data: string) => void
): Promise<Peer> {
    const conn = new RTCPeerConnection(ICE)
    const peer: Peer = { conn, channel: null, polite: true, onopen, onmessage }

    conn.ondatachannel = e => {
        peer.channel = e.channel
        e.channel.onopen = onopen
        e.channel.onmessage = ev => onmessage(ev.data)
    }

    const res = await fetch(`${SIGNAL}/${room}-offer`)
    if (!res.ok) throw new Error('room not found')
    const raw = await res.text()
    await conn.setRemoteDescription(decode(raw))
    await conn.setLocalDescription(await conn.createAnswer())
    const encoded = await gather(conn)
    await fetch(`${SIGNAL}/${room}-answer`, { method: 'PUT', body: encoded })
    return peer
}

export function send(peer: Peer, data: string): void {
    if (peer.channel?.readyState === 'open') peer.channel.send(data)
}
