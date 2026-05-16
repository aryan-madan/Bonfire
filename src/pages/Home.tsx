import { useState } from 'react'

type Mode = 'idle' | 'create' | 'join'

export function Home() {
    const [mode, setMode] = useState<Mode>('idle')
    const [name, setName] = useState(() => localStorage.getItem('name') ?? '')

    function save(value: string) {
        setName(value)
        localStorage.setItem('name', value)
    }

    const named = name.trim().length > 0

    return (
        <main className="home">
            <div className="content">
                <div className="logo pop pop-1">
                    bonfire
                </div>
                <h1 className="title pop pop-2">
                    watchy<br />watchy :3
                </h1>
                <div className="actions pop pop-4">
                    <div className="wrap">
                        <input
                            className="field"
                            value={name}
                            onChange={e => save(e.target.value)}
                            placeholder="your name"
                            maxLength={32}
                        />
                    </div>
                    <div className="inner">
                        {named && mode === 'idle' && (
                            <div className="row pop">
                                <button className="btn" onClick={() => setMode('create')}>
                                    start room
                                </button>
                                <span className="divider">/</span>
                                <button className="btn" onClick={() => setMode('join')}>
                                    join room
                                </button>
                            </div>
                        )}
                        {mode === 'create' && <Create back={() => setMode('idle')} />}
                        {mode === 'join' && <Join name={name} back={() => setMode('idle')} />}
                    </div>
                </div>
            </div>
        </main>
    )
}

function Create({ back }: { back: () => void }) {
    return (
        <div className="mode pop">
            <div className="invite">
                bonfire.app/#offer=room
            </div>
            <button className="btn" onClick={back}>
                back
            </button>
        </div>
    )
}

function Join({ name, back }: { name: string; back: () => void }) {
    const [link, setLink] = useState('')

    return (
        <div className="mode pop">
            <div className="wrap slim">
                <input
                    className="field small"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="paste invite link"
                />
            </div>
            <div className="row">
                <button
                    className="btn"
                    disabled={!link.trim()}
                    onClick={() => console.log('join', link, name)}
                >
                    join
                </button>
                <span className="divider">/</span>
                <button className="btn" onClick={back}>
                    back
                </button>
            </div>
        </div>
    )
}