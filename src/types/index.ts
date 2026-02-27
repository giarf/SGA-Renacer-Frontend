// Basic atomic interfaces
export interface EntidadResumen {
    id: number;
    tipo?: 'PERSONA' | 'INSTITUCION';  // Legacy field, may not be returned by backend
    tipoEntidad: 'Persona' | 'Institucion';  // Actual field from backend
    identificador: string; // RUT
    rut?: string;
    nombreCompleto: string; // Nombre + Apellido or Nombre
    nombres?: string;  // Optional: First names (when fetched from detailed API)
    apellidos?: string;  // Optional: Last names (when fetched from detailed API)
    email?: string;
    correo?: string;  // Backend uses 'correo' instead of 'email'
    telefono?: string;
    direccion?: string;  // Address
    comuna?: string;     // Municipality
    genero?: string;     // Gender (only for Personas)
    ocupacion?: string;
    fechaNacimiento?: string;
    redSocial?: string;
    gestorId?: number;
    gestorNombre?: string;
    gestorRut?: string;
    anotaciones?: string;
    sector?: string;
    razonSocial?: string;
    nombreFantasia?: string;
    subtipoInstitucion?: string;
    rubro?: string;
}

export interface PersonaNatural {
    id?: number;
    rut: string;
    nombre: string;
    apellido: string;
    email: string;
    telefono?: string;
}

export interface Institucion {
    id?: number;
    rut: string;
    nombre: string;
    razonSocial: string;
    email: string;
    telefono?: string;
}

// Contract for POST /api/entidades/registrar
export interface RegistroPersonaPayload {
    rut: string;
    tipoEntidad: 'Persona'; // Fixed value for this specific case
    telefono: string;
    correo: string;
    direccion: string;
    comuna: string;
    nombres: string; // Note plural 'nombres' from curl
    apellidos: string; // Note plural 'apellidos' from curl
    genero: string;
}

export interface RegistrarInstitucionPayload {
    rut: string;
    telefono?: string;
    correo?: string;
    direccion?: string;
    comuna?: string;
    redSocial?: string;
    gestorId?: number;
    anotaciones?: string;
    sector?: string;
    razonSocial: string;
    nombreFantasia?: string;
    subtipoInstitucion?: string;
    rubro?: string;
}

// Contract for POST /api/entidades/actualizar
export interface ActualizarPersonaPayload {
    id: number;
    rut: string;
    correo: string;
    telefono: string;
    direccion: string;
    comuna: string;
    tipoEntidad: 'Persona' | 'Institucion';
    // Persona-specific fields
    nombres?: string;
    apellidos?: string;
    genero?: string;
    ocupacion?: string;
    redSocial?: string;
    gestorId?: number;
    anotaciones?: string;
    sector?: string;
    fechaNacimiento?: string;
    // Institucion-specific fields
    nombre?: string;
}

export interface ActualizarInstitucionPayload {
    id: number;
    rut: string;
    telefono?: string;
    correo?: string;
    direccion?: string;
    comuna?: string;
    tipoEntidad: 'Institucion';
    razonSocial?: string;
    nombre?: string;
    nombreFantasia?: string;
    subtipoInstitucion?: string;
    rubro?: string;
    redSocial?: string;
    gestorId?: number;
    anotaciones?: string;
    sector?: string;
}

export type ActualizarEntidadPayload = ActualizarPersonaPayload | ActualizarInstitucionPayload;

// Contract for PUT /api/personas/editar (inline editing)
export interface PersonaEditPayload {
    id: number;
    rut: string;
    tipoEntidad: "Persona";
    telefono: string;
    correo: string;
    direccion: string;
    comuna: string;
    nombres: string;
    apellidos: string;
    genero: string;
}

// Contract for POST /api/entidades/registrar (create new person)
export interface RegistrarPersonaPayload {
    rut?: string;
    tipoEntidad: "Persona";
    telefono: string;
    correo?: string;
    direccion?: string;
    comuna?: string;
    nombres: string;
    apellidos: string;
    genero?: string;
    redSocial?: string;
    gestorId?: number;
    anotaciones?: string;
    sector?: string;
    ocupacion?: string;
    fechaNacimiento?: string;
}

// Contracts for POST /api/ingreso/donacion
export interface IngresoDonacionPayload {
    origenEntidadId: number;
    responsableInternoId: number;
    montoTotal: number;
    tipoTransaccion: string;
    estado: string;
    anotaciones?: string;
}

export interface DonacionDetallePayload {
    propositoEspecifico: string;
    gestorId?: number;
    numeroCertificado?: string;
}

