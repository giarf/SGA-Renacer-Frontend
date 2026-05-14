<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { authService } from '../auth/authService';

const router = useRouter();
const error = ref('');

onMounted(async () => {
    try {
        const returnTo = await authService.completeLogin();
        await router.replace(returnTo);
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'No se pudo completar el inicio de sesión.';
    }
});
</script>

<template>
    <main class="min-h-screen grid place-items-center bg-[var(--bg-base)] px-4 text-[var(--text-primary)]">
        <section class="surface-card w-full max-w-md p-8 text-center">
            <h1 class="text-2xl font-bold">Validando sesión</h1>
            <p v-if="!error" class="mt-3 text-sm text-[var(--text-muted)]">Estamos confirmando tus permisos con Authentik.</p>
            <p v-else class="mt-3 rounded-2xl border border-red-300/50 bg-red-100/70 p-4 text-sm text-red-900">{{ error }}</p>
        </section>
    </main>
</template>
