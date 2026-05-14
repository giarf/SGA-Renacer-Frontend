export type ManagedAuthentikUser = {
    id: number;
    username: string;
    name: string;
    email: string;
    isActive: boolean;
    isAdmin: boolean;
    lastLogin?: string | null;
};

export type CreateAuthentikUserPayload = {
    name: string;
    email: string;
    username?: string;
    password?: string;
    isAdmin?: boolean;
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
    userPath: import.meta.env.VITE_AUTHENTIK_USER_PATH || 'renacer'
};

let groupsCache: { member: AuthentikGroup; admin: AuthentikGroup } | null = null;

const getApiError = (data: any, fallback: string) => {
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (Array.isArray(data?.non_field_errors)) return data.non_field_errors.join(', ');
    return data?.detail || data?.error || data?.mensaje || fallback;
};

const requestAuthentik = async <T>(endpoint: string, init: RequestInit = {}) => {
    if (!config.token) {
        throw new Error('Falta VITE_AUTHENTIK_ADMIN_TOKEN para administrar usuarios.');
    }

    const response = await fetch(`${config.baseUrl}/api/v3${endpoint}`, {
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

    if (!response.ok) {
        throw new Error(getApiError(data, 'Error consultando Authentik.'));
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
    if (groupsCache) return groupsCache;
    const [member, admin] = await Promise.all([
        findGroupByName(config.memberGroup),
        findGroupByName(config.adminGroup)
    ]);
    groupsCache = { member, admin };
    return groupsCache;
};

const userHasGroup = (rawUser: any, group: AuthentikGroup) => {
    const groups = Array.isArray(rawUser?.groups) ? rawUser.groups : [];
    const groupsObj = Array.isArray(rawUser?.groups_obj) ? rawUser.groups_obj : [];
    return groups.some((item: unknown) => String(item).toLowerCase() === group.pk.toLowerCase() || String(item).toLowerCase() === group.name.toLowerCase())
        || groupsObj.some((item: any) => String(item?.pk || item?.id || '').toLowerCase() === group.pk.toLowerCase() || String(item?.name || '').toLowerCase() === group.name.toLowerCase());
};

const normalizeUser = (rawUser: any, adminGroup: AuthentikGroup): ManagedAuthentikUser => ({
    id: Number(rawUser?.pk ?? rawUser?.id ?? 0),
    username: rawUser?.username ?? '',
    name: rawUser?.name ?? '',
    email: rawUser?.email ?? '',
    isActive: Boolean(rawUser?.is_active),
    isAdmin: userHasGroup(rawUser, adminGroup),
    lastLogin: rawUser?.last_login ?? null
});

const addUserToGroup = async (groupPk: string, userId: number) => {
    await requestAuthentik(`/core/groups/${encodeURIComponent(groupPk)}/add_user/`, {
        method: 'POST',
        body: JSON.stringify({ pk: userId })
    });
};

const removeUserFromGroup = async (groupPk: string, userId: number) => {
    await requestAuthentik(`/core/groups/${encodeURIComponent(groupPk)}/remove_user/`, {
        method: 'POST',
        body: JSON.stringify({ pk: userId })
    });
};

export const authentikAdminService = {
    async listUsers() {
        const { member, admin } = await getGroups();
        const params = new URLSearchParams({ groups_by_pk: member.pk, ordering: 'username', page_size: '100' });
        const data = await requestAuthentik<any>(`/core/users/?${params.toString()}`);
        return getResults<any>(data).map(user => normalizeUser(user, admin));
    },

    async createUser(payload: CreateAuthentikUserPayload) {
        const { member, admin } = await getGroups();
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

        return userId;
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
        const { admin } = await getGroups();
        if (isAdmin) await addUserToGroup(admin.pk, userId);
        else await removeUserFromGroup(admin.pk, userId);
    }
};
