<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { RegistrarCatalogoPayload } from '../types';
import { apiService } from '../api/apiService';
import { X, Info, CheckCircle2 } from 'lucide-vue-next';

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'created'): void
}>();

// State
const categorias = ref<string[]>([]);
const loadingCategorias = ref(false);
const showSuggestions = ref(false);


const formData = ref<RegistrarCatalogoPayload>({
    nombre: '',
    categoria: '',
    unidadMedidaEstandar: '',
    precioReferencia: 0
});

const submitting = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

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
    success.value = false;
    
    try {
        await apiService.registrarItemCatalogo(formData.value);
        success.value = true;
        
        // Wait a bit to show success message, then emit
        setTimeout(() => {
            emit('created');
        }, 800);
    } catch (e: any) {
        error.value = e.message || 'Error al registrar el item';
    } finally {
        submitting.value = false;
    }
};



onMounted(() => {
    cargarCategorias();
});
</script>

<template>
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h3 class="text-xl font-semibold text-gray-900">Registrar Nuevo Item al Catálogo</h3>
                <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
                    <X class="w-6 h-6" />
                </button>
            </div>

            <!-- Success Message -->
            <div v-if="success" class="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
                <CheckCircle2 class="w-5 h-5 text-green-600" />
                <p class="text-sm text-green-700 font-medium">Ítem registrado exitosamente</p>
            </div>

            <!-- Error Message -->
            <div v-if="error" class="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p class="text-sm text-red-700">{{ error }}</p>
            </div>

            <!-- Form -->
            <form @submit.prevent="submitForm" class="p-6 space-y-6">
                <!-- Info Notice -->
                <div class="bg-blue-50 p-4 rounded-md border border-blue-200 flex items-center gap-3">
                    <Info class="w-5 h-5 text-blue-600" />
                    <p class="text-sm text-blue-700">
                        Los campos Stock Actual, Precio Promedio Ponderado y Valor Total Stock se inicializarán automáticamente en 0.
                    </p>
                </div>

                <!-- Nombre -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Nombre <span class="text-red-500">*</span>
                    </label>
                    <input 
                        v-model="formData.nombre"
                        type="text"
                        required
                        placeholder="Ej: Arroz Grano Largo"
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
                        placeholder="Ej: Kg, L, Unidad, Caja"
                        class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                    />
                    <p class="mt-1 text-xs text-gray-500">Esta unidad se usará en todas las operaciones con este item.</p>
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
                            placeholder="0"
                            class="block w-full pl-7 shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                    </div>
                    <p class="mt-1 text-xs text-gray-500">Precio de referencia para valorización inicial del item.</p>
                </div>

                <!-- Actions -->
                <div class="flex justify-end gap-3 pt-4 border-t">
                    <button 
                        type="button"
                        @click="emit('close')"
                        :disabled="submitting"
                        class="btn btn-ghost border border-gray-200 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit"
                        :disabled="submitting || success"
                        class="btn btn-primary disabled:opacity-50"
                    >
                        {{ submitting ? 'Registrando...' : success ? 'Registrado' : 'Registrar ítem' }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>
