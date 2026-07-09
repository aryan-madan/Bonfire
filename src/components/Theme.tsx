import { THEMES } from '../lib/theme'

export function ThemePicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
    return (
        <div className="flex items-center justify-center gap-2.5">
            {THEMES.map(t => (
                <button
                    key={t.key}
                    onClick={() => onChange(t.key)}
                    title={t.label}
                    className="h-8 w-8 shrink-0 rounded-full transition-transform hover:scale-110"
                    style={{
                        background: `conic-gradient(${t.swatch[0]} 0deg 120deg, ${t.swatch[1]} 120deg 240deg, ${t.swatch[2]} 240deg 360deg)`,
                        boxShadow: value === t.key ? `0 0 0 2px #12100f, 0 0 0 4px ${t.swatch[0]}` : 'none',
                        opacity: value === t.key ? 1 : 0.6,
                    }}
                />
            ))}
        </div>
    )
}