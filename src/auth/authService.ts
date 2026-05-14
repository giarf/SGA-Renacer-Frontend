import { UserManager, type User } from 'oidc-client-ts';
import { reactive } from 'vue';
import { ADMIN_GROUP } from './permissions';
import { isAuthConfigured, oidcSettings } from './authConfig';

type AuthState = {
    user: User | null;
    isLoading: boolean;
    isConfigured: boolean;
};

const state = reactive<AuthState>({
    user: null,
    isLoading: false,
    isConfigured: isAuthConfigured()
});

const userManager = new UserManager(oidcSettings);
let initializePromise: Promise<User | null> | null = null;

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
            .then(user => {
                state.user = user && !user.expired ? user : null;
                return state.user;
            })
            .finally(() => {
                state.isLoading = false;
                initializePromise = null;
            });
        return initializePromise;
    },
    async login(returnTo?: string) {
        if (!state.isConfigured) return;
        await userManager.signinRedirect({ state: { returnTo } });
    },
    async completeLogin() {
        const user = await userManager.signinRedirectCallback();
        state.user = user;
        const appState = user.state as { returnTo?: string } | undefined;
        return appState?.returnTo || '/donaciones';
    },
    async logout() {
        state.user = null;
        await userManager.signoutRedirect();
    }
};

userManager.events.addUserLoaded(user => {
    state.user = user;
});

userManager.events.addUserUnloaded(() => {
    state.user = null;
});
