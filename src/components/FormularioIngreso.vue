<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { NuevoRegistro, DetalleDonacion, EntidadResumen, DonacionPayload, CatalogoItem, Cuenta } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalCrearPersona from './ModalCrearPersona.vue';
import ModalRegistroCatalogo from './ModalRegistroCatalogo.vue';

const emit = defineEmits<{ (e: 'registro-completado'): void }>();

// State
const entidades = ref<EntidadResumen[]>([]);
const loadingEntidades = ref(false);
const fetchError = ref<boolean>(false);

const searchQuery = ref('');
const isDropdownOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);

// Catalog search for non-pecuniary donations
const catalogoItems = ref<CatalogoItem[]>([]);
const catalogoSearchQuery = ref('');
const isCatalogoDropdownOpen = ref(false);
const selectedCatalogoItem = ref<CatalogoItem | null>(null);
const loadingCatalogo = ref(false);

const showCrearPersonaModal = ref(false);
const showModalRegistroCatalogo = ref(false);

const cuentas = ref<Cuenta[]>([]);
const cuentasLoading = ref(true);
const cuentaDestinoId = ref<number | null>(null);
const metodoTransferencia = ref('Transferencia');
const metodosTransferencia = ['Transferencia', 'Depósito', 'Efectivo'];
const proposito = ref('');
const anotaciones = ref('');
const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const gestorLoading = ref(false);
const showGestorDropdown = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);

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

