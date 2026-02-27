<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EntidadResumen, CatalogoItem, EgresoAyudaSocialPayload, EgresoConsumoInternoPayload } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { Handshake, Building2, Plus, Trash2 } from 'lucide-vue-next';

type LocalItem = {
    itemCatalogoId: number;
    nombre: string;
    cantidad: number;
    valorReferencia: number;
};

const activeTab = ref<'ayuda' | 'consumo'>('ayuda');

const debounce = (fn: (...args: any[]) => void, delay = 300) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const setMessage = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 4000);
};

// Ayuda Social state
const ayudaMotivo = ref('');
const ayudaBeneficiario = ref<EntidadResumen | null>(null);
const ayudaBeneficiarioQuery = ref('');
const ayudaBeneficiarioResults = ref<EntidadResumen[]>([]);
const ayudaBeneficiarioLoading = ref(false);
const showAyudaBeneficiarioDropdown = ref(false);

const ayudaItems = ref<LocalItem[]>([]);
const ayudaItemQuery = ref('');
const ayudaItemResults = ref<CatalogoItem[]>([]);
const ayudaItemLoading = ref(false);
const showAyudaItemDropdown = ref(false);
const ayudaCantidad = ref(1);
const ayudaValorReferencia = ref(0);
const ayudaSelectedItem = ref<CatalogoItem | null>(null);

const ayudaTotal = computed(() =>
    ayudaItems.value.reduce((sum, item) => sum + item.cantidad * item.valorReferencia, 0)
);

// Consumo Interno state
const consumoPrograma = ref('');
const consumoResponsable = ref<EntidadResumen | null>(null);
const consumoResponsableQuery = ref('');
const consumoResponsableResults = ref<EntidadResumen[]>([]);
const consumoResponsableLoading = ref(false);
const showConsumoResponsableDropdown = ref(false);

const consumoItems = ref<LocalItem[]>([]);
const consumoItemQuery = ref('');
const consumoItemResults = ref<CatalogoItem[]>([]);
const consumoItemLoading = ref(false);
const showConsumoItemDropdown = ref(false);
const consumoCantidad = ref(1);
const consumoValorReferencia = ref(0);
const consumoSelectedItem = ref<CatalogoItem | null>(null);

const consumoTotal = computed(() =>
    consumoItems.value.reduce((sum, item) => sum + item.cantidad * item.valorReferencia, 0)
);

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

const searchBeneficiario = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        ayudaBeneficiarioResults.value = [];
        return;
    }
    ayudaBeneficiarioLoading.value = true;
    try {
        ayudaBeneficiarioResults.value = await apiService.buscarEntidades(query);
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudieron buscar personas.');
    } finally {
        ayudaBeneficiarioLoading.value = false;
    }
});

const searchResponsable = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        consumoResponsableResults.value = [];
        return;
    }
    consumoResponsableLoading.value = true;
    try {
        consumoResponsableResults.value = await apiService.buscarEntidades(query);
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudieron buscar personas.');
    } finally {
        consumoResponsableLoading.value = false;
    }
});

const searchAyudaItems = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        ayudaItemResults.value = [];
        return;
    }
    ayudaItemLoading.value = true;
    try {
        ayudaItemResults.value = await apiService.buscarCatalogo(query);
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudieron buscar ítems.');
    } finally {
        ayudaItemLoading.value = false;
    }
});

const searchConsumoItems = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        consumoItemResults.value = [];
        return;
    }
    consumoItemLoading.value = true;
    try {
        consumoItemResults.value = await apiService.buscarCatalogo(query);
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudieron buscar ítems.');
    } finally {
        consumoItemLoading.value = false;
    }
});

const selectBeneficiario = (entidad: EntidadResumen) => {
    ayudaBeneficiario.value = entidad;
    ayudaBeneficiarioQuery.value = '';
    showAyudaBeneficiarioDropdown.value = false;
};

const selectResponsable = (entidad: EntidadResumen) => {
    consumoResponsable.value = entidad;
    consumoResponsableQuery.value = '';
    showConsumoResponsableDropdown.value = false;
};

const selectAyudaItem = (item: CatalogoItem) => {
    ayudaSelectedItem.value = item;
    ayudaItemQuery.value = item.nombre;
    ayudaValorReferencia.value = item.precioReferencia;
    showAyudaItemDropdown.value = false;
};

