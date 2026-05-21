<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { BeneficiarioFamilia, EntidadResumen, Familia } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import { Plus, Save, Trash2, Users } from 'lucide-vue-next';

const familias = ref<Familia[]>([]);
const selectedFamilia = ref<Familia | null>(null);
const miembros = ref<BeneficiarioFamilia[]>([]);
const loading = ref(true);
const miembrosLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const familiaSearch = ref('');
const showCrearPersonaModal = ref(false);
const personaModalContext = ref<'jefe' | 'miembro' | null>(null);

const jefeSeleccionado = ref<EntidadResumen | null>(null);
const jefeQuery = ref('');
const jefeResults = ref<EntidadResumen[]>([]);
const showJefeDropdown = ref(false);

const miembroSeleccionado = ref<EntidadResumen | null>(null);
const miembroQuery = ref('');
const miembroResults = ref<EntidadResumen[]>([]);
const showMiembroDropdown = ref(false);
const nuevoRol = ref('');
const nuevaObservacion = ref('');

const formFamilia = ref({
    nombreFamilia: '',
    puntosVulnerabilidad: 75,
    justificacionVulnerabilidad: ''
});

const debounce = (fn: (...args: any[]) => void, delay = 300) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) message.value = null;
    }, 3500);
};

const filteredFamilias = computed(() => {
    const q = familiaSearch.value.trim().toLowerCase();
    if (!q) return familias.value;
    return familias.value.filter(f =>
        f.nombreFamilia.toLowerCase().includes(q) ||
        String(f.puntosVulnerabilidad).includes(q)
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
    jefeQuery.value = familia.jefeHogarNombre || '';
    await loadMiembros(familia.id);
};

const searchPersonas = debounce(async (query: string, target: 'jefe' | 'miembro') => {
    if (query.trim().length < 2) {
        if (target === 'jefe') jefeResults.value = [];
        else miembroResults.value = [];
        return;
    }
    try {
        const results = (await apiService.buscarEntidades(query)).filter(e => e.tipoEntidad === 'Persona');
        if (target === 'jefe') jefeResults.value = results;
        else miembroResults.value = results;
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron buscar personas.');
    }
});

const selectJefe = (persona: EntidadResumen) => {
    jefeSeleccionado.value = persona;
    jefeQuery.value = persona.nombreCompleto;
    showJefeDropdown.value = false;
};

const selectMiembro = (persona: EntidadResumen) => {
    miembroSeleccionado.value = persona;
    miembroQuery.value = persona.nombreCompleto;
    showMiembroDropdown.value = false;
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
    jefeQuery.value = '';
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
        miembroQuery.value = '';
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

const abrirModalPersona = (contexto: 'jefe' | 'miembro') => {
    personaModalContext.value = contexto;
    showCrearPersonaModal.value = true;
};

const handlePersonaCreada = async (rut: string) => {
    showCrearPersonaModal.value = false;
    try {
        const encontrada = (await apiService.buscarEntidades(rut)).find(e => e.identificador === rut || e.rut === rut);
        if (!encontrada) return showToast('error', 'Persona creada, pero no fue posible seleccionarla automáticamente.');
        if (personaModalContext.value === 'jefe') selectJefe(encontrada);
        if (personaModalContext.value === 'miembro') selectMiembro(encontrada);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo buscar la nueva persona.');
    } finally {
        personaModalContext.value = null;
    }
};

onMounted(loadFamilias);
</script>

<template>
    <div class="form-page space-y-4">
        <header class="form-shell px-5 py-4">
            <p class="eyebrow text-[var(--accent-color)]">Red familiar</p>
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 class="text-lg font-semibold text-[var(--text-primary)]">Familias y miembros</h2>
                    <p class="text-xs text-[var(--text-muted)]">Agrupa personas por hogar, registra jefatura y documenta vulnerabilidad con justificación.</p>
                </div>
                <button class="btn btn-primary" type="button" @click="nuevaFamilia">
                    <Plus class="h-4 w-4" /> Nueva familia
                </button>
            </div>
        </header>

        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
            <aside class="form-shell overflow-hidden">
                <div class="border-b border-[var(--card-border)] p-4">
                    <input v-model="familiaSearch" class="compact-control" type="search" placeholder="Buscar familia...">
                </div>
                <div class="max-h-[70vh] overflow-y-auto p-3 space-y-2">
                    <p v-if="loading" class="px-3 py-4 text-sm text-[var(--text-muted)]">Cargando familias...</p>
                    <button
                        v-for="familia in filteredFamilias"
                        :key="familia.id"
                        type="button"
                        class="w-full rounded-xl border p-3 text-left transition hover:shadow-sm"
                        :class="selectedFamilia?.id === familia.id ? 'border-[var(--accent-color)] bg-[var(--accent-color-muted)]' : 'border-[var(--card-border)] bg-[var(--bg-card)]'"
                        @click="selectFamilia(familia)"
                    >
                        <p class="font-semibold text-[var(--text-primary)]">{{ familia.nombreFamilia }}</p>
                        <p class="mt-1 text-xs text-[var(--text-muted)]">{{ familia.puntosVulnerabilidad }} puntos de vulnerabilidad</p>
                    </button>
                    <p v-if="!loading && filteredFamilias.length === 0" class="px-3 py-4 text-sm text-[var(--text-muted)]">No hay familias registradas.</p>
                </div>
            </aside>

            <section class="space-y-5">
                <div class="form-shell p-5">
                    <div class="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p class="eyebrow text-[var(--accent-color)]">Ficha familiar</p>
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
                        <div class="relative md:col-span-2">
                            <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Jefe/a de hogar *</label>
                            <input
                                v-model="jefeQuery"
                                class="compact-control"
                                :placeholder="jefeNombre"
                                @input="searchPersonas(jefeQuery, 'jefe')"
                                @focus="showJefeDropdown = true"
                            >
                            <div v-if="showJefeDropdown && jefeQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-y-auto">
                                <button v-for="persona in jefeResults" :key="persona.id" type="button" @click="selectJefe(persona)">
                                    <p class="font-medium text-gray-900">{{ persona.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(persona.identificador) }}</p>
                                </button>
                                <div v-if="jefeResults.length === 0" class="p-3 text-center text-sm text-gray-500">
                                    <p>Sin resultados.</p>
                                    <button class="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white" type="button" @click="abrirModalPersona('jefe')">+ Registrar persona</button>
                                </div>
                            </div>
                            <p class="mt-1 text-xs text-[var(--text-muted)]">Actual: {{ jefeNombre }}</p>
                        </div>
                        <div class="md:col-span-2">
                            <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Justificación de vulnerabilidad</label>
                            <textarea v-model="formFamilia.justificacionVulnerabilidad" class="compact-control min-h-24" placeholder="Describe brevemente por qué se asigna este puntaje: situación económica, red de apoyo, salud, vivienda, etc."></textarea>
                        </div>
                    </div>
                </div>

                <div class="form-shell p-5">
                    <div class="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 class="text-base font-semibold text-[var(--text-primary)]">Miembros de la familia</h3>
                            <p class="text-sm text-[var(--text-muted)]">El parentesco o rol es opcional.</p>
                        </div>
                        <span class="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]"><Users class="h-4 w-4" /> {{ miembros.length }} miembros</span>
                    </div>

                    <div class="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
                        <div class="relative">
                            <input
                                v-model="miembroQuery"
                                class="compact-control"
                                placeholder="Buscar persona por nombre o RUT"
                                :disabled="!selectedFamilia"
                                @input="searchPersonas(miembroQuery, 'miembro')"
                                @focus="showMiembroDropdown = true"
                            >
                            <div v-if="showMiembroDropdown && miembroQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-y-auto">
                                <button v-for="persona in miembroResults" :key="persona.id" type="button" @click="selectMiembro(persona)">
                                    <p class="font-medium text-gray-900">{{ persona.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(persona.identificador) }}</p>
                                </button>
                                <div v-if="miembroResults.length === 0" class="p-3 text-center text-sm text-gray-500">
                                    <p>Sin resultados.</p>
                                    <button class="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white" type="button" @click="abrirModalPersona('miembro')">+ Registrar persona</button>
                                </div>
                            </div>
                        </div>
                        <input v-model="nuevoRol" class="compact-control" :disabled="!selectedFamilia" placeholder="Rol opcional">
                        <input v-model="nuevaObservacion" class="compact-control" :disabled="!selectedFamilia" placeholder="Observación opcional">
                        <button class="btn btn-primary" type="button" :disabled="!selectedFamilia" @click="agregarMiembro">Agregar</button>
                    </div>

                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <p v-if="miembrosLoading" class="col-span-full text-sm text-[var(--text-muted)]">Cargando miembros...</p>
                        <article v-for="miembro in miembros" :key="miembro.personaId" class="rounded-xl border border-[var(--card-border)] bg-[var(--bg-card)] p-4">
                            <div class="flex items-start gap-3">
                                <img v-if="miembro.fotoUrl" :src="miembro.fotoUrl" :alt="`Foto de ${miembro.nombres}`" class="h-12 w-12 rounded-full object-cover ring-1 ring-[var(--card-border)]">
                                <div v-else class="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-muted)] text-sm font-bold text-[var(--text-muted)] ring-1 ring-[var(--card-border)]">
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
                        <p v-if="!miembrosLoading && miembros.length === 0" class="col-span-full rounded-xl border border-dashed border-[var(--card-border)] p-6 text-center text-sm text-[var(--text-muted)]">
                            Esta familia aún no tiene miembros asociados.
                        </p>
                    </div>
                </div>
            </section>
        </div>

        <ModalCrearPersona :isOpen="showCrearPersonaModal" @close="showCrearPersonaModal = false" @created="handlePersonaCreada" />
    </div>
</template>
