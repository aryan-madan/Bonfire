import { createPortal } from 'react-dom'

export interface Toast {
    id: string
    text: string
    kind: 'info' | 'success' | 'error'
}

const toastIcon = (kind: Toast['kind']) => {
    if (kind === 'success') return 'fa-solid fa-circle-check'
    if (kind === 'error') return 'fa-solid fa-triangle-exclamation'
    return 'fa-solid fa-circle-info'
}

const toastColor = (kind: Toast['kind']) => {
    if (kind === 'success') return 'text-mint-300'
    if (kind === 'error') return 'text-berry-300'
    return 'text-ember-400'
}

export const ToastStack = ({ toasts }: { toasts: Toast[] }) => createPortal(
    <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2">
        <style>{`
            @keyframes toastIn {
                from { opacity: 0; transform: translateY(-10px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
        `}</style>
        {toasts.map(t => (
            <div
                key={t.id}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-cocoa-800/95 backdrop-blur border border-white/[0.06] px-4 py-2.5 shadow-lg"
                style={{ animation: 'toastIn 260ms cubic-bezier(0.4,0,0.2,1) both' }}
            >
                <i className={`${toastIcon(t.kind)} text-xs ${toastColor(t.kind)}`} />
                <span className="text-xs font-bold text-ember-50">{t.text}</span>
            </div>
        ))}
    </div>,
    document.body
)