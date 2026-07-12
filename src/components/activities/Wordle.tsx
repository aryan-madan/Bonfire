import { useEffect, useRef, useState } from 'react'

export type LetterState = 'empty' | 'correct' | 'present' | 'absent'
export type PlayerStatus = 'guessing' | 'won' | 'lost'

export interface WordleGuessRow {
    id: string
    word: string
    feedback: LetterState[] | null
}

export interface WordleFeedbackMsg {
    id: string
    feedback: LetterState[]
    status: PlayerStatus
    revealWord?: string
}

const MAX_GUESSES = 6
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
const RANK: Record<LetterState, number> = { empty: 0, absent: 1, present: 2, correct: 3 }
const FLIP_STEP = 180
const FLIP_DURATION = 380
const REVEAL_KICKOFF = 60
const REVEAL_TOTAL = 4 * FLIP_STEP + FLIP_DURATION + REVEAL_KICKOFF
const START_DELAY = 900

const evaluateGuess = (guess: string, answer: string): LetterState[] => {
    const result: LetterState[] = new Array(5).fill('absent')
    const used = new Array(5).fill(false)
    for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) {
            result[i] = 'correct'
            used[i] = true
        }
    }
    for (let i = 0; i < 5; i++) {
        if (result[i] === 'correct') continue
        const idx = answer.split('').findIndex((ch, j) => ch === guess[i] && !used[j])
        if (idx !== -1) {
            result[i] = 'present'
            used[idx] = true
        }
    }
    return result
}

const keyStatuses = (guesses: WordleGuessRow[]): Record<string, LetterState> => {
    const map: Record<string, LetterState> = {}
    for (const row of guesses) {
        if (!row.feedback) continue
        row.word.split('').forEach((ch, i) => {
            const s = row.feedback![i]
            if (!map[ch] || RANK[s] > RANK[map[ch]]) map[ch] = s
        })
    }
    return map
}

const tileClass = (s: LetterState) => {
    if (s === 'correct') return 'bg-mint-300 text-cocoa-900 border-mint-300'
    if (s === 'present') return 'bg-ember-400 text-white border-ember-400'
    if (s === 'absent') return 'bg-cocoa-700 text-ember-100/40 border-cocoa-700'
    return 'bg-transparent text-ember-50 border-ember-100/15'
}

const fmtTime = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(s / 60)
    const r = (s % 60).toString().padStart(2, '0')
    return `${m}:${r}`
}

const Tile = ({ ch, target, revealAt, awaitingFeedback }: {
    ch: string
    target: LetterState
    revealAt?: number
    awaitingFeedback?: boolean
}) => {
    const [shown, setShown] = useState<LetterState>(revealAt === undefined ? target : 'empty')
    const [flipping, setFlipping] = useState(false)

    useEffect(() => {
        if (revealAt === undefined) return
        const t1 = window.setTimeout(() => setFlipping(true), revealAt)
        const t2 = window.setTimeout(() => setShown(target), revealAt + FLIP_DURATION / 2)
        const t3 = window.setTimeout(() => setFlipping(false), revealAt + FLIP_DURATION)
        return () => {
            window.clearTimeout(t1)
            window.clearTimeout(t2)
            window.clearTimeout(t3)
        }
    }, [revealAt, target])

    return (
        <div
            className={`grid h-11 w-11 sm:h-12 sm:w-12 place-items-center rounded-lg border-2 text-lg sm:text-xl font-bold uppercase transition-colors ${tileClass(shown)} ${awaitingFeedback ? 'animate-pulse' : ''}`}
            style={flipping ? { animation: `tileFlip ${FLIP_DURATION}ms ease-in-out` } : undefined}
        >
            {ch}
        </div>
    )
}

