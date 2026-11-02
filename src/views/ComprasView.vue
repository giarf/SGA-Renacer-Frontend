<script setup lang="ts">
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import AgregarPersonaRapida from '../components/AgregarPersonaRapida.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ExternalLink, FileImage, Loader2, Plus, ScanBarcode, Trash2, X } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import type { CatalogoItem, CompraBoletaMetadata, CompraIngresoPayload, Cuenta, EntidadResumen, LineaEscaneada } from '../types';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../utils/formDraft';
import { integerFromInput } from '../utils/integerInput';
import InlineDateControl from '../components/InlineDateControl.vue';
import EscanerCodigos from '../components/EscanerCodigos.vue';
import { fusionarLinea } from '../utils/barcode';

const today = new Date().toISOString().split('T')[0] ?? '';

const cuentas = ref<Cuenta[]>([]);
const cuentasLoading = ref(false);
const selectedCuentaId = ref<number | null>(null);

const proveedorQuery = ref('');
const proveedorResults = ref<EntidadResumen[]>([]);
const proveedorLoading = ref(false);
const showProveedorDropdown = ref(false);
const selectedProveedor = ref<EntidadResumen | null>(null);

// Persona no encontrada en el buscador: alta rápida y queda seleccionada.
const crearPersona = ref({ abierto: false, busqueda: '' });
const abrirCrearPersona = (busqueda: string) => {
    crearPersona.value = { abierto: true, busqueda };
};
const personaCreada = (_rut: string, _id?: number, entidad?: EntidadResumen) => {
    if (!entidad) return;
    selectedProveedor.value = entidad;
    proveedorQuery.value = '';
    showProveedorDropdown.value = false;
};

const responsableQuery = ref('');
const responsableResults = ref<EntidadResumen[]>([]);
const responsableLoading = ref(false);
const resolvingResponsable = ref(false);
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
const boletaInputRef = ref<HTMLInputElement | null>(null);
const ultimaCompraBoleta = ref<CompraBoletaMetadata | null>(null);

type CompraDetalleLocal = {
    /** Falta en productos nuevos escaneados: el backend lo busca por código/nombre o lo crea. */
    itemCatalogoId?: number;
    nombre: string;
    cantidad: number;
    precioUnitarioIngreso: number;
    codigoBarras?: string;
    categoria?: string;
    unidad?: string;
};

const showEscaner = ref(false);

const detalles = ref<CompraDetalleLocal[]>([]);
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const draftReady = ref(false);
const draftKey = 'draft:operacion-diaria:compras';
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

const loadCurrentResponsible = async () => {
    selectedResponsable.value = null;
    resolvingResponsable.value = true;
    try {
        selectedResponsable.value = await resolveCurrentResponsible();
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudo resolver el responsable interno.' };
    } finally {
        resolvingResponsable.value = false;
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

const openBoletaPicker = () => {
    boletaInputRef.value?.click();
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
        precioUnitarioIngreso: itemPrecio.value,
        codigoBarras: selectedItem.value.codigoBarras || undefined
    });
    selectedItem.value = null;
    itemQuery.value = '';
    itemCantidad.value = 1;
    itemPrecio.value = 0;
    message.value = null;
};

// Lectura del escáner: entra a la misma lista; si el código ya está, suma cantidad.
const agregarEscaneado = (linea: LineaEscaneada) => {
    detalles.value = fusionarLinea(detalles.value, {
        itemCatalogoId: linea.itemCatalogoId,
        nombre: linea.nombre,
        cantidad: linea.cantidad,
        precioUnitarioIngreso: linea.precio,
        codigoBarras: linea.codigoBarras,
        categoria: linea.categoria,
        unidad: linea.unidad
    }).lista;
    message.value = null;
};

const removeDetalle = (index: number) => {
    detalles.value.splice(index, 1);
};

type CompraDraft = {
    selectedCuentaId: number | null;
    selectedProveedor: EntidadResumen | null;
    fecha: string;
    numeroFacturaBoleta: string;
    montoNeto: number;
    montoIva: number;
    detalles: CompraDetalleLocal[];
};

