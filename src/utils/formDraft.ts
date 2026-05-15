export const loadFormDraft = <T>(key: string): T | null => {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

export const saveFormDraft = (key: string, value: unknown) => {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can fail in private mode or when quota is full; the form must keep working.
    }
};

export const clearFormDraft = (key: string) => {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
};
