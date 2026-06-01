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

type AuthentikGroup = {
    pk: string;
    name: string;
};

const config = {
    baseUrl: '/authentik-api',
    token: import.meta.env.VITE_AUTHENTIK_ADMIN_TOKEN || '',
    memberGroup: import.meta.env.VITE_AUTHENTIK_MEMBER_GROUP || 'renacer-miembros',
    adminGroup: import.meta.env.VITE_AUTHENTIK_ADMIN_GROUP || 'renacer-admin',
    gateAdminGroup: import.meta.env.VITE_AUTHENTIK_GATE_ADMIN_GROUP || 'renacer-puerta',
    userPath: import.meta.env.VITE_AUTHENTIK_USER_PATH || 'renacer'
};

let groupsCache: { member: AuthentikGroup; admin: AuthentikGroup; gateAdmin: AuthentikGroup } | null = null;

const getApiError = (data: any, fallback: string) => {
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (Array.isArray(data?.non_field_errors)) return data.non_field_errors.join(', ');
    return data?.detail || data?.error || data?.mensaje || fallback;
};

const requestAuthentik = async <T>(endpoint: string, init: RequestInit = {}) => {
    if (!config.token) {
        console.error('[Authentik] Error: Falta VITE_AUTHENTIK_ADMIN_TOKEN');
        throw new Error('Falta VITE_AUTHENTIK_ADMIN_TOKEN para administrar usuarios.');
    }

    const url = `${config.baseUrl}/api/v3${endpoint}`;
    console.log(`[Authentik] ${init.method || 'GET'} ${url}`, init.body ? JSON.parse(init.body as string) : '');

    const response = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/json',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers
        }
    });

    if (response.status === 204) return null as T;

    const text = await response.text();
    let data: any = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    console.log(`[Authentik] Response ${response.status}:`, data);

    if (!response.ok) {
        console.error(`[Authentik] Error ${response.status} en ${endpoint}:`, data);
        throw new Error(getApiError(data, `Error consultando Authentik (${response.status}).`));
    }

    return data as T;
};

const getResults = <T>(data: any): T[] => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
};

const findGroupByName = async (name: string) => {
    const params = new URLSearchParams({ search: name, include_users: 'false', page_size: '50' });
    const data = await requestAuthentik<any>(`/core/groups/?${params.toString()}`);
    const group = getResults<any>(data).find(candidate => String(candidate?.name || '').toLowerCase() === name.toLowerCase());
    if (!group) throw new Error(`No existe el grupo Authentik: ${name}`);
    return { pk: String(group.pk || group.id), name: String(group.name) };
};

const getGroups = async () => {
    if (groupsCache) {
        console.log('[Authentik] getGroups (cached):', groupsCache);
        return groupsCache;
    }
    console.log(`[Authentik] getGroups buscando: memberGroup="${config.memberGroup}", adminGroup="${config.adminGroup}", gateAdminGroup="${config.gateAdminGroup}"`);
    const [member, admin, gateAdmin] = await Promise.all([
        findGroupByName(config.memberGroup),
        findGroupByName(config.adminGroup),
        findGroupByName(config.gateAdminGroup)
    ]);
    console.log(`[Authentik] getGroups encontrado: member pk=${member?.pk}, admin pk=${admin?.pk}, gateAdmin pk=${gateAdmin?.pk}`);
    groupsCache = { member, admin, gateAdmin };
    return groupsCache;
};

const userHasGroup = (rawUser: any, group: AuthentikGroup) => {
    const groups = Array.isArray(rawUser?.groups) ? rawUser.groups : [];
    const groupsObj = Array.isArray(rawUser?.groups_obj) ? rawUser.groups_obj : [];
    return groups.some((item: unknown) => String(item).toLowerCase() === group.pk.toLowerCase() || String(item).toLowerCase() === group.name.toLowerCase())
        || groupsObj.some((item: any) => String(item?.pk || item?.id || '').toLowerCase() === group.pk.toLowerCase() || String(item?.name || '').toLowerCase() === group.name.toLowerCase());
};

const normalizeUser = (rawUser: any, adminGroup: AuthentikGroup, gateAdminGroup: AuthentikGroup): ManagedAuthentikUser => ({
    id: Number(rawUser?.pk ?? rawUser?.id ?? 0),
    username: rawUser?.username ?? '',
    name: rawUser?.name ?? '',
    email: rawUser?.email ?? '',
    isActive: Boolean(rawUser?.is_active),
    isAdmin: userHasGroup(rawUser, adminGroup),
    isGateAdmin: userHasGroup(rawUser, gateAdminGroup),
    lastLogin: rawUser?.last_login ?? null
});

const addUserToGroup = async (groupPk: string, userId: number) => {
    console.log(`[Authentik] addUserToGroup: groupPk=${groupPk}, userId=${userId}`);
    try {
        await requestAuthentik(`/core/groups/${encodeURIComponent(groupPk)}/add_user/`, {
            method: 'POST',
            body: JSON.stringify({ pk: userId })
        });
        console.log(`[Authentik] Usuario ${userId} agregado al grupo ${groupPk}`);
    } catch (err: any) {
        console.warn(`[Authentik] addUserToGroup error:`, err.message);
        if (err.message?.includes('400') || err.message?.toLowerCase().includes('already') || err.message?.includes('pk')) {
            console.log(`[Authentik] Usuario ${userId} ya está en el grupo ${groupPk}, omitiendo`);
            return { alreadyMember: true };
        }
        throw err;
    }
    return { alreadyMember: false };
};

