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
    <div class="form-page space-y-4">
        <header class="form-shell px-5 py-4">
            <p class="eyebrow text-[var(--accent-color)]">Solicitudes internas</p>
            <h2 class="text-lg font-semibold text-[var(--text-primary)]">Requerimientos de programas y talleres</h2>
            <p class="text-xs text-[var(--text-muted)]">Registra necesidades de insumos vinculadas a beneficiarios y actividades.</p>
        </header>

        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>

        <div class="form-shell">
            <div class="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Solicitante *</label>
                    <div v-if="solicitante" class="selected-card flex items-center justify-between px-3 py-3">
                        <div>
                            <p class="font-semibold text-sky-700">{{ solicitante.nombreCompleto }}</p>
                            <p class="text-sm text-gray-600">{{ formatRutForDisplay(solicitante.identificador) }}</p>
                        </div>
                        <button class="text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]" @click="solicitante = null">Cambiar</button>
                    </div>
                    <div v-else>
                        <input
                            v-model="solicitanteQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT"
                            class="compact-control"
                            @input="searchSolicitantes(solicitanteQuery)"
                            @focus="showSolicitanteDropdown = true"
                        />
                        <div
                            v-if="showSolicitanteDropdown && solicitanteQuery.length >= 2"
                            class="dropdown-panel absolute z-10 mt-1 max-h-64 w-full overflow-y-auto"
                        >
                            <div v-if="solicitanteLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                            <template v-else>
                                <button
                                    v-for="entidad in solicitanteResults"
                                    :key="entidad.id"
                                    type="button"
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
                        class="compact-control"
                        placeholder="Ej: Taller de Carpintería, Jornada de invierno..."
                    />
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 border-t border-[var(--card-border)] px-5 py-4 md:grid-cols-2">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                    <input
                        v-model="fechaSolicitud"
                        type="date"
                        class="compact-control"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                    <input
                        v-model="horaSolicitud"
                        type="time"
                        class="compact-control"
                    />
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 border-t border-[var(--card-border)] px-5 py-4 md:grid-cols-2">
                <div class="form-panel space-y-3">
                    <p class="text-sm font-semibold text-gray-800">Ítems desde catálogo</p>
                    <div class="relative">
                        <input
                            v-model="catalogQuery"
                            type="text"
                            placeholder="Buscar ítem del catálogo..."
                            class="compact-control"
                            @input="searchCatalogo(catalogQuery)"
                            @focus="showCatalogDropdown = true"
                        />
                        <div
                            v-if="showCatalogDropdown && catalogQuery.length >= 2"
                            class="dropdown-panel absolute z-10 mt-1 max-h-56 w-full overflow-y-auto"
                        >
                            <div v-if="catalogLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                            <template v-else>
                                <button
                                    v-for="item in catalogResults"
                                    :key="item.id"
                                    type="button"
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
                                class="compact-control"
                            />
                        </div>
                        <div class="flex items-end">
                            <button class="btn btn-primary w-full justify-center" type="button" @click="addCatalogItem">
                                <Plus class="w-4 h-4" /> Agregar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="form-panel space-y-4">
                    <p class="text-sm font-semibold text-gray-800">Ítems manuales</p>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <input
                            v-model="manualDescripcion"
                            type="text"
                            class="compact-control"
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
                                class="compact-control"
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

            <div class="space-y-3 border-t border-[var(--card-border)] px-5 py-4">
                <h3 class="text-base font-semibold text-[var(--text-primary)]">Resumen de la solicitud</h3>
                <div v-if="items.length" class="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                    <table class="min-w-full divide-y divide-[var(--card-border)]">
                        <thead class="bg-[var(--surface-muted)]">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                <th class="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-[var(--bg-card)]">
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

            <div class="form-actions flex justify-end border-t px-5 py-4">
                <button class="btn-primary h-10 px-6" @click="submitSolicitud">
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
