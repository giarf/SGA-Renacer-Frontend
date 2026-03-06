<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, ExternalLink, FileImage, Loader2, Plus, ShoppingCart, Trash2, X } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import type { CatalogoItem, CompraBoletaMetadata, CompraIngresoPayload, Cuenta, EntidadResumen } from '../types';

const today = new Date().toISOString().split('T')[0] ?? '';

const cuentas = ref<Cuenta[]>([]);
const cuentasLoading = ref(false);
const selectedCuentaId = ref<number | null>(null);

const proveedorQuery = ref('');
const proveedorResults = ref<EntidadResumen[]>([]);
const proveedorLoading = ref(false);
const showProveedorDropdown = ref(false);
const selectedProveedor = ref<EntidadResumen | null>(null);

const responsableQuery = ref('');
const responsableResults = ref<EntidadResumen[]>([]);
const responsableLoading = ref(false);
const showResponsableDropdown = ref(false);
const selectedResponsable = ref<EntidadResumen | null>(null);

const itemQuery = ref('');
const itemResults = ref<CatalogoItem[]>([]);
const itemLoading = ref(false);
const showItemDropdown = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);
const itemCantidad = ref(1);
const itemPrecio = ref(0);

const fecha = ref(today);
const numeroFacturaBoleta = ref('');
const montoNeto = ref(0);
const montoIva = ref(0);
const boletaFile = ref<File | null>(null);
const boletaPreviewUrl = ref<string | null>(null);
const ultimaCompraBoleta = ref<CompraBoletaMetadata | null>(null);

type CompraDetalleLocal = {
    itemCatalogoId: number;
    nombre: string;
    cantidad: number;
    precioUnitarioIngreso: number;
};

const detalles = ref<CompraDetalleLocal[]>([]);
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.familiarenacer.cl/api').replace(/\/$/, '');
const apiOrigin = apiBaseUrl.replace(/\/api$/, '');

const montoDetalles = computed(() =>
    detalles.value.reduce((sum, item) => sum + item.cantidad * item.precioUnitarioIngreso, 0)
);

const montoTotal = computed(() => {
    const totalFormulario = Number(montoNeto.value || 0) + Number(montoIva.value || 0);
    return totalFormulario > 0 ? totalFormulario : montoDetalles.value;
});

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

let proveedorTimer: ReturnType<typeof setTimeout> | null = null;
let responsableTimer: ReturnType<typeof setTimeout> | null = null;
let itemTimer: ReturnType<typeof setTimeout> | null = null;

