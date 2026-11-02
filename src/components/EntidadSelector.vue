<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { EntidadResumen } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';

// Mismo buscador de entidades que usan los formularios de registro (donador, responsable, gestor).
const props = withDefaults(defineProps<{
    modelValue: EntidadResumen | null;
    label: string;
    required?: boolean;
    locked?: boolean;
    lockedHint?: string;
    placeholder?: string;
}>(), {
    required: false,
    locked: false,
    lockedHint: '',
    placeholder: 'Buscar por nombre o RUT...'
});

const emit = defineEmits<{ 'update:modelValue': [value: EntidadResumen | null] }>();

const query = ref('');
const results = ref<EntidadResumen[]>([]);
const loading = ref(false);
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

const buscar = () => {
    if (timer) clearTimeout(timer);
    const texto = query.value.trim();
    if (texto.length < 2) {
        results.value = [];
        return;
    }
    timer = setTimeout(async () => {
        const seq = ++requestSeq;
        loading.value = true;
        try {
            const data = await apiService.buscarEntidades(texto);
            if (seq === requestSeq) results.value = data;
        } catch {
            if (seq === requestSeq) results.value = [];
        } finally {
            if (seq === requestSeq) loading.value = false;
        }
    }, 300);
};

const seleccionar = (entidad: EntidadResumen) => {
    emit('update:modelValue', entidad);
    query.value = '';
    results.value = [];
    open.value = false;
};

const cambiar = () => emit('update:modelValue', null);

onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
});
</script>

<template>
    <div class="relative">
        <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">
            {{ props.label }} <span v-if="props.required" class="text-red-500">*</span>
        </label>

        <div v-if="props.modelValue" class="selected-card flex flex-col gap-1 p-3">
            <span class="font-semibold text-[var(--text-primary)]">{{ props.modelValue.nombreCompleto }}</span>
            <span v-if="props.modelValue.identificador" class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(props.modelValue.identificador) }}</span>
            <span v-if="props.locked && props.lockedHint" class="text-xs text-[var(--text-muted)]">{{ props.lockedHint }}</span>
            <button
                v-if="!props.locked"
                type="button"
                class="self-start text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]"
                @click="cambiar"
            >
                Cambiar
            </button>
        </div>

        <div v-else-if="props.locked" class="form-panel-muted p-3 text-sm text-[var(--text-muted)]">
            Sin asignar
        </div>

        <div v-else>
            <input
                v-model="query"
                type="text"
                :placeholder="props.placeholder"
                class="compact-control"
                @input="buscar"
                @focus="open = true"
            />
            <div v-if="open && query.trim().length >= 2" class="dropdown-panel absolute z-30 mt-1 max-h-60 w-full overflow-auto">
                <div v-if="loading" class="p-4 text-center text-sm text-[var(--text-muted)]">Buscando...</div>
                <ul v-else-if="results.length > 0">
                    <li v-for="entidad in results" :key="entidad.id" @click="seleccionar(entidad)">
                        <p class="font-medium text-[var(--text-primary)]">{{ entidad.nombreCompleto }}</p>
                        <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(entidad.identificador) }}</p>
                    </li>
                </ul>
                <div v-else class="p-4 text-center text-sm text-[var(--text-muted)]">No se encontraron resultados</div>
            </div>
        </div>
    </div>
</template>
