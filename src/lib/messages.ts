export type Kind =
    | 'chat'
    | 'play'
    | 'pause'
    | 'seek'
    | 'queue'
    | 'next'
    | 'name'
    | 'media-offer'
    | 'media-answer'
    | 'media-state'
    | 'typing'
    | 'end'
    | 'message'
    | 'reaction'
    | 'activity'
    | 'whiteboard-stroke'
    | 'whiteboard-clear'
    | 'photobooth-capture'
    | 'study-state'

export interface Msg {
    kind: Kind
    payload: unknown
}

export function pack(kind: Kind, payload: unknown): string {
    return JSON.stringify({ kind, payload })
}

export function unpack(raw: string): Msg {
    return JSON.parse(raw)
}