const removeUserFromGroup = async (groupPk: string, userId: number) => {
    console.log(`[Authentik] removeUserToGroup: groupPk=${groupPk}, userId=${userId}`);
    try {
        await requestAuthentik(`/core/groups/${encodeURIComponent(groupPk)}/remove_user/`, {
            method: 'POST',
            body: JSON.stringify({ pk: userId })
        });
        console.log(`[Authentik] Usuario ${userId} removido del grupo ${groupPk}`);
    } catch (err: any) {
        console.warn(`[Authentik] removeUserFromGroup error:`, err.message);
        if (err.message?.includes('400') || err.message?.includes('not found')) {
            console.log(`[Authentik] Usuario ${userId} no está en el grupo ${groupPk}, omitiendo`);
            return { notMember: true };
        }
        throw err;
    }
    return { notMember: false };
};

export const authentikAdminService = {
    async listUsers() {
        const { member, admin, gateAdmin } = await getGroups();
        const params = new URLSearchParams({ groups_by_pk: member.pk, ordering: 'username', page_size: '100' });
        const data = await requestAuthentik<any>(`/core/users/?${params.toString()}`);
        return getResults<any>(data).map(user => normalizeUser(user, admin, gateAdmin));
    },

    async createUser(payload: CreateAuthentikUserPayload) {
        const { member, admin, gateAdmin } = await getGroups();
        const email = payload.email.trim().toLowerCase();
        const username = (payload.username?.trim() || email.split('@')[0] || '').toLowerCase();

        if (!payload.name.trim()) throw new Error('El nombre es obligatorio.');
        if (!email.includes('@')) throw new Error('El correo no es valido.');
        if (!username) throw new Error('El usuario es obligatorio.');
        if (payload.password && payload.password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.');

        const user = await requestAuthentik<any>('/core/users/', {
            method: 'POST',
            body: JSON.stringify({
                username,
                name: payload.name.trim(),
                email,
                is_active: true,
                path: config.userPath,
                groups: [member.pk]
            })
        });

        const userId = Number(user?.pk ?? user?.id);
        if (payload.password) await this.setPassword(userId, payload.password);
        if (payload.isAdmin) await addUserToGroup(admin.pk, userId);
        if (payload.isGateAdmin) await addUserToGroup(gateAdmin.pk, userId);

        return userId;
    },

    async usernameExists(username: string) {
        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return false;

        const params = new URLSearchParams({ search: cleanUsername, page_size: '20' });
        const data = await requestAuthentik<any>(`/core/users/?${params.toString()}`);
        return getResults<any>(data).some(user => String(user?.username || '').toLowerCase() === cleanUsername);
    },

    async updateUser(userId: number, payload: UpdateAuthentikUserPayload) {
        const patch: Record<string, unknown> = {};
        if (typeof payload.name === 'string') patch.name = payload.name.trim();
        if (typeof payload.email === 'string') patch.email = payload.email.trim().toLowerCase();
        if (typeof payload.isActive === 'boolean') patch.is_active = payload.isActive;
        if (!Object.keys(patch).length) return;

        await requestAuthentik(`/core/users/${encodeURIComponent(userId)}/`, {
            method: 'PATCH',
            body: JSON.stringify(patch)
        });
    },

    async setPassword(userId: number, password: string) {
        if (password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.');
        await requestAuthentik(`/core/users/${encodeURIComponent(userId)}/set_password/`, {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    },

    async setAdmin(userId: number, isAdmin: boolean) {
        console.log(`[Authentik] setAdmin: userId=${userId}, isAdmin=${isAdmin}`);
        const { admin } = await getGroups();
        console.log(`[Authentik] admin group pk:`, admin.pk);
        if (isAdmin) {
            const result = await addUserToGroup(admin.pk, userId);
            if (result?.alreadyMember) return { status: 'already_admin', message: 'El usuario ya es admin' };
            return { status: 'added', message: 'Permiso admin agregado' };
        } else {
            const result = await removeUserFromGroup(admin.pk, userId);
            if (result?.notMember) return { status: 'not_admin', message: 'El usuario no es admin' };
            return { status: 'removed', message: 'Permiso admin removido' };
        }
    },

    async setGateAdmin(userId: number, isGateAdmin: boolean) {
        console.log(`[Authentik] setGateAdmin: userId=${userId}, isGateAdmin=${isGateAdmin}`);
        const { gateAdmin } = await getGroups();
        console.log(`[Authentik] gate admin group pk:`, gateAdmin.pk);
        if (isGateAdmin) {
            const result = await addUserToGroup(gateAdmin.pk, userId);
            if (result?.alreadyMember) return { status: 'already_gate_admin', message: 'El usuario ya es admin puerta' };
            return { status: 'added', message: 'Permiso admin puerta agregado' };
        } else {
            const result = await removeUserFromGroup(gateAdmin.pk, userId);
            if (result?.notMember) return { status: 'not_gate_admin', message: 'El usuario no es admin puerta' };
            return { status: 'removed', message: 'Permiso admin puerta removido' };
        }
    }
};
