<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { NuevoRegistro, DetalleDonacion, EntidadResumen, DonacionPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';

const emit = defineEmits<{ (e: 'registro-completado'): void }>();

// State
const entidades = ref<EntidadResumen[]>([]);
const loadingEntidades = ref(false);
const fetchError = ref<boolean>(false);

const searchQuery = ref('');
const isDropdownOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);

const nuevoRegistro = ref<NuevoRegistro>({
  entidadId: 0,
  tipoEntidad: 'PERSONA',
  donacion: {
    tipo: 'DINERO',
    fecha: new Date().toISOString().split('T')[0],
    monto: 0,
    descripcion: ''
  } as DetalleDonacion
});

const submitting = ref(false);
const submitError = ref<string | null>(null);
const submitSuccess = ref(false);

// Computed
const filteredEntidades = computed(() => {
  if (!searchQuery.value) return entidades.value;
  const lowerQuery = searchQuery.value.toLowerCase();
  return entidades.value.filter(e => 
    e.nombreCompleto.toLowerCase().includes(lowerQuery) || 
    e.identificador.toLowerCase().includes(lowerQuery)
  );
});

// Methods
const cargarEntidades = async () => {
    loadingEntidades.value = true;
    fetchError.value = false;
    try {
        entidades.value = await apiService.getEntidades();
    } catch (e) {
        console.error(e);
        fetchError.value = true;
    } finally {
        loadingEntidades.value = false;
    }
};

const seleccionarEntidad = (entidad: EntidadResumen) => {
    selectedEntidad.value = entidad;
    nuevoRegistro.value.entidadId = entidad.id;
    // Use tipoEntidad which is always defined, and map to expected values
    nuevoRegistro.value.tipoEntidad = entidad.tipoEntidad === 'Persona' ? 'PERSONA' : 'INSTITUCION';
    searchQuery.value = ''; // "Limpiar" buscador visualmente, pero mostramos la selección aparte
    isDropdownOpen.value = false;
};

const limpiarSeleccion = () => {
    selectedEntidad.value = null;
    nuevoRegistro.value.entidadId = 0;
    searchQuery.value = '';
};

const submitForm = async () => {
    if (!selectedEntidad.value) return;
    
    submitting.value = true;
    submitError.value = null;
    submitSuccess.value = false;

    try {
        // Transform the simple form data into the complex DonacionPayload structure
        const payload: DonacionPayload = {
            ingreso: {
                id: 0,
                origenEntidadId: nuevoRegistro.value.entidadId,
                montoTotal: nuevoRegistro.value.donacion.monto || 0,
                fechaIngreso: nuevoRegistro.value.donacion.fecha
            },
            donacion: {
                id: 0,
                ingresoRecursoId: 0,
                numeroCertificado: '', // Could be auto-generated or left empty
                idDonante: nuevoRegistro.value.entidadId
            },
            pecuniario: {
                id: 0,
                ingresoDonacionId: 0,
                monto: nuevoRegistro.value.donacion.monto || 0,
                destino: nuevoRegistro.value.donacion.descripcion
            }
        };
        
        await apiService.registrarDonacion(payload);
        submitSuccess.value = true;
        emit('registro-completado');
        
        // Reset donation fields only
        nuevoRegistro.value.donacion.monto = 0;
        nuevoRegistro.value.donacion.descripcion = '';
        
        // Optional: Keep selected entity or clear it? Usually cleaner to keep if entering multiple for same person, 
        // but let's clear to be safe.
        limpiarSeleccion();
        
    } catch (e: any) {
        submitError.value = e.message || 'Error al registrar donación';
    } finally {
        submitting.value = false;
    }
};

// Toggle dropdown on input focus
const openDropdown = () => {
    if (!selectedEntidad.value) {
        isDropdownOpen.value = true;
    }
};
// Close dropdown when clicking outside is handled usually by directives, 
// strictly for this snippet we'll use a simple blur delay or overlay. 
// For simplicity/robustness without extra deps: simple overlay in template or strict blur.
const closeDropdownDelayed = () => {
    setTimeout(() => {
        isDropdownOpen.value = false;
    }, 200);
};

onMounted(() => {
    cargarEntidades();
});
</script>

