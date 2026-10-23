import { apiService } from '../api/apiService';
import { resolveCurrentResponsible } from '../auth/currentResponsible';
import type { ActualizarPersonaPayload, ActualizarInstitucionPayload, DatoAsistencia, EgresoPayload, EntidadResumen, TipoColumnaAsistencia, TipoColumnaCampana } from '../types';

// Acciones de escritura que el Dashboard AI puede proponer. Ninguna se ejecuta sin que
// el administrador vea la vista previa (con nombres resueltos y valores antes/después) y
// la confirme explícitamente.

export type TipoAccion = 'crear' | 'modificar' | 'eliminar';
type Params = Record<string, any>;

export interface CampoVista { etiqueta: string; antes?: string | string[]; despues?: string | string[] }
export interface OperacionVista {
    accion: string;
    tipo: TipoAccion;
    titulo: string;
    campos: CampoVista[];
    advertencia?: string;
    resultado?: { ok: boolean; mensaje: string };
}
export interface Confirmacion {
    id: string;
    resumen: string;
    operaciones: OperacionVista[];
    estado: 'pendiente' | 'ejecutando' | 'completada' | 'rechazada' | 'expirada';
}

type Recurso = 'entidad' | 'etiqueta' | 'familia' | 'evento' | 'campana' | 'catalogo' | 'cuenta' | 'egreso' | 'ingreso';

interface DefAccion {
    nombre: string;
    tipo: TipoAccion;
    descripcion: string;
    parametros: Record<string, string>;
    requeridos: string[];
    recurso?: Recurso;
    titulo: (p: Params) => string;
    // Registro actual, para mostrar qué se eliminará o qué valores cambian.
    previo?: (p: Params) => Promise<Record<string, unknown> | null>;
    advertencia?: (p: Params, previo: Record<string, unknown> | null) => string | undefined;
    ejecutar: (p: Params) => Promise<unknown>;
}

// ---------- Utilidades de resolución de nombres ----------

const memo = new Map<string, Promise<any>>();
const una = <T>(clave: string, cargar: () => Promise<T>): Promise<T> => {
    if (!memo.has(clave)) memo.set(clave, cargar().catch(e => { memo.delete(clave); throw e; }));
    return memo.get(clave)!;
};
export const limpiarCacheAcciones = () => memo.clear();

const entidades = () => una('entidades', async () => new Map((await apiService.getEntidades()).map(e => [e.id, e])));
const etiquetas = () => una('etiquetas', async () => new Map((await apiService.getEtiquetas()).map(e => [e.id, e])));
const cuentas = () => una('cuentas', async () => new Map((await apiService.getCuentas()).map(c => [c.id, c])));
const catalogo = () => una('catalogo', async () => new Map((await apiService.getCatalogoItems()).map(c => [c.id, c])));
const eventos = () => una('eventos', async () => new Map((await apiService.getEventosAsistencia()).map(e => [e.id, e])));
const campanas = () => una('campanas', async () => new Map((await apiService.getCampanas()).map(c => [c.id, c])));
const familias = () => una('familias', async () => new Map((await apiService.getFamilias()).map(f => [f.id, f])));

const RESOLVER_POR_CAMPO: Record<string, Recurso> = {
    origenEntidadId: 'entidad', destinoEntidadId: 'entidad', proveedorId: 'entidad', personaId: 'entidad', apoderadoId: 'entidad',
    jefeHogarId: 'entidad', gestorId: 'entidad', beneficiarioId: 'entidad', padrinoId: 'entidad', solicitanteId: 'entidad',
    entidadIds: 'entidad', personaIds: 'entidad', beneficiarioIds: 'entidad',
    etiquetaId: 'etiqueta', cuentaDestinoId: 'cuenta', cuentaOrigenId: 'cuenta', itemCatalogoId: 'catalogo',
    eventoId: 'evento', campanaId: 'campana', familiaId: 'familia'
};

const nombreDe = async (recurso: Recurso, id: unknown): Promise<string> => {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return 'Ninguno';
    try {
        const fuente: Record<string, () => Promise<Map<number, any>>> = { entidad: entidades, etiqueta: etiquetas, cuenta: cuentas, catalogo, evento: eventos, campana: campanas, familia: familias };
        const mapa = await fuente[recurso]?.();
        const item = mapa?.get(n);
        const nombre = item?.nombreCompleto ?? item?.nombre ?? item?.nombreFamilia;
        return nombre ? `${nombre} (#${n})` : `#${n} (no encontrado)`;
    } catch {
        return `#${n}`;
    }
};

const ETIQUETAS_CAMPO: Record<string, string> = {
    id: 'ID', nombres: 'Nombres', apellidos: 'Apellidos', rut: 'RUT', telefono: 'Teléfono', correo: 'Correo', direccion: 'Dirección', comuna: 'Comuna', region: 'Región',
    genero: 'Género', fechaNacimiento: 'Fecha de nacimiento', ocupacion: 'Ocupación', sector: 'Sector', anotaciones: 'Anotaciones', gestorId: 'Gestor',
    razonSocial: 'Razón social', nombreFantasia: 'Nombre de fantasía', subtipoInstitucion: 'Subtipo', rubro: 'Rubro', nombre: 'Nombre', descripcion: 'Descripción',
    color: 'Color', etiquetaId: 'Etiqueta', entidadIds: 'Personas / instituciones', nombreFamilia: 'Familia', jefeHogarId: 'Jefe/a de hogar',
    puntosVulnerabilidad: 'Puntos de vulnerabilidad', justificacionVulnerabilidad: 'Justificación', familiaId: 'Familia', personaId: 'Persona', rolFamiliar: 'Rol familiar',
    observaciones: 'Observaciones', apoderadoId: 'Apoderado/a', parentesco: 'Parentesco', esContactoPrincipal: 'Contacto principal', fecha: 'Fecha', eventoId: 'Evento',
    personaIds: 'Personas', tipo: 'Tipo', columnaId: 'Columna', valor: 'Valor', plantilla: 'Plantilla', estado: 'Estado', campanaId: 'Campaña',
    beneficiarioIds: 'Beneficiarios', beneficiarioId: 'Beneficiario', padrinoId: 'Padrino / madrina', categoria: 'Categoría', unidadMedidaEstandar: 'Unidad',
    precioReferencia: 'Precio de referencia', saldoActual: 'Saldo inicial', origenEntidadId: 'Donante', monto: 'Monto', cuentaDestinoId: 'Cuenta destino',
    metodoTransferencia: 'Método', proposito: 'Propósito', items: 'Ítems', proveedorId: 'Proveedor', cuentaOrigenId: 'Cuenta origen',
    numeroFacturaBoleta: 'N° factura / boleta', montoNeto: 'Monto neto', montoIva: 'IVA', detalles: 'Detalle', tipoEgreso: 'Tipo de egreso',
    destinoEntidadId: 'Destino', montoTotal: 'Monto total', programa: 'Programa', solicitanteId: 'Solicitante', totalAsistentes: 'Asistentes registrados',
    totalParticipantes: 'Participantes', stockActual: 'Stock actual', tipoTransaccion: 'Tipo', jefeHogar: 'Jefe/a de hogar'
};
const etiquetaCampo = (campo: string) => ETIQUETAS_CAMPO[campo] ?? campo.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const CAMPOS_MONEDA = new Set(['monto', 'montoTotal', 'montoNeto', 'montoIva', 'precioReferencia', 'saldoActual', 'precio', 'precioUnitario']);

