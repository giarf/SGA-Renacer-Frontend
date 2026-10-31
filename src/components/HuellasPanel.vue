<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FingerprintPattern, LoaderCircle, Trash2 } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import type { HuellaRegistrada } from '../types';

const props = defineProps<{ personaId: number }>();
const NOMBRES: Record<string, string> = {
    pulgar_derecho: 'Pulgar derecho', indice_derecho: 'Índice derecho', medio_derecho: 'Medio derecho', anular_derecho: 'Anular derecho', menique_derecho: 'Meñique derecho',
    pulgar_izquierdo: 'Pulgar izquierdo', indice_izquierdo: 'Índice izquierdo', medio_izquierdo: 'Medio izquierdo', anular_izquierdo: 'Anular izquierdo', menique_izquierdo: 'Meñique izquierdo'
};
const dedos = ref<string[]>(Object.keys(NOMBRES));
const huellas = ref<HuellaRegistrada[]>([]);
const dedo = ref('indice_derecho');
const cargando = ref(false);
const leyendo = ref(false);
const ocupado = computed(() => cargando.value || leyendo.value);
const error = ref('');
const mensaje = ref('');
const reemplaza = computed(() => huellas.value.some(h => h.dedo === dedo.value));
const nombreDedo = (value: string) => NOMBRES[value] ?? value;
const fecha = (value: string) => new Date(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
let generation = 0;

async function cargar() {
    const version = ++generation;
    cargando.value = true;
    error.value = '';
    try {
        const data = await apiService.getHuellas(props.personaId);
        if (version !== generation) return;
        huellas.value = data.huellas;
        if (data.dedos.length) dedos.value = data.dedos;
    } catch (e) {
        if (version === generation) error.value = e instanceof Error ? e.message : 'No se pudieron cargar las huellas.';
    } finally {
        if (version === generation) cargando.value = false;
    }
}
watch(() => props.personaId, () => { huellas.value = []; mensaje.value = ''; void cargar(); }, { immediate: true });

async function registrar() {
    if (ocupado.value) return;
    leyendo.value = true; error.value = ''; mensaje.value = '';
    try {
        const huella = await apiService.registrarHuella(props.personaId, dedo.value);
        huellas.value = [...huellas.value.filter(h => h.dedo !== huella.dedo), huella];
        mensaje.value = `${nombreDedo(huella.dedo)} registrado.`;
    } catch (e) {
        error.value = e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'El huellero no respondió a tiempo. Intenta nuevamente.';
    } finally {
        leyendo.value = false;
    }
}

async function quitar(huella: HuellaRegistrada) {
    if (ocupado.value) return;
    cargando.value = true; error.value = ''; mensaje.value = '';
    try {
        await apiService.eliminarHuella(props.personaId, huella.id);
        huellas.value = huellas.value.filter(h => h.id !== huella.id);
        mensaje.value = `${nombreDedo(huella.dedo)} eliminado.`;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'No se pudo eliminar la huella.';
    } finally {
        cargando.value = false;
    }
}
</script>

<template>
    <section class="fingerprints" aria-labelledby="fingerprints-title">
        <div class="fingerprints-heading">
            <span class="fingerprints-icon"><FingerprintPattern :size="20" aria-hidden="true" /></span>
            <div>
                <h4 id="fingerprints-title">Huellas digitales</h4>
                <p>Se guardan con su propio botón, independientemente de los datos de la ficha.</p>
            </div>
        </div>
        <p v-if="error" role="alert" class="fingerprints-error">{{ error }}</p>
        <p v-if="mensaje" role="status" class="fingerprints-ok">{{ mensaje }}</p>
        <ul v-if="huellas.length" class="fingerprints-list">
            <li v-for="h in huellas" :key="h.id">
                <span><strong>{{ nombreDedo(h.dedo) }}</strong><small>Registrada el {{ fecha(h.registrada) }}<template v-if="h.calidad != null"> · Calidad {{ h.calidad }}</template></small></span>
                <button type="button" class="btn-ghost !p-2" :aria-label="`Eliminar huella ${nombreDedo(h.dedo)}`" :disabled="ocupado" @click="quitar(h)"><Trash2 :size="16" /></button>
            </li>
        </ul>
        <p v-else-if="!cargando" class="fingerprints-empty">Sin huellas registradas.</p>
        <div class="fingerprints-actions">
            <label class="sr-only" for="fingerprint-finger">Dedo</label>
            <select id="fingerprint-finger" v-model="dedo" :disabled="ocupado">
                <option v-for="d in dedos" :key="d" :value="d">{{ nombreDedo(d) }}{{ huellas.some(h => h.dedo === d) ? ' (registrado)' : '' }}</option>
            </select>
            <button type="button" class="btn-primary" :disabled="ocupado" @click="registrar">
                <LoaderCircle v-if="leyendo" :size="18" class="animate-spin" aria-hidden="true" />
                <FingerprintPattern v-else :size="18" aria-hidden="true" />
                {{ leyendo ? 'Pon y retira el dedo 5 veces…' : reemplaza ? 'Volver a registrar' : 'Registrar huella' }}
            </button>
        </div>
    </section>
</template>

<style scoped>
.fingerprints { display: grid; gap: .85rem; padding: 1rem; border: 1px solid var(--card-border); border-radius: 1rem; background: var(--bg-card); }
.fingerprints-heading { display: flex; gap: .75rem; align-items: center; }
.fingerprints-heading h4 { font-size: .9rem; font-weight: 650; color: var(--text-primary); margin: 0; }
.fingerprints-heading p { font-size: .75rem; color: var(--text-muted); margin-top: .15rem; }
.fingerprints-icon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: .7rem; flex-shrink: 0; color: var(--accent-color); background: var(--accent-color-muted); }
.fingerprints-error { font-size: .85rem; padding: .6rem .8rem; border-radius: .6rem; background: var(--surface-strong); border-left: 3px solid #d58925; }
.fingerprints-ok { font-size: .85rem; padding: .6rem .8rem; border-radius: .6rem; background: var(--accent-color-muted); }
.fingerprints-list { display: grid; gap: .4rem; }
.fingerprints-list li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .75rem; border-radius: .6rem; background: var(--surface-muted); }
.fingerprints-list strong, .fingerprints-list small { display: block; }
.fingerprints-list strong { font-size: .85rem; }
.fingerprints-list small { font-size: .72rem; color: var(--text-muted); }
.fingerprints-empty { font-size: .8rem; color: var(--text-muted); }
.fingerprints-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
.fingerprints-actions select { flex: 1; min-width: 10rem; width: auto; }
.fingerprints-actions button:disabled { opacity: .55; cursor: not-allowed; }
</style>