const selectConsumoItem = (item: CatalogoItem) => {
    consumoSelectedItem.value = item;
    consumoItemQuery.value = item.nombre;
    consumoValorReferencia.value = item.precioReferencia;
    showConsumoItemDropdown.value = false;
};

const addAyudaItem = () => {
    if (!ayudaSelectedItem.value || ayudaCantidad.value <= 0) {
        setMessage('error', 'Debes seleccionar un ítem y definir una cantidad válida.');
        return;
    }
    ayudaItems.value.push({
        itemCatalogoId: ayudaSelectedItem.value.id,
        nombre: ayudaSelectedItem.value.nombre,
        cantidad: ayudaCantidad.value,
        valorReferencia: ayudaValorReferencia.value
    });
    ayudaSelectedItem.value = null;
    ayudaItemQuery.value = '';
    ayudaCantidad.value = 1;
    ayudaValorReferencia.value = 0;
};

const addConsumoItem = () => {
    if (!consumoSelectedItem.value || consumoCantidad.value <= 0) {
        setMessage('error', 'Debes seleccionar un ítem y definir una cantidad válida.');
        return;
    }
    consumoItems.value.push({
        itemCatalogoId: consumoSelectedItem.value.id,
        nombre: consumoSelectedItem.value.nombre,
        cantidad: consumoCantidad.value,
        valorReferencia: consumoValorReferencia.value
    });
    consumoSelectedItem.value = null;
    consumoItemQuery.value = '';
    consumoCantidad.value = 1;
    consumoValorReferencia.value = 0;
};

const removeAyudaItem = (index: number) => {
    ayudaItems.value.splice(index, 1);
};

const removeConsumoItem = (index: number) => {
    consumoItems.value.splice(index, 1);
};

const resetAyudaForm = () => {
    ayudaMotivo.value = '';
    ayudaBeneficiario.value = null;
    ayudaItems.value = [];
    ayudaSelectedItem.value = null;
    ayudaItemQuery.value = '';
    ayudaCantidad.value = 1;
    ayudaValorReferencia.value = 0;
};

const resetConsumoForm = () => {
    consumoPrograma.value = '';
    consumoResponsable.value = null;
    consumoItems.value = [];
    consumoSelectedItem.value = null;
    consumoItemQuery.value = '';
    consumoCantidad.value = 1;
    consumoValorReferencia.value = 0;
};

const submitAyuda = async () => {
    if (!ayudaBeneficiario.value) {
        setMessage('error', 'Debes seleccionar a la persona beneficiaria.');
        return;
    }
    if (ayudaItems.value.length === 0) {
        setMessage('error', 'Agrega al menos un ítem a entregar.');
        return;
    }

    const payload: EgresoAyudaSocialPayload = {
        egreso: {
            tipoEgreso: 'AyudaSocial' as const,
            montoValorizadoTotal: ayudaTotal.value
        },
        ayuda: {
            beneficiarioPersonaId: ayudaBeneficiario.value.id,
            motivoEntrega: ayudaMotivo.value || 'Ayuda social'
        },
        detalles: ayudaItems.value.map(item => ({
            itemCatalogoId: item.itemCatalogoId,
            cantidad: item.cantidad
        }))
    };

    try {
        await apiService.crearEgresoAyudaSocial(payload);
        setMessage('success', 'Ayuda social registrada exitosamente.');
        resetAyudaForm();
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudo registrar la ayuda.');
    }
};

