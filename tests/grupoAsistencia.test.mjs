import assert from 'node:assert/strict';
import test from 'node:test';
import { cargarGrupoAsistencia } from '../src/utils/grupoAsistencia.ts';

const names = { 1: 'Niño', 2: 'Madre', 3: 'Padre', 4: 'Hermana', 5: 'Otro niño', 6: 'Otra apoderada', 7: 'Familia lejana' };
const edges = [[1,2],[1,3],[4,2],[4,3],[5,3],[5,6],[7,6]];
function fixture() {
    const calls = [];
    const row = (p,a,reverse) => ({ personaId:p, apoderadoId:a, nombreCompleto:names[reverse?p:a], parentesco:'Otro', esContactoPrincipal:false, observaciones: p===5 ? 'Vínculo inferido' : '' });
    return { calls,
        async getApoderados(id) { calls.push(['apoderados',id]); return edges.filter(([p]) => p===id).map(([p,a])=>row(p,a,false)); },
        async getPersonasACargo(id) { calls.push(['cargo',id]); return edges.filter(([,a])=>a===id).map(([p,a])=>row(p,a,true)); }
    };
}
test('buscar niño muestra ambos apoderados y niños compartidos sin duplicar ni expandir indefinidamente', async () => {
    const api=fixture(); const group=await cargarGrupoAsistencia(1,'Niño',api);
    assert.deepEqual(group.map(p=>p.id),[1,2,3,4,5]);
    assert.equal(group.find(p=>p.id===4).motivos.length,2);
    assert.equal(group.find(p=>p.id===5).porConfirmar,true);
    assert.equal(api.calls.length,4);
});
test('buscar apoderado muestra personas a cargo y sus otros apoderados', async () => {
    const group=await cargarGrupoAsistencia(2,'Madre',fixture());
    assert.deepEqual(group.map(p=>p.id),[2,1,4,3]);
    assert.equal(group.find(p=>p.id===3).motivos.length,2);
});
test('persona sin vínculos se puede registrar sola', async () => {
    assert.deepEqual(await cargarGrupoAsistencia(99,'Sin vínculos',fixture()),[{id:99,nombreCompleto:'Sin vínculos',motivos:['Persona buscada'],porConfirmar:false}]);
});
test('fallos al consultar no se presentan como grupo vacío', async () => {
    const api=fixture(); api.getPersonasACargo=async()=>{throw new Error('Sin conexión');};
    await assert.rejects(cargarGrupoAsistencia(1,'Niño',api),/Sin conexión/);
});