const GuessRow = ({ word, feedback, awaitingFeedback, shake }: {
    word: string
    feedback: LetterState[] | null
    isActive?: boolean
    awaitingFeedback?: boolean
    shake?: boolean
}) => {
    const [revealed, setRevealed] = useState(false)
    const startedRef = useRef(false)

    useEffect(() => {
        if (feedback && !startedRef.current) {
            startedRef.current = true
            const t = window.setTimeout(() => setRevealed(true), REVEAL_KICKOFF)
            return () => window.clearTimeout(t)
        }
    }, [feedback])

    return (
        <div className="flex gap-1.5" style={shake ? { animation: 'rowShake 380ms ease-in-out' } : undefined}>
            {word.split('').map((ch, j) => (
                <Tile
                    key={j}
                    ch={ch.trim()}
                    target={feedback ? feedback[j] : 'empty'}
                    revealAt={revealed ? j * FLIP_STEP : undefined}
                    awaitingFeedback={awaitingFeedback && ch.trim() !== ''}
                />
            ))}
        </div>
    )
}

interface Props {
    myName: string
    otherName: string
    onLeave: () => void
    onSendReady: () => void
    onSendGuess: (id: string, word: string) => void
    onSendFeedback: (id: string, feedback: LetterState[], status: PlayerStatus, revealWord?: string) => void
    onSendReset: () => void
    remoteReadyTick: number
    remoteGuess: { id: string; word: string } | null
    remoteFeedback: WordleFeedbackMsg | null
    remoteResetTick: number
    hovered: boolean
}

interface MyBoard {
    guesses: WordleGuessRow[]
    currentGuess: string
    status: PlayerStatus
}

interface TheirBoard {
    guesses: { id: string; word: string; feedback: LetterState[] }[]
    status: PlayerStatus
}

const emptyMyBoard: MyBoard = { guesses: [], currentGuess: '', status: 'guessing' }
const emptyTheirBoard: TheirBoard = { guesses: [], status: 'guessing' }

