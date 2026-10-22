import type { AiSettings } from './aiSettings';
import { DATASETS, buscarDataset, cargarDataset } from './datasets';
import { ejecutarConsulta, normalizarTexto, type Consulta, type Fila, type ResultadoConsulta } from './queryEngine';

export type TipoVisualizacion = 'kpi' | 'barras' | 'barras_horizontales' | 'lineas' | 'torta' | 'tabla';
export type FormatoValor = 'numero' | 'moneda' | 'porcentaje';

export interface Visualizacion {
    id: string;
    tipo: TipoVisualizacion;
    titulo: string;
    subtitulo?: string;
    x?: string;
    y: string[];
    formato: FormatoValor;
    consulta: Consulta;
    resultado: ResultadoConsulta;
}

export interface MensajeChat {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
}

export interface CallbacksAgente {
    onPaso: (texto: string) => void;
    onVisualizacion: (visualizacion: Visualizacion) => void;
}

const MAX_ITERACIONES = 10;
const CAMPOS_SIN_EJEMPLOS = new Set(['nombre', 'beneficiario', 'padrino', 'destino', 'jefeHogar', 'descripcion', 'llegada', 'id', 'personaId', 'beneficiarioId']);

const esquemaConsulta = {
    type: 'object',
    properties: {
        dataset: { type: 'string', enum: DATASETS.map(d => d.nombre) },
        filtros: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    campo: { type: 'string' },
                    op: { type: 'string', enum: ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'is_null', 'not_null'] },
                    valor: { description: "Valor a comparar. Lista para 'in' y [desde, hasta] para 'between'. Fechas como 'YYYY-MM-DD'." }
                },
                required: ['campo', 'op']
            }
        },
        agrupar: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    campo: { type: 'string' },
                    periodo: { type: 'string', enum: ['dia', 'semana', 'mes', 'anio'], description: 'Sólo para campos fecha' },
                    alias: { type: 'string' }
                },
                required: ['campo']
            }
        },
        metricas: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    op: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] },
                    campo: { type: 'string' },
                    alias: { type: 'string', description: 'Nombre legible de la columna resultante, por ejemplo "Niños atendidos"' }
                },
                required: ['op']
            }
        },
        columnas: { type: 'array', items: { type: 'string' }, description: 'Sin agrupar ni métricas: columnas a listar' },
        orden: {
            type: 'array',
            items: { type: 'object', properties: { campo: { type: 'string' }, dir: { type: 'string', enum: ['asc', 'desc'] } }, required: ['campo'] }
        },
        limite: { type: 'number' }
    },
    required: ['dataset']
};

