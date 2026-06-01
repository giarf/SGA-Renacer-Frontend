/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_AUTHENTIK_ISSUER?: string;
    readonly VITE_AUTHENTIK_CLIENT_ID?: string;
    readonly VITE_AUTHENTIK_REDIRECT_URI?: string;
    readonly VITE_AUTHENTIK_POST_LOGOUT_REDIRECT_URI?: string;
    readonly VITE_PUBLIC_APP_URL?: string;
    readonly VITE_AUTHENTIK_SCOPE?: string;
    readonly VITE_AUTHENTIK_ADMIN_TOKEN?: string;
    readonly VITE_AUTHENTIK_MEMBER_GROUP?: string;
    readonly VITE_AUTHENTIK_ADMIN_GROUP?: string;
    readonly VITE_AUTHENTIK_GATE_ADMIN_GROUP?: string;
    readonly VITE_AUTHENTIK_USER_PATH?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
