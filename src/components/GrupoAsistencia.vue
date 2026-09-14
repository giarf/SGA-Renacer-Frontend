<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import AsistenciaDialog from './AsistenciaDialog.vue';
import { apiService } from '../api/apiService';
import { cargarGrupoAsistencia, type PersonaGrupo } from '../utils/grupoAsistencia';
const props = defineProps<{ persona: { id: number; nombreCompleto: string }; presentes: Set<number>; busy: boolean; saveError?: string }>();
const emit = defineEmits<{ close: []; agregar: [personas: PersonaGrupo[]] }>();
const grupo = ref<PersonaGrupo[]>([]);
const seleccion = ref<number[]>([]);
const loading = ref(false);
const error = ref('');
let sequence = 0;
const elegidos = computed(() => grupo.value.filter(p => seleccion.value.includes(p.id) && !props.presentes.has(p.id)));
async function cargar() {
    const version = ++sequence;
    loading.value = true; error.value = ''; grupo.value = []; seleccion.value = [];
    try {
        const data = await cargarGrupoAsistencia(props.persona.id, props.persona.nombreCompleto, apiService);
        if (version !== sequence) return;
        grupo.value = data;
        if (!props.presentes.has(props.persona.id)) seleccion.value = [props.persona.id];
    } catch (e) { if (version === sequence) error.value = e instanceof Error ? e.message : 'No se pudo cargar el grupo.'; }
    finally { if (version === sequence) loading.value = false; }
}
watch(() => props.persona.id, cargar, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>
<template>
    <AsistenciaDialog :open="true" title="¿Quiénes vinieron?" :busy="busy" @close="emit('close')">
        <div class="space-y-4">
            <p class="text-sm text-[var(--text-muted)]">Selecciona a quienes llegaron. Cada persona tendrá su propia asistencia.</p>
            <p v-if="saveError" role="alert" class="text-red-600 dark:text-red-400">{{ saveError }}</p>
            <p v-if="loading" role="status">Cargando apoderados y personas relacionadas…</p>
            <div v-if="error" role="alert"><p>{{ error }}</p><button type="button" class="btn-secondary" @click="cargar">Reintentar</button></div>
            <div class="space-y-2 max-h-[55vh] overflow-y-auto">
                <label v-for="p in grupo" :key="p.id" class="flex items-start gap-3 rounded-xl border border-[var(--card-border)] p-3">
                    <input v-model="seleccion" type="checkbox" :value="p.id" :disabled="busy || presentes.has(p.id)" class="mt-1" />
                    <span class="min-w-0"><strong class="block">{{ p.nombreCompleto }}</strong><span v-for="motivo in p.motivos" :key="motivo" class="block text-sm text-[var(--text-muted)]">{{ motivo }}</span><span v-if="p.porConfirmar" class="block text-sm text-amber-700 dark:text-amber-300">Vínculo por confirmar</span><span v-if="presentes.has(p.id)" class="block text-sm font-medium">Ya presente</span></span>
                </label>
            </div>
            <div class="flex justify-end gap-3 flex-wrap"><button type="button" class="btn-secondary" :disabled="busy" @click="emit('close')">Cerrar</button><button type="button" class="btn-primary" :disabled="busy || loading || !elegidos.length" @click="emit('agregar', elegidos)">{{ busy ? 'Registrando…' : `Agregar ${elegidos.length} seleccionados` }}</button></div>
        </div>
    </AsistenciaDialog>
</template>
