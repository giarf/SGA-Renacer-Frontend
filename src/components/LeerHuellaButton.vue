<script setup lang="ts">
import { ref } from 'vue';
import { FingerprintPattern, LoaderCircle } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import type { PersonaIdentificada } from '../types';

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ identificada: [persona: PersonaIdentificada]; error: [mensaje: string] }>();
const leyendo = ref(false);

async function leer() {
    if (leyendo.value) return;
    leyendo.value = true;
    try {
        emit('identificada', await apiService.identificarHuella());
    } catch (e) {
        emit('error', e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'El huellero no respondió a tiempo. Intenta nuevamente.');
    } finally {
        leyendo.value = false;
    }
}
</script>

<template>
    <button type="button" class="fingerprint-button" :class="{ reading: leyendo }" :disabled="disabled || leyendo"
        :aria-label="leyendo ? 'Esperando huella en el lector' : 'Leer con huellero'" :title="leyendo ? 'Pon el dedo en el lector…' : 'Leer con huellero'" @click="leer">
        <LoaderCircle v-if="leyendo" :size="22" class="animate-spin" aria-hidden="true" />
        <FingerprintPattern v-else :size="24" aria-hidden="true" />
        <span v-if="leyendo" class="fingerprint-label" role="status">Pon el dedo…</span>
    </button>
</template>

<style scoped>
.fingerprint-button { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-width: 50px; min-height: 50px; padding: 0 .8rem; border-radius: .9rem; border: 1px solid var(--card-border); background: var(--bg-card); color: var(--accent-color); transition: background .18s, border-color .18s; flex-shrink: 0; }
.fingerprint-button:hover:not(:disabled) { border-color: var(--accent-color); background: var(--accent-color-muted); }
.fingerprint-button:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.fingerprint-button.reading { border-color: var(--accent-color); }
.fingerprint-button:disabled:not(.reading) { opacity: .5; cursor: not-allowed; }
.fingerprint-label { font-size: .8rem; font-weight: 600; white-space: nowrap; }
</style>
