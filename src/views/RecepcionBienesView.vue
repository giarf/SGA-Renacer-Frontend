<script setup lang="ts">
import EntidadSelector from '../components/EntidadSelector.vue';
import { ref, computed, watch } from 'vue';
import type { EntidadResumen, CatalogoItem, DonacionBienesPayload, LineaEscaneada } from '../types';
import { apiService } from '../api/apiService';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import EscanerCodigos from '../components/EscanerCodigos.vue';
import { Trash2, ClipboardList, Loader2, Plus, ScanBarcode } from 'lucide-vue-next';
import { fusionarLinea } from '../utils/barcode';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../utils/formDraft';
import { integerFromInput } from '../utils/integerInput';
import InlineDateControl from '../components/InlineDateControl.vue';
import CantidadStepper from '../components/CantidadStepper.vue';
import { errorCantidad } from '../utils/cantidad';

// Debounce utility
const today = new Date().toISOString().split('T')[0] ?? '';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debounce = (fn: Function, delay: number) => {
    return (...args: any[]) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), delay);
    };
};

// Personas del formulario (los buscadores viven en EntidadSelector)
const selectedDonador = ref<EntidadResumen | null>(null);
const resolvingReceptor = ref(false);
const selectedReceptor = ref<EntidadResumen | null>(null);

// State for purpose / notes
const proposito = ref('');
const anotaciones = ref('');
const fechaIngreso = ref(today);

const selectedGestor = ref<EntidadResumen | null>(null);

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
const showEscaner = ref(false);

// Local items list (before submission)
interface LocalItem {
    itemCatalogoId?: number;
    nombre: string;
    categoria: string;
    unidad: string;
    cantidad: number;
    precio: number;
    codigoBarras?: string;
}
const items = ref<LocalItem[]>([]);

// State for submission
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);
const draftReady = ref(false);
const draftKey = 'draft:operacion-diaria:donacion-bienes';

// Computed total
const montoTotal = computed(() => {
    return items.value.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);
});

