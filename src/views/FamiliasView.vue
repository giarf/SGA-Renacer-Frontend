<script setup lang="ts">
import { matchesSearch } from '../utils/search';
import { computed, onMounted, ref } from 'vue';
import type { BeneficiarioFamilia, EntidadResumen, Familia } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import EntidadSelector from '../components/EntidadSelector.vue';
import { Plus, Save, Trash2, Users } from 'lucide-vue-next';

const familias = ref<Familia[]>([]);
const selectedFamilia = ref<Familia | null>(null);
const miembros = ref<BeneficiarioFamilia[]>([]);
const loading = ref(true);
const miembrosLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const familiaSearch = ref('');

const jefeSeleccionado = ref<EntidadResumen | null>(null);
const miembroSeleccionado = ref<EntidadResumen | null>(null);
// Quien ya es miembro no se vuelve a ofrecer en el buscador.
const noEsMiembro = (persona: EntidadResumen) => !miembros.value.some(m => m.personaId === persona.id);
const nuevoRol = ref('');
const nuevaObservacion = ref('');

const formFamilia = ref({
    nombreFamilia: '',
    puntosVulnerabilidad: 75,
    justificacionVulnerabilidad: ''
});

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) message.value = null;
    }, 3500);
};

const filteredFamilias = computed(() => {
    const q = familiaSearch.value;
    if (!q) return familias.value;
    return familias.value.filter(f =>
        matchesSearch(q, f.nombreFamilia, String(f.puntosVulnerabilidad))
    );
});

const jefeNombre = computed(() => {
    if (jefeSeleccionado.value) return jefeSeleccionado.value.nombreCompleto;
    if (!selectedFamilia.value?.jefeHogarId) return 'Sin jefe/a de hogar';
    const jefe = miembros.value.find(m => m.personaId === selectedFamilia.value?.jefeHogarId || m.id === selectedFamilia.value?.jefeHogarId);
    if (jefe) return `${jefe.nombres} ${jefe.apellidos ?? ''}`.trim();
    return selectedFamilia.value.jefeHogarNombre || `Persona #${selectedFamilia.value.jefeHogarId}`;
});

const loadFamilias = async () => {
    loading.value = true;
    try {
        familias.value = await apiService.getFamilias();
        if (!selectedFamilia.value && familias.value.length) {
            await selectFamilia(familias.value[0]!);
        } else if (selectedFamilia.value) {
            const refreshed = familias.value.find(f => f.id === selectedFamilia.value?.id);
            if (refreshed) await selectFamilia(refreshed);
        }
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron cargar las familias.');
    } finally {
        loading.value = false;
    }
};

const loadMiembros = async (familiaId: number) => {
    miembrosLoading.value = true;
    try {
        miembros.value = await apiService.getBeneficiariosFamilia(familiaId);
    } catch (e: any) {
        miembros.value = [];
        showToast('error', e.message || 'No se pudieron cargar los miembros.');
    } finally {
        miembrosLoading.value = false;
    }
};

const selectFamilia = async (familia: Familia) => {
    selectedFamilia.value = familia;
    formFamilia.value = {
        nombreFamilia: familia.nombreFamilia,
        puntosVulnerabilidad: familia.puntosVulnerabilidad,
        justificacionVulnerabilidad: familia.justificacionVulnerabilidad || ''
    };
    jefeSeleccionado.value = null;
    await loadMiembros(familia.id);
};

