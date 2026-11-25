<script setup lang="ts">
import { computed, ref } from 'vue';
import { Star, X } from 'lucide-vue-next';
import type { ColumnaCampana, GuardarValorCampana, ValorCampana } from '../types';

const props = defineProps<{ columna: ColumnaCampana; dato?: ValorCampana; label: string; readonly: boolean; saveValue: (dato: GuardarValorCampana) => Promise<ValorCampana> }>();
const saving = ref(false);
const error = ref('');
const current = computed(() => props.dato?.valor ?? null);
const rating = computed(() => typeof current.value === 'number' ? current.value : null);
async function save(valor: string | number | null) {
    if (props.readonly || saving.value || valor === current.value) return;
    saving.value = true;
    error.value = '';
    try { await props.saveValue({ valor, version: props.dato?.version ?? 0, columnaVersion: props.columna.version }); }
    catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo guardar.'; }
    finally { saving.value = false; }
}
async function select(event: Event) {
    const input = event.target as HTMLSelectElement;
    await save(input.value || null);
    input.value = typeof current.value === 'string' ? current.value : '';
}
</script>

<template>
    <div>
        <select v-if="columna.tipo === 'select'" class="option-select" :aria-label="label" :value="current ?? ''" :disabled="readonly || saving" @change="select">
            <option value="">Sin estado</option>
            <option v-for="opcion in columna.opciones" :key="opcion.id" :value="opcion.id">{{ opcion.nombre }}</option>
        </select>
        <div v-else class="rating" role="group" :aria-label="`${label}: ${rating === null ? 'sin calificar' : `${rating} de 5 estrellas`}`">
            <button type="button" :disabled="readonly || saving" :aria-pressed="rating === 0" aria-label="0 estrellas" title="0 estrellas" @click="save(0)">0</button>
            <button v-for="n in 5" :key="n" type="button" :disabled="readonly || saving" :aria-pressed="rating === n" :aria-label="n === 1 ? '1 estrella' : `${n} estrellas`" @click="save(n)"><Star :size="15" :class="{ filled: n <= (rating ?? 0) }" /></button>
            <button v-if="rating !== null && !readonly" type="button" :disabled="saving" aria-label="Quitar calificación" title="Quitar calificación" @click="save(null)"><X :size="13" /></button>
        </div>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
    </div>
</template>

<style scoped>
.option-select { min-width: 8rem; max-width: 17rem; min-height: 28px; padding-block: .2rem; font-size: .78rem; }
.rating { display: flex; align-items: center; gap: .15rem; min-width: 10rem; color: var(--text-muted); }
.rating button { display: grid; place-items: center; width: 21px; height: 26px; border-radius: .25rem; font-size: .72rem; }
.rating button:hover:not(:disabled), .rating button[aria-pressed="true"] { background: var(--accent-color-muted); color: var(--text-primary); }
.filled { fill: currentColor; color: var(--accent-color); }
.error { max-width: 15rem; color: var(--text-primary); font-size: .72rem; margin-top: .25rem; }
</style>