const resolveBoletaUrl = (endpoint?: string, ingresoId?: number) => {
    if (endpoint) {
        if (/^https?:\/\//i.test(endpoint)) return endpoint;
        return `${apiOrigin}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }
    if (!ingresoId) return `${apiBaseUrl}/ingresos/compras`;
    return `${apiBaseUrl}/ingresos/compra/boleta/${ingresoId}/download`;
};

const loadCuentas = async () => {
    cuentasLoading.value = true;
    try {
        cuentas.value = await apiService.getCuentas();
        selectedCuentaId.value = cuentas.value[0]?.id ?? null;
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudieron cargar las cuentas.' };
    } finally {
        cuentasLoading.value = false;
    }
};

const searchProveedor = (query: string) => {
    if (proveedorTimer) clearTimeout(proveedorTimer);
    if (!query || query.trim().length < 2) {
        proveedorResults.value = [];
        return;
    }
    proveedorTimer = setTimeout(async () => {
        proveedorLoading.value = true;
        try {
            proveedorResults.value = await apiService.buscarEntidades(query);
            showProveedorDropdown.value = true;
        } catch {
            proveedorResults.value = [];
        } finally {
            proveedorLoading.value = false;
        }
    }, 250);
};

const searchResponsable = (query: string) => {
    if (responsableTimer) clearTimeout(responsableTimer);
    if (!query || query.trim().length < 2) {
        responsableResults.value = [];
        return;
    }
    responsableTimer = setTimeout(async () => {
        responsableLoading.value = true;
        try {
            responsableResults.value = await apiService.buscarEntidades(query);
            showResponsableDropdown.value = true;
        } catch {
            responsableResults.value = [];
        } finally {
            responsableLoading.value = false;
        }
    }, 250);
};

const searchItems = (query: string) => {
    if (itemTimer) clearTimeout(itemTimer);
    if (!query || query.trim().length < 2) {
        itemResults.value = [];
        return;
    }
    itemTimer = setTimeout(async () => {
        itemLoading.value = true;
        try {
            itemResults.value = await apiService.buscarCatalogo(query);
            showItemDropdown.value = true;
        } catch {
            itemResults.value = [];
        } finally {
            itemLoading.value = false;
        }
    }, 250);
};

const closeProveedorDropdownDelayed = () => {
    setTimeout(() => (showProveedorDropdown.value = false), 200);
};

const closeResponsableDropdownDelayed = () => {
    setTimeout(() => (showResponsableDropdown.value = false), 200);
};

const closeItemsDropdownDelayed = () => {
    setTimeout(() => (showItemDropdown.value = false), 200);
};

const clearBoletaPreview = () => {
    if (boletaPreviewUrl.value) {
        URL.revokeObjectURL(boletaPreviewUrl.value);
    }
    boletaPreviewUrl.value = null;
};

const setBoletaFile = (file: File | null) => {
    clearBoletaPreview();
    boletaFile.value = file;
    if (file && file.type.startsWith('image/')) {
        boletaPreviewUrl.value = URL.createObjectURL(file);
    }
};

const onBoletaInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    setBoletaFile(file);
};

const removeBoleta = () => {
    setBoletaFile(null);
};

const abrirBoletaUltimaCompra = () => {
    if (!ultimaCompraBoleta.value?.tieneBoleta) return;
    const url = resolveBoletaUrl(
        ultimaCompraBoleta.value.downloadEndpoint ||
        ultimaCompraBoleta.value.boletaDownloadEndpoint ||
        ultimaCompraBoleta.value.boletaEndpoint,
        ultimaCompraBoleta.value.idIngreso
    );
    window.open(url, '_blank', 'noopener,noreferrer');
};

const addDetalle = () => {
    if (!selectedItem.value || itemCantidad.value <= 0 || itemPrecio.value <= 0) {
        message.value = { type: 'error', text: 'Debes seleccionar un ítem con cantidad y precio válidos.' };
        return;
    }
    detalles.value.push({
        itemCatalogoId: selectedItem.value.id,
        nombre: selectedItem.value.nombre,
        cantidad: itemCantidad.value,
        precioUnitarioIngreso: itemPrecio.value
    });
    selectedItem.value = null;
    itemQuery.value = '';
    itemCantidad.value = 1;
    itemPrecio.value = 0;
    message.value = null;
};

const removeDetalle = (index: number) => {
    detalles.value.splice(index, 1);
};

const resetForm = () => {
    selectedProveedor.value = null;
    proveedorQuery.value = '';
    proveedorResults.value = [];
    selectedResponsable.value = null;
    responsableQuery.value = '';
    responsableResults.value = [];
    fecha.value = today;
    numeroFacturaBoleta.value = '';
    montoNeto.value = 0;
    montoIva.value = 0;
    detalles.value = [];
    selectedItem.value = null;
    itemQuery.value = '';
    itemResults.value = [];
    itemCantidad.value = 1;
    itemPrecio.value = 0;
    setBoletaFile(null);
    selectedCuentaId.value = cuentas.value[0]?.id ?? null;
};

const submitCompra = async () => {
    if (!selectedProveedor.value) {
        message.value = { type: 'error', text: 'Debes seleccionar un proveedor / origen.' };
        return;
    }
    if (!selectedResponsable.value) {
        message.value = { type: 'error', text: 'Debes seleccionar un responsable interno.' };
        return;
    }
    if (!selectedCuentaId.value) {
        message.value = { type: 'error', text: 'Debes seleccionar una cuenta de origen.' };
        return;
    }
    if (!fecha.value) {
        message.value = { type: 'error', text: 'Debes indicar la fecha de la compra.' };
        return;
    }
    if (detalles.value.length === 0) {
        message.value = { type: 'error', text: 'Debes agregar al menos un ítem en el detalle.' };
        return;
    }
    if (montoTotal.value <= 0) {
        message.value = { type: 'error', text: 'El monto total debe ser mayor a cero.' };
        return;
    }

    const payload: CompraIngresoPayload = {
        ingreso: {
            origenEntidadId: selectedProveedor.value.id,
            responsableInternoId: selectedResponsable.value.id,
            fecha: fecha.value,
            montoTotal: montoTotal.value,
            tipoTransaccion: 'Compra',
            estado: 'Cerrado'
        },
        compra: {
            ingresoId: 0,
            cuentaOrigenId: selectedCuentaId.value,
            numeroFacturaBoleta: numeroFacturaBoleta.value.trim() || `F-${Date.now()}`,
            montoNeto: Number(montoNeto.value || 0),
            montoIva: Number(montoIva.value || 0)
        },
        detalles: detalles.value.map(item => ({
            itemCatalogoId: item.itemCatalogoId,
            cantidad: item.cantidad,
            precioUnitarioIngreso: item.precioUnitarioIngreso
        }))
    };

    submitting.value = true;
    message.value = null;
    try {
        const result = await apiService.registrarCompra(payload);
        let uploadMessage = '';
        let boletaMetadata: CompraBoletaMetadata | null = null;

        if (boletaFile.value) {
            try {
                boletaMetadata = await apiService.subirBoletaCompra(result.id_ingreso, boletaFile.value);
                uploadMessage = ' Boleta cargada correctamente.';
            } catch (boletaError: any) {
                uploadMessage = ` Compra guardada, pero no se pudo subir la boleta: ${boletaError?.message || 'error de carga'}.`;
            }
        }

        ultimaCompraBoleta.value = boletaMetadata ?? { idIngreso: result.id_ingreso, tieneBoleta: false };
        message.value = { type: 'success', text: `Compra registrada. ID ingreso: ${result.id_ingreso}.${uploadMessage}` };
        resetForm();
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudo registrar la compra.' };
    } finally {
        submitting.value = false;
    }
};

onMounted(loadCuentas);
onBeforeUnmount(clearBoletaPreview);
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-xs uppercase tracking-[0.35em] text-[#006d8f] font-semibold">Gestionar</p>
            <h2 class="text-3xl font-bold text-gray-900">Compras</h2>
            <p class="text-gray-600 text-sm max-w-3xl">
                Registra compras de inventario, asociando cuenta de origen, documento tributario y detalle valorizado de ítems.
            </p>
        </header>

        <div v-if="message" :class="`p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`">
            {{ message.text }}
        </div>

        <form @submit.prevent="submitCompra" class="bg-white rounded-xl border border-gray-100 shadow p-6 space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Proveedor / Origen <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedProveedor" class="p-3 border border-[#006d8f]/20 rounded-md bg-[#006d8f]/5">
                        <p class="font-semibold text-[#006d8f]">{{ selectedProveedor.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedProveedor.identificador) }}</p>
                        <button type="button" class="text-xs text-gray-600 underline mt-1" @click="selectedProveedor = null">Cambiar</button>
                    </div>
                    <div v-else>
                        <input
                            v-model="proveedorQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            class="block w-full border border-gray-300 rounded-md p-2.5 shadow-sm focus:ring-[#006d8f] focus:border-[#006d8f]"
                            @input="searchProveedor(proveedorQuery)"
                            @focus="showProveedorDropdown = true"
                            @blur="closeProveedorDropdownDelayed"
                        />
                        <div v-if="proveedorLoading" class="absolute right-3 top-10 text-xs text-gray-400">Buscando...</div>
                        <ul v-if="showProveedorDropdown && proveedorResults.length > 0" class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow max-h-56 overflow-auto">
                            <li
                                v-for="entidad in proveedorResults"
                                :key="entidad.id"
                                class="px-3 py-2 hover:bg-[#006d8f]/5 cursor-pointer"
                                @mousedown.prevent="selectedProveedor = entidad; proveedorQuery = ''; showProveedorDropdown = false"
                            >
                                <p class="text-sm font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Responsable interno <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedResponsable" class="p-3 border border-[#006d8f]/20 rounded-md bg-[#006d8f]/5">
                        <p class="font-semibold text-[#006d8f]">{{ selectedResponsable.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedResponsable.identificador) }}</p>
                        <button type="button" class="text-xs text-gray-600 underline mt-1" @click="selectedResponsable = null">Cambiar</button>
                    </div>
                    <div v-else>
                        <input
                            v-model="responsableQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            class="block w-full border border-gray-300 rounded-md p-2.5 shadow-sm focus:ring-[#006d8f] focus:border-[#006d8f]"
                            @input="searchResponsable(responsableQuery)"
                            @focus="showResponsableDropdown = true"
                            @blur="closeResponsableDropdownDelayed"
                        />
                        <div v-if="responsableLoading" class="absolute right-3 top-10 text-xs text-gray-400">Buscando...</div>
                        <ul v-if="showResponsableDropdown && responsableResults.length > 0" class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow max-h-56 overflow-auto">
                            <li
                                v-for="entidad in responsableResults"
                                :key="entidad.id"
                                class="px-3 py-2 hover:bg-[#006d8f]/5 cursor-pointer"
                                @mousedown.prevent="selectedResponsable = entidad; responsableQuery = ''; showResponsableDropdown = false"
                            >
                                <p class="text-sm font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fecha <span class="text-red-500">*</span></label>
                    <input v-model="fecha" type="date" class="block w-full border border-gray-300 rounded-md p-2.5 bg-white" required />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Factura/Boleta</label>
                    <input v-model="numeroFacturaBoleta" type="text" placeholder="F-0001" class="block w-full border border-gray-300 rounded-md p-2.5" />
                </div>
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Cuenta origen <span class="text-red-500">*</span>
                    </label>
                    <div v-if="cuentasLoading" class="text-sm text-gray-500 mt-2">Cargando cuentas...</div>
                    <select
                        v-else
                        v-model="selectedCuentaId"
                        class="block w-full border border-gray-300 rounded-md p-2.5 bg-white"
                        required
                    >
                        <option v-for="cuenta in cuentas" :key="cuenta.id" :value="cuenta.id">
                            {{ cuenta.nombre }} - Saldo: {{ currency.format(cuenta.saldoActual || 0) }}
                        </option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto neto</label>
                    <input v-model.number="montoNeto" type="number" min="0" class="block w-full border border-gray-300 rounded-md p-2.5" />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto IVA</label>
                    <input v-model.number="montoIva" type="number" min="0" class="block w-full border border-gray-300 rounded-md p-2.5" />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto total ingreso</label>
                    <input :value="currency.format(montoTotal)" type="text" class="block w-full border border-gray-200 rounded-md p-2.5 bg-gray-50 text-gray-700" readonly />
                </div>
            </div>

            <div class="rounded-lg border border-gray-200 p-4 space-y-3">
                <div class="flex items-center gap-2">
                    <FileImage class="w-4 h-4 text-[#006d8f]" />
                    <p class="text-sm font-semibold text-gray-800">Boleta de compra (opcional)</p>
                </div>
                <p class="text-xs text-gray-500">
                    Puedes adjuntar imagen o PDF. En móvil, toca para abrir cámara o galería.
                </p>
                <label class="inline-flex items-center gap-2 rounded-md border border-[#006d8f]/30 text-[#006d8f] px-3 py-2 text-sm cursor-pointer hover:bg-[#006d8f]/5">
                    <Camera class="w-4 h-4" />
                    Adjuntar boleta
                    <input type="file" accept="image/*,.pdf" capture="environment" class="hidden" @change="onBoletaInputChange" />
                </label>

                <div v-if="boletaFile" class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <p class="text-sm font-medium text-gray-800">{{ boletaFile.name }}</p>
                            <p class="text-xs text-gray-500">{{ (boletaFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                        </div>
                        <button type="button" class="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700" @click="removeBoleta">
                            <X class="w-3.5 h-3.5" />
                            Quitar
                        </button>
                    </div>
                    <img v-if="boletaPreviewUrl" :src="boletaPreviewUrl" alt="Preview boleta" class="mt-2 max-h-44 rounded border border-gray-200" />
                </div>
            </div>

            <div class="rounded-lg border border-gray-200 p-4 space-y-4">
                <div class="flex items-center gap-2">
                    <ShoppingCart class="w-4 h-4 text-[#006d8f]" />
                    <p class="text-sm font-semibold text-gray-800">Detalle de ítems</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div class="md:col-span-2 relative">
                        <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1">Ítem catálogo</label>
                        <input
                            v-model="itemQuery"
                            type="text"
                            placeholder="Buscar ítem..."
                            class="block w-full border border-gray-300 rounded-md p-2.5"
                            @input="searchItems(itemQuery)"
                            @focus="showItemDropdown = true"
                            @blur="closeItemsDropdownDelayed"
                        />
                        <ul v-if="showItemDropdown && itemResults.length > 0" class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow max-h-56 overflow-auto">
                            <li
                                v-for="item in itemResults"
                                :key="item.id"
                                class="px-3 py-2 hover:bg-[#006d8f]/5 cursor-pointer"
                                @mousedown.prevent="selectedItem = item; itemQuery = item.nombre; itemPrecio = item.precioReferencia; showItemDropdown = false"
                            >
                                <p class="text-sm font-medium text-gray-900">{{ item.nombre }}</p>
                                <p class="text-xs text-gray-500">Ref: {{ currency.format(item.precioReferencia) }}</p>
                            </li>
                        </ul>
                        <div v-if="itemLoading" class="text-xs text-gray-400 mt-1">Buscando...</div>
                    </div>
                    <div>
                        <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1">Cantidad</label>
                        <input v-model.number="itemCantidad" type="number" min="1" class="block w-full border border-gray-300 rounded-md p-2.5" />
                    </div>
                    <div>
                        <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1">Precio unitario ingreso</label>
                        <input v-model.number="itemPrecio" type="number" min="0" class="block w-full border border-gray-300 rounded-md p-2.5" />
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="button" class="inline-flex items-center gap-2 rounded-md bg-[#006d8f] text-white px-4 py-2 text-sm hover:bg-[#005876]" @click="addDetalle">
                        <Plus class="w-4 h-4" />
                        Agregar ítem
                    </button>
                </div>

                <div v-if="detalles.length > 0" class="overflow-x-auto border border-gray-100 rounded-md">
                    <table class="min-w-full divide-y divide-gray-100">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio Unit.</th>
                                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                                <th class="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            <tr v-for="(detalle, index) in detalles" :key="`${detalle.itemCatalogoId}-${index}`">
                                <td class="px-4 py-3 text-sm text-gray-800">{{ detalle.nombre }}</td>
                                <td class="px-4 py-3 text-sm text-gray-700">{{ detalle.cantidad }}</td>
                                <td class="px-4 py-3 text-sm text-gray-700">{{ currency.format(detalle.precioUnitarioIngreso) }}</td>
                                <td class="px-4 py-3 text-sm font-semibold text-right text-gray-900">
                                    {{ currency.format(detalle.cantidad * detalle.precioUnitarioIngreso) }}
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <button type="button" class="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700" @click="removeDetalle(index)">
                                        <Trash2 class="w-4 h-4" />
                                        Quitar
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="flex justify-end">
                <button
                    type="submit"
                    :disabled="submitting"
                    class="inline-flex items-center gap-2 rounded-md bg-[#006d8f] text-white px-5 py-3 text-sm font-semibold hover:bg-[#005876] disabled:opacity-60"
                >
                    <Loader2 v-if="submitting" class="w-4 h-4 animate-spin" />
                    Registrar compra
                </button>
            </div>
        </form>

        <section v-if="ultimaCompraBoleta" class="bg-white rounded-xl border border-gray-100 shadow p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p class="text-sm font-semibold text-gray-800">Última compra registrada: #{{ ultimaCompraBoleta.idIngreso }}</p>
                    <p class="text-xs text-gray-500">
                        {{ ultimaCompraBoleta.tieneBoleta ? 'Boleta disponible' : 'Sin boleta adjunta' }}
                    </p>
                </div>
                <button
                    v-if="ultimaCompraBoleta.tieneBoleta"
                    type="button"
                    class="inline-flex items-center gap-2 rounded-md border border-[#006d8f]/30 text-[#006d8f] px-3 py-2 text-sm hover:bg-[#006d8f]/5"
                    @click="abrirBoletaUltimaCompra"
                >
                    <ExternalLink class="w-4 h-4" />
                    Ver boleta
                </button>
            </div>
        </section>
    </div>
</template>