const guardarFamilia = async () => {
    const nombre = formFamilia.value.nombreFamilia.trim();
    if (!nombre) return showToast('error', 'El nombre de la familia es obligatorio.');
    const jefeId = jefeSeleccionado.value?.id ?? selectedFamilia.value?.jefeHogarId;
    if (!jefeId) return showToast('error', 'Selecciona a la persona jefa de hogar.');

    const payload = {
        nombreFamilia: nombre,
        puntosVulnerabilidad: formFamilia.value.puntosVulnerabilidad,
        jefeHogarId: jefeId,
        justificacionVulnerabilidad: formFamilia.value.justificacionVulnerabilidad.trim() || undefined
    };

    try {
        if (selectedFamilia.value) {
            await apiService.actualizarFamilia(selectedFamilia.value.id, payload);
            await apiService.agregarBeneficiarioFamilia(selectedFamilia.value.id, jefeId, 'Jefe/a de hogar');
            showToast('success', 'Familia actualizada.');
        } else {
            const created = await apiService.crearFamilia(payload);
            await apiService.agregarBeneficiarioFamilia(created.id, jefeId, 'Jefe/a de hogar');
            showToast('success', 'Familia creada.');
        }
        await loadFamilias();
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo guardar la familia.');
    }
};

const nuevaFamilia = () => {
    selectedFamilia.value = null;
    miembros.value = [];
    jefeSeleccionado.value = null;
    formFamilia.value = { nombreFamilia: '', puntosVulnerabilidad: 75, justificacionVulnerabilidad: '' };
};

const agregarMiembro = async () => {
    if (!selectedFamilia.value) return showToast('error', 'Primero guarda o selecciona una familia.');
    if (!miembroSeleccionado.value) return showToast('error', 'Selecciona una persona para agregar.');
    try {
        await apiService.agregarBeneficiarioFamilia(
            selectedFamilia.value.id,
            miembroSeleccionado.value.id,
            nuevoRol.value.trim() || undefined,
            nuevaObservacion.value.trim() || undefined
        );
        miembroSeleccionado.value = null;
        nuevoRol.value = '';
        nuevaObservacion.value = '';
        await loadMiembros(selectedFamilia.value.id);
        showToast('success', 'Miembro agregado a la familia.');
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo agregar el miembro.');
    }
};

const quitarMiembro = async (miembro: BeneficiarioFamilia) => {
    if (!selectedFamilia.value) return;
    try {
        await apiService.quitarBeneficiarioFamilia(selectedFamilia.value.id, miembro.personaId);
        await loadMiembros(selectedFamilia.value.id);
        showToast('success', 'Miembro removido.');
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo remover el miembro.');
    }
};

onMounted(loadFamilias);
</script>

