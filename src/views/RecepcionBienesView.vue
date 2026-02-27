<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EntidadResumen, CatalogoItem, DonacionBienesPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import { Trash2, ClipboardList, Loader2, Plus } from 'lucide-vue-next';

// Debounce utility
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debounce = (fn: Function, delay: number) => {
    return (...args: any[]) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), delay);
    };
};

// State for donor search
const donadorQuery = ref('');
const donadorResults = ref<EntidadResumen[]>([]);
const loadingDonador = ref(false);
const showDonadorDropdown = ref(false);
const selectedDonador = ref<EntidadResumen | null>(null);

// State for receiver search
const receptorQuery = ref('');
const receptorResults = ref<EntidadResumen[]>([]);
const loadingReceptor = ref(false);
const showReceptorDropdown = ref(false);
const selectedReceptor = ref<EntidadResumen | null>(null);

// State for purpose / notes
const proposito = ref('');
const anotaciones = ref('');

// State for gestor (optional)
const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const showGestorDropdown = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);
const loadingGestor = ref(false);

// State for catalog item search
const itemQuery = ref('');
const itemResults = ref<CatalogoItem[]>([]);
const loadingItems = ref(false);
const showItemDropdown = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);

// State for item form (temp item before adding to list)
const itemCantidad = ref<number>(1);
const itemPrecio = ref<number>(0);

// State for catalog modal
const showModalRegistroCatalogo = ref(false);

// Local items list (before submission)
interface LocalItem {
    itemCatalogoId?: number;
    nombre: string;
    categoria: string;
    unidad: string;
    cantidad: number;
    precio: number;
}
const items = ref<LocalItem[]>([]);

// State for submission
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);

// Computed total
const montoTotal = computed(() => {
    return items.value.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
});

// Search methods
const searchDonador = debounce(async (query: string) => {
    if (!query || query.trim().length < 1) {
        donadorResults.value = [];
        return;
    }
    loadingDonador.value = true;
    try {
        donadorResults.value = await apiService.buscarEntidades(query);
    } catch (e) {
        console.error('Error searching donor:', e);
        donadorResults.value = [];
    } finally {
        loadingDonador.value = false;
    }
}, 300);

const searchReceptor = debounce(async (query: string) => {
    if (!query || query.trim().length < 1) {
        receptorResults.value = [];
        return;
    }
    loadingReceptor.value = true;
    try {
        receptorResults.value = await apiService.buscarEntidades(query);
    } catch (e) {
        console.error('Error searching receiver:', e);
        receptorResults.value = [];
    } finally {
        loadingReceptor.value = false;
    }
}, 300);

const searchItems = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        itemResults.value = [];
        return;
    }
    loadingItems.value = true;
    try {
        itemResults.value = await apiService.buscarCatalogo(query);
    } catch (e) {
        console.error('Error searching items:', e);
        itemResults.value = [];
    } finally {
        loadingItems.value = false;
    }
}, 300);

const searchGestor = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        showGestorDropdown.value = false;
        return;
    }
    loadingGestor.value = true;
    try {
        gestorResults.value = await apiService.buscarEntidades(query);
        showGestorDropdown.value = true;
    } catch (error) {
        console.error('Error buscando gestores', error);
        gestorResults.value = [];
    } finally {
        loadingGestor.value = false;
    }
}, 300);

// Selection methods
const selectDonador = (entidad: EntidadResumen) => {
    selectedDonador.value = entidad;
    donadorQuery.value = '';
    showDonadorDropdown.value = false;
};

const selectReceptor = (entidad: EntidadResumen) => {
    selectedReceptor.value = entidad;
    receptorQuery.value = '';
    showReceptorDropdown.value = false;
};

