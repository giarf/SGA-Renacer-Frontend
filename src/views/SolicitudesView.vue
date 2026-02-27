<script setup lang="ts">
import { ref } from 'vue';
import type { EntidadResumen, CatalogoItem, SolicitudPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import ModalRegistroCatalogo from '../components/ModalRegistroCatalogo.vue';
import { Plus, Trash2, Send } from 'lucide-vue-next';

type DraftItem = {
    id: number;
    itemCatalogoId: number | null;
    nombre: string;
    descripcionManual: string | null;
    cantidadRequerida: number;
};

const today = new Date().toISOString().split('T')[0];

const solicitante = ref<EntidadResumen | null>(null);
const solicitanteQuery = ref('');
const solicitanteResults = ref<EntidadResumen[]>([]);
const solicitanteLoading = ref(false);
const showSolicitanteDropdown = ref(false);

const programa = ref('');
const fechaSolicitud = ref(today);
const horaSolicitud = ref('10:00');

const items = ref<DraftItem[]>([]);

const catalogQuery = ref('');
const catalogResults = ref<CatalogoItem[]>([]);
const catalogLoading = ref(false);
const showCatalogDropdown = ref(false);
const selectedCatalogItem = ref<CatalogoItem | null>(null);
const cantidadCatalog = ref(1);

const manualDescripcion = ref('');
const cantidadManual = ref(1);

const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const showCrearPersonaModal = ref(false);
const showCatalogoModal = ref(false);

const debounce = (fn: (...args: any[]) => void, delay = 300) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 4000);
};

const handlePersonaCreada = async (rut: string) => {
    showCrearPersonaModal.value = false;
    try {
        const resultados = await apiService.buscarEntidades(rut);
        const encontrada = resultados.find(e => e.identificador === rut);
        if (encontrada) {
            solicitante.value = encontrada;
            showToast('success', 'Persona registrada y seleccionada.');
        } else {
            showToast('error', 'Persona creada pero no encontrada automáticamente, búscala nuevamente.');
        }
    } catch (e: any) {
        showToast('error', e.message || 'Error al buscar la nueva persona.');
    }
};

const handleCatalogoCreado = () => {
    showCatalogoModal.value = false;
    if (catalogQuery.value.length >= 2) {
        searchCatalogo(catalogQuery.value);
    }
};

const searchSolicitantes = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        solicitanteResults.value = [];
        return;
    }
    solicitanteLoading.value = true;
    try {
        solicitanteResults.value = await apiService.buscarEntidades(query);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron buscar solicitantes.');
    } finally {
        solicitanteLoading.value = false;
    }
});

const searchCatalogo = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        catalogResults.value = [];
        return;
    }
    catalogLoading.value = true;
    try {
        catalogResults.value = await apiService.buscarCatalogo(query);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo buscar en el catálogo.');
    } finally {
        catalogLoading.value = false;
    }
});

const addCatalogItem = () => {
    if (!selectedCatalogItem.value) {
        showToast('error', 'Selecciona un ítem del catálogo.');
        return;
    }
    items.value.push({
        id: Date.now(),
        itemCatalogoId: selectedCatalogItem.value.id,
        nombre: selectedCatalogItem.value.nombre,
        descripcionManual: null,
        cantidadRequerida: cantidadCatalog.value
    });
    selectedCatalogItem.value = null;
    catalogQuery.value = '';
    cantidadCatalog.value = 1;
};

const addManualItem = () => {
    if (!manualDescripcion.value.trim()) {
        showToast('error', 'Describe el ítem manual.');
        return;
    }
    items.value.push({
        id: Date.now(),
        itemCatalogoId: null,
        nombre: manualDescripcion.value.trim(),
        descripcionManual: manualDescripcion.value.trim(),
        cantidadRequerida: cantidadManual.value
    });
    manualDescripcion.value = '';
    cantidadManual.value = 1;
};

const removeItem = (id: number) => {
    items.value = items.value.filter(item => item.id !== id);
};

