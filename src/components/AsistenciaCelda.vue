<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Minus, LoaderCircle } from 'lucide-vue-next';
import { ApiError } from '../api/apiService';
import type { ColumnaAsistencia, DatoAsistencia, ValorAsistencia } from '../types';

const props = defineProps<{ personaNombre: string; columna: ColumnaAsistencia; dato?: ValorAsistencia; saveValue: (dato: ValorAsistencia) => Promise<ValorAsistencia> }>();
const editing = ref(false);
const draft = ref('');
const baseVersion = ref(0);
const saving = ref(false);
const error = ref('');
const conflict = ref(false);
const current = computed(() => props.dato?.valor ?? null);
const label = computed(() => `${props.columna.nombre} · ${props.personaNombre}`);

function begin() {
    if (editing.value) return;
    editing.value = true;
    draft.value = current.value === null ? '' : String(current.value);
    baseVersion.value = props.dato?.version ?? 0;
}
function discard() { editing.value = false; error.value = ''; conflict.value = false; }

async function save(value: DatoAsistencia, version: number) {
    if (saving.value) return;
    saving.value = true;
    error.value = '';
    try {
        await props.saveValue({ valor: value, version });
        discard();
    } catch (e) {
        conflict.value = e instanceof ApiError && e.status === 409;
        error.value = e instanceof Error ? e.message : 'No se pudo guardar.';
    } finally {
        saving.value = false;
    }
}

async function saveDraft(retry = false) {
    if (!editing.value || saving.value || (error.value && !retry)) return;
    let value: DatoAsistencia = draft.value;
    if (props.columna.tipo === 'number') {
        value = draft.value.trim() === '' ? null : Number(draft.value.replace(',', '.'));
        if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 1e12)) {
            error.value = 'Escribe un número válido, hasta un billón.';
            return;
        }
    } else if (draft.value === '') value = null;
    if (value === current.value) return discard();
    await save(value, retry ? (props.dato?.version ?? 0) : baseVersion.value);
}
</script>

<template>
    <div class="attendance-cell">
        <button v-if="columna.tipo === 'boolean'" type="button" class="check-cell" :class="{ checked: current === true }"
            :disabled="saving" :aria-label="label" :aria-pressed="current === true" @click="save(current !== true, dato?.version ?? 0)">
            <LoaderCircle v-if="saving" :size="16" class="animate-spin" />
            <Check v-else-if="current === true" :size="16" />
            <Minus v-else :size="16" />
            {{ current === true ? 'Sí' : current === false ? 'No' : 'Sin marcar' }}
        </button>
        <div v-else class="relative">
            <input :value="editing ? draft : (current ?? '')" :aria-label="label" :disabled="saving"
                :inputmode="columna.tipo === 'number' ? 'decimal' : 'text'" :maxlength="columna.tipo === 'text' ? 2000 : 30"
                placeholder="—" class="value-input" @focus="begin" @input="begin(); draft = ($event.target as HTMLInputElement).value; error = ''; conflict = false"
                @blur="saveDraft()" @keydown.enter.prevent="saveDraft()" @keydown.esc.prevent="discard" />
            <LoaderCircle v-if="saving" :size="14" class="absolute right-2 top-3 animate-spin" />
        </div>
        <div v-if="error" class="cell-error" role="alert">
            <p>{{ error }}</p>
            <template v-if="columna.tipo !== 'boolean'">
                <p v-if="conflict">Valor actual: {{ current ?? 'vacío' }}</p>
                <button type="button" @click="saveDraft(true)">{{ conflict ? 'Guardar mi valor' : 'Reintentar' }}</button>
                <button type="button" @click="discard">Descartar edición</button>
            </template>
        </div>
    </div>
</template>

<style scoped>
.attendance-cell { min-width: 150px; max-width: 270px; }
.check-cell { display: inline-flex; gap: .5rem; align-items: center; padding: .5rem .8rem; min-height: 40px; border: 1px solid var(--card-border); border-radius: .6rem; color: var(--text-muted); background: var(--bg-card); white-space: nowrap; }
.check-cell.checked { background: var(--accent-color-muted); color: var(--accent-color); border-color: var(--accent-color); font-weight: 700; }
.value-input { padding: .5rem .65rem; border-color: transparent; box-shadow: none; border-radius: .5rem; background: transparent; }
.value-input:hover, .value-input:focus { border-color: var(--input-border); background: var(--input-bg); }
.cell-error { margin-top: .4rem; font-size: .75rem; color: var(--text-primary); white-space: normal; }
.cell-error button { text-decoration: underline; margin: .4rem .6rem 0 0; color: var(--accent-color); }
button:disabled { opacity: .5; }
</style>
