import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCodigoValido, fusionarLinea, crearFiltroRepetidos, parseCantidad, normalizarCodigo } from '../src/utils/barcode.ts';

test('acepta EAN-13, EAN-8 y UPC-A con dígito verificador correcto', () => {
    assert(esCodigoValido('7802800716098'));
    assert(esCodigoValido('4006381333931'));
    assert(esCodigoValido('96385074'));
    assert(esCodigoValido('036000291452'));
    assert(esCodigoValido(' 7802800716098 '));
});

test('rechaza verificador incorrecto, largos inválidos y caracteres', () => {
    assert(!esCodigoValido('7802800716099'));
    assert(!esCodigoValido('96385075'));
    assert(!esCodigoValido('036000291453'));
    assert(!esCodigoValido('123'));
    assert(!esCodigoValido('12345678901234'));
    assert(!esCodigoValido('780280071609X'));
    assert(!esCodigoValido('780-2800716098'));
    assert(!esCodigoValido(''));
    assert(!esCodigoValido(null));
});

test('normalizarCodigo deja solo dígitos', () => {
    assert.equal(normalizarCodigo(' 780-280 '), '780280');
});

test('fusiona por código de barras sumando cantidad y conservando precio', () => {
    const lista = [{ codigoBarras: '7802800716098', nombre: 'Avena', cantidad: 2, precio: 1500 }];
    const { lista: nueva, fusionada } = fusionarLinea(lista, { codigoBarras: '7802800716098', nombre: 'Avena', cantidad: 1.5, precio: 1800 });
    assert(fusionada);
    assert.equal(nueva.length, 1);
    assert.equal(nueva[0].cantidad, 3.5);
    assert.equal(nueva[0].precio, 1500);
    assert.equal(lista[0].cantidad, 2, 'no muta la lista original');
});

test('fusiona por itemCatalogoId y completa el código faltante', () => {
    const lista = [{ itemCatalogoId: 7, nombre: 'Arroz', cantidad: 1 }];
    const { lista: nueva, fusionada } = fusionarLinea(lista, { itemCatalogoId: 7, codigoBarras: '96385074', nombre: 'Arroz', cantidad: 1 });
    assert(fusionada);
    assert.equal(nueva[0].cantidad, 2);
    assert.equal(nueva[0].codigoBarras, '96385074');
});

test('agrega línea nueva si no coincide código ni ítem', () => {
    const lista = [{ itemCatalogoId: 7, codigoBarras: '96385074', cantidad: 1 }];
    const { lista: nueva, fusionada } = fusionarLinea(lista, { codigoBarras: '7802800716098', cantidad: 1 });
    assert(!fusionada);
    assert.equal(nueva.length, 2);
    // ítems nuevos sin id ni código no se fusionan entre sí
    assert.equal(fusionarLinea([{ cantidad: 1 }], { cantidad: 1 }).lista.length, 2);
});

test('filtro de repetidos ignora el mismo código durante la ventana', () => {
    const procesar = crearFiltroRepetidos(2000);
    assert(procesar('A', 0));
    assert(!procesar('A', 500));
    assert(!procesar('A', 2400), 'cada avistamiento renueva la ventana');
    assert(procesar('B', 2500));
    assert(procesar('A', 2600));
    assert(procesar('A', 5000));
});

test('parseCantidad acepta coma decimal', () => {
    assert.equal(parseCantidad('1,5'), 1.5);
    assert.equal(parseCantidad('3'), 3);
    assert(Number.isNaN(parseCantidad('abc')));
    assert(Number.isNaN(parseCantidad('')));
});
