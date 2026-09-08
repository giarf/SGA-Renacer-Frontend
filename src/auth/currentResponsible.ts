import { computed } from 'vue';
import { apiService } from '../api/apiService';
import type { EntidadResumen } from '../types';
import { authService, hasAnyGroup } from './authService';
import { ADMIN_GROUPS } from './permissions';
import { matchResponsible } from './responsibleMatching';

export const canChangeResponsible = computed(() => hasAnyGroup(ADMIN_GROUPS));

// Share concurrent lookups from the header and form; do not cache across sessions.
let pendingPeople: Promise<EntidadResumen[]> | null = null;

export const resolveCurrentResponsible = async () => {
    const profile = authService.state.user?.profile;
    if (!profile) throw new Error('Inicia sesión para identificar al responsable interno.');
    // The general entity search omits email and separate name/surname fields.
    pendingPeople ??= apiService.getPersonas().finally(() => { pendingPeople = null; });
    const people = await pendingPeople;
    if (authService.state.user?.profile.sub !== profile.sub) throw new Error('La sesión cambió. Vuelve a abrir el formulario.');

    const match = matchResponsible(people, profile);
    if (match.status === 'matched') return match.person;
    if (match.status === 'ambiguous') {
        throw new Error('Hay más de una persona que coincide con tus datos de Authentik. No se asignó un responsable automáticamente; solicita revisar las fichas y sus correos.');
    }
    throw new Error('No se encontró una persona que coincida con tu correo o con tu nombre y apellido de Authentik. No se asignó un responsable automáticamente.');
};
