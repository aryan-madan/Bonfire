import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import YouTube, { type YouTubePlayer, type YouTubeEvent } from 'react-youtube'

export interface PlayerHandle {
    playVideo: () => void
    pauseVideo: () => void
    seekTo: (t: number, a: boolean) => void
}

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

export const Player = forwardRef<PlayerHandle, Props>(({ url, onPlay, onPause, onSeek }, ref) => {
    const playerRef = useRef<YouTubePlayer>(null)
    const suppressUntil = useRef(0)
    const lastState = useRef<number | null>(null)
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
        if (Date.now() < suppressUntil.current) return
        if (e.data === lastState.current) return
        lastState.current = e.data

        if (e.data === 1) {
            const t = e.target.getCurrentTime?.() ?? 0
            if (Math.abs(t - lastSeekTime.current) > 1.5) {
                lastSeekTime.current = t
                onSeek(t)
            }
            onPlay()
        }

        if (e.data === 2) {
            onPause()
        }
    }

    function onError() {
        setError(true)
    }

    if (!url || !id) {
        return (
            <div className="grid h-full place-items-center bg-cocoa-900 text-center">
                <div className="space-y-2">
                    <i className="fa-solid fa-fire text-3xl text-ember-300/70" />
                    <p className="text-base font-bold text-ember-50">no video playing</p>
                    <p className="text-sm font-semibold text-ember-100/45">add a youtube link to watch together</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="grid h-full place-items-center bg-cocoa-900 text-center">
                <div className="space-y-3">
                    <i className="fa-solid fa-circle-exclamation text-2xl text-berry-300" />
                    <div>
                        <p className="text-base font-bold text-ember-50">this video cannot be embedded</p>
                        <p className="text-sm font-semibold text-ember-100/45">open it as a popup and keep watching together</p>
                    </div>
                    <button
                        className="inline-flex items-center gap-2 rounded-full bg-ember-400 px-4 py-2 text-sm font-bold text-white hover:bg-ember-500"
                        onClick={() => window.open(url, 'bonfire-watch', 'width=960,height=600,toolbar=0,menubar=0,location=0,noopener')}
                    >
                        open popup <i className="fa-solid fa-arrow-up-right-from-square" />
                    </button>
                </div>
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
            className="flex h-full w-full flex-col [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full"
        />
    )
})

Player.displayName = 'Player'