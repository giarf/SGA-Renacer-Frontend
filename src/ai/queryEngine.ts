// Motor de consultas en memoria: la IA describe la consulta y el navegador la ejecuta
// sobre los datos ya cargados, así las cifras nunca las inventa el modelo.

export type Valor = string | number | boolean | null | undefined | string[];
export type Fila = Record<string, Valor>;

export type OperadorFiltro = 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'is_null' | 'not_null';
export type Periodo = 'dia' | 'semana' | 'mes' | 'anio';
export type OperacionMetrica = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';

export interface Filtro { campo: string; op: OperadorFiltro; valor?: unknown }
export interface Agrupacion { campo: string; periodo?: Periodo; alias?: string }
export interface Metrica { op: OperacionMetrica; campo?: string; alias?: string }

export interface Consulta {
    dataset: string;
    filtros?: Filtro[];
    agrupar?: Agrupacion[];
    metricas?: Metrica[];
    columnas?: string[];
    orden?: { campo: string; dir?: 'asc' | 'desc' }[];
    limite?: number;
}

export interface ResultadoConsulta { columnas: string[]; filas: Fila[]; total: number }

export const normalizarTexto = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

const esFecha = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value);

const comparable = (value: unknown): number | string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const text = String(value);
    if (esFecha(text)) return text.slice(0, 10);
    const numeric = Number(text);
    if (text.trim() !== '' && Number.isFinite(numeric)) return numeric;
    return normalizarTexto(text);
};

const comparar = (a: unknown, b: unknown) => {
    const ca = comparable(a);
    const cb = comparable(b);
    if (ca === null && cb === null) return 0;
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (typeof ca === 'number' && typeof cb === 'number') return ca - cb;
    return String(ca).localeCompare(String(cb), 'es');
};

const igual = (a: unknown, b: unknown) => {
    if (typeof b === 'boolean' || typeof a === 'boolean') return Boolean(a) === (b === true || b === 'true' || b === 1);
    return comparar(a, b) === 0;
};

const vacio = (value: Valor) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const cumpleFiltro = (fila: Fila, filtro: Filtro): boolean => {
    const actual = fila[filtro.campo];
    const { op, valor } = filtro;

    if (op === 'is_null') return vacio(actual);
    if (op === 'not_null') return !vacio(actual);

    // Los campos lista (etiquetas) cumplen si alguno de sus elementos cumple.
    if (Array.isArray(actual)) {
        if (op === 'neq' || op === 'not_contains') {
            return !cumpleFiltro(fila, { ...filtro, op: op === 'neq' ? 'eq' : 'contains' });
        }
        return actual.some(item => cumpleFiltro({ [filtro.campo]: item }, filtro));
    }

    switch (op) {
        case 'eq': return igual(actual, valor);
        case 'neq': return !igual(actual, valor);
        case 'contains': return normalizarTexto(actual).includes(normalizarTexto(valor));
        case 'not_contains': return !normalizarTexto(actual).includes(normalizarTexto(valor));
        case 'gt': return !vacio(actual) && comparar(actual, valor) > 0;
        case 'gte': return !vacio(actual) && comparar(actual, valor) >= 0;
        case 'lt': return !vacio(actual) && comparar(actual, valor) < 0;
        case 'lte': return !vacio(actual) && comparar(actual, valor) <= 0;
        case 'in': return Array.isArray(valor) && valor.some(v => igual(actual, v));
        case 'between': {
            if (!Array.isArray(valor) || valor.length !== 2 || vacio(actual)) return false;
            return comparar(actual, valor[0]) >= 0 && comparar(actual, valor[1]) <= 0;
        }
        default: return true;
    }
};

const truncarPeriodo = (value: Valor, periodo?: Periodo): Valor => {
    if (!periodo || typeof value !== 'string' || !esFecha(value)) return value;
    const fecha = value.slice(0, 10);
    if (periodo === 'dia') return fecha;
    if (periodo === 'mes') return fecha.slice(0, 7);
    if (periodo === 'anio') return fecha.slice(0, 4);
    const d = new Date(`${fecha}T00:00:00`);
    const dia = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dia);
    return d.toISOString().slice(0, 10);
};

const nombreMetrica = (m: Metrica) => m.alias || (m.op === 'count' ? 'cantidad' : `${m.op}_${m.campo ?? ''}`);
const nombreAgrupacion = (a: Agrupacion) => a.alias || a.campo;

