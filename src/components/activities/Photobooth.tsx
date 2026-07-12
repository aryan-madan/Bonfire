import { useEffect, useRef, useState } from 'react'

declare global {
    interface Window {
        SelfieSegmentation?: new (config: { locateFile: (file: string) => string }) => SegmenterInstance
    }
}

interface SegmentationResults {
    image: CanvasImageSource
    segmentationMask: CanvasImageSource
}

interface SegmenterInstance {
    setOptions: (opts: { modelSelection: number }) => void
    onResults: (cb: (results: SegmentationResults) => void) => void
    send: (input: { image: HTMLVideoElement | HTMLCanvasElement }) => Promise<void>
    close: () => void
}

const MODEL_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation'

let modelScriptPromise: Promise<void> | null = null
const loadModelScript = (): Promise<void> => {
    if (window.SelfieSegmentation) return Promise.resolve()
    if (modelScriptPromise) return modelScriptPromise
    modelScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `${MODEL_BASE}/selfie_segmentation.js`
        script.crossOrigin = 'anonymous'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('segmentation model failed to load'))
        document.head.appendChild(script)
    })
    return modelScriptPromise
}

interface Background {
    key: string
    label: string
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

const skyGradient = (stops: string[]) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    const step = 1 / (stops.length - 1)
    stops.forEach((color, i) => g.addColorStop(i * step, color))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
}

const BACKGROUNDS: Background[] = [
    {
        key: 'hearth',
        label: 'Hearth',
        draw: skyGradient(['#3a2620', '#2a1a15', '#1c1310']),
    },
    {
        key: 'golden',
        label: 'Golden Hour',
        draw: skyGradient(['#5b3a24', '#a85a2e', '#e08a3e']),
    },
    {
        key: 'dusk',
        label: 'Dusk',
        draw: skyGradient(['#241a3d', '#3a2a52', '#c96b7a']),
    },
    {
        key: 'night',
        label: 'Night Sky',
        draw: skyGradient(['#0a0e1c', '#141c30', '#1f2a44']),
    },
    {
        key: 'mint',
        label: 'Mint',
        draw: skyGradient(['#122421', '#1b2e28', '#3c6e5c']),
    },
]

const INFER_INTERVAL_MS = 45
const INFER_WIDTH = 320
const MASK_FEATHER_PX = 4
const MASK_SMOOTHING = 0.45
const MASK_LOW = 0.4
const MASK_HIGH = 0.62

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

// ---- Polaroid rendering helpers -------------------------------------------------

// Classic instant-print proportions: a slim margin on three sides and a deep
// caption strip along the bottom where the photo "develops" into view.
const POLAROID_SIDE_PAD = 22
const POLAROID_TOP_PAD = 22
const POLAROID_BOTTOM_PAD = 96
const POLAROID_CARD_RADIUS = 4
const POLAROID_SHADOW_MARGIN = 26

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`failed to load image: ${src}`))
        img.src = src
    })

// The strip is drawn on a <canvas>, which doesn't pick up the page's @font-face
// rules automatically — load the brand font into the document's font set once
// so ctx.font = '... Pangram ...' actually resolves to it.
let pangramFontPromise: Promise<FontFace> | null = null
const loadPangramFont = (): Promise<FontFace> => {
    if (pangramFontPromise) return pangramFontPromise
    pangramFontPromise = new FontFace('Pangram', 'url(/fonts/PPPangramSansRounded-Bold.otf)', { weight: '700' })
        .load()
        .then(font => {
            document.fonts.add(font)
            return font
        })
    return pangramFontPromise
}

