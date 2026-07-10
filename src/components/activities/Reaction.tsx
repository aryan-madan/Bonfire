import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavBtn } from '../call/Controls'

export interface Burst {
    id: string
    emoji: string
}

const EMOJIS = ['🔥', '❤️', '😂', '👍', '😮', '👏']

const ReactionParticle = ({ burst, onDone }: {
    burst: Burst
    onDone: (id: string) => void
}) => {
    const style = useMemo(() => {
        const right = 6 + Math.random() * 26
        const duration = 1500 + Math.random() * 350
        const size = 1.7 + Math.random() * 0.9
        const drift = -18 + Math.random() * 36
        return {
            right: `${right}%`,
            bottom: '6%',
            fontSize: `${size}rem`,
            '--drift': `${drift}px`,
            animation: `reactionRise ${duration}ms linear forwards`,
            willChange: 'transform, opacity',
        } as React.CSSProperties
    }, [])

    useEffect(() => {
        const t = setTimeout(() => onDone(burst.id), 1900)
        return () => clearTimeout(t)
    }, [burst.id, onDone])

    return (
        <span className="absolute select-none drop-shadow-lg" style={style}>
            {burst.emoji}
        </span>
    )
}

export const ReactionOverlay = ({ bursts, onDone }: {
    bursts: Burst[]
    onDone: (id: string) => void
}) => createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9997] overflow-hidden">
        <style>{`
            @keyframes reactionRise {
                0%   { transform: translateY(0) translateX(0); opacity: 0; }
                10%  { opacity: 1; }
                65%  { opacity: 1; }
                100% { transform: translateY(-55vh) translateX(var(--drift)); opacity: 0; }
            }
        `}</style>
        {bursts.map(b => (
            <ReactionParticle key={b.id} burst={b} onDone={onDone} />
        ))}
    </div>,
    document.body
)

export const ReactionButton = ({ onPick }: { onPick: (emoji: string) => void }) => {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({ top: 0, right: 0 })
    const wrapRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const toggle = () => {
        if (open) { setOpen(false); return }
        const rect = wrapRef.current?.getBoundingClientRect()
        if (rect) setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return
            if (wrapRef.current?.contains(e.target as Node)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('mousedown', onDown, true)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('mousedown', onDown, true)
            window.removeEventListener('keydown', onKey)
        }
    }, [open])

    return (
        <>
            <div ref={wrapRef}>
                <NavBtn
                    active={open}
                    onClick={toggle}
                    icon="fa-regular fa-face-smile"
                    label="react"
                />
            </div>
            {open && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: pos.top, right: pos.right }}
                    className="z-[9999] flex items-center gap-1 rounded-2xl bg-plum-900 p-1.5 shadow-2xl ring-1 ring-white/[0.08]"
                >
                    {EMOJIS.map(e => (
                        <button
                            key={e}
                            onClick={() => { onPick(e); setOpen(false) }}
                            className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-cocoa-800 active:scale-90 transition-all"
                        >
                            {e}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    )
}

export { ReactionButton as ReactionPicker }