const calcularMetrica = (filas: Fila[], metrica: Metrica): number | null => {
    if (metrica.op === 'count') {
        return metrica.campo ? filas.filter(f => !vacio(f[metrica.campo!])).length : filas.length;
    }
    const campo = metrica.campo;
    if (!campo) return null;
    if (metrica.op === 'count_distinct') {
        return new Set(filas.map(f => f[campo]).filter(v => !vacio(v)).map(v => String(v))).size;
    }
    const numeros = filas.map(f => Number(f[campo])).filter(n => Number.isFinite(n) && !Number.isNaN(n));
    if (!numeros.length) return null;
    if (metrica.op === 'sum') return numeros.reduce((acc, n) => acc + n, 0);
    if (metrica.op === 'avg') return Math.round((numeros.reduce((acc, n) => acc + n, 0) / numeros.length) * 100) / 100;
    if (metrica.op === 'min') return Math.min(...numeros);
    if (metrica.op === 'max') return Math.max(...numeros);
    return null;
};

// Duplica filas por cada elemento de los campos lista usados para agrupar.
const expandirListas = (filas: Fila[], campos: string[]) => {
    let resultado = filas;
    campos.forEach(campo => {
        resultado = resultado.flatMap(fila => {
            const valor = fila[campo];
            if (!Array.isArray(valor)) return [fila];
            if (!valor.length) return [{ ...fila, [campo]: null }];
            return valor.map(item => ({ ...fila, [campo]: item }));
        });
    });
    return resultado;
};

export const ejecutarConsulta = (filasOrigen: Fila[], consulta: Consulta): ResultadoConsulta => {
    const filtradas = filasOrigen.filter(fila => (consulta.filtros ?? []).every(f => cumpleFiltro(fila, f)));
    const agrupar = consulta.agrupar ?? [];
    const metricas = consulta.metricas ?? [];

    let columnas: string[];
    let filas: Fila[];

    if (agrupar.length || metricas.length) {
        const metricasEfectivas = metricas.length ? metricas : [{ op: 'count' as const }];
        const expandidas = expandirListas(filtradas, agrupar.map(a => a.campo));
        const grupos = new Map<string, { clave: Fila; filas: Fila[] }>();

        expandidas.forEach(fila => {
            const clave: Fila = {};
            agrupar.forEach(a => {
                const valor = truncarPeriodo(fila[a.campo], a.periodo);
                clave[nombreAgrupacion(a)] = vacio(valor) ? 'Sin dato' : valor;
            });
            const llave = JSON.stringify(clave);
            const grupo = grupos.get(llave) ?? { clave, filas: [] };
            grupo.filas.push(fila);
            grupos.set(llave, grupo);
        });

        // count_distinct sin agrupar debe contar sobre las filas sin expandir.
        if (!agrupar.length && !grupos.size) grupos.set('{}', { clave: {}, filas: [] });

        columnas = [...agrupar.map(nombreAgrupacion), ...metricasEfectivas.map(nombreMetrica)];
        filas = [...grupos.values()].map(({ clave, filas: grupoFilas }) => {
            const fila: Fila = { ...clave };
            metricasEfectivas.forEach(m => { fila[nombreMetrica(m)] = calcularMetrica(grupoFilas, m); });
            return fila;
        });

        if (!consulta.orden?.length) {
            const primeraAgrupacion = agrupar[0];
            if (primeraAgrupacion?.periodo) {
                filas.sort((a, b) => comparar(a[nombreAgrupacion(primeraAgrupacion)], b[nombreAgrupacion(primeraAgrupacion)]));
            } else if (agrupar.length) {
                const metrica = nombreMetrica(metricasEfectivas[0]!);
                filas.sort((a, b) => comparar(b[metrica], a[metrica]));
            }
        }
    } else {
        columnas = consulta.columnas?.length
            ? consulta.columnas
            : Object.keys(filtradas[0] ?? filasOrigen[0] ?? {});
        filas = filtradas.map(fila => Object.fromEntries(columnas.map(c => [c, fila[c]])));
    }

    (consulta.orden ?? []).slice().reverse().forEach(orden => {
        filas.sort((a, b) => (orden.dir === 'desc' ? -1 : 1) * comparar(a[orden.campo], b[orden.campo]));
    });

    const total = filas.length;
    const limite = consulta.limite && consulta.limite > 0 ? Math.min(consulta.limite, 1000) : 1000;
    return { columnas, filas: filas.slice(0, limite), total };
};
