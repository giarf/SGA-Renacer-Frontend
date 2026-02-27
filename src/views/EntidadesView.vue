<script setup lang="ts">
import { ref, computed, onMounted, nextTick, reactive, watch, onBeforeUnmount } from 'vue';
import type { EntidadResumen, ActualizarEntidadPayload, ActualizarPersonaPayload, ActualizarInstitucionPayload } from '../types';
import { apiService } from '../api/apiService';
import PersonaForm from '../components/PersonaForm.vue';
import InstitucionForm from '../components/InstitucionForm.vue';
import ModalEditar from '../components/ModalEditar.vue';
import ModalConfirmacionEliminar from '../components/ModalConfirmacionEliminar.vue';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { Trash2, Plus, Pencil, Users, Building2 } from 'lucide-vue-next';

const personas = ref<EntidadResumen[]>([]);
const instituciones = ref<EntidadResumen[]>([]);
const loading = ref(true);
const personaSearch = ref('');
const institucionSearch = ref('');
const activeSection = ref<'personas' | 'instituciones'>('personas');
const createMode = ref<'persona' | 'institucion' | null>(null);
const isEditModalOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const isDeleteModalOpen = ref(false);
const isDeleting = ref(false);
const deleteTarget = ref<{ id: number; tipo: 'Persona' | 'Institucion'; nombre: string } | null>(null);
const highlightedPersonaId = ref<number | null>(null);
const gestorFallback = reactive<Record<number, EntidadResumen>>({});
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

const personaDictionary = computed(() => {
    const dict: Record<number, EntidadResumen> = {};
    personas.value.forEach(persona => {
        dict[persona.id] = persona;
    });
    return dict;
});

const personasCount = computed(() => personas.value.length);
const institucionesCount = computed(() => instituciones.value.length);

const filteredPersonas = computed(() => {
    const q = personaSearch.value.trim().toLowerCase();
    if (!q) return personas.value;
    return personas.value.filter(persona => {
        const rut = persona.identificador?.toLowerCase() ?? '';
        const nombre = persona.nombreCompleto?.toLowerCase() ?? '';
        const comuna = persona.comuna?.toLowerCase() ?? '';
        return nombre.includes(q) || rut.includes(q) || comuna.includes(q);
    });
});

const filteredInstituciones = computed(() => {
    const q = institucionSearch.value.trim().toLowerCase();
    if (!q) return instituciones.value;
    return instituciones.value.filter(inst => {
        const rut = inst.identificador?.toLowerCase() ?? '';
        const nombre = inst.nombreCompleto?.toLowerCase() ?? '';
        const comuna = inst.comuna?.toLowerCase() ?? '';
        return nombre.includes(q) || rut.includes(q) || comuna.includes(q);
    });
});

const loadData = async () => {
    loading.value = true;
    try {
        const [personasData, institucionesData] = await Promise.all([
            apiService.getPersonas(),
            apiService.getInstituciones()
        ]);
        personas.value = personasData;
        instituciones.value = institucionesData;
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudieron cargar las entidades.' };
    } finally {
        loading.value = false;
    }
};

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 3500);
};

const openCreatePanel = (mode: 'persona' | 'institucion') => {
    createMode.value = mode;
    activeSection.value = mode === 'persona' ? 'personas' : 'instituciones';
};

const closeCreatePanel = () => {
    createMode.value = null;
};

const startEdit = (entidad: EntidadResumen) => {
    selectedEntidad.value = entidad;
    isEditModalOpen.value = true;
};

