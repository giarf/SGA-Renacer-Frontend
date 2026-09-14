<script setup lang="ts">
import { ref, watch, reactive, useId } from 'vue';
import type { EntidadResumen, ActualizarPersonaPayload, ActualizarInstitucionPayload, ActualizarEntidadPayload } from '../types';
import PhoneInput from './PhoneInput.vue';
import ApoderadosPanel from './ApoderadosPanel.vue';
import ProfilePhotoInput from './ProfilePhotoInput.vue';
import EtiquetaChipsSelector from './EtiquetaChipsSelector.vue';
import RegionComunaSelect from './RegionComunaSelect.vue';
import { apiService } from '../api/apiService';
import { formatRutForDisplay, formatRutForBackend } from '../utils/rutFormatter';
import { X, Pencil, ChevronDown, UserRound, MapPin, ClipboardList } from 'lucide-vue-next';

const props = defineProps<{
    isOpen: boolean;
    entidad: EntidadResumen | null;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'save', entidad: ActualizarEntidadPayload, foto?: File, etiquetaIds?: number[]): void;
}>();

const submitting = ref(false);
const error = ref<string | null>(null);
const personaFotoFile = ref<File | null>(null);
const selectedEtiquetaIds = ref<number[]>([]);
const fieldId = useId();

const revealInvalidField = (event: Event) => {
    const section = (event.target as HTMLElement).closest('details');
    if (section) section.open = true;
};

const personaForm = reactive({
    id: 0,
    tipoEntidad: 'PersonaNatural' as const,
    rut: '',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    region: '',
    nombres: '',
    apellidos: '',
    genero: '',
    ocupacion: '',
    redSocial: '',
    gestorId: undefined as number | undefined,
    anotaciones: '',
    sector: '',
    fechaNacimiento: ''
});

const institucionForm = reactive({
    id: 0,
    tipoEntidad: 'Institucion' as const,
    rut: '',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    nombre: '',
    razonSocial: '',
    nombreFantasia: '',
    subtipoInstitucion: '',
    rubro: '',
    redSocial: '',
    gestorId: undefined as number | undefined,
    anotaciones: '',
    sector: ''
});

const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const gestorLoading = ref(false);
const showGestorDropdown = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);
let gestorDebounce: ReturnType<typeof setTimeout> | null = null;

const searchGestor = (query: string) => {
    if (gestorDebounce) clearTimeout(gestorDebounce);
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        return;
    }
    gestorDebounce = setTimeout(async () => {
        gestorLoading.value = true;
        try {
            gestorResults.value = await apiService.buscarEntidades(query);
        } catch {
            gestorResults.value = [];
        } finally {
            gestorLoading.value = false;
        }
    }, 300);
};

const selectGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    personaForm.gestorId = entidad.id;
    institucionForm.gestorId = entidad.id;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const clearGestor = () => {
    selectedGestor.value = null;
    personaForm.gestorId = undefined;
    institucionForm.gestorId = undefined;
    gestorQuery.value = '';
};

const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length === 0) return '';
    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1).toUpperCase();
    const formattedBody = body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    return formattedBody ? `${formattedBody}-${verifier}` : verifier;
};

const handleRutInput = (event: Event, target: 'persona' | 'institucion') => {
    const input = event.target as HTMLInputElement;
    const formatted = formatRut(input.value);
    if (target === 'persona') {
        personaForm.rut = formatted;
    } else {
        institucionForm.rut = formatted;
    }
};

const hydrateGestor = async (gestorId?: number, nombre?: string, rut?: string) => {
    if (!gestorId) {
        selectedGestor.value = null;
        personaForm.gestorId = undefined;
        institucionForm.gestorId = undefined;
        return;
    }
    try {
        const gestor = await apiService.getPersona(gestorId);
        selectedGestor.value = gestor;
    } catch {
        selectedGestor.value = {
            id: gestorId,
            tipoEntidad: 'PersonaNatural',
            identificador: rut || `PERSONA-${gestorId}`,
            nombreCompleto: nombre || 'Gestor asignado'
        } as EntidadResumen;
    }
    personaForm.gestorId = gestorId;
    institucionForm.gestorId = gestorId;
};

