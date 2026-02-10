<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { EntidadResumen, DonacionPayload } from '../types';
import { apiService } from '../api/apiService';
import ModalRegistroRapido from '../components/ModalRegistroRapido.vue';
import { formatRutForDisplay } from '../utils/rutFormatter';

// State
const entidades = ref<EntidadResumen[]>([]);
const loadingEntidades = ref(false);
const searchQuery = ref('');
const isDropdownOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);

const isRegistroModalOpen = ref(false);

const donationForm = ref({
    monto: 0,
    certificado: '',
    destino: ''
});
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);

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

const openRegistroModal = () => {
    isRegistroModalOpen.value = true;
    isDropdownOpen.value = false;
};

const onNuevaPersonaRegistrada = (id: number, nombre: string, rut: string) => {
    // Auto-select the new person
    // We create a temp EntidadResumen object to select immediately
    const nueva: EntidadResumen = {
        id,
        nombreCompleto: nombre,
        identificador: rut,
        tipo: 'PERSONA',
        email: '' // Not critical for display
    };
    entidades.value.push(nueva); // Add to local list
    selectEntidad(nueva);
    isRegistroModalOpen.value = false;
    message.value = { type: 'success', text: 'Persona registrada y seleccionada correctamente.' };
};

const submitDonacion = async () => {
    if (!selectedEntidad.value) return;
    submitting.value = true;
    message.value = null;

    const payload: DonacionPayload = {
        ingreso: {
            id: 0,
            origenEntidadId: selectedEntidad.value.id,
            montoTotal: donationForm.value.monto,
            fechaIngreso: new Date().toISOString()
        },
        donacion: {
            id: 0,
            ingresoRecursoId: 0,
            numeroCertificado: donationForm.value.certificado,
            idDonante: selectedEntidad.value.id
        },
        pecuniario: {
            id: 0,
            ingresoDonacionId: 0,
            monto: donationForm.value.monto,
            destino: donationForm.value.destino
        }
    };

    try {
        await apiService.registrarDonacion(payload);
        message.value = { type: 'success', text: 'Donación registrada exitosamente.' };
        // Reset
        donationForm.value = { monto: 0, certificado: '', destino: '' };
        selectedEntidad.value = null;
    } catch (e: any) {
         message.value = { type: 'error', text: 'Error al registrar donación.' };
    } finally {
        submitting.value = false;
    }
};

onMounted(loadEntidades);
</script>

<template>
    <div class="max-w-4xl mx-auto py-8 px-4">
        <h2 class="text-3xl font-bold text-gray-900 mb-8 border-b pb-2">Recepción de Donaciones</h2>

        <!-- Feedback -->
        <div v-if="message" :class="`mb-4 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`">
            {{ message.text }}
        </div>
        
        <!-- STEP 1: Select Entity -->
        <div class="bg-white shadow rounded-lg p-6 mb-8 relative">
            <h3 class="text-lg font-medium text-gray-900 mb-4">1. Identificar Donante</h3>
            
            <div v-if="selectedEntidad" class="flex items-center justify-between bg-blue-50 p-4 rounded-md border border-blue-200">
                <div>
                    <span class="block font-bold text-lg text-institutional-blue">{{ selectedEntidad.nombreCompleto }}</span>
                    <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedEntidad.identificador) }}</span>
                </div>
                <button @click="selectedEntidad = null" class="text-gray-500 hover:text-gray-700">Cambiar</button>
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
                    <div v-if="filteredEntidades.length === 0" class="p-4 text-center bg-gray-50">
                        <p class="text-sm text-gray-500 mb-2">No se encontraron resultados para "{{ searchQuery }}"</p>
                        <button @click="openRegistroModal" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none">
                            + Registrar nueva Persona
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- STEP 2: Donation Details -->
        <div class="bg-white shadow rounded-lg p-6" :class="{ 'opacity-50 pointer-events-none': !selectedEntidad }">
             <h3 class="text-lg font-medium text-gray-900 mb-4">2. Detalle del Ingreso</h3>
             
             <form @submit.prevent="submitDonacion" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Monto ($)</label>
                    <div class="mt-1 relative rounded-md shadow-sm">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input v-model.number="donationForm.monto" type="number" required class="focus:ring-institutional-blue focus:border-institutional-blue block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">N° Certificado</label>
                    <input v-model="donationForm.certificado" type="text" required class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>

                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Destino / Fondo</label>
                    <input v-model="donationForm.destino" type="text" required placeholder="Ej: Fondo General, Reparaciones, etc." class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>

                <div class="md:col-span-2 flex justify-end">
                    <button type="submit" :disabled="submitting" class="w-full inline-flex justify-center py-3 px-6 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        {{ submitting ? 'Guardando...' : 'Registrar Donación' }}
                    </button>
                </div>
             </form>
        </div>

        <ModalRegistroRapido :isOpen="isRegistroModalOpen" @close="isRegistroModalOpen = false" @registrado="onNuevaPersonaRegistrada" />
    </div>
</template>