<template>
  <div class="bg-white shadow rounded-lg mb-8 overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
      <h3 class="text-lg font-medium text-gray-900">Nueva Donación</h3>
      <p class="mt-1 text-sm text-gray-500">Busque la entidad donante y registre los detalles.</p>
    </div>

    <div class="p-6">
       <!-- Error Loading Entities -->
       <div v-if="fetchError" class="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
            <span class="text-red-700 text-sm">Error conectando con el servidor.</span>
            <button @click="cargarEntidades" class="text-sm font-medium text-red-700 underline hover:text-red-800">Reintentar conexión</button>
       </div>

       <form @submit.prevent="submitForm" class="space-y-6">
            
            <!-- Entity Search Section -->
            <div class="relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Buscar Donante (Nombre o RUT)</label>
                
                <!-- Helper for loading state -->
                <div v-if="loadingEntidades" class="text-xs text-gray-500 mb-1">Cargando directorio...</div>

                <!-- Selection Display (When an entity is selected) -->
                <div v-if="selectedEntidad" class="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div>
                        <p class="text-sm font-bold text-institutional-blue">{{ selectedEntidad.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">RUT: {{ formatRutForDisplay(selectedEntidad.identificador) }} - {{ selectedEntidad.tipo }}</p>
                    </div>
                    <button type="button" @click="limpiarSeleccion" class="text-gray-400 hover:text-gray-600 focus:outline-none">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>

                <!-- Search Input (When no entity is selected) -->
                <div v-else class="relative">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        v-model="searchQuery" 
                        @focus="openDropdown"
                        @input="openDropdown"
                        @blur="closeDropdownDelayed"
                        placeholder="Escriba para buscar..." 
                        class="pl-10 block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-slate-300 rounded-md p-2.5 border"
                    >
                    
                    <!-- Dropdown Results -->
                    <ul v-if="isDropdownOpen && filteredEntidades.length > 0" class="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                        <li 
                            v-for="entidad in filteredEntidades" 
                            :key="entidad.id" 
                            @mousedown.prevent="seleccionarEntidad(entidad)"
                            class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 text-gray-900"
                        >
                            <div class="flex flex-col">
                                <span class="font-medium block truncate">{{ entidad.nombreCompleto }}</span>
                                <span class="text-xs text-gray-500 block">RUT: {{ formatRutForDisplay(entidad.identificador) }}</span>
                            </div>
                        </li>
                    </ul>
                    <div v-if="isDropdownOpen && filteredEntidades.length === 0 && searchQuery" class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-4 text-sm text-gray-500 border border-gray-100">
                        No se encontraron resultados.
                    </div>
                </div>
            </div>

            <!-- Donation Details (Locked until Entity Selected) -->
            <div class="bg-gray-50 p-4 rounded-md border border-gray-200" :class="{ 'opacity-50 pointer-events-none': !selectedEntidad }">
                <h4 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Detalle de la Donación</h4>
                
                <div class="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                    <div class="sm:col-span-3">
                        <label for="tipoDonacion" class="block text-sm font-medium text-gray-700">Tipo Donación</label>
                        <select id="tipoDonacion" v-model="nuevoRegistro.donacion.tipo" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm rounded-md border">
                            <option value="DINERO">Dinero</option>
                            <option value="ESPECIE">Especie</option>
                        </select>
                    </div>

                    <div class="sm:col-span-3">
                        <label for="fecha" class="block text-sm font-medium text-gray-700">Fecha</label>
                         <input type="date" id="fecha" v-model="nuevoRegistro.donacion.fecha" required class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                    </div>

                    <div class="sm:col-span-6" v-if="nuevoRegistro.donacion.tipo === 'DINERO'">
                        <label for="monto" class="block text-sm font-medium text-gray-700">Monto ($)</label>
                         <div class="mt-1 relative rounded-md shadow-sm">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span class="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input type="number" id="monto" v-model.number="nuevoRegistro.donacion.monto" class="focus:ring-institutional-blue focus:border-institutional-blue block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="0">
                         </div>
                    </div>

                    <div class="sm:col-span-6">
                        <label for="descripcion" class="block text-sm font-medium text-gray-700">Descripción / Observación</label>
                        <textarea id="descripcion" v-model="nuevoRegistro.donacion.descripcion" rows="3" class="shadow-sm focus:ring-institutional-blue focus:border-institutional-blue block w-full sm:text-sm border border-gray-300 rounded-md p-2"></textarea>
                    </div>
                </div>
            </div>

            <!-- Submit Actions -->
             <div class="flex items-center justify-end">
                <button type="submit" :disabled="submitting || !selectedEntidad" class="w-full sm:w-auto inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-institutional-blue hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-institutional-blue disabled:opacity-50 disabled:cursor-not-allowed">
                    {{ submitting ? 'Procesando...' : 'Confirmar Registro' }}
                </button>
            </div>

            <!-- Feedback Messages -->
            <div v-if="submitSuccess" class="rounded-md bg-green-50 p-4">
                 <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                             <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm font-medium text-green-800">Donación registrada exitosamente.</p>
                    </div>
                 </div>
            </div>
            <div v-if="submitError" class="rounded-md bg-red-50 p-4">
                 <div class="flex">
                    <div class="flex-shrink-0">
                         <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                         </svg>
                    </div>
                    <div class="ml-3">
                         <p class="text-sm font-medium text-red-800">{{ submitError }}</p>
                    </div>
                 </div>
            </div>
       </form>
    </div>
  </div>
</template>
