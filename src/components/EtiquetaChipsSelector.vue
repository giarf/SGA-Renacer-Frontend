<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiService } from '../api/apiService';
import type { Etiqueta } from '../types';

const props = withDefaults(defineProps<{
    modelValue: number[];
    label?: string;
    helper?: string;
}>(), {
    label: 'Etiquetas',
    helper: 'Selecciona etiquetas para clasificar a esta persona.'
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: number[]): void;
}>();

const etiquetas = ref<Etiqueta[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const selectedIds = computed(() => new Set(props.modelValue));

const loadEtiquetas = async () => {
    loading.value = true;
    error.value = null;
    try {
        etiquetas.value = await apiService.getEtiquetas();
    } catch (e: any) {
        error.value = e.message || 'No se pudieron cargar las etiquetas.';
    } finally {
        loading.value = false;
    }
};

const toggleEtiqueta = (id: number) => {
    const next = new Set(props.modelValue);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit('update:modelValue', Array.from(next));
};

onMounted(loadEtiquetas);
</script>

<template>
    <div class="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-muted)]/30 p-3">
        <div class="mb-2 flex items-start justify-between gap-3">
            <div>
                <label class="block text-sm font-semibold text-[var(--text-muted)]">{{ label }}</label>
                <p class="text-xs text-[var(--text-muted)]">{{ helper }}</p>
            </div>
            <button type="button" class="text-xs font-semibold text-[var(--accent-color)] hover:underline" :disabled="loading" @click="loadEtiquetas">
                Actualizar
            </button>
        </div>

        <div v-if="loading" class="text-sm text-[var(--text-muted)]">Cargando etiquetas...</div>
        <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
        <div v-else-if="etiquetas.length === 0" class="text-sm text-[var(--text-muted)]">No hay etiquetas creadas.</div>
        <div v-else class="flex flex-wrap gap-2">
            <button
                v-for="etiqueta in etiquetas"
                :key="etiqueta.id"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                :class="selectedIds.has(etiqueta.id)
                    ? 'border-[var(--accent-color)] bg-[var(--accent-color)] text-white shadow-sm'
                    : 'border-[var(--card-border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]'"
                @click="toggleEtiqueta(etiqueta.id)"
            >
                #{{ etiqueta.nombre }}
            </button>
        </div>
    </div>
</template>
