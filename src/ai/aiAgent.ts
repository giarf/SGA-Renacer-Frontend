import { apiService } from '../api/apiService';
import { NOMBRES_ACCIONES, catalogoAccionesPrompt, construirVista, ejecutarOperacion, validarOperaciones, type Confirmacion, type OperacionPropuesta } from './aiActions';
import type { AiSettings } from './aiSettings';
import { DATASETS, buscarDataset, cargarDataset, limpiarCacheDatasets } from './datasets';
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
    onTexto: (markdown: string) => void;
    // Muestra la tarjeta de confirmación. Resuelve con la confirmación (la instancia que la UI
    // observa, para reflejar los resultados) sólo si el administrador aprueba; si no, null.
    onConfirmacion: (confirmacion: Confirmacion) => Promise<Confirmacion | null>;
}

const MAX_ITERACIONES = 14;
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
            name: 'buscar',
            description: 'Busca registros para obtener sus IDs antes de proponer acciones: personas/instituciones por nombre o RUT, ítems de catálogo, etiquetas, cuentas, familias; o el detalle de un evento/campaña (columnas con su ID, asistentes o participantes).',
            parameters: {
                type: 'object',
                properties: {
                    tipo: { type: 'string', enum: ['entidades', 'personas', 'instituciones', 'catalogo', 'etiquetas', 'cuentas', 'familias', 'detalle_evento', 'detalle_campana'] },
                    texto: { type: 'string', description: 'Texto a buscar (mínimo 2 caracteres para entidades)' },
                    id: { type: 'number', description: 'ID del evento o campaña para los detalles' }
                },
                required: ['tipo']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'proponer_acciones',
            description: 'Propone una o varias acciones de escritura (crear, modificar, eliminar). El administrador verá una vista previa y debe confirmarlas; devuelve si las aprobó y el resultado de cada una. Agrupa en una sola llamada todas las acciones de una misma tarea.',
            parameters: {
                type: 'object',
                properties: {
                    resumen: { type: 'string', description: 'Una frase que explique qué se hará y por qué' },
                    acciones: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { accion: { type: 'string', enum: NOMBRES_ACCIONES }, parametros: { type: 'object' } },
                            required: ['accion', 'parametros']
                        }
                    }
                },
                required: ['resumen', 'acciones']
            }
        }
    },
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

const promptSistema = () => `Eres el asistente de datos y operaciones de la Fundación Familia Renacer dentro del sistema SGA. Respondes en español de Chile, claro y breve, a administradores que no son técnicos. Puedes analizar datos y también crear, modificar o eliminar registros.
Hoy es ${new Date().toISOString().slice(0, 10)}.

Datasets disponibles:
${DATASETS.map(d => `- ${d.nombre}: ${d.descripcion}\n  Campos: ${d.campos.map(c => `${c.nombre} (${c.tipo})`).join(', ')}`).join('\n')}

Cómo trabajar:
1. Si la pregunta menciona un evento, campaña, etiqueta o categoría por nombre, primero usa describir_dataset para encontrar el valor exacto; luego filtra con 'contains' o 'in' usando esos valores. "Fiestas Patrias" puede llamarse "Fonda", "18 de septiembre", "Dieciocho", etc.
2. Calcula las cifras con consultar. Nunca inventes números: todo dato que menciones debe salir de una consulta.
3. Cuando la respuesta sea una cifra, un ranking, una comparación o una evolución, llama a mostrar (puedes llamarla varias veces para armar un pequeño tablero). Para personas únicas usa count_distinct sobre personaId o beneficiarioId. Pon alias legibles a las métricas.
4. "Niños" significa grupoEtario 'Niño/a (0-12)' salvo que el usuario indique otra edad; menciona cuántos registros no tienen fecha de nacimiento si eso afecta el resultado.
5. Excluye egresos o ingresos con estado anulado salvo que pidan lo contrario.
6. Responde en Markdown: negritas para cifras clave, listas cortas y tablas Markdown para listados pequeños (hasta ~15 filas). Para listados más largos usa mostrar con tipo tabla. Termina con 1 a 4 frases que resuman el hallazgo. No menciones las herramientas.

Acciones de escritura (siempre mediante proponer_acciones; * = obligatorio):
${catalogoAccionesPrompt()}

Reglas para acciones:
- Nunca digas que algo se creó, modificó o eliminó si proponer_acciones no devolvió aprobado=true y ok=true para esa acción.
- Usa buscar o consultar para obtener los IDs reales; nunca inventes IDs. Si hay varias coincidencias posibles, pregunta al usuario cuál es antes de proponer.
- Si falta un dato obligatorio que no puedes deducir, pregúntalo. Las fechas por defecto son hoy.
- Para modificar, envía sólo los campos que cambian.
- Si el usuario rechaza, no vuelvas a proponer lo mismo; pregunta qué quiere ajustar.
- La gestión de usuarios y permisos (Authentik) no está disponible aquí.`;

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
    if (nombre === 'buscar') return `Buscando ${String(args?.tipo ?? '').replace(/_/g, ' ')}${args?.texto ? ` «${args.texto}»` : ''}`;
    if (nombre === 'proponer_acciones') return 'Esperando tu confirmación';
    return `Dibujando «${args?.titulo ?? 'visualización'}»`;
};

