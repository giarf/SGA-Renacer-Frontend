<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { CatalogoItem } from '../types';
import { apiService } from '../api/apiService';
import ModalEditarCatalogo from '../components/ModalEditarCatalogo.vue';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import { Plus, Pencil, Search, ArrowUpDown, ArrowUp, ArrowDown, PackageSearch } from 'lucide-vue-next';

const items = ref<CatalogoItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');

type SortColumn = 'nombre' | 'categoria' | 'stockActual' | 'precioReferencia' | 'precioPromedioPonderado' | 'valorTotalStock';
type SortOrder = 'asc' | 'desc' | null;

const sortColumn = ref<SortColumn | null>(null);
const sortOrder = ref<SortOrder>(null);

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

const toggleSort = (column: SortColumn) => {
    if (sortColumn.value === column) {
        if (sortOrder.value === 'asc') sortOrder.value = 'desc';
        else if (sortOrder.value === 'desc') {
            sortColumn.value = null;
            sortOrder.value = null;
        }
    } else {
        sortColumn.value = column;
        sortOrder.value = 'asc';
    }
};

const filteredItems = computed(() => {
    let result = items.value;
    
    // Filter
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        result = result.filter(item => 
            item.nombre.toLowerCase().includes(query) ||
            item.categoria.toLowerCase().includes(query)
        );
    }
    
    // Sort
    if (sortColumn.value && sortOrder.value) {
        result = [...result].sort((a, b) => {
            const valA = a[sortColumn.value as keyof CatalogoItem];
            const valB = b[sortColumn.value as keyof CatalogoItem];
            
            let comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            }
            
            return sortOrder.value === 'asc' ? comparison : -comparison;
        });
    }
    
    return result;
});

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
</script>