const filteredCatalogoItems = computed(() => {
  if (!catalogoSearchQuery.value) return catalogoItems.value;
  const lowerQuery = catalogoSearchQuery.value.toLowerCase();
  return catalogoItems.value.filter(item => 
    item.nombre.toLowerCase().includes(lowerQuery)
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

const cargarCuentas = async () => {
    cuentasLoading.value = true;
    try {
        cuentas.value = await apiService.getCuentas();
        if (cuentas.value.length && cuentaDestinoId.value === null) {
            cuentaDestinoId.value = cuentas.value[0]!.id;
        }
    } catch (e) {
        console.error('Error cargando cuentas', e);
        cuentas.value = [];
        cuentaDestinoId.value = null;
    } finally {
        cuentasLoading.value = false;
    }
};

const buscarCatalogo = async () => {
    if (!catalogoSearchQuery.value || catalogoSearchQuery.value.length < 2) {
        catalogoItems.value = [];
        return;
    }
    
    loadingCatalogo.value = true;
    try {
        catalogoItems.value = await apiService.buscarCatalogo(catalogoSearchQuery.value);
        isCatalogoDropdownOpen.value = true;
    } catch (e) {
        console.error('Error buscando catálogo:', e);
        catalogoItems.value = [];
    } finally {
        loadingCatalogo.value = false;
    }
};

const seleccionarCatalogoItem = (item: CatalogoItem) => {
    selectedCatalogoItem.value = item;
    // Auto-fill with reference price (editable)
    nuevoRegistro.value.donacion.monto = item.precioReferencia;
    nuevoRegistro.value.donacion.descripcion = item.nombre;
    catalogoSearchQuery.value = '';
    isCatalogoDropdownOpen.value = false;
};

const limpiarCatalogoSeleccion = () => {
    selectedCatalogoItem.value = null;
    catalogoSearchQuery.value = '';
    nuevoRegistro.value.donacion.monto = 0;
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

let gestorSearchTimer: ReturnType<typeof setTimeout> | null = null;
const buscarGestores = (query: string) => {
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

const seleccionarGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const limpiarGestor = () => {
    selectedGestor.value = null;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const handlePersonaCreada = async (rut: string) => {
    showCrearPersonaModal.value = false;
    try {
        // Search for the created entity to get full details including ID
        const resultados = await apiService.buscarEntidades(rut);
        const encontrada = resultados.find(e => e.identificador === rut);
        
        if (encontrada) {
             // Add to local list if not present (optional, but good for UX)
             if (!entidades.value.some(e => e.id === encontrada.id)) {
                entidades.value.unshift(encontrada);
             }
             seleccionarEntidad(encontrada);
        } else {
            alert("Persona creada. Por favor, búsquela nuevamente.");
        }
    } catch (e) {
        console.error("Error retrieving new person:", e);
    }
};

const handleCatalogoCreado = () => {
    // Just retry search with current query or verify if item exists
    buscarCatalogo();
    showModalRegistroCatalogo.value = false;
};

const submitForm = async () => {
    if (!selectedEntidad.value) return;

    if (!cuentaDestinoId.value) {
        submitError.value = 'Selecciona una cuenta destino para acreditar la donación.';
        return;
    }
    
    submitting.value = true;
    submitError.value = null;
    submitSuccess.value = false;

    try {
        // Transform the simple form data into the complex DonacionPayload structure
        const notas = anotaciones.value?.trim() || nuevoRegistro.value.donacion.descripcion?.trim() || '';
        const propositoTexto = proposito.value?.trim() || 'Donación registrada';
        const responsableId = selectedGestor.value?.id ?? nuevoRegistro.value.entidadId;

        const payload: DonacionPayload = {
            ingreso: {
                origenEntidadId: nuevoRegistro.value.entidadId,
                responsableInternoId: responsableId,
                montoTotal: nuevoRegistro.value.donacion.monto || 0,
                tipoTransaccion: 'Donacion',
                estado: 'Cerrado',
                anotaciones: notas || undefined
            },
            donacion: {
                propositoEspecifico: propositoTexto,
                gestorId: selectedGestor.value?.id
            },
            pecuniario: {
                cuentaDestinoId: cuentaDestinoId.value!,
                metodoTransferencia: metodoTransferencia.value,
                comentarios: notas || undefined
            }
        };
        
        await apiService.registrarDonacion(payload);
        submitSuccess.value = true;
        emit('registro-completado');
        
        // Reset donation fields only
        nuevoRegistro.value.donacion.monto = 0;
        nuevoRegistro.value.donacion.descripcion = '';
        proposito.value = '';
        anotaciones.value = '';
        selectedGestor.value = null;
        
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

const closeCatalogoDropdownDelayed = () => {
    setTimeout(() => {
        isCatalogoDropdownOpen.value = false;
    }, 200);
};

const closeGestorDropdownDelayed = () => {
    setTimeout(() => {
        showGestorDropdown.value = false;
    }, 200);
};

const openCatalogoDropdown = () => {
    if (!selectedCatalogoItem.value && catalogoSearchQuery.value.length >= 2) {
        isCatalogoDropdownOpen.value = true;
    }
};

onMounted(() => {
    cargarEntidades();
    cargarCuentas();
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
                <label class="block text-sm font-medium text-gray-700 mb-1">Buscar Donante (Nombre o RUT) <span class="text-red-500">*</span></label>
                
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
                    <div v-if="isDropdownOpen && filteredEntidades.length === 0 && searchQuery" class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-4 px-4 text-sm text-gray-500 border border-gray-100 flex flex-col items-center">
                        <p class="mb-2">No se encontraron resultados.</p>
                                    <button 
                                        @click="showCrearPersonaModal = true"
                            type="button"
                            class="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Crear Nueva Persona
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Gestor interno (opcional)</label>
                <div v-if="selectedGestor" class="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div>
                        <p class="text-sm font-semibold text-amber-800">{{ selectedGestor.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</p>
                    </div>
                    <button type="button" @click="limpiarGestor" class="text-xs text-amber-700 hover:underline">Cambiar</button>
                </div>
                <div v-else class="relative">
                    <input
                        type="text"
                        v-model="gestorQuery"
                        @input="buscarGestores(gestorQuery)"
                        @focus="showGestorDropdown = true"
                        @blur="closeGestorDropdownDelayed"
                        placeholder="Buscar gestor por nombre o RUT..."
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                    />
                    <div v-if="gestorLoading" class="absolute right-3 top-2 text-xs text-gray-400">Buscando...</div>
                    <ul
                        v-if="showGestorDropdown && gestorResults.length > 0"
                        class="absolute z-10 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-100 max-h-60 overflow-auto"
                    >
                        <li
                            v-for="gestor in gestorResults"
                            :key="gestor.id"
                            @mousedown.prevent="seleccionarGestor(gestor)"
                            class="px-4 py-2 hover:bg-blue-50 cursor-pointer"
                        >
                            <p class="font-medium text-gray-900">{{ gestor.nombreCompleto }}</p>
                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(gestor.identificador) }}</p>
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
                        <label for="monto" class="block text-sm font-medium text-gray-700">Monto ($) <span class="text-red-500">*</span></label>
                         <div class="mt-1 relative rounded-md shadow-sm">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span class="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input type="number" id="monto" v-model.number="nuevoRegistro.donacion.monto" class="focus:ring-institutional-blue focus:border-institutional-blue block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="0">
                         </div>
                    </div>

                    <div class="sm:col-span-6">
                        <label class="block text-sm font-medium text-gray-700">Propósito específico</label>
                        <input
                            type="text"
                            v-model="proposito"
                            placeholder="Ej: Programa Invierno"
                            class="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-institutional-blue focus:border-institutional-blue text-sm"
                        />
                    </div>

                    <div class="sm:col-span-3">
                        <label class="block text-sm font-medium text-gray-700">Cuenta destino</label>
                        <div v-if="cuentasLoading" class="mt-1 text-xs text-gray-500">Cargando cuentas...</div>
                        <select
                            v-else-if="cuentas.length > 0"
                            v-model="cuentaDestinoId"
                            class="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-institutional-blue focus:border-institutional-blue text-sm bg-white"
                        >
                            <option v-for="cuenta in cuentas" :key="cuenta.id" :value="cuenta.id">
                                {{ cuenta.nombre }} — Saldo: {{ cuenta.saldoActual || 0 }}
                            </option>
                        </select>
                        <p v-else class="mt-1 text-xs text-red-600">
                            No hay cuentas disponibles. Crea una en la sección Cuentas antes de registrar donaciones.
                        </p>
                    </div>
                    <div class="sm:col-span-3">
                        <label class="block text-sm font-medium text-gray-700">Método de transferencia</label>
                        <select
                            v-model="metodoTransferencia"
                            class="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-institutional-blue focus:border-institutional-blue text-sm bg-white"
                        >
                            <option v-for="metodo in metodosTransferencia" :key="metodo" :value="metodo">
                                {{ metodo }}
                            </option>
                        </select>
                    </div>

                    <!-- Catalog Item Search for ESPECIE donations -->
                    <div class="sm:col-span-6" v-if="nuevoRegistro.donacion.tipo === 'ESPECIE'">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Buscar Item del Catálogo</label>
                        
                        <!-- Selected Item Display -->
                        <div v-if="selectedCatalogoItem" class="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md mb-4">
                            <div>
                                <p class="text-sm font-bold text-green-800">{{ selectedCatalogoItem.nombre }}</p>
                                <p class="text-xs text-gray-600">{{ selectedCatalogoItem.categoria }}</p>
                            </div>
                            <button type="button" @click="limpiarCatalogoSeleccion" class="text-gray-400 hover:text-gray-600 focus:outline-none">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <!-- Search Input (When no item is selected) -->
                        <div v-else class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                                </svg>
                            </div>
                            <input 
                                type="text" 
                                v-model="catalogoSearchQuery" 
                                @input="buscarCatalogo"
                                @focus="openCatalogoDropdown"
                                @blur="closeCatalogoDropdownDelayed"
                                placeholder="Escriba al menos 2 caracteres..." 
                                class="pl-10 block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-slate-300 rounded-md p-2.5 border"
                            >
                            <div v-if="loadingCatalogo" class="absolute right-3 top-3 text-xs text-gray-500">Buscando...</div>
                            
                            <!-- Dropdown Results -->
                            <ul v-if="isCatalogoDropdownOpen && filteredCatalogoItems.length > 0" class="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                                <li 
                                    v-for="item in filteredCatalogoItems" 
                                    :key="item.id" 
                                    @mousedown.prevent="seleccionarCatalogoItem(item)"
                                    class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-green-50 text-gray-900"
                                >
                                    <div class="flex flex-col">
                                        <span class="font-medium block truncate">{{ item.nombre }}</span>
                                        <span class="text-xs text-gray-500 block">{{ item.categoria }} - Precio ref: ${{ item.precioReferencia }}</span>
                                    </div>
                                </li>
                            </ul>
                            <div v-if="isCatalogoDropdownOpen && filteredCatalogoItems.length === 0 && catalogoSearchQuery.length >= 2 && !loadingCatalogo" class="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-4 px-4 text-sm text-gray-500 border border-gray-100 flex flex-col items-center">
                                <p class="mb-2">No se encontraron items en el catálogo.</p>
                                <button 
                                    @click="showModalRegistroCatalogo = true"
                                    type="button"
                                    class="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Crear Nuevo Item
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Price and Quantity for ESPECIE (shown only when item is selected) -->
                    <div v-if="nuevoRegistro.donacion.tipo === 'ESPECIE' && selectedCatalogoItem" class="sm:col-span-3">
                        <label for="precioUnitario" class="block text-sm font-medium text-gray-700">
                            Precio por {{ selectedCatalogoItem.unidadMedidaEstandar || 'unidad' }}
                        </label>
                        <div class="mt-1 relative rounded-md shadow-sm">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span class="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input 
                                type="number" 
                                id="precioUnitario" 
                                v-model.number="nuevoRegistro.donacion.monto" 
                                class="focus:ring-institutional-blue focus:border-institutional-blue block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border" 
                                placeholder="0"
                            >
                        </div>
                    </div>

                    <div v-if="nuevoRegistro.donacion.tipo === 'ESPECIE' && selectedCatalogoItem" class="sm:col-span-3">
                        <label for="cantidad" class="block text-sm font-medium text-gray-700">
                            Cantidad ({{ selectedCatalogoItem.unidadMedidaEstandar || 'unidad' }})
                        </label>
                        <input 
                            type="number" 
                            id="cantidad" 
                            min="1"
                            step="0.01"
                            class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border" 
                            placeholder="1"
                        >
                    </div>


                    <div class="sm:col-span-6">
                        <label for="descripcion" class="block text-sm font-medium text-gray-700">Anotaciones (opcional)</label>
                        <textarea id="descripcion" v-model="anotaciones" rows="3" class="shadow-sm focus:ring-institutional-blue focus:border-institutional-blue block w-full sm:text-sm border border-gray-300 rounded-md p-2"></textarea>
                    </div>
                </div>
            </div>

            <!-- Submit Actions -->
             <div class="flex items-center justify-end">
                <button type="submit" :disabled="submitting || !selectedEntidad" class="w-full sm:w-auto inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
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

    <!-- Modals -->
    <ModalCrearPersona 
        :isOpen="showCrearPersonaModal" 
        @close="showCrearPersonaModal = false" 
        @created="handlePersonaCreada" 
    />
    
    <ModalRegistroCatalogo 
        v-if="showModalRegistroCatalogo"
        @close="showModalRegistroCatalogo = false" 
        @created="handleCatalogoCreado"
    />
  </div>
</template>
