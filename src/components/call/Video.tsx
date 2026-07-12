export const av = (n: string) => n.slice(0, 2).toUpperCase()

export const VideoTile = ({ isLocal, expanded, local, remote, cam, mic, remoteCam, remoteMic, sharing, name, other, localVidRef, remoteVidRef, speaking, onContextMenu, forceHideVideo, mutedForYou }: {
    isLocal: boolean
    expanded: boolean
    local: MediaStream | null
    remote: MediaStream | null
    cam: boolean
    mic: boolean
    remoteCam: boolean
    remoteMic: boolean
    sharing?: boolean
    name: string
    other: string
    localVidRef: (el: HTMLVideoElement | null) => void
    remoteVidRef: (el: HTMLVideoElement | null) => void
    speaking?: boolean
    onContextMenu?: (e: React.MouseEvent) => void
    forceHideVideo?: boolean
    mutedForYou?: boolean
}) => {
    const hasStream = isLocal ? !!local : !!remote
    const hasVideo = isLocal ? (!!local && cam) : (!!remote && remoteCam && !forceHideVideo)
    const hasMic = isLocal ? mic : remoteMic
    const displayName = isLocal ? name : (other || 'connecting...')
    const avatarBg = isLocal ? 'bg-ember-400' : 'bg-mint-300'
    const avatarSize = expanded ? 'h-20 w-20 text-xl' : 'h-14 w-14 text-base'

    return (
        <div
            onContextMenu={onContextMenu}
            className={`relative overflow-hidden bg-cocoa-800 min-h-0 flex-1 transition-shadow duration-150 ${expanded ? 'rounded-[1.75rem]' : 'rounded-[1.15rem]'} ${speaking ? 'border-2 border-mint-300' : 'border-2 border-transparent'}`}
        >
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
                    {sharing && isLocal ? (
                        <>
                            <div className={`${avatarSize} rounded-full grid place-items-center bg-ember-400/20 text-ember-400`}>
                                <i className="fa-solid fa-desktop" />
                            </div>
                            {expanded && <span className="text-sm font-bold text-ember-100/40">sharing your screen</span>}
                        </>
                    ) : (
                        <>
                            <div
                                className={`${avatarSize} rounded-full grid place-items-center font-bold text-white ${avatarBg} ${speaking ? 'border-2 border-mint-300' : ''}`}
                            >
                                {(!isLocal && !other) ? <i className="fa-solid fa-user" /> : av(displayName)}
                            </div>
                            {expanded && <span className="text-sm font-bold text-ember-100/40">{displayName}</span>}
                        </>
                    )}
                </div>
            )}
            <div className="absolute top-2 left-2 right-2 flex items-center gap-1.5 rounded-full bg-cocoa-900/70 backdrop-blur-sm px-2.5 py-1.5 w-fit max-w-[calc(100%-1rem)]">
                {hasStream && (
                    <i className={`fa-solid text-[0.55rem] shrink-0 ${hasMic ? 'fa-microphone text-ember-100/50' : 'fa-microphone-slash text-berry-300/80'}`} />
                )}
                <span className="text-[0.6rem] font-bold text-ember-100/70 truncate">{displayName}</span>
                {mutedForYou && !isLocal && (
                    <i className="fa-solid fa-volume-xmark text-[0.55rem] text-berry-300 shrink-0" title="muted for you" />
                )}
            </div>
            {sharing && !isLocal && (
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-cocoa-900/70 backdrop-blur-sm px-2 py-1">
                    <i className="fa-solid fa-desktop text-[0.55rem] text-ember-400" />
                    <span className="text-[0.55rem] font-bold text-ember-100/70">sharing</span>
                </div>
            )}
        </div>
    )
}

export const ScreenStage = ({ isLocalSharing, isRemoteSharing, screenVidRef, remoteVidRef, otherName, onStop }: {
    isLocalSharing: boolean
    isRemoteSharing: boolean
    screenVidRef: (el: HTMLVideoElement | null) => void
    remoteVidRef: (el: HTMLVideoElement | null) => void
    otherName: string
    onStop: () => void
}) => (
    <div className="relative flex-1 rounded-[1.75rem] overflow-hidden bg-black min-h-0">
        {isLocalSharing && (
            <video ref={screenVidRef} autoPlay playsInline muted className="h-full w-full object-contain" />
        )}
        {isRemoteSharing && !isLocalSharing && (
            <video ref={remoteVidRef} autoPlay playsInline className="h-full w-full object-contain" />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-cocoa-900/70 backdrop-blur-sm px-3.5 py-2">
            <i className="fa-solid fa-desktop text-[0.6rem] text-ember-400" />
            <span className="text-xs font-bold text-ember-100/80">
                {isLocalSharing ? 'you are sharing your screen' : `${otherName || 'they'} is sharing their screen`}
            </span>
        </div>
        {isLocalSharing && (
            <button
                onClick={onStop}
                className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-berry-300/20 backdrop-blur-md border border-berry-300/20 px-4 py-2 text-xs font-bold text-berry-300 hover:bg-berry-300/35 transition-colors"
            >
                <i className="fa-solid fa-stop" />
                stop sharing
            </button>
        )}
    </div>
)