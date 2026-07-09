export interface ThemeDef {
    key: string
    label: string
    swatch: [string, string, string]
}
export const THEMES: ThemeDef[] = [
    { key: 'ember', label: 'Ember', swatch: ['#fb923c', '#1c1917', '#211f1d'] },
    { key: 'night', label: 'Night', swatch: ['#e87d29', '#0d0e13', '#14161d'] },
]
const STORAGE_KEY = 'bf-theme'
const DEFAULT_THEME = 'ember'
export const getStoredTheme = (): string => {
try {
return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME
    } catch {
return DEFAULT_THEME
    }
}
export const applyTheme = (key: string) => {
document.documentElement.dataset.theme = key
try {
localStorage.setItem(STORAGE_KEY, key)
    } catch { }
}
applyTheme(getStoredTheme())