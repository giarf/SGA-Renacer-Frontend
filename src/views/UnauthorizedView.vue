<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { authService } from '../auth/authService';

const groups = computed(() => authService.groups.join(', ') || 'Sin grupos informados');
</script>

<template>
    <main class="min-h-screen grid place-items-center bg-[var(--bg-base)] px-4 text-[var(--text-primary)]">
        <section class="surface-card w-full max-w-lg p-8 text-center">
            <p class="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">Acceso restringido</p>
            <h1 class="mt-3 text-3xl font-bold">No tienes permisos para esta sección</h1>
            <p class="mt-3 text-sm text-[var(--text-muted)]">Tus grupos actuales: {{ groups }}</p>
            <RouterLink to="/donaciones" class="btn-primary mt-7 justify-center">Ir a operación diaria</RouterLink>
        </section>
    </main>
</template>