const elegirEjes = (resultado: ResultadoConsulta, x?: string, y?: string[]) => {
    const numericas = resultado.columnas.filter(c => resultado.filas.some(f => typeof f[c] === 'number'));
    const ejeX = x && resultado.columnas.includes(x) ? x : resultado.columnas.find(c => !numericas.includes(c));
    const ejeY = (y ?? []).filter(c => resultado.columnas.includes(c));
    return { x: ejeX, y: (ejeY.length ? ejeY : numericas.filter(c => c !== ejeX)).slice(0, 3) };
};

const coincide = (texto: unknown, busqueda?: string) => !busqueda || normalizarTexto(texto).includes(normalizarTexto(busqueda));

const buscar = async (args: { tipo: string; texto?: string; id?: number }) => {
    const { tipo, texto } = args;
    if (tipo === 'entidades' || tipo === 'personas' || tipo === 'instituciones') {
        if (!texto || texto.trim().length < 2) throw new Error('Indica al menos 2 caracteres para buscar.');
        const filtro = tipo === 'personas' ? 'PersonaNatural' : tipo === 'instituciones' ? 'Institucion' : undefined;
        const resultados = await apiService.buscarEntidades(texto.trim(), filtro);
        return resultados.slice(0, 25).map(e => ({ id: e.id, nombre: e.nombreCompleto, tipo: e.tipoEntidad, comuna: e.comuna ?? null }));
    }
    if (tipo === 'catalogo') return (await apiService.getCatalogoItems()).filter(c => coincide(c.nombre, texto) || coincide(c.categoria, texto)).slice(0, 40).map(c => ({ id: c.id, nombre: c.nombre, categoria: c.categoria, unidad: c.unidadMedidaEstandar, stock: c.stockActual, precioReferencia: c.precioReferencia }));
    if (tipo === 'etiquetas') return (await apiService.getEtiquetas()).filter(e => coincide(e.nombre, texto)).map(e => ({ id: e.id, nombre: e.nombre, descripcion: e.descripcion, activa: e.activa }));
    if (tipo === 'cuentas') return (await apiService.getCuentas()).filter(c => coincide(c.nombre, texto)).map(c => ({ id: c.id, nombre: c.nombre, saldoActual: c.saldoActual }));
    if (tipo === 'familias') return (await apiService.getFamilias()).filter(f => coincide(f.nombreFamilia, texto) || coincide(f.jefeHogarNombre, texto)).slice(0, 40).map(f => ({ id: f.id, nombre: f.nombreFamilia, jefeHogar: f.jefeHogarNombre, jefeHogarId: f.jefeHogarId }));
    if (tipo === 'detalle_evento') {
        if (!args.id) throw new Error('Indica el id del evento.');
        const d = await apiService.getAsistencia(Number(args.id));
        return { evento: d.evento, columnas: d.columnas, asistentes: d.asistentes.filter(a => coincide(a.nombreCompleto, texto)).slice(0, 300).map(a => ({ personaId: a.personaId, nombre: a.nombreCompleto })) };
    }
    if (tipo === 'detalle_campana') {
        if (!args.id) throw new Error('Indica el id de la campaña.');
        const d = await apiService.getCampana(Number(args.id));
        return {
            campana: d.campana,
            columnas: d.columnas.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
            participantes: d.participantes.filter(p => coincide(p.beneficiario.nombreCompleto, texto) || coincide(p.padrino?.nombreCompleto, texto)).slice(0, 300).map(p => ({ beneficiarioId: p.beneficiario.id, beneficiario: p.beneficiario.nombreCompleto, padrinoId: p.padrino?.id ?? null, padrino: p.padrino?.nombreCompleto ?? null }))
        };
    }
    throw new Error(`Tipo de búsqueda desconocido: ${tipo}`);
};

