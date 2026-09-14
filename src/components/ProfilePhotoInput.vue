<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Camera } from 'lucide-vue-next';

const props = defineProps<{
    modelValue: File | null;
    currentUrl?: string;
    label?: string;
    fallback?: string;
    compact?: boolean;
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
    <div class="profile-photo flex flex-col items-center gap-2" :class="{ 'profile-photo-compact': compact }">
        <label v-if="label" class="photo-label text-sm font-semibold text-[var(--text-primary)]">{{ label }}</label>
        <button
            type="button"
            class="photo-picker group relative h-32 w-32 overflow-hidden rounded-[2rem] bg-[var(--surface-muted)] ring-1 ring-[var(--card-border)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
            aria-label="Cambiar foto de perfil"
            @click="openPicker"
        >
            <img
                v-if="displayUrl"
                :src="displayUrl"
                alt="Foto de perfil"
                class="h-full w-full object-cover transition duration-200 group-hover:brightness-75"
            >
            <div v-else class="flex h-full w-full items-center justify-center text-4xl font-bold text-[var(--text-muted)] transition duration-200 group-hover:brightness-75">
                {{ fallbackText }}
            </div>
            <div class="photo-overlay pointer-events-none absolute inset-x-3 bottom-3 translate-y-2 rounded-full bg-black/70 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
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
            class="photo-clear text-xs font-semibold text-red-600 hover:underline"
            @click="clearSelection"
        >
            Quitar selección
        </button>
        <p class="photo-hint max-w-[11rem] text-center text-[11px] leading-4 text-[var(--text-muted)]">JPG, PNG o WEBP. Máx. 5 MB.</p>
    </div>
</template>

<style scoped>
.profile-photo-compact { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); column-gap: 1rem; row-gap: 0.25rem; align-items: center; }
.profile-photo-compact .photo-picker { grid-column: 1; grid-row: 1 / span 3; width: 4.5rem; height: 4.5rem; border-radius: 1rem; }
.profile-photo-compact .photo-label { grid-column: 2; align-self: end; margin: 0; }
.profile-photo-compact .photo-hint { grid-column: 2; max-width: none; text-align: left; }
.profile-photo-compact .photo-clear { grid-column: 2; grid-row: 3; justify-self: start; }
.profile-photo-compact .photo-overlay { inset: auto 0 0; padding: 0.25rem; border-radius: 0; opacity: 1; transform: none; }
.profile-photo-compact .photo-overlay span { font-size: 0; }
.profile-photo-compact .photo-overlay svg { width: 0.875rem; height: 0.875rem; }
</style>
