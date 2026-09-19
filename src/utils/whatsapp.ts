export function normalizeWhatsappNumber(telefono?: string | null): string {
    const raw = telefono?.replace(/[\s\-()+]/g, '') ?? '';
    if (/^9\d{8}$/.test(raw)) return `56${raw}`;
    return /^56\d{9}$/.test(raw) ? raw : '';
}

export function whatsappUrl(telefono?: string | null, mensaje?: string): string {
    const numero = normalizeWhatsappNumber(telefono);
    return numero ? `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}` : '';
}