const hydratePersona = async (entidad: EntidadResumen) => {
    personaForm.id = entidad.id;
    personaForm.tipoEntidad = 'PersonaNatural';
    personaForm.rut = formatRutForDisplay(entidad.identificador || '');
    personaForm.telefono = entidad.telefono || '';
    personaForm.correo = entidad.correo || entidad.email || '';
    personaForm.direccion = entidad.direccion || '';
    personaForm.comuna = entidad.comuna || '';
    personaForm.region = entidad.region || '';
    personaForm.nombres = entidad.nombres || '';
    personaForm.apellidos = entidad.apellidos || '';
    personaForm.genero = entidad.genero || '';
    personaForm.ocupacion = entidad.ocupacion || '';
    personaForm.redSocial = entidad.redSocial || '';
    personaForm.anotaciones = entidad.anotaciones || '';
    personaForm.sector = entidad.sector || '';
    personaForm.fechaNacimiento = entidad.fechaNacimiento || '';
    personaFotoFile.value = null;
    selectedEtiquetaIds.value = entidad.etiquetas?.map(etiqueta => etiqueta.id) ?? [];
    await hydrateGestor(entidad.gestorId, entidad.gestorNombre, entidad.gestorRut);
};

const hydrateInstitucion = async (entidad: EntidadResumen) => {
    institucionForm.id = entidad.id;
    institucionForm.tipoEntidad = 'Institucion';
    institucionForm.rut = formatRutForDisplay(entidad.identificador || '');
    institucionForm.telefono = entidad.telefono || '';
    institucionForm.correo = entidad.correo || entidad.email || '';
    institucionForm.direccion = entidad.direccion || '';
    institucionForm.comuna = entidad.comuna || '';
    institucionForm.nombre = entidad.nombreCompleto || '';
    institucionForm.razonSocial = entidad.razonSocial || '';
    institucionForm.nombreFantasia = entidad.nombreFantasia || '';
    institucionForm.subtipoInstitucion = entidad.subtipoInstitucion || '';
    institucionForm.rubro = entidad.rubro || '';
    institucionForm.redSocial = entidad.redSocial || '';
    institucionForm.anotaciones = entidad.anotaciones || '';
    institucionForm.sector = entidad.sector || '';
    selectedEtiquetaIds.value = [];
    await hydrateGestor(entidad.gestorId, entidad.gestorNombre, entidad.gestorRut);
};

watch(
    () => props.entidad,
    async newVal => {
        if (!newVal) return;
        error.value = null;
        gestorQuery.value = '';
        gestorResults.value = [];
        if (newVal.tipoEntidad === 'PersonaNatural') {
            await hydratePersona(newVal);
        } else {
            await hydrateInstitucion(newVal);
        }
    },
    { immediate: true }
);

const buildPersonaPayload = (): ActualizarPersonaPayload => {
    return {
        id: personaForm.id,
        tipoEntidad: 'PersonaNatural',
        rut: formatRutForBackend(personaForm.rut || ''),
        telefono: personaForm.telefono,
        correo: personaForm.correo,
        direccion: personaForm.direccion,
        comuna: personaForm.comuna,
        region: personaForm.region || undefined,
        nombres: personaForm.nombres,
        apellidos: personaForm.apellidos,
        genero: personaForm.genero,
        ocupacion: personaForm.ocupacion || undefined,
        redSocial: personaForm.redSocial || undefined,
        gestorId: personaForm.gestorId,
        anotaciones: personaForm.anotaciones || undefined,
        sector: personaForm.sector || undefined,
        fechaNacimiento: personaForm.fechaNacimiento || undefined
    };
};

const buildInstitucionPayload = (): ActualizarInstitucionPayload => {
    return {
        id: institucionForm.id,
        tipoEntidad: 'Institucion',
        rut: formatRutForBackend(institucionForm.rut || ''),
        telefono: institucionForm.telefono,
        correo: institucionForm.correo,
        direccion: institucionForm.direccion,
        comuna: institucionForm.comuna,
        nombre: institucionForm.nombre || undefined,
        razonSocial: institucionForm.razonSocial || undefined,
        nombreFantasia: institucionForm.nombreFantasia || undefined,
        subtipoInstitucion: institucionForm.subtipoInstitucion || undefined,
        rubro: institucionForm.rubro || undefined,
        redSocial: institucionForm.redSocial || undefined,
        gestorId: institucionForm.gestorId,
        anotaciones: institucionForm.anotaciones || undefined,
        sector: institucionForm.sector || undefined
    };
};

