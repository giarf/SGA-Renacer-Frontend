import { apiService } from '../api/apiService';
import type { DatoAsistencia, EntidadResumen, ValorCampana } from '../types';
import type { Fila, Valor } from './queryEngine';

// Catálogo de datos que el Dashboard AI puede consultar. Los datos se cargan con la
// sesión del administrador y se procesan en el navegador. Se omiten a propósito RUT,
// teléfonos, correos y direcciones para que nunca lleguen al proveedor de IA.

export type TipoCampo = 'texto' | 'numero' | 'fecha' | 'booleano' | 'lista';

export interface CampoDataset { nombre: string; tipo: TipoCampo; descripcion: string }

export interface DefinicionDataset {
    nombre: string;
    descripcion: string;
    campos: CampoDataset[];
    cargar: () => Promise<Fila[]>;
}

const hoy = () => new Date().toISOString().slice(0, 10);

const calcularEdad = (fechaNacimiento?: string | null, referencia = hoy()): number | null => {
    if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}/.test(fechaNacimiento)) return null;
    const [anio = 0, mes = 0, dia = 0] = fechaNacimiento.slice(0, 10).split('-').map(Number);
    const [rAnio = 0, rMes = 0, rDia = 0] = referencia.slice(0, 10).split('-').map(Number);
    let edad = rAnio - anio;
    if (rMes < mes || (rMes === mes && rDia < dia)) edad -= 1;
    return edad >= 0 && edad < 130 ? edad : null;
};

const grupoEtario = (edad: number | null) => {
    if (edad === null) return 'Sin dato';
    if (edad <= 12) return 'Niño/a (0-12)';
    if (edad <= 17) return 'Adolescente (13-17)';
    if (edad <= 59) return 'Adulto (18-59)';
    return 'Adulto mayor (60+)';
};

const nombresEtiquetas = (persona?: EntidadResumen) => (persona?.etiquetas ?? []).map(e => e.nombre).filter(Boolean);

const datoColumna = (valor: DatoAsistencia | { enviado?: boolean } | undefined): Valor => {
    if (valor && typeof valor === 'object') return Boolean(valor.enviado);
    return valor ?? null;
};

const conLimite = async <T, R>(items: T[], limite: number, tarea: (item: T) => Promise<R>): Promise<R[]> => {
    const resultados: R[] = new Array(items.length);
    let siguiente = 0;
    const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
        while (siguiente < items.length) {
            const indice = siguiente++;
            resultados[indice] = await tarea(items[indice]!);
        }
    });
    await Promise.all(trabajadores);
    return resultados;
};

const personaPorId = async () => new Map((await obtener('__personas_raw', () => apiService.getPersonas())).map(p => [p.id, p]));

const camposPersona: CampoDataset[] = [
    { nombre: 'genero', tipo: 'texto', descripcion: 'Género registrado' },
    { nombre: 'edad', tipo: 'numero', descripcion: 'Edad en años (null si no hay fecha de nacimiento)' },
    { nombre: 'grupoEtario', tipo: 'texto', descripcion: "'Niño/a (0-12)', 'Adolescente (13-17)', 'Adulto (18-59)', 'Adulto mayor (60+)' o 'Sin dato'" },
    { nombre: 'comuna', tipo: 'texto', descripcion: 'Comuna' },
    { nombre: 'etiquetas', tipo: 'lista', descripcion: 'Etiquetas asignadas a la persona (beneficiario, voluntario, etc.)' }
];

const columnasPersona = (persona: EntidadResumen | undefined, referencia?: string): Fila => {
    const edad = calcularEdad(persona?.fechaNacimiento, referencia);
    return {
        genero: persona?.genero ?? null,
        edad,
        grupoEtario: grupoEtario(edad),
        comuna: persona?.comuna ?? null,
        etiquetas: nombresEtiquetas(persona)
    };
};