const submitConsumo = async () => {
    if (!consumoResponsable.value) {
        setMessage('error', 'Selecciona la persona responsable del consumo interno.');
        return;
    }
    if (!consumoPrograma.value.trim()) {
        setMessage('error', 'Indica el programa o actividad asociada.');
        return;
    }
    if (consumoItems.value.length === 0) {
        setMessage('error', 'Agrega al menos un ítem para registrar el consumo.');
        return;
    }

    const payload: EgresoConsumoInternoPayload = {
        egreso: {
            tipoEgreso: 'ConsumoInterno' as const,
            montoValorizadoTotal: consumoTotal.value
        },
        consumo: {
            programaEvento: consumoPrograma.value,
            responsablePersonaId: consumoResponsable.value.id
        },
        detalles: consumoItems.value.map(item => ({
            itemCatalogoId: item.itemCatalogoId,
            cantidad: item.cantidad
        }))
    };

    try {
        await apiService.crearEgresoConsumoInterno(payload);
        setMessage('success', 'Consumo interno registrado con éxito.');
        resetConsumoForm();
    } catch (e: any) {
        setMessage('error', e.message || 'No se pudo registrar el consumo interno.');
    }
};
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-sm uppercase tracking-widest text-rose-600 font-semibold">Egresos programáticos</p>
            <h2 class="text-3xl font-bold text-gray-900">Ayudas sociales y consumos internos</h2>
            <p class="text-gray-600">Registra apoyos a beneficiarios y consumos de programas con trazabilidad completa.</p>
        </header>

        <div v-if="message" :class="`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`">
            {{ message.text }}
        </div>

        <div class="bg-white rounded-xl shadow border border-gray-100">
            <div class="flex flex-wrap">
                    <button
                    class="flex-1 md:flex-none px-5 py-3 text-sm font-semibold transition"
                    :class="activeTab === 'ayuda' ? 'text-rose-600 border-b-2 border-rose-500 bg-rose-50' : 'text-gray-500 hover:text-gray-700'"
                    @click="activeTab = 'ayuda'"
                >
                    <span class="inline-flex items-center gap-2">
                        <Handshake class="w-4 h-4" />
                        Ayuda Social
                    </span>
                </button>
                    <button
                    class="flex-1 md:flex-none px-5 py-3 text-sm font-semibold transition"
                    :class="activeTab === 'consumo' ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50' : 'text-gray-500 hover:text-gray-700'"
                    @click="activeTab = 'consumo'"
                >
                    <span class="inline-flex items-center gap-2">
                        <Building2 class="w-4 h-4" />
                        Consumo Interno
                    </span>
                </button>
            </div>

            <div class="p-6">
                <!-- Ayuda Social Form -->
                <div v-if="activeTab === 'ayuda'" class="space-y-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div class="relative">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Beneficiario *</label>
                                <div v-if="ayudaBeneficiario" class="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-md px-3 py-3">
                                    <div>
                                        <p class="font-semibold text-rose-700">{{ ayudaBeneficiario.nombreCompleto }}</p>
                                        <p class="text-sm text-gray-600">{{ formatRutForDisplay(ayudaBeneficiario.identificador) }}</p>
                                    </div>
                                    <button class="text-sm text-rose-600 hover:text-rose-800" @click="ayudaBeneficiario = null">Cambiar</button>
                                </div>
                                <div v-else>
                                    <input
                                        v-model="ayudaBeneficiarioQuery"
                                        type="text"
                                        placeholder="Busca por nombre o RUT..."
                                        class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                        @input="searchBeneficiario(ayudaBeneficiarioQuery)"
                                        @focus="showAyudaBeneficiarioDropdown = true"
                                    />
                                    <div
                                        v-if="showAyudaBeneficiarioDropdown && ayudaBeneficiarioQuery.length >= 2"
                                        class="absolute z-10 w-full bg-white shadow-lg border border-gray-200 rounded-md mt-1 max-h-60 overflow-y-auto"
                                    >
                                        <div v-if="ayudaBeneficiarioLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                                        <template v-else>
                                            <button
                                                v-for="entidad in ayudaBeneficiarioResults"
                                                :key="entidad.id"
                                                type="button"
                                                class="w-full text-left px-4 py-2 hover:bg-rose-50"
                                                @click="selectBeneficiario(entidad)"
                                            >
                                                <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                            </button>
                                            <p v-if="ayudaBeneficiarioResults.length === 0" class="p-3 text-sm text-gray-400">Sin resultados</p>
                                        </template>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Motivo / contexto de la entrega</label>
                                <textarea
                                    v-model="ayudaMotivo"
                                    rows="3"
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                    placeholder="Ej: Compra de alimentos por emergencia climática"
                                ></textarea>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <p class="text-sm font-medium text-gray-700">Agregar ítems entregados</p>
                            <div class="relative">
                                <input
                                    v-model="ayudaItemQuery"
                                    type="text"
                                    placeholder="Buscar ítem del catálogo..."
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                    @input="searchAyudaItems(ayudaItemQuery)"
                                    @focus="showAyudaItemDropdown = true"
                                />
                                <div
                                    v-if="showAyudaItemDropdown && ayudaItemQuery.length >= 2"
                                    class="absolute z-10 w-full bg-white shadow-lg border border-gray-200 rounded-md mt-1 max-h-60 overflow-y-auto"
                                >
                                    <div v-if="ayudaItemLoading" class="p-3 text-sm text-gray-500">Buscando ítems...</div>
                                    <template v-else>
                                        <button
                                            v-for="item in ayudaItemResults"
                                            :key="item.id"
                                            type="button"
                                            class="w-full text-left px-4 py-2 hover:bg-rose-50"
                                            @click="selectAyudaItem(item)"
                                        >
                                            <p class="font-medium text-gray-900">{{ item.nombre }}</p>
                                            <p class="text-xs text-gray-500">Stock: {{ item.stockActual }} · Ref: {{ currency.format(item.precioReferencia) }}</p>
                                        </button>
                                        <p v-if="ayudaItemResults.length === 0" class="p-3 text-sm text-gray-400">Sin resultados</p>
                                    </template>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                                    <input
                                        v-model.number="ayudaCantidad"
                                        type="number"
                                        min="1"
                                        class="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-gray-600 mb-1">Valor referencia (PPP)</label>
                                    <div class="w-full border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-sm text-gray-700">
                                        <span v-if="ayudaSelectedItem">{{ currency.format(ayudaValorReferencia) }}</span>
                                        <span v-else class="text-gray-400">Selecciona un ítem</span>
                                    </div>
                                    <p class="text-[11px] text-gray-500 mt-1">Se usa el precio promedio ponderado del catálogo.</p>
                                </div>
                                <div class="flex items-end">
                                    <button class="btn btn-primary w-full justify-center" type="button" @click="addAyudaItem">
                                        <Plus class="w-4 h-4" /> Agregar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4" v-if="ayudaItems.length">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-semibold text-gray-900">Detalle de la entrega</h4>
                            <span class="text-sm font-semibold text-rose-600">Total: {{ currency.format(ayudaTotal) }}</span>
                        </div>
                        <div class="overflow-x-auto border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valor ref.</th>
                                        <th class="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-100">
                                    <tr v-for="(item, index) in ayudaItems" :key="index">
                                        <td class="px-4 py-3 text-sm text-gray-900">{{ item.nombre }}</td>
                                        <td class="px-4 py-3 text-sm text-gray-600">{{ item.cantidad }}</td>
                                        <td class="px-4 py-3 text-sm font-semibold text-gray-900">{{ currency.format(item.valorReferencia) }}</td>
                                        <td class="px-4 py-3 text-right">
                                            <button class="inline-flex items-center gap-1 text-sm text-red-600" @click="removeAyudaItem(index)">
                                                <Trash2 class="w-4 h-4" /> Eliminar
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-end">
                        <button class="btn btn-primary px-6 py-3" @click="submitAyuda">
                            Registrar ayuda social
                        </button>
                    </div>
                </div>

                <!-- Consumo Interno Form -->
                <div v-else class="space-y-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Programa / actividad *</label>
                                <input
                                    v-model="consumoPrograma"
                                    type="text"
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Ej: Taller de invierno, Jornada familiar..."
                                />
                            </div>
                            <div class="relative">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Responsable *</label>
                                <div v-if="consumoResponsable" class="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-md px-3 py-3">
                                    <div>
                                        <p class="font-semibold text-indigo-700">{{ consumoResponsable.nombreCompleto }}</p>
                                        <p class="text-sm text-gray-600">{{ formatRutForDisplay(consumoResponsable.identificador) }}</p>
                                    </div>
                                    <button class="text-sm text-indigo-600 hover:text-indigo-800" @click="consumoResponsable = null">Cambiar</button>
                                </div>
                                <div v-else>
                                    <input
                                        v-model="consumoResponsableQuery"
                                        type="text"
                                        placeholder="Busca por nombre o RUT..."
                                        class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        @input="searchResponsable(consumoResponsableQuery)"
                                        @focus="showConsumoResponsableDropdown = true"
                                    />
                                    <div
                                        v-if="showConsumoResponsableDropdown && consumoResponsableQuery.length >= 2"
                                        class="absolute z-10 w-full bg-white shadow-lg border border-gray-200 rounded-md mt-1 max-h-60 overflow-y-auto"
                                    >
                                        <div v-if="consumoResponsableLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                                        <template v-else>
                                            <button
                                                v-for="entidad in consumoResponsableResults"
                                                :key="entidad.id"
                                                type="button"
                                                class="w-full text-left px-4 py-2 hover:bg-indigo-50"
                                                @click="selectResponsable(entidad)"
                                            >
                                                <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                            </button>
                                            <p v-if="consumoResponsableResults.length === 0" class="p-3 text-sm text-gray-400">Sin resultados</p>
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-4">
                            <p class="text-sm font-medium text-gray-700">Ítems utilizados</p>
                            <div class="relative">
                                <input
                                    v-model="consumoItemQuery"
                                    type="text"
                                    placeholder="Buscar ítem del catálogo..."
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    @input="searchConsumoItems(consumoItemQuery)"
                                    @focus="showConsumoItemDropdown = true"
                                />
                                <div
                                    v-if="showConsumoItemDropdown && consumoItemQuery.length >= 2"
                                    class="absolute z-10 w-full bg-white shadow-lg border border-gray-200 rounded-md mt-1 max-h-60 overflow-y-auto"
                                >
                                    <div v-if="consumoItemLoading" class="p-3 text-sm text-gray-500">Buscando ítems...</div>
                                    <template v-else>
                                        <button
                                            v-for="item in consumoItemResults"
                                            :key="item.id"
                                            type="button"
                                            class="w-full text-left px-4 py-2 hover:bg-indigo-50"
                                            @click="selectConsumoItem(item)"
                                        >
                                            <p class="font-medium text-gray-900">{{ item.nombre }}</p>
                                            <p class="text-xs text-gray-500">Stock: {{ item.stockActual }} · Ref: {{ currency.format(item.precioReferencia) }}</p>
                                        </button>
                                        <p v-if="consumoItemResults.length === 0" class="p-3 text-sm text-gray-400">Sin resultados</p>
                                    </template>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                                    <input
                                        v-model.number="consumoCantidad"
                                        type="number"
                                        min="1"
                                        class="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs font-semibold text-gray-600 mb-1">Valor referencia (PPP)</label>
                                    <div class="w-full border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-sm text-gray-700">
                                        <span v-if="consumoSelectedItem">{{ currency.format(consumoValorReferencia) }}</span>
                                        <span v-else class="text-gray-400">Selecciona un ítem</span>
                                    </div>
                                    <p class="text-[11px] text-gray-500 mt-1">Se usa el precio promedio ponderado del catálogo.</p>
                                </div>
                                <div class="flex items-end">
                                    <button class="btn btn-primary w-full justify-center" type="button" @click="addConsumoItem">
                                        <Plus class="w-4 h-4" /> Agregar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4" v-if="consumoItems.length">
                        <div class="flex items-center justify-between">
                            <h4 class="text-lg font-semibold text-gray-900">Detalle del consumo</h4>
                            <span class="text-sm font-semibold text-indigo-600">Total: {{ currency.format(consumoTotal) }}</span>
                        </div>
                        <div class="overflow-x-auto border border-gray-100 rounded-lg">
                            <table class="min-w-full divide-y divide-gray-100">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                        <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valor ref.</th>
                                        <th class="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-100">
                                    <tr v-for="(item, index) in consumoItems" :key="index">
                                        <td class="px-4 py-3 text-sm text-gray-900">{{ item.nombre }}</td>
                                        <td class="px-4 py-3 text-sm text-gray-600">{{ item.cantidad }}</td>
                                        <td class="px-4 py-3 text-sm font-semibold text-gray-900">{{ currency.format(item.valorReferencia) }}</td>
                                        <td class="px-4 py-3 text-right">
                                            <button class="inline-flex items-center gap-1 text-sm text-red-600" @click="removeConsumoItem(index)">
                                                <Trash2 class="w-4 h-4" /> Eliminar
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-end">
                        <button class="btn btn-primary px-6 py-3" @click="submitConsumo">
                            Registrar consumo interno
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