const save = async () => {
    if (!props.entidad) return;
    submitting.value = true;
    error.value = null;
    try {
        const payload =
            props.entidad.tipoEntidad === 'PersonaNatural'
                ? buildPersonaPayload()
                : buildInstitucionPayload();
        emit(
            'save',
            payload,
            props.entidad.tipoEntidad === 'PersonaNatural' ? personaFotoFile.value ?? undefined : undefined,
            props.entidad.tipoEntidad === 'PersonaNatural' ? selectedEtiquetaIds.value : undefined
        );
    } catch (e: any) {
        error.value = e.message || 'Error al guardar';
    } finally {
        submitting.value = false;
    }
};
</script>

<template>
    <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6"
    >
        <div class="edit-modal relative rounded-3xl shadow-2xl w-full" :class="{ 'edit-modal-person': entidad?.tipoEntidad === 'PersonaNatural' }" role="dialog" aria-modal="true" :aria-labelledby="`${fieldId}-title`">
            <div class="edit-header flex items-start justify-between gap-4 border-b border-[var(--card-border)]">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                        <Pencil class="w-5 h-5" />
                    </div>
                    <div>
                        <p class="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Ficha de contacto</p>
                        <h3 :id="`${fieldId}-title`" class="text-2xl font-bold text-[var(--text-primary)]">
                            Editar {{ entidad?.tipoEntidad === 'PersonaNatural' ? 'persona' : 'institución' }}
                        </h3>
                        <p class="text-sm text-[var(--text-muted)] mt-1">{{ entidad?.nombreCompleto }}</p>
                    </div>
                </div>
                <button type="button" @click="emit('close')" class="edit-close" aria-label="Cerrar edición">
                    <X class="w-6 h-6" />
                </button>
            </div>

            <div v-if="error" role="alert" class="mx-6 mt-4 p-4 rounded-2xl border border-red-200 text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-200">
                {{ error }}
            </div>

            <form @submit.prevent="save" @invalid.capture="revealInvalidField" class="edit-form">
                <div class="edit-scroll space-y-6">
                <template v-if="entidad?.tipoEntidad === 'PersonaNatural'">
                    <p class="edit-help">Abre la sección que necesitas actualizar. <span>* Campos obligatorios</span></p>
                    <details class="edit-section" open>
                        <summary>
                            <span class="edit-section-icon"><UserRound :size="20" aria-hidden="true" /></span>
                            <span class="edit-section-heading"><span>Datos personales</span><small>Identificación y foto de perfil</small></span>
                            <ChevronDown :size="18" class="edit-chevron" aria-hidden="true" />
                        </summary>
                        <div class="edit-section-body">
                            <div class="edit-profile">
                                <ProfilePhotoInput
                                    v-model="personaFotoFile"
                                    compact
                                    label="Foto de perfil"
                                    :current-url="entidad.fotoUrl"
                                    :fallback="personaForm.nombres || personaForm.apellidos || 'P'"
                                    @error="error = $event"
                                />
                                <div class="edit-grid">
                                    <div>
                                        <label :for="`${fieldId}-nombres`">Nombres *</label>
                                        <input :id="`${fieldId}-nombres`" v-model="personaForm.nombres" required autocomplete="given-name" placeholder="Juan" />
                                    </div>
                                    <div>
                                        <label :for="`${fieldId}-apellidos`">Apellidos *</label>
                                        <input :id="`${fieldId}-apellidos`" v-model="personaForm.apellidos" required autocomplete="family-name" placeholder="Pérez" />
                                    </div>
                                    <div>
                                        <label :for="`${fieldId}-rut`">RUT</label>
                                        <input :id="`${fieldId}-rut`" v-model="personaForm.rut" @input="handleRutInput($event, 'persona')" maxlength="12" placeholder="12.345.678-9" />
                                    </div>
                                    <div>
                                        <label :for="`${fieldId}-nacimiento`">Fecha de nacimiento</label>
                                        <input :id="`${fieldId}-nacimiento`" v-model="personaForm.fechaNacimiento" type="date" />
                                    </div>
                                    <div>
                                        <label :for="`${fieldId}-genero`">Género</label>
                                        <select :id="`${fieldId}-genero`" v-model="personaForm.genero">
                                            <option value="">Seleccionar...</option>
                                            <option value="Masculino">Masculino</option>
                                            <option value="Femenino">Femenino</option>
                                            <option value="Otro">Otro</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </details>

                    <details class="edit-section">
                        <summary>
                            <span class="edit-section-icon"><MapPin :size="20" aria-hidden="true" /></span>
                            <span class="edit-section-heading"><span>Contacto y domicilio</span><small>Teléfono, correo y ubicación</small></span>
                            <ChevronDown :size="18" class="edit-chevron" aria-hidden="true" />
                        </summary>
                        <div class="edit-section-body">
                            <div class="edit-grid">
                                <div>
                                    <label :for="`${fieldId}-telefono`">Teléfono *</label>
                                    <PhoneInput :input-id="`${fieldId}-telefono`" v-model="personaForm.telefono" :required="true" />
                                </div>
                                <div>
                                    <label :for="`${fieldId}-correo`">Correo electrónico</label>
                                    <input :id="`${fieldId}-correo`" v-model="personaForm.correo" type="email" autocomplete="email" placeholder="correo@example.com" />
                                </div>
                                <div>
                                    <label :for="`${fieldId}-red-social`">Red social</label>
                                    <input :id="`${fieldId}-red-social`" v-model="personaForm.redSocial" placeholder="@usuario" />
                                </div>
                            </div>
                            <div class="edit-subsection">
                                <h4>Domicilio</h4>
                                <div class="edit-grid">
                                    <RegionComunaSelect v-model:region="personaForm.region" v-model:comuna="personaForm.comuna" class="edit-full-width" />
                                    <div>
                                        <label :for="`${fieldId}-direccion`">Calle y número</label>
                                        <input :id="`${fieldId}-direccion`" v-model="personaForm.direccion" autocomplete="street-address" placeholder="Av. Principal 123" />
                                    </div>
                                    <div>
                                        <label :for="`${fieldId}-sector`">Sector</label>
                                        <input :id="`${fieldId}-sector`" v-model="personaForm.sector" placeholder="Sector" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </details>

                    <details class="edit-section">
                        <summary>
                            <span class="edit-section-icon"><ClipboardList :size="20" aria-hidden="true" /></span>
                            <span class="edit-section-heading"><span>Información interna</span><small>Gestor, etiquetas, anotaciones y apoderados</small></span>
                            <ChevronDown :size="18" class="edit-chevron" aria-hidden="true" />
                        </summary>
                        <div class="edit-section-body">
                        <div class="edit-grid">
                        <div class="relative">
                            <label :for="`${fieldId}-gestor`">Gestor</label>
                            <div
                                v-if="selectedGestor"
                                class="flex items-center justify-between gap-3 bg-[var(--surface-muted)] p-3 rounded-xl border border-[var(--card-border)]"
                            >
                                <div>
                                    <span class="block font-bold text-[var(--accent-color)]">{{ selectedGestor.nombreCompleto }}</span>
                                    <span class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(selectedGestor.identificador) }}</span>
                                </div>
                                <button type="button" @click="clearGestor" class="text-sm text-[var(--accent-color)] hover:underline">Cambiar</button>
                            </div>
                            <div v-else>
                                <input
                                    :id="`${fieldId}-gestor`"
                                    type="text"
                                    v-model="gestorQuery"
                                    @input="searchGestor(gestorQuery)"
                                    @focus="showGestorDropdown = true"
                                    placeholder="Buscar gestor por nombre o RUT..."
                                />
                                <div
                                    v-if="showGestorDropdown && gestorQuery.length >= 2"
                                    class="dropdown-panel absolute z-20 mt-2 max-h-56 w-full overflow-auto"
                                >
                                    <div v-if="gestorLoading" class="p-3 text-center text-sm text-[var(--text-muted)]">Buscando...</div>
                                    <ul v-else-if="gestorResults.length > 0">
                                        <li
                                            v-for="entidad in gestorResults"
                                            :key="entidad.id"
                                        >
                                            <button type="button" class="w-full text-left" @click="selectGestor(entidad)">
                                                <span class="block font-medium text-[var(--text-primary)]">{{ entidad.nombreCompleto }}</span>
                                                <span class="block text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(entidad.identificador) }}</span>
                                            </button>
                                        </li>
                                    </ul>
                                    <div v-else class="p-3 text-center text-sm text-[var(--text-muted)]">Sin coincidencias</div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label :for="`${fieldId}-ocupacion`">Ocupación</label>
                            <input :id="`${fieldId}-ocupacion`" v-model="personaForm.ocupacion" placeholder="Ocupación" />
                        </div>
                    </div>

                    <div class="edit-subsection">
                        <EtiquetaChipsSelector v-model="selectedEtiquetaIds" />
                    </div>

                    <div class="mt-6">
                        <label :for="`${fieldId}-anotaciones`">Anotaciones</label>
                        <textarea :id="`${fieldId}-anotaciones`" v-model="personaForm.anotaciones" rows="4" placeholder="Agrega información relevante para el equipo..."></textarea>
                    </div>
                    <div class="edit-subsection">
                        <ApoderadosPanel v-if="isOpen" :key="entidad.id" :persona-id="entidad.id" />
                    </div>
                        </div>
                    </details>
                </template>

                <template v-else>
                    <div class="relative">
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Gestor</label>
                        <div v-if="selectedGestor" class="flex items-center justify-between bg-[var(--accent-color-muted)]/50 p-4 rounded-2xl border border-[var(--accent-color-muted)]">
                            <div>
                                <span class="block font-bold text-[var(--accent-color)]">{{ selectedGestor.nombreCompleto }}</span>
                                <span class="text-xs text-gray-600 dark:text-gray-300">{{ formatRutForDisplay(selectedGestor.identificador) }}</span>
                            </div>
                            <button type="button" @click="clearGestor" class="text-sm text-[var(--accent-color)] hover:underline">Cambiar</button>
                        </div>
                        <div v-else>
                            <input
                                type="text"
                                v-model="gestorQuery"
                                @input="searchGestor(gestorQuery)"
                                @focus="showGestorDropdown = true"
                                placeholder="Buscar gestor por nombre o RUT..."
                                class="w-full px-4 py-2 rounded-2xl border border-[var(--card-border)] bg-[var(--bg-base)]/60"
                            />
                            <div
                                v-if="showGestorDropdown && gestorQuery.length >= 2"
                                class="dropdown-panel absolute z-20 mt-2 max-h-56 w-full overflow-auto"
                            >
                                <div v-if="gestorLoading" class="p-3 text-center text-sm text-gray-500">Buscando...</div>
                                <ul v-else-if="gestorResults.length > 0">
                                    <li
                                        v-for="entidad in gestorResults"
                                        :key="entidad.id"
                                        @click="selectGestor(entidad)"
                                    >
                                        <p class="font-medium text-gray-900 dark:text-white">{{ entidad.nombreCompleto }}</p>
                                        <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                    </li>
                                </ul>
                                <div v-else class="p-3 text-center text-sm text-gray-500">Sin coincidencias</div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Razón social *</label>
                            <input v-model="institucionForm.razonSocial" required placeholder="ONG Solidaria" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre fantasía</label>
                            <input v-model="institucionForm.nombreFantasia" placeholder="Nombre comercial" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">RUT</label>
                            <input
                                v-model="institucionForm.rut"
                                @input="handleRutInput($event, 'institucion')"
                                placeholder="12.345.678-9"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Subtipo</label>
                            <input v-model="institucionForm.subtipoInstitucion" placeholder="ONG, Fundación..." />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Rubro</label>
                            <input v-model="institucionForm.rubro" placeholder="Asistencia social" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombre interno</label>
                            <input v-model="institucionForm.nombre" placeholder="Nombre corto" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Correo</label>
                            <input v-model="institucionForm.correo" type="email" placeholder="contacto@ong.cl" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                            <PhoneInput v-model="institucionForm.telefono" :required="false" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
                            <input v-model="institucionForm.direccion" placeholder="Av. Principal 123" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Comuna</label>
                            <input v-model="institucionForm.comuna" placeholder="Santiago" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Red Social</label>
                            <input v-model="institucionForm.redSocial" placeholder="@institucion" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sector</label>
                            <input v-model="institucionForm.sector" placeholder="Sector" />
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Anotaciones</label>
                        <textarea v-model="institucionForm.anotaciones" rows="2"></textarea>
                    </div>
                </template>

                </div>
                <div class="edit-footer flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-[var(--card-border)]">
                    <button
                        type="button"
                        class="btn btn-ghost border border-[var(--card-border)]"
                        @click="emit('close')"
                    >
                        Cancelar
                    </button>
                    <button type="submit" class="btn btn-primary min-w-[160px]" :disabled="submitting">
                        <span v-if="submitting" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                        <span v-else>Guardar cambios</span>
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<style scoped>
.edit-modal {
    display: flex;
    flex-direction: column;
    max-width: 48rem;
    max-height: min(92dvh, 64rem);
    overflow: hidden;
    background: var(--bg-card);
    color: var(--text-primary);
}

