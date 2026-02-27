<script setup lang="ts">
import PersonaForm from './PersonaForm.vue';
import { X, UserPlus } from 'lucide-vue-next';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'created', rut: string): void;
}>();

const handleCreated = (rut: string) => {
    emit('created', rut);
    emit('close');
};
</script>

<template>
    <div v-if="isOpen" class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
        <div class="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 p-6 dark:bg-[var(--bg-card)]">
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-2">
                    <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        <UserPlus class="w-5 h-5" />
                    </div>
                    <div>
                        <p class="text-xs uppercase tracking-[0.3em] text-gray-500">Formulario</p>
                        <h3 class="text-2xl font-bold text-gray-900 dark:text-white">Crear persona</h3>
                    </div>
                </div>
                <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
                    <X class="w-6 h-6" />
                </button>
            </div>

            <PersonaForm @cancel="$emit('close')" @created="handleCreated" />
        </div>
    </div>
</template>
