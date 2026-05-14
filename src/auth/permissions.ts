export const ADMIN_GROUP = 'renacer-admin';
export const LEGACY_ADMIN_GROUP = 'renacer-admins';
export const MEMBER_GROUP = 'renacer-miembros';

export const DAILY_OPERATION_GROUPS = [ADMIN_GROUP, LEGACY_ADMIN_GROUP, MEMBER_GROUP] as const;
export const ADMIN_GROUPS = [ADMIN_GROUP, LEGACY_ADMIN_GROUP] as const;

export type AuthGroup = typeof ADMIN_GROUP | typeof LEGACY_ADMIN_GROUP | typeof MEMBER_GROUP;
