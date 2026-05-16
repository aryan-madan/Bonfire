import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import YouTube, { type YouTubePlayer, type YouTubeEvent } from 'react-youtube'

interface Props {
    url: string | null
    onPlay: () => void
    onPause: () => void
    onSeek: (t: number) => void
}

function getID(url: string): string | null {
    try {
        const u = new URL(url)
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0]
        if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
        return null
    } catch {
        return null
    }
}

export const Player = forwardRef<any, Props>(({ url, onPlay, onPause, onSeek }, ref) => {
    const playerRef = useRef<YouTubePlayer>(null)
    // suppress: ignore ALL state changes for this many ms after a remote-driven action
    const suppressUntil = useRef(0)
    // lastState: avoid firing duplicate events for the same state
    const lastState = useRef<number | null>(null)
    // lastSeekTime: track last seek time to avoid redundant seek events
    const lastSeekTime = useRef<number>(-1)
    const [error, setError] = useState(false)

    function suppress(ms = 1800) {
        suppressUntil.current = Date.now() + ms
    }

    useImperativeHandle(ref, () => ({
        playVideo: () => {
            suppress()
            playerRef.current?.playVideo()
        },
        pauseVideo: () => {
            suppress()
            playerRef.current?.pauseVideo()
        },
        seekTo: (t: number, a: boolean) => {
            suppress()
            lastSeekTime.current = t
            playerRef.current?.seekTo(t, a)
        },
    }))

    const id = url ? getID(url) : null

    function onReady(e: YouTubeEvent) {
        playerRef.current = e.target
        suppress(2000)
    }

    function onStateChange(e: YouTubeEvent) {
        // Ignore events triggered by remote-driven calls
        if (Date.now() < suppressUntil.current) return
        // Ignore duplicate state
        if (e.data === lastState.current) return
        lastState.current = e.data

        if (e.data === 1) {
            // Playing — emit seek + play
            const t = e.target.getCurrentTime?.() ?? 0
            // Only emit seek if time changed meaningfully from last known seek
            if (Math.abs(t - lastSeekTime.current) > 1.5) {
                lastSeekTime.current = t
                onSeek(t)
            }
            onPlay()
        }

        if (e.data === 2) {
            // Paused
            onPause()
        }
    }

    function onError() {
        setError(true)
    }

    if (!url || !id) {
        return (
            <div className="empty">
                <i className="fa-solid fa-fire" style={{ fontSize: '2rem', color: 'var(--pink)', marginBottom: '0.5rem' }} />
                <span className="empty-label">no video playing</span>
                <span className="empty-sub">add a youtube link to watch together</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className="empty">
                <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '1.5rem', color: 'var(--rose)', marginBottom: '0.5rem' }} />
                <span className="empty-label">this video can't be embedded</span>
                <span className="empty-sub">open it as a popup — both click to watch together</span>
                <button
                    className="open-link"
                    onClick={() => window.open(url, 'bonfire-watch', 'width=960,height=600,toolbar=0,menubar=0,location=0,noopener')}
                >
                    open popup <i className="fa-solid fa-arrow-up-right-from-square" />
                </button>
            </div>
        )
    }

    return (
        <YouTube
            key={id}
            videoId={id}
            onReady={onReady}
            onStateChange={onStateChange}
            onError={onError}
            opts={{
                width: '100%',
                height: '100%',
                playerVars: {
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    enablejsapi: 1,
                    playsinline: 1,
                },
            }}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
            className="player"
        />
    )
})

Player.displayName = 'Player'