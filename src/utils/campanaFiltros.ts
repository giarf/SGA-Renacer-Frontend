import type { CampoFicha, ColumnaCampana, FichaCampana, ParticipanteCampana } from '../types';
import { normalizeSearch } from './search.ts';

export type PersonaFicha = 'beneficiario' | 'padrino';
/** Cómo se filtra cada dato: rango numérico, lista de valores existentes o texto que contiene. */
export type ModoFiltro = 'rango' | 'lista' | 'texto';

export const CAMPOS_FICHA: { campo: CampoFicha; etiqueta: string; modo: ModoFiltro }[] = [
    { campo: 'edad', etiqueta: 'Edad', modo: 'rango' },
    { campo: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', modo: 'texto' },
    { campo: 'genero', etiqueta: 'Género', modo: 'lista' },
    { campo: 'rut', etiqueta: 'RUT', modo: 'texto' },
    { campo: 'telefono', etiqueta: 'Teléfono', modo: 'texto' },
    { campo: 'correo', etiqueta: 'Correo', modo: 'texto' },
    { campo: 'apoderado', etiqueta: 'Apoderado', modo: 'texto' },
    { campo: 'sector', etiqueta: 'Sector', modo: 'lista' },
    { campo: 'direccion', etiqueta: 'Dirección', modo: 'texto' },
    { campo: 'comuna', etiqueta: 'Comuna', modo: 'lista' },
    { campo: 'region', etiqueta: 'Región', modo: 'lista' },
    { campo: 'ocupacion', etiqueta: 'Ocupación', modo: 'lista' },
    { campo: 'gestor', etiqueta: 'Gestor', modo: 'lista' },
    { campo: 'etiquetas', etiqueta: 'Etiquetas', modo: 'texto' },
    { campo: 'redSocial', etiqueta: 'Red social', modo: 'texto' },
    { campo: 'anotaciones', etiqueta: 'Anotaciones', modo: 'texto' },
];

export function campoDe(columna: ColumnaCampana): { persona: PersonaFicha; campo: CampoFicha } | null {
    if (columna.tipo !== 'ficha' || !columna.clave) return null;
    const [persona, campo] = columna.clave.split('.');
    return (persona === 'beneficiario' || persona === 'padrino') && CAMPOS_FICHA.some(c => c.campo === campo)
        ? { persona, campo: campo as CampoFicha } : null;
}
export const modoDe = (campo: CampoFicha): ModoFiltro => CAMPOS_FICHA.find(c => c.campo === campo)?.modo ?? 'texto';

function fichaDe(p: ParticipanteCampana, persona: PersonaFicha): FichaCampana | null | undefined {
    return persona === 'beneficiario' ? p.beneficiario.ficha : p.padrino?.ficha;
}
/** Valor crudo del dato de ficha (el apoderado es un objeto con nombre y teléfono). */
export function datoFicha(p: ParticipanteCampana, columna: ColumnaCampana) {
    const ref = campoDe(columna);
    return ref ? fichaDe(p, ref.persona)?.[ref.campo] : undefined;
}
/** Texto plano del dato, usado para mostrar, buscar y armar listas de opciones. */
export function textoFicha(p: ParticipanteCampana, columna: ColumnaCampana): string {
    const v = datoFicha(p, columna);
    if (v == null) return '';
    if (typeof v === 'object') return [v.nombre, v.parentesco && `(${v.parentesco})`, v.telefono].filter(Boolean).join(' ');
    if (campoDe(columna)?.campo === 'fechaNacimiento') return new Date(`${v}T12:00:00`).toLocaleDateString('es-CL');
    return String(v);
}

export type FiltroCampana =
    | { id: string; tipo: 'padrino'; con: boolean }
    | { id: string; tipo: 'casilla'; columnaId: number; marcada: boolean }
    | { id: string; tipo: 'rango'; columnaId: number; desde: number | null; hasta: number | null }
    | { id: string; tipo: 'lista'; columnaId: number; valor: string }
    | { id: string; tipo: 'texto'; columnaId: number; texto: string };

const SIN_DATO = '';
/** Opciones de un filtro de lista: los valores que de verdad aparecen en la campaña, más "sin dato" si falta en alguno. */
export function opcionesLista(participantes: ParticipanteCampana[], columna: ColumnaCampana): string[] {
    const valores = new Set(participantes.map(p => textoFicha(p, columna).trim()));
    return [...valores].sort((a, b) => a === SIN_DATO ? 1 : b === SIN_DATO ? -1 : a.localeCompare(b, 'es'));
}

export function cumpleFiltro(p: ParticipanteCampana, f: FiltroCampana, columnas: ColumnaCampana[]): boolean {
    if (f.tipo === 'padrino') return f.con === !!p.padrino;
    const columna = columnas.find(c => c.id === f.columnaId);
    // Si la columna se eliminó, su filtro ya no restringe nada.
    if (!columna) return true;
    if (f.tipo === 'casilla') return (p.valores[String(columna.id)]?.valor === true) === f.marcada;
    if (f.tipo === 'lista') return textoFicha(p, columna).trim() === f.valor;
    if (f.tipo === 'texto') return !f.texto.trim() || normalizeSearch(textoFicha(p, columna)).includes(normalizeSearch(f.texto));
    const n = Number(datoFicha(p, columna));
    if (datoFicha(p, columna) == null || Number.isNaN(n)) return f.desde == null && f.hasta == null;
    return (f.desde == null || n >= f.desde) && (f.hasta == null || n <= f.hasta);
}
export const cumpleFiltros = (p: ParticipanteCampana, filtros: FiltroCampana[], columnas: ColumnaCampana[]) =>
    filtros.every(f => cumpleFiltro(p, f, columnas));

export function describirFiltro(f: FiltroCampana, columnas: ColumnaCampana[]): string {
    if (f.tipo === 'padrino') return f.con ? 'Con padrino' : 'Sin padrino';
    const nombre = columnas.find(c => c.id === f.columnaId)?.nombre ?? 'Columna eliminada';
    if (f.tipo === 'casilla') return `${nombre}: ${f.marcada ? 'marcado' : 'no marcado'}`;
    if (f.tipo === 'lista') return `${nombre}: ${f.valor || 'sin dato'}`;
    if (f.tipo === 'texto') return `${nombre} contiene "${f.texto}"`;
    if (f.desde != null && f.hasta != null) return `${nombre}: ${f.desde} a ${f.hasta}`;
    return f.desde != null ? `${nombre}: desde ${f.desde}` : `${nombre}: hasta ${f.hasta}`;
}
