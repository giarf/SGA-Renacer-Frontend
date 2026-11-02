import { UserManager, type User } from 'oidc-client-ts';
import { reactive } from 'vue';
import { ADMIN_GROUP } from './permissions';
import { isAuthConfigured, oidcSettings } from './authConfig';

type AuthState = {
    user: User | null;
    isLoading: boolean;
    isConfigured: boolean;
    /** Hubo una sesión en este navegador que venció y no se pudo renovar: se vuelve a Authentik sin pedir clic. */
    sessionExpired: boolean;
};

const state = reactive<AuthState>({
    user: null,
    isLoading: false,
    isConfigured: isAuthConfigured(),
    sessionExpired: false
});

const userManager = new UserManager(oidcSettings);
let initializePromise: Promise<User | null> | null = null;
let renewPromise: Promise<User | null> | null = null;

const asStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    if (typeof value === 'string') return [value];
    return [];
};

const getClaim = (user: User | null, key: string) => user?.profile[key as keyof typeof user.profile];

export const getUserGroups = (user = state.user) => {
    const profileGroups = asStringArray(getClaim(user, 'groups'));
    const authentikGroups = asStringArray(getClaim(user, 'ak_groups'));
    return Array.from(new Set([...profileGroups, ...authentikGroups]));
};

export const hasAnyGroup = (allowedGroups: readonly string[]) => {
    if (!allowedGroups.length) return true;
    const userGroups = getUserGroups();
    if (userGroups.includes(ADMIN_GROUP)) return true;
    return allowedGroups.some(group => userGroups.includes(group));
};

export const authService = {
    state,
    userManager,
    get groups() {
        return getUserGroups();
    },
    get displayName() {
        return state.user?.profile.name || state.user?.profile.preferred_username || state.user?.profile.email || 'Usuario';
    },
    async initialize() {
        if (!state.isConfigured) return null;
        if (initializePromise) return initializePromise;
        state.isLoading = true;
        initializePromise = userManager.getUser()
            .then(async user => {
                if (user && !user.expired) {
                    state.user = user;
                    return user;
                }
                // Token vencido: se renueva con el refresh token (offline_access). Authentik entrega uno
                // nuevo por 30 días en cada renovación, así que la sesión dura mientras se use el SGA.
                if (user?.refresh_token) {
                    try {
                        const renewed = await userManager.signinSilent();
                        if (renewed && !renewed.expired) {
                            state.user = renewed;
                            return renewed;
                        }
                    } catch {
                        // Refresh token vencido o revocado: se cae al login.
                    }
                }
                if (user) {
                    await userManager.removeUser().catch(() => undefined);
                    state.sessionExpired = true;
                }
                state.user = null;
                return null;
            })
            .finally(() => {
                state.isLoading = false;
                initializePromise = null;
            });
        return initializePromise;
    },
    /** Token de acceso vigente para la API (Authorization: Bearer). */
    get accessToken() {
        return state.user && !state.user.expired ? state.user.access_token : undefined;
    },
    /** Renueva con el refresh token; las llamadas simultáneas comparten una sola renovación. */
    async renew() {
        if (!state.user?.refresh_token) return null;
        renewPromise ??= userManager.signinSilent()
            .then(user => {
                state.user = user && !user.expired ? user : null;
                return state.user;
            })
            .catch(() => null)
            .finally(() => { renewPromise = null; });
        return renewPromise;
    },
    /** La API rechazó la sesión y no se pudo renovar: vuelve a Authentik y regresa a esta página. */
    async expireSession() {
        state.sessionExpired = true;
        state.user = null;
        await userManager.removeUser().catch(() => undefined);
        await this.login(window.location.pathname + window.location.search);
    },
    async login(returnTo?: string) {
        if (!state.isConfigured) return;
        await userManager.signinRedirect({ state: { returnTo } });
    },
    async completeLogin() {
        const user = await userManager.signinRedirectCallback();
        state.user = user;
        state.sessionExpired = false;
        const appState = user.state as { returnTo?: string } | undefined;
        return appState?.returnTo || '/donaciones';
    },
    async logout() {
        state.user = null;
        state.sessionExpired = false;
        await userManager.signoutRedirect();
    }
};

userManager.events.addUserLoaded(user => {
    state.user = user;
});

userManager.events.addUserUnloaded(() => {
    state.user = null;
});
