import type { EntidadResumen } from '../types';

export interface ResponsibleProfile {
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
}

export type ResponsibleMatch =
    | { status: 'matched'; person: EntidadResumen }
    | { status: 'not-found' | 'ambiguous' };

const normalizeName = (value: string = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const words = (value?: string) => normalizeName(value).split(' ').filter(Boolean);
const normalizeEmail = (value?: string) => (value ?? '').trim().toLowerCase();

// Extra middle names and surnames may be omitted, but every supplied word must match.
const matchesWords = (supplied: string[], registered: string[]) => {
    if (supplied[0] !== registered[0]) return false;
    let index = 0;
    for (const word of registered) {
        if (word === supplied[index]) index++;
    }
    return index === supplied.length;
};

const matchesName = (person: EntidadResumen, name: string) => {
    const supplied = words(name);
    const given = words(person.nombres);
    const family = words(person.apellidos);
    if (supplied.length < 2 || !given.length || !family.length) return false;

    // Try the possible boundary between given names and surnames, preserving both.
    for (let boundary = 1; boundary < supplied.length; boundary++) {
        if (matchesWords(supplied.slice(0, boundary), given) && matchesWords(supplied.slice(boundary), family)) return true;
    }
    return false;
};

const resultFor = (people: EntidadResumen[]): ResponsibleMatch => {
    if (people.length === 1) return { status: 'matched', person: people[0]! };
    return { status: people.length ? 'ambiguous' : 'not-found' };
};

export const matchResponsible = (people: EntidadResumen[], profile: ResponsibleProfile): ResponsibleMatch => {
    const candidates = [...new Map(people.filter(p => p.tipoEntidad === 'Persona' && p.id > 0).map(p => [p.id, p])).values()];
    const email = normalizeEmail(profile.email);
    if (email) {
        const emailMatches = candidates.filter(p => [p.correo, p.email].some(value => normalizeEmail(value) === email));
        if (emailMatches.length) return resultFor(emailMatches);
    }

    const names = [profile.name];
    if (profile.given_name?.trim() && profile.family_name?.trim()) names.push(`${profile.given_name} ${profile.family_name}`);
    const validNames = names.filter((name): name is string => Boolean(name?.trim()));
    return resultFor(candidates.filter(person => validNames.some(name => matchesName(person, name))));
};