.edit-modal-person { max-width: 58rem; }
.edit-header { padding: 1.5rem 2rem; flex-shrink: 0; }
.edit-close { padding: 0.5rem; border-radius: 0.75rem; color: var(--text-muted); }
.edit-close:hover { background: var(--surface-muted); color: var(--text-primary); }
.edit-form { display: flex; flex-direction: column; min-height: 0; }
.edit-scroll { padding: 1.5rem 2rem 2rem; overflow-y: auto; overscroll-behavior: contain; }
.edit-footer { flex-shrink: 0; padding: 1rem 2rem; background: var(--bg-card); }
.edit-help { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-muted); }
.edit-help span { font-size: 0.75rem; }
.edit-section { border: 1px solid var(--card-border); border-radius: 1rem; background: var(--bg-card); }
.edit-section > summary { display: flex; align-items: center; gap: 0.875rem; padding: 1.25rem 1.5rem; cursor: pointer; list-style: none; border-radius: 1rem; }
.edit-section > summary::-webkit-details-marker { display: none; }
.edit-section > summary:hover { background: var(--surface-muted); }
.edit-section > summary:focus-visible, .edit-close:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 3px; }
.edit-section-icon { display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: 0.75rem; background: var(--surface-muted); color: var(--accent-color); }
.edit-section-heading { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 0; font-weight: 650; }
.edit-section-heading small { font-size: 0.8125rem; font-weight: 400; color: var(--text-muted); }
.edit-chevron { flex-shrink: 0; color: var(--text-muted); transition: transform 180ms ease; }
.edit-section[open] > summary .edit-chevron { transform: rotate(180deg); }
.edit-section-body { padding: 1.5rem; border-top: 1px solid var(--card-border); }
.edit-profile { display: flex; flex-direction: column; gap: 1.5rem; }
.edit-profile > :first-child { align-self: flex-start; }
.edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
.edit-grid > * { min-width: 0; }
.edit-full-width { grid-column: 1 / -1; }
.edit-section-body label { display: block; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
.edit-section-body input:not([type='file']), .edit-section-body select, .edit-section-body textarea { width: 100%; min-width: 0; }
.edit-section-body textarea { resize: vertical; }
.edit-subsection { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--card-border); }
.edit-subsection h4 { margin-bottom: 1rem; font-size: 0.875rem; font-weight: 650; color: var(--text-muted); }

@media (max-width: 639px) {
    .edit-header { padding: 1.25rem; }
    .edit-scroll { padding: 1rem 1rem 1.5rem; }
    .edit-footer { padding: 1rem; }
    .edit-section > summary { padding: 1rem; gap: 0.75rem; }
    .edit-section-body { padding: 1.25rem 1rem; }
    .edit-grid { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
}

@media (prefers-reduced-motion: reduce) {
    .edit-chevron { transition: none; }
}
</style>
