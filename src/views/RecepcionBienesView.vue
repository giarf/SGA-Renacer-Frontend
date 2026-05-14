<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EntidadResumen, CatalogoItem, DonacionBienesPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import { Trash2, ClipboardList, Loader2, Plus } from 'lucide-vue-next';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';

// Debounce utility
const today = new Date().toISOString().split('T')[0] ?? '';

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
const resolvingReceptor = ref(false);
const showReceptorDropdown = ref(false);
const selectedReceptor = ref<EntidadResumen | null>(null);

// State for purpose / notes
const proposito = ref('');
const anotaciones = ref('');
const fechaIngreso = ref(today);

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

const loadCurrentResponsible = async () => {
    resolvingReceptor.value = true;
    try {
        selectedReceptor.value = await resolveCurrentResponsible();
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudo resolver el responsable interno.' };
    } finally {
        resolvingReceptor.value = false;
    }
};

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
            fecha: fechaIngreso.value,
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
        if (canChangeResponsible.value) selectedReceptor.value = null;
        proposito.value = '';
        anotaciones.value = '';
        selectedGestor.value = null;
        gestorQuery.value = '';
        gestorResults.value = [];
        fechaIngreso.value = today;
        items.value = [];
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
        message.value = { type: 'error', text: `Error al registrar donación: ${e.message}` };
    } finally {
        submitting.value = false;
    }
};

loadCurrentResponsible();
</script>

