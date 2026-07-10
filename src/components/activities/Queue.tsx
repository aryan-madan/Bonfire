import { useRef, useState } from 'react'

export interface Item {
    id: string
    url: string
    title?: string
    thumb?: string
}

export const QueueBar = ({ show, setShow, ytError, input, setInput, setYtError, add, current, queue, onReorder, inline = false }: {
    show: boolean
    setShow: (v: boolean | ((v: boolean) => boolean)) => void
    ytError: boolean
    input: string
    setInput: (v: string) => void
    setYtError: (v: boolean) => void
    add: () => void
    current: Item | null
    queue: Item[]
    onReorder: (next: Item[]) => void
    onScreenShare: () => void
    screenBusy: boolean
    inline?: boolean
}) => {
    const total = queue.length + (current ? 1 : 0)
    const dragItem = useRef<number | null>(null)
    const dragOver = useRef<number | null>(null)
    const [dragging, setDragging] = useState<number | null>(null)

    const onDragStart = (i: number) => { dragItem.current = i; setDragging(i) }
    const onDragEnter = (i: number) => { dragOver.current = i }
    const onDragEnd = () => {
        if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
            const next = [...queue]
            const [moved] = next.splice(dragItem.current, 1)
            next.splice(dragOver.current, 0, moved)
            onReorder(next)
        }
        dragItem.current = null
        dragOver.current = null
        setDragging(null)
    }

    return (
        <div className={`${inline ? '' : 'px-4 py-3'}`}>
            {show && total > 0 && (
                <div className="mb-2 rounded-[1.25rem] overflow-hidden bg-cocoa-900/85 backdrop-blur max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {current && (
                        <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.07]">
                            <div className="h-2 w-2 rounded-full bg-ember-400 animate-pulse shrink-0" />
                            {current.thumb
                                ? <img className="h-10 w-16 rounded-xl object-cover shrink-0" src={current.thumb} alt="" />
                                : <div className="h-10 w-16 rounded-xl bg-cocoa-700 grid place-items-center shrink-0"><i className="fa-solid fa-play text-[0.6rem] text-ember-100/30" /></div>
                            }
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-ember-50 truncate">{current.title || 'YouTube video'}</p>
                                <p className="text-[0.6rem] font-semibold text-ember-400 mt-0.5">playing now</p>
                            </div>
                        </div>
                    )}
                    {queue.map((item, i) => (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={() => onDragStart(i)}
                            onDragEnter={() => onDragEnter(i)}
                            onDragEnd={onDragEnd}
                            onDragOver={e => e.preventDefault()}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0 cursor-grab active:cursor-grabbing select-none transition-all ${dragging === i ? 'opacity-40 bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                        >
                            <i className="fa-solid fa-grip-vertical text-[0.6rem] text-ember-100/25 shrink-0" />
                            <span className="text-[0.6rem] font-bold text-ember-100/30 w-4 text-center shrink-0">{i + 1}</span>
                            {item.thumb
                                ? <img className="h-10 w-16 rounded-xl object-cover shrink-0" src={item.thumb} alt="" />
                                : <div className="h-10 w-16 rounded-xl bg-cocoa-700 grid place-items-center shrink-0"><i className="fa-solid fa-play text-[0.6rem] text-ember-100/30" /></div>
                            }
                            <p className="text-xs font-semibold text-ember-100/75 truncate flex-1">{item.title || 'YouTube video'}</p>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 flex-1 rounded-full px-4 py-2.5 transition-all ${inline ? 'bg-cocoa-800' : 'bg-cocoa-900/80 backdrop-blur'} ${ytError ? 'ring-1 ring-berry-300/60' : ''}`}>
                        <i className={`fa-brands fa-youtube text-sm shrink-0 ${ytError ? 'text-berry-300' : 'text-ember-100/30'}`} />
                        <input
                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 focus:outline-none"
                            value={input}
                            onChange={e => { setInput(e.target.value); setYtError(false) }}
                            onKeyDown={e => e.key === 'Enter' && add()}
                            placeholder={ytError ? 'youtube links only' : 'paste a youtube link...'}
                        />
                        <button
                            className="shrink-0 rounded-full bg-ember-400 px-4 py-1.5 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-30 transition-colors"
                            onClick={add}
                            disabled={!input.trim()}
                        >
                            add
                        </button>
                    </div>
                    {!inline && total > 0 && (
                        <button
                            onClick={() => setShow(v => !v)}
                            className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-xs font-bold backdrop-blur transition-all shrink-0 ${show ? 'bg-ember-400/20 text-ember-400' : 'bg-cocoa-900/80 text-ember-100/60 hover:text-ember-50'}`}
                        >
                            <i className="fa-solid fa-list-ul" />
                            <span>{total}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}