// Search methods
const loadCurrentResponsible = async () => {
    selectedReceptor.value = null;
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

const selectItem = (item: CatalogoItem) => {
    selectedItem.value = item;
    // Auto-fill with reference price (editable)
    itemPrecio.value = item.precioReferencia;
    itemQuery.value = '';
    showItemDropdown.value = false;
    itemQuery.value = '';
    showItemDropdown.value = false;
};

type DonationItemsDraft = {
    selectedDonador: EntidadResumen | null;
    proposito: string;
    anotaciones: string;
    fechaIngreso: string;
    selectedGestor: EntidadResumen | null;
    items: LocalItem[];
};

const restoreDraft = () => {
    const draft = loadFormDraft<DonationItemsDraft>(draftKey);
    if (!draft) return;
    selectedDonador.value = draft.selectedDonador;
    proposito.value = draft.proposito;
    anotaciones.value = draft.anotaciones;
    fechaIngreso.value = draft.fechaIngreso;
    selectedGestor.value = draft.selectedGestor;
    items.value = draft.items ?? [];
};

const persistDraft = () => {
    if (!draftReady.value) return;
    saveFormDraft(draftKey, {
        selectedDonador: selectedDonador.value,
        proposito: proposito.value,
        anotaciones: anotaciones.value,
        fechaIngreso: fechaIngreso.value,
        selectedGestor: selectedGestor.value,
        items: items.value
    } satisfies DonationItemsDraft);
};

const handleCatalogoCreado = () => {
    // Retry search if there was a query, otherwise just close
    if (itemQuery.value && itemQuery.value.length >= 2) {
        searchItems(itemQuery.value);
    }
    showModalRegistroCatalogo.value = false;
};

const openCatalogoModal = () => {
    showItemDropdown.value = false;
    showModalRegistroCatalogo.value = true;
};

// Add item to local list
const addItemToList = () => {
    const errorItem = selectedItem.value ? errorCantidad(itemCantidad.value, selectedItem.value.unidadMedidaEstandar) : null;
    if (!selectedItem.value || errorItem || itemPrecio.value <= 0) {
        message.value = { type: 'error', text: errorItem || 'Debe seleccionar un ítem y especificar cantidad y precio válidos.' };
        return;
    }

    items.value.push({
        itemCatalogoId: selectedItem.value.id,
        cantidad: itemCantidad.value,
        precio: itemPrecio.value,
        nombre: selectedItem.value.nombre,
        categoria: selectedItem.value.categoria || 'Sin categoría',
        unidad: selectedItem.value.unidadMedidaEstandar || 'unidad',
        codigoBarras: selectedItem.value.codigoBarras || undefined
    });

    // Reset item form
    selectedItem.value = null;
    itemCantidad.value = 1;
    itemPrecio.value = 0;
    message.value = null;
};

// Lectura del escáner: entra a la misma lista; si el código ya está, suma cantidad.
const agregarEscaneado = (linea: LineaEscaneada) => {
    items.value = fusionarLinea(items.value, { ...linea }).lista;
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
    const lineaInvalida = items.value.find(item => errorCantidad(item.cantidad, item.unidad) || !(item.precio > 0));
    if (lineaInvalida) {
        message.value = { type: 'error', text: `${lineaInvalida.nombre}: ${errorCantidad(lineaInvalida.cantidad, lineaInvalida.unidad) || 'el precio debe ser mayor a cero.'}` };
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
            propositoEspecifico: proposito.value.trim() || undefined,
            gestorId: selectedGestor.value?.id
        },
        items: items.value.map(item => ({
            itemCatalogoId: item.itemCatalogoId,
            nombre: item.nombre,
            categoria: item.categoria,
            unidad: item.unidad,
            cantidad: item.cantidad,
            precio: item.precio,
            codigoBarras: item.codigoBarras || undefined
        }))
    };

    try {
        const result = await apiService.registrarDonacionBienes(payload);
        message.value = { 
            type: 'success', 
            text: `Donación registrada exitosamente. ID de ingreso: ${result.id_ingreso}` 
        };
        
        // Reset form
        clearFormDraft(draftKey);
        selectedDonador.value = null;
        if (canChangeResponsible.value) selectedReceptor.value = null;
        proposito.value = '';
        anotaciones.value = '';
        selectedGestor.value = null;
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

watch([selectedDonador, selectedReceptor, proposito, anotaciones, fechaIngreso, selectedGestor, items], persistDraft, { deep: true });

loadCurrentResponsible().finally(() => {
    restoreDraft();
    draftReady.value = true;
});
</script>

<template>
    <div class="space-y-4">

        <div 
            v-if="message" 
            :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']"
        >
            {{ message.text }}
        </div>

        <div class="form-shell">
        <div class="form-shell-header flex items-center justify-between gap-3 border-b px-5 py-3">
            <h3 class="text-base font-semibold text-[var(--text-primary)]">Donación en especie</h3>
            <InlineDateControl v-model="fechaIngreso" label="Fecha recepción" />
        </div>

        <!-- Section 1: Actores (Donor, Receiver, Purpose) -->
        <section class="form-section">
            <h4 class="form-section-title">1 · Actores</h4>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <EntidadSelector v-model="selectedDonador" label="Donador" required crear-persona />

                <EntidadSelector
                    v-model="selectedReceptor"
                    label="Responsable interno"
                    required
                    :locked="!canChangeResponsible || resolvingReceptor"
                    locked-hint="Asignado automáticamente desde Authentik"
                >
                    <template #locked-empty>
                        <span v-if="resolvingReceptor">Resolviendo responsable interno...</span>
                        <span v-else class="text-red-600">No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.</span>
                    </template>
                </EntidadSelector>
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
                <EntidadSelector v-model="selectedGestor" label="Gestor / Responsable (opcional)" />

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
        </section>

        <!-- Section 2: Item Management -->
        <section class="form-section">
            <h4 class="form-section-title">2 · Ítems</h4>
            
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
                    <div class="flex gap-2">
                        <input 
                            type="text" 
                            v-model="itemQuery"
                            @input="searchItems(itemQuery)"
                            @focus="showItemDropdown = true"
                            placeholder="Buscar por nombre o categoría..."
                            class="compact-control flex-1"
                        />
                        <button type="button" class="btn-secondary h-10 shrink-0 px-3" @click="showItemDropdown = false; showEscaner = true">
                            <ScanBarcode class="h-4 w-4" /> Escanear
                        </button>
                    </div>
                    
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
                                    @click="openCatalogoModal"
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
                        Precio por {{ selectedItem.unidadMedidaEstandar || 'unidad' }} <span class="text-red-500">*</span>
                    </label>
                    <input 
                        :value="itemPrecio"
                        type="text"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        class="compact-control"
                        @input="itemPrecio = integerFromInput($event)"
                    />
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
        </section>

        <!-- Section 3: Items Table -->
        <section v-if="items.length > 0" class="form-section !pb-0">
            <h4 class="form-section-title">3 · Agregados</h4>

            <div class="flat-table">
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
                                <div class="text-xs text-gray-500">{{ item.categoria }} • {{ item.unidad }}<span v-if="item.codigoBarras" class="font-mono"> • {{ item.codigoBarras }}</span></div>
                            </td>
                            <td class="px-4 py-2 whitespace-nowrap">
                                <CantidadStepper v-model="item.cantidad" :unidad="item.unidad" />
                                <p v-if="errorCantidad(item.cantidad, item.unidad)" class="mt-1 text-xs text-red-600">{{ errorCantidad(item.cantidad, item.unidad) }}</p>
                            </td>
                            <td class="px-4 py-2 whitespace-nowrap">
                                <input
                                    :value="item.precio"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    aria-label="Precio unitario"
                                    class="compact-control w-28"
                                    :class="{ '!border-red-400': !(item.precio > 0) }"
                                    @input="item.precio = integerFromInput($event)"
                                />
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
                    <tfoot class="bg-[var(--surface-muted)]">
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
        </section>

        <!-- Section 4: Submit Button -->
        <div class="form-section flex justify-end">
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
    </div>

    <EscanerCodigos
        v-if="showEscaner"
        @agregar="agregarEscaneado"
        @close="showEscaner = false"
    />

    <ModalRegistroCatalogo 
        v-if="showModalRegistroCatalogo"
        @close="showModalRegistroCatalogo = false" 
        @created="handleCatalogoCreado"
    />
</template>