<template>
    <div class="form-page space-y-4">
        <div class="form-shell px-5 py-4">
            <p class="eyebrow text-[var(--accent-color)]">Recepción</p>
            <h2 class="text-lg font-semibold text-[var(--text-primary)]">Donaciones no pecuniarias</h2>
            <p class="max-w-3xl text-xs text-[var(--text-muted)]">Identifica actores, detalla el propósito y registra cada ítem valorizado.</p>
        </div>

        <div 
            v-if="message" 
            :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']"
        >
            {{ message.text }}
        </div>

        <!-- Section 1: Actores (Donor, Receiver, Purpose) -->
        <div class="form-shell p-5">
            <h3 class="mb-3 text-base font-semibold text-[var(--text-primary)]">1. Identificar actores</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Fecha de recepción <span class="text-red-500">*</span>
                    </label>
                    <input
                        type="date"
                        v-model="fechaIngreso"
                        class="compact-control"
                        required
                    />
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <!-- Donor Searcher -->
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Donador <span class="text-red-500">*</span>
                    </label>
                    
                    <div v-if="selectedDonador" class="selected-card flex flex-col gap-2 p-3">
                        <div>
                            <span class="block font-bold text-institutional-blue">{{ selectedDonador.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedDonador.identificador) }}</span>
                        </div>
                        <button type="button" @click="selectedDonador = null" class="self-start text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]">
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
                            class="compact-control"
                        />
                        
                        <!-- Dropdown -->
                        <div v-if="showDonadorDropdown && donadorQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-60 w-full overflow-auto">
                            <div v-if="loadingDonador" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="donadorResults.length > 0">
                                <li 
                                    v-for="entidad in donadorResults" 
                                    :key="entidad.id"
                                    @click="selectDonador(entidad)"
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

                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Responsable interno <span class="text-red-500">*</span>
                    </label>
                    
                    <div v-if="selectedReceptor" class="selected-card flex flex-col gap-2 p-3">
                        <div>
                            <span class="block font-bold text-green-700">{{ selectedReceptor.nombreCompleto }}</span>
                            <span class="text-sm text-gray-600">{{ formatRutForDisplay(selectedReceptor.identificador) }}</span>
                            <span v-if="!canChangeResponsible" class="block text-xs text-gray-500 mt-1">Asignado automáticamente desde Authentik</span>
                        </div>
                        <button v-if="canChangeResponsible" type="button" @click="selectedReceptor = null" class="self-start text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]">
                            Cambiar
                        </button>
                    </div>

                    <div v-else-if="resolvingReceptor" class="form-panel-muted p-4 text-sm text-[var(--text-muted)]">
                        Resolviendo responsable interno...
                    </div>

                    <div v-else>
                        <input 
                            v-if="canChangeResponsible"
                            type="text" 
                            v-model="receptorQuery"
                            @input="searchReceptor(receptorQuery)"
                            @focus="showReceptorDropdown = true"
                            placeholder="Buscar por nombre o RUT..."
                            class="compact-control"
                        />
                        <div v-else class="message-banner message-error">
                            No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.
                        </div>
                        
                        <!-- Dropdown -->
                        <div v-if="showReceptorDropdown && receptorQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-60 w-full overflow-auto">
                            <div v-if="loadingReceptor" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="receptorResults.length > 0">
                                <li 
                                    v-for="entidad in receptorResults" 
                                    :key="entidad.id"
                                    @click="selectReceptor(entidad)"
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
                    class="compact-control"
                />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Gestor / Responsable (opcional)
                    </label>

                    <div v-if="selectedGestor" class="selected-card flex flex-col gap-2 p-3">
                        <div>
                            <p class="font-semibold text-amber-900">{{ selectedGestor.nombreCompleto }}</p>
                            <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</p>
                        </div>
                        <button type="button" @click="clearGestor" class="self-start text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]">
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
                            class="compact-control"
                        />

                        <div v-if="showGestorDropdown && gestorQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-60 w-full overflow-auto">
                            <div v-if="loadingGestor" class="p-4 text-center text-gray-500">
                                Buscando...
                            </div>
                            <ul v-else-if="gestorResults.length > 0">
                                <li 
                                    v-for="entidad in gestorResults" 
                                    :key="entidad.id"
                                    @click="selectGestor(entidad)"
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
                        class="compact-control"
                    ></textarea>
                </div>
            </div>
        </div>

        <!-- Section 2: Item Management -->
        <div class="form-shell p-5">
            <h3 class="mb-4 text-base font-semibold text-[var(--text-primary)]">2. Gestión de ítems</h3>
            
            <!-- Item Searcher -->
            <div class="relative mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Buscar Ítem del Catálogo
                </label>
                
                <div v-if="selectedItem" class="selected-card mb-4 flex items-center justify-between p-4">
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
                        class="compact-control"
                    />
                    
                    <!-- Dropdown -->
                    <div v-if="showItemDropdown && itemQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-60 w-full overflow-auto">
                        <div v-if="loadingItems" class="p-4 text-center text-gray-500">
                            Buscando ítems...
                        </div>
                        <ul v-else-if="itemResults.length > 0">
                            <li 
                                v-for="item in itemResults" 
                                :key="item.id"
                                @click="selectItem(item)"
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
                        class="compact-control"
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
                            class="compact-control pl-7"
                        />
                    </div>
                </div>
                <div class="flex items-end">
                            <button 
                                @click="addItemToList"
                                class="btn-primary h-10 w-full"
                            >
                                Agregar ítem
                    </button>
                </div>
            </div>
        </div>

        <!-- Section 3: Items Table -->
        <div v-if="items.length > 0" class="form-shell p-4">
            <h3 class="mb-3 text-base font-semibold text-[var(--text-primary)]">3. Ítems Agregados</h3>
            
            <div class="overflow-x-auto rounded-md border border-[var(--card-border)]">
                <table class="min-w-full divide-y divide-[var(--card-border)]">
                    <thead class="bg-[var(--surface-muted)]">
                        <tr>
                            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Ítem
                            </th>
                            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Cantidad
                            </th>
                            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Precio Unit.
                            </th>
                            <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Subtotal
                            </th>
                            <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--card-border)] bg-[var(--bg-card)]">
                        <tr v-for="(item, index) in items" :key="index">
                            <td class="px-4 py-2.5 whitespace-nowrap">
                                <div class="text-sm font-medium text-gray-900">{{ item.nombre }}</div>
                                <div class="text-xs text-gray-500">{{ item.categoria }} • {{ item.unidad }}</div>
                            </td>
                            <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-900">
                                {{ item.cantidad }}
                            </td>
                            <td class="px-4 py-2.5 whitespace-nowrap text-sm text-gray-900">
                                ${{ item.precio.toLocaleString('es-CL') }}
                            </td>
                            <td class="px-4 py-2.5 whitespace-nowrap text-sm font-semibold text-gray-900">
                                ${{ (item.cantidad * item.precio).toLocaleString('es-CL') }}
                            </td>
                            <td class="px-4 py-2.5 whitespace-nowrap text-right">
                                <button 
                                    @click="removeItem(index)"
                                    class="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs font-medium"
                                >
                                    <Trash2 class="w-3.5 h-3.5" /> Eliminar
                                </button>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot class="bg-gray-50">
                        <tr>
                            <td colspan="3" class="px-4 py-2.5 text-right text-sm font-bold text-gray-900">
                                Total General:
                            </td>
                            <td class="px-4 py-2.5 text-sm font-bold text-institutional-blue">
                                ${{ montoTotal.toLocaleString('es-CL') }}
                            </td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>

        <!-- Section 4: Submit Button -->
        <div class="flex justify-end border-t border-[var(--card-border)] pt-4">
                <button 
                    @click="submitDonacion"
                    :disabled="submitting"
                    class="btn-primary h-10 px-8 disabled:opacity-50"
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
