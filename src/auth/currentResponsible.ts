import { computed } from 'vue';
import { apiService } from '../api/apiService';
import type { EntidadResumen } from '../types';
import { authService, hasAnyGroup } from './authService';
import { ADMIN_GROUPS } from './permissions';

const normalize = (value?: string | null) =>
    (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const unique = (values: Array<string | undefined>) => Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))));

export const canChangeResponsible = computed(() => hasAnyGroup(ADMIN_GROUPS));

export const getCurrentResponsibleSearchTerms = () => {
    const profile = authService.state.user?.profile;
    return unique([
        profile?.name,
        profile?.preferred_username,
        profile?.email,
        authService.displayName
    ]);
};

const findBestMatch = (results: EntidadResumen[], term: string) => {
    const normalizedTerm = normalize(term);
    return results.find(entidad => normalize(entidad.nombreCompleto) === normalizedTerm)
        ?? results.find(entidad => normalize(entidad.email ?? entidad.correo) === normalizedTerm)
        ?? results.find(entidad => normalize(entidad.identificador) === normalizedTerm || normalize(entidad.rut) === normalizedTerm)
        ?? results[0]
        ?? null;
};

export const resolveCurrentResponsible = async () => {
    const terms = getCurrentResponsibleSearchTerms();
    for (const term of terms) {
        const results = await apiService.buscarEntidades(term);
        const match = findBestMatch(results, term);
        if (match) return match;
    }
    throw new Error('No se encontró tu usuario interno en Entidades. Debe existir una persona con el nombre o correo de Authentik.');
};
