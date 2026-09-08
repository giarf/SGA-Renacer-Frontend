<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
const props = defineProps<{ open: boolean; title: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
watch(() => props.open, async open => {
    await nextTick();
    if (open && !dialog.value?.open) dialog.value?.showModal();
    else if (!open) dialog.value?.close();
}, { immediate: true });
</script>

<template>
    <dialog ref="dialog" class="attendance-dialog" aria-labelledby="attendance-dialog-title" @cancel.prevent="!busy && emit('close')">
        <header class="flex items-start justify-between gap-4 mb-5">
            <h2 id="attendance-dialog-title" class="text-xl font-bold">{{ title }}</h2>
            <button type="button" class="btn-ghost !p-2" aria-label="Cerrar" :disabled="busy" @click="emit('close')"><X :size="20" /></button>
        </header>
        <slot />
    </dialog>
</template>

<style scoped>
.attendance-dialog { margin: auto; width: min(32rem, calc(100vw - 2rem)); max-height: 90dvh; overflow-y: auto; padding: 1.5rem; border: 1px solid var(--card-border); border-radius: 1.5rem; background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-soft); }
.attendance-dialog::backdrop { background: rgb(0 0 0 / 45%); backdrop-filter: blur(3px); }
</style>