<template>
    <div class="px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <!-- Header Section -->
        <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div class="mb-1 flex items-center gap-2">
                    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                        <PackageSearch class="h-5 w-5" />
                    </div>
                    <p class="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">Inventario</p>
                </div>
                <h1 class="text-2xl font-bold text-[var(--text-primary)]">Catálogo de Ítems</h1>
                <p class="text-sm text-[var(--text-muted)] mt-1">
                    Gestiona los artículos, productos y recursos valorizados de la fundación.
                </p>
            </div>
            <button class="btn btn-primary shadow-sm h-10 px-4" @click="abrirModalRegistro">
                <Plus class="h-4 w-4 mr-2" /> Nuevo ítem
            </button>
        </div>

        <!-- Filter & Search Bar -->
        <div class="mb-6 flex flex-col gap-4 sm:flex-row">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Buscar por nombre o categoría..."
                    class="compact-control w-full !pl-10 h-10"
                />
            </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
            <p class="text-red-700 dark:text-red-400 text-sm">{{ error }}</p>
            <button @click="cargarItems" class="mt-2 text-sm font-medium text-red-700 dark:text-red-400 hover:underline">Reintentar</button>
        </div>

        <!-- Main Card Container -->
        <div class="rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
            
            <!-- Loading State -->
            <div v-if="loading" class="flex flex-col items-center justify-center py-16">
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-[var(--card-border)] border-t-[var(--accent-color)] mb-4"></div>
                <p class="text-sm font-medium text-[var(--text-muted)]">Cargando catálogo...</p>
            </div>

            <!-- Table -->
            <div v-else-if="filteredItems.length > 0" class="overflow-x-auto">
                <table class="w-full text-left text-sm border-collapse">
                    <thead class="bg-[var(--surface-muted)] text-[var(--text-muted)] text-xs uppercase tracking-wider font-semibold border-b border-[var(--card-border)]">
                        <tr>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('nombre')">
                                <div class="flex items-center gap-1.5">
                                    Nombre
                                    <ArrowUp v-if="sortColumn === 'nombre' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'nombre' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('categoria')">
                                <div class="flex items-center gap-1.5">
                                    Categoría
                                    <ArrowUp v-if="sortColumn === 'categoria' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'categoria' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 text-[var(--text-muted)]">
                                Unidad
                            </th>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('stockActual')">
                                <div class="flex items-center gap-1.5 justify-end">
                                    Stock
                                    <ArrowUp v-if="sortColumn === 'stockActual' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'stockActual' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('precioReferencia')">
                                <div class="flex items-center gap-1.5 justify-end">
                                    Precio Ref.
                                    <ArrowUp v-if="sortColumn === 'precioReferencia' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'precioReferencia' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('precioPromedioPonderado')">
                                <div class="flex items-center gap-1.5 justify-end">
                                    PPM
                                    <ArrowUp v-if="sortColumn === 'precioPromedioPonderado' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'precioPromedioPonderado' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 cursor-pointer hover:text-[var(--text-primary)] transition-colors group select-none" @click="toggleSort('valorTotalStock')">
                                <div class="flex items-center gap-1.5 justify-end">
                                    Valor Total
                                    <ArrowUp v-if="sortColumn === 'valorTotalStock' && sortOrder === 'asc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowDown v-else-if="sortColumn === 'valorTotalStock' && sortOrder === 'desc'" class="w-3.5 h-3.5 text-[var(--accent-color)]" />
                                    <ArrowUpDown v-else class="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                                </div>
                            </th>
                            <th class="px-5 py-4 text-center">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--card-border)]">
                        <tr v-for="item in filteredItems" :key="item.id" class="hover:bg-[var(--surface-hover)] transition-colors duration-150">
                            <td class="px-5 py-3">
                                <div class="font-medium text-[var(--text-primary)]">{{ item.nombre }}</div>
                            </td>
                            <td class="px-5 py-3">
                                <span class="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                                    {{ item.categoria }}
                                </span>
                            </td>
                            <td class="px-5 py-3 text-[var(--text-muted)]">
                                {{ item.unidadMedidaEstandar }}
                            </td>
                            <td class="px-5 py-3 text-right">
                                <span class="font-medium" :class="item.stockActual > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'">
                                    {{ item.stockActual }}
                                </span>
                            </td>
                            <td class="px-5 py-3 text-[var(--text-primary)] text-right">
                                ${{ item.precioReferencia.toLocaleString('es-CL') }}
                            </td>
                            <td class="px-5 py-3 text-[var(--text-muted)] text-right">
                                ${{ item.precioPromedioPonderado.toLocaleString('es-CL') }}
                            </td>
                            <td class="px-5 py-3 font-semibold text-[var(--text-primary)] text-right">
                                ${{ item.valorTotalStock.toLocaleString('es-CL') }}
                            </td>
                            <td class="px-5 py-3 text-center">
                                <button 
                                    @click="abrirModalEditar(item)"
                                    class="p-2 text-[var(--text-muted)] hover:text-[var(--accent-color)] hover:bg-[var(--accent-color)]/10 rounded-lg transition-colors inline-flex items-center justify-center"
                                    title="Editar"
                                >
                                    <Pencil class="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Empty State -->
            <div v-else class="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div class="h-12 w-12 rounded-2xl bg-[var(--surface-muted)] flex items-center justify-center mb-4 border border-[var(--card-border)]">
                    <Search class="h-6 w-6 text-[var(--text-muted)]" />
                </div>
                <h3 class="text-base font-semibold text-[var(--text-primary)] mb-1">No hay resultados</h3>
                <p class="text-sm text-[var(--text-muted)] max-w-sm">No se encontraron ítems en el catálogo que coincidan con tu búsqueda.</p>
            </div>
            
            <div class="border-t border-[var(--card-border)] bg-[var(--surface-muted)]/30 px-5 py-3">
                <p class="text-xs text-[var(--text-muted)]">
                    Mostrando {{ filteredItems.length }} ítem(s) de un total de {{ items.length }}
                </p>
            </div>
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
