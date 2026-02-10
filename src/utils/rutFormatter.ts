/**
 * Format RUT from backend format (12345678-9) to display format (12.345.678-9)
 * @param rut - RUT in format without dots but with hyphen
 * @returns Formatted RUT with dots and hyphen
 */
export const formatRutForDisplay = (rut: string): string => {
    if (!rut) return '';

    // Remove any existing dots and spaces
    const clean = rut.replace(/\./g, '').replace(/\s/g, '').trim();

    // Split by hyphen
    const parts = clean.split('-');
    if (parts.length !== 2) return rut; // Return original if format is unexpected

    const number = parts[0];
    const verifier = parts[1];

    if (!number || !verifier) return rut; // Safety check

    // Add dots to the number part (from right to left, every 3 digits)
    const formatted = number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${formatted}-${verifier}`;
};

/**
 * Remove formatting from RUT (12.345.678-9 -> 12345678-9)
 * @param rut - Formatted RUT with dots
 * @returns RUT without dots, only hyphen
 */
export const formatRutForBackend = (rut: string): string => {
    if (!rut) return '';
    // Remove all dots and spaces, keep only numbers, K/k and hyphen
    return rut.replace(/\./g, '').replace(/\s/g, '').trim();
};