export const Wordle = ({
    otherName, onLeave,
    onSendReady, onSendGuess, onSendFeedback, onSendReset,
    remoteReadyTick, remoteGuess, remoteFeedback, remoteResetTick,
    hovered,
}: Props) => {
    const secretWord = useRef('')
    const lastReadyTick = useRef(0)
    const lastResetTick = useRef(0)
    const processedGuessIds = useRef<Set<string>>(new Set())
    const processedFeedbackIds = useRef<Set<string>>(new Set())
    const revealTimer = useRef<number | null>(null)
    const gameStartAt = useRef<number | null>(null)

    const [myReady, setMyReady] = useState(false)
    const [theirReady, setTheirReady] = useState(false)
    const [gameStarted, setGameStarted] = useState(false)
    const [myBoard, setMyBoard] = useState<MyBoard>(emptyMyBoard)
    const [theirBoard, setTheirBoard] = useState<TheirBoard>(emptyTheirBoard)
    const [myRevealedStatus, setMyRevealedStatus] = useState<PlayerStatus>('guessing')
    const [myRevealedWord, setMyRevealedWord] = useState<string | null>(null)
    const [draftWord, setDraftWord] = useState('')
    const [wordError, setWordError] = useState(false)
    const [shake, setShake] = useState(false)
    const [elapsedNow, setElapsedNow] = useState(0)
    const [myElapsedMs, setMyElapsedMs] = useState<number | null>(null)
    const [theirElapsedMs, setTheirElapsedMs] = useState<number | null>(null)

    const resetLocal = () => {
        secretWord.current = ''
        gameStartAt.current = null
        setMyReady(false)
        setTheirReady(false)
        setGameStarted(false)
        setMyBoard(emptyMyBoard)
        setTheirBoard(emptyTheirBoard)
        setMyRevealedStatus('guessing')
        setMyRevealedWord(null)
        setDraftWord('')
        setElapsedNow(0)
        setMyElapsedMs(null)
        setTheirElapsedMs(null)
        processedGuessIds.current = new Set()
        processedFeedbackIds.current = new Set()
        if (revealTimer.current) window.clearTimeout(revealTimer.current)
        revealTimer.current = null
    }

    useEffect(() => {
        if (remoteReadyTick > lastReadyTick.current) {
            lastReadyTick.current = remoteReadyTick
            setTheirReady(true)
        }
    }, [remoteReadyTick])

    useEffect(() => {
        if (remoteResetTick > lastResetTick.current) {
            lastResetTick.current = remoteResetTick
            resetLocal()
        }
    }, [remoteResetTick])

    useEffect(() => {
        if (!myReady || !theirReady || gameStarted) return
        const t = window.setTimeout(() => {
            gameStartAt.current = Date.now()
            setGameStarted(true)
        }, START_DELAY)
        return () => window.clearTimeout(t)
    }, [myReady, theirReady, gameStarted])

    useEffect(() => {
        if (!gameStarted) return
        if (myRevealedStatus !== 'guessing' && theirBoard.status !== 'guessing') return
        const id = window.setInterval(() => {
            if (gameStartAt.current) setElapsedNow(Date.now() - gameStartAt.current)
        }, 1000)
        return () => window.clearInterval(id)
    }, [gameStarted, myRevealedStatus, theirBoard.status])

    useEffect(() => {
        if (!remoteGuess) return
        if (processedGuessIds.current.has(remoteGuess.id)) return
        processedGuessIds.current.add(remoteGuess.id)
        const feedback = evaluateGuess(remoteGuess.word, secretWord.current)
        const won = feedback.every(f => f === 'correct')
        setTheirBoard(prev => {
            const guesses = [...prev.guesses, { id: remoteGuess.id, word: remoteGuess.word, feedback }]
            const lost = !won && guesses.length >= MAX_GUESSES
            const status: PlayerStatus = won ? 'won' : lost ? 'lost' : 'guessing'
            if (status !== 'guessing' && gameStartAt.current) {
                setTheirElapsedMs(Date.now() - gameStartAt.current)
            }
            onSendFeedback(remoteGuess.id, feedback, status, status !== 'guessing' ? secretWord.current : undefined)
            return { guesses, status }
        })
    }, [remoteGuess])

    useEffect(() => {
        if (!remoteFeedback) return
        if (processedFeedbackIds.current.has(remoteFeedback.id)) return
        processedFeedbackIds.current.add(remoteFeedback.id)
        setMyBoard(prev => {
            const idx = prev.guesses.findIndex(g => g.id === remoteFeedback.id)
            if (idx === -1) return prev
            const guesses = [...prev.guesses]
            guesses[idx] = { ...guesses[idx], feedback: remoteFeedback.feedback }
            return { ...prev, guesses, status: remoteFeedback.status }
        })
        if (remoteFeedback.revealWord) setMyRevealedWord(remoteFeedback.revealWord)
        if (remoteFeedback.status !== 'guessing') {
            if (gameStartAt.current) setMyElapsedMs(Date.now() - gameStartAt.current)
            if (revealTimer.current) window.clearTimeout(revealTimer.current)
            revealTimer.current = window.setTimeout(() => {
                setMyRevealedStatus(remoteFeedback.status)
            }, REVEAL_TOTAL)
        }
    }, [remoteFeedback])

    const confirmWord = () => {
        const w = draftWord.trim().toUpperCase()
        if (!/^[A-Z]{5}$/.test(w)) {
            setWordError(true)
            setTimeout(() => setWordError(false), 1500)
            return
        }
        secretWord.current = w
        setDraftWord('')
        setMyReady(true)
        onSendReady()
    }

    const canType = myReady && theirReady && gameStarted && myBoard.status === 'guessing'

    const appendLetter = (ch: string) => {
        if (!canType || myBoard.currentGuess.length >= 5) return
        setMyBoard(prev => ({ ...prev, currentGuess: prev.currentGuess + ch }))
    }

    const backspace = () => {
        if (!canType || !myBoard.currentGuess.length) return
        setMyBoard(prev => ({ ...prev, currentGuess: prev.currentGuess.slice(0, -1) }))
    }

    const submitGuess = () => {
        if (!canType) return
        if (myBoard.currentGuess.length !== 5) {
            setShake(true)
            window.setTimeout(() => setShake(false), 400)
            return
        }
        const id = crypto.randomUUID()
        const word = myBoard.currentGuess.toUpperCase()
        setMyBoard(prev => ({
            ...prev,
            currentGuess: '',
            guesses: [...prev.guesses, { id, word, feedback: null }],
        }))
        onSendGuess(id, word)
    }

    useEffect(() => {
        if (!canType) return
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
            if (typing || e.ctrlKey || e.metaKey || e.altKey) return
            if (e.key === 'Enter') { submitGuess(); return }
            if (e.key === 'Backspace') { backspace(); return }
            const k = e.key.toUpperCase()
            if (/^[A-Z]$/.test(k)) appendLetter(k)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [canType, myBoard.currentGuess])

    const playAgain = () => {
        resetLocal()
        onSendReset()
    }

    const statuses = keyStatuses(myBoard.guesses)
    const bothFinished = myRevealedStatus !== 'guessing' && theirBoard.status !== 'guessing'

    const iWon = myRevealedStatus === 'won'
    const theyWon = theirBoard.status === 'won'
    let firstSide: 'me' | 'them' | null = null
    if (bothFinished) {
        if (iWon && theyWon && myElapsedMs !== null && theirElapsedMs !== null) {
            firstSide = myElapsedMs <= theirElapsedMs ? 'me' : 'them'
        } else if (iWon) {
            firstSide = 'me'
        } else if (theyWon) {
            firstSide = 'them'
        }
    }

    return (
        <div className="relative h-full w-full bg-cocoa-800 overflow-hidden">
            <style>{`
                @keyframes tileFlip {
                    0% { transform: rotateX(0deg); }
                    50% { transform: rotateX(90deg); }
                    100% { transform: rotateX(0deg); }
                }
                @keyframes rowShake {
                    10%, 90% { transform: translateX(-2px); }
                    20%, 80% { transform: translateX(3px); }
                    30%, 50%, 70% { transform: translateX(-6px); }
                    40%, 60% { transform: translateX(6px); }
                }
                @keyframes resultsBackdropIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes resultsCardIn {
                    from { opacity: 0; transform: scale(0.92) translateY(16px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes statIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes trophyPop {
                    0% { opacity: 0; transform: scale(0.3) rotate(-20deg); }
                    65% { opacity: 1; transform: scale(1.2) rotate(6deg); }
                    100% { opacity: 1; transform: scale(1) rotate(0deg); }
                }
            `}</style>

            <div className={`absolute top-3 left-3 z-30 transition-opacity duration-300 ${hovered || !secretWord.current ? 'opacity-100' : 'opacity-0'}`}>
                <button
                    onClick={onLeave}
                    title="back to activities"
                    className="flex items-center justify-center h-9 w-9 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 hover:bg-black/60 transition-colors"
                >
                    <i className="fa-solid fa-arrow-left text-xs" />
                </button>
            </div>

            {bothFinished && (
                <div
                    className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-t from-cocoa-900 via-cocoa-900/95 to-cocoa-900/30 backdrop-blur-[2px] px-6"
                    style={{ animation: 'resultsBackdropIn 320ms ease-out both' }}
                >
                    <div
                        className="flex flex-col items-center gap-3 rounded-[1.5rem] bg-plum-900 px-6 py-5 shadow-2xl"
                        style={{ animation: 'resultsCardIn 380ms cubic-bezier(0.34,1.56,0.64,1) 80ms both' }}
                    >
                        <div className="grid grid-cols-2 gap-6 text-center">
                            <div style={{ animation: 'statIn 320ms ease-out 200ms both' }}>
                                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ember-100/40">their word</p>
                                <p className="text-xl font-bold uppercase text-ember-50">{myRevealedWord ?? '?????'}</p>
                                <p className="mt-1 text-xs font-semibold text-ember-100/50">
                                    {iWon ? `you: ${myBoard.guesses.length} guesses` : 'you: didn\'t get it'}
                                </p>
                                {myElapsedMs !== null && (
                                    <p className="mt-0.5 flex items-center justify-center gap-1 text-[0.65rem] font-bold text-ember-100/35">
                                        {fmtTime(myElapsedMs)}
                                        {firstSide === 'me' && (
                                            <i className="fa-solid fa-trophy text-mint-300/80" style={{ display: 'inline-block', animation: 'trophyPop 420ms cubic-bezier(0.34,1.56,0.64,1) 480ms both' }} />
                                        )}
                                    </p>
                                )}
                            </div>
                            <div style={{ animation: 'statIn 320ms ease-out 280ms both' }}>
                                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-ember-100/40">your word</p>
                                <p className="text-xl font-bold uppercase text-ember-50">{secretWord.current}</p>
                                <p className="mt-1 text-xs font-semibold text-ember-100/50">
                                    {theyWon ? `${otherName}: ${theirBoard.guesses.length} guesses` : `${otherName}: didn't get it`}
                                </p>
                                {theirElapsedMs !== null && (
                                    <p className="mt-0.5 flex items-center justify-center gap-1 text-[0.65rem] font-bold text-ember-100/35">
                                        {fmtTime(theirElapsedMs)}
                                        {firstSide === 'them' && (
                                            <i className="fa-solid fa-trophy text-mint-300/80" style={{ display: 'inline-block', animation: 'trophyPop 420ms cubic-bezier(0.34,1.56,0.64,1) 480ms both' }} />
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={playAgain}
                            className="rounded-full bg-ember-400 px-6 py-2.5 text-xs font-bold text-white hover:bg-ember-500 transition-colors"
                            style={{ animation: 'statIn 320ms ease-out 360ms both' }}
                        >
                            <i className="fa-solid fa-rotate-right mr-2" />
                            play again
                        </button>
                    </div>
                </div>
            )}

            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-10">
                {!secretWord.current && (
                    <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-[1.5rem] bg-plum-900 px-6 py-6">
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-ember-400/15 text-ember-400 text-lg">
                            <i className="fa-solid fa-globe" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-bold text-ember-50">set a secret word</p>
                            <p className="mt-1 text-xs font-semibold text-ember-100/45">for {otherName || 'them'} to guess. only you can see what you type here.</p>
                        </div>
                        <div className="relative" style={wordError ? { animation: 'rowShake 380ms ease-in-out' } : undefined}>
                            <input
                                autoFocus
                                value={draftWord}
                                onChange={e => setDraftWord(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 5))}
                                onKeyDown={e => { if (e.key === 'Enter') confirmWord() }}
                                className="absolute inset-0 h-full w-full cursor-text border-0 bg-transparent opacity-0 outline-none"
                            />
                            <div className="pointer-events-none flex items-center justify-center gap-2">
                                {Array.from({ length: 5 }, (_, i) => {
                                    const ch = draftWord[i]
                                    const active = i === draftWord.length
                                    return (
                                        <div
                                            key={i}
                                            className={`grid h-11 w-11 place-items-center rounded-lg border-2 text-lg font-bold uppercase transition-colors ${wordError ? 'border-berry-300' : ch ? 'border-ember-400 text-ember-50' : active ? 'border-ember-100/30' : 'border-ember-100/15'} ${ch ? 'text-ember-50' : 'text-ember-100/20'}`}
                                        >
                                            {ch ?? ''}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <button
                            onClick={confirmWord}
                            className="w-full rounded-full bg-ember-400 py-2.5 text-xs font-bold text-white hover:bg-ember-500 transition-colors"
                        >
                            lock it in
                        </button>
                    </div>
                )}

                {secretWord.current && !theirReady && (
                    <div className="flex flex-col items-center gap-3">
                        <i className="fa-solid fa-circle-notch animate-spin text-2xl text-ember-100/30" />
                        <p className="text-sm font-semibold text-ember-100/60">waiting for {otherName || 'them'} to set their word...</p>
                    </div>
                )}

                {secretWord.current && theirReady && !gameStarted && (
                    <div className="flex flex-col items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-ember-400/15 text-ember-400 text-lg">
                            <i className="fa-solid fa-flag-checkered" />
                        </div>
                        <p className="text-sm font-semibold text-ember-100/60">both words locked in — starting...</p>
                    </div>
                )}

                {secretWord.current && theirReady && gameStarted && (
                    <>
                        {!bothFinished && (
                            <p className="flex items-center gap-2 text-sm font-semibold text-ember-100/50">
                                {myRevealedStatus === 'guessing' ? 'guess their word' : `waiting for ${otherName || 'them'} to finish...`}
                                <span className="text-xs font-bold tabular-nums text-ember-100/30">· {fmtTime(elapsedNow)}</span>
                            </p>
                        )}

                        <div className="flex flex-col gap-1.5">
                            {Array.from({ length: MAX_GUESSES }, (_, i) => {
                                if (i < myBoard.guesses.length) {
                                    const g = myBoard.guesses[i]
                                    return (
                                        <GuessRow
                                            key={g.id}
                                            word={g.word}
                                            feedback={g.feedback}
                                            awaitingFeedback={!g.feedback}
                                        />
                                    )
                                }
                                if (i === myBoard.guesses.length && canType) {
                                    return (
                                        <GuessRow
                                            key="active"
                                            word={myBoard.currentGuess.padEnd(5, ' ')}
                                            feedback={null}
                                            isActive
                                            shake={shake}
                                        />
                                    )
                                }
                                return (
                                    <div key={`blank-${i}`} className="flex gap-1.5">
                                        {Array.from({ length: 5 }, (_, j) => (
                                            <Tile key={j} ch="" target="empty" />
                                        ))}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center gap-2 rounded-full bg-cocoa-900/70 px-4 py-1.5 text-xs font-bold text-ember-100/50">
                            <i className="fa-solid fa-user-secret" />
                            {otherName || 'they'}: {theirBoard.guesses.length}/{MAX_GUESSES} guesses
                            {theirBoard.status !== 'guessing' && <span className="text-mint-300/80">· done</span>}
                        </div>

                        {canType && (
                            <div className="flex flex-col items-center gap-1.5">
                                {KEY_ROWS.map((row, i) => (
                                    <div key={i} className="flex gap-1">
                                        {i === 2 && (
                                            <button
                                                onClick={backspace}
                                                className="flex items-center justify-center rounded-md bg-cocoa-700 px-3 h-10 text-xs font-bold text-ember-100/70 hover:bg-cocoa-600 transition-colors"
                                            >
                                                <i className="fa-solid fa-delete-left" />
                                            </button>
                                        )}
                                        {row.split('').map(ch => (
                                            <button
                                                key={ch}
                                                onClick={() => appendLetter(ch)}
                                                className={`flex items-center justify-center rounded-md h-10 w-7 sm:w-8 text-xs font-bold uppercase transition-colors border ${statuses[ch] ? tileClass(statuses[ch]) : 'bg-cocoa-700 border-transparent text-ember-100/80 hover:bg-cocoa-600'}`}
                                            >
                                                {ch}
                                            </button>
                                        ))}
                                        {i === 2 && (
                                            <button
                                                onClick={submitGuess}
                                                disabled={myBoard.currentGuess.length !== 5}
                                                className="flex items-center justify-center rounded-md bg-ember-400 px-3 h-10 text-xs font-bold text-white hover:bg-ember-500 disabled:opacity-30 transition-colors"
                                            >
                                                enter
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {myRevealedStatus !== 'guessing' && !bothFinished && (
                            <p className="text-xs font-semibold text-ember-100/40">
                                {myRevealedStatus === 'won' ? `you got it in ${myBoard.guesses.length}!` : `out of guesses.`} waiting on {otherName || 'them'}...
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}