const HERRAMIENTAS = [
    {
        type: 'function',
        function: {
            name: 'describir_dataset',
            description: 'Devuelve los campos reales de un dataset, la cantidad de filas y los valores más frecuentes de cada campo. Úsala antes de filtrar por texto para conocer los nombres exactos (por ejemplo cómo se llama el evento de Fiestas Patrias).',
            parameters: { type: 'object', properties: { dataset: { type: 'string', enum: DATASETS.map(d => d.nombre) } }, required: ['dataset'] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar',
            description: 'Ejecuta una consulta (filtros, agrupaciones y métricas) y devuelve hasta 60 filas del resultado. Úsala para obtener las cifras antes de responder.',
            parameters: esquemaConsulta
        }
    },
    {
        type: 'function',
        function: {
            name: 'mostrar',
            description: 'Muestra una visualización en el panel del administrador. La consulta se ejecuta en el navegador con los datos reales. Usa kpi para una cifra única, barras para comparar categorías, barras_horizontales si hay más de 7 categorías o nombres largos, lineas para evolución en el tiempo, torta sólo para partes de un total con 6 o menos categorías, y tabla para listados.',
            parameters: {
                type: 'object',
                properties: {
                    tipo: { type: 'string', enum: ['kpi', 'barras', 'barras_horizontales', 'lineas', 'torta', 'tabla'] },
                    titulo: { type: 'string' },
                    subtitulo: { type: 'string' },
                    consulta: esquemaConsulta,
                    x: { type: 'string', description: 'Columna del resultado para el eje de categorías o tiempo' },
                    y: { type: 'array', items: { type: 'string' }, description: 'Columnas numéricas del resultado a graficar (máximo 3)' },
                    formato: { type: 'string', enum: ['numero', 'moneda', 'porcentaje'] }
                },
                required: ['tipo', 'titulo', 'consulta']
            }
        }
    }
];

const promptSistema = () => `Eres el analista de datos de la Fundación Familia Renacer dentro del sistema SGA. Respondes en español de Chile, claro y breve, a administradores que no son técnicos.
Hoy es ${new Date().toISOString().slice(0, 10)}.

Datasets disponibles:
${DATASETS.map(d => `- ${d.nombre}: ${d.descripcion}\n  Campos: ${d.campos.map(c => `${c.nombre} (${c.tipo})`).join(', ')}`).join('\n')}

Cómo trabajar:
1. Si la pregunta menciona un evento, campaña, etiqueta o categoría por nombre, primero usa describir_dataset para encontrar el valor exacto; luego filtra con 'contains' o 'in' usando esos valores. "Fiestas Patrias" puede llamarse "Fonda", "18 de septiembre", "Dieciocho", etc.
2. Calcula las cifras con consultar. Nunca inventes números: todo dato que menciones debe salir de una consulta.
3. Cuando la respuesta sea una cifra, un ranking, una comparación o una evolución, llama a mostrar (puedes llamarla varias veces para armar un pequeño tablero). Para personas únicas usa count_distinct sobre personaId o beneficiarioId. Pon alias legibles a las métricas.
4. "Niños" significa grupoEtario 'Niño/a (0-12)' salvo que el usuario indique otra edad; menciona cuántos registros no tienen fecha de nacimiento si eso afecta el resultado.
5. Excluye egresos o ingresos con estado anulado salvo que pidan lo contrario.
6. Termina con 1 a 4 frases que resuman el hallazgo. No repitas tablas completas en el texto ni menciones las herramientas.`;

const ejemplosCampo = (filas: Fila[], campo: string) => {
    const conteo = new Map<string, number>();
    const numeros: number[] = [];
    filas.forEach(fila => {
        const valor = fila[campo];
        const valores = Array.isArray(valor) ? valor : [valor];
        valores.forEach(v => {
            if (v === null || v === undefined || v === '') return;
            if (typeof v === 'number') numeros.push(v);
            conteo.set(String(v), (conteo.get(String(v)) ?? 0) + 1);
        });
    });
    if (numeros.length && numeros.length === [...conteo.values()].reduce((a, b) => a + b, 0)) {
        return { min: Math.min(...numeros), max: Math.max(...numeros), conDato: numeros.length };
    }
    const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
    if (ordenados.length && /^\d{4}-\d{2}-\d{2}/.test(ordenados[0]?.[0] ?? '')) {
        const fechas = ordenados.map(([v]) => v.slice(0, 10)).sort();
        return { desde: fechas[0], hasta: fechas[fechas.length - 1] };
    }
    return { distintos: ordenados.length, frecuentes: Object.fromEntries(ordenados.slice(0, 60)) };
};

const describirDataset = async (nombre: string) => {
    const definicion = buscarDataset(nombre);
    if (!definicion) throw new Error(`Dataset desconocido: ${nombre}`);
    const filas = await cargarDataset(nombre);
    const dinamicos = [...new Set(filas.flatMap(f => Object.keys(f)).filter(k => k.startsWith('col:')))];
    const campos = [
        ...definicion.campos.map(c => ({ ...c })),
        ...dinamicos.map(nombreCampo => ({ nombre: nombreCampo, tipo: 'dinamico', descripcion: 'Columna personalizada' }))
    ];
    return {
        dataset: nombre,
        filas: filas.length,
        campos: campos.map(c => ({ ...c, ...(CAMPOS_SIN_EJEMPLOS.has(c.nombre) ? {} : { resumen: ejemplosCampo(filas, c.nombre) }) }))
    };
};

const validarCampos = async (consulta: Consulta) => {
    const filas = await cargarDataset(consulta.dataset);
    const definicion = buscarDataset(consulta.dataset)!;
    const conocidos = new Set([...definicion.campos.map(c => c.nombre), ...filas.flatMap(f => Object.keys(f))]);
    const usados = [
        ...(consulta.filtros ?? []).map(f => f.campo),
        ...(consulta.agrupar ?? []).map(a => a.campo),
        ...(consulta.metricas ?? []).map(m => m.campo).filter((c): c is string => Boolean(c))
    ];
    const desconocidos = usados.filter(c => !conocidos.has(c));
    if (desconocidos.length) {
        const sugerencias = desconocidos.map(c => {
            const parecido = [...conocidos].find(k => normalizarTexto(k).includes(normalizarTexto(c)) || normalizarTexto(c).includes(normalizarTexto(k)));
            return parecido ? `${c} (¿quisiste decir ${parecido}?)` : c;
        });
        throw new Error(`Campos inexistentes en ${consulta.dataset}: ${sugerencias.join(', ')}`);
    }
    return filas;
};

export const ejecutarConsultaSegura = async (consulta: Consulta) => ejecutarConsulta(await validarCampos(consulta), consulta);

const textoPaso = (nombre: string, args: any) => {
    if (nombre === 'describir_dataset') return `Revisando ${String(args?.dataset ?? 'datos').replace(/_/g, ' ')}`;
    if (nombre === 'consultar') return `Calculando sobre ${String(args?.dataset ?? 'datos').replace(/_/g, ' ')}`;
    return `Dibujando «${args?.titulo ?? 'visualización'}»`;
};

const elegirEjes = (resultado: ResultadoConsulta, x?: string, y?: string[]) => {
    const numericas = resultado.columnas.filter(c => resultado.filas.some(f => typeof f[c] === 'number'));
    const ejeX = x && resultado.columnas.includes(x) ? x : resultado.columnas.find(c => !numericas.includes(c));
    const ejeY = (y ?? []).filter(c => resultado.columnas.includes(c));
    return { x: ejeX, y: (ejeY.length ? ejeY : numericas.filter(c => c !== ejeX)).slice(0, 3) };
};

const ejecutarHerramienta = async (nombre: string, args: any, callbacks: CallbacksAgente): Promise<unknown> => {
    if (nombre === 'describir_dataset') return describirDataset(args.dataset);

    if (nombre === 'consultar') {
        const resultado = await ejecutarConsultaSegura(args as Consulta);
        return { columnas: resultado.columnas, total: resultado.total, filas: resultado.filas.slice(0, 60) };
    }

    if (nombre === 'mostrar') {
        const resultado = await ejecutarConsultaSegura(args.consulta as Consulta);
        const ejes = elegirEjes(resultado, args.x, args.y);
        callbacks.onVisualizacion({
            id: crypto.randomUUID(),
            tipo: args.tipo,
            titulo: args.titulo,
            subtitulo: args.subtitulo,
            x: ejes.x,
            y: ejes.y,
            formato: args.formato ?? 'numero',
            consulta: args.consulta,
            resultado
        });
        return { ok: true, filas: resultado.total, vistaPrevia: resultado.filas.slice(0, 10) };
    }

    throw new Error(`Herramienta desconocida: ${nombre}`);
};

const llamarModelo = async (settings: AiSettings, mensajes: MensajeChat[], signal: AbortSignal) => {
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages: mensajes, tools: HERRAMIENTAS, tool_choice: 'auto', temperature: 0.1 }),
        signal
    });
    const raw = await response.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!response.ok) {
        const detalle = data?.error?.message ?? data?.message ?? raw.slice(0, 200);
        if (response.status === 401) throw new Error('La API key no es válida o expiró. Revísala en Configurar IA.');
        throw new Error(`El proveedor de IA respondió ${response.status}: ${detalle || response.statusText}`);
    }
    const mensaje = data?.choices?.[0]?.message;
    if (!mensaje) throw new Error('El proveedor de IA devolvió una respuesta vacía.');
    return mensaje as MensajeChat;
};

