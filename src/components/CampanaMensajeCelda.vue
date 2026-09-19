<script setup lang="ts">
import { computed, ref } from 'vue';
import { whatsappUrl } from '../utils/whatsapp';
import type { GuardarValorCampana, ValorCampana } from '../types';

const props = defineProps<{
    dato?: ValorCampana; label: string; telefono?: string | null; readonly?: boolean;
    mensaje: string; columnaVersion: number;
    variables: Record<string, string>;
    saveValue: (dato: GuardarValorCampana) => Promise<ValorCampana>;
}>();
const current = computed(() => typeof props.dato?.valor === 'object' && props.dato.valor !== null ? props.dato.valor : { texto: '', enviado: false });
const saving = ref(false);
const error = ref('');
const rendered = computed(() => props.mensaje.replace(/\{(nombre|beneficiario|campana|gustos)\}/g, (token, key: string) => props.variables[key] ?? token));
const url = computed(() => whatsappUrl(props.telefono, rendered.value));
async function save(enviado: boolean) {
    if (saving.value || props.readonly) return false;
    saving.value = true; error.value = '';
    try {
        await props.saveValue({ valor: { texto: props.mensaje, enviado }, version: props.dato?.version ?? 0, columnaVersion: props.columnaVersion });
        return true;
    } catch (e) { error.value = e instanceof Error ? e.message : 'No se pudo guardar.'; return false; }
    finally { saving.value = false; }
}
async function share() {
    if (!url.value || !rendered.value.trim() || saving.value || props.readonly) return;
    const popup = window.open('about:blank', '_blank');
    if (!popup) { error.value = 'Permite abrir ventanas para compartir por WhatsApp.'; return; }
    popup.opener = null;
    const destination = url.value;
    if (await save(true)) popup.location.href = destination;
    else popup.close();
}
</script>

<template>
    <div class="message-cell">
        <p class="preview" :aria-label="label">{{ rendered || '—' }}</p>
        <div class="controls">
            <button type="button" class="btn btn-primary" :disabled="readonly || saving || !url || !rendered.trim()" @click="share">Compartir</button>
            <label><input type="checkbox" :checked="current.enviado" :disabled="readonly || saving || (!current.enviado && (!mensaje.trim() || !url))" @change="save(($event.target as HTMLInputElement).checked)" /> Enviado</label>
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
    </div>
</template>

<style scoped>
.message-cell { min-width: 310px; max-width: 380px; display: grid; gap: .5rem; }
textarea { width: 100%; resize: vertical; min-height: 90px; }
.preview { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; font-weight: normal; }
small { font-size: .68rem; color: var(--text-muted); }
.controls { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.controls button { font-size: .75rem; padding: .4rem .6rem; }
label { display: flex; align-items: center; gap: .35rem; font-size: .75rem; }
input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent-color); }
p { font-size: .75rem; } .discard { text-decoration: underline; }
button:disabled { opacity: .5; }
</style>
