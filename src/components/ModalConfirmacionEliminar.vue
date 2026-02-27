<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ShieldAlert } from 'lucide-vue-next';

const props = defineProps<{
    isOpen: boolean;
    entidadNombre: string;
    entidadTipo?: 'Persona' | 'Institucion';
    isDeleting?: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'confirm'): void;
}>();

const confirmacionInput = ref('');
const canConfirm = computed(() => confirmacionInput.value.trim().toUpperCase() === 'ELIMINAR');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
    () => props.isOpen,
    newVal => {
        if (newVal) {
            confirmacionInput.value = '';
            requestAnimationFrame(() => inputRef.value?.focus());
        }
    }
);

const handleConfirm = () => {
    if (canConfirm.value) {
        emit('confirm');
    }
};
</script>

<template>
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/50 backdrop-blur-sm">
        <div class="relative bg-white dark:bg-[var(--bg-card)] rounded-3xl shadow-2xl max-w-lg w-full p-6">
            <button
                type="button"
                class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                @click="$emit('close')"
                :disabled="isDeleting"
            >
                ✕
            </button>

            <div class="flex items-center gap-3 mb-5">
                <div class="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                    <ShieldAlert class="w-6 h-6" />
                </div>
                <div>
                    <p class="text-xs uppercase tracking-[0.35em] text-red-500">Confirmación</p>
                    <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
                        Eliminar {{ props.entidadTipo === 'Institucion' ? 'institución' : 'persona' }}
                    </h3>
                </div>
            </div>

            <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Esta acción eliminará definitivamente a
                <strong>{{ entidadNombre || 'esta entidad' }}</strong>. Para continuar, escribe
                <span class="font-black text-red-600">ELIMINAR</span>.
            </p>

            <div class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/40 rounded-2xl p-4 mb-6">
                <input
                    ref="inputRef"
                    type="text"
                    v-model="confirmacionInput"
                    class="w-full rounded-2xl border border-red-200 dark:border-red-500/60 bg-white dark:bg-transparent px-4 py-3 text-center text-lg font-bold tracking-[0.6em] uppercase focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="ELIMINAR"
                    :disabled="isDeleting"
                />
            </div>

            <div class="flex flex-col sm:flex-row justify-end gap-3">
                <button
                    type="button"
                    class="btn btn-ghost border border-[var(--card-border)] w-full sm:w-auto"
                    @click="$emit('close')"
                    :disabled="isDeleting"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    class="btn btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!canConfirm || isDeleting"
                    @click="handleConfirm"
                >
                    <ShieldAlert class="w-4 h-4" />
                    {{ isDeleting ? 'Eliminando...' : 'Sí, eliminar' }}
                </button>
            </div>
        </div>
    </div>
</template>