export const DATASETS: DefinicionDataset[] = [
    {
        nombre: 'personas',
        descripcion: 'Personas naturales registradas (beneficiarios, voluntarios, padrinos, etc.).',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID de la persona' },
            { nombre: 'nombre', tipo: 'texto', descripcion: 'Nombre completo' },
            ...camposPersona,
            { nombre: 'fechaNacimiento', tipo: 'fecha', descripcion: 'Fecha de nacimiento' },
            { nombre: 'region', tipo: 'texto', descripcion: 'Región' },
            { nombre: 'ocupacion', tipo: 'texto', descripcion: 'Ocupación' },
            { nombre: 'sector', tipo: 'texto', descripcion: 'Sector' },
            { nombre: 'gestor', tipo: 'texto', descripcion: 'Nombre del gestor responsable' }
        ],
        cargar: async () => (await obtener('__personas_raw', () => apiService.getPersonas())).map(p => ({
            id: p.id,
            nombre: p.nombreCompleto,
            ...columnasPersona(p),
            fechaNacimiento: p.fechaNacimiento ?? null,
            region: p.region ?? null,
            ocupacion: p.ocupacion ?? null,
            sector: p.sector ?? null,
            gestor: p.gestorNombre ?? null
        }))
    },
    {
        nombre: 'instituciones',
        descripcion: 'Instituciones registradas (empresas, fundaciones, colegios, etc.).',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'nombre', tipo: 'texto', descripcion: 'Nombre o razón social' },
            { nombre: 'subtipo', tipo: 'texto', descripcion: 'Subtipo de institución' },
            { nombre: 'rubro', tipo: 'texto', descripcion: 'Rubro' },
            { nombre: 'comuna', tipo: 'texto', descripcion: 'Comuna' },
            { nombre: 'region', tipo: 'texto', descripcion: 'Región' }
        ],
        cargar: async () => (await apiService.getInstituciones()).map(i => ({
            id: i.id,
            nombre: i.nombreFantasia || i.razonSocial || i.nombreCompleto,
            subtipo: i.subtipoInstitucion ?? null,
            rubro: i.rubro ?? null,
            comuna: i.comuna ?? null,
            region: i.region ?? null
        }))
    },
    {
        nombre: 'eventos_asistencia',
        descripcion: 'Eventos con registro de asistencia (actividades, celebraciones como Fiestas Patrias, Navidad, etc.). Una fila por evento.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID del evento' },
            { nombre: 'evento', tipo: 'texto', descripcion: 'Nombre del evento' },
            { nombre: 'fecha', tipo: 'fecha', descripcion: 'Fecha del evento' },
            { nombre: 'descripcion', tipo: 'texto', descripcion: 'Descripción' },
            { nombre: 'totalAsistentes', tipo: 'numero', descripcion: 'Cantidad total de asistentes' }
        ],
        cargar: async () => (await obtener('__eventos_raw', () => apiService.getEventosAsistencia())).map(e => ({
            id: e.id,
            evento: e.nombre,
            fecha: e.fecha,
            descripcion: e.descripcion,
            totalAsistentes: e.totalAsistentes
        }))
    },
    {
        nombre: 'asistencia',
        descripcion: "Una fila por persona asistente a cada evento, con sus datos demográficos a la fecha del evento. Usar para preguntas como 'cuántos niños atendimos en Fiestas Patrias'. Las columnas personalizadas del evento aparecen como campos 'col:<nombre>'.",
        campos: [
            { nombre: 'eventoId', tipo: 'numero', descripcion: 'ID del evento' },
            { nombre: 'evento', tipo: 'texto', descripcion: 'Nombre del evento' },
            { nombre: 'fechaEvento', tipo: 'fecha', descripcion: 'Fecha del evento' },
            { nombre: 'personaId', tipo: 'numero', descripcion: 'ID de la persona (usar count_distinct para personas únicas)' },
            { nombre: 'nombre', tipo: 'texto', descripcion: 'Nombre de la persona' },
            ...camposPersona.map(c => (c.nombre === 'edad' ? { ...c, descripcion: 'Edad en años a la fecha del evento' } : c)),
            { nombre: 'llegada', tipo: 'fecha', descripcion: 'Fecha y hora de registro de llegada' }
        ],
        cargar: async () => {
            const [eventos, personas] = await Promise.all([obtener('__eventos_raw', () => apiService.getEventosAsistencia()), personaPorId()]);
            const detalles = await conLimite(eventos, 4, evento => apiService.getAsistencia(evento.id));
            return detalles.flatMap(detalle => detalle.asistentes.map(asistente => {
                const fila: Fila = {
                    eventoId: detalle.evento.id,
                    evento: detalle.evento.nombre,
                    fechaEvento: detalle.evento.fecha,
                    personaId: asistente.personaId,
                    nombre: asistente.nombreCompleto,
                    ...columnasPersona(personas.get(asistente.personaId), detalle.evento.fecha),
                    llegada: asistente.llegada
                };
                detalle.columnas.forEach(columna => { fila[`col:${columna.nombre}`] = datoColumna(asistente.valores[String(columna.id)]?.valor); });
                return fila;
            }));
        }
    },
    {
        nombre: 'campanas',
        descripcion: 'Campañas de apadrinamiento o seguimiento (por ejemplo Navidad). Una fila por campaña.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'campana', tipo: 'texto', descripcion: 'Nombre de la campaña' },
            { nombre: 'fecha', tipo: 'fecha', descripcion: 'Fecha de referencia' },
            { nombre: 'estado', tipo: 'texto', descripcion: "'borrador', 'activa' o 'cerrada'" },
            { nombre: 'totalParticipantes', tipo: 'numero', descripcion: 'Beneficiarios en la campaña' },
            { nombre: 'sinPadrino', tipo: 'numero', descripcion: 'Beneficiarios sin padrino asignado' }
        ],
        cargar: async () => (await obtener('__campanas_raw', () => apiService.getCampanas())).map(c => ({
            id: c.id,
            campana: c.nombre,
            fecha: c.fecha,
            estado: c.estado,
            totalParticipantes: c.totalParticipantes,
            sinPadrino: c.sinPadrino
        }))
    },
    {
        nombre: 'campana_participantes',
        descripcion: "Una fila por beneficiario dentro de cada campaña, con su padrino y datos demográficos. Las columnas de seguimiento aparecen como 'col:<nombre>' (booleanas, texto, número; los mensajes de WhatsApp como booleano 'enviado').",
        campos: [
            { nombre: 'campanaId', tipo: 'numero', descripcion: 'ID de la campaña' },
            { nombre: 'campana', tipo: 'texto', descripcion: 'Nombre de la campaña' },
            { nombre: 'fechaCampana', tipo: 'fecha', descripcion: 'Fecha de la campaña' },
            { nombre: 'estadoCampana', tipo: 'texto', descripcion: 'Estado de la campaña' },
            { nombre: 'beneficiarioId', tipo: 'numero', descripcion: 'ID del beneficiario' },
            { nombre: 'beneficiario', tipo: 'texto', descripcion: 'Nombre del beneficiario' },
            { nombre: 'tienePadrino', tipo: 'booleano', descripcion: 'Si tiene padrino/madrina asignado' },
            { nombre: 'padrino', tipo: 'texto', descripcion: 'Nombre del padrino/madrina' },
            ...camposPersona.map(c => (c.nombre === 'edad' ? { ...c, descripcion: 'Edad del beneficiario a la fecha de la campaña' } : c))
        ],
        cargar: async () => {
            const [campanas, personas] = await Promise.all([obtener('__campanas_raw', () => apiService.getCampanas()), personaPorId()]);
            const detalles = await conLimite(campanas, 4, campana => apiService.getCampana(campana.id));
            return detalles.flatMap(detalle => detalle.participantes.map(p => {
                const fila: Fila = {
                    campanaId: detalle.campana.id,
                    campana: detalle.campana.nombre,
                    fechaCampana: detalle.campana.fecha,
                    estadoCampana: detalle.campana.estado,
                    beneficiarioId: p.beneficiario.id,
                    beneficiario: p.beneficiario.nombreCompleto,
                    tienePadrino: Boolean(p.padrino),
                    padrino: p.padrino?.nombreCompleto ?? null,
                    ...columnasPersona(personas.get(p.beneficiario.id), detalle.campana.fecha)
                };
                detalle.columnas.forEach(columna => {
                    const valor: ValorCampana | undefined = p.valores[String(columna.id)];
                    fila[`col:${columna.nombre}`] = datoColumna(valor?.valor);
                });
                return fila;
            }));
        }
    },
    {
        nombre: 'ingresos',
        descripcion: 'Ingresos de recursos: donaciones (dinero o especie), compras, subvenciones. Una fila por ingreso.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'tipo', tipo: 'texto', descripcion: 'Tipo de ingreso' },
            { nombre: 'fecha', tipo: 'fecha', descripcion: 'Fecha' },
            { nombre: 'montoTotal', tipo: 'numero', descripcion: 'Monto total en CLP' },
            { nombre: 'estado', tipo: 'texto', descripcion: 'Estado (por ejemplo anulado)' },
            { nombre: 'descripcion', tipo: 'texto', descripcion: 'Descripción' }
        ],
        cargar: async () => (await apiService.getIngresos()).map(i => ({
            id: i.id,
            tipo: i.tipo,
            fecha: i.fecha,
            montoTotal: Number(i.montoTotal) || 0,
            estado: i.estado ?? null,
            descripcion: i.descripcion ?? null
        }))
    },
    {
        nombre: 'egresos',
        descripcion: "Egresos de recursos: 'Ayuda Social' a beneficiarios, 'Consumo Interno' y 'Ajuste'. Una fila por egreso.",
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'fecha', tipo: 'fecha', descripcion: 'Fecha' },
            { nombre: 'tipoEgreso', tipo: 'texto', descripcion: "'Ayuda Social', 'Consumo Interno' o 'Ajuste'" },
            { nombre: 'montoTotal', tipo: 'numero', descripcion: 'Monto total en CLP' },
            { nombre: 'estado', tipo: 'texto', descripcion: 'Estado (por ejemplo anulado)' },
            { nombre: 'proposito', tipo: 'texto', descripcion: 'Propósito específico' },
            { nombre: 'destinoId', tipo: 'numero', descripcion: 'ID de la entidad destino' },
            { nombre: 'destino', tipo: 'texto', descripcion: 'Nombre de la persona o institución destino' },
            { nombre: 'metodo', tipo: 'texto', descripcion: 'Método de transferencia si fue en dinero' },
            { nombre: 'itemsDistintos', tipo: 'numero', descripcion: 'Cantidad de ítems distintos entregados' }
        ],
        cargar: async () => {
            const [egresos, entidades] = await Promise.all([apiService.getEgresos(), apiService.getEntidades()]);
            const nombres = new Map(entidades.map(e => [e.id, e.nombreCompleto]));
            return egresos.map(e => ({
                id: e.id,
                fecha: e.fecha,
                tipoEgreso: e.tipoEgreso,
                montoTotal: e.montoTotal,
                estado: e.estado ?? null,
                proposito: e.propositoEspecifico ?? null,
                destinoId: e.destinoEntidadId || null,
                destino: nombres.get(e.destinoEntidadId) ?? null,
                metodo: e.egresoPecuniario?.metodoTransferencia || null,
                itemsDistintos: e.detalleEgresoRecurso?.length ?? 0
            }));
        }
    },
    {
        nombre: 'catalogo',
        descripcion: 'Ítems del inventario con stock y valorización.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'item', tipo: 'texto', descripcion: 'Nombre del ítem' },
            { nombre: 'categoria', tipo: 'texto', descripcion: 'Categoría' },
            { nombre: 'unidad', tipo: 'texto', descripcion: 'Unidad de medida' },
            { nombre: 'stockActual', tipo: 'numero', descripcion: 'Stock actual' },
            { nombre: 'valorTotalStock', tipo: 'numero', descripcion: 'Valor total del stock en CLP' },
            { nombre: 'precioPromedio', tipo: 'numero', descripcion: 'Precio promedio ponderado' }
        ],
        cargar: async () => (await apiService.getCatalogoItems()).map(c => ({
            id: c.id,
            item: c.nombre,
            categoria: c.categoria,
            unidad: c.unidadMedidaEstandar,
            stockActual: Number(c.stockActual) || 0,
            valorTotalStock: Number(c.valorTotalStock) || 0,
            precioPromedio: Number(c.precioPromedioPonderado) || 0
        }))
    },
    {
        nombre: 'cuentas',
        descripcion: 'Cuentas o fondos internos con su saldo.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'cuenta', tipo: 'texto', descripcion: 'Nombre de la cuenta' },
            { nombre: 'saldoActual', tipo: 'numero', descripcion: 'Saldo actual en CLP' }
        ],
        cargar: async () => (await apiService.getCuentas()).map(c => ({ id: c.id, cuenta: c.nombre, saldoActual: Number(c.saldoActual) || 0 }))
    },
    {
        nombre: 'familias',
        descripcion: 'Grupos familiares con su puntaje de vulnerabilidad.',
        campos: [
            { nombre: 'id', tipo: 'numero', descripcion: 'ID' },
            { nombre: 'familia', tipo: 'texto', descripcion: 'Nombre de la familia' },
            { nombre: 'puntosVulnerabilidad', tipo: 'numero', descripcion: 'Puntaje de vulnerabilidad' },
            { nombre: 'jefeHogar', tipo: 'texto', descripcion: 'Nombre del jefe/a de hogar' }
        ],
        cargar: async () => (await apiService.getFamilias()).map(f => ({
            id: f.id,
            familia: f.nombreFamilia,
            puntosVulnerabilidad: f.puntosVulnerabilidad,
            jefeHogar: f.jefeHogarNombre ?? null
        }))
    }
];

const cache = new Map<string, Promise<unknown>>();

function obtener<T>(clave: string, cargar: () => Promise<T>): Promise<T> {
    if (!cache.has(clave)) {
        const promesa = cargar().catch(error => { cache.delete(clave); throw error; });
        cache.set(clave, promesa);
    }
    return cache.get(clave) as Promise<T>;
}

export const buscarDataset = (nombre: string) => DATASETS.find(d => d.nombre === nombre);

export const cargarDataset = (nombre: string): Promise<Fila[]> => {
    const definicion = buscarDataset(nombre);
    if (!definicion) return Promise.reject(new Error(`Dataset desconocido: ${nombre}. Disponibles: ${DATASETS.map(d => d.nombre).join(', ')}`));
    return obtener(nombre, definicion.cargar);
};

export const limpiarCacheDatasets = () => cache.clear();
