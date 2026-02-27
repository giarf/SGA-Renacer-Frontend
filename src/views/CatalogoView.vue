<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { CatalogoItem } from '../types';
import { apiService } from '../api/apiService';
import ModalEditarCatalogo from '../components/ModalEditarCatalogo.vue';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import { Plus, Pencil } from 'lucide-vue-next';

const items = ref<CatalogoItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');

const showEditModal = ref(false);
const showRegistroModal = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);

const cargarItems = async () => {
    loading.value = true;
    error.value = null;
    try {
        items.value = await apiService.getCatalogoItems();
    } catch (e: any) {
        error.value = e.message || 'Error al cargar items del catálogo';
    } finally {
        loading.value = false;
    }
};

const filteredItems = ref<CatalogoItem[]>([]);
const applyFilter = () => {
    if (!searchQuery.value) {
        filteredItems.value = items.value;
        return;
    }
    const query = searchQuery.value.toLowerCase();
    filteredItems.value = items.value.filter(item => 
        item.nombre.toLowerCase().includes(query) ||
        item.categoria.toLowerCase().includes(query)
    );
};

const abrirModalEditar = (item: CatalogoItem) => {
    selectedItem.value = item;
    showEditModal.value = true;
};

const abrirModalRegistro = () => {
    showRegistroModal.value = true;
};

const cerrarModalEditar = () => {
    showEditModal.value = false;
    selectedItem.value = null;
};

const cerrarModalRegistro = () => {
    showRegistroModal.value = false;
};

const onItemActualizado = () => {
    cargarItems();
    cerrarModalEditar();
};

const onItemCreado = () => {
    cargarItems();
    cerrarModalRegistro();
};

onMounted(() => {
    cargarItems();
});

// Watch for changes in items or searchQuery
import { watch } from 'vue';
watch([items, searchQuery], () => {
    applyFilter();
}, { immediate: true });
</script>

<template>
    <div class="max-w-7xl mx-auto py-8 px-4">
        <div class="flex justify-between items-center mb-8">
            <h2 class="text-3xl font-bold text-institutional-blue">Catálogo de Ítems</h2>
            <button 
                @click="abrirModalRegistro"
                class="btn btn-primary"
            >
                <Plus class="w-4 h-4" /> Nuevo ítem
            </button>
        </div>

        <!-- Search Bar -->
        <div class="mb-6">
            <input 
                v-model="searchQuery"
                type="text"
                placeholder="Buscar por nombre o categoría..."
                class="block w-full shadow-sm focus:ring-institutional-blue focus:border-institutional-blue sm:text-sm border-gray-300 rounded-md p-3 border"
            />
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p class="text-red-700">{{ error }}</p>
            <button @click="cargarItems" class="mt-2 text-sm font-medium text-red-700 underline">Reintentar</button>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
            <p class="text-gray-500">Cargando catálogo...</p>
        </div>

        <!-- Table -->
        <div v-else-if="filteredItems.length > 0" class="bg-white shadow overflow-hidden sm:rounded-lg">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nombre
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Categoría
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Unidad
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stock Actual
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Precio Ref.
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            PPM
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Valor Total
                        </th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Acciones
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="item in filteredItems" :key="item.id" class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="text-sm font-medium text-gray-900">{{ item.nombre }}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                {{ item.categoria }}
                            </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {{ item.unidadMedidaEstandar }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {{ item.stockActual }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${{ item.precioReferencia.toLocaleString('es-CL') }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${{ item.precioPromedioPonderado.toLocaleString('es-CL') }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                            ${{ item.valorTotalStock.toLocaleString('es-CL') }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button 
                                @click="abrirModalEditar(item)"
                                class="btn btn-outline px-3 py-1 text-sm"
                            >
                                <Pencil class="w-4 h-4" /> Editar
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
            <p class="text-gray-500">No se encontraron ítems en el catálogo.</p>
        </div>

        <!-- Modals -->
        <ModalEditarCatalogo 
            v-if="showEditModal && selectedItem"
            :item="selectedItem"
            @close="cerrarModalEditar"
            @updated="onItemActualizado"
        />
        
        <ModalRegistroCatalogo 
            v-if="showRegistroModal"
            @close="cerrarModalRegistro"
            @created="onItemCreado"
        />
    </div>
</template>
