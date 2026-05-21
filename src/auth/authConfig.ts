import { WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const publicAppUrl = trimTrailingSlash(import.meta.env.VITE_PUBLIC_APP_URL || 'https://sga.familiarenacer.cl');

export const authConfig = {
    authority: import.meta.env.VITE_AUTHENTIK_ISSUER || 'https://auth.slaksis.com/application/o/sga-renacer/',
    clientId: import.meta.env.VITE_AUTHENTIK_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_AUTHENTIK_REDIRECT_URI || `${publicAppUrl}/callback`,
    postLogoutRedirectUri: import.meta.env.VITE_AUTHENTIK_POST_LOGOUT_REDIRECT_URI || publicAppUrl,
    scope: import.meta.env.VITE_AUTHENTIK_SCOPE || 'openid profile email'
};

export const isAuthConfigured = () => Boolean(authConfig.authority && authConfig.clientId);

export const oidcSettings: UserManagerSettings = {
    authority: trimTrailingSlash(authConfig.authority),
    client_id: authConfig.clientId,
    redirect_uri: authConfig.redirectUri,
    post_logout_redirect_uri: authConfig.postLogoutRedirectUri,
    response_type: 'code',
    scope: authConfig.scope,
    automaticSilentRenew: true,
    loadUserInfo: true,
    userStore: new WebStorageStateStore({ store: window.localStorage })
};