const handleSaveEdit = async (payload: ActualizarEntidadPayload) => {
    try {
        await apiService.actualizarEntidad(payload.id, payload);
        await loadData();
        if (selectedEntidad.value && selectedEntidad.value.id === payload.id) {
            const base: EntidadResumen = {
                ...selectedEntidad.value,
                ...payload,
                tipoEntidad: payload.tipoEntidad
            };
            if (payload.tipoEntidad === 'Persona') {
                const personaPayload = payload as ActualizarPersonaPayload;
                base.nombres = personaPayload.nombres ?? base.nombres;
                base.apellidos = personaPayload.apellidos ?? base.apellidos;
                base.nombreCompleto =
                    `${personaPayload.nombres ?? base.nombres ?? ''} ${personaPayload.apellidos ?? base.apellidos ?? ''}`.trim() ||
                    base.nombreCompleto;
                base.correo = personaPayload.correo ?? base.correo;
                base.telefono = personaPayload.telefono ?? base.telefono;
                base.direccion = personaPayload.direccion ?? base.direccion;
                base.comuna = personaPayload.comuna ?? base.comuna;
                base.genero = personaPayload.genero ?? base.genero;
                base.ocupacion = personaPayload.ocupacion ?? base.ocupacion;
                base.redSocial = personaPayload.redSocial ?? base.redSocial;
                base.gestorId = personaPayload.gestorId ?? base.gestorId;
                base.anotaciones = personaPayload.anotaciones ?? base.anotaciones;
                base.sector = personaPayload.sector ?? base.sector;
            } else {
                const institucionPayload = payload as ActualizarInstitucionPayload;
                base.nombreCompleto =
                    institucionPayload.nombre ??
                    institucionPayload.nombreFantasia ??
                    institucionPayload.razonSocial ??
                    base.nombreCompleto;
                base.razonSocial = institucionPayload.razonSocial ?? base.razonSocial;
                base.nombreFantasia = institucionPayload.nombreFantasia ?? base.nombreFantasia;
                base.subtipoInstitucion = institucionPayload.subtipoInstitucion ?? base.subtipoInstitucion;
                base.rubro = institucionPayload.rubro ?? base.rubro;
                base.redSocial = institucionPayload.redSocial ?? base.redSocial;
                base.gestorId = institucionPayload.gestorId ?? base.gestorId;
                base.anotaciones = institucionPayload.anotaciones ?? base.anotaciones;
                base.sector = institucionPayload.sector ?? base.sector;
                base.correo = institucionPayload.correo ?? base.correo;
                base.telefono = institucionPayload.telefono ?? base.telefono;
                base.direccion = institucionPayload.direccion ?? base.direccion;
                base.comuna = institucionPayload.comuna ?? base.comuna;
            }
            selectedEntidad.value = base;
        }
        isEditModalOpen.value = false;
        showToast('success', 'Entidad actualizada exitosamente.');
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo actualizar la entidad.');
    }
};

const confirmDelete = (entidad: EntidadResumen) => {
    deleteTarget.value = {
        id: entidad.id,
        tipo: entidad.tipoEntidad,
        nombre: entidad.nombreCompleto || formatRutForDisplay(entidad.identificador || '')
    };
    isDeleteModalOpen.value = true;
};

const closeDeleteModal = () => {
    isDeleteModalOpen.value = false;
    deleteTarget.value = null;
};

const handleDelete = async () => {
    if (!deleteTarget.value) return;
    const target = { ...deleteTarget.value };
    isDeleting.value = true;
    try {
        if (target.tipo === 'Persona') {
            await apiService.eliminarPersona(target.id);
        } else {
            await apiService.eliminarInstitucion(target.id);
        }
        await loadData();
        showToast('success', target.tipo === 'Persona' ? 'Persona eliminada exitosamente.' : 'Institución eliminada exitosamente.');
        closeDeleteModal();
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo eliminar la entidad.');
    } finally {
        isDeleting.value = false;
    }
};

const handlePersonaCreada = async () => {
    createMode.value = null;
    await loadData();
    showToast('success', 'Persona creada correctamente.');
};

const handleInstitucionCreada = async () => {
    createMode.value = null;
    await loadData();
    showToast('success', 'Institución creada correctamente.');
};

const getGestorLabel = (persona: EntidadResumen) => {
    if (!persona.gestorId) return 'Sin asignar';
    const gestor = personaDictionary.value[persona.gestorId] || gestorFallback[persona.gestorId];
    if (gestor) {
        return gestor.nombreCompleto || formatRutForDisplay(gestor.identificador);
    }
    if (persona.gestorNombre) return persona.gestorNombre;
    if (persona.gestorRut) return formatRutForDisplay(persona.gestorRut);
    return `ID ${persona.gestorId}`;
};

const ensureGestorLoaded = async (gestorId: number) => {
    if (personaDictionary.value[gestorId]) {
        return personaDictionary.value[gestorId];
    }
    if (gestorFallback[gestorId]) {
        return gestorFallback[gestorId];
    }
    try {
        const gestor = await apiService.getPersona(gestorId);
        gestorFallback[gestorId] = gestor;
        return gestor;
    } catch (e) {
        console.error('No se pudo cargar el gestor', e);
        return null;
    }
};

const focusPersona = async (gestorId: number) => {
    if (!gestorId) return;
    await ensureGestorLoaded(gestorId);
    highlightedPersonaId.value = gestorId;
    await nextTick();
    const row = document.getElementById(`persona-row-${gestorId}`);
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = window.setTimeout(() => {
        highlightedPersonaId.value = null;
    }, 4000);
};

watch(activeSection, section => {
    if (createMode.value === 'persona' && section !== 'personas') {
        createMode.value = null;
    }
    if (createMode.value === 'institucion' && section !== 'instituciones') {
        createMode.value = null;
    }
});