// Draws a single polaroid-style card (white frame + deep bottom margin + soft
// drop shadow + a faint inner vignette on the photo itself) at (x, y).
const drawPolaroidCard = (
    ctx: CanvasRenderingContext2D,
    img: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    withShadow = true,
) => {
    ctx.save()
    if (withShadow) {
        ctx.shadowColor = 'rgba(20, 14, 10, 0.35)'
        ctx.shadowBlur = 22
        ctx.shadowOffsetY = 10
    }
    ctx.fillStyle = '#fbfaf6'
    drawRoundedRect(ctx, x, y, w, h, POLAROID_CARD_RADIUS)
    ctx.fill()
    ctx.restore()

    const innerX = x + POLAROID_SIDE_PAD
    const innerY = y + POLAROID_TOP_PAD
    const innerW = w - POLAROID_SIDE_PAD * 2
    const innerH = h - POLAROID_TOP_PAD - POLAROID_BOTTOM_PAD

    ctx.save()
    drawRoundedRect(ctx, innerX, innerY, innerW, innerH, 1)
    ctx.clip()
    ctx.fillStyle = '#000'
    ctx.fillRect(innerX, innerY, innerW, innerH)
    ctx.drawImage(img, innerX, innerY, innerW, innerH)

    // faint vignette so the photo reads as a print, not a screenshot
    const vignette = ctx.createRadialGradient(
        innerX + innerW / 2, innerY + innerH / 2, innerH * 0.35,
        innerX + innerW / 2, innerY + innerH / 2, innerH * 0.75,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.16)')
    ctx.fillStyle = vignette
    ctx.fillRect(innerX, innerY, innerW, innerH)
    ctx.restore()

    ctx.save()
    drawRoundedRect(ctx, innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1, 1)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(20,14,10,0.12)'
    ctx.stroke()
    ctx.restore()
}

// ---------------------------------------------------------------------------------

const useCutout = (stream: MediaStream | null) => {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const smallCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const rawMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const maskFeatherCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const smoothedMaskRef = useRef<Float32Array | null>(null)
    const segmenterRef = useRef<SegmenterInstance | null>(null)
    const rafRef = useRef<number>(0)
    const vfcHandleRef = useRef<number | null>(null)
    const lastSendRef = useRef(0)
    const pendingRef = useRef(false)
    const [ready, setReady] = useState(false)
    const [failed, setFailed] = useState(false)

    if (!videoRef.current) videoRef.current = document.createElement('video')
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    if (!smallCanvasRef.current) smallCanvasRef.current = document.createElement('canvas')
    if (!rawMaskCanvasRef.current) rawMaskCanvasRef.current = document.createElement('canvas')
    if (!maskFeatherCanvasRef.current) maskFeatherCanvasRef.current = document.createElement('canvas')

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        if (stream && stream.getVideoTracks().length) {
            video.srcObject = new MediaStream(stream.getVideoTracks())
            video.muted = true
            video.playsInline = true
            void video.play().catch(() => { })
        } else {
            video.srcObject = null
            setReady(false)
        }
    }, [stream])

    useEffect(() => {
        if (!stream || !stream.getVideoTracks().length) return
        let cancelled = false
        smoothedMaskRef.current = null

        void loadModelScript().then(() => {
            if (cancelled || !window.SelfieSegmentation) return
            const segmenter = new window.SelfieSegmentation({
                locateFile: file => `${MODEL_BASE}/${file}`,
            })
            segmenter.setOptions({ modelSelection: 0 })
            segmenter.onResults(results => {
                pendingRef.current = false
                const canvas = canvasRef.current
                const video = videoRef.current
                const small = smallCanvasRef.current
                const raw = rawMaskCanvasRef.current
                const feather = maskFeatherCanvasRef.current
                if (!canvas || !video || !video.videoWidth || !small || !small.width || !raw || !feather) return
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                }
                const ctx = canvas.getContext('2d')
                if (!ctx) return

                if (raw.width !== small.width || raw.height !== small.height) {
                    raw.width = small.width
                    raw.height = small.height
                }
                const rctx = raw.getContext('2d', { willReadFrequently: true })
                if (!rctx) return

                rctx.clearRect(0, 0, raw.width, raw.height)
                rctx.drawImage(results.segmentationMask, 0, 0, raw.width, raw.height)
                const imgData = rctx.getImageData(0, 0, raw.width, raw.height)
                const pixels = imgData.data
                const n = raw.width * raw.height

                if (!smoothedMaskRef.current || smoothedMaskRef.current.length !== n) {
                    const init = new Float32Array(n)
                    for (let i = 0; i < n; i++) init[i] = pixels[i * 4 + 3] / 255
                    smoothedMaskRef.current = init
                }
                const smoothed = smoothedMaskRef.current

                for (let i = 0; i < n; i++) {
                    const a = pixels[i * 4 + 3] / 255
                    const s = smoothed[i] * MASK_SMOOTHING + a * (1 - MASK_SMOOTHING)
                    smoothed[i] = s
                    const sharp = s <= MASK_LOW ? 0 : s >= MASK_HIGH ? 1 : (s - MASK_LOW) / (MASK_HIGH - MASK_LOW)
                    const v = Math.round(sharp * 255)
                    const off = i * 4
                    pixels[off] = 255
                    pixels[off + 1] = 255
                    pixels[off + 2] = 255
                    pixels[off + 3] = v
                }
                rctx.putImageData(imgData, 0, 0)

                if (feather.width !== small.width || feather.height !== small.height) {
                    feather.width = small.width
                    feather.height = small.height
                }
                const fctx = feather.getContext('2d')
                if (!fctx) return
                fctx.clearRect(0, 0, feather.width, feather.height)
                fctx.filter = `blur(${MASK_FEATHER_PX}px)`
                fctx.drawImage(raw, 0, 0, feather.width, feather.height)
                fctx.filter = 'none'

                ctx.save()
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.imageSmoothingEnabled = true
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(feather, 0, 0, feather.width, feather.height, 0, 0, canvas.width, canvas.height)
                ctx.globalCompositeOperation = 'source-in'
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
                ctx.restore()

                setReady(true)
            })
            segmenterRef.current = segmenter

            const trySend = (now: number) => {
                const video = videoRef.current
                const small = smallCanvasRef.current
                if (!video || !small || video.readyState < 2 || !video.videoWidth) return
                if (pendingRef.current) return
                if (now - lastSendRef.current < INFER_INTERVAL_MS) return
                lastSendRef.current = now

                const scale = INFER_WIDTH / video.videoWidth
                const w = INFER_WIDTH
                const h = Math.round(video.videoHeight * scale)
                if (small.width !== w || small.height !== h) {
                    small.width = w
                    small.height = h
                }
                const sctx = small.getContext('2d')
                if (!sctx) return
                sctx.drawImage(video, 0, 0, w, h)

                pendingRef.current = true
                void segmenter.send({ image: small }).catch(() => {
                    pendingRef.current = false
                })
            }

            const supportsVfc = typeof (videoRef.current as unknown as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function'

            if (supportsVfc) {
                const vfcLoop = () => {
                    if (cancelled) return
                    trySend(performance.now())
                    const video = videoRef.current as HTMLVideoElement & {
                        requestVideoFrameCallback: (cb: () => void) => number
                    }
                    vfcHandleRef.current = video.requestVideoFrameCallback(vfcLoop)
                }
                vfcLoop()
            } else {
                const rafLoop = () => {
                    if (cancelled) return
                    trySend(performance.now())
                    rafRef.current = requestAnimationFrame(rafLoop)
                }
                rafLoop()
            }
        }).catch(() => {
            if (!cancelled) setFailed(true)
        })

        return () => {
            cancelled = true
            cancelAnimationFrame(rafRef.current)
            if (vfcHandleRef.current !== null) {
                const video = videoRef.current as unknown as {
                    cancelVideoFrameCallback?: (handle: number) => void
                }
                video.cancelVideoFrameCallback?.(vfcHandleRef.current)
                vfcHandleRef.current = null
            }
            segmenterRef.current?.close()
            segmenterRef.current = null
            pendingRef.current = false
            smoothedMaskRef.current = null
        }
    }, [stream])

    return { canvasRef, ready, failed }
}

