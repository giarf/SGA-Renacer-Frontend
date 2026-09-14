/** Shared manual search; never use this to automatically assign an identity. */
export const normalizeSearch = (value: string): string => value
    .normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
    if (!query.trim()) return true;
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const text = normalizeSearch(fields.filter(Boolean).join(' '));
    if (words.every(word => text.includes(word))) return true;
    // Accept formatted, unformatted and partial RUTs, including verifier K.
    if (/^[0-9kK.\s-]+$/.test(query) && /[0-9]/.test(query)) {
        const compact = (value: string) => value.toLowerCase().replace(/[.\s-]/g, '');
        return fields.some(field => field != null && compact(field).includes(compact(query)));
    }
    return false;
}
