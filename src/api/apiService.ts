import type {
    EntidadResumen,
    RegistroPersonaPayload,
    RegistrarInstitucionPayload,
    ActualizarEntidadPayload,
    RegistrarPersonaPayload,
    DonacionPayload,
    CatalogoItem,
    DonacionBienesPayload,
    RegistrarCatalogoPayload,
    ActualizarCatalogoPayload,
    Cuenta,
    CuentaPayload,
    CuentaMovimientosResponse,
    Familia,
    CrearFamiliaPayload,
    BeneficiarioFamilia,
    EgresoAyudaSocialPayload,
    EgresoConsumoInternoPayload,
    SolicitudPayload,
    RolPersona
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://api.familiarenacer.cl/api';

const buildErrorMessage = (data: any, fallback: string) => {
    if (!data) return fallback;
    if (typeof data === 'string') return data || fallback;
    return data?.mensaje || data?.error || fallback;
};

const requestJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const response = await fetch(input, init);
    const raw = await response.text();
    let data: any = null;

    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch {
            data = raw;
        }
    }

    if (!response.ok) {
        throw new Error(buildErrorMessage(data, response.statusText || 'Error al comunicarse con la API'));
    }

    return data as T;
};

const normalizeRut = (value?: string | null, fallbackPrefix = 'SIN-RUT', id?: number) => {
    const rut = value || undefined;
    if (rut) return rut;
    return id ? `${fallbackPrefix}-${id}` : fallbackPrefix;
};

const buildNombreCompleto = (nombres?: string | null, apellidos?: string | null, fallback = 'Sin nombre') => {
    const full = `${nombres ?? ''} ${apellidos ?? ''}`.trim();
    return full || fallback;
};

const mapPersona = (persona: any): EntidadResumen => {
    const rut = normalizeRut(persona?.rut ?? persona?.identificador, 'PERSONA', persona?.id);
    const nombreCompleto = persona?.nombreCompleto ?? buildNombreCompleto(persona?.nombres, persona?.apellidos, rut);
    return {
        id: persona?.id ?? 0,
        tipoEntidad: 'Persona',
        tipo: 'PERSONA',
        identificador: rut,
        rut,
        nombreCompleto,
        nombres: persona?.nombres ?? undefined,
        apellidos: persona?.apellidos ?? undefined,
        correo: persona?.correo ?? persona?.email ?? undefined,
        email: persona?.correo ?? persona?.email ?? undefined,
        telefono: persona?.telefono ?? undefined,
        direccion: persona?.direccion ?? undefined,
        comuna: persona?.comuna ?? undefined,
        genero: persona?.genero ?? undefined,
        ocupacion: persona?.ocupacion ?? undefined,
        fechaNacimiento: persona?.fechaNacimiento ?? undefined,
        redSocial: persona?.redSocial ?? undefined,
        gestorId: persona?.gestorId ?? undefined,
        gestorNombre: persona?.gestorNombre ?? undefined,
        gestorRut: persona?.gestorRut ?? undefined,
        anotaciones: persona?.anotaciones ?? undefined,
        sector: persona?.sector ?? undefined
    };
};

const mapInstitucion = (inst: any): EntidadResumen => {
    const rut = normalizeRut(inst?.rut ?? inst?.identificador, 'INST', inst?.id);
    return {
        id: inst?.id ?? 0,
        tipoEntidad: 'Institucion',
        tipo: 'INSTITUCION',
        identificador: rut,
        rut,
        nombreCompleto: inst?.nombreFantasia ?? inst?.nombre ?? inst?.razonSocial ?? `Institución ${inst?.id ?? ''}`.trim(),
        razonSocial: inst?.razonSocial ?? undefined,
        nombreFantasia: inst?.nombreFantasia ?? inst?.nombre ?? undefined,
        correo: inst?.correo ?? inst?.email ?? undefined,
        email: inst?.correo ?? inst?.email ?? undefined,
        telefono: inst?.telefono ?? undefined,
        direccion: inst?.direccion ?? undefined,
        comuna: inst?.comuna ?? undefined,
        redSocial: inst?.redSocial ?? undefined,
        gestorId: inst?.gestorId ?? undefined,
        anotaciones: inst?.anotaciones ?? undefined,
        sector: inst?.sector ?? undefined,
        subtipoInstitucion: inst?.subtipoInstitucion ?? undefined,
        rubro: inst?.rubro ?? undefined
    };
};

