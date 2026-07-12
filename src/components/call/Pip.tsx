import { useState } from 'react'
import { createPortal } from 'react-dom'
import { VideoTile } from './Video'
import type { DocPipWindow } from '../../lib/pip'

interface Props {
    pipWindow: DocPipWindow | null
    local: MediaStream | null
    remote: MediaStream | null
    cam: boolean
    mic: boolean
    remoteCam: boolean
    remoteMic: boolean
    remoteScreenSharing: boolean
    screenSharing: boolean
    name: string
    other: string
    localVidRef: (el: HTMLVideoElement | null) => void
    remoteVidRef: (el: HTMLVideoElement | null) => void
    remoteSpeaking: boolean
    onToggleMic: () => void
    onToggleCam: () => void
    onClose: () => void
    onEnd: () => void
}

export const Pip = ({ pipWindow, local, remote, cam, mic, remoteCam, remoteMic, remoteScreenSharing, screenSharing, name, other, localVidRef, remoteVidRef, remoteSpeaking, onToggleMic, onToggleCam, onClose, onEnd }: Props) => {
    const [confirmEnd, setConfirmEnd] = useState(false)

    if (!pipWindow) return null

    return createPortal(
        <div className="relative flex h-screen w-screen flex-col bg-cocoa-900">
            <div className="relative flex flex-1 min-h-0">
                <VideoTile
                    isLocal={false}
                    expanded={false}
                    local={local}
                    remote={remote}
                    cam={cam}
                    mic={mic}
                    remoteCam={remoteCam}
                    remoteMic={remoteMic}
                    sharing={remoteScreenSharing}
                    name={name}
                    other={other}
                    localVidRef={localVidRef}
                    remoteVidRef={remoteVidRef}
                    speaking={remoteSpeaking}
                />
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2 bg-cocoa-900 py-2">
                <button
                    onClick={onToggleMic}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${mic ? 'bg-mint-300 text-cocoa-900' : 'bg-berry-300/20 text-berry-300'}`}
                >
                    <i className={`fa-solid ${mic ? 'fa-microphone' : 'fa-microphone-slash'}`} />
                </button>
                <button
                    onClick={onToggleCam}
                    disabled={screenSharing}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors disabled:opacity-40 ${cam ? 'bg-mint-300 text-cocoa-900' : 'bg-berry-300/20 text-berry-300'}`}
                >
                    <i className={`fa-solid ${cam ? 'fa-video' : 'fa-video-slash'}`} />
                </button>
                <button
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-cocoa-800 text-ember-100/60 hover:text-ember-100"
                >
                    <i className="fa-solid fa-down-left-and-up-right-to-center" />
                </button>
                <button
                    onClick={() => setConfirmEnd(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-berry-300 text-white hover:bg-berry-400"
                >
                    <i className="fa-solid fa-phone-slash" />
                </button>
            </div>

            {confirmEnd && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
                    <div className="w-full rounded-2xl bg-plum-900 p-4 text-center shadow-2xl ring-1 ring-white/[0.08]">
                        <p className="text-xs font-bold text-ember-50">end this room?</p>
                        <p className="mt-1 text-[10px] font-semibold leading-tight text-ember-100/45">
                            this ends the call for both of you.
                        </p>
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={() => setConfirmEnd(false)}
                                className="flex-1 rounded-full bg-cocoa-800 py-1.5 text-[11px] font-bold text-ember-100/70 hover:bg-cocoa-700 transition-colors"
                            >
                                cancel
                            </button>
                            <button
                                onClick={onEnd}
                                className="flex-1 rounded-full bg-berry-300 py-1.5 text-[11px] font-bold text-white hover:bg-berry-400 transition-colors"
                            >
                                end room
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        pipWindow.document.body
    )
}