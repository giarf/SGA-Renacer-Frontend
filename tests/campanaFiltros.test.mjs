import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumpleFiltros, describirFiltro, opcionesLista, textoFicha } from '../src/utils/campanaFiltros.ts';

const col = (id, tipo, clave = null, nombre = `Col ${id}`) => ({ id, nombre, tipo, clave, mensaje: '', destinatario: 'colaborador', version: 1 });
const columnas = [
    col(1, 'boolean', 'huella', 'Huella lista'),
    col(2, 'ficha', 'beneficiario.edad', 'Edad'),
    col(3, 'ficha', 'beneficiario.sector', 'Sector'),
    col(4, 'ficha', 'beneficiario.apoderado', 'Apoderado'),
    col(5, 'ficha', 'padrino.telefono', 'Teléfono del padrino'),
];
const persona = (nombre, ficha, padrino = null, huella = false) => ({
    id: nombre.length, version: 1, beneficiario: { id: 1, nombreCompleto: nombre, ficha }, padrino,
    valores: huella ? { 1: { valor: true, version: 1, actualizadoEn: '' } } : {},
});
const ana = persona('Ana', { edad: 7, sector: 'Cerro Mayaca', apoderado: { nombre: 'José Pérez', parentesco: 'Padre', telefono: '+56912345678' } },
    { id: 9, nombreCompleto: 'Carolina', ficha: { telefono: '+56987654321' } }, true);
const beto = persona('Beto', { edad: 12, sector: 'Altos de Serrano' });
const cami = persona('Cami', {});
const todos = [ana, beto, cami];
const filtrar = filtros => todos.filter(p => cumpleFiltros(p, filtros, columnas)).map(p => p.beneficiario.nombreCompleto);

test('rango de edad inclusivo; sin dato solo pasa si el rango está vacío', () => {
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'rango', columnaId: 2, desde: null, hasta: 9 }]), ['Ana']);
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'rango', columnaId: 2, desde: 7, hasta: 12 }]), ['Ana', 'Beto']);
});
test('lista por valor exacto, incluida la opción "sin dato"', () => {
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'lista', columnaId: 3, valor: 'Altos de Serrano' }]), ['Beto']);
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'lista', columnaId: 3, valor: '' }]), ['Cami']);
    assert.deepEqual(opcionesLista(todos, columnas[2]), ['Altos de Serrano', 'Cerro Mayaca', '']);
});
test('texto busca sin tildes dentro del apoderado (nombre, parentesco y teléfono)', () => {
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'texto', columnaId: 4, texto: 'jose perez' }]), ['Ana']);
    assert.equal(textoFicha(ana, columnas[3]), 'José Pérez (Padre) +56912345678');
});
test('casillas, padrino y datos del padrino se combinan con Y', () => {
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'casilla', columnaId: 1, marcada: false }]), ['Beto', 'Cami']);
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'padrino', con: true }, { id: 'b', tipo: 'casilla', columnaId: 1, marcada: true }]), ['Ana']);
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'texto', columnaId: 5, texto: '987' }]), ['Ana']);
    assert.deepEqual(filtrar([{ id: 'a', tipo: 'rango', columnaId: 2, desde: null, hasta: 9 }, { id: 'b', tipo: 'casilla', columnaId: 1, marcada: false }]), []);
});
test('un filtro de una columna eliminada no restringe y se describe como tal', () => {
    const f = { id: 'a', tipo: 'casilla', columnaId: 99, marcada: true };
    assert.deepEqual(filtrar([f]), ['Ana', 'Beto', 'Cami']);
    assert.equal(describirFiltro(f, columnas), 'Columna eliminada: marcado');
    assert.equal(describirFiltro({ id: 'b', tipo: 'rango', columnaId: 2, desde: null, hasta: 9 }, columnas), 'Edad: hasta 9');
});