const proponerAcciones = async (args: { resumen?: string; acciones: OperacionPropuesta[] }, callbacks: CallbacksAgente) => {
    validarOperaciones(args.acciones);
    const confirmacion: Confirmacion = {
        id: crypto.randomUUID(),
        resumen: args.resumen ?? '',
        operaciones: await Promise.all(args.acciones.map(construirVista)),
        estado: 'pendiente'
    };
    const aprobada = await callbacks.onConfirmacion(confirmacion);
    if (!aprobada) return { aprobado: false, mensaje: 'El administrador rechazó las acciones. No se realizó ningún cambio.' };

    const resultados = [];
    for (const [i, op] of args.acciones.entries()) {
        const vista = aprobada.operaciones[i]!;
        try {
            vista.resultado = { ok: true, mensaje: await ejecutarOperacion(op) };
        } catch (error) {
            vista.resultado = { ok: false, mensaje: error instanceof Error ? error.message : String(error) };
        }
        resultados.push({ accion: op.accion, ...vista.resultado });
    }
    aprobada.estado = 'completada';
    limpiarCacheDatasets();
    return { aprobado: true, resultados };
};

const ejecutarHerramienta = async (nombre: string, args: any, callbacks: CallbacksAgente): Promise<unknown> => {
    if (nombre === 'describir_dataset') return describirDataset(args.dataset);
    if (nombre === 'buscar') return buscar(args);
    if (nombre === 'proponer_acciones') return proponerAcciones(args, callbacks);

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

// Los chats guardados conservan su historial; se refresca el prompt (fecha, acciones) al continuar.
const conPromptActual = (historial: MensajeChat[]) => {
    if (historial[0]?.role === 'system') historial[0] = { role: 'system', content: promptSistema() };
    else historial.unshift({ role: 'system', content: promptSistema() });
};

// Si una consulta se interrumpió, las llamadas a herramientas quedan sin respuesta y el
// proveedor rechazaría el historial; se completan como interrumpidas.
const repararHistorial = (historial: MensajeChat[]) => {
    const respondidas = new Set(historial.filter(m => m.role === 'tool').map(m => m.tool_call_id));
    for (let i = historial.length - 1; i >= 0; i--) {
        const pendientes = (historial[i]!.tool_calls ?? []).filter(t => !respondidas.has(t.id));
        if (!pendientes.length) continue;
        let fin = i + 1;
        while (historial[fin]?.role === 'tool') fin++;
        historial.splice(fin, 0, ...pendientes.map(t => ({ role: 'tool' as const, tool_call_id: t.id, content: JSON.stringify({ error: 'Interrumpido por el usuario; no se realizó ninguna acción.' }) })));
    }
};

export const preguntar = async (
    settings: AiSettings,
    historial: MensajeChat[],
    pregunta: string,
    callbacks: CallbacksAgente,
    signal: AbortSignal
): Promise<string> => {
    conPromptActual(historial);
    repararHistorial(historial);
    historial.push({ role: 'user', content: pregunta });

    for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
        callbacks.onPaso(iteracion === 0 ? 'Pensando' : 'Analizando resultados');
        const mensaje = await llamarModelo(settings, historial, signal);
        historial.push({ role: 'assistant', content: mensaje.content ?? null, ...(mensaje.tool_calls?.length ? { tool_calls: mensaje.tool_calls } : {}) });

        if (!mensaje.tool_calls?.length) return mensaje.content?.trim() || 'Listo.';
        if (mensaje.content?.trim()) callbacks.onTexto(mensaje.content.trim());

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
