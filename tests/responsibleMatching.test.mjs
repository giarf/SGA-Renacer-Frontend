import assert from 'node:assert/strict';
import test from 'node:test';
import { matchResponsible } from '../src/auth/responsibleMatching.ts';

const person = (id, nombres, apellidos, correo) => ({
    id, tipoEntidad: 'Persona', identificador: `TEST-${id}`,
    nombres, apellidos, nombreCompleto: `${nombres} ${apellidos}`, correo
});
const gabriel = person(10, 'Gabriel Andrés Ignacio', 'Rojas Soto', 'gabriel@example.test');
const gabriela = person(570, 'Gabriela', 'Aros');

test('Gabriel Rojas matches both names and surnames, never the first Gabriela result', () => {
    const result = matchResponsible([gabriela, gabriel], { name: 'gabriel rojas', preferred_username: 'gabriel' });
    assert.equal(result.status, 'matched');
    assert.equal(result.person.id, 10);
});

test('a partial or unrelated first result is not a fallback', () => {
    assert.deepEqual(matchResponsible([gabriela], { name: 'Gabriel Rojas' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([gabriel], { name: 'Gabriel Aros' }), { status: 'not-found' });
});

test('first name or username alone never identifies a responsible person', () => {
    assert.deepEqual(matchResponsible([gabriel], { name: 'Gabriel' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([gabriel], { preferred_username: 'gabriel' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([person(1, 'Usuario', 'Prueba')], {}), { status: 'not-found' });
});

test('normalizes accents, case and repeated whitespace in names', () => {
    const p = person(1, 'María José', 'Pérez Soto');
    assert.equal(matchResponsible([p], { name: '  MARIA   PEREZ  ' }).person.id, 1);
});

test('structured Authentik given name and family name are supported', () => {
    assert.equal(matchResponsible([gabriela, gabriel], { given_name: 'Gabriel', family_name: 'Rojas' }).person.id, 10);
});

test('exact email takes priority over display names and is not accent-folded', () => {
    assert.equal(matchResponsible([gabriela, gabriel], { name: 'Gabriela Aros', email: ' GABRIEL@example.test ' }).person.id, 10);
    assert.deepEqual(matchResponsible([gabriel], { email: 'gábriel@example.test' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([gabriel], { email: 'gabriel' }), { status: 'not-found' });
});

test('duplicate exact emails are ambiguous, not decided by list order', () => {
    const other = person(11, 'Pedro', 'Soto', gabriel.correo);
    assert.deepEqual(matchResponsible([gabriel, other], { email: gabriel.correo, name: 'Gabriel Rojas' }), { status: 'ambiguous' });
});

test('homonyms require disambiguation, including one shorter registered full name', () => {
    const other = person(11, 'Gabriel', 'Rojas');
    assert.deepEqual(matchResponsible([gabriel, other], { name: 'Gabriel Rojas' }), { status: 'ambiguous' });
    assert.equal(matchResponsible([gabriel, other], { name: 'Gabriel Andrés Ignacio Rojas Soto' }).person.id, 10);
});

test('names match whole words, in their own given-name and surname fields', () => {
    const people = [person(1, 'Gabriel Rojas', 'Soto'), person(2, 'Gabriel', 'Rojason'), person(3, 'Gabriela', 'Rojas')];
    assert.deepEqual(matchResponsible(people, { name: 'Gabriel Rojas' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([gabriel], { name: 'Rojas Gabriel' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([gabriel], { name: 'Gabriel Rojas Rojas' }), { status: 'not-found' });
});

test('compound names and surnames retain their word order', () => {
    const p = person(1, 'María José', 'De la Cruz Soto');
    assert.equal(matchResponsible([p], { name: 'María José De la Cruz' }).person.id, 1);
});

test('institutions, invalid identifiers and empty identity fields are excluded', () => {
    assert.deepEqual(matchResponsible([{ ...gabriel, tipoEntidad: 'Institucion' }], { name: 'Gabriel Rojas', email: gabriel.correo }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([{ ...gabriel, id: 0 }], { name: 'Gabriel Rojas' }), { status: 'not-found' });
    assert.deepEqual(matchResponsible([person(1, 'Gabriel Rojas', '')], { name: 'Gabriel Rojas' }), { status: 'not-found' });
    assert.equal(matchResponsible([gabriel, gabriel], { name: 'Gabriel Rojas' }).person.id, 10);
});
