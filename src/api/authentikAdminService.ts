import { requestJson } from './apiService';

// Administración de usuarios de Renacer a través del backend (/api/usuarios).
// El backend usa una cuenta de servicio de Authentik, solo toca usuarios de Renacer y deja
// en su auditoría qué administrador hizo cada cambio. Ningún token de Authentik vive en el navegador.

export type ManagedAuthentikUser = {
    id: number;
    username: string;
    name: string;
    email: string;
    isActive: boolean;
    isAdmin: boolean;
    isGateAdmin: boolean;
    lastLogin?: string | null;
};

export type CreateAuthentikUserPayload = {
    name: string;
    email: string;
    username?: string;
    password?: string;
    isAdmin?: boolean;
    isGateAdmin?: boolean;
};

export type UpdateAuthentikUserPayload = {
    name?: string;
    email?: string;
    isActive?: boolean;
};

export type AuditoriaUsuario = {
    id: number;
    fecha: string;
    actorNombre: string;
    actorEmail?: string | null;
    accion: string;
    objetivoId?: string | null;
    objetivoNombre?: string | null;
    detalle?: string | null;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.familiarenacer.cl/api').replace(/\/$/, '');
const url = (path: string) => `${API_BASE_URL}/usuarios${path}`;
const json = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
});

export const authentikAdminService = {
    listUsers(): Promise<ManagedAuthentikUser[]> {
        return requestJson<ManagedAuthentikUser[]>(url(''));
    },

    async createUser(payload: CreateAuthentikUserPayload): Promise<number> {
        const creado = await requestJson<ManagedAuthentikUser>(url(''), json('POST', {
            name: payload.name.trim(),
            email: payload.email.trim().toLowerCase(),
            username: payload.username?.trim() || undefined,
            password: payload.password || undefined,
            isAdmin: Boolean(payload.isAdmin),
            isGateAdmin: Boolean(payload.isGateAdmin)
        }));
        return creado.id;
    },

    async usernameExists(username: string): Promise<boolean> {
        const limpio = username.trim().toLowerCase();
        if (!limpio) return false;
        const respuesta = await requestJson<{ existe: boolean }>(url(`/existe?username=${encodeURIComponent(limpio)}`));
        return respuesta.existe;
    },

    async updateUser(userId: number, payload: UpdateAuthentikUserPayload): Promise<void> {
        await requestJson(url(`/${userId}`), json('PATCH', payload));
    },

    async setPassword(userId: number, password: string): Promise<void> {
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        await requestJson(url(`/${userId}/password`), json('POST', { password }));
    },

    async setAdmin(userId: number, isAdmin: boolean) {
        const usuario = await requestJson<ManagedAuthentikUser>(url(`/${userId}/admin`), json('POST', { valor: isAdmin }));
        return {
            status: usuario.isAdmin ? 'added' : 'removed',
            message: usuario.isAdmin ? 'Permiso admin agregado' : 'Permiso admin removido'
        };
    },

    async setGateAdmin(userId: number, isGateAdmin: boolean) {
        const usuario = await requestJson<ManagedAuthentikUser>(url(`/${userId}/puerta`), json('POST', { valor: isGateAdmin }));
        return {
            status: usuario.isGateAdmin ? 'added' : 'removed',
            message: usuario.isGateAdmin ? 'Permiso admin puerta agregado' : 'Permiso admin puerta removido'
        };
    },

    async deleteUser(userId: number): Promise<void> {
        await requestJson(url(`/${userId}`), { method: 'DELETE' });
    },

    auditoria(limite = 100): Promise<AuditoriaUsuario[]> {
        return requestJson<AuditoriaUsuario[]>(url(`/auditoria?limite=${limite}`));
    }
};