const mapEntidadGenerica = (data: any): EntidadResumen => {
    const rawTipo = data?.tipoEntidad ?? data?.tipo;
    const normalizedTipo = typeof rawTipo === 'string' ? rawTipo.toLowerCase() : '';
    if (normalizedTipo.includes('inst')) {
        return mapInstitucion(data);
    }
    return mapPersona(data);
};

const pruneEmpty = <T extends Record<string, any>>(obj: T): T => {
    const entries = Object.entries(obj).filter(([, value]) => value !== '' && value !== undefined && value !== null);
    return Object.fromEntries(entries) as T;
};

export const apiService = {
    async getEntidades(tipo?: string): Promise<EntidadResumen[]> {
        const url = new URL(`${API_BASE_URL}/entidades`);
        if (tipo) {
            // Backend expects 'Institucion' or 'Persona' capitalized based on curl example headers? 
            // User said "Institucion" in curl example: ?tipo=Institucion
            url.searchParams.append('tipo', tipo);
        }

        const data = await requestJson<any[]>(url.toString());
        return data.map(mapEntidadGenerica);
    },

    async getPersonas(): Promise<EntidadResumen[]> {
        const personas = await requestJson<any[]>(`${API_BASE_URL}/personas`);
        return personas.map(mapPersona);
    },

    async getInstituciones(): Promise<EntidadResumen[]> {
        const instituciones = await requestJson<any[]>(`${API_BASE_URL}/instituciones`);
        return instituciones.map(mapInstitucion);
    },

    async registrarPersona(datos: RegistroPersonaPayload): Promise<number> {
        const body = pruneEmpty({ ...datos });
        const result = await requestJson<any>(`${API_BASE_URL}/personas`, {
            method: 'POST',
            // Use text/plain to avoid CORS preflight (OPTIONS 405) while backend still accepts JSON body
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });

        if (typeof result === 'number') {
            return result;
        }

        if (result && typeof result === 'object' && 'id' in result) {
            return result.id;
        }

        // Fallback: Search by RUT to get the ID
        const personas = await this.buscarEntidades(datos.rut);
        const persona = personas.find(p => p.identificador === datos.rut); // Exact match

        if (persona) {
            return persona.id;
        }

        // Final fallback if not found immediately (maybe async eventual consistency?)
        // Throw error or return 0? Throwing allows catching in UI.
        throw new Error("Persona registrada pero no se pudo obtener el ID automáticamente. Por favor búsquela nuevamente.");
    },



    async registrarDonacion(datos: DonacionPayload): Promise<void> {
        await requestJson(`${API_BASE_URL}/ingreso/donacion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
    },

    async buscarEntidades(query: string): Promise<EntidadResumen[]> {
        const url = new URL(`${API_BASE_URL}/entidades`);
        url.searchParams.append('q', query);

        const data = await requestJson<any[]>(url.toString());
        return data.map(mapEntidadGenerica);
    },

    async buscarCatalogo(query: string): Promise<CatalogoItem[]> {
        const url = new URL(`${API_BASE_URL}/catalogo/buscar`);
        url.searchParams.append('q', query);

        return await requestJson<CatalogoItem[]>(url.toString());
    },

    async registrarDonacionBienes(datos: DonacionBienesPayload): Promise<{ id_ingreso: number }> {
        return await requestJson<{ id_ingreso: number }>(`${API_BASE_URL}/ingresos/donacion-bienes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
    },



    async registrarPersonaNueva(datos: RegistrarPersonaPayload): Promise<void> {
        const body = pruneEmpty({ ...datos });
        await requestJson(`${API_BASE_URL}/personas`, {
            method: 'POST',
            // Use text/plain to avoid CORS preflight (OPTIONS 405)
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });
    },

    async registrarInstitucionNueva(datos: RegistrarInstitucionPayload): Promise<void> {
        const body = pruneEmpty({ ...datos });
        await requestJson(`${API_BASE_URL}/instituciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });
    },

    async getPersona(id: number): Promise<EntidadResumen> {
        const persona = await requestJson<any>(`${API_BASE_URL}/personas/${id}`);
        return mapPersona(persona);
    },

    async getInstitucion(id: number): Promise<EntidadResumen> {
        const institucion = await requestJson<any>(`${API_BASE_URL}/instituciones/${id}`);
        return mapInstitucion(institucion);
    },

    async actualizarEntidad(id: number, datos: ActualizarEntidadPayload): Promise<{ mensaje: string }> {
        const endpoint = datos.tipoEntidad === 'Institucion' ? 'instituciones' : 'personas';
        const body = JSON.stringify(pruneEmpty({ ...datos }));
        return await requestJson<{ mensaje: string }>(`${API_BASE_URL}/${endpoint}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body
        });
    },

    async getCatalogoItems(): Promise<CatalogoItem[]> {
        return await requestJson<CatalogoItem[]>(`${API_BASE_URL}/catalogo`);
    },

    async getCategorias(): Promise<string[]> {
        return await requestJson<string[]>(`${API_BASE_URL}/catalogo/utilitarios/categorias`);
    },

    async registrarItemCatalogo(datos: RegistrarCatalogoPayload): Promise<{ id: number; mensaje: string }> {
        return await requestJson<{ id: number; mensaje: string }>(`${API_BASE_URL}/catalogo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
    },

    async actualizarItemCatalogo(datos: ActualizarCatalogoPayload): Promise<{ mensaje: string; filasActualizadas: number }> {
        return await requestJson<{ mensaje: string; filasActualizadas: number }>(`${API_BASE_URL}/catalogo/${datos.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
    },

    async eliminarPersona(id: number): Promise<void> {
        await requestJson(`${API_BASE_URL}/personas/${id}`, {
            method: 'DELETE',
        });
    },

    async eliminarInstitucion(id: number): Promise<void> {
        await requestJson(`${API_BASE_URL}/instituciones/${id}`, {
            method: 'DELETE'
        });
    },

    async getCatalogoUtilitarios(): Promise<{ categorias: string[]; unidades: string[] }> {
        return await requestJson(`${API_BASE_URL}/catalogo/utilitarios`);
    },

    async getCuentas(): Promise<Cuenta[]> {
        return await requestJson<Cuenta[]>(`${API_BASE_URL}/cuentas`);
    },

    async crearCuenta(payload: CuentaPayload): Promise<Cuenta> {
        return await requestJson<Cuenta>(`${API_BASE_URL}/cuentas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async actualizarCuenta(id: number, payload: CuentaPayload): Promise<{ mensaje: string }> {
        return await requestJson<{ mensaje: string }>(`${API_BASE_URL}/cuentas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async getCuentaMovimientos(id: number): Promise<CuentaMovimientosResponse> {
        return await requestJson<CuentaMovimientosResponse>(`${API_BASE_URL}/cuentas/${id}/movimientos`);
    },

    async getFamilias(): Promise<Familia[]> {
        return await requestJson<Familia[]>(`${API_BASE_URL}/familias`);
    },

    async crearFamilia(payload: CrearFamiliaPayload): Promise<{ id: number; mensaje?: string }> {
        return await requestJson<{ id: number; mensaje?: string }>(`${API_BASE_URL}/familias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async getBeneficiariosFamilia(familiaId: number): Promise<BeneficiarioFamilia[]> {
        return await requestJson<BeneficiarioFamilia[]>(`${API_BASE_URL}/familias/${familiaId}/beneficiarios`);
    },

    async agregarBeneficiarioFamilia(familiaId: number, personaId: number): Promise<{ mensaje?: string }> {
        return await requestJson<{ mensaje?: string }>(`${API_BASE_URL}/familias/${familiaId}/beneficiarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personaId })
        });
    },

    async crearEgresoAyudaSocial(payload: EgresoAyudaSocialPayload): Promise<{ id: number; mensaje?: string }> {
        return await requestJson<{ id: number; mensaje?: string }>(`${API_BASE_URL}/egresos/ayuda-social`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async crearEgresoConsumoInterno(payload: EgresoConsumoInternoPayload): Promise<{ id: number; mensaje?: string }> {
        return await requestJson<{ id: number; mensaje?: string }>(`${API_BASE_URL}/egresos/consumo-interno`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async crearSolicitud(payload: SolicitudPayload): Promise<{ id: number; mensaje?: string; items_count?: number }> {
        return await requestJson<{ id: number; mensaje?: string; items_count?: number }>(`${API_BASE_URL}/solicitudes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async getRoles(tipo: 'beneficiarios' | 'colaboradores' | 'trabajadores' | 'directivos'): Promise<RolPersona[]> {
        return await requestJson<RolPersona[]>(`${API_BASE_URL}/${tipo}`);
    }
};
