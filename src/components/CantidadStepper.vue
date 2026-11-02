<script setup lang="ts">
import { computed } from 'vue';
import { Minus, Plus } from 'lucide-vue-next';
import { errorCantidad, permiteDecimales, redondearCantidad } from '../utils/cantidad';

// Cantidad editable en línea (−/+ e input), igual que en la entrega de solicitudes.
// `max` (opcional) impide superar un tope, p. ej. el stock disponible.
const props = defineProps<{ modelValue: number; unidad?: string | null; max?: number | null; invalid?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const decimales = computed(() => permiteDecimales(props.unidad));
const tope = computed(() => (props.max == null ? Infinity : Math.max(0, props.max)));
const valor = computed(() => Number(props.modelValue || 0));
const conError = computed(() => props.invalid || !!errorCantidad(valor.value, props.unidad) || valor.value > tope.value);

const cambiar = (delta: number) => {
    const siguiente = redondearCantidad(valor.value + delta);
    if (siguiente <= 0) return;
    emit('update:modelValue', Math.min(siguiente, tope.value));
};

const escribir = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const numero = Number(input.value.replace(',', '.'));
    if (!Number.isFinite(numero)) return;
    const acotado = Math.min(numero, tope.value);
    if (acotado !== numero) input.value = String(acotado);
    emit('update:modelValue', acotado);
};
</script>

<template>
    <div class="flex items-center gap-1">
        <button type="button" class="btn-secondary h-9 w-9 shrink-0 !px-0" aria-label="Restar uno" :disabled="valor - 1 <= 0" @click="cambiar(-1)"><Minus class="h-4 w-4" /></button>
        <input
            :value="modelValue"
            type="number"
            :min="decimales ? 0.01 : 1"
            :max="max ?? undefined"
            :step="decimales ? 0.01 : 1"
            :inputmode="decimales ? 'decimal' : 'numeric'"
            class="compact-control w-20 text-center"
            :class="{ '!border-red-400': conError }"
            :aria-invalid="conError"
            aria-label="Cantidad"
            @input="escribir"
        />
        <button type="button" class="btn-secondary h-9 w-9 shrink-0 !px-0" aria-label="Sumar uno" :disabled="valor + 1 > tope" @click="cambiar(1)"><Plus class="h-4 w-4" /></button>
    </div>
</template>