export const nuevoHistorial = (): MensajeChat[] => [{ role: 'system', content: promptSistema() }];

export const preguntar = async (
    settings: AiSettings,
    historial: MensajeChat[],
    pregunta: string,
    callbacks: CallbacksAgente,
    signal: AbortSignal
): Promise<string> => {
    historial.push({ role: 'user', content: pregunta });

    for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
        callbacks.onPaso(iteracion === 0 ? 'Pensando' : 'Analizando resultados');
        const mensaje = await llamarModelo(settings, historial, signal);
        historial.push({ role: 'assistant', content: mensaje.content ?? null, ...(mensaje.tool_calls?.length ? { tool_calls: mensaje.tool_calls } : {}) });

        if (!mensaje.tool_calls?.length) return mensaje.content?.trim() || 'Listo.';

        for (const llamada of mensaje.tool_calls) {
            let resultado: unknown;
            try {
                const args = JSON.parse(llamada.function.arguments || '{}');
                callbacks.onPaso(textoPaso(llamada.function.name, args));
                resultado = await ejecutarHerramienta(llamada.function.name, args, callbacks);
            } catch (error) {
                resultado = { error: error instanceof Error ? error.message : String(error) };
            }
            historial.push({ role: 'tool', tool_call_id: llamada.id, content: JSON.stringify(resultado) });
        }
    }

    return 'La pregunta requirió demasiados pasos. Intenta dividirla en preguntas más simples.';
};
