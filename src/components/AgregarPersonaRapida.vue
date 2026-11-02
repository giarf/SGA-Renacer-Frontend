<script setup lang="ts">
import { UserPlus } from 'lucide-vue-next';

// Estado vacío de un buscador de entidades: ofrece registrar a la persona sin salir del formulario.
defineProps<{ query: string }>();
const emit = defineEmits<{ (e: 'agregar'): void }>();
</script>

<template>
    <div class="flex flex-col items-center gap-2 p-4 text-center text-sm text-[var(--text-muted)]">
        <p>No se encontró "{{ query.trim() }}".</p>
        <!-- mousedown.prevent: que el blur del buscador no cierre el menú antes del clic -->
        <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--accent-color)] hover:bg-[var(--accent-color-muted)]"
            @mousedown.prevent
            @click="emit('agregar')"
        >
            <UserPlus :size="16" aria-hidden="true" /> Agregar persona
        </button>
    </div>
</template>