<template>
    <div class="form-page space-y-4">
        <div class="page-toolbar justify-end">
            <button class="btn btn-primary" type="button" @click="nuevaFamilia">
                <Plus class="h-4 w-4" /> Nueva familia
            </button>
        </div>

        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
            <aside class="form-shell overflow-hidden">
                <div class="border-b border-[var(--card-border)] p-4">
                    <input v-model="familiaSearch" class="compact-control" type="search" placeholder="Buscar familia...">
                </div>
                <div class="max-h-[70vh] overflow-y-auto p-2 space-y-0.5">
                    <p v-if="loading" class="px-3 py-4 text-sm text-[var(--text-muted)]">Cargando familias...</p>
                    <button
                        v-for="familia in filteredFamilias"
                        :key="familia.id"
                        type="button"
                        class="w-full rounded-xl px-3 py-2.5 text-left transition"
                        :class="selectedFamilia?.id === familia.id ? 'bg-[var(--accent-color-muted)]' : 'hover:bg-[var(--surface-muted)]'"
                        @click="selectFamilia(familia)"
                    >
                        <p class="font-semibold text-[var(--text-primary)]">{{ familia.nombreFamilia }}</p>
                        <p class="text-xs text-[var(--text-muted)]">{{ familia.puntosVulnerabilidad }} pts. vulnerabilidad</p>
                    </button>
                    <p v-if="!loading && filteredFamilias.length === 0" class="px-3 py-4 text-sm text-[var(--text-muted)]">No hay familias registradas.</p>
                </div>
            </aside>

            <section class="form-shell">
                <div class="form-section">
                    <div class="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h3 class="text-xl font-semibold text-[var(--text-primary)]">{{ selectedFamilia ? selectedFamilia.nombreFamilia : 'Nueva familia' }}</h3>
                        </div>
                        <button class="btn btn-primary" type="button" @click="guardarFamilia">
                            <Save class="h-4 w-4" /> Guardar
                        </button>
                    </div>

                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Nombre de familia *</label>
                            <input v-model="formFamilia.nombreFamilia" class="compact-control" placeholder="Ej: Familia Soto González">
                        </div>
                        <div>
                            <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Puntos de vulnerabilidad</label>
                            <input v-model.number="formFamilia.puntosVulnerabilidad" class="compact-control" type="number" min="0" max="100">
                        </div>
                        <div class="md:col-span-2">
                            <EntidadSelector
                                v-model="jefeSeleccionado"
                                label="Jefe/a de hogar"
                                required
                                tipo="PersonaNatural"
                                crear-persona
                            />
                            <p v-if="!jefeSeleccionado && selectedFamilia?.jefeHogarId" class="mt-1 text-xs text-[var(--text-muted)]">Actual: {{ jefeNombre }}</p>
                        </div>
                        <div class="md:col-span-2">
                            <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Justificación de vulnerabilidad</label>
                            <textarea v-model="formFamilia.justificacionVulnerabilidad" class="compact-control min-h-24" placeholder="Situación económica, red de apoyo, salud, vivienda…"></textarea>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div class="mb-4 flex items-center justify-between gap-2">
                        <h4 class="form-section-title !mb-0">Miembros</h4>
                        <span class="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]"><Users class="h-4 w-4" /> {{ miembros.length }} miembros</span>
                    </div>

                    <div class="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
                        <EntidadSelector
                            v-model="miembroSeleccionado"
                            tipo="PersonaNatural"
                            placeholder="Buscar persona por nombre o RUT"
                            :disabled="!selectedFamilia"
                            :filtro="noEsMiembro"
                            crear-persona
                        />
                        <input v-model="nuevoRol" class="compact-control" :disabled="!selectedFamilia" placeholder="Rol opcional">
                        <input v-model="nuevaObservacion" class="compact-control" :disabled="!selectedFamilia" placeholder="Observación opcional">
                        <button class="btn btn-primary" type="button" :disabled="!selectedFamilia" @click="agregarMiembro">Agregar</button>
                    </div>

                    <div class="divide-y divide-[var(--card-border)]">
                        <p v-if="miembrosLoading" class="py-3 text-sm text-[var(--text-muted)]">Cargando miembros...</p>
                        <article v-for="miembro in miembros" :key="miembro.personaId" class="py-3">
                            <div class="flex items-start gap-3">
                                <img v-if="miembro.fotoUrl" :src="miembro.fotoUrl" :alt="`Foto de ${miembro.nombres}`" class="h-10 w-10 rounded-full object-cover ring-1 ring-[var(--card-border)]">
                                <div v-else class="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-muted)] text-sm font-bold text-[var(--text-muted)] ring-1 ring-[var(--card-border)]">
                                    {{ miembro.nombres.slice(0, 1).toUpperCase() }}
                                </div>
                                <div class="min-w-0 flex-1">
                                    <p class="font-semibold text-[var(--text-primary)]">{{ miembro.nombres }} {{ miembro.apellidos }}</p>
                                    <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(miembro.rut || '') }}</p>
                                    <p v-if="miembro.rolFamiliar" class="mt-2 inline-flex rounded-full bg-[var(--accent-color-muted)] px-2 py-1 text-xs font-semibold text-[var(--accent-color)]">{{ miembro.rolFamiliar }}</p>
                                    <p v-if="miembro.observaciones" class="mt-2 text-xs text-[var(--text-muted)]">{{ miembro.observaciones }}</p>
                                </div>
                                <button class="rounded-full p-2 text-red-600 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-500/10" type="button" @click="quitarMiembro(miembro)">
                                    <Trash2 class="h-4 w-4" />
                                </button>
                            </div>
                        </article>
                        <p v-if="!miembrosLoading && miembros.length === 0" class="py-6 text-center text-sm text-[var(--text-muted)]">
                            Sin miembros todavía.
                        </p>
                    </div>
                </div>
            </section>
        </div>

    </div>
</template>
