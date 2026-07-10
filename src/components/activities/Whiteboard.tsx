import { useEffect, useRef, useState } from 'react'

export interface Point {
    x: number
    y: number
}

export interface Stroke {
    id: string
    points: Point[]
    color: string
    size: number
    erase?: boolean
}

const COLORS = ['#f4a15d', '#f2f0ea', '#7dd8b0', '#e8607a', '#5da8f4']

interface Props {
    strokes: Stroke[]
    onStrokeUpdate: (stroke: Stroke) => void
    onStrokeEnd: (stroke: Stroke) => void
    onClear: () => void
    onLeave: () => void
    hovered: boolean
}

export const Whiteboard = ({ strokes, onStrokeUpdate, onStrokeEnd, onClear, onLeave, hovered }: Props) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const drawing = useRef(false)
    const activeStroke = useRef<Stroke | null>(null)
    const [color, setColor] = useState(COLORS[0])
    const [erasing, setErasing] = useState(false)

    const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        if (stroke.points.length < 2) return
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.lineWidth = stroke.size
        ctx.strokeStyle = stroke.color
        ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
        ctx.beginPath()
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
        }
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
    }

    const redraw = () => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const ratio = window.devicePixelRatio || 1
        ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
        for (const stroke of strokes) drawStroke(ctx, stroke)
    }

    const resize = () => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return
        const ratio = window.devicePixelRatio || 1
        canvas.width = container.clientWidth * ratio
        canvas.height = container.clientHeight * ratio
        canvas.style.width = `${container.clientWidth}px`
        canvas.style.height = `${container.clientHeight}px`
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        redraw()
    }

    useEffect(() => {
        resize()
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        redraw()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strokes])

    const posFromEvent = (e: React.PointerEvent): Point => {
        const rect = canvasRef.current!.getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        activeStroke.current = {
            id: crypto.randomUUID(),
            points: [posFromEvent(e)],
            color,
            size: erasing ? 26 : 3.5,
            erase: erasing,
        }
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!drawing.current || !activeStroke.current) return
        activeStroke.current = {
            ...activeStroke.current,
            points: [...activeStroke.current.points, posFromEvent(e)],
        }
        onStrokeUpdate(activeStroke.current)
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx) drawStroke(ctx, activeStroke.current)
    }

    const handlePointerUp = () => {
        if (!drawing.current || !activeStroke.current) return
        drawing.current = false
        onStrokeEnd(activeStroke.current)
        activeStroke.current = null
    }

    const exportPng = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const out = document.createElement('canvas')
        out.width = canvas.width
        out.height = canvas.height
        const ctx = out.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#251b16'
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(canvas, 0, 0)
        const link = document.createElement('a')
        link.download = `bonfire-whiteboard-${Date.now()}.png`
        link.href = out.toDataURL('image/png')
        link.click()
    }

    return (
        <div ref={containerRef} className="relative h-full w-full bg-cocoa-800">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
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

            <div className={`absolute top-3 right-3 flex items-center gap-2 transition-all duration-300 ${hovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                <button
                    onClick={exportPng}
                    className="flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-xs font-bold text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-download" />
                    export
                </button>
                <button
                    onClick={onClear}
                    className="flex items-center gap-1.5 rounded-full bg-berry-300/20 backdrop-blur-md border border-berry-300/20 px-4 py-2 text-xs font-bold text-berry-300 hover:bg-berry-300/35 transition-colors"
                >
                    <i className="fa-solid fa-trash" />
                    clear
                </button>
            </div>

            <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-cocoa-900/85 backdrop-blur px-3 py-2 transition-all duration-300 ${hovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                {COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => { setColor(c); setErasing(false) }}
                        className={`h-6 w-6 rounded-full transition-transform ${!erasing && color === c ? 'scale-110 ring-2 ring-white/70' : 'hover:scale-105'}`}
                        style={{ background: c }}
                    />
                ))}
                <div className="w-px h-5 bg-ember-100/10 mx-1" />
                <button
                    onClick={() => setErasing(v => !v)}
                    title="eraser"
                    className={`flex items-center justify-center h-8 w-8 rounded-full text-xs transition-colors ${erasing ? 'bg-ember-400 text-white' : 'bg-cocoa-800 text-ember-100/60 hover:text-ember-100/90'}`}
                >
                    <i className="fa-solid fa-eraser" />
                </button>
            </div>
        </div>
    )
}