<script setup lang="ts">
import { matchesSearch } from '../utils/search';
import { ref, onMounted, watch, computed } from 'vue';
import type { CatalogoItem, ActualizarCatalogoPayload } from '../types';
import { apiService } from '../api/apiService';
import { X, ScanBarcode } from 'lucide-vue-next';
import EscanerCodigos from './EscanerCodigos.vue';
import { esCodigoValido } from '../utils/barcode';
import { integerFromInput } from '../utils/integerInput';

const props = defineProps<{
    item: CatalogoItem
}>();

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'updated'): void
}>();

// State
const categorias = ref<string[]>([]);
const loadingCategorias = ref(false);
const showSuggestions = ref(false);


const formData = ref<ActualizarCatalogoPayload>({
    id: props.item.id,
    nombre: props.item.nombre,
    categoria: props.item.categoria,
    unidadMedidaEstandar: props.item.unidadMedidaEstandar,
    precioReferencia: props.item.precioReferencia
});

const codigoBarras = ref(props.item.codigoBarras ?? '');

const showEscaner = ref(false);
const codigoError = computed(() => {
    const codigo = codigoBarras.value.trim();
    return codigo && !esCodigoValido(codigo) ? 'Código inválido: revisa los dígitos (8, 12 o 13 con verificador correcto).' : null;
});

const precioReferenciaFecha = computed(() => {
    const iso = props.item.precioReferenciaFecha;
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-');
    return y && m && d ? `${d}-${m}-${y}` : iso;
});

const submitting = ref(false);
const error = ref<string | null>(null);

// Load categories
const cargarCategorias = async () => {
    loadingCategorias.value = true;
    try {
        categorias.value = await apiService.getCategorias();
    } catch (e) {
        console.error('Error loading categories:', e);
        categorias.value = [];
    } finally {
        loadingCategorias.value = false;
    }
};

// Filter categories based on input
const filteredCategorias = computed(() => {
    if (!formData.value.categoria) return categorias.value;
    const query = formData.value.categoria.toLowerCase();
    return categorias.value.filter(cat => 
        matchesSearch(query, cat)
    );
});

const selectCategoria = (categoria: string) => {
    formData.value.categoria = categoria;
    showSuggestions.value = false;
};

const onCategoriaFocus = () => {
    showSuggestions.value = true;
};

const onCategoriaBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
        showSuggestions.value = false;
    }, 200);
};

const submitForm = async () => {
    if (codigoError.value) return;
    submitting.value = true;
    error.value = null;
    
    try {
        await apiService.actualizarItemCatalogo({ ...formData.value, codigoBarras: codigoBarras.value.trim() || null });
        emit('updated');
    } catch (e: any) {
        error.value = e.message || 'Error al actualizar el item';
    } finally {
        submitting.value = false;
    }
};

// Reset form on item change
watch(() => props.item, (newItem) => {
    formData.value = {
        id: newItem.id,
        nombre: newItem.nombre,
        categoria: newItem.categoria,
        unidadMedidaEstandar: newItem.unidadMedidaEstandar,
        precioReferencia: newItem.precioReferencia
    };
    codigoBarras.value = newItem.codigoBarras ?? '';
}, { immediate: true });

onMounted(() => {
    cargarCategorias();
});
</script>

