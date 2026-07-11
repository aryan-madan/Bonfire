import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ContextTarget = 'local' | 'remote'

export interface ContextMenuState {
    x: number
    y: number
    target: ContextTarget
}

export const EndRoomModal = ({ open, onCancel, onConfirm }: {
    open: boolean
    onCancel: () => void
    onConfirm: () => void
}) => {
    if (!open) return null
    return createPortal(
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={onCancel}
        >
            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.94) translateY(10px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
            <div
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm rounded-[1.75rem] bg-plum-900 p-6 shadow-2xl ring-1 ring-white/[0.06]"
                style={{ animation: 'modalIn 220ms cubic-bezier(0.4,0,0.2,1) both' }}
            >
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-berry-300/15 text-berry-300">
                    <i className="fa-solid fa-arrow-right-from-bracket" />
                </div>
                <h3 className="text-center text-base font-bold text-ember-50">end this room?</h3>
                <p className="mt-1.5 text-center text-sm font-semibold leading-5 text-ember-100/45">
                    this will end the call for both of you and close the room.
                </p>
                <div className="mt-6 flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-full bg-cocoa-800 py-2.5 text-sm font-bold text-ember-100/70 hover:bg-cocoa-700 transition-colors"
                    >
                        cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 rounded-full bg-berry-300 py-2.5 text-sm font-bold text-white hover:bg-berry-400 transition-colors"
                    >
                        end room
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

export const EndedScreen = ({ open, otherName, onLeave, onDismiss }: {
    open: boolean
    otherName: string
    onLeave: () => void
    onDismiss: () => void
}) => {
    if (!open) return null
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-cocoa-900/92 backdrop-blur-md px-4">
            <style>{`
                @keyframes endedIn {
                    from { opacity: 0; transform: scale(0.94) translateY(10px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
            <div
                className="relative w-full max-w-sm rounded-[1.75rem] bg-plum-900 p-7 text-center shadow-2xl ring-1 ring-white/[0.06]"
                style={{ animation: 'endedIn 260ms cubic-bezier(0.4,0,0.2,1) both' }}
            >
                <button
                    onClick={onDismiss}
                    className="absolute top-4 right-4 grid h-7 w-7 place-items-center rounded-full text-ember-100/40 hover:bg-cocoa-800 hover:text-ember-100/70 transition-colors"
                >
                    <i className="fa-solid fa-xmark text-xs" />
                </button>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-ember-400/15 text-ember-400 text-lg">
                    <i className="fa-solid fa-fire" />
                </div>
                <h3 className="text-lg font-bold text-ember-50">call ended</h3>
                <p className="mt-2 text-sm font-semibold leading-5 text-ember-100/45">
                    {otherName || 'the other person'} ended the room. thanks for hanging out.
                </p>
                <button
                    onClick={onLeave}
                    className="mt-6 w-full rounded-full bg-ember-400 py-2.5 text-sm font-bold text-white hover:bg-ember-500 transition-colors"
                >
                    leave room
                </button>
            </div>
        </div>,
        document.body
    )
}

export const TileContextMenu = ({ menu, remoteName, remoteVolume, remoteMuted, remoteHidden, localHidden, pipSupported, pipActive, onSetVolume, onToggleMute, onToggleHideRemote, onToggleHideLocal, onTogglePip, onClose }: {
    menu: ContextMenuState
    remoteName: string
    remoteVolume: number
    remoteMuted: boolean
    remoteHidden: boolean
    localHidden: boolean
    pipSupported: boolean
    pipActive: boolean
    onSetVolume: (v: number) => void
    onToggleMute: () => void
    onToggleHideRemote: () => void
    onToggleHideLocal: () => void
    onTogglePip: () => void
    onClose: () => void
}) => {
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && menuRef.current.contains(e.target as Node)) return
            onClose()
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('mousedown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', onDown, true)
            window.removeEventListener('keydown', onKey)
        }
    }, [onClose])

    const left = Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 224)
    const top = Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240)

    return createPortal(
        <div
            ref={menuRef}
            style={{ position: 'fixed', top: Math.max(top, 8), left: Math.max(left, 8) }}
            className="z-[9999] w-52 rounded-2xl bg-plum-900 p-1.5 shadow-2xl ring-1 ring-white/[0.08]"
            onContextMenu={e => e.preventDefault()}
        >
            {menu.target === 'remote' ? (
                <>
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ember-100/30 truncate">
                        {remoteName || 'this user'}
                    </div>
                    <div className="px-3 py-2">
                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-ember-100/60">
                            <span>
                                <i className="fa-solid fa-volume-high mr-1.5 text-[0.6rem]" />
                                volume
                            </span>
                            <span>{remoteMuted ? 'muted' : `${remoteVolume}%`}</span>
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={300}
                            step={5}
                            value={remoteMuted ? 0 : remoteVolume}
                            onChange={e => {
                                if (remoteMuted) onToggleMute()
                                onSetVolume(Number(e.target.value))
                            }}
                            style={{ accentColor: '#fb923c' }}
                            className="h-1.5 w-full cursor-pointer rounded-full bg-cocoa-800"
                        />
                    </div>
                    <div className="my-1 h-px bg-white/[0.06]" />
                    <button
                        onClick={() => { onToggleMute(); onClose() }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${remoteMuted ? 'bg-berry-300/15 text-berry-300' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                    >
                        <i className={`fa-solid ${remoteMuted ? 'fa-volume-off' : 'fa-volume-slash'} w-4 shrink-0 text-center text-[0.65rem]`} />
                        {remoteMuted ? 'unmute for me' : 'mute for me'}
                    </button>
                    <button
                        onClick={() => { onToggleHideRemote(); onClose() }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${remoteHidden ? 'bg-berry-300/15 text-berry-300' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                    >
                        <i className={`fa-solid ${remoteHidden ? 'fa-eye' : 'fa-eye-slash'} w-4 shrink-0 text-center text-[0.65rem]`} />
                        {remoteHidden ? 'show their video' : 'hide their video'}
                    </button>
                    {pipSupported && (
                        <>
                            <div className="my-1 h-px bg-white/[0.06]" />
                            <button
                                onClick={() => { onTogglePip(); onClose() }}
                                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${pipActive ? 'bg-berry-300/15 text-berry-300' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                            >
                                <i className={`fa-solid ${pipActive ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'} w-4 shrink-0 text-center text-[0.65rem]`} />
                                {pipActive ? 'close popout' : 'pop out call'}
                            </button>
                        </>
                    )}
                </>
            ) : (
                <button
                    onClick={() => { onToggleHideLocal(); onClose() }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${localHidden ? 'bg-berry-300/15 text-berry-300' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                >
                    <i className={`fa-solid ${localHidden ? 'fa-eye' : 'fa-eye-slash'} w-4 shrink-0 text-center text-[0.65rem]`} />
                    {localHidden ? 'show my preview' : 'hide my preview'}
                </button>
            )}
        </div>,
        document.body
    )
}