const restoreDraft = () => {
    const draft = loadFormDraft<CompraDraft>(draftKey);
    if (!draft) return;
    selectedCuentaId.value = draft.selectedCuentaId;
    selectedProveedor.value = draft.selectedProveedor;
    fecha.value = draft.fecha;
    numeroFacturaBoleta.value = draft.numeroFacturaBoleta;
    montoNeto.value = draft.montoNeto;
    montoIva.value = draft.montoIva;
    detalles.value = draft.detalles ?? [];
};

const persistDraft = () => {
    if (!draftReady.value) return;
    saveFormDraft(draftKey, {
        selectedCuentaId: selectedCuentaId.value,
        selectedProveedor: selectedProveedor.value,
        fecha: fecha.value,
        numeroFacturaBoleta: numeroFacturaBoleta.value,
        montoNeto: montoNeto.value,
        montoIva: montoIva.value,
        detalles: detalles.value
    } satisfies CompraDraft);
};

const resetForm = () => {
    clearFormDraft(draftKey);
    selectedProveedor.value = null;
    proveedorQuery.value = '';
    proveedorResults.value = [];
    if (canChangeResponsible.value) {
        selectedResponsable.value = null;
        responsableQuery.value = '';
    }
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
            precioUnitarioIngreso: item.precioUnitarioIngreso,
            codigoBarras: item.codigoBarras || undefined,
            // Solo para ítems nuevos (sin itemCatalogoId): datos para crearlos en el catálogo.
            ...(item.itemCatalogoId ? {} : { nombre: item.nombre, categoria: item.categoria, unidad: item.unidad })
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

watch([selectedCuentaId, selectedProveedor, selectedResponsable, fecha, numeroFacturaBoleta, montoNeto, montoIva, detalles], persistDraft, { deep: true });

onMounted(async () => {
    await Promise.all([loadCuentas(), loadCurrentResponsible()]);
    restoreDraft();
    draftReady.value = true;
});
onBeforeUnmount(clearBoletaPreview);
</script>

<template>
    <div class="form-page space-y-4">
        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>

        <form @submit.prevent="submitCompra" class="form-shell">
            <div class="form-shell-header flex items-center justify-between gap-3 border-b px-5 py-3">
                <h3 class="text-base font-semibold text-[var(--text-primary)]">Nueva compra</h3>
                <InlineDateControl v-model="fecha" />
            </div>
            <div class="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Proveedor / Origen <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedProveedor" class="selected-card p-3">
                        <p class="font-semibold text-[#006d8f]">{{ selectedProveedor.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedProveedor.identificador) }}</p>
                        <button type="button" class="text-xs text-gray-600 underline mt-1" @click="selectedProveedor = null">Cambiar</button>
                    </div>
                    <div v-else>
                        <input
                            v-model="proveedorQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            class="compact-control"
                            @input="searchProveedor(proveedorQuery)"
                            @focus="showProveedorDropdown = true"
                            @blur="closeProveedorDropdownDelayed"
                        />
                        <div v-if="proveedorLoading" class="absolute right-3 top-10 text-xs text-gray-400">Buscando...</div>
                        <ul v-if="showProveedorDropdown && proveedorResults.length > 0" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-auto">
                            <li
                                v-for="entidad in proveedorResults"
                                :key="entidad.id"
                                @mousedown.prevent="selectedProveedor = entidad; proveedorQuery = ''; showProveedorDropdown = false"
                            >
                                <p class="text-sm font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                            </li>
                        </ul>
                        <div v-else-if="showProveedorDropdown && !proveedorLoading && proveedorQuery.trim().length >= 2" class="dropdown-panel absolute z-20 mt-1 w-full">
                            <AgregarPersonaRapida :query="proveedorQuery" @agregar="abrirCrearPersona(proveedorQuery)" />
                        </div>
                    </div>
                </div>

                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Responsable interno <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedResponsable" class="selected-card p-3">
                        <p class="font-semibold text-[#006d8f]">{{ selectedResponsable.nombreCompleto }}</p>
                        <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedResponsable.identificador) }}</p>
                        <p v-if="!canChangeResponsible" class="text-xs text-gray-500 mt-1">Asignado automáticamente desde Authentik</p>
                        <button v-else type="button" class="text-xs text-gray-600 underline mt-1" @click="selectedResponsable = null">Cambiar</button>
                    </div>
                    <div v-else-if="resolvingResponsable" class="form-panel-muted p-3 text-sm text-[var(--text-muted)]">
                        Resolviendo responsable interno...
                    </div>
                    <div v-else>
                        <input
                            v-if="canChangeResponsible"
                            v-model="responsableQuery"
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            class="compact-control"
                            @input="searchResponsable(responsableQuery)"
                            @focus="showResponsableDropdown = true"
                            @blur="closeResponsableDropdownDelayed"
                        />
                        <div v-else class="message-banner message-error">
                            No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.
                        </div>
                        <div v-if="responsableLoading" class="absolute right-3 top-10 text-xs text-gray-400">Buscando...</div>
                        <ul v-if="showResponsableDropdown && responsableResults.length > 0" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-auto">
                            <li
                                v-for="entidad in responsableResults"
                                :key="entidad.id"
                                @mousedown.prevent="selectedResponsable = entidad; responsableQuery = ''; showResponsableDropdown = false"
                            >
                                <p class="text-sm font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 border-t border-[var(--card-border)] px-5 py-4 md:grid-cols-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto neto</label>
                    <input :value="montoNeto" type="text" inputmode="numeric" pattern="[0-9]*" class="compact-control" @input="montoNeto = integerFromInput($event)" />
                </div>
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Cuenta origen <span class="text-red-500">*</span>
                    </label>
                    <div v-if="cuentasLoading" class="text-sm text-gray-500 mt-2">Cargando cuentas...</div>
                    <select
                        v-else
                        v-model="selectedCuentaId"
                        class="compact-control"
                        required
                    >
                        <option v-for="cuenta in cuentas" :key="cuenta.id" :value="cuenta.id">
                            {{ cuenta.nombre }} - Saldo: {{ currency.format(cuenta.saldoActual || 0) }}
                        </option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-4 px-5 pb-4 md:grid-cols-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto IVA</label>
                    <input :value="montoIva" type="text" inputmode="numeric" pattern="[0-9]*" class="compact-control" @input="montoIva = integerFromInput($event)" />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Monto total ingreso</label>
                    <input :value="currency.format(montoTotal)" type="text" class="compact-control bg-[var(--surface-muted)] text-[var(--text-muted)]" readonly />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Factura/Boleta</label>
                    <input v-model="numeroFacturaBoleta" type="text" placeholder="F-0001" class="compact-control" />
                </div>
            </div>

            <div class="form-section border-t border-[var(--card-border)]">
                <h4 class="form-section-title">Boleta (opcional)</h4>

                <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <button
                        type="button"
                        class="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-muted)] ring-1 ring-[var(--card-border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
                        aria-label="Adjuntar boleta"
                        @click="openBoletaPicker"
                    >
                        <img
                            v-if="boletaPreviewUrl"
                            :src="boletaPreviewUrl"
                            alt="Vista previa boleta"
                            class="h-full w-full object-cover transition duration-200 group-hover:brightness-75"
                        >
                        <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--text-muted)] transition duration-200 group-hover:text-[var(--accent-color)]">
                            <FileImage class="h-7 w-7" />
                            <span class="text-[0.7rem] font-semibold">Foto o PDF</span>
                        </div>
                    </button>
                    <div class="flex-1 space-y-2">
                        <input
                            ref="boletaInputRef"
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            class="sr-only"
                            @change="onBoletaInputChange"
                        >
                        <div v-if="boletaFile" class="flex items-center justify-between gap-2">
                            <div class="min-w-0">
                                <p class="truncate text-sm font-medium text-[var(--text-primary)]">{{ boletaFile.name }}</p>
                                <p class="text-xs text-[var(--text-muted)]">{{ (boletaFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                            </div>
                            <button type="button" class="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700" @click="removeBoleta">
                                <X class="w-3.5 h-3.5" />
                                Quitar
                            </button>
                        </div>
                        <button
                            v-else
                            type="button"
                            class="btn-ghost h-9 px-3 text-sm"
                            @click="openBoletaPicker"
                        >
                            <FileImage class="w-4 h-4" />
                            Adjuntar boleta
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-section space-y-4">
                <h4 class="form-section-title !mb-0">Ítems</h4>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div class="md:col-span-2 relative">
                        <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1">Ítem catálogo</label>
                        <div class="flex gap-2">
                            <input
                                v-model="itemQuery"
                                type="text"
                                placeholder="Buscar ítem..."
                                class="compact-control flex-1"
                                @input="searchItems(itemQuery)"
                                @focus="showItemDropdown = true"
                                @blur="closeItemsDropdownDelayed"
                            />
                            <button type="button" class="btn-secondary h-10 shrink-0 px-3" @click="showEscaner = true">
                                <ScanBarcode class="h-4 w-4" /> Escanear
                            </button>
                        </div>
                        <ul v-if="showItemDropdown && itemResults.length > 0" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-auto">
                            <li
                                v-for="item in itemResults"
                                :key="item.id"
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
                        <input v-model.number="itemCantidad" type="number" min="1" class="compact-control" />
                    </div>
                    <div>
                        <label class="block text-xs uppercase tracking-wide text-gray-500 mb-1">Precio unitario ingreso</label>
                        <input :value="itemPrecio" type="text" inputmode="numeric" pattern="[0-9]*" class="compact-control" @input="itemPrecio = integerFromInput($event)" />
                    </div>
                </div>

                <div class="flex justify-end">
                    <button type="button" class="btn-primary h-10 px-4" @click="addDetalle">
                        <Plus class="w-4 h-4" />
                        Agregar ítem
                    </button>
                </div>

                <div v-if="detalles.length > 0" class="flat-table">
                    <table class="min-w-full divide-y divide-[var(--card-border)]">
                        <thead>
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítem</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio Unit.</th>
                                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</th>
                                <th class="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)]">
                            <tr v-for="(detalle, index) in detalles" :key="`${detalle.itemCatalogoId ?? detalle.codigoBarras}-${index}`">
                                <td class="px-4 py-3 text-sm text-gray-800">
                                    {{ detalle.nombre }}
                                    <span v-if="detalle.codigoBarras" class="block font-mono text-xs text-gray-500">{{ detalle.codigoBarras }}<template v-if="!detalle.itemCatalogoId"> · nuevo</template></span>
                                </td>
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

            <div class="form-actions flex justify-end border-t px-5 py-4">
                <button
                    type="submit"
                    :disabled="submitting"
                    class="btn-primary h-10 px-5 disabled:opacity-60"
                >
                    <Loader2 v-if="submitting" class="w-4 h-4 animate-spin" />
                    Registrar compra
                </button>
            </div>
        </form>

        <section v-if="ultimaCompraBoleta" class="px-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm text-[var(--text-muted)]">
                    Última compra: <strong class="text-[var(--text-primary)]">#{{ ultimaCompraBoleta.idIngreso }}</strong>
                    · {{ ultimaCompraBoleta.tieneBoleta ? 'con boleta' : 'sin boleta' }}
                </p>
                <button
                    v-if="ultimaCompraBoleta.tieneBoleta"
                    type="button"
                    class="btn-ghost h-9 px-3 text-sm"
                    @click="abrirBoletaUltimaCompra"
                >
                    <ExternalLink class="w-4 h-4" />
                    Ver boleta
                </button>
            </div>
        </section>

        <EscanerCodigos
            v-if="showEscaner"
            @agregar="agregarEscaneado"
            @close="showEscaner = false"
        />
    </div>
    <ModalCrearPersona :is-open="crearPersona.abierto" :initial-search="crearPersona.busqueda" @close="crearPersona.abierto = false" @created="personaCreada" />
</template>
