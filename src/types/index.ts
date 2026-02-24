// Basic atomic interfaces
export interface EntidadResumen {
    id: number;
    tipo?: 'PERSONA' | 'INSTITUCION';  // Legacy field, may not be returned by backend
    tipoEntidad: 'Persona' | 'Institucion';  // Actual field from backend
    identificador: string; // RUT
    nombreCompleto: string; // Nombre + Apellido or Nombre
    nombres?: string;  // Optional: First names (when fetched from detailed API)
    apellidos?: string;  // Optional: Last names (when fetched from detailed API)
    email?: string;
    correo?: string;  // Backend uses 'correo' instead of 'email'
    telefono?: string;
    direccion?: string;  // Address
    comuna?: string;     // Municipality
    genero?: string;     // Gender (only for Personas)
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

// Contract for POST /api/entidades/actualizar
export interface ActualizarPersonaPayload {
    id: number;
    rut: string;
    nombres: string;
    apellidos: string;
    correo: string;
    telefono: string;
    direccion: string;
    comuna: string;
    tipoEntidad: 'Persona';
    genero: string;
}

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

// Contracts for POST /api/ingresos/donacion
export interface IngresoBase {
    id: number; // 0 for new
    origenEntidadId: number;
    montoTotal: number;
    fechaIngreso: string; // ISO 8601
}

export interface DonacionBase {
    id: number; // 0 for new
    ingresoRecursoId: number; // 0 for new
    numeroCertificado: string;
    idDonante: number;
}

export interface PecuniarioBase {
    id: number; // 0 for new
    ingresoDonacionId: number; // 0 for new
    monto: number;
    destino: string;
}

export interface DonacionPayload {
    ingreso: IngresoBase;
    donacion: DonacionBase;
    pecuniario: PecuniarioBase;
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
    unidadMedida: string;
    stockActual: number;
}

export interface ItemDonacionBienes {
    id: number;
    itemCatalogoId: number;
    nombre: string;
    cantidad: number;
    precio: number;
}

// Contract for POST /api/ingresos/donacion-bienes
export interface DonacionBienesPayload {
    ingreso: {
        id: number;                     // 0 para nuevo
        origenEntidadId: number;        // ID del donador
        responsableInternoId: number;   // ID del receptor
        montoTotal: number;
        tipoTransaccion: string;        // "Donacion"
        estado: string;                 // "Cerrado"
    };
    donacion: {
        ingresoId: number;              // 0 para nuevo
        numeroCertificado: string;
        propositoEspecifico: string;
    };
    items: ItemDonacionBienes[];
}