const selectItem = (item: CatalogoItem) => {
    selectedItem.value = item;
    // Auto-fill with reference price (editable)
    itemPrecio.value = item.precioReferencia;
    itemQuery.value = '';
    showItemDropdown.value = false;
    itemQuery.value = '';
    showItemDropdown.value = false;
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

const handleCatalogoCreado = () => {
    // Retry search if there was a query, otherwise just close
    if (itemQuery.value && itemQuery.value.length >= 2) {
        searchItems(itemQuery.value);
    }
    showModalRegistroCatalogo.value = false;
};

// Add item to local list
const addItemToList = () => {
    if (!selectedItem.value || itemCantidad.value <= 0 || itemPrecio.value <= 0) {
        message.value = { type: 'error', text: 'Debe seleccionar un ítem y especificar cantidad y precio válidos.' };
        return;
    }

    items.value.push({
        itemCatalogoId: selectedItem.value.id,
        cantidad: itemCantidad.value,
        precio: itemPrecio.value,
        nombre: selectedItem.value.nombre,
        categoria: selectedItem.value.categoria || 'Sin categoría',
        unidad: selectedItem.value.unidadMedidaEstandar || 'unidad'
    });

    // Reset item form
    selectedItem.value = null;
    itemCantidad.value = 1;
    itemPrecio.value = 0;
    message.value = null;
};

// Remove item from list
const removeItem = (index: number) => {
    items.value.splice(index, 1);
};

// Submit donation
const submitDonacion = async () => {
    // Validation
    if (!selectedDonador.value) {
        message.value = { type: 'error', text: 'Debe seleccionar un donador.' };
        return;
    }
    if (!selectedReceptor.value) {
        message.value = { type: 'error', text: 'Debe seleccionar un receptor.' };
        return;
    }
    if (items.value.length === 0) {
        message.value = { type: 'error', text: 'Debe agregar al menos un ítem.' };
        return;
    }

    submitting.value = true;
    message.value = null;

    const payload: DonacionBienesPayload = {
        ingreso: {
            origenEntidadId: selectedDonador.value.id,
            responsableInternoId: selectedReceptor.value.id,
            montoTotal: montoTotal.value,
            tipoTransaccion: 'Donacion',
            estado: 'Cerrado',
            anotaciones: anotaciones.value.trim() || undefined
        },
        donacion: {
            propositoEspecifico: proposito.value || 'Campaña Invierno',
            gestorId: selectedGestor.value?.id
        },
        items: items.value.map(item => ({
            itemCatalogoId: item.itemCatalogoId,
            nombre: item.nombre,
            categoria: item.categoria,
            unidad: item.unidad,
            cantidad: item.cantidad,
            precio: item.precio
        }))
    };

    // Debug: Ver exactamente qué se está enviando
    console.log("Datos a enviar al backend:", JSON.stringify(payload, null, 2));

    try {
        const result = await apiService.registrarDonacionBienes(payload);
        message.value = { 
            type: 'success', 
            text: `Donación registrada exitosamente. ID de ingreso: ${result.id_ingreso}` 
        };
        
        // Reset form
        selectedDonador.value = null;
        selectedReceptor.value = null;
        proposito.value = '';
        anotaciones.value = '';
        selectedGestor.value = null;
        gestorQuery.value = '';
        gestorResults.value = [];
        items.value = [];
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
        message.value = { type: 'error', text: `Error al registrar donación: ${e.message}` };
    } finally {
        submitting.value = false;
    }
};
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.35em] text-indigo-500 font-semibold">Recepción</p>
            <h2 class="text-3xl font-bold text-gray-900">Donaciones no pecuniarias</h2>
            <p class="text-gray-600 max-w-3xl text-sm">Replica el flujo de Consumo Interno: identifica actores, detalla el propósito y registra cada ítem valorizado.</p>
        </div>

        <div 
            v-if="message" 
            :class="`p-4 rounded-xl border ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`"
        >
            {{ message.text }}
        </div>

        <!-- Section 1: Actores (Donor, Receiver, Purpose) -->
        <div class="bg-white shadow rounded-lg p-5 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-800 mb-4">1. Identificar actores</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <!-- Donor Searcher -->
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Donador <span class="text-red-500">*</span>
                    </label>
                    
                    <div v-if="selectedDonador" class="flex flex-col gap-3 bg-indigo-50 p-4 rounded-md border border-indigo-200">
                        <div>
                            <span class="block font-bold text-institutional-blue">{{ selectedDonador.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedDonador.identificador) }}</span>
                        </div>
                        <button @click="selectedDonador = null" class="self-start px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:text-gray-800 text-sm">
                            Cambiar
                        </button>
                    </div>

                    <div v-else>
                        <input 
                            type="text" 
                            v-model="donadorQuery"
                            @input="searchDonador(donadorQuery)"
                            @focus="showDonadorDropdown = true"
                            placeholder="Buscar por nombre o RUT..."
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                        />
                        
                        <!-- Dropdown -->
                        <div v-if="showDonadorDropdown && donadorQuery.length >= 2" class="absolute z-20 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-200 max-h-60 overflow-auto">
                            <div v-if="loadingDonador" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="donadorResults.length > 0">
                                <li 
                                    v-for="entidad in donadorResults" 
                                    :key="entidad.id"
                                    @click="selectDonador(entidad)"
                                    class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0"
                                >
                                    <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                </li>
                            </ul>
                            <div v-else class="p-4 text-center text-gray-500 text-sm">
                                No se encontraron resultados
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Receiver Searcher -->
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Receptor <span class="text-red-500">*</span>
                    </label>
                    
                    <div v-if="selectedReceptor" class="flex flex-col gap-3 bg-indigo-50 p-4 rounded-md border border-indigo-200">
                        <div>
                            <span class="block font-bold text-green-700">{{ selectedReceptor.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedReceptor.identificador) }}</span>
                        </div>
                        <button @click="selectedReceptor = null" class="self-start px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:text-gray-800 text-sm">
                            Cambiar
                        </button>
                    </div>

                    <div v-else>
                        <input 
                            type="text" 
                            v-model="receptorQuery"
                            @input="searchReceptor(receptorQuery)"
                            @focus="showReceptorDropdown = true"
                            placeholder="Buscar por nombre o RUT..."
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                        />
                        
                        <!-- Dropdown -->
                        <div v-if="showReceptorDropdown && receptorQuery.length >= 2" class="absolute z-20 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-200 max-h-60 overflow-auto">
                            <div v-if="loadingReceptor" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="receptorResults.length > 0">
                                <li 
                                    v-for="entidad in receptorResults" 
                                    :key="entidad.id"
                                    @click="selectReceptor(entidad)"
                                    class="px-4 py-3 hover:bg-green-50 cursor-pointer border-b last:border-0"
                                >
                                    <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                </li>
                            </ul>
                            <div v-else class="p-4 text-center text-gray-500 text-sm">
                                No se encontraron resultados
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Purpose Field -->
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Propósito / Actividad Asociada
                </label>
                <input 
                    type="text" 
                    v-model="proposito"
                    placeholder="Ej: Apoyo a familias vulnerables, Mejoramiento de infraestructura, etc."
                    class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Gestor / Responsable (opcional)
                    </label>

                    <div v-if="selectedGestor" class="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-md p-4">
                        <div>
                            <p class="font-semibold text-amber-900">{{ selectedGestor.nombreCompleto }}</p>
                            <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</p>
                        </div>
                        <button type="button" @click="clearGestor" class="self-start text-xs px-3 py-1.5 rounded-full border border-amber-300 text-amber-700 hover:bg-amber-100">
                            Cambiar
                        </button>
                    </div>

                    <div v-else>
                        <input 
                            type="text" 
                            v-model="gestorQuery"
                            @input="searchGestor(gestorQuery)"
                            @focus="showGestorDropdown = true"
                            placeholder="Buscar por nombre o RUT..."
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                        />

                        <div v-if="showGestorDropdown && gestorQuery.length >= 2" class="absolute z-20 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-200 max-h-60 overflow-auto">
                            <div v-if="loadingGestor" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="gestorResults.length > 0">
                                <li 
                                    v-for="entidad in gestorResults" 
                                    :key="entidad.id"
                                    @click="selectGestor(entidad)"
                                    class="px-4 py-3 hover:bg-amber-50 cursor-pointer border-b last:border-0"
                                >
                                    <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                </li>
                            </ul>
                            <div v-else class="p-4 text-center text-gray-500 text-sm">
                                No se encontraron resultados
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Anotaciones internas
                    </label>
                    <textarea
                        v-model="anotaciones"
                        rows="4"
                        placeholder="Notas o contexto adicional para esta donación (opcional)"
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                    ></textarea>
                </div>
            </div>
        </div>

        <!-- Section 2: Item Management -->
        <div class="bg-white shadow rounded-lg p-5 border border-gray-200">
            <h3 class="text-base font-semibold text-gray-800 mb-4">2. Gestión de ítems</h3>
            
            <!-- Item Searcher -->
            <div class="relative mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Buscar Ítem del Catálogo
                </label>
                
                <div v-if="selectedItem" class="flex items-center justify-between bg-purple-50 p-4 rounded-md border-l-4 border-l-purple-600 border border-purple-200 mb-4">
                    <div>
                        <span class="block font-bold text-purple-700">{{ selectedItem.nombre }}</span>
                        <span class="text-sm text-gray-600">
                            Stock actual: {{ selectedItem.stockActual }} {{ selectedItem.unidadMedidaEstandar }}
                        </span>
                    </div>
                    <button @click="selectedItem = null" class="text-gray-500 hover:text-gray-700 text-sm underline">
                        Cambiar
                    </button>
                </div>

                <div v-else>
                    <input 
                        type="text" 
                        v-model="itemQuery"
                        @input="searchItems(itemQuery)"
                        @focus="showItemDropdown = true"
                        placeholder="Buscar por nombre o categoría..."
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
                    />
                    
                    <!-- Dropdown -->
                    <div v-if="showItemDropdown && itemQuery.length >= 2" class="absolute z-20 mt-1 w-full bg-white shadow-xl rounded-md border border-gray-200 max-h-60 overflow-auto">
                        <div v-if="loadingItems" class="p-4 text-center text-gray-500">
                            Buscando ítems...
                        </div>
                        <ul v-else-if="itemResults.length > 0">
                            <li 
                                v-for="item in itemResults" 
                                :key="item.id"
                                @click="selectItem(item)"
                                class="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b last:border-0"
                            >
                                <p class="font-medium text-gray-900">{{ item.nombre }}</p>
                                <p class="text-xs text-gray-500">
                                    Stock: {{ item.stockActual }} {{ item.unidadMedidaEstandar }} | Precio ref: ${{ item.precioReferencia }}
                                </p>
                            </li>
                        </ul>
                        <div v-else class="p-4 flex flex-col items-center">
                            <p class="text-gray-500 text-sm mb-2">No se encontró el ítem.</p>
                            <button 
                                @click="showModalRegistroCatalogo = true"
                                type="button"
                                class="btn btn-outline text-sm"
                            >
                                <Plus class="w-4 h-4" /> Crear nuevo ítem
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Item Form (Quantity & Price) -->
            <div v-if="selectedItem" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Cantidad ({{ selectedItem.unidadMedidaEstandar || 'unidad' }}) <span class="text-red-500">*</span>
                    </label>
                    <input 
                        type="number" 
                        v-model.number="itemCantidad"
                        min="1"
                        step="0.01"
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Precio por {{ selectedItem.unidadMedidaEstandar || 'unidad' }} ($) <span class="text-red-500">*</span>
                    </label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input 
                            type="number" 
                            v-model.number="itemPrecio"
                            min="0"
                            step="100"
                            class="block w-full pl-7 shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                    </div>
                </div>
                <div class="flex items-end">
                            <button 
                                @click="addItemToList"
                                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition"
                            >
                                Agregar ítem
                    </button>
                </div>
            </div>
        </div>

        <!-- Section 3: Items Table -->
        <div v-if="items.length > 0" class="bg-white shadow rounded-2xl p-6 border border-gray-100">
            <h3 class="text-xl font-semibold text-gray-900 mb-4">3. Ítems Agregados</h3>
            
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Ítem
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Cantidad
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Precio Unitario
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Subtotal
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr v-for="(item, index) in items" :key="index">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="text-sm font-medium text-gray-900">{{ item.nombre }}</div>
                                <div class="text-xs text-gray-500">{{ item.categoria }} • {{ item.unidad }}</div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {{ item.cantidad }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ${{ item.precio.toLocaleString('es-CL') }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                ${{ (item.cantidad * item.precio).toLocaleString('es-CL') }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm">
                                <button 
                                    @click="removeItem(index)"
                                    class="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                                >
                                    <Trash2 class="w-4 h-4" /> Eliminar
                                </button>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot class="bg-gray-50">
                        <tr>
                            <td colspan="3" class="px-6 py-4 text-right text-sm font-bold text-gray-900">
                                Total General:
                            </td>
                            <td class="px-6 py-4 text-sm font-bold text-institutional-blue">
                                ${{ montoTotal.toLocaleString('es-CL') }}
                            </td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <!-- Section 4: Submit Button -->
        <div class="flex justify-end">
                <button 
                    @click="submitDonacion"
                    :disabled="submitting"
                    class="btn btn-primary text-lg px-8 py-3 disabled:opacity-50"
                >
                    <template v-if="submitting">
                        <Loader2 class="w-5 h-5 animate-spin" />
                        Guardando...
                    </template>
                    <template v-else>
                        <ClipboardList class="w-5 h-5" />
                        Registrar Donación de Bienes
                    </template>
                </button>
        </div>
    </div>

    <ModalRegistroCatalogo 
        v-if="showModalRegistroCatalogo"
        @close="showModalRegistroCatalogo = false" 
        @created="handleCatalogoCreado"
    />
</template>