const selectSolicitante = (entidad: EntidadResumen) => {
    solicitante.value = entidad;
    showSolicitanteDropdown.value = false;
};

const selectCatalogResult = (item: CatalogoItem) => {
    selectedCatalogItem.value = item;
    catalogQuery.value = item.nombre;
    showCatalogDropdown.value = false;
};

const submitSolicitud = async () => {
    if (!solicitante.value) {
        showToast('error', 'Selecciona a la persona solicitante.');
        return;
    }
    if (!programa.value.trim()) {
        showToast('error', 'Indica el programa o proyecto.');
        return;
    }
    if (items.value.length === 0) {
        showToast('error', 'Agrega al menos un ítem solicitado.');
        return;
    }

    const payload: SolicitudPayload = {
        solicitud: {
            id: 0,
            solicitanteId: solicitante.value.id,
            programa: programa.value.trim(),
            fechaSolicitud: `${fechaSolicitud.value}T${horaSolicitud.value || '12:00'}:00`,
            estado: 'Pendiente',
            autorizadorId: null
        },
        items: items.value.map(item => ({
            id: 0,
            solicitudId: null,
            itemCatalogoId: item.itemCatalogoId,
            descripcionManual: item.descripcionManual,
            cantidadRequerida: item.cantidadRequerida,
            cantidadEntregada: null
        }))
    };

    try {
        await apiService.crearSolicitud(payload);
        showToast('success', 'Solicitud ingresada correctamente.');
        solicitante.value = null;
        programa.value = '';
        items.value = [];
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo crear la solicitud.');
    }
};
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-sm uppercase tracking-widest text-sky-600 font-semibold">Solicitudes internas</p>
            <h2 class="text-3xl font-bold text-gray-900">Requerimientos de programas y talleres</h2>
            <p class="text-gray-600">Registra las necesidades de insumos vinculadas a beneficiarios y actividades para agilizar aprobaciones.</p>
        </header>

        <div v-if="message" :class="`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`">
            {{ message.text }}
        </div>

        <div class="bg-white rounded-xl shadow border border-gray-100 p-6 space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Solicitante *</label>
                    <div v-if="solicitante" class="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-md px-3 py-3">
                        <div>
                            <p class="font-semibold text-sky-700">{{ solicitante.nombreCompleto }}</p>
                            <p class="text-sm text-gray-600">{{ formatRutForDisplay(solicitante.identificador) }}</p>
                        </div>
                        <button class="text-sm text-sky-600" @click="solicitante = null">Cambiar</button>
                    </div>
                    <div v-else>
                        <input
                            v-model="solicitanteQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT"
                            class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            @input="searchSolicitantes(solicitanteQuery)"
                            @focus="showSolicitanteDropdown = true"
                        />
                        <div
                            v-if="showSolicitanteDropdown && solicitanteQuery.length >= 2"
                            class="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow mt-1 max-h-64 overflow-y-auto"
                        >
                            <div v-if="solicitanteLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                            <template v-else>
                                <button
                                    v-for="entidad in solicitanteResults"
                                    :key="entidad.id"
                                    type="button"
                                    class="w-full text-left px-3 py-2 hover:bg-sky-50"
                                    @click="selectSolicitante(entidad)"
                                >
                                    <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                </button>
                                <div v-if="solicitanteResults.length === 0" class="p-3 text-center text-sm text-gray-500 space-y-2">
                                    <p>Sin resultados para "{{ solicitanteQuery }}".</p>
                                    <button
                                        type="button"
                                        class="inline-flex items-center px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                                        @click="showCrearPersonaModal = true"
                                    >
                                        + Registrar persona
                                    </button>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Programa o actividad *</label>
                    <input
                        v-model="programa"
                        type="text"
                        class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="Ej: Taller de Carpintería, Jornada de invierno..."
                    />
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                    <input
                        v-model="fechaSolicitud"
                        type="date"
                        class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                    <input
                        v-model="horaSolicitud"
                        type="time"
                        class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    />
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <p class="text-sm font-semibold text-gray-800">Ítems desde catálogo</p>
                    <div class="relative">
                        <input
                            v-model="catalogQuery"
                            type="text"
                            placeholder="Buscar ítem del catálogo..."
                            class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            @input="searchCatalogo(catalogQuery)"
                            @focus="showCatalogDropdown = true"
                        />
                        <div
                            v-if="showCatalogDropdown && catalogQuery.length >= 2"
                            class="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow mt-1 max-h-56 overflow-y-auto"
                        >
                            <div v-if="catalogLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                            <template v-else>
                                <button
                                    v-for="item in catalogResults"
                                    :key="item.id"
                                    type="button"
                                    class="w-full text-left px-3 py-2 hover:bg-sky-50"
                                    @click="selectCatalogResult(item)"
                                >
                                    <p class="font-medium text-gray-900">{{ item.nombre }}</p>
                                    <p class="text-xs text-gray-500">{{ item.categoria }} · Stock: {{ item.stockActual }}</p>
                                </button>
                                <div v-if="catalogResults.length === 0" class="p-3 text-center text-sm text-gray-500 space-y-2">
                                    <p>Sin resultados para "{{ catalogQuery }}".</p>
                                    <button
                                        type="button"
                                        class="btn btn-primary text-xs"
                                        @click="showCatalogoModal = true"
                                    >
                                        <Plus class="w-3.5 h-3.5" /> Crear ítem de catálogo
                                    </button>
                                </div>
                            </template>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                            <input
                                v-model.number="cantidadCatalog"
                                type="number"
                                min="1"
                                class="w-full border border-gray-300 rounded-md px-3 py-2"
                            />
                        </div>
                        <div class="flex items-end">
                            <button class="btn btn-primary w-full justify-center" type="button" @click="addCatalogItem">
                                <Plus class="w-4 h-4" /> Agregar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="space-y-4">
                    <p class="text-sm font-semibold text-gray-800">Ítems manuales</p>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <input
                            v-model="manualDescripcion"
                            type="text"
                            class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            placeholder="Ej: Tornillos 2'' (manual)"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                            <input
                                v-model.number="cantidadManual"
                                type="number"
                                min="1"
                                class="w-full border border-gray-300 rounded-md px-3 py-2"
                            />
                        </div>
                        <div class="flex items-end">
                            <button class="btn btn-outline w-full justify-center" type="button" @click="addManualItem">
                                <Plus class="w-4 h-4" /> Agregar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="space-y-3">
                <h3 class="text-lg font-semibold text-gray-900">Resumen de la solicitud</h3>
                <div v-if="items.length" class="overflow-x-auto border border-gray-100 rounded-lg">
                    <table class="min-w-full divide-y divide-gray-100">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                <th class="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            <tr v-for="item in items" :key="item.id">
                                <td class="px-4 py-3 text-sm text-gray-900">{{ item.nombre }}</td>
                                <td class="px-4 py-3 text-sm text-gray-500">
                                    {{ item.itemCatalogoId ? 'Catálogo' : 'Manual' }}
                                </td>
                                <td class="px-4 py-3 text-sm font-semibold text-gray-900">{{ item.cantidadRequerida }}</td>
                                <td class="px-4 py-3 text-right">
                                    <button class="inline-flex items-center gap-1 text-sm text-red-600" @click="removeItem(item.id)">
                                        <Trash2 class="w-4 h-4" /> Eliminar
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p v-else class="text-sm text-gray-500">Todavía no agregas ítems a la solicitud.</p>
            </div>

            <div class="flex justify-end">
                <button class="btn btn-primary px-6 py-3" @click="submitSolicitud">
                    <Send class="w-4 h-4" /> Registrar solicitud
                </button>
            </div>
        </div>
    </div>

    <ModalCrearPersona
        :isOpen="showCrearPersonaModal"
        @close="showCrearPersonaModal = false"
        @created="handlePersonaCreada"
    />

    <ModalRegistroCatalogo
        v-if="showCatalogoModal"
        @close="showCatalogoModal = false"
        @created="handleCatalogoCreado"
    />
</template>
