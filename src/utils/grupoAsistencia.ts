import type { VinculoApoderado } from '../types';

export interface PersonaGrupo { id: number; nombreCompleto: string; motivos: string[]; porConfirmar: boolean }
interface RelacionesApi {
    getApoderados(id: number): Promise<VinculoApoderado[]>;
    getPersonasACargo(id: number): Promise<VinculoApoderado[]>;
}
export async function cargarGrupoAsistencia(id: number, nombre: string, api: RelacionesApi): Promise<PersonaGrupo[]> {
    const grupo = new Map<number, PersonaGrupo>([[id, { id, nombreCompleto: nombre, motivos: ['Persona buscada'], porConfirmar: false }]]);
    const pendiente = (v: VinculoApoderado) => /vínculo inferido|pendiente de confirmar/i.test(v.observaciones);
    function agregar(v: VinculoApoderado, personaId: number, motivo: string, inferido = false) {
        if (personaId === id) return;
        const p = grupo.get(personaId) ?? { id: personaId, nombreCompleto: v.nombreCompleto, motivos: [], porConfirmar: false };
        if (!p.motivos.includes(motivo)) p.motivos.push(motivo);
        p.porConfirmar ||= pendiente(v) || inferido;
        grupo.set(personaId, p);
    }
    const [apoderados, cargo] = await Promise.all([api.getApoderados(id), api.getPersonasACargo(id)]);
    for (const v of apoderados) agregar(v, v.apoderadoId, `Apoderado de ${nombre}`);
    for (const v of cargo) agregar(v, v.personaId, `A cargo de ${nombre}`);
    // Solo dos saltos desde la persona buscada: no recorrer familias extendidas.
    const [otrosNinos, otrosApoderados] = await Promise.all([
        Promise.all(apoderados.map(async v => ({ origen: v, lista: await api.getPersonasACargo(v.apoderadoId) }))),
        Promise.all(cargo.map(async v => ({ origen: v, lista: await api.getApoderados(v.personaId) })))
    ]);
    for (const { origen, lista } of otrosNinos)
        for (const v of lista) agregar(v, v.personaId, `Comparte apoderado: ${origen.nombreCompleto}`, pendiente(origen));
    for (const { origen, lista } of otrosApoderados)
        for (const v of lista) agregar(v, v.apoderadoId, `Apoderado de ${origen.nombreCompleto}`, pendiente(origen));
    return [...grupo.values()];
}
