import { useEffect, useRef } from 'react'
import { av } from '../call/Video.tsx'
import { TypingDots } from '../call/Controls'

export interface Message {
    id: string
    sender: string
    text: string
    stamp: number
}

interface Group {
    id: string
    sender: string
    texts: string[]
    mine: boolean
    stamp: number
}

const toGroups = (messages: Message[], name: string): Group[] => {
    const groups: Group[] = []
    for (const m of messages) {
        const mine = m.sender === name
        const last = groups[groups.length - 1]
        if (last && last.mine === mine && m.stamp - last.stamp < 120000) {
            last.texts.push(m.text)
            last.stamp = m.stamp
        } else {
            groups.push({ id: m.id, sender: m.sender, texts: [m.text], mine, stamp: m.stamp })
        }
    }
    return groups
}

const bubbleRadius = (mine: boolean, total: number, i: number): string => {
    if (total === 1) return 'rounded-[1.15rem]'
    if (mine) {
        if (i === 0) return 'rounded-[1.15rem] rounded-br-[0.35rem]'
        if (i === total - 1) return 'rounded-[1.15rem] rounded-tr-[0.35rem]'
        return 'rounded-[1.15rem] rounded-r-[0.35rem]'
    }
    if (i === 0) return 'rounded-[1.15rem] rounded-bl-[0.35rem]'
    if (i === total - 1) return 'rounded-[1.15rem] rounded-tl-[0.35rem]'
    return 'rounded-[1.15rem] rounded-l-[0.35rem]'
}

const RMOY_LINK = /https?:\/\/reminds-me-of-you\.vercel\.app\/s\/[a-zA-Z0-9]+/g

const renderMessageText = (text: string, mine: boolean, senderName: string) => {
    const parts = text.split(RMOY_LINK)
    const matches = text.match(RMOY_LINK) ?? []
    if (!matches.length) return text

    const introText = mine ? 'you sent a song!' : `${senderName} sent you a song!`
    const nodes: React.ReactNode[] = []
    parts.forEach((part, i) => {
        if (part) nodes.push(<span key={`t-${i}`}>{part}</span>)
        if (matches[i]) {
            nodes.push(<span key={`t-intro-${i}`}>{introText} </span>)
            nodes.push(
                <a
                    key={`link-${i}`}
                    href={matches[i]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${mine
                        ? 'bg-black/15 text-white hover:bg-black/25'
                        : 'bg-ember-400/10 text-ember-50 hover:bg-ember-400/[0.18]'
                        }`}
                >
                    <i className={`fa-solid fa-heart text-[0.7rem] ${mine ? 'text-white/70' : 'text-ember-400'}`} />
                    reminds me of you
                </a>
            )
        }
    })
    return nodes
}

interface Props {
    messages: Message[]
    name: string
    other: string
    left: boolean
    otherTyping: boolean
    draft: string
    onDraftChange: (v: string) => void
    onSend: () => void
    onBlur: () => void
}

export const Messages = ({ messages, name, other, left, otherTyping, draft, onDraftChange, onSend, onBlur }: Props) => {
    const bottom = useRef<HTMLDivElement>(null)
    const groups = toGroups(messages, name)

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, otherTyping])

    return (
        <div className="flex-1 flex flex-col rounded-[1.75rem] bg-plum-900 overflow-hidden min-h-0 w-[320px]">
            <div className="px-4 py-3 shrink-0">
                <h2 className="text-sm font-bold text-ember-50">chat</h2>
                <p className="mt-0.5 text-xs font-bold text-ember-100/45">
                    {other && !left ? `with ${other}` : left ? `${other} left` : 'waiting'}
                </p>
            </div>
            {left && (
                <div className="mx-3 mb-2 shrink-0 rounded-[1.1rem] bg-berry-300/15 px-3 py-2 text-xs font-bold text-berry-300">
                    {other} disconnected. They can rejoin with the same link.
                </div>
            )}
            <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-0">
                {groups.length === 0 && !otherTyping && (
                    <div className="grid h-full place-items-center text-center text-sm font-semibold text-ember-100/35 py-8">
                        <div className="space-y-2">
                            <i className="fa-regular fa-comment text-2xl" />
                            <p>no messages yet</p>
                        </div>
                    </div>
                )}
                <div className="flex flex-col gap-4">
                    {groups.map(g => (
                        <div key={g.id} className={`flex items-end gap-2 ${g.mine ? 'flex-row-reverse' : ''}`}>
                            <div className={`h-7 w-7 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0 mb-0.5 ${g.mine ? 'bg-ember-400' : 'bg-mint-300'}`}>
                                {av(g.sender)}
                            </div>
                            <div className={`flex max-w-[78%] min-w-0 flex-col gap-1 ${g.mine ? 'items-end' : 'items-start'}`}>
                                {!g.mine && <span className="px-2 text-xs font-bold text-ember-100/35">{g.sender}</span>}
                                {g.texts.map((t, i) => (
                                    <span
                                        key={i}
                                        className={`inline-block max-w-full break-all px-3 py-2 text-sm font-semibold leading-5 ${g.mine ? 'bg-ember-400 text-white' : 'bg-cocoa-800 text-ember-50'} ${bubbleRadius(g.mine, g.texts.length, i)}`}
                                    >
                                        {renderMessageText(t, g.mine, g.sender)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                    {otherTyping && !left && (
                        <div className="flex items-end gap-2">
                            <div className="h-7 w-7 rounded-full grid place-items-center text-[0.6rem] font-bold text-white shrink-0 mb-0.5 bg-mint-300">
                                {av(other || '?')}
                            </div>
                            <TypingDots />
                        </div>
                    )}
                </div>
                <div ref={bottom} />
            </div>
            <div className="p-3 shrink-0">
                <div className="flex items-center gap-2 rounded-[1.25rem] bg-cocoa-800 px-3 py-2">
                    <input
                        className="min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold text-ember-50 placeholder:text-ember-100/30 focus:outline-none"
                        value={draft}
                        onChange={e => onDraftChange(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && onSend()}
                        onBlur={onBlur}
                        placeholder={other && !left ? `message ${other}` : 'say something'}
                    />
                    <button
                        className="grid h-9 w-9 place-items-center rounded-full bg-ember-400 text-white hover:bg-ember-500 disabled:opacity-30 transition-colors shrink-0"
                        onClick={onSend}
                        disabled={!draft.trim()}
                    >
                        <i className="fa-solid fa-paper-plane text-xs" />
                    </button>
                </div>
            </div>
        </div>
    )
}