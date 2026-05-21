<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Camera } from 'lucide-vue-next';

const props = defineProps<{
    modelValue: File | null;
    currentUrl?: string;
    label?: string;
    fallback?: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: File | null): void;
    (e: 'error', message: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const previewUrl = ref<string | null>(null);

const displayUrl = computed(() => previewUrl.value || props.currentUrl || '');
const fallbackText = computed(() => (props.fallback || '?').slice(0, 1).toUpperCase());

const revokePreview = () => {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = null;
    }
};

const openPicker = () => {
    inputRef.value?.click();
};

const handleChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    revokePreview();
    emit('update:modelValue', null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        emit('error', 'La foto debe ser JPG, PNG o WEBP.');
        input.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        emit('error', 'La foto no puede superar 5 MB.');
        input.value = '';
        return;
    }
    emit('update:modelValue', file);
    previewUrl.value = URL.createObjectURL(file);
};

const clearSelection = () => {
    revokePreview();
    emit('update:modelValue', null);
    if (inputRef.value) inputRef.value.value = '';
};

watch(
    () => props.modelValue,
    value => {
        if (!value) revokePreview();
    }
);

onBeforeUnmount(revokePreview);
</script>

<template>
    <div class="flex flex-col items-center gap-2">
        <label v-if="label" class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ label }}</label>
        <button
            type="button"
            class="group relative h-32 w-32 overflow-hidden rounded-[2rem] bg-[var(--surface-muted)] ring-1 ring-[var(--card-border)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
            @click="openPicker"
        >
            <img
                v-if="displayUrl"
                :src="displayUrl"
                alt="Foto de perfil"
                class="h-full w-full object-cover transition duration-200 group-hover:brightness-75"
            >
            <div v-else class="flex h-full w-full items-center justify-center text-4xl font-bold text-gray-400 transition duration-200 group-hover:brightness-75">
                {{ fallbackText }}
            </div>
            <div class="pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-black/70 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                <span class="inline-flex items-center gap-1.5">
                    <Camera class="h-3.5 w-3.5" /> Editar foto
                </span>
            </div>
        </button>
        <input
            ref="inputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            @change="handleChange"
        >
        <button
            v-if="modelValue"
            type="button"
            class="text-xs font-semibold text-red-600 hover:underline"
            @click="clearSelection"
        >
            Quitar selección
        </button>
        <p class="max-w-[11rem] text-center text-[11px] leading-4 text-gray-500">JPG, PNG o WEBP. Máx. 5 MB.</p>
    </div>
</template>
