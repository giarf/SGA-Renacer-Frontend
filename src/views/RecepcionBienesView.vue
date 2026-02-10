<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EntidadResumen, CatalogoItem, ItemDonacionBienes, DonacionBienesPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';

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

// State for purpose
const proposito = ref('');

// State for catalog item search
const itemQuery = ref('');
const itemResults = ref<CatalogoItem[]>([]);
const loadingItems = ref(false);
const showItemDropdown = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);

// State for item form (temp item before adding to list)
const itemCantidad = ref<number>(1);
const itemPrecio = ref<number>(0);

// Local items list (before submission)
interface LocalItem {
    itemCatalogoId: number;
    nombre: string;
    unidadMedida: string;
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
    if (!query || query.trim().length < 2) {
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
    if (!query || query.trim().length < 2) {
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
    itemQuery.value = '';
    showItemDropdown.value = false;
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
        unidadMedida: selectedItem.value.unidadMedida
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

    // Generar número de certificado único basado en timestamp
    const numeroCertificado = `DON-BIEN-${new Date().getFullYear()}-${Date.now()}`;

    const payload: DonacionBienesPayload = {
        ingreso: {
            id: 0,
            origenEntidadId: selectedDonador.value.id,
            responsableInternoId: selectedReceptor.value.id,
            montoTotal: montoTotal.value,
            tipoTransaccion: 'Donacion',
            estado: 'Cerrado'
        },
        donacion: {
            ingresoId: 0,
            numeroCertificado: numeroCertificado,
            propositoEspecifico: proposito.value || 'Campaña Invierno'
        },
        items: items.value.map(item => ({
            id: 0,
            itemCatalogoId: item.itemCatalogoId,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: item.precio
        }))
    };

    // Debug: Ver exactamente qué se está enviando
    console.log("📤 Datos a enviar al backend:", JSON.stringify(payload, null, 2));

    try {
        const result = await apiService.registrarDonacionBienes(payload);
        message.value = { 
            type: 'success', 
            text: `✅ Donación registrada exitosamente. ID de Ingreso: ${result.id_ingreso}` 
        };
        
        // Reset form
        selectedDonador.value = null;
        selectedReceptor.value = null;
        proposito.value = '';
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
    <div class="max-w-6xl mx-auto py-8 px-4">
        <h2 class="text-3xl font-bold text-institutional-blue mb-8 border-b-2 border-institutional-blue pb-3">
            Recepción de Donaciones No Pecuniarias
        </h2>

        <!-- Success/Error Messages -->
        <div 
            v-if="message" 
            :class="`mb-6 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`"
        >
            {{ message.text }}
        </div>

        <!-- Section 1: Actores (Donor, Receiver, Purpose) -->
        <div class="bg-white shadow-md rounded-lg p-6 mb-6 border-t-4 border-institutional-blue">
            <h3 class="text-xl font-semibold text-institutional-blue mb-6">1. Identificar Actores</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <!-- Donor Searcher -->
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Donador <span class="text-red-500">*</span>
                    </label>
                    
                    <div v-if="selectedDonador" class="flex items-center justify-between bg-blue-50 p-4 rounded-md border-l-4 border-l-institutional-blue border border-blue-200">
                        <div>
                            <span class="block font-bold text-institutional-blue">{{ selectedDonador.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedDonador.identificador) }}</span>
                        </div>
                        <button @click="selectedDonador = null" class="text-gray-500 hover:text-gray-700 text-sm underline">
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
                    
                    <div v-if="selectedReceptor" class="flex items-center justify-between bg-green-50 p-4 rounded-md border-l-4 border-l-green-600 border border-green-200">
                        <div>
                            <span class="block font-bold text-green-700">{{ selectedReceptor.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedReceptor.identificador) }}</span>
                        </div>
                        <button @click="selectedReceptor = null" class="text-gray-500 hover:text-gray-700 text-sm underline">
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
        </div>

        <!-- Section 2: Item Management -->
        <div class="bg-white shadow-md rounded-lg p-6 mb-6 border-t-4 border-purple-600">
            <h3 class="text-xl font-semibold text-purple-700 mb-6">2. Gestión de Ítems</h3>
            
            <!-- Item Searcher -->
            <div class="relative mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Buscar Ítem del Catálogo
                </label>
                
                <div v-if="selectedItem" class="flex items-center justify-between bg-purple-50 p-4 rounded-md border-l-4 border-l-purple-600 border border-purple-200 mb-4">
                    <div>
                        <span class="block font-bold text-purple-700">{{ selectedItem.nombre }}</span>
                        <span class="text-sm text-gray-600">
                            Stock actual: {{ selectedItem.stockActual }} {{ selectedItem.unidadMedida }}
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
                                    Stock: {{ item.stockActual }} {{ item.unidadMedida }}
                                </p>
                            </li>
                        </ul>
                        <div v-else class="p-4 text-center text-gray-500 text-sm">
                            No se encontró el ítem. Debe crearse en la sección de Catálogo.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Item Form (Quantity & Price) -->
            <div v-if="selectedItem" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Cantidad <span class="text-red-500">*</span>
                    </label>
                    <input 
                        type="number" 
                        v-model.number="itemCantidad"
                        min="1"
                        step="1"
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Precio Estimado ($) <span class="text-red-500">*</span>
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
                        class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition"
                    >
                        ➕ Agregar
                    </button>
                </div>
            </div>
        </div>

        <!-- Section 3: Items Table -->
        <div v-if="items.length > 0" class="bg-white shadow rounded-lg p-6 mb-6">
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
                                <div class="text-xs text-gray-500">{{ item.unidadMedida }}</div>
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
                                    class="text-red-600 hover:text-red-800 font-medium"
                                >
                                    🗑️ Eliminar
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
                class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-md shadow-lg transition text-lg"
            >
                {{ submitting ? '⏳ Guardando...' : '📋 Registrar Donación de Bienes' }}
            </button>
        </div>
    </div>
</template>
