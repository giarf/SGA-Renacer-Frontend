export const sanitizeIntegerInput = (event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return '';

    const sanitized = input.value.replace(/\D/g, '');
    if (input.value !== sanitized) {
        input.value = sanitized;
    }

    return sanitized;
};

export const integerFromInput = (event: Event) => Number(sanitizeIntegerInput(event) || 0);
