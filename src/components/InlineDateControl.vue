<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
    modelValue: string;
    label?: string;
}>();

const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void;
}>();

const editing = ref(false);
const today = new Date().toISOString().split('T')[0] ?? '';

const value = computed({
    get: () => props.modelValue,
    set: nextValue => emit('update:modelValue', nextValue)
});

const displayDate = computed(() => {
    if (props.modelValue === today) return 'Hoy';
    if (!props.modelValue) return 'Sin fecha';

    const [year, month, day] = props.modelValue.split('-').map(Number);
    if (!year || !month || !day) return props.modelValue;

    return new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date(year, month - 1, day));
});
</script>

<template>
    <div class="inline-flex flex-col items-start gap-1 text-left sm:items-end sm:text-right">
        <span class="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {{ label ?? 'Fecha' }}
        </span>
        <div v-if="editing" class="flex items-center gap-2">
            <input
                v-model="value"
                type="date"
                class="compact-control h-9 w-auto min-w-[9.5rem] text-sm"
                @blur="editing = false"
            />
        </div>
        <button
            v-else
            type="button"
            class="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
            @click="editing = true"
        >
            <span>{{ displayDate }}</span>
            <span class="text-[var(--accent-color)]">· Cambiar</span>
        </button>
    </div>
</template>
