<script setup lang="ts">
import { ref, watch, reactive } from 'vue';
import type { EntidadResumen, ActualizarPersonaPayload, ActualizarInstitucionPayload, ActualizarEntidadPayload } from '../types';
import PhoneInput from './PhoneInput.vue';
import { apiService } from '../api/apiService';
import { formatRutForDisplay, formatRutForBackend } from '../utils/rutFormatter';
import { X, Pencil } from 'lucide-vue-next';

const props = defineProps<{
    isOpen: boolean;
    entidad: EntidadResumen | null;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'save', entidad: ActualizarEntidadPayload): void }>();

const submitting = ref(false);
const error = ref<string | null>(null);

const personaForm = reactive({
    id: 0,
    tipoEntidad: 'Persona' as const,
    rut: '',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
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
            tipoEntidad: 'Persona',
            identificador: rut || `PERSONA-${gestorId}`,
            nombreCompleto: nombre || 'Gestor asignado'
        } as EntidadResumen;
    }
    personaForm.gestorId = gestorId;
    institucionForm.gestorId = gestorId;
};

const hydratePersona = async (entidad: EntidadResumen) => {
    personaForm.id = entidad.id;
    personaForm.tipoEntidad = 'Persona';
    personaForm.rut = formatRutForDisplay(entidad.identificador || '');
    personaForm.telefono = entidad.telefono || '';
    personaForm.correo = entidad.correo || entidad.email || '';
    personaForm.direccion = entidad.direccion || '';
    personaForm.comuna = entidad.comuna || '';
    personaForm.nombres = entidad.nombres || '';
    personaForm.apellidos = entidad.apellidos || '';
    personaForm.genero = entidad.genero || '';
    personaForm.ocupacion = entidad.ocupacion || '';
    personaForm.redSocial = entidad.redSocial || '';
    personaForm.anotaciones = entidad.anotaciones || '';
    personaForm.sector = entidad.sector || '';
    personaForm.fechaNacimiento = entidad.fechaNacimiento || '';
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
    await hydrateGestor(entidad.gestorId, entidad.gestorNombre, entidad.gestorRut);
};

watch(
    () => props.entidad,
    async newVal => {
        if (!newVal) return;
        error.value = null;
        gestorQuery.value = '';
        gestorResults.value = [];
        if (newVal.tipoEntidad === 'Persona') {
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
        tipoEntidad: 'Persona',
        rut: formatRutForBackend(personaForm.rut || ''),
        telefono: personaForm.telefono,
        correo: personaForm.correo,
        direccion: personaForm.direccion,
        comuna: personaForm.comuna,
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
            props.entidad.tipoEntidad === 'Persona'
                ? buildPersonaPayload()
                : buildInstitucionPayload();
        emit('save', payload);
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
        <div class="relative bg-white dark:bg-[var(--bg-card)] rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div class="flex items-start justify-between px-6 py-6 border-b border-[var(--card-border)] sticky top-0 bg-white/95 dark:bg-[var(--bg-card)]/95 backdrop-blur">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                        <Pencil class="w-5 h-5" />
                    </div>
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-gray-500">Formulario</p>
                        <h3 class="text-2xl font-bold text-gray-900 dark:text-white">
                            Editar {{ entidad?.tipoEntidad === 'Persona' ? 'persona' : 'institución' }}
                        </h3>
                    </div>
                </div>
                <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
                    <X class="w-6 h-6" />
                </button>
            </div>

            <div v-if="error" class="mx-6 mt-4 p-4 rounded-2xl border border-red-200 text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-200">
                {{ error }}
            </div>

            <form @submit.prevent="save" class="px-6 pb-8 pt-4 space-y-6">
                <template v-if="entidad?.tipoEntidad === 'Persona'">
                    <div class="relative">
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Gestor</label>
                        <div
                            v-if="selectedGestor"
                            class="flex items-center justify-between bg-[var(--accent-color-muted)]/50 p-4 rounded-2xl border border-[var(--accent-color-muted)]"
                        >
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
                                class="absolute z-20 mt-2 w-full bg-white dark:bg-[var(--bg-card)] shadow-xl rounded-2xl border border-[var(--card-border)] max-h-56 overflow-auto"
                            >
                                <div v-if="gestorLoading" class="p-3 text-center text-sm text-gray-500">Buscando...</div>
                                <ul v-else-if="gestorResults.length > 0">
                                    <li
                                        v-for="entidad in gestorResults"
                                        :key="entidad.id"
                                        @click="selectGestor(entidad)"
                                        class="px-4 py-2.5 hover:bg-[var(--accent-color-muted)] cursor-pointer border-b border-[var(--card-border)] last:border-0"
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
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nombres *</label>
                            <input v-model="personaForm.nombres" required placeholder="Juan" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Apellidos *</label>
                            <input v-model="personaForm.apellidos" required placeholder="Pérez" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Teléfono *</label>
                            <PhoneInput v-model="personaForm.telefono" :required="true" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">RUT</label>
                            <input
                                v-model="personaForm.rut"
                                @input="handleRutInput($event, 'persona')"
                                maxlength="12"
                                placeholder="12.345.678-9"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Género</label>
                            <select v-model="personaForm.genero">
                                <option value="">Seleccionar...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fecha de nacimiento</label>
                            <input v-model="personaForm.fechaNacimiento" type="date" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Email</label>
                            <input v-model="personaForm.correo" type="email" placeholder="correo@example.com" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
                            <input v-model="personaForm.direccion" placeholder="Calle Random" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Comuna</label>
                            <input v-model="personaForm.comuna" placeholder="Quillota" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sector</label>
                            <input v-model="personaForm.sector" placeholder="Sector" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Ocupación</label>
                            <input v-model="personaForm.ocupacion" placeholder="Ocupación" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Red Social</label>
                            <input v-model="personaForm.redSocial" placeholder="@usuario" />
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Anotaciones</label>
                        <textarea v-model="personaForm.anotaciones" rows="2"></textarea>
                    </div>
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
                                class="absolute z-20 mt-2 w-full bg-white dark:bg-[var(--bg-card)] shadow-xl rounded-2xl border border-[var(--card-border)] max-h-56 overflow-auto"
                            >
                                <div v-if="gestorLoading" class="p-3 text-center text-sm text-gray-500">Buscando...</div>
                                <ul v-else-if="gestorResults.length > 0">
                                    <li
                                        v-for="entidad in gestorResults"
                                        :key="entidad.id"
                                        @click="selectGestor(entidad)"
                                        class="px-4 py-2.5 hover:bg-[var(--accent-color-muted)] cursor-pointer border-b border-[var(--card-border)] last:border-0"
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

                <div class="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--card-border)]">
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