const textoValor = async (campo: string, valor: unknown): Promise<string | string[]> => {
    if (valor === null || valor === undefined || valor === '') return '—';
    const recurso = RESOLVER_POR_CAMPO[campo];
    if (Array.isArray(valor)) {
        if (recurso) return Promise.all(valor.map(v => nombreDe(recurso, v)));
        return Promise.all(valor.map(async item => {
            if (item && typeof item === 'object') {
                const partes = await Promise.all(Object.entries(item).filter(([, v]) => v !== null && v !== undefined && v !== '').map(async ([k, v]) => `${etiquetaCampo(k)}: ${await textoValor(k, v)}`));
                return partes.join(' · ');
            }
            return String(item);
        }));
    }
    if (recurso) return nombreDe(recurso, valor);
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (typeof valor === 'number' && CAMPOS_MONEDA.has(campo)) return clp.format(valor);
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
};

const rutReal = (rut?: string) => (rut && !/^(PERSONA|INST|SIN-RUT)(-\d+)?$/.test(rut) ? rut : '');
const hoy = () => new Date().toISOString().slice(0, 10);
const responsable = async () => (await resolveCurrentResponsible()).id;
const ids = (valor: unknown): number[] => (Array.isArray(valor) ? valor : [valor]).map(Number).filter(n => Number.isFinite(n) && n > 0);

const resumenPersona = (p: EntidadResumen) => ({
    nombre: p.nombreCompleto, rut: rutReal(p.rut), comuna: p.comuna, genero: p.genero, fechaNacimiento: p.fechaNacimiento, ocupacion: p.ocupacion,
    telefono: p.telefono, correo: p.correo, direccion: p.direccion, sector: p.sector, anotaciones: p.anotaciones
});

const detalleEvento = (id: number) => apiService.getAsistencia(id);
const detalleCampana = (id: number) => apiService.getCampana(id);

const asistenciaDe = async (eventoId: number, personaId: number) => {
    const asistente = (await detalleEvento(eventoId)).asistentes.find(a => a.personaId === personaId);
    if (!asistente) throw new Error(`La persona #${personaId} no está registrada en el evento #${eventoId}.`);
    return asistente;
};

const participanteDe = async (campanaId: number, beneficiarioId: number) => {
    const detalle = await detalleCampana(campanaId);
    const participante = detalle.participantes.find(p => p.beneficiario.id === beneficiarioId);
    if (!participante) throw new Error(`El beneficiario #${beneficiarioId} no participa en la campaña #${campanaId}.`);
    return { detalle, participante };
};

const CAMPOS_PERSONA = 'nombres, apellidos, telefono, rut, correo, direccion, comuna, region, genero, fechaNacimiento (YYYY-MM-DD), ocupacion, sector, anotaciones, gestorId';
const CAMPOS_INSTITUCION = 'razonSocial, rut, nombreFantasia, subtipoInstitucion, rubro, telefono, correo, direccion, comuna, region, sector, anotaciones, redSocial, gestorId';

// ---------- Catálogo de acciones ----------

