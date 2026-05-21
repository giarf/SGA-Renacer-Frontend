<script setup lang="ts">
import { ref, computed, onMounted, nextTick, reactive, watch, onBeforeUnmount } from 'vue';
import type { EntidadResumen, ActualizarEntidadPayload, ActualizarPersonaPayload, ActualizarInstitucionPayload, Etiqueta } from '../types';
import { apiService } from '../api/apiService';
import PersonaForm from '../components/PersonaForm.vue';
import InstitucionForm from '../components/InstitucionForm.vue';
import ModalEditar from '../components/ModalEditar.vue';
import ModalConfirmacionEliminar from '../components/ModalConfirmacionEliminar.vue';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { Trash2, Plus, Pencil, Users, Building2, Tags, X, MessageCircle } from 'lucide-vue-next';

type WhatsappRecipient = {
    persona: EntidadResumen;
    numero: string;
};

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
const etiquetas = ref<Etiqueta[]>([]);
const selectedPersonaIds = ref<Set<number>>(new Set());
const selectedEtiquetaId = ref<number | ''>('');
const selectedEtiquetaFilter = ref<number | ''>('');
const nuevaEtiquetaNombre = ref('');
const bulkApplying = ref(false);
const isWhatsappModalOpen = ref(false);
const whatsappMessage = ref('Hola {nombre}, te escribimos desde Fundación Familia Renacer.');
const currentWhatsappIndex = ref(0);
const openedWhatsappIds = ref<Set<number>>(new Set());
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
const selectedPersonasCount = computed(() => selectedPersonaIds.value.size);
const allVisiblePersonasSelected = computed(() => filteredPersonas.value.length > 0 && filteredPersonas.value.every(persona => selectedPersonaIds.value.has(persona.id)));