export interface PecuniarioDestinoPayload {
    cuentaDestinoId: number;
    metodoTransferencia: string;
    comentarios?: string;
}

export interface DonacionPayload {
    ingreso: IngresoDonacionPayload;
    donacion: DonacionDetallePayload;
    pecuniario: PecuniarioDestinoPayload;
}

// Form types for donation registration
export interface DetalleDonacion {
    tipo: 'DINERO' | 'ESPECIE';
    fecha: string; // ISO date string (YYYY-MM-DD)
    monto: number;
    descripcion: string;
}

export interface NuevoRegistro {
    entidadId: number;
    tipoEntidad: 'PERSONA' | 'INSTITUCION';
    donacion: DetalleDonacion;
}

// Contracts for catalog items and non-pecuniary donations
export interface CatalogoItem {
    id: number;
    nombre: string;
    categoria: string;
    unidadMedidaEstandar: string;
    stockActual: number;
    valorTotalStock: number;
    precioPromedioPonderado: number;
    precioReferencia: number;
}

export interface ItemDonacionBienes {
    nombre: string;
    categoria: string;
    unidad: string;
    cantidad: number;
    precio: number;
    itemCatalogoId?: number;
}

// Contract for POST /api/ingresos/donacion-bienes
export interface DonacionBienesPayload {
    ingreso: {
        origenEntidadId: number;
        responsableInternoId: number;
        montoTotal: number;
        tipoTransaccion: string;        // "Donacion"
        estado: string;                 // "Cerrado"
        anotaciones?: string;
    };
    donacion: {
        propositoEspecifico: string;
        gestorId?: number;
    };
    items: ItemDonacionBienes[];
}

// Contracts for catalog item management
export interface RegistrarCatalogoPayload {
    nombre: string;
    categoria: string;
    unidadMedidaEstandar: string;
    precioReferencia: number;
}

export interface ActualizarCatalogoPayload {
    id: number;
    nombre: string;
    categoria?: string;  // Optional on update
    unidadMedidaEstandar?: string;  // Optional on update
    precioReferencia: number;
}

// Cuenta corriente / fondos internos
export interface Cuenta {
    id: number;
    nombre: string;
    saldoActual: number;
    descripcion?: string;
}

export interface CuentaPayload {
    id?: number;
    nombre: string;
    saldoActual: number;
    descripcion?: string;
}

export interface CuentaMovimiento {
    id: number;
    fecha: string;
    descripcion: string;
    monto: number;
    tipo?: 'INGRESO' | 'EGRESO';
}

export interface CuentaMovimientosResponse {
    ingresos: CuentaMovimiento[];
    egresos: CuentaMovimiento[];
}

// Familias y beneficiarios
export interface Familia {
    id: number;
    nombreFamilia: string;
    puntosVulnerabilidad: number;
    jefeHogarId: number;
    jefeHogarNombre?: string;
}

export interface CrearFamiliaPayload {
    id?: number;
    nombreFamilia: string;
    puntosVulnerabilidad: number;
    jefeHogarId: number;
}

export interface BeneficiarioFamilia {
    id: number;
    personaId: number;
    nombres: string;
    apellidos: string;
    rut: string;
}

// Egresos
export interface EgresoDetallePayload {
    itemCatalogoId: number;
    cantidad: number;
}

export interface EgresoAyudaSocialPayload {
    egreso: {
        tipoEgreso: 'AyudaSocial';
        montoValorizadoTotal: number;
    };
    ayuda: {
        beneficiarioPersonaId: number;
        motivoEntrega: string;
    };
    detalles: EgresoDetallePayload[];
}

export interface EgresoConsumoInternoPayload {
    egreso: {
        tipoEgreso: 'ConsumoInterno';
        montoValorizadoTotal: number;
    };
    consumo: {
        programaEvento: string;
        responsablePersonaId: number;
    };
    detalles: EgresoDetallePayload[];
}

// Solicitudes internas
export interface SolicitudItemPayload {
    id: number;
    solicitudId: number | null;
    itemCatalogoId: number | null;
    descripcionManual: string | null;
    cantidadRequerida: number;
    cantidadEntregada: number | null;
}

export interface SolicitudPayload {
    solicitud: {
        id: number;
        solicitanteId: number;
        programa: string;
        fechaSolicitud: string;
        estado: string;
        autorizadorId: number | null;
    };
    items: SolicitudItemPayload[];
}

// Rol-based directory responses
export interface RolPersona {
    id: number;
    personaId?: number;
    nombres: string;
    apellidos: string;
    rut: string;
    telefono?: string;
    correo?: string;
    rol?: string;
}