<template>
    <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1100] p-4">
        <div class="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl border border-[var(--card-border)] shadow-[var(--shadow-soft)] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-[var(--card-border)] flex justify-between items-center sticky top-0 z-10 bg-[var(--bg-card)]">
                <h3 class="text-xl font-semibold text-gray-900">Editar Item del Catálogo</h3>
                <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Error Message -->
            <div v-if="error" class="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p class="text-sm text-red-700">{{ error }}</p>
            </div>

            <!-- Form -->
            <form @submit.prevent="submitForm" class="p-6 space-y-6">
                <!-- Read-only fields section -->
                <div class="bg-gray-50 p-4 rounded-md border border-gray-200">
                    <h4 class="text-sm font-semibold text-gray-700 uppercase mb-3">Información de Solo Lectura</h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Stock Actual</label>
                            <input 
                                type="text" 
                                :value="item.stockActual" 
                                disabled 
                                class="block w-full bg-gray-100 border-gray-300 text-gray-500 rounded-md p-2 text-sm cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Precio Promedio Ponderado</label>
                            <input 
                                type="text" 
                                :value="'$' + item.precioPromedioPonderado.toLocaleString('es-CL')" 
                                disabled 
                                class="block w-full bg-gray-100 border-gray-300 text-gray-500 rounded-md p-2 text-sm cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Valor Total Stock</label>
                            <input 
                                type="text" 
                                :value="'$' + item.valorTotalStock.toLocaleString('es-CL')" 
                                disabled 
                                class="block w-full bg-gray-100 border-gray-300 text-gray-500 rounded-md p-2 text-sm cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>

                <!-- Editable fields section -->
                <div class="space-y-4">
                    <h4 class="text-sm font-semibold text-gray-700 uppercase">Campos Editables</h4>
                    
                    <!-- Nombre -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Nombre <span class="text-red-500">*</span>
                        </label>
                        <input 
                            v-model="formData.nombre"
                            type="text"
                            required
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                    </div>

                <!-- Código de barras -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1" for="catalogo-codigo">Código de barras</label>
                        <div class="flex gap-2">
                            <input
                                id="catalogo-codigo"
                                v-model="codigoBarras"
                                type="text"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                maxlength="13"
                                autocomplete="off"
                                placeholder="EAN-13, EAN-8 o UPC-A (opcional)"
                                class="compact-control flex-1 font-mono"
                            />
                            <button type="button" class="btn-secondary h-10 shrink-0 px-3" @click="showEscaner = true">
                                <ScanBarcode class="h-4 w-4" /> Escanear
                            </button>
                        </div>
                        <p v-if="codigoError" class="mt-1 text-xs text-red-600">{{ codigoError }}</p>
                    </div>

                    <!-- Categoría -->
                    <div class="relative">
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Categoría <span class="text-red-500">*</span>
                        </label>
                        <input 
                        v-model="formData.categoria"
                            type="text"
                            required
                            placeholder="Escribe o selecciona una categoría"
                            @focus="onCategoriaFocus"
                            @blur="onCategoriaBlur"
                            class="block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                        <!-- Suggestions dropdown -->
                        <div 
                            v-if="showSuggestions && filteredCategorias.length > 0"
                            class="dropdown-panel absolute z-10 mt-1 max-h-60 w-full overflow-auto text-sm"
                        >
                            <button
                                v-for="categoria in filteredCategorias"
                                :key="categoria"
                                type="button"
                                @click="selectCategoria(categoria)"
                            >
                                {{ categoria }}
                            </button>
                        </div>
                        <p class="mt-1 text-xs text-gray-500">
                            Puedes escribir una nueva categoría o seleccionar una existente
                        </p>
                    </div>

                    <!-- Unidad de Medida -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Unidad de Medida Estándar <span class="text-red-500">*</span>
                        </label>
                        <input 
                            v-model="formData.unidadMedidaEstandar"
                            type="text"
                            required
                            placeholder="Ej: Kg, L, Unidad"
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                    </div>

                    <!-- Precio de Referencia -->
                    <div>
                        <label class="flex items-baseline justify-between gap-2 text-sm font-medium text-gray-700 mb-1">
                            <span>Precio de Referencia <span class="text-red-500">*</span></span>
                            <span v-if="precioReferenciaFecha" class="text-xs font-normal text-[var(--text-muted)]">al {{ precioReferenciaFecha }}</span>
                        </label>
                        <input 
                            :value="formData.precioReferencia"
                            type="text"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            required
                            class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                            @input="formData.precioReferencia = integerFromInput($event)"
                        />
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button 
                        type="button"
                        @click="emit('close')"
                        class="btn btn-ghost border border-gray-200"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit"
                        :disabled="submitting"
                        class="btn btn-primary disabled:opacity-50"
                    >
                        {{ submitting ? 'Guardando...' : 'Guardar cambios' }}
                    </button>
                </div>
            </form>
        </div>
    </div>
    <EscanerCodigos v-if="showEscaner" modo="unico" titulo="Escanear código del ítem" @codigo="codigoBarras = $event" @close="showEscaner = false" />
</template>
