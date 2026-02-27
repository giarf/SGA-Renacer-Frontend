<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import type { CatalogoItem, ActualizarCatalogoPayload } from '../types';
import { apiService } from '../api/apiService';
import { X } from 'lucide-vue-next';

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
        cat.toLowerCase().includes(query)
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
    submitting.value = true;
    error.value = null;
    
    try {
        await apiService.actualizarItemCatalogo(formData.value);
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
}, { immediate: true });

onMounted(() => {
    cargarCategorias();
});
</script>

<template>
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
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
                            class="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                        >
                            <button
                                v-for="categoria in filteredCategorias"
                                :key="categoria"
                                type="button"
                                @click="selectCategoria(categoria)"
                                class="w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer"
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
                        <label class="block text-sm font-medium text-gray-700 mb-1">
                            Precio de Referencia ($) <span class="text-red-500">*</span>
                        </label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span class="text-gray-500 sm:text-sm">$</span>
                            </div>
                            <input 
                                v-model.number="formData.precioReferencia"
                                type="number"
                                min="0"
                                step="1"
                                required
                                class="block w-full pl-7 shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                            />
                        </div>
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
</template>
