// Lógica pura de códigos de barras (sin Vue ni DOM) para poder probarla con node --test.

/** Deja solo dígitos. */
export const normalizarCodigo = (raw: string | null | undefined): string => (raw ?? '').replace(/\D/g, '');

/** EAN-8, UPC-A (12) o EAN-13 con dígito verificador GTIN correcto. */
export const esCodigoValido = (raw: string | null | undefined): boolean => {
    const codigo = normalizarCodigo(raw);
    if (codigo !== (raw ?? '').trim() || ![8, 12, 13].includes(codigo.length)) return false;
    const digitos = codigo.split('').map(Number);
    const verificador = digitos.pop()!;
    // Desde la derecha (sin el verificador), pesos 3,1,3,1...
    const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (suma % 10)) % 10 === verificador;
};

export interface LineaFusionable {
    cantidad: number;
    codigoBarras?: string | null;
    itemCatalogoId?: number | null;
}

const mismaLinea = (a: LineaFusionable, b: LineaFusionable) =>
    (!!a.codigoBarras && a.codigoBarras === b.codigoBarras) ||
    (a.itemCatalogoId != null && a.itemCatalogoId > 0 && a.itemCatalogoId === b.itemCatalogoId);

/**
 * Agrega `nueva` a la lista; si ya existe una línea con el mismo código o ítem del catálogo,
 * suma la cantidad (conservando el precio de la línea existente) en vez de duplicarla.
 * No muta la lista original.
 */
export const fusionarLinea = <T extends LineaFusionable>(lista: T[], nueva: T): { lista: T[]; fusionada: boolean } => {
    const index = lista.findIndex(linea => mismaLinea(linea, nueva));
    if (index === -1) return { lista: [...lista, nueva], fusionada: false };
    const existente = lista[index]!;
    const actualizada: T = {
        ...existente,
        cantidad: Math.round((existente.cantidad + nueva.cantidad) * 1000) / 1000,
        codigoBarras: existente.codigoBarras || nueva.codigoBarras,
        itemCatalogoId: existente.itemCatalogoId ?? nueva.itemCatalogoId
    };
    return { lista: lista.map((linea, i) => (i === index ? actualizada : linea)), fusionada: true };
};

/**
 * Filtro de lecturas repetidas: devuelve true si el código debe procesarse.
 * Cada avistamiento del mismo código renueva la ventana, así un producto que sigue
 * frente a la cámara no se vuelve a leer hasta que se retire por `ventanaMs`.
 */
export const crearFiltroRepetidos = (ventanaMs = 2000) => {
    let ultimo = '';
    let visto = -Infinity;
    return (codigo: string, ahora: number): boolean => {
        const repetido = codigo === ultimo && ahora - visto < ventanaMs;
        ultimo = codigo;
        visto = ahora;
        return !repetido;
    };
};

/** Cantidad escrita por el usuario ("1,5" o "2") a número; NaN si no es válida. */
export const parseCantidad = (raw: string | number): number => {
    if (typeof raw === 'number') return raw;
    const limpio = raw.trim().replace(',', '.');
    return limpio && /^\d*\.?\d*$/.test(limpio) ? Number(limpio) : NaN;
};