interface Props {
    local: MediaStream | null
    remote: MediaStream | null
    myName: string
    otherName: string
    onLeave: () => void
    onRequestCapture: () => void
    onShutter: () => void
    remoteTrigger: number
}

const MAX_SHOTS = 4

export const Photobooth = ({ local, remote, myName, otherName, onLeave, onRequestCapture, onShutter, remoteTrigger }: Props) => {
    const localCutout = useCutout(local)
    const remoteCutout = useCutout(remote)
    const outputRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const [bgIndex, setBgIndex] = useState(0)
    const [flash, setFlash] = useState(false)
    const [shots, setShots] = useState<string[]>([])
    const [viewing, setViewing] = useState<string | null>(null)
    const [countdown, setCountdown] = useState<number | null>(null)
    const countdownRef = useRef<number | null>(null)
    const lastRemoteTrigger = useRef(0)

    const mySide: 'left' | 'right' = (myName ?? '').trim().toLowerCase() <= (otherName ?? '').trim().toLowerCase() ? 'left' : 'right'

    useEffect(() => {
        const container = containerRef.current
        const out = outputRef.current
        if (!container || !out) return

        const resize = () => {
            out.width = container.clientWidth
            out.height = container.clientHeight
        }
        resize()

        const observer = new ResizeObserver(() => resize())
        observer.observe(container)
        return () => observer.disconnect()
    }, [])

    const drawPerson = (
        ctx: CanvasRenderingContext2D,
        cutout: ReturnType<typeof useCutout>,
        slotX: number,
        slotW: number,
        h: number,
    ) => {
        const canvas = cutout.canvasRef.current
        if (!canvas || !canvas.width || !canvas.height) return
        const cropTop = canvas.height * 0.15
        const srcH = canvas.height - cropTop
        const srcW = canvas.width
        const scale = (h * 0.98) / srcH
        const dw = srcW * scale
        const dh = srcH * scale
        const dx = slotX + (slotW - dw) / 2
        const dy = h - dh

        ctx.save()
        ctx.beginPath()
        ctx.rect(slotX, 0, slotW, h)
        ctx.clip()

        ctx.save()
        ctx.globalAlpha = 0.32
        ctx.filter = 'blur(16px)'
        ctx.translate(dx + dw, dy)
        ctx.scale(-1, 1)
        ctx.drawImage(canvas, 0, cropTop, srcW, srcH, 0, 0, dw, dh)
        ctx.filter = 'none'
        ctx.restore()

        ctx.save()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.ellipse(dx + dw / 2, h - 6, dw * 0.32, 10, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.translate(dx + dw, dy)
        ctx.scale(-1, 1)
        ctx.drawImage(canvas, 0, cropTop, srcW, srcH, 0, 0, dw, dh)
        ctx.restore()

        ctx.restore()
    }

    useEffect(() => {
        const loop = () => {
            const out = outputRef.current
            const ctx = out?.getContext('2d')
            if (out && ctx && out.width && out.height) {
                const w = out.width
                const h = out.height
                BACKGROUNDS[bgIndex].draw(ctx, w, h)
                const slotW = w * 0.56
                const leftCutout = mySide === 'left' ? localCutout : remoteCutout
                const rightCutout = mySide === 'left' ? remoteCutout : localCutout
                drawPerson(ctx, leftCutout, 0, slotW, h)
                drawPerson(ctx, rightCutout, w - slotW, slotW, h)
            }
            rafRef.current = requestAnimationFrame(loop)
        }
        loop()
        return () => cancelAnimationFrame(rafRef.current)
    }, [bgIndex, mySide])

    const captureFrame = (): string | null => {
        const out = outputRef.current
        if (!out) return null
        setFlash(true)
        setTimeout(() => setFlash(false), 220)
        return out.toDataURL('image/png')
    }

    const runCountdown = () => {
        if (countdownRef.current) return
        let n = 3
        setCountdown(n)
        countdownRef.current = window.setInterval(() => {
            n -= 1
            if (n <= 0) {
                if (countdownRef.current) window.clearInterval(countdownRef.current)
                countdownRef.current = null
                setCountdown(null)
                onShutter()
                const shot = captureFrame()
                if (shot) setShots(prev => [...prev, shot].slice(0, MAX_SHOTS))
                return
            }
            setCountdown(n)
        }, 800)
    }

    const startCapture = () => {
        if (countdownRef.current || shots.length >= MAX_SHOTS) return
        onRequestCapture()
        runCountdown()
    }

    useEffect(() => {
        if (remoteTrigger === 0 || remoteTrigger === lastRemoteTrigger.current) return
        lastRemoteTrigger.current = remoteTrigger
        if (countdownRef.current || shots.length >= MAX_SHOTS) return
        runCountdown()
    }, [remoteTrigger])

    useEffect(() => () => {
        if (countdownRef.current) window.clearInterval(countdownRef.current)
    }, [])

    // Single photo -> its own polaroid card, floating on a transparent PNG.
    const downloadOne = async (dataUrl: string) => {
        try {
            const img = await loadImage(dataUrl)
            const cardW = img.width + POLAROID_SIDE_PAD * 2
            const cardH = img.height + POLAROID_TOP_PAD + POLAROID_BOTTOM_PAD
            const canvas = document.createElement('canvas')
            canvas.width = cardW + POLAROID_SHADOW_MARGIN * 2
            canvas.height = cardH + POLAROID_SHADOW_MARGIN * 2
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('no context')
            drawPolaroidCard(ctx, img, POLAROID_SHADOW_MARGIN, POLAROID_SHADOW_MARGIN, cardW, cardH)

            const link = document.createElement('a')
            link.download = `bonfire-photobooth-${Date.now()}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } catch {
            const link = document.createElement('a')
            link.download = `bonfire-photobooth-${Date.now()}.png`
            link.href = dataUrl
            link.click()
        }
    }

    const downloadStrip = async () => {
        if (!shots.length) return
        try {
            const images = await Promise.all(shots.map(loadImage))
            await loadPangramFont().catch(() => null)

            const cellW = images[0].width
            const cellH = images[0].height

            // Everything below is sized relative to the photo's own width, not
            // a fixed pixel count — so the caption and margins stay the same
            // proportion whether the strip has 1 shot or all 4, instead of
            // getting visually crowded out as the strip grows taller. Clamped
            // so very large capture resolutions don't blow the caption up.
            const scale = Math.min(1, Math.max(0.55, cellW / 900))

            const outerPad = 18 * scale
            const photoGap = 6 * scale
            const footerH = 200 * scale

            const stripW = cellW + outerPad * 2
            const stripH = outerPad + images.length * cellH + (images.length - 1) * photoGap + footerH

            const stripCanvas = document.createElement('canvas')
            stripCanvas.width = stripW
            stripCanvas.height = stripH
            const ctx = stripCanvas.getContext('2d')
            if (!ctx) return

            // one flat white sheet — photos stacked with just a hair of
            // breathing room between them, plus a slim margin around it all.
            ctx.save()
            drawRoundedRect(ctx, 0, 0, stripW, stripH, 14 * scale)
            ctx.clip()
            ctx.fillStyle = '#fbfaf6'
            ctx.fillRect(0, 0, stripW, stripH)
            ctx.restore()

            images.forEach((img, idx) => {
                const x = outerPad
                const y = outerPad + idx * (cellH + photoGap)
                ctx.drawImage(img, x, y, cellW, cellH)
            })

            const footerTop = outerPad + images.length * cellH + (images.length - 1) * photoGap
            const footerCenterY = footerTop + footerH / 2
            const centerX = stripW / 2

            // centered caption, in the brand font, in black — sized as big as
            // will comfortably fit the strip's width
            const maxTextWidth = stripW - outerPad * 2
            let brandSize = 64 * scale
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = '#14100d'
            while (brandSize > 28 * scale) {
                ctx.font = `700 ${brandSize}px Pangram, system-ui, sans-serif`
                if (ctx.measureText('bonfire').width <= maxTextWidth) break
                brandSize -= 3 * scale
            }
            ctx.fillText('bonfire', centerX, footerCenterY - 22 * scale)

            // date + time, monospace, muted
            const now = new Date()
            const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            ctx.font = `${20 * scale}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`
            ctx.fillStyle = 'rgba(20,14,10,0.5)'
            ctx.fillText(`${dateStr}  ·  ${timeStr}`, centerX, footerCenterY + 34 * scale)

            const link = document.createElement('a')
            link.download = `bonfire-photobooth-strip-${Date.now()}.png`
            link.href = stripCanvas.toDataURL('image/png')
            link.click()
        } catch {
            // if anything fails, fall back to just grabbing the first shot
            void downloadOne(shots[0])
        }
    }

    const removeShot = (idx: number) => {
        setShots(prev => prev.filter((_, i) => i !== idx))
    }

    const bothStreaming = !!local?.getVideoTracks().length && !!remote?.getVideoTracks().length
    const modelsFailed = localCutout.failed || remoteCutout.failed
    const modelsLoading = bothStreaming && !modelsFailed && !(localCutout.ready && remoteCutout.ready)

    return (
        <div ref={containerRef} className="relative h-full w-full bg-cocoa-800">
            <canvas ref={outputRef} className="absolute inset-0 h-full w-full" />

            {flash && <div className="absolute inset-0 bg-white animate-[photoFlash_220ms_ease-out]" />}
            <style>{`
                @keyframes photoFlash {
                    0%   { opacity: 0.9; }
                    100% { opacity: 0; }
                }
            `}</style>

            {countdown !== null && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-black/30">
                    <span key={countdown} className="text-8xl font-bold text-white drop-shadow-lg" style={{ animation: 'countdownPop 800ms ease-out' }}>
                        {countdown}
                    </span>
                    <style>{`
                        @keyframes countdownPop {
                            0%   { opacity: 0; transform: scale(1.4); }
                            15%  { opacity: 1; transform: scale(1); }
                            85%  { opacity: 1; }
                            100% { opacity: 0; }
                        }
                    `}</style>
                </div>
            )}

            {!bothStreaming && (
                <div className="grid h-full place-items-center px-6 text-center">
                    <div className="max-w-xs space-y-2">
                        <i className="fa-solid fa-camera-retro text-2xl text-ember-100/30" />
                        <p className="text-sm font-semibold leading-5 text-ember-100/45">
                            turn your camera on{otherName ? ` and wait for ${otherName} to do the same` : ''} to use the photobooth.
                        </p>
                    </div>
                </div>
            )}

            {bothStreaming && modelsFailed && (
                <div className="grid h-full place-items-center px-6 text-center">
                    <p className="max-w-xs text-sm font-semibold leading-5 text-berry-300">
                        couldn't load the background removal model. check your connection and try again.
                    </p>
                </div>
            )}

            {modelsLoading && (
                <div className="absolute inset-0 grid place-items-center bg-cocoa-900/60">
                    <div className="flex items-center gap-2 rounded-full bg-cocoa-900/80 backdrop-blur px-4 py-2 text-xs font-bold text-ember-100/60">
                        <i className="fa-solid fa-circle-notch animate-spin" />
                        setting up the photobooth
                    </div>
                </div>
            )}

            <div className="absolute top-3 left-3">
                <button
                    onClick={onLeave}
                    title="back to activities"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/70 transition-colors"
                >
                    <i className="fa-solid fa-arrow-left text-xs" />
                </button>
            </div>

            {bothStreaming && !modelsFailed && shots.length > 0 && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                        onClick={() => void downloadStrip()}
                        className="flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 text-xs font-bold text-white/90 hover:bg-black/70 transition-colors"
                    >
                        <i className="fa-solid fa-download" />
                        download strip
                    </button>
                    <button
                        onClick={() => setShots([])}
                        className="flex items-center gap-1.5 rounded-full bg-berry-300/25 backdrop-blur-md border border-berry-300/25 px-4 py-2 text-xs font-bold text-berry-300 hover:bg-berry-300/40 transition-colors"
                    >
                        <i className="fa-solid fa-trash" />
                        clear
                    </button>
                </div>
            )}

            {bothStreaming && !modelsFailed && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
                    {shots.length > 0 && (
                        <div className="flex items-center gap-2 rounded-2xl bg-cocoa-900/90 backdrop-blur p-2">
                            {shots.map((shot, i) => (
                                <div key={i} className="group relative h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                                    <img
                                        src={shot}
                                        onClick={() => setViewing(shot)}
                                        className="h-full w-full cursor-pointer object-cover"
                                        alt={`Shot ${i + 1}`}
                                    />
                                    <button
                                        onClick={() => removeShot(i)}
                                        className="absolute top-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[0.5rem] text-white group-hover:flex"
                                    >
                                        <i className="fa-solid fa-xmark" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2 rounded-full bg-cocoa-900/90 backdrop-blur px-3 py-2">
                        {BACKGROUNDS.map((bg, i) => (
                            <button
                                key={bg.key}
                                onClick={() => setBgIndex(i)}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${bgIndex === i ? 'bg-ember-400 text-white' : 'text-ember-100/50 hover:text-ember-100/80'}`}
                            >
                                {bg.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={startCapture}
                        disabled={!localCutout.ready || !remoteCutout.ready || countdown !== null || shots.length >= MAX_SHOTS}
                        title={shots.length >= MAX_SHOTS ? 'strip full' : 'take photo'}
                        className="grid h-14 w-14 place-items-center rounded-full bg-ember-400 text-white shadow-lg hover:bg-ember-500 active:scale-95 disabled:opacity-40 transition-all"
                    >
                        <i className="fa-solid fa-camera text-lg" />
                    </button>
                    <span className="text-[0.65rem] font-bold text-ember-100/40">{shots.length}/{MAX_SHOTS} shots</span>
                </div>
            )}

            {viewing && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-sm px-6" onClick={() => setViewing(null)}>
                    <div className="w-full max-w-md space-y-4 rounded-[1.5rem] bg-plum-900 p-5" onClick={e => e.stopPropagation()}>
                        <img src={viewing} alt="Photobooth capture" className="w-full rounded-[1rem]" />
                        <div className="flex gap-2.5">
                            <button
                                onClick={() => setViewing(null)}
                                className="flex-1 rounded-full bg-cocoa-800 py-2.5 text-xs font-bold text-ember-100/70 hover:bg-cocoa-700 transition-colors"
                            >
                                close
                            </button>
                            <button
                                onClick={() => void downloadOne(viewing)}
                                className="flex-1 rounded-full bg-ember-400 py-2.5 text-xs font-bold text-white hover:bg-ember-500 transition-colors"
                            >
                                <i className="fa-solid fa-download mr-1.5" />
                                save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}