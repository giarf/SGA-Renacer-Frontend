// Reglas de cantidad compartidas por las tablas de ítems (agregar y editar en línea).

// Unidades que se fraccionan (peso, volumen, largo); el resto (unidad, caja, paquete...) va en enteros.
const FRACCIONABLES = new Set([
    'kg', 'kilo', 'kilogramo', 'g', 'gr', 'grm', 'gramo',
    'l', 'lt', 'lts', 'litro', 'ml', 'mililitro', 'cc',
    'm', 'mt', 'mts', 'metro', 'cm', 'centimetro'
]);

const normalizar = (unidad?: string | null) =>
    (unidad ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\.$/, '');

export const permiteDecimales = (unidad?: string | null): boolean => {
    const u = normalizar(unidad);
    return FRACCIONABLES.has(u) || (u.endsWith('s') && FRACCIONABLES.has(u.slice(0, -1)));
};

export const redondearCantidad = (valor: number) => Math.round(valor * 1000) / 1000;

/** Mensaje de error si la cantidad no es válida para la unidad; null si está bien. */
export const errorCantidad = (cantidad: number, unidad?: string | null): string | null => {
    const valor = Number(cantidad);
    if (!Number.isFinite(valor) || valor <= 0) return 'La cantidad debe ser mayor a cero.';
    if (!permiteDecimales(unidad) && !Number.isInteger(valor)) return `En ${unidad || 'unidad'} la cantidad debe ser entera.`;
    return null;
};
