import type {
    EntidadResumen,
    RegistroPersonaPayload,
    ActualizarPersonaPayload,
    PersonaEditPayload,
    RegistrarPersonaPayload,  // NEW: For creating persons from Entidades view
    DonacionPayload,
    CatalogoItem,
    DonacionBienesPayload
} from '../types';

const API_BASE_URL = 'http://localhost:8080/api';

export const apiService = {
    async getEntidades(tipo?: string): Promise<EntidadResumen[]> {
        const url = new URL(`${API_BASE_URL}/entidades`);
        if (tipo) {
            // Backend expects 'Institucion' or 'Persona' capitalized based on curl example headers? 
            // User said "Institucion" in curl example: ?tipo=Institucion
            url.searchParams.append('tipo', tipo);
        }

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Error fetching entities: ${response.statusText}`);
        return await response.json();
    },

    async registrarPersona(datos: RegistroPersonaPayload): Promise<number> {
        const response = await fetch(`${API_BASE_URL}/entidades/registrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error registering person: ${response.statusText}`);
        // Assuming backend returns the new ID as a number or object with ID. 
        // If it returns the full object, we'll need to parse it. 
        // For now assuming it returns the ID or we might need to adjust based on real response.
        // Based on "ids en zero... ella asignará el número real", implies we get it back.
        const result = await response.json();
        return result.id || result; // Fallback
    },

    async actualizarPersona(datos: ActualizarPersonaPayload): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/entidades/actualizar`, {
            method: 'POST', // Explicitly POST as requested
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error updating person: ${response.statusText}`);
    },

    async registrarDonacion(datos: DonacionPayload): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/ingresos/donacion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error registering donation: ${response.statusText}`);
    },

    async buscarEntidades(query: string): Promise<EntidadResumen[]> {
        const url = new URL(`${API_BASE_URL}/entidades`);
        url.searchParams.append('q', query);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Error searching entities: ${response.statusText}`);
        return await response.json();
    },

    async buscarCatalogo(query: string): Promise<CatalogoItem[]> {
        const url = new URL(`${API_BASE_URL}/catalogo/buscar`);
        url.searchParams.append('q', query);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Error searching catalog: ${response.statusText}`);
        return await response.json();
    },

    async registrarDonacionBienes(datos: DonacionBienesPayload): Promise<{ id_ingreso: number }> {
        const response = await fetch(`${API_BASE_URL}/ingresos/donacion-bienes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error registering goods donation: ${response.statusText}`);
        return await response.json();
    },

    async editarPersona(datos: PersonaEditPayload): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/personas/editar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error editing person: ${response.statusText}`);
    },

    async registrarPersonaNueva(datos: RegistrarPersonaPayload): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/entidades/registrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (!response.ok) throw new Error(`Error creating person: ${response.statusText}`);
    }
};
