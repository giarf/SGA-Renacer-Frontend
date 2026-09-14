import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../src/utils/search.ts';

const nombre = 'Gabriel Inti Alejandro Rojas Ferrada';
for (const query of ['GABRIEL ROJAS', 'gabriel rojas', ' Rojas   Gabriel ', 'gab roj', 'ferrada inti']) {
    test(`encuentra nombres compuestos: ${query}`, () => assert(matchesSearch(query, nombre)));
}
for (const query of ['MARIA JOSE PEREZ', 'María pérez', 'perez maria', 'mari\u0301a jose\u0301']) {
    test(`ignora tildes y orden: ${query}`, () => assert(matchesSearch(query, 'María José Pérez')));
}
for (const query of ['12345678k', '12.345.678-K', '12345678-K', '345678k']) {
    test(`RUT con y sin formato: ${query}`, () => {
        assert(matchesSearch(query, 'Ana', '12.345.678-K'));
        assert(matchesSearch(query, 'Ana', '12345678k'));
    });
}
test('todas las palabras deben coincidir; nunca asigna identidades', () => {
    assert(!matchesSearch('Gabriel Rojas', 'Gabriela Aros'));
    assert(!matchesSearch('Gabriel Pérez', nombre));
    assert(!matchesSearch('%', nombre));
    assert(!matchesSearch('_', nombre));
    assert(!matchesSearch('zzz', nombre));
});
test('admite campos opcionales, espacios y puntuación', () => {
    assert(matchesSearch('  ', null, undefined));
    assert(matchesSearch('ana maria', 'Ana-María'));
    assert(matchesSearch('perez quillota', 'Ana Pérez', 'Quillota'));
    assert(matchesSearch('termica ropa', 'Manta térmica', 'Ropa'));
});