onMounted(loadData);

onBeforeUnmount(() => {
    if (highlightTimeout) {
        clearTimeout(highlightTimeout);
    }
});
</script>

<template>
    <div class="px-4 py-6 sm:px-0 space-y-6">
        <div
            v-if="message"
            :class="[
                'p-4 rounded-xl border text-sm font-medium',
                message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-600/10 dark:text-emerald-200 dark:border-emerald-500/40'
                    : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/40'
            ]"
        >
            {{ message.text }}
        </div>

        <section class="surface-card p-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p class="eyebrow text-[var(--accent-color)]">Acceder</p>
                    <h2 class="text-3xl font-bold text-gray-900 dark:text-white">Entidades</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
                        Administra personas e instituciones desde un mismo panel, con búsquedas rápidas, formularios integrados y acciones contextuales.
                    </p>
                </div>
                <div class="flex flex-wrap gap-3 items-center justify-end">
                    <button
                        v-if="createMode"
                        class="btn btn-outline"
                        @click="closeCreatePanel"
                    >
                        Volver a la lista
                    </button>
                    <div class="inline-flex rounded-full border border-[var(--card-border)] bg-[var(--surface-muted)]/40 p-1">
                        <button
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
                            :class="createMode === 'persona'
                                ? 'bg-white dark:bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                            @click="openCreatePanel('persona')"
                        >
                            <Plus class="w-4 h-4" /> Persona
                        </button>
                        <button
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
                            :class="createMode === 'institucion'
                                ? 'bg-white dark:bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                            @click="openCreatePanel('institucion')"
                        >
                            <Plus class="w-4 h-4" /> Institución
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mt-6">
                <div class="inline-flex rounded-full border border-[var(--card-border)] bg-[var(--surface-muted)]/40 p-1">
                    <button
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
                        :class="activeSection === 'personas'
                            ? 'bg-white dark:bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                        @click="activeSection = 'personas'"
                    >
                        <Users class="w-4 h-4" />
                        Personas
                        <span class="text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-200">
                            {{ personasCount }}
                        </span>
                    </button>
                    <button
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
                        :class="activeSection === 'instituciones'
                            ? 'bg-white dark:bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                        @click="activeSection = 'instituciones'"
                    >
                        <Building2 class="w-4 h-4" />
                        Instituciones
                        <span class="text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-200">
                            {{ institucionesCount }}
                        </span>
                    </button>
                </div>

                <div class="text-xs uppercase tracking-[0.35em] text-gray-400 flex gap-4">
                    <span>{{ personasCount }} personas</span>
                    <span>{{ institucionesCount }} instituciones</span>
                </div>
            </div>
        </section>

        <section v-if="activeSection === 'personas'" class="space-y-4">
            <div v-if="createMode === 'persona'" class="surface-card p-6 border border-[var(--card-border)]">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">Registrar nueva persona</h3>
                <PersonaForm @cancel="closeCreatePanel" @created="handlePersonaCreada" />
            </div>

            <div v-else class="surface-card p-0 overflow-hidden">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-5 border-b border-[var(--card-border)]">
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-[var(--accent-color)]">Personas</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Listado actualizado con vínculo a su gestor</p>
                    </div>
                    <div class="w-full md:w-80 relative">
                        <input
                            v-model="personaSearch"
                            type="search"
                            placeholder="Buscar por nombre, RUT o comuna..."
                            class="w-full rounded-full border border-[var(--card-border)] bg-[var(--bg-base)]/60 px-4 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-0"
                        >
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-[var(--card-border)] table-soft">
                        <thead class="bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <tr>
                                <th class="px-6 py-3 text-left">Persona</th>
                                <th class="px-6 py-3 text-left">Contacto</th>
                                <th class="px-6 py-3 text-left">Ubicación</th>
                                <th class="px-6 py-3 text-left">Gestor asignado</th>
                                <th class="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-white dark:bg-[var(--bg-card)]">
                            <tr v-if="loading">
                                <td colspan="5" class="px-6 py-8 text-center text-gray-500">Cargando personas...</td>
                            </tr>
                            <tr v-else-if="filteredPersonas.length === 0">
                                <td colspan="5" class="px-6 py-8 text-center text-gray-500">No hay coincidencias para este filtro.</td>
                            </tr>
                            <tr
                                v-else
                                v-for="persona in filteredPersonas"
                                :key="persona.id"
                                :id="`persona-row-${persona.id}`"
                                :class="[
                                    'transition-all hover:bg-black/5 dark:hover:bg-white/5',
                                    { 'highlighted-row ring-1 ring-[var(--accent-color)]': highlightedPersonaId === persona.id }
                                ]"
                            >
                                <td class="px-6 py-4 text-sm">
                                    <p class="font-semibold text-gray-900 dark:text-gray-100">{{ persona.nombreCompleto || 'Sin nombre' }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(persona.identificador || '') }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ persona.correo || 'Sin correo' }}</p>
                                    <p class="text-xs text-gray-500">{{ persona.telefono || 'Sin teléfono' }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ persona.comuna || 'Sin comuna' }}</p>
                                    <p class="text-xs text-gray-500 truncate">{{ persona.direccion || 'Sin dirección registrada' }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm">
                                    <button
                                        v-if="persona.gestorId"
                                        class="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] px-3 py-1 text-[13px] font-medium text-[var(--accent-color)] hover:bg-[var(--accent-color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/40"
                                        @click="focusPersona(persona.gestorId)"
                                    >
                                        {{ getGestorLabel(persona) }}
                                    </button>
                                    <span v-else class="text-gray-400 text-sm">Sin asignar</span>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-2">
                                        <button
                                            class="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                                            @click="startEdit(persona)"
                                        >
                                            <Pencil class="w-3.5 h-3.5" /> Editar
                                        </button>
                                        <button
                                            class="inline-flex items-center gap-1 rounded-full border border-red-200/60 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/50 dark:text-red-200"
                                            @click="confirmDelete(persona)"
                                        >
                                            <Trash2 class="w-3.5 h-3.5" /> Eliminar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section v-else class="space-y-4">
            <div v-if="createMode === 'institucion'" class="surface-card p-6 border border-[var(--card-border)]">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">Registrar nueva institución</h3>
                <InstitucionForm @cancel="closeCreatePanel" @created="handleInstitucionCreada" />
            </div>

            <div class="surface-card p-0 overflow-hidden">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-5 border-b border-[var(--card-border)]">
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-[var(--accent-color)]">Instituciones</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Listado de organizaciones con datos de contacto</p>
                    </div>
                    <div class="w-full md:w-80">
                        <input
                            v-model="institucionSearch"
                            type="search"
                            placeholder="Buscar por nombre, RUT o comuna..."
                            class="w-full rounded-full border border-[var(--card-border)] bg-[var(--bg-base)]/60 px-4 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-0"
                        >
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-[var(--card-border)] table-soft">
                        <thead class="bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <tr>
                                <th class="px-6 py-3 text-left">Institución</th>
                                <th class="px-6 py-3 text-left">Contacto</th>
                                <th class="px-6 py-3 text-left">Ubicación</th>
                                <th class="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-white dark:bg-[var(--bg-card)]">
                            <tr v-if="loading">
                                <td colspan="4" class="px-6 py-8 text-center text-gray-500">Cargando instituciones...</td>
                            </tr>
                            <tr v-else-if="filteredInstituciones.length === 0">
                                <td colspan="4" class="px-6 py-8 text-center text-gray-500">No hay coincidencias para este filtro.</td>
                            </tr>
                            <tr
                                v-else
                                v-for="inst in filteredInstituciones"
                                :key="inst.id"
                                class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <td class="px-6 py-4 text-sm">
                                    <p class="font-semibold text-gray-900 dark:text-gray-100">{{ inst.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(inst.identificador || '') }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ inst.correo || 'Sin correo' }}</p>
                                    <p class="text-xs text-gray-500">{{ inst.telefono || 'Sin teléfono' }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ inst.comuna || 'Sin comuna' }}</p>
                                    <p class="text-xs text-gray-500 truncate">{{ inst.direccion || 'Sin dirección registrada' }}</p>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center justify-end gap-2">
                                        <button
                                            class="inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                                            @click="startEdit(inst)"
                                        >
                                            <Pencil class="w-3.5 h-3.5" /> Editar
                                        </button>
                                        <button
                                            class="inline-flex items-center gap-1 rounded-full border border-red-200/60 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/50 dark:text-red-200"
                                            @click="confirmDelete(inst)"
                                        >
                                            <Trash2 class="w-3.5 h-3.5" /> Eliminar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <ModalEditar
            :isOpen="isEditModalOpen"
            :entidad="selectedEntidad"
            @close="isEditModalOpen = false"
            @save="handleSaveEdit"
        />

        <ModalConfirmacionEliminar
            :isOpen="isDeleteModalOpen"
            :entidadNombre="deleteTarget?.nombre || ''"
            :entidadTipo="deleteTarget?.tipo"
            :isDeleting="isDeleting"
            @close="closeDeleteModal"
            @confirm="handleDelete"
        />
    </div>
</template>
