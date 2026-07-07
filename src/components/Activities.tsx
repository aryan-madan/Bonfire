import { createPortal } from 'react-dom'

export type ActivityKey = 'youtube' | 'screenshare' | 'spades' | 'whiteboard'

export interface ActivityMeta {
    key: ActivityKey
    label: string
    icon: string
    blurb: string
    disclaimer: string
}

export const ACTIVITIES: ActivityMeta[] = [
    {
        key: 'youtube',
        label: 'YouTube',
        icon: 'fa-brands fa-youtube',
        blurb: 'Watch YouTube videos together, in sync.',
        disclaimer: 'Play, pause, and seeking stay in sync for both of you.',
    },
    {
        key: 'screenshare',
        label: 'Screen Share',
        icon: 'fa-solid fa-desktop',
        blurb: 'Share your screen with the room.',
        disclaimer: 'Starting a screen share will temporarily turn off your own camera.',
    },
    {
        key: 'spades',
        label: 'Spades of Streaming',
        icon: 'fa-solid fa-film',
        blurb: 'Browse and watch movies together on Spades of Streaming.',
        disclaimer: "This opens Spades, where you can watch movies inside the room. Playback isn't synced, so you'll each need to navigate to what you want to watch.",
    },
    {
        key: 'whiteboard',
        label: 'Whiteboard',
        icon: 'fa-solid fa-pen-nib',
        blurb: 'Doodle and sketch together in real time.',
        disclaimer: "Everyone's strokes are shared live and stay on the board for the rest of the call. You can export it as an image any time.",
    },
]

export const ActivityMenu = ({ onPick }: { onPick: (key: ActivityKey) => void }) => (
    <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-sm space-y-4">
            <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-ember-50">pick an activity</h2>
                <p className="text-sm font-semibold text-ember-100/45">do something together</p>
            </div>
            <div className="flex flex-col gap-2.5">
                {ACTIVITIES.map(a => (
                    <button
                        key={a.key}
                        onClick={() => onPick(a.key)}
                        className="flex items-center gap-3.5 rounded-[1.25rem] bg-cocoa-800 hover:bg-cocoa-700 px-4 py-3.5 text-left transition-colors"
                    >
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ember-400/15 text-ember-400 text-lg">
                            <i className={a.icon} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-ember-50">{a.label}</p>
                            <p className="text-xs font-semibold text-ember-100/45 truncate">{a.blurb}</p>
                        </div>
                        <i className="fa-solid fa-chevron-right ml-auto text-xs text-ember-100/25 shrink-0" />
                    </button>
                ))}
            </div>
        </div>
    </div>
)

export const ActivityInfoModal = ({ activityKey, onCancel, onConfirm }: {
    activityKey: ActivityKey | null
    onCancel: () => void
    onConfirm: () => void
}) => {
    if (!activityKey) return null
    const data = ACTIVITIES.find(a => a.key === activityKey)
    if (!data) return null
    return createPortal(
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/60 backdrop-blur-sm px-4"
            style={{ animation: 'activityModalBackdrop 160ms ease-out both' }}
        >
            <style>{`
                @keyframes activityModalBackdrop { from { opacity: 0 } to { opacity: 1 } }
                @keyframes activityModalPop {
                    from { opacity: 0; transform: scale(0.94) translateY(6px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
            <div
                className="w-full max-w-sm rounded-[1.5rem] bg-plum-900 p-6 space-y-4"
                style={{ animation: 'activityModalPop 220ms cubic-bezier(0.4,0,0.2,1) both' }}
            >
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ember-400/15 text-ember-400 text-lg">
                        <i className={data.icon} />
                    </div>
                    <h2 className="text-lg font-bold text-ember-50">{data.label}</h2>
                </div>
                <p className="text-sm font-semibold leading-6 text-ember-100/60">{data.blurb}</p>
                <div className="rounded-[1.1rem] bg-cocoa-800 px-4 py-3 text-xs font-semibold leading-5 text-ember-100/50">
                    {data.disclaimer}
                </div>
                <div className="flex gap-2.5 pt-1">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-full bg-cocoa-800 py-2.5 text-xs font-bold text-ember-100/60 hover:bg-cocoa-700 transition-colors"
                    >
                        cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 rounded-full bg-ember-400 py-2.5 text-xs font-bold text-white hover:bg-ember-500 transition-colors"
                    >
                        start
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

const BASE_SPADES_URL = 'https://spadesofstreaming.vercel.app'

export const SpadesFrame = ({ onLeave, hovered }: {
    onLeave: () => void
    hovered: boolean
}) => {
    return (
        <div className="relative h-full w-full">
            <iframe
                src={BASE_SPADES_URL}
                className="h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
            />
            <div className={`absolute top-3 left-3 transition-all duration-300 ${hovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                <button
                    onClick={onLeave}
                    title="back to activities"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-arrow-left text-xs" />
                </button>
            </div>
        </div>
    )
}