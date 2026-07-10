import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const NavBtn = ({ active, onClick, icon, label, dot, badge, disabled }: {
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

export const DeviceDropdown = ({ icon, value, options, fallback, onChange, disabled }: {
    icon: string
    value: string
    options: MediaDeviceInfo[]
    fallback: string
    onChange: (value: string) => void | Promise<void>
    disabled?: boolean
}) => {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0, flip: false })
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const selected = options.find(d => d.deviceId === value)
    const label = selected ? (selected.label || fallback) : fallback

    const MENU_MAX_HEIGHT = 224 // matches max-h-56

    const openMenu = () => {
        if (disabled) return
        const rect = btnRef.current?.getBoundingClientRect()
        if (rect) {
            const spaceBelow = window.innerHeight - rect.bottom
            const flip = spaceBelow < MENU_MAX_HEIGHT + 12 && rect.top > spaceBelow
            setPos({
                top: flip ? rect.top - 6 : rect.bottom + 6,
                left: rect.left,
                width: rect.width,
                flip,
            })
        }
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return
            if (btnRef.current?.contains(e.target as Node)) return
            setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        const onReposition = () => setOpen(false)
        window.addEventListener('mousedown', onDown, true)
        window.addEventListener('keydown', onKey)
        window.addEventListener('resize', onReposition)
        window.addEventListener('scroll', onReposition, true)
        return () => {
            window.removeEventListener('mousedown', onDown, true)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('resize', onReposition)
            window.removeEventListener('scroll', onReposition, true)
        }
    }, [open])

    const select = (id: string) => {
        setOpen(false)
        void onChange(id)
    }

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={() => (open ? setOpen(false) : openMenu())}
                disabled={disabled}
                className={`flex w-full items-center gap-2 rounded-xl bg-cocoa-800 px-2.5 py-1.5 text-left ring-1 ring-ember-100/5 transition-colors disabled:opacity-50 ${open ? 'bg-cocoa-700' : 'hover:bg-cocoa-700'}`}
            >
                <i className={`${icon} w-3 text-center text-[0.6rem] text-ember-100/35`} />
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-ember-100/70">{label}</span>
                <i className={`fa-solid fa-chevron-down text-[0.55rem] text-ember-100/30 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    style={{
                        position: 'fixed',
                        top: pos.flip ? undefined : pos.top,
                        bottom: pos.flip ? window.innerHeight - pos.top : undefined,
                        left: pos.left,
                        width: pos.width,
                    }}
                    className="z-[9999] max-h-56 overflow-y-auto rounded-2xl bg-plum-900 p-1.5 shadow-2xl ring-1 ring-white/[0.08] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <button
                        onClick={() => select('')}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${!value ? 'bg-cocoa-800 text-ember-50' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                    >
                        <span className="truncate">{fallback}</span>
                        {!value && <i className="fa-solid fa-check text-[0.6rem] shrink-0" />}
                    </button>
                    {options.map(device => (
                        <button
                            key={device.deviceId}
                            onClick={() => select(device.deviceId)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${value === device.deviceId ? 'bg-cocoa-800 text-ember-50' : 'text-ember-100/60 hover:bg-cocoa-800 hover:text-ember-50'}`}
                        >
                            <span className="truncate">{device.label || fallback}</span>
                            {value === device.deviceId && <i className="fa-solid fa-check text-[0.6rem] shrink-0" />}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    )
}

export const TypingDots = () => (
    <div className="flex items-center gap-1 rounded-[1.15rem] rounded-bl-[0.35rem] bg-cocoa-800 px-3.5 py-3 w-fit">
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-ember-100/40 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
)