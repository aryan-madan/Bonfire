import { useEffect, useRef, useState } from 'react'

export type Quality = 'good' | 'fair' | 'poor'

export interface QualityStats {
    quality: Quality | null
    rttMs: number | null
    lossPct: number | null
}

const EMPTY: QualityStats = { quality: null, rttMs: null, lossPct: null }

export const useConnectionQuality = (conn: RTCPeerConnection | null, active: boolean): QualityStats => {
    const [stats, setStats] = useState<QualityStats>(EMPTY)
    const prevRef = useRef<{ lost: number; received: number } | null>(null)

    useEffect(() => {
        if (!conn || !active) {
            setStats(EMPTY)
            prevRef.current = null
            return
        }

        let cancelled = false

        const poll = async () => {
            try {
                const report = await conn.getStats()
                let rtt: number | null = null
                let lost = 0
                let received = 0

                report.forEach(entry => {
                    if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && (entry.nominated || rtt === null)) {
                        if (typeof entry.currentRoundTripTime === 'number') rtt = entry.currentRoundTripTime
                    }
                    if (entry.type === 'inbound-rtp') {
                        if (typeof entry.packetsLost === 'number') lost += entry.packetsLost
                        if (typeof entry.packetsReceived === 'number') received += entry.packetsReceived
                    }
                })

                if (cancelled) return

                let lossPct: number | null = null
                if (prevRef.current) {
                    const dLost = Math.max(0, lost - prevRef.current.lost)
                    const dReceived = Math.max(0, received - prevRef.current.received)
                    const total = dLost + dReceived
                    lossPct = total > 0 ? (dLost / total) * 100 : 0
                }
                prevRef.current = { lost, received }

                const rttMs = rtt !== null ? Math.round((rtt as number) * 1000) : null

                let quality: Quality | null = null
                if (rttMs !== null || lossPct !== null) {
                    quality = 'good'
                    if ((rttMs !== null && rttMs > 300) || (lossPct !== null && lossPct > 8)) quality = 'poor'
                    else if ((rttMs !== null && rttMs > 150) || (lossPct !== null && lossPct > 3)) quality = 'fair'
                }

                setStats({ quality, rttMs, lossPct: lossPct !== null ? Math.round(lossPct * 10) / 10 : null })
            } catch {
                return
            }
        }

        void poll()
        const id = window.setInterval(() => void poll(), 2500)
        return () => {
            cancelled = true
            window.clearInterval(id)
        }
    }, [conn, active])

    return stats
}