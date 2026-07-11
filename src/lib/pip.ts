import { useCallback, useEffect, useRef, useState } from 'react'

export interface DocPipWindow extends Window {
    document: Document
}

interface DocPip {
    requestWindow: (options?: { width?: number; height?: number }) => Promise<DocPipWindow>
}

declare global {
    interface Window {
        documentPictureInPicture?: DocPip
    }
}

export const useDocPip = () => {
    const [pipWindow, setPipWindow] = useState<DocPipWindow | null>(null)
    const opening = useRef(false)
    const isSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window

    const close = useCallback(() => {
        pipWindow?.close()
        setPipWindow(null)
    }, [pipWindow])

    const open = useCallback(async (width = 300, height = 220) => {
        if (!isSupported || opening.current) return null
        if (pipWindow) return pipWindow
        opening.current = true
        try {
            const win = await window.documentPictureInPicture!.requestWindow({ width, height })
            document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
                win.document.head.appendChild(node.cloneNode(true))
            })
            win.document.body.style.margin = '0'
            win.document.body.style.overflow = 'hidden'
            win.document.body.style.background = '#1c1512'
            win.addEventListener('pagehide', () => setPipWindow(null), { once: true })
            setPipWindow(win)
            return win
        } finally {
            opening.current = false
        }
    }, [isSupported, pipWindow])

    useEffect(() => () => { pipWindow?.close() }, [pipWindow])

    return { pipWindow, open, close, isSupported }
}