const ACCIONES: DefAccion[] = [
    // Personas e instituciones
    {
        nombre: 'crear_persona', tipo: 'crear', descripcion: 'Registrar una persona natural nueva.',
        parametros: { nombres: 'texto', apellidos: 'texto', telefono: 'texto', otros: `opcionales: ${CAMPOS_PERSONA}` }, requeridos: ['nombres', 'apellidos'],
        titulo: p => `Nueva persona: ${p.nombres} ${p.apellidos}`,
        ejecutar: p => apiService.registrarPersonaNueva({ ...p, tipoEntidad: 'PersonaNatural', telefono: p.telefono ?? '', nombres: p.nombres, apellidos: p.apellidos })
    },
    {
        nombre: 'actualizar_persona', tipo: 'modificar', recurso: 'entidad', descripcion: 'Modificar datos de una persona. Envía sólo los campos que cambian.',
        parametros: { id: 'ID de la persona', otros: CAMPOS_PERSONA }, requeridos: ['id'],
        titulo: p => `Modificar persona #${p.id}`,
        previo: async p => resumenPersona(await apiService.getPersona(Number(p.id))),
        ejecutar: async p => {
            const actual = await apiService.getPersona(Number(p.id));
            const payload: ActualizarPersonaPayload = {
                id: actual.id, tipoEntidad: 'PersonaNatural', rut: rutReal(actual.rut), correo: actual.correo ?? '', telefono: actual.telefono ?? '', direccion: actual.direccion ?? '',
                comuna: actual.comuna ?? '', region: actual.region, nombres: actual.nombres, apellidos: actual.apellidos, genero: actual.genero, ocupacion: actual.ocupacion,
                redSocial: actual.redSocial, gestorId: actual.gestorId, anotaciones: actual.anotaciones, sector: actual.sector, fechaNacimiento: actual.fechaNacimiento
            };
            const { id: _id, ...cambios } = p;
            return apiService.actualizarEntidad(actual.id, { ...payload, ...cambios });
        }
    },
    {
        nombre: 'eliminar_persona', tipo: 'eliminar', recurso: 'entidad', descripcion: 'Eliminar una persona del sistema.',
        parametros: { id: 'ID de la persona' }, requeridos: ['id'],
        titulo: p => `Eliminar persona #${p.id}`,
        previo: async p => resumenPersona(await apiService.getPersona(Number(p.id))),
        advertencia: () => 'La ficha se eliminará del sistema y esta acción no se puede deshacer desde aquí.',
        ejecutar: p => apiService.eliminarPersona(Number(p.id))
    },
    {
        nombre: 'crear_institucion', tipo: 'crear', descripcion: 'Registrar una institución nueva.',
        parametros: { razonSocial: 'texto', rut: 'texto', otros: `opcionales: ${CAMPOS_INSTITUCION}` }, requeridos: ['razonSocial', 'rut'],
        titulo: p => `Nueva institución: ${p.nombreFantasia || p.razonSocial}`,
        ejecutar: p => apiService.registrarInstitucionNueva({ ...p, rut: p.rut, razonSocial: p.razonSocial })
    },
    {
        nombre: 'actualizar_institucion', tipo: 'modificar', recurso: 'entidad', descripcion: 'Modificar datos de una institución. Envía sólo los campos que cambian.',
        parametros: { id: 'ID de la institución', otros: CAMPOS_INSTITUCION }, requeridos: ['id'],
        titulo: p => `Modificar institución #${p.id}`,
        previo: async p => {
            const i = await apiService.getInstitucion(Number(p.id));
            return { razonSocial: i.razonSocial, nombreFantasia: i.nombreFantasia, rut: rutReal(i.rut), subtipoInstitucion: i.subtipoInstitucion, rubro: i.rubro, telefono: i.telefono, correo: i.correo, direccion: i.direccion, comuna: i.comuna, sector: i.sector, anotaciones: i.anotaciones };
        },
        ejecutar: async p => {
            const i = await apiService.getInstitucion(Number(p.id));
            const payload: ActualizarInstitucionPayload = {
                id: i.id, tipoEntidad: 'Institucion', rut: rutReal(i.rut), telefono: i.telefono, correo: i.correo, direccion: i.direccion, comuna: i.comuna, razonSocial: i.razonSocial,
                nombreFantasia: i.nombreFantasia, subtipoInstitucion: i.subtipoInstitucion, rubro: i.rubro, redSocial: i.redSocial, gestorId: i.gestorId, anotaciones: i.anotaciones, sector: i.sector
            };
            const { id: _id, ...cambios } = p;
            return apiService.actualizarEntidad(i.id, { ...payload, ...cambios });
        }
    },
    {
        nombre: 'eliminar_institucion', tipo: 'eliminar', recurso: 'entidad', descripcion: 'Eliminar una institución.',
        parametros: { id: 'ID de la institución' }, requeridos: ['id'],
        titulo: p => `Eliminar institución #${p.id}`,
        previo: async p => { const i = await apiService.getInstitucion(Number(p.id)); return { nombre: i.nombreCompleto, razonSocial: i.razonSocial, rut: rutReal(i.rut), rubro: i.rubro, comuna: i.comuna }; },
        advertencia: () => 'La institución se eliminará del sistema.',
        ejecutar: p => apiService.eliminarInstitucion(Number(p.id))
    },

    // Etiquetas
    {
        nombre: 'crear_etiqueta', tipo: 'crear', descripcion: 'Crear una etiqueta para clasificar personas.',
        parametros: { nombre: 'texto', descripcion: 'opcional', color: 'opcional, hex' }, requeridos: ['nombre'],
        titulo: p => `Nueva etiqueta «${p.nombre}»`,
        ejecutar: p => apiService.crearEtiqueta({ nombre: p.nombre, descripcion: p.descripcion, color: p.color })
    },
    {
        nombre: 'eliminar_etiqueta', tipo: 'eliminar', recurso: 'etiqueta', descripcion: 'Eliminar una etiqueta.',
        parametros: { id: 'ID de la etiqueta' }, requeridos: ['id'],
        titulo: p => `Eliminar etiqueta #${p.id}`,
        previo: async p => { const e = (await etiquetas()).get(Number(p.id)); return e ? { nombre: e.nombre, descripcion: e.descripcion } : null; },
        advertencia: () => 'Se quitará de todas las personas que la tengan asignada.',
        ejecutar: p => apiService.eliminarEtiqueta(Number(p.id))
    },
    {
        nombre: 'asignar_etiqueta', tipo: 'modificar', descripcion: 'Asignar una etiqueta a una o varias personas/instituciones.',
        parametros: { etiquetaId: 'ID', entidadIds: 'lista de IDs' }, requeridos: ['etiquetaId', 'entidadIds'],
        titulo: p => `Asignar etiqueta a ${ids(p.entidadIds).length} persona(s)`,
        ejecutar: p => apiService.asignarEtiquetaMasiva(Number(p.etiquetaId), ids(p.entidadIds))
    },
    {
        nombre: 'quitar_etiqueta', tipo: 'eliminar', descripcion: 'Quitar una etiqueta a una o varias personas/instituciones.',
        parametros: { etiquetaId: 'ID', entidadIds: 'lista de IDs' }, requeridos: ['etiquetaId', 'entidadIds'],
        titulo: p => `Quitar etiqueta a ${ids(p.entidadIds).length} persona(s)`,
        ejecutar: p => apiService.quitarEtiquetaMasiva(Number(p.etiquetaId), ids(p.entidadIds))
    },

    // Familias y apoderados
    {
        nombre: 'crear_familia', tipo: 'crear', descripcion: 'Crear un grupo familiar.',
        parametros: { nombreFamilia: 'texto', jefeHogarId: 'ID persona', puntosVulnerabilidad: 'número, opcional', justificacionVulnerabilidad: 'opcional' }, requeridos: ['nombreFamilia', 'jefeHogarId'],
        titulo: p => `Nueva familia «${p.nombreFamilia}»`,
        ejecutar: p => apiService.crearFamilia({ nombreFamilia: p.nombreFamilia, jefeHogarId: Number(p.jefeHogarId), puntosVulnerabilidad: Number(p.puntosVulnerabilidad ?? 0), justificacionVulnerabilidad: p.justificacionVulnerabilidad })
    },
    {
        nombre: 'actualizar_familia', tipo: 'modificar', recurso: 'familia', descripcion: 'Modificar un grupo familiar.',
        parametros: { id: 'ID familia', otros: 'nombreFamilia, jefeHogarId, puntosVulnerabilidad, justificacionVulnerabilidad' }, requeridos: ['id'],
        titulo: p => `Modificar familia #${p.id}`,
        previo: async p => { const f = (await familias()).get(Number(p.id)); return f ? { nombreFamilia: f.nombreFamilia, jefeHogarId: f.jefeHogarId, puntosVulnerabilidad: f.puntosVulnerabilidad, justificacionVulnerabilidad: f.justificacionVulnerabilidad } : null; },
        ejecutar: async p => {
            const f = (await familias()).get(Number(p.id));
            if (!f) throw new Error(`No existe la familia #${p.id}.`);
            return apiService.actualizarFamilia(f.id, { nombreFamilia: p.nombreFamilia ?? f.nombreFamilia, jefeHogarId: Number(p.jefeHogarId ?? f.jefeHogarId), puntosVulnerabilidad: Number(p.puntosVulnerabilidad ?? f.puntosVulnerabilidad), justificacionVulnerabilidad: p.justificacionVulnerabilidad ?? f.justificacionVulnerabilidad });
        }
    },
    {
        nombre: 'agregar_integrante_familia', tipo: 'crear', descripcion: 'Agregar una persona a una familia (o actualizar su rol si ya está).',
        parametros: { familiaId: 'ID', personaId: 'ID', rolFamiliar: 'opcional', observaciones: 'opcional' }, requeridos: ['familiaId', 'personaId'],
        titulo: () => 'Agregar integrante a familia',
        ejecutar: async p => {
            const ya = (await apiService.getBeneficiariosFamilia(Number(p.familiaId))).some(b => b.personaId === Number(p.personaId));
            return ya
                ? apiService.actualizarBeneficiarioFamilia(Number(p.familiaId), Number(p.personaId), p.rolFamiliar, p.observaciones)
                : apiService.agregarBeneficiarioFamilia(Number(p.familiaId), Number(p.personaId), p.rolFamiliar, p.observaciones);
        }
    },
    {
        nombre: 'quitar_integrante_familia', tipo: 'eliminar', descripcion: 'Quitar una persona de una familia (la persona sigue registrada).',
        parametros: { familiaId: 'ID', personaId: 'ID' }, requeridos: ['familiaId', 'personaId'],
        titulo: () => 'Quitar integrante de familia',
        ejecutar: p => apiService.quitarBeneficiarioFamilia(Number(p.familiaId), Number(p.personaId))
    },
    {
        nombre: 'asignar_apoderado', tipo: 'crear', descripcion: 'Vincular un apoderado/a a una persona a cargo (por ejemplo un niño).',
        parametros: { personaId: 'ID de la persona a cargo', apoderadoId: 'ID del apoderado', parentesco: 'texto', esContactoPrincipal: 'booleano', observaciones: 'opcional' }, requeridos: ['personaId', 'apoderadoId'],
        titulo: () => 'Vincular apoderado/a',
        ejecutar: p => apiService.guardarApoderado(Number(p.personaId), Number(p.apoderadoId), { parentesco: p.parentesco ?? '', esContactoPrincipal: Boolean(p.esContactoPrincipal), observaciones: p.observaciones ?? '' })
    },
    {
        nombre: 'quitar_apoderado', tipo: 'eliminar', descripcion: 'Quitar el vínculo entre un apoderado y una persona a cargo.',
        parametros: { personaId: 'ID', apoderadoId: 'ID' }, requeridos: ['personaId', 'apoderadoId'],
        titulo: () => 'Quitar vínculo de apoderado/a',
        ejecutar: p => apiService.quitarApoderado(Number(p.personaId), Number(p.apoderadoId))
    },

    // Asistencia
    {
        nombre: 'crear_evento', tipo: 'crear', descripcion: 'Crear un evento de asistencia.',
        parametros: { nombre: 'texto', fecha: 'YYYY-MM-DD', descripcion: 'opcional' }, requeridos: ['nombre', 'fecha'],
        titulo: p => `Nuevo evento «${p.nombre}»`,
        ejecutar: p => apiService.crearEventoAsistencia({ nombre: p.nombre, fecha: p.fecha, descripcion: p.descripcion ?? '' })
    },
    {
        nombre: 'eliminar_evento', tipo: 'eliminar', recurso: 'evento', descripcion: 'Eliminar un evento con toda su asistencia.',
        parametros: { id: 'ID evento' }, requeridos: ['id'],
        titulo: p => `Eliminar evento #${p.id}`,
        previo: async p => { const e = (await eventos()).get(Number(p.id)); return e ? { nombre: e.nombre, fecha: e.fecha, descripcion: e.descripcion, totalAsistentes: e.totalAsistentes } : null; },
        advertencia: (_p, previo) => `También se borrará el registro de ${previo?.totalAsistentes ?? 'todos los'} asistentes de este evento.`,
        ejecutar: p => apiService.eliminarEventoAsistencia(Number(p.id))
    },
    {
        nombre: 'agregar_asistentes', tipo: 'crear', descripcion: 'Registrar la asistencia de una o varias personas en un evento.',
        parametros: { eventoId: 'ID', personaIds: 'lista de IDs' }, requeridos: ['eventoId', 'personaIds'],
        titulo: p => `Registrar ${ids(p.personaIds).length} asistente(s)`,
        ejecutar: async p => { for (const id of ids(p.personaIds)) await apiService.agregarAsistente(Number(p.eventoId), id); }
    },
    {
        nombre: 'quitar_asistentes', tipo: 'eliminar', descripcion: 'Quitar a una o varias personas de la asistencia de un evento.',
        parametros: { eventoId: 'ID', personaIds: 'lista de IDs de persona' }, requeridos: ['eventoId', 'personaIds'],
        titulo: p => `Quitar ${ids(p.personaIds).length} asistente(s)`,
        ejecutar: async p => { for (const id of ids(p.personaIds)) await apiService.quitarAsistente(Number(p.eventoId), (await asistenciaDe(Number(p.eventoId), id)).id); }
    },
    {
        nombre: 'crear_columna_evento', tipo: 'crear', descripcion: 'Agregar una columna de seguimiento a un evento.',
        parametros: { eventoId: 'ID', nombre: 'texto', tipo: "'boolean' | 'text' | 'number'" }, requeridos: ['eventoId', 'nombre', 'tipo'],
        titulo: p => `Nueva columna «${p.nombre}» en evento`,
        ejecutar: p => apiService.crearColumnaAsistencia(Number(p.eventoId), { nombre: p.nombre, tipo: p.tipo as TipoColumnaAsistencia })
    },
    {
        nombre: 'eliminar_columna_evento', tipo: 'eliminar', descripcion: 'Eliminar una columna de un evento y sus valores.',
        parametros: { eventoId: 'ID', columnaId: 'ID (ver buscar detalle_evento)' }, requeridos: ['eventoId', 'columnaId'],
        titulo: () => 'Eliminar columna de evento',
        previo: async p => { const c = (await detalleEvento(Number(p.eventoId))).columnas.find(c => c.id === Number(p.columnaId)); return c ? { nombre: c.nombre, tipo: c.tipo } : null; },
        advertencia: () => 'Se borrarán los valores de esta columna para todos los asistentes.',
        ejecutar: p => apiService.eliminarColumnaAsistencia(Number(p.eventoId), Number(p.columnaId))
    },
    {
        nombre: 'registrar_valor_asistencia', tipo: 'modificar', descripcion: 'Guardar el valor de una columna para un asistente.',
        parametros: { eventoId: 'ID', personaId: 'ID', columnaId: 'ID', valor: 'booleano, texto o número' }, requeridos: ['eventoId', 'personaId', 'columnaId'],
        titulo: () => 'Actualizar dato de asistencia',
        previo: async p => { const a = await asistenciaDe(Number(p.eventoId), Number(p.personaId)); return { nombre: a.nombreCompleto, valor: a.valores[String(p.columnaId)]?.valor ?? null }; },
        ejecutar: async p => {
            const a = await asistenciaDe(Number(p.eventoId), Number(p.personaId));
            return apiService.guardarValorAsistencia(Number(p.eventoId), a.id, Number(p.columnaId), { valor: (p.valor ?? null) as DatoAsistencia, version: a.valores[String(p.columnaId)]?.version ?? 0 });
        }
    },

    // Campañas
    {
        nombre: 'crear_campana', tipo: 'crear', descripcion: 'Crear una campaña.',
        parametros: { nombre: 'texto', fecha: 'YYYY-MM-DD', descripcion: 'opcional', plantilla: "'apadrinamiento' | 'personalizada'" }, requeridos: ['nombre', 'fecha'],
        titulo: p => `Nueva campaña «${p.nombre}»`,
        ejecutar: p => apiService.crearCampana({ nombre: p.nombre, fecha: p.fecha, descripcion: p.descripcion ?? '', plantilla: p.plantilla === 'personalizada' ? 'personalizada' : 'apadrinamiento' })
    },
    {
        nombre: 'cambiar_estado_campana', tipo: 'modificar', recurso: 'campana', descripcion: 'Cambiar el estado de una campaña.',
        parametros: { id: 'ID campaña', estado: "'borrador' | 'activa' | 'cerrada'" }, requeridos: ['id', 'estado'],
        titulo: p => `Cambiar estado de campaña #${p.id}`,
        previo: async p => { const c = (await campanas()).get(Number(p.id)); return c ? { nombre: c.nombre, estado: c.estado } : null; },
        ejecutar: async p => { const c = (await detalleCampana(Number(p.id))).campana; return apiService.cambiarEstadoCampana(c.id, p.estado, c.version); }
    },
    {
        nombre: 'agregar_participantes_campana', tipo: 'crear', descripcion: 'Agregar beneficiarios a una campaña.',
        parametros: { campanaId: 'ID', beneficiarioIds: 'lista de IDs' }, requeridos: ['campanaId', 'beneficiarioIds'],
        titulo: p => `Agregar ${ids(p.beneficiarioIds).length} beneficiario(s) a campaña`,
        ejecutar: async p => { for (const id of ids(p.beneficiarioIds)) await apiService.agregarParticipanteCampana(Number(p.campanaId), id); }
    },
    {
        nombre: 'quitar_participantes_campana', tipo: 'eliminar', descripcion: 'Retirar beneficiarios de una campaña (se borra su seguimiento en esa campaña).',
        parametros: { campanaId: 'ID', beneficiarioIds: 'lista de IDs' }, requeridos: ['campanaId', 'beneficiarioIds'],
        titulo: p => `Retirar ${ids(p.beneficiarioIds).length} beneficiario(s) de campaña`,
        advertencia: () => 'Se borrará su seguimiento en esta campaña; las personas siguen registradas.',
        ejecutar: async p => { for (const id of ids(p.beneficiarioIds)) await apiService.quitarParticipanteCampana(Number(p.campanaId), (await participanteDe(Number(p.campanaId), id)).participante.id); }
    },
    {
        nombre: 'asignar_padrino', tipo: 'modificar', descripcion: 'Asignar (o quitar con padrinoId null) el padrino/madrina de un beneficiario en una campaña.',
        parametros: { campanaId: 'ID', beneficiarioId: 'ID', padrinoId: 'ID o null' }, requeridos: ['campanaId', 'beneficiarioId'],
        titulo: () => 'Asignar padrino / madrina',
        previo: async p => { const { participante } = await participanteDe(Number(p.campanaId), Number(p.beneficiarioId)); return { beneficiario: participante.beneficiario.nombreCompleto, padrinoId: participante.padrino?.id ?? null }; },
        ejecutar: async p => {
            const { participante } = await participanteDe(Number(p.campanaId), Number(p.beneficiarioId));
            return apiService.asignarPadrino(Number(p.campanaId), participante.id, p.padrinoId ? Number(p.padrinoId) : null, participante.version);
        }
    },
    {
        nombre: 'crear_columna_campana', tipo: 'crear', descripcion: 'Agregar una columna de seguimiento a una campaña.',
        parametros: { campanaId: 'ID', nombre: 'texto', tipo: "'boolean' | 'text' | 'number' | 'whatsapp'" }, requeridos: ['campanaId', 'nombre', 'tipo'],
        titulo: p => `Nueva columna «${p.nombre}» en campaña`,
        ejecutar: p => apiService.crearColumnaCampana(Number(p.campanaId), { nombre: p.nombre, tipo: p.tipo as TipoColumnaCampana })
    },
    {
        nombre: 'registrar_valor_campana', tipo: 'modificar', descripcion: 'Guardar el valor de una columna (no WhatsApp) para un beneficiario de campaña.',
        parametros: { campanaId: 'ID', beneficiarioId: 'ID', columnaId: 'ID', valor: 'booleano, texto o número' }, requeridos: ['campanaId', 'beneficiarioId', 'columnaId'],
        titulo: () => 'Actualizar seguimiento de campaña',
        previo: async p => { const { participante } = await participanteDe(Number(p.campanaId), Number(p.beneficiarioId)); return { beneficiario: participante.beneficiario.nombreCompleto, valor: (participante.valores[String(p.columnaId)]?.valor as DatoAsistencia) ?? null }; },
        ejecutar: async p => {
            const { detalle, participante } = await participanteDe(Number(p.campanaId), Number(p.beneficiarioId));
            const columna = detalle.columnas.find(c => c.id === Number(p.columnaId));
            if (!columna) throw new Error('La columna no existe en esta campaña.');
            if (columna.tipo === 'whatsapp') throw new Error('Los mensajes de WhatsApp se gestionan desde la pantalla de Campañas.');
            return apiService.guardarValorCampana(Number(p.campanaId), participante.id, columna.id, { valor: (p.valor ?? null) as DatoAsistencia, version: participante.valores[String(columna.id)]?.version ?? 0, columnaVersion: columna.version });
        }
    },

    // Catálogo y cuentas
    {
        nombre: 'crear_item_catalogo', tipo: 'crear', descripcion: 'Crear un ítem del catálogo.',
        parametros: { nombre: 'texto', categoria: 'texto', unidadMedidaEstandar: 'texto (ej: unidad, kg)', precioReferencia: 'número' }, requeridos: ['nombre', 'categoria', 'unidadMedidaEstandar'],
        titulo: p => `Nuevo ítem «${p.nombre}»`,
        ejecutar: p => apiService.registrarItemCatalogo({ nombre: p.nombre, categoria: p.categoria, unidadMedidaEstandar: p.unidadMedidaEstandar, precioReferencia: Number(p.precioReferencia ?? 0) })
    },
    {
        nombre: 'actualizar_item_catalogo', tipo: 'modificar', recurso: 'catalogo', descripcion: 'Modificar un ítem del catálogo.',
        parametros: { id: 'ID', otros: 'nombre, categoria, unidadMedidaEstandar, precioReferencia' }, requeridos: ['id'],
        titulo: p => `Modificar ítem #${p.id}`,
        previo: async p => { const c = (await catalogo()).get(Number(p.id)); return c ? { nombre: c.nombre, categoria: c.categoria, unidadMedidaEstandar: c.unidadMedidaEstandar, precioReferencia: c.precioReferencia } : null; },
        ejecutar: async p => {
            const c = (await catalogo()).get(Number(p.id));
            if (!c) throw new Error(`No existe el ítem #${p.id}.`);
            return apiService.actualizarItemCatalogo({ id: c.id, nombre: p.nombre ?? c.nombre, categoria: p.categoria ?? c.categoria, unidadMedidaEstandar: p.unidadMedidaEstandar ?? c.unidadMedidaEstandar, precioReferencia: Number(p.precioReferencia ?? c.precioReferencia) });
        }
    },
    {
        nombre: 'crear_cuenta', tipo: 'crear', descripcion: 'Crear una cuenta o fondo interno.',
        parametros: { nombre: 'texto', descripcion: 'opcional', saldoActual: 'número, opcional' }, requeridos: ['nombre'],
        titulo: p => `Nueva cuenta «${p.nombre}»`,
        ejecutar: p => apiService.crearCuenta({ nombre: p.nombre, descripcion: p.descripcion, saldoActual: p.saldoActual === undefined ? undefined : Number(p.saldoActual) })
    },
    {
        nombre: 'actualizar_cuenta', tipo: 'modificar', recurso: 'cuenta', descripcion: 'Renombrar o describir una cuenta.',
        parametros: { id: 'ID', nombre: 'opcional', descripcion: 'opcional' }, requeridos: ['id'],
        titulo: p => `Modificar cuenta #${p.id}`,
        previo: async p => { const c = (await cuentas()).get(Number(p.id)); return c ? { nombre: c.nombre, descripcion: c.descripcion } : null; },
        ejecutar: async p => {
            const c = (await cuentas()).get(Number(p.id));
            if (!c) throw new Error(`No existe la cuenta #${p.id}.`);
            return apiService.actualizarCuenta(c.id, { id: c.id, nombre: p.nombre ?? c.nombre, descripcion: p.descripcion ?? c.descripcion });
        }
    },

    // Ingresos
    {
        nombre: 'registrar_donacion_dinero', tipo: 'crear', descripcion: 'Registrar una donación en dinero. El responsable interno es el administrador actual.',
        parametros: { origenEntidadId: 'ID donante', monto: 'número CLP', fecha: 'YYYY-MM-DD', cuentaDestinoId: 'ID cuenta', metodoTransferencia: "'Transferencia' | 'Efectivo' | 'Cheque'", proposito: 'opcional', anotaciones: 'opcional', gestorId: 'opcional' },
        requeridos: ['origenEntidadId', 'monto', 'cuentaDestinoId', 'metodoTransferencia'],
        titulo: p => `Donación de ${clp.format(Number(p.monto))}`,
        ejecutar: async p => apiService.registrarDonacion({
            ingreso: { origenEntidadId: Number(p.origenEntidadId), responsableInternoId: await responsable(), montoTotal: Number(p.monto), tipoTransaccion: 'Donacion', estado: 'Cerrado', fecha: p.fecha ?? hoy(), anotaciones: p.anotaciones },
            donacion: { propositoEspecifico: p.proposito || 'Donación registrada', gestorId: p.gestorId ? Number(p.gestorId) : undefined },
            pecuniario: { cuentaDestinoId: Number(p.cuentaDestinoId), metodoTransferencia: p.metodoTransferencia }
        })
    },
    {
        nombre: 'registrar_donacion_bienes', tipo: 'crear', descripcion: 'Registrar una donación en especie. Cada ítem: itemCatalogoId (si existe) o nombre+categoria+unidad para crear uno nuevo, cantidad y precio unitario.',
        parametros: { origenEntidadId: 'ID donante', fecha: 'YYYY-MM-DD', items: 'lista [{itemCatalogoId?, nombre, categoria, unidad, cantidad, precio}]', proposito: 'opcional', anotaciones: 'opcional' },
        requeridos: ['origenEntidadId', 'items'],
        titulo: p => `Donación en especie (${(p.items ?? []).length} ítems)`,
        ejecutar: async p => {
            const cat = await catalogo();
            const items = (p.items as any[]).map(i => {
                const c = i.itemCatalogoId ? cat.get(Number(i.itemCatalogoId)) : undefined;
                return { itemCatalogoId: c?.id, nombre: i.nombre ?? c?.nombre ?? '', categoria: i.categoria ?? c?.categoria ?? '', unidad: i.unidad ?? c?.unidadMedidaEstandar ?? 'unidad', cantidad: Number(i.cantidad), precio: Number(i.precio ?? c?.precioReferencia ?? 0) };
            });
            return apiService.registrarDonacionBienes({
                ingreso: { origenEntidadId: Number(p.origenEntidadId), responsableInternoId: await responsable(), montoTotal: items.reduce((a, i) => a + i.cantidad * i.precio, 0), tipoTransaccion: 'Donacion', estado: 'Cerrado', fecha: p.fecha ?? hoy(), anotaciones: p.anotaciones },
                donacion: { propositoEspecifico: p.proposito || 'Donación en especie' },
                items
            });
        }
    },
    {
        nombre: 'registrar_compra', tipo: 'crear', descripcion: 'Registrar una compra a un proveedor con sus ítems del catálogo.',
        parametros: { proveedorId: 'ID entidad', fecha: 'YYYY-MM-DD', cuentaOrigenId: 'ID cuenta', numeroFacturaBoleta: 'opcional', montoNeto: 'opcional', montoIva: 'opcional', detalles: 'lista [{itemCatalogoId, cantidad, precioUnitario}]' },
        requeridos: ['proveedorId', 'cuentaOrigenId', 'detalles'],
        titulo: p => `Compra con ${(p.detalles ?? []).length} ítem(s)`,
        ejecutar: async p => {
            const detalles = (p.detalles as any[]).map(d => ({ itemCatalogoId: Number(d.itemCatalogoId), cantidad: Number(d.cantidad), precioUnitarioIngreso: Number(d.precioUnitario ?? d.precioUnitarioIngreso) }));
            const total = detalles.reduce((a, d) => a + d.cantidad * d.precioUnitarioIngreso, 0);
            return apiService.registrarCompra({
                ingreso: { origenEntidadId: Number(p.proveedorId), responsableInternoId: await responsable(), fecha: p.fecha ?? hoy(), montoTotal: total, tipoTransaccion: 'Compra', estado: 'Cerrado' },
                compra: { ingresoId: 0, cuentaOrigenId: Number(p.cuentaOrigenId), numeroFacturaBoleta: p.numeroFacturaBoleta || `F-${Date.now()}`, montoNeto: Number(p.montoNeto ?? 0), montoIva: Number(p.montoIva ?? 0) },
                detalles
            });
        }
    },
    {
        nombre: 'anular_ingreso', tipo: 'eliminar', recurso: 'ingreso', descripcion: 'Anular un ingreso (donación o compra).',
        parametros: { id: 'ID ingreso' }, requeridos: ['id'],
        titulo: p => `Anular ingreso #${p.id}`,
        previo: async p => { const i = (await apiService.getIngresoById(Number(p.id))).ingreso; return { fecha: i.fecha, tipoTransaccion: i.tipoTransaccion, montoTotal: i.montoTotal, origenEntidadId: i.origenEntidadId, estado: i.estado, anotaciones: i.anotaciones }; },
        advertencia: () => 'El ingreso quedará anulado y se revertirá su efecto en stock o saldos.',
        ejecutar: p => apiService.anularIngreso(Number(p.id))
    },

    // Egresos
    {
        nombre: 'registrar_egreso', tipo: 'crear', descripcion: "Registrar un egreso: 'Ayuda Social', 'Consumo Interno' o 'Ajuste'. Con ítems del catálogo (detalles) o en dinero (montoTotal + cuentaOrigenId + metodoTransferencia).",
        parametros: { tipoEgreso: 'texto', destinoEntidadId: 'ID', fecha: 'YYYY-MM-DD', detalles: 'opcional [{itemCatalogoId, cantidad}]', montoTotal: 'número si es en dinero', cuentaOrigenId: 'opcional', metodoTransferencia: 'opcional', proposito: 'opcional', anotaciones: 'opcional' },
        requeridos: ['tipoEgreso', 'destinoEntidadId'],
        titulo: p => `Nuevo egreso: ${p.tipoEgreso}`,
        ejecutar: async p => {
            const cat = await catalogo();
            const detalles = ((p.detalles ?? []) as any[]).map(d => ({ itemCatalogoId: Number(d.itemCatalogoId), cantidad: Number(d.cantidad), precioUnitarioPpp: cat.get(Number(d.itemCatalogoId))?.precioPromedioPonderado ?? 0 }));
            const payload: EgresoPayload = {
                egreso: {
                    fecha: p.fecha ?? hoy(), tipoEgreso: p.tipoEgreso, destinoEntidadId: Number(p.destinoEntidadId), responsableInternoId: await responsable(),
                    montoTotal: p.montoTotal !== undefined ? Number(p.montoTotal) : detalles.reduce((a, d) => a + d.cantidad * d.precioUnitarioPpp, 0),
                    anotaciones: p.anotaciones, propositoEspecifico: p.proposito
                }
            };
            if (detalles.length) payload.detalles = detalles;
            if (p.cuentaOrigenId) payload.pecuniario = { cuentaOrigenId: Number(p.cuentaOrigenId), metodoTransferencia: p.metodoTransferencia ?? 'Transferencia' };
            return apiService.crearEgreso(payload);
        }
    },
    {
        nombre: 'actualizar_egreso', tipo: 'modificar', recurso: 'egreso', descripcion: 'Modificar datos generales de un egreso.',
        parametros: { id: 'ID', otros: 'fecha, montoTotal, destinoEntidadId, anotaciones, proposito' }, requeridos: ['id'],
        titulo: p => `Modificar egreso #${p.id}`,
        previo: async p => { const e = await apiService.getEgresoById(Number(p.id)); return { fecha: e.fecha, tipoEgreso: e.tipoEgreso, montoTotal: e.montoTotal, destinoEntidadId: e.destinoEntidadId, anotaciones: e.anotaciones, proposito: e.propositoEspecifico }; },
        ejecutar: async p => {
            const e = await apiService.getEgresoById(Number(p.id));
            return apiService.actualizarEgreso(e.id, {
                egreso: { fecha: p.fecha ?? e.fecha, tipoEgreso: e.tipoEgreso, montoTotal: Number(p.montoTotal ?? e.montoTotal), responsableInternoId: e.responsableInternoId, destinoEntidadId: Number(p.destinoEntidadId ?? e.destinoEntidadId), anotaciones: p.anotaciones ?? e.anotaciones, propositoEspecifico: p.proposito ?? e.propositoEspecifico },
                pecuniario: e.egresoPecuniario ?? undefined,
                detalles: e.detalleEgresoRecurso.length ? e.detalleEgresoRecurso : undefined
            });
        }
    },
    {
        nombre: 'anular_egreso', tipo: 'eliminar', recurso: 'egreso', descripcion: 'Anular un egreso (queda en el historial como anulado).',
        parametros: { id: 'ID' }, requeridos: ['id'],
        titulo: p => `Anular egreso #${p.id}`,
        previo: async p => { const e = await apiService.getEgresoById(Number(p.id)); return { fecha: e.fecha, tipoEgreso: e.tipoEgreso, montoTotal: e.montoTotal, destinoEntidadId: e.destinoEntidadId, estado: e.estado, proposito: e.propositoEspecifico }; },
        advertencia: () => 'El egreso quedará anulado y se revertirá su efecto en stock o saldos.',
        ejecutar: p => apiService.anularEgreso(Number(p.id))
    },
    {
        nombre: 'eliminar_egreso', tipo: 'eliminar', recurso: 'egreso', descripcion: 'Eliminar definitivamente un egreso. Prefiere anular_egreso salvo que pidan eliminar.',
        parametros: { id: 'ID' }, requeridos: ['id'],
        titulo: p => `Eliminar egreso #${p.id}`,
        previo: async p => { const e = await apiService.getEgresoById(Number(p.id)); return { fecha: e.fecha, tipoEgreso: e.tipoEgreso, montoTotal: e.montoTotal, destinoEntidadId: e.destinoEntidadId, estado: e.estado, proposito: e.propositoEspecifico }; },
        advertencia: () => 'Se eliminará definitivamente, sin dejar registro de anulación.',
        ejecutar: p => apiService.eliminarEgreso(Number(p.id))
    },

    // Solicitudes
    {
        nombre: 'crear_solicitud', tipo: 'crear', descripcion: 'Crear una solicitud de recursos para un programa.',
        parametros: { programa: 'texto', items: 'lista [{itemCatalogoId? , descripcionManual?, cantidad}]', solicitanteId: 'opcional, por defecto el administrador actual' }, requeridos: ['programa', 'items'],
        titulo: p => `Nueva solicitud para «${p.programa}»`,
        ejecutar: async p => apiService.crearSolicitud({
            solicitud: { id: 0, solicitanteId: p.solicitanteId ? Number(p.solicitanteId) : await responsable(), programa: p.programa, fechaSolicitud: hoy(), estado: 'Pendiente', autorizadorId: null },
            items: (p.items as any[]).map(i => ({ id: 0, solicitudId: null, itemCatalogoId: i.itemCatalogoId ? Number(i.itemCatalogoId) : null, descripcionManual: i.descripcionManual ?? null, cantidadRequerida: Number(i.cantidad ?? i.cantidadRequerida ?? 1), cantidadEntregada: null }))
        })
    }
];

export const NOMBRES_ACCIONES = ACCIONES.map(a => a.nombre);

export const catalogoAccionesPrompt = () =>
    ACCIONES.map(a => `- ${a.nombre} [${a.tipo}]: ${a.descripcion} Parámetros: ${Object.entries(a.parametros).map(([k, v]) => `${k}${a.requeridos.includes(k) ? '*' : ''} (${v})`).join(', ')}`).join('\n');

export interface OperacionPropuesta { accion: string; parametros: Params }

const definicion = (nombre: string) => {
    const def = ACCIONES.find(a => a.nombre === nombre);
    if (!def) throw new Error(`Acción desconocida: ${nombre}`);
    return def;
};

export const validarOperaciones = (operaciones: OperacionPropuesta[]) => {
    if (!Array.isArray(operaciones) || !operaciones.length) throw new Error('No se indicaron acciones.');
    if (operaciones.length > 50) throw new Error('Máximo 50 acciones por confirmación; divide la tarea.');
    operaciones.forEach((op, i) => {
        const def = definicion(op.accion);
        const faltan = def.requeridos.filter(r => op.parametros?.[r] === undefined || op.parametros?.[r] === null || op.parametros?.[r] === '');
        if (faltan.length) throw new Error(`Acción ${i + 1} (${op.accion}): faltan parámetros ${faltan.join(', ')}.`);
    });
};

// Construye la vista que verá el administrador antes de confirmar.
export const construirVista = async (op: OperacionPropuesta): Promise<OperacionVista> => {
    const def = definicion(op.accion);
    const p = op.parametros ?? {};
    let previo: Record<string, unknown> | null = null;
    let advertenciaPrevio: string | undefined;
    if (def.previo) {
        try { previo = await def.previo(p); } catch (e) { advertenciaPrevio = `No se pudo leer el registro actual: ${e instanceof Error ? e.message : e}`; }
    }

    let titulo = def.titulo(p);
    if (def.recurso && p.id !== undefined) titulo = `${titulo.replace(/#\d+$/, '').trim()} ${await nombreDe(def.recurso, p.id)}`;

    const campos: CampoVista[] = [];
    if (def.tipo === 'eliminar' && previo) {
        for (const [k, v] of Object.entries(previo)) {
            if (v === null || v === undefined || v === '') continue;
            campos.push({ etiqueta: etiquetaCampo(k), antes: await textoValor(k, v) });
        }
        for (const [k, v] of Object.entries(p)) {
            if (k === 'id' || (k in previo)) continue;
            campos.push({ etiqueta: etiquetaCampo(k), antes: await textoValor(k, v) });
        }
    } else if (def.tipo === 'modificar' && previo) {
        for (const [k, v] of Object.entries(p)) {
            if (k === 'id' || k === 'columnaId') continue;
            campos.push({ etiqueta: etiquetaCampo(k), antes: k in previo ? await textoValor(k, previo[k]) : undefined, despues: await textoValor(k, v) });
        }
        const contexto = previo.nombre ?? previo.beneficiario;
        if (contexto) campos.unshift({ etiqueta: 'Registro', despues: String(contexto) });
    } else {
        for (const [k, v] of Object.entries(p)) {
            if (v === null || v === undefined || v === '') continue;
            campos.push({ etiqueta: etiquetaCampo(k), [def.tipo === 'eliminar' ? 'antes' : 'despues']: await textoValor(k, v) });
        }
    }

    return {
        accion: def.nombre,
        tipo: def.tipo,
        titulo,
        campos,
        advertencia: [def.advertencia?.(p, previo), advertenciaPrevio].filter(Boolean).join(' ') || undefined
    };
};

export const ejecutarOperacion = async (op: OperacionPropuesta) => {
    const resultado: any = await definicion(op.accion).ejecutar(op.parametros ?? {});
    memo.clear();
    const id = resultado?.id ?? resultado?.id_ingreso;
    return id ? `Listo (ID ${id})` : (resultado?.mensaje || 'Listo');
};
