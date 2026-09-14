<script setup lang="ts">
import { ref, watch } from 'vue';
import { apiService } from '../api/apiService';
import type { EntidadResumen, VinculoApoderado } from '../types';
const props = defineProps<{ personaId: number }>();
const apoderados = ref<VinculoApoderado[]>([]);
const cargo = ref<VinculoApoderado[]>([]);
const resultados = ref<EntidadResumen[]>([]);
const busqueda = ref('');
const seleccionado = ref<EntidadResumen | null>(null);
const parentesco = ref('Otro');
const principal = ref(false);
const observaciones = ref('');
const inverso = ref(false);
const ocupado = ref(false);
const error = ref('');
const mensaje = ref('');
let generation = 0;
let searchGeneration = 0;
async function cargar() {
    const version = ++generation;
    try {
        const [a, b] = await Promise.all([apiService.getApoderados(props.personaId), apiService.getPersonasACargo(props.personaId)]);
        if (version === generation) { apoderados.value = a; cargo.value = b; }
    } catch (e) { if (version === generation) error.value = e instanceof Error ? e.message : 'No se pudieron cargar los vínculos.'; }
}
function limpiar() { seleccionado.value = null; resultados.value = []; busqueda.value = ''; parentesco.value = 'Otro'; principal.value = false; observaciones.value = ''; searchGeneration++; }
watch(() => props.personaId, () => { limpiar(); error.value = ''; mensaje.value = ''; apoderados.value = []; cargo.value = []; void cargar(); }, { immediate: true });
watch(inverso, limpiar);
async function buscar() {
    const version = ++searchGeneration;
    error.value = '';
    if (busqueda.value.trim().length < 2) { resultados.value = []; return; }
    try {
        const found = await apiService.buscarEntidades(busqueda.value.trim(), 'PersonaNatural');
        if (version === searchGeneration) resultados.value = found.filter(p => p.id !== props.personaId).slice(0, 15);
    } catch (e) { if (version === searchGeneration) error.value = e instanceof Error ? e.message : 'Error al buscar.'; }
}
function editar(v: VinculoApoderado, reverse: boolean) {
    inverso.value = reverse;
    // El formulario se completa tras el cambio de dirección.
    queueMicrotask(() => {
        seleccionado.value = { id: reverse ? v.personaId : v.apoderadoId, nombreCompleto: v.nombreCompleto, tipoEntidad: 'PersonaNatural', identificador: v.rut ?? '' };
        parentesco.value = v.parentesco; principal.value = v.esContactoPrincipal; observaciones.value = v.observaciones;
    });
}
async function guardar() {
    if (!seleccionado.value) return;
    ocupado.value = true; error.value = ''; mensaje.value = '';
    try {
        await apiService.guardarApoderado(inverso.value ? seleccionado.value.id : props.personaId, inverso.value ? props.personaId : seleccionado.value.id,
            { parentesco: parentesco.value, esContactoPrincipal: principal.value, observaciones: observaciones.value });
        limpiar(); await cargar(); mensaje.value = 'Vínculo guardado.';
    } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo guardar.'; }
    finally { ocupado.value = false; }
}
async function quitar(v: VinculoApoderado) {
    ocupado.value = true; error.value = ''; mensaje.value = '';
    try { await apiService.quitarApoderado(v.personaId, v.apoderadoId); await cargar(); mensaje.value = 'Vínculo eliminado. Ambas personas conservan sus fichas.'; }
    catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo quitar.'; }
    finally { ocupado.value = false; }
}
</script>

<template>
    <section class="surface-card rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <h3 class="font-semibold">Apoderados y personas a cargo</h3>
        <p class="text-sm text-gray-500">Los vínculos se guardan con su propio botón, independientemente de los datos de la ficha.</p>
        <p v-if="error" role="alert" class="text-red-600">{{ error }}</p>
        <p v-if="mensaje" role="status" class="text-green-700 dark:text-green-400">{{ mensaje }}</p>
        <div v-for="grupo in [{ titulo: 'Apoderados', lista: apoderados, reverse: false }, { titulo: 'Personas a cargo', lista: cargo, reverse: true }]" :key="grupo.titulo" class="space-y-2">
            <h4 class="font-medium">{{ grupo.titulo }}</h4>
            <p v-if="!grupo.lista.length" class="text-sm text-gray-500">Sin vínculos registrados.</p>
            <div v-for="v in grupo.lista" :key="`${v.personaId}-${v.apoderadoId}`" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div class="font-medium">{{ v.nombreCompleto }}</div>
                <div class="text-sm">{{ grupo.reverse ? 'Tu parentesco: ' : '' }}{{ v.parentesco }} · {{ v.esContactoPrincipal ? 'Contacto principal' : 'Contacto adicional' }}</div>
                <a v-if="v.telefono" :href="`tel:${v.telefono}`" class="text-sm underline">{{ v.telefono }}</a>
                <p v-if="v.observaciones" class="text-sm whitespace-pre-wrap">{{ v.observaciones }}</p>
                <div class="flex gap-3 mt-2"><button type="button" class="underline text-sm" :disabled="ocupado" @click="editar(v, grupo.reverse)">Editar vínculo</button><button type="button" class="underline text-sm" :disabled="ocupado" @click="quitar(v)">Quitar vínculo</button></div>
            </div>
        </div>
        <fieldset :disabled="ocupado" class="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <legend class="font-medium">Agregar o editar vínculo</legend>
            <label class="block text-sm">Relación
                <select v-model="inverso" class="block w-full border rounded p-2 bg-transparent"><option :value="false">Agregar apoderado a esta persona</option><option :value="true">Esta persona será apoderada de…</option></select>
            </label>
            <div class="flex gap-2"><input v-model="busqueda" aria-label="Buscar persona existente" placeholder="Nombre o RUT de una persona existente" class="border rounded p-2 w-full bg-transparent" @keydown.enter.prevent="buscar" /><button type="button" class="btn-secondary" @click="buscar">Buscar</button></div>
            <button v-for="p in resultados" :key="p.id" type="button" class="block text-left w-full border rounded p-2" @click="seleccionado = p; resultados = []">{{ p.nombreCompleto }} · {{ p.identificador }}</button>
            <p v-if="seleccionado" class="font-medium">Seleccionado: {{ seleccionado.nombreCompleto }}</p>
            <label class="block text-sm">Parentesco del apoderado con la persona a cargo<select v-model="parentesco" class="block w-full border rounded p-2 bg-transparent"><option v-for="p in ['Madre','Padre','Abuela','Abuelo','Tutor/a','Otro']" :key="p">{{ p }}</option></select></label>
            <label class="flex gap-2 text-sm"><input v-model="principal" type="checkbox" /> Contacto principal (reemplaza al principal anterior)</label>
            <label class="block text-sm">Observaciones<textarea v-model="observaciones" maxlength="2000" class="block w-full border rounded p-2 bg-transparent" /></label>
            <button type="button" class="btn-primary" :disabled="!seleccionado || ocupado" @click="guardar">{{ ocupado ? 'Guardando…' : 'Guardar vínculo' }}</button>
        </fieldset>
    </section>
</template>
