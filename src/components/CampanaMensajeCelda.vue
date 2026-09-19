<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { whatsappUrl } from '../utils/whatsapp';
import type { GuardarValorCampana, ValorCampana } from '../types';

const props = defineProps<{
    dato?: ValorCampana; label: string; telefono?: string | null; readonly?: boolean;
    variables: Record<string, string>;
    saveValue: (dato: GuardarValorCampana) => Promise<ValorCampana>;
}>();
const current = computed(() => typeof props.dato?.valor === 'object' && props.dato.valor !== null ? props.dato.valor : { texto: '', enviado: false });
const texto = ref(current.value.texto);
const version = ref(props.dato?.version ?? 0);
const dirty = ref(false);
const saving = ref(false);
const error = ref('');
watch(() => props.dato, () => {
    if (!dirty.value) { texto.value = current.value.texto; version.value = props.dato?.version ?? 0; }
});
const rendered = computed(() => texto.value.replace(/\{(nombre|beneficiario|campana|gustos)\}/g, (token, key: string) => props.variables[key] ?? token));
const url = computed(() => whatsappUrl(props.telefono, rendered.value));
async function save(enviado: boolean) {
    if (saving.value || props.readonly) return false;
    saving.value = true; error.value = '';
    try {
        const result = await props.saveValue({ valor: { texto: texto.value, enviado }, version: version.value });
        version.value = result.version; dirty.value = false;
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
function discard() { texto.value = current.value.texto; version.value = props.dato?.version ?? 0; dirty.value = false; error.value = ''; }
</script>

<template>
    <div class="message-cell">
        <textarea v-model="texto" :aria-label="label" rows="4" maxlength="2000" :readonly="readonly" :disabled="saving" @input="dirty = true" />
        <small>{nombre}: padrino/madrina · {beneficiario} · {campana} · {gustos}</small>
        <div class="controls">
            <button type="button" class="btn btn-outline" :disabled="readonly || saving || !dirty" @click="save(false)">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            <button type="button" class="btn btn-primary" :disabled="readonly || saving || !url || !rendered.trim()" @click="share">Compartir</button>
            <label><input type="checkbox" :checked="!dirty && current.enviado" :disabled="readonly || saving || dirty || !texto.trim() || !telefono" @change="save(($event.target as HTMLInputElement).checked)" /> Enviado</label>
        </div>
        <p v-if="error" role="alert">{{ error }} <button type="button" class="discard" @click="discard">Descartar edición y actualizar</button></p>
    </div>
</template>

<style scoped>
.message-cell { min-width: 310px; max-width: 380px; display: grid; gap: .5rem; }
textarea { width: 100%; resize: vertical; min-height: 90px; }
small { font-size: .68rem; color: var(--text-muted); }
.controls { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.controls button { font-size: .75rem; padding: .4rem .6rem; }
label { display: flex; align-items: center; gap: .35rem; font-size: .75rem; }
input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent-color); }
p { font-size: .75rem; } .discard { text-decoration: underline; }
button:disabled { opacity: .5; }
</style>
