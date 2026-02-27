<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { EntidadResumen, DonacionPayload, Cuenta } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';

// State
const entidades = ref<EntidadResumen[]>([]);
const loadingEntidades = ref(false);
const searchQuery = ref('');
const isDropdownOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);

const fondos = ref<Cuenta[]>([]);
const fondosLoading = ref(false);
const selectedFondoId = ref<number | null>(null);
const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const showGestorDropdown = ref(false);
const gestorLoading = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);

const donationForm = ref({
    monto: 0,
    proposito: '',
    anotaciones: ''
});
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);
const currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

// Methods
const loadEntidades = async () => {
    loadingEntidades.value = true;
    try {
        entidades.value = await apiService.getEntidades();
    } catch (e) {
        console.error("Failed to load entities", e);
    } finally {
        loadingEntidades.value = false;
    }
};

const loadFondos = async () => {
    fondosLoading.value = true;
    try {
        fondos.value = await apiService.getCuentas();
        if (fondos.value.length > 0 && selectedFondoId.value === null) {
            selectedFondoId.value = fondos.value[0]!.id;
        }
    } catch (e) {
        console.error('Failed to load funds', e);
    } finally {
        fondosLoading.value = false;
    }
};

const selectedFondo = computed(() =>
    fondos.value.find(f => f.id === selectedFondoId.value) || null
);

const filteredEntidades = computed(() => {
    if (!searchQuery.value) return entidades.value;
    const q = searchQuery.value.toLowerCase();
    return entidades.value.filter(e => 
        (e.nombreCompleto || '').toLowerCase().includes(q) || 
        (e.identificador || '').toLowerCase().includes(q)
    );
});

const selectEntidad = (e: EntidadResumen) => {
    selectedEntidad.value = e;
    searchQuery.value = '';
    isDropdownOpen.value = false;
};

const closeGestorDropdownDelayed = () => {
    setTimeout(() => {
        showGestorDropdown.value = false;
    }, 200);
};

let gestorSearchTimer: ReturnType<typeof setTimeout> | null = null;
const searchGestores = (query: string) => {
    if (gestorSearchTimer) clearTimeout(gestorSearchTimer);
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        return;
    }
    gestorSearchTimer = setTimeout(async () => {
        gestorLoading.value = true;
        try {
            gestorResults.value = await apiService.buscarEntidades(query);
            showGestorDropdown.value = true;
        } catch (e) {
            console.error('Error buscando gestores', e);
            gestorResults.value = [];
        } finally {
            gestorLoading.value = false;
        }
    }, 300);
};

const selectGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const clearGestor = () => {
    selectedGestor.value = null;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const submitDonacion = async () => {
    if (!selectedEntidad.value) return;
    if (!selectedFondo.value) {
        message.value = { type: 'error', text: 'Debes seleccionar un fondo destino.' };
        return;
    }
    submitting.value = true;
    message.value = null;

    const destinoBase = selectedFondo.value?.nombre || 'Fondo sin nombre';
    const anotaciones = donationForm.value.anotaciones?.trim() || '';
    const proposito = donationForm.value.proposito?.trim() || destinoBase;
    const responsableId = selectedGestor.value?.id ?? selectedEntidad.value.id;

    const payload: DonacionPayload = {
        ingreso: {
            origenEntidadId: selectedEntidad.value.id,
            responsableInternoId: responsableId,
            montoTotal: donationForm.value.monto,
            tipoTransaccion: 'Donacion',
            estado: 'Cerrado',
            anotaciones: anotaciones || undefined
        },
        donacion: {
            propositoEspecifico: proposito,
            gestorId: selectedGestor.value?.id
        },
        pecuniario: {
            cuentaDestinoId: selectedFondo.value!.id,
            metodoTransferencia: 'Transferencia',
            comentarios: anotaciones || undefined
        }
    };

    try {
        await apiService.registrarDonacion(payload);
        message.value = { type: 'success', text: 'Donación registrada exitosamente.' };
        // Reset
        donationForm.value = { monto: 0, proposito: '', anotaciones: '' };
        selectedEntidad.value = null;
        selectedGestor.value = null;
        selectedFondoId.value = fondos.value[0]?.id ?? null;
    } catch (e: any) {
         message.value = { type: 'error', text: 'Error al registrar donación.' };
    } finally {
        submitting.value = false;
    }
};

onMounted(() => {
    loadEntidades();
    loadFondos();
});
</script>

<template>
    <div class="space-y-8">
        <div v-if="message" :class="`p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`">
            {{ message.text }}
        </div>
        
        <!-- STEP 1: Select Entity -->
        <div class="bg-white shadow rounded-lg p-6 relative border border-gray-100">
            <div class="mb-4">
                <p class="text-xs uppercase tracking-widest text-blue-500 font-semibold">Paso 1</p>
                <h3 class="text-lg font-semibold text-gray-900">Identificar donante <span class="text-red-500">*</span></h3>
            </div>
            
            <div v-if="selectedEntidad" class="flex flex-col gap-4 bg-blue-50 p-4 rounded-md border border-blue-200">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <span class="block font-bold text-lg text-institutional-blue">{{ selectedEntidad.nombreCompleto }}</span>
                        <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedEntidad.identificador) }}</span>
                    </div>
                    <button @click="selectedEntidad = null" class="self-start text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:text-gray-800">
                        Cambiar
                    </button>
                </div>
            </div>

            <div v-else class="relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Buscar por Nombre o RUT</label>
                <input 
                    type="text" 
                    v-model="searchQuery"
                    @focus="isDropdownOpen = true"
                    placeholder="Escriba para buscar..."
                    class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                >

                <!-- Dropdown -->
                <div v-if="isDropdownOpen" class="absolute z-10 mt-1 w-full bg-white shadow-xl rounded-md overflow-hidden border border-gray-100">
                    <ul class="max-h-60 overflow-auto">
                        <li v-for="entidad in filteredEntidades" :key="entidad.id" 
                            @click="selectEntidad(entidad)"
                            class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
                        >
                            <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                        </li>
                    </ul>
                    <!-- Not Found State -->
                    <div v-if="filteredEntidades.length === 0" class="p-4 text-center bg-gray-50 text-sm text-gray-500">
                        No se encontraron resultados para "{{ searchQuery }}"
                    </div>
                </div>
            </div>

            <div class="mt-5">
                <label class="block text-sm font-medium text-gray-700 mb-1">Gestor interno (opcional)</label>
                <div v-if="selectedGestor" class="flex items-center justify-between bg-amber-50 p-3 border border-amber-200 rounded-md">
                    <div>
                        <p class="font-semibold text-amber-800">{{ selectedGestor.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</p>
                    </div>
                    <button type="button" class="text-xs text-amber-700 hover:underline" @click="clearGestor">Cambiar</button>
                </div>
                <div v-else class="relative">
                    <input
                        type="text"
                        v-model="gestorQuery"
                        @input="searchGestores(gestorQuery)"
                        @focus="showGestorDropdown = true"
                        @blur="closeGestorDropdownDelayed"
                        placeholder="Buscar gestor por nombre o RUT..."
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2.5 border"
                    />
                    <div v-if="gestorLoading" class="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</div>
                    <ul
                        v-if="showGestorDropdown && gestorResults.length > 0"
                        class="absolute z-10 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-100 max-h-60 overflow-auto"
                    >
                        <li
                            v-for="ent in gestorResults"
                            :key="ent.id"
                            @mousedown.prevent="selectGestor(ent)"
                            class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                        >
                            <p class="font-medium text-gray-900">{{ ent.nombreCompleto }}</p>
                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(ent.identificador) }}</p>
                        </li>
                    </ul>
                    <div
                        v-else-if="showGestorDropdown && gestorQuery.length >= 2 && !gestorLoading"
                        class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-3 px-4 text-xs text-gray-500 border border-gray-100"
                    >
                        Sin coincidencias
                    </div>
                </div>
            </div>
        </div>

        <!-- STEP 2: Donation Details -->
        <div class="bg-white shadow rounded-lg p-6 border border-gray-100" :class="{ 'opacity-50 pointer-events-none': !selectedEntidad }">
             <div class="mb-4">
                <p class="text-xs uppercase tracking-widest text-blue-500 font-semibold">Paso 2</p>
                <h3 class="text-lg font-medium text-gray-900">Detalle del ingreso</h3>
             </div>
             
             <form @submit.prevent="submitDonacion" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700">
                        Monto ($) <span class="text-red-500">*</span>
                    </label>
                    <div class="mt-1 relative rounded-md shadow-sm">
                        <div class="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
                            <span class="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input
                            v-model.number="donationForm.monto"
                            type="number"
                            required
                            class="focus:ring-institutional-blue focus:border-institutional-blue block w-full pl-9 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border"
                        >
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Propósito específico</label>
                    <input
                        v-model="donationForm.proposito"
                        type="text"
                        placeholder="Ej: Programa Invierno"
                        class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border"
                    >
                </div>

                <div class="md:col-span-2 space-y-2">
                    <label class="block text-sm font-medium text-gray-700">
                        Fondo destino <span class="text-red-500">*</span>
                    </label>
                    <div v-if="fondosLoading" class="text-sm text-gray-500">Cargando fondos disponibles...</div>
                    <template v-else>
                        <select
                            v-if="fondos.length > 0"
                            v-model="selectedFondoId"
                            required
                            class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border bg-white"
                        >
                            <option v-for="fondo in fondos" :key="fondo.id" :value="fondo.id">
                                {{ fondo.nombre }} — Saldo: {{ currencyFormatter.format(fondo.saldoActual ?? 0) }}
                            </option>
                        </select>
                        <div v-else class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                            No existen fondos disponibles. Dirígete a la sección "Cuentas y fondos" para crear uno nuevo.
                        </div>
                    </template>
                    <p class="text-xs text-gray-500">
                        Los fondos se administran en la sección "Cuentas y fondos" del menú lateral.
                    </p>
                </div>

                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Anotaciones (opcional)</label>
                    <textarea
                        v-model="donationForm.anotaciones"
                        rows="2"
                        placeholder="Notas adicionales o contexto"
                        class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border"
                    ></textarea>
                </div>

                <div class="md:col-span-2 flex justify-end">
                    <button type="submit" :disabled="submitting" class="w-full inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        {{ submitting ? 'Guardando...' : 'Registrar Donación' }}
                    </button>
                </div>
             </form>
        </div>

    </div>
</template>