const filteredPersonas = computed(() => {
    const q = personaSearch.value.trim().toLowerCase();
    const etiquetaId = selectedEtiquetaFilter.value;
    return personas.value.filter(persona => {
        const rut = persona.identificador?.toLowerCase() ?? '';
        const nombre = persona.nombreCompleto?.toLowerCase() ?? '';
        const comuna = persona.comuna?.toLowerCase() ?? '';
        const matchesText = !q || nombre.includes(q) || rut.includes(q) || comuna.includes(q);
        const matchesEtiqueta = !etiquetaId || persona.etiquetas?.some(etiqueta => etiqueta.id === Number(etiquetaId));
        return matchesText && matchesEtiqueta;
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

const normalizeWhatsappNumber = (telefono?: string) => {
    const raw = telefono?.replace(/[\s\-()+]/g, '') ?? '';
    if (!raw) return '';
    if (raw.startsWith('9') && raw.length === 9) return `56${raw}`;
    return raw.startsWith('56') ? raw : '';
};

const whatsappRecipients = computed<WhatsappRecipient[]>(() =>
    filteredPersonas.value
        .filter(persona => selectedPersonaIds.value.has(persona.id))
        .map(persona => ({ persona, numero: normalizeWhatsappNumber(persona.telefono) }))
        .filter((recipient): recipient is WhatsappRecipient => Boolean(recipient.numero))
);

const selectedVisiblePersonasCount = computed(() => filteredPersonas.value.filter(persona => selectedPersonaIds.value.has(persona.id)).length);

const whatsappInvalidCount = computed(() => selectedVisiblePersonasCount.value - whatsappRecipients.value.length);

const currentWhatsappRecipient = computed(() => whatsappRecipients.value[currentWhatsappIndex.value] ?? null);

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

const loadEtiquetas = async () => {
    try {
        etiquetas.value = await apiService.getEtiquetas();
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron cargar las etiquetas.');
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

const whatsappUrl = (telefono?: string) => {
    const normalized = normalizeWhatsappNumber(telefono);
    return normalized ? `https://wa.me/${normalized}` : '';
};

const renderWhatsappMessage = (persona: EntidadResumen) =>
    whatsappMessage.value
        .replace(/\{nombreCompleto\}/g, persona.nombreCompleto || '')
        .replace(/\{nombre\}/g, (persona.nombres || persona.nombreCompleto || '').trim().split(/\s+/)[0] || '')
        .replace(/\{rut\}/g, formatRutForDisplay(persona.identificador || ''))
        .replace(/\{comuna\}/g, persona.comuna || '');

const currentWhatsappMessage = computed(() =>
    currentWhatsappRecipient.value ? renderWhatsappMessage(currentWhatsappRecipient.value.persona) : ''
);

const whatsappInitial = (persona: EntidadResumen) =>
    (persona.nombres || persona.nombreCompleto || '?').charAt(0).toUpperCase();

const currentWhatsappUrl = computed(() => {
    if (!currentWhatsappRecipient.value) return '';
    return `https://wa.me/${currentWhatsappRecipient.value.numero}?text=${encodeURIComponent(currentWhatsappMessage.value)}`;
});

const openWhatsappModal = () => {
    if (whatsappRecipients.value.length === 0) {
        showToast('error', 'Selecciona al menos una persona visible con teléfono válido.');
        return;
    }
    currentWhatsappIndex.value = 0;
    openedWhatsappIds.value = new Set();
    isWhatsappModalOpen.value = true;
};

const closeWhatsappModal = () => {
    isWhatsappModalOpen.value = false;
};

const goToNextWhatsappRecipient = () => {
    if (currentWhatsappIndex.value < whatsappRecipients.value.length - 1) {
        currentWhatsappIndex.value += 1;
    }
};

const goToPreviousWhatsappRecipient = () => {
    if (currentWhatsappIndex.value > 0) {
        currentWhatsappIndex.value -= 1;
    }
};

const openCurrentWhatsapp = () => {
    if (!currentWhatsappRecipient.value || !currentWhatsappUrl.value) return;
    window.open(currentWhatsappUrl.value, '_blank', 'noopener,noreferrer');
    const next = new Set(openedWhatsappIds.value);
    next.add(currentWhatsappRecipient.value.persona.id);
    openedWhatsappIds.value = next;
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

const syncPersonaEtiquetas = async (personaId: number, etiquetaIds: number[]) => {
    const currentIds = selectedEntidad.value?.id === personaId
        ? selectedEntidad.value.etiquetas?.map(etiqueta => etiqueta.id) ?? []
        : [];
    const current = new Set(currentIds);
    const next = new Set(etiquetaIds);
    const toAdd = etiquetaIds.filter(id => !current.has(id));
    const toRemove = currentIds.filter(id => !next.has(id));

    await Promise.all([
        ...toAdd.map(id => apiService.asignarEtiquetaEntidad(personaId, id)),
        ...toRemove.map(id => apiService.quitarEtiquetaEntidad(personaId, id))
    ]);
};

const handleSaveEdit = async (payload: ActualizarEntidadPayload, foto?: File, etiquetaIds?: number[]) => {
    try {
        await apiService.actualizarEntidad(payload.id, payload);
        if (payload.tipoEntidad === 'Persona' && foto) {
            await apiService.actualizarFotoPersona(payload.id, foto);
        }
        if (payload.tipoEntidad === 'Persona' && etiquetaIds) {
            await syncPersonaEtiquetas(payload.id, etiquetaIds);
        }
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

const isPersonaSelected = (id: number) => selectedPersonaIds.value.has(id);

const setPersonaSelected = (id: number, checked: boolean) => {
    const next = new Set(selectedPersonaIds.value);
    if (checked) next.add(id);
    else next.delete(id);
    selectedPersonaIds.value = next;
};

const toggleAllVisiblePersonas = (checked: boolean) => {
    const next = new Set(selectedPersonaIds.value);
    filteredPersonas.value.forEach(persona => {
        if (checked) next.add(persona.id);
        else next.delete(persona.id);
    });
    selectedPersonaIds.value = next;
};

const clearPersonaSelection = () => {
    selectedPersonaIds.value = new Set();
};

const crearEtiquetaRapida = async () => {
    const nombre = nuevaEtiquetaNombre.value.trim();
    if (!nombre) return showToast('error', 'Escribe el nombre de la etiqueta.');
    try {
        const created = await apiService.crearEtiqueta({ nombre });
        nuevaEtiquetaNombre.value = '';
        await loadEtiquetas();
        selectedEtiquetaId.value = created.id;
        showToast('success', 'Etiqueta creada.');
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo crear la etiqueta.');
    }
};

const asignarEtiquetaSeleccionadas = async () => {
    if (!selectedEtiquetaId.value) return showToast('error', 'Selecciona una etiqueta.');
    const ids = Array.from(selectedPersonaIds.value);
    if (!ids.length) return showToast('error', 'Selecciona al menos una persona.');
    bulkApplying.value = true;
    try {
        const result = await apiService.asignarEtiquetaMasiva(Number(selectedEtiquetaId.value), ids);
        await loadData();
        clearPersonaSelection();
        const asignadas = result.asignadas ?? ids.length;
        showToast('success', asignadas > 0 ? `Etiqueta asignada a ${asignadas} persona(s).` : 'La etiqueta ya estaba asignada a las personas seleccionadas.');
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo asignar la etiqueta.');
    } finally {
        bulkApplying.value = false;
    }
};

watch(activeSection, section => {
    if (createMode.value === 'persona' && section !== 'personas') {
        createMode.value = null;
    }
    if (createMode.value === 'institucion' && section !== 'instituciones') {
        createMode.value = null;
    }
});

onMounted(() => {
    loadData();
    loadEtiquetas();
});

onBeforeUnmount(() => {
    if (highlightTimeout) {
        clearTimeout(highlightTimeout);
    }
});
</script>

<template>
    <div class="form-page space-y-4">
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

        <section class="rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] px-5 py-4 shadow-sm">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p class="eyebrow text-[var(--accent-color)]">Acceder</p>
                    <h2 class="text-lg font-semibold text-[var(--text-primary)]">Entidades</h2>
                    <p class="max-w-2xl text-xs text-[var(--text-muted)]">
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
                                ? 'bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
                            @click="openCreatePanel('persona')"
                        >
                            <Plus class="w-4 h-4" /> Persona
                        </button>
                        <button
                            class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
                            :class="createMode === 'institucion'
                                ? 'bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
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
                            ? 'bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
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
                            ? 'bg-[var(--bg-card)] text-[var(--accent-color)] shadow-sm'
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
            <div v-if="createMode === 'persona'" class="form-shell p-5">
                <h3 class="mb-4 text-base font-semibold text-[var(--text-primary)]">Registrar nueva persona</h3>
                <PersonaForm @cancel="closeCreatePanel" @created="handlePersonaCreada" />
            </div>

            <div v-else class="rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] p-0 shadow-sm overflow-hidden">
                <div class="flex flex-col gap-3 border-b border-[var(--card-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-[var(--accent-color)]">Personas</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Listado actualizado con vínculo a su gestor</p>
                    </div>
                    <div class="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:min-w-[520px]">
                        <input
                            v-model="personaSearch"
                            type="search"
                            placeholder="Buscar por nombre, RUT o comuna..."
                            class="h-10 rounded-xl border border-[var(--card-border)] bg-[var(--bg-base)]/60 px-4 text-sm focus:border-[var(--accent-color)] focus:ring-0"
                        >
                        <select v-model="selectedEtiquetaFilter" class="compact-control h-10 rounded-xl">
                            <option value="">Todas las etiquetas</option>
                            <option v-for="etiqueta in etiquetas" :key="etiqueta.id" :value="etiqueta.id">
                                {{ etiqueta.nombre }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="flex flex-col gap-3 border-b border-[var(--card-border)] bg-[var(--accent-color-muted)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Tags class="h-4 w-4 text-[var(--accent-color)]" />
                        <span v-if="selectedPersonasCount > 0">{{ selectedPersonasCount }} persona(s) seleccionada(s)</span>
                        <span v-else>Selecciona personas con los checks para asignar etiquetas</span>
                    </div>
                    <button class="btn btn-outline h-10 px-4" type="button" :disabled="selectedPersonasCount === 0" @click="clearPersonaSelection">
                        <X class="h-4 w-4" /> Limpiar selección
                    </button>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-[var(--card-border)] table-soft">
                        <thead class="bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <tr>
                                <th class="w-16 px-4 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        class="selection-checkbox"
                                        :checked="allVisiblePersonasSelected"
                                        @change="toggleAllVisiblePersonas(($event.target as HTMLInputElement).checked)"
                                    >
                                    <span class="sr-only">Seleccionar todas las personas visibles</span>
                                </th>
                                <th class="min-w-[360px] px-6 py-3 text-left">Persona</th>
                                <th class="px-6 py-3 text-left">Contacto</th>
                                <th class="w-44 px-4 py-3 text-left">Ubicación</th>
                                <th class="px-6 py-3 text-left">Etiquetas</th>
                                <th class="px-6 py-3 text-left">Gestor asignado</th>
                                <th class="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-[var(--bg-card)]">
                            <tr v-if="loading">
                                <td colspan="7" class="px-6 py-8 text-center text-gray-500">Cargando personas...</td>
                            </tr>
                            <tr v-else-if="filteredPersonas.length === 0">
                                <td colspan="7" class="px-6 py-8 text-center text-gray-500">No hay coincidencias para este filtro.</td>
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
                                <td class="w-16 px-4 py-4 text-center align-middle">
                                    <input
                                        type="checkbox"
                                        class="selection-checkbox"
                                        :checked="isPersonaSelected(persona.id)"
                                        @change="setPersonaSelected(persona.id, ($event.target as HTMLInputElement).checked)"
                                    >
                                </td>
                                <td class="min-w-[360px] px-6 py-4 text-sm">
                                    <div class="flex items-center gap-3">
                                        <img
                                            v-if="persona.fotoUrl"
                                            :src="persona.fotoUrl"
                                            :alt="`Foto de ${persona.nombreCompleto || 'persona'}`"
                                            class="h-11 w-11 rounded-full object-cover ring-1 ring-[var(--card-border)]"
                                            loading="lazy"
                                        >
                                        <div v-else class="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold text-gray-400 ring-1 ring-[var(--card-border)]">
                                            {{ (persona.nombreCompleto || '?').slice(0, 1).toUpperCase() }}
                                        </div>
                                        <div>
                                            <p class="whitespace-nowrap font-semibold text-gray-900 dark:text-gray-100">{{ persona.nombreCompleto || 'Sin nombre' }}</p>
                                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(persona.identificador || '') }}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ persona.correo || 'Sin correo' }}</p>
                                    <a
                                        v-if="whatsappUrl(persona.telefono)"
                                        class="text-xs font-medium text-[var(--accent-color)] hover:underline"
                                        :href="whatsappUrl(persona.telefono)"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {{ persona.telefono }}
                                    </a>
                                    <p v-else class="text-xs text-gray-500">{{ persona.telefono || 'Sin teléfono' }}</p>
                                </td>
                                <td class="w-44 max-w-44 px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ persona.comuna || 'Sin comuna' }}</p>
                                    <p class="truncate text-xs text-gray-500" :title="persona.direccion || 'Sin dirección registrada'">{{ persona.direccion || 'Sin dirección registrada' }}</p>
                                </td>
                                <td class="px-6 py-4 text-sm">
                                    <div v-if="persona.etiquetas?.length" class="flex flex-wrap gap-1.5">
                                        <span
                                            v-for="etiqueta in persona.etiquetas"
                                            :key="etiqueta.id"
                                            class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                                            :style="{ backgroundColor: etiqueta.color || '#e0f2fe', color: etiqueta.color ? '#111827' : '#0369a1' }"
                                        >
                                            {{ etiqueta.nombre }}
                                        </span>
                                    </div>
                                    <span v-else class="text-xs text-gray-400">Sin etiquetas</span>
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

                <div class="border-t border-[var(--card-border)] bg-[var(--surface-muted)]/30 px-5 py-4">
                    <div class="flex flex-col gap-4">
                        <div>
                            <p class="text-sm font-semibold text-[var(--text-primary)]">Acciones para seleccionadas</p>
                            <p class="text-xs text-[var(--text-muted)]">
                                {{ filteredPersonas.length }} persona(s) visibles · {{ selectedVisiblePersonasCount }} seleccionada(s) en esta lista · {{ whatsappRecipients.length }} con WhatsApp válido
                                <span v-if="whatsappInvalidCount > 0">· {{ whatsappInvalidCount }} seleccionada(s) sin teléfono válido</span>
                            </p>
                        </div>

                        <div class="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                            <div>
                                <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Etiqueta existente</label>
                                <select v-model="selectedEtiquetaId" class="compact-control h-10">
                                    <option value="">Seleccionar etiqueta</option>
                                    <option v-for="etiqueta in etiquetas" :key="etiqueta.id" :value="etiqueta.id">
                                        {{ etiqueta.nombre }}
                                    </option>
                                </select>
                            </div>
                            <button class="btn btn-primary h-10" type="button" :disabled="bulkApplying || selectedPersonasCount === 0" @click="asignarEtiquetaSeleccionadas">
                                Asignar etiqueta
                            </button>
                        </div>

                        <div class="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                            <div>
                                <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Crear nueva etiqueta</label>
                                <input v-model="nuevaEtiquetaNombre" class="compact-control h-10" placeholder="Nueva etiqueta rápida">
                            </div>
                            <button class="btn btn-outline h-10" type="button" @click="crearEtiquetaRapida">Crear etiqueta</button>
                        </div>

                        <div class="flex justify-end">
                            <button
                                type="button"
                                class="btn btn-primary"
                                :disabled="whatsappRecipients.length === 0"
                                @click="openWhatsappModal"
                            >
                                <MessageCircle class="h-4 w-4" /> Enviar WhatsApp a seleccionadas
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section v-else class="space-y-4">
            <div v-if="createMode === 'institucion'" class="form-shell p-5">
                <h3 class="mb-4 text-base font-semibold text-[var(--text-primary)]">Registrar nueva institución</h3>
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
                        <tbody class="divide-y divide-[var(--card-border)] bg-[var(--bg-card)]">
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

        <div v-if="isWhatsappModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
            <div class="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] shadow-2xl">
                <div class="flex items-start justify-between gap-4 border-b border-[var(--card-border)] px-5 py-4">
                    <div>
                        <p class="text-xs uppercase tracking-[0.25em] text-[var(--accent-color)]">WhatsApp asistido</p>
                        <h3 class="text-lg font-semibold text-[var(--text-primary)]">Enviar mensaje a personas seleccionadas</h3>
                        <p class="text-sm text-[var(--text-muted)]">
                            {{ selectedVisiblePersonasCount }} seleccionada(s) en la lista visible · {{ whatsappRecipients.length }} destinatario(s) válidos · {{ whatsappInvalidCount }} sin teléfono válido
                        </p>
                    </div>
                    <button type="button" class="rounded-lg p-2 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10" @click="closeWhatsappModal">
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <div class="space-y-4 p-5">
                    <div>
                        <label class="mb-1 block text-sm font-semibold">Mensaje</label>
                        <textarea v-model="whatsappMessage" rows="4" class="compact-control" placeholder="Escribe el mensaje para WhatsApp"></textarea>
                        <p class="mt-1 text-xs text-[var(--text-muted)]">Variables disponibles: <strong>{nombre}</strong>, <strong>{nombreCompleto}</strong>, <strong>{rut}</strong>, <strong>{comuna}</strong>.</p>
                    </div>

                    <div v-if="currentWhatsappRecipient" class="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-muted)]/30 p-4">
                        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div class="flex items-center gap-3">
                                <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[var(--accent-color)]/10">
                                    <img v-if="currentWhatsappRecipient.persona.fotoUrl" :src="currentWhatsappRecipient.persona.fotoUrl" class="h-full w-full object-cover" />
                                    <span v-else class="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--accent-color)]">
                                        {{ whatsappInitial(currentWhatsappRecipient.persona) }}
                                    </span>
                                </div>
                                <div>
                                    <p class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                        {{ currentWhatsappIndex + 1 }} de {{ whatsappRecipients.length }}
                                    </p>
                                    <p class="text-base font-semibold text-[var(--text-primary)]">{{ currentWhatsappRecipient.persona.nombreCompleto }}</p>
                                    <p class="text-sm text-[var(--text-muted)]">+{{ currentWhatsappRecipient.numero }}</p>
                                </div>
                            </div>
                            <span
                                class="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold"
                                :class="openedWhatsappIds.has(currentWhatsappRecipient.persona.id)
                                    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-200'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'"
                            >
                                {{ openedWhatsappIds.has(currentWhatsappRecipient.persona.id) ? 'Abierto' : 'Pendiente' }}
                            </span>
                        </div>
                        <div class="rounded-xl border border-[var(--card-border)] bg-[var(--bg-card)] p-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap">{{ currentWhatsappMessage }}</div>
                    </div>

                    <div v-else class="rounded-xl border border-[var(--card-border)] p-4 text-sm text-[var(--text-muted)]">
                        No hay destinatarios válidos entre las personas seleccionadas.
                    </div>
                </div>

                <div class="flex flex-col gap-2 border-t border-[var(--card-border)] p-5 sm:flex-row sm:justify-end">
                    <button type="button" class="btn btn-secondary" @click="closeWhatsappModal">Cerrar</button>
                    <button type="button" class="btn btn-outline" :disabled="!currentWhatsappRecipient || currentWhatsappIndex === 0" @click="goToPreviousWhatsappRecipient">
                        Atrás
                    </button>
                    <button type="button" class="btn btn-outline" :disabled="!currentWhatsappRecipient || currentWhatsappIndex >= whatsappRecipients.length - 1" @click="goToNextWhatsappRecipient">
                        Siguiente
                    </button>
                    <button type="button" class="btn btn-primary" :disabled="!currentWhatsappRecipient || !whatsappMessage.trim()" @click="openCurrentWhatsapp">
                        <MessageCircle class="h-4 w-4" /> Abrir WhatsApp
                    </button>
                </div>
            </div>
        </div>

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

<style scoped>
.selection-checkbox {
    width: 1.35rem;
    height: 1.35rem;
    cursor: pointer;
    appearance: none;
    border: 2px solid var(--accent-color);
    border-radius: 0.35rem;
    background: var(--bg-base);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 14%, transparent);
    display: inline-grid;
    place-content: center;
}

.selection-checkbox::before {
    content: '';
    width: 0.7rem;
    height: 0.7rem;
    transform: scale(0);
    transition: transform 120ms ease-in-out;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0, 43% 62%);
    background: white;
}

.selection-checkbox:checked {
    background: var(--accent-color);
}

.selection-checkbox:checked::before {
    transform: scale(1);
}
</style>
