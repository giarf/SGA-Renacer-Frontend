<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { LogIn } from 'lucide-vue-next';
import { authConfig } from '../auth/authConfig';
import { authService } from '../auth/authService';

const route = useRoute();
const returnTo = computed(() => (typeof route.query.returnTo === 'string' ? route.query.returnTo : '/donaciones'));

const login = () => {
    authService.login(returnTo.value);
};
</script>

<template>
    <main class="min-h-screen grid place-items-center bg-[var(--bg-base)] px-4 text-[var(--text-primary)]">
        <section class="surface-card w-full max-w-md p-8 text-center">
            <p class="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">SGA Renacer</p>
            <h1 class="mt-3 text-3xl font-bold">Inicia sesión</h1>
            <p class="mt-3 text-sm text-[var(--text-muted)]">
                Accede con tu cuenta de Authentik para cargar tus permisos de operación.
            </p>

            <div v-if="!authService.state.isConfigured" class="mt-6 rounded-2xl border border-amber-300/50 bg-amber-100/60 p-4 text-left text-sm text-amber-950">
                Falta configurar <code>VITE_AUTHENTIK_CLIENT_ID</code>. Issuer actual:
                <code>{{ authConfig.authority }}</code>
            </div>

            <button
                type="button"
                class="btn-primary mt-7 w-full justify-center"
                :disabled="!authService.state.isConfigured"
                @click="login"
            >
                <LogIn class="h-4 w-4" />
                Entrar con Authentik
            </button>
        </section>
    </main>
</template>
