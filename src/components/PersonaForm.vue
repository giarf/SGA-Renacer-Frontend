<script setup lang="ts">
import { ref, reactive } from 'vue';
import { apiService } from '../api/apiService';
import { formatRutForBackend, formatRutForDisplay } from '../utils/rutFormatter';
import PhoneInput from './PhoneInput.vue';
import type { RegistrarPersonaPayload, EntidadResumen } from '../types';

const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'created', rut: string): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);

const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const gestorLoading = ref(false);
const showGestorDropdown = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);

let gestorDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const searchGestor = (query: string) => {
    if (gestorDebounceTimer) clearTimeout(gestorDebounceTimer);
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        return;
    }
    gestorDebounceTimer = setTimeout(async () => {
        gestorLoading.value = true;
        try {
            gestorResults.value = await apiService.buscarEntidades(query);
        } catch (e) {
            gestorResults.value = [];
        } finally {
            gestorLoading.value = false;
        }
    }, 300);
};

const selectGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    form.gestorId = entidad.id;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const clearGestor = () => {
    selectedGestor.value = null;
    form.gestorId = undefined;
    gestorQuery.value = '';
};

const form = reactive<RegistrarPersonaPayload>({
    rut: '',
    tipoEntidad: 'Persona',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    redSocial: '',
    gestorId: undefined,
    anotaciones: '',
    sector: '',
    nombres: '',
    apellidos: '',
    genero: '',
    ocupacion: '',
    fechaNacimiento: ''
});

const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length === 0) return '';
    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1).toUpperCase();
    const formattedBody = body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    return formattedBody ? `${formattedBody}-${verifier}` : verifier;
};

const handleRutInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const formatted = formatRut(input.value);
    form.rut = formatted;
};

const resetForm = () => {
    Object.assign(form, {
        rut: '',
        tipoEntidad: 'Persona',
        telefono: '',
        correo: '',
        direccion: '',
        comuna: '',
        redSocial: '',
        gestorId: undefined,
        anotaciones: '',
        sector: '',
        nombres: '',
        apellidos: '',
        genero: '',
        ocupacion: '',
        fechaNacimiento: ''
    });
    clearGestor();
};

const submit = async () => {
    loading.value = true;
    error.value = null;
    try {
        const payloadToSend = Object.fromEntries(
            Object.entries(form).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
        ) as unknown as RegistrarPersonaPayload;

        if (payloadToSend.rut) {
            payloadToSend.rut = formatRutForBackend(payloadToSend.rut);
        }

        await apiService.registrarPersonaNueva(payloadToSend);
        emit('created', payloadToSend.rut || '');
        resetForm();
    } catch (e: any) {
        error.value = e.message || 'Error al registrar persona';
    } finally {
        loading.value = false;
    }
};
</script>

<template>
    <form @submit.prevent="submit" class="space-y-4">
        <div class="relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">Gestor</label>
            <div v-if="selectedGestor" class="flex items-center justify-between bg-blue-50 p-3 rounded-md border border-blue-200">
                <div>
                    <span class="block font-bold text-blue-700">{{ selectedGestor.nombreCompleto }}</span>
                    <span class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</span>
                </div>
                <button type="button" @click="clearGestor" class="text-sm text-blue-600 hover:text-blue-800 underline">Cambiar</button>
            </div>
            <div v-else>
                <input
                    type="text"
                    v-model="gestorQuery"
                    @input="searchGestor(gestorQuery)"
                    @focus="showGestorDropdown = true"
                    placeholder="Buscar gestor por nombre o RUT..."
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div v-if="showGestorDropdown && gestorQuery.length >= 2" class="absolute z-20 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-200 max-h-48 overflow-auto">
                    <div v-if="gestorLoading" class="p-3 text-center text-sm text-gray-500">Buscando...</div>
                    <ul v-else-if="gestorResults.length > 0">
                        <li
                            v-for="entidad in gestorResults"
                            :key="entidad.id"
                            @click="selectGestor(entidad)"
                            class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0"
                        >
                            <p class="font-medium text-gray-900 text-sm">{{ entidad.nombreCompleto }}</p>
                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                        </li>
                    </ul>
                    <div v-else class="p-3 text-center text-sm text-gray-500">No se encontraron resultados</div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nombres *</label>
                <input 
                    v-model="form.nombres" 
                    required
                    placeholder="Juan"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Apellidos *</label>
                <input 
                    v-model="form.apellidos" 
                    required
                    placeholder="Pérez"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                <PhoneInput 
                    v-model="form.telefono" 
                    :required="true"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                <input 
                    v-model="form.rut" 
                    @input="handleRutInput"
                    placeholder="12.345.678-9"
                    maxlength="12"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Género</label>
                <select 
                    v-model="form.genero" 
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Seleccionar...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Otro">Otro</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Fecha de nacimiento</label>
                <input 
                    v-model="form.fechaNacimiento" 
                    type="date"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                    v-model="form.correo" 
                    type="email"
                    placeholder="juan.perez@example.com"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input 
                    v-model="form.direccion" 
                    placeholder="Calle Random"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comuna</label>
                <input 
                    v-model="form.comuna" 
                    placeholder="Quillota"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                <input 
                    v-model="form.sector" 
                    placeholder="Alfaro"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Ocupación</label>
                <input 
                    v-model="form.ocupacion" 
                    placeholder="Tester"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Red Social</label>
                <input 
                    v-model="form.redSocial" 
                    placeholder="@usuario"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Anotaciones</label>
            <textarea 
                v-model="form.anotaciones" 
                rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            ></textarea>
        </div>

        <div v-if="error" class="text-red-600 text-sm font-medium bg-red-50 p-2 rounded">
            Error: {{ error }}
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t">
            <button 
                type="button"
                @click="emit('cancel')"
                :disabled="loading"
                class="btn btn-ghost border border-gray-200 disabled:opacity-50"
            >
                Cancelar
            </button>
            <button 
                type="submit"
                :disabled="loading"
                class="btn btn-primary w-auto disabled:opacity-50"
            >
                <span v-if="loading" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                {{ loading ? 'Registrando...' : 'Registrar persona' }}
            </button>
        </div>
    </form>
</template>
