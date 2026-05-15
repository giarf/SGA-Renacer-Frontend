<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Boxes, HandCoins, Loader2, Plus, Trash2 } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import type { CatalogoItem, Cuenta, EgresoPayload, EntidadResumen, MetodoTransferencia } from '../types';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../utils/formDraft';
import { integerFromInput } from '../utils/integerInput';
import InlineDateControl from '../components/InlineDateControl.vue';

type EgresoMode = 'all' | 'ayuda' | 'consumo' | 'ajusteBienes' | 'ajustePecuniario';
type FormKind = 'items' | 'pecuniario';
type AjusteSentido = 'Ingreso' | 'Egreso';

type DetalleForm = {
    itemCatalogoId: number | null;
    cantidad: number;
};

const props = withDefaults(defineProps<{ mode?: EgresoMode }>(), {
    mode: 'all'
});

const transferenciaOptions: MetodoTransferencia[] = ['Transferencia', 'Efectivo', 'Cheque'];
const today = new Date().toISOString().split('T')[0] ?? '';

const form = ref({
    fecha: today,
    tipoEgreso: 'Ayuda Social' as string,
    sentidoAjuste: 'Egreso' as AjusteSentido,
    anotaciones: '',
    propositoEspecifico: '',
    modo: 'items' as FormKind,
    montoManual: 0,
    cuentaOrigenId: null as number | null,
    metodoTransferencia: 'Transferencia' as MetodoTransferencia | '',
    detalles: [] as DetalleForm[]
});

const cuentas = ref<Cuenta[]>([]);
const catalogo = ref<CatalogoItem[]>([]);
const loadingOptions = ref(false);
const submitting = ref(false);
const draftReady = ref(false);

const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const responsableQuery = ref('');
const responsableResults = ref<EntidadResumen[]>([]);
const responsableLoading = ref(false);
const resolvingResponsable = ref(false);
const showResponsableDropdown = ref(false);
const selectedResponsable = ref<EntidadResumen | null>(null);

const destinoQuery = ref('');
const destinoResults = ref<EntidadResumen[]>([]);
const destinoLoading = ref(false);
const showDestinoDropdown = ref(false);
const selectedDestino = ref<EntidadResumen | null>(null);

const itemQuery = ref('');
const itemResults = ref<CatalogoItem[]>([]);
const itemLoading = ref(false);
const showItemDropdown = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);
const itemCantidad = ref(1);

let responsableTimer: ReturnType<typeof setTimeout> | null = null;
let destinoTimer: ReturnType<typeof setTimeout> | null = null;
let itemTimer: ReturnType<typeof setTimeout> | null = null;

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

const unitLabel = (item?: CatalogoItem | null) => item?.unidadMedidaEstandar || 'Unidad';
const roundedPpp = (item?: CatalogoItem | null) => Math.round(Number(item?.precioPromedioPonderado || 0));

const normalizeTipo = (value: string | undefined) => {
    if (!value) return '';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'ayudasocial' || normalized === 'ayuda social') return 'Ayuda Social';
    if (normalized === 'consumointerno' || normalized === 'consumo interno') return 'Consumo Interno';
    if (normalized === 'ajuste') return 'Ajuste';
    return value;
};

const lockedTipo = computed(() => {
    if (props.mode === 'ayuda') return 'Ayuda Social';
    if (props.mode === 'consumo') return 'Consumo Interno';
    if (props.mode === 'ajusteBienes' || props.mode === 'ajustePecuniario') return 'Ajuste';
    return '';
});

const lockedFormMode = computed<FormKind | ''>(() => {
    if (props.mode === 'ajusteBienes') return 'items';
    if (props.mode === 'ajustePecuniario') return 'pecuniario';
    return '';
});

const showKindTabs = computed(() => props.mode !== 'ajusteBienes' && props.mode !== 'ajustePecuniario');
const draftKey = computed(() => `draft:operacion-diaria:egresos:${props.mode}`);

const anotacionesLabel = computed(() =>
    normalizeTipo(form.value.tipoEgreso) === 'Ayuda Social' ? 'Motivo de entrega' : 'Anotaciones'
);

const showProposito = computed(() => normalizeTipo(form.value.tipoEgreso) === 'Consumo Interno');
const showAjusteSentido = computed(() => props.mode === 'ajusteBienes');
const entidadLabel = computed(() => (props.mode === 'ajusteBienes' || props.mode === 'ajustePecuniario' ? 'Entidad' : 'Entidad destino'));
const usesItems = computed(() => form.value.modo === 'items');
const usesPecuniario = computed(() => form.value.modo === 'pecuniario');

const catalogoById = computed(() => {
    const map = new Map<number, CatalogoItem>();
    catalogo.value.forEach(item => map.set(item.id, item));
    return map;
});

const resolveDetallePrice = (detalle: DetalleForm) => {
    const item = detalle.itemCatalogoId ? catalogoById.value.get(detalle.itemCatalogoId) : null;
    return roundedPpp(item);
};

const totalItems = computed(() =>
    form.value.detalles.reduce((sum, detalle) => sum + Number(detalle.cantidad || 0) * resolveDetallePrice(detalle), 0)
);

const montoCalculado = computed(() => (usesItems.value ? totalItems.value : Number(form.value.montoManual || 0)));

const setMessage = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 5000);
};

const applyModeDefaults = () => {
    form.value.tipoEgreso = lockedTipo.value || 'Ayuda Social';
    if (lockedFormMode.value) form.value.modo = lockedFormMode.value;
};

const loadOptions = async () => {
    loadingOptions.value = true;
    try {
        const [cuentasData, catalogoData] = await Promise.all([apiService.getCuentas(), apiService.getCatalogoItems()]);
        cuentas.value = cuentasData;
        catalogo.value = catalogoData;
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudieron cargar cuentas o catálogo.');
    } finally {
        loadingOptions.value = false;
    }
};

const loadCurrentResponsible = async () => {
    resolvingResponsable.value = true;
    try {
        selectedResponsable.value = await resolveCurrentResponsible();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo resolver el responsable interno.');
    } finally {
        resolvingResponsable.value = false;
    }
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

const searchDestino = (query: string) => {
    if (destinoTimer) clearTimeout(destinoTimer);
    if (!query || query.trim().length < 2) {
        destinoResults.value = [];
        return;
    }
    destinoTimer = setTimeout(async () => {
        destinoLoading.value = true;
        try {
            destinoResults.value = await apiService.buscarEntidades(query);
            showDestinoDropdown.value = true;
        } catch {
            destinoResults.value = [];
        } finally {
            destinoLoading.value = false;
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

const closeResponsableDropdownDelayed = () => {
    setTimeout(() => (showResponsableDropdown.value = false), 200);
};

const closeDestinoDropdownDelayed = () => {
    setTimeout(() => (showDestinoDropdown.value = false), 200);
};

const closeItemDropdownDelayed = () => {
    setTimeout(() => (showItemDropdown.value = false), 200);
};

type EgresoDraft = {
    form: typeof form.value;
    selectedResponsable: EntidadResumen | null;
    selectedDestino: EntidadResumen | null;
};

const restoreDraft = () => {
    const draft = loadFormDraft<EgresoDraft>(draftKey.value);
    if (!draft) return;
    form.value = { ...form.value, ...draft.form };
    selectedResponsable.value = draft.selectedResponsable;
    selectedDestino.value = draft.selectedDestino;
};

const persistDraft = () => {
    if (!draftReady.value) return;
    saveFormDraft(draftKey.value, {
        form: form.value,
        selectedResponsable: selectedResponsable.value,
        selectedDestino: selectedDestino.value
    } satisfies EgresoDraft);
};

const resetForm = (clearDraft = true) => {
    if (clearDraft) clearFormDraft(draftKey.value);
    form.value = {
        fecha: today,
        tipoEgreso: lockedTipo.value || 'Ayuda Social',
        sentidoAjuste: 'Egreso',
        anotaciones: '',
        propositoEspecifico: '',
        modo: lockedFormMode.value || 'pecuniario',
        montoManual: 0,
        cuentaOrigenId: null,
        metodoTransferencia: 'Transferencia',
        detalles: []
    };
    if (canChangeResponsible.value) selectedResponsable.value = null;
    selectedDestino.value = null;
    if (canChangeResponsible.value) responsableQuery.value = '';
    destinoQuery.value = '';
    responsableResults.value = [];
    destinoResults.value = [];
    itemQuery.value = '';
    itemResults.value = [];
    showItemDropdown.value = false;
    selectedItem.value = null;
    itemCantidad.value = 1;
};

const addItemToList = () => {
    if (!selectedItem.value || itemCantidad.value <= 0) {
        setMessage('error', 'Debes seleccionar un ítem con una cantidad válida.');
        return;
    }
    form.value.detalles.push({
        itemCatalogoId: selectedItem.value.id,
        cantidad: Number(itemCantidad.value)
    });
    selectedItem.value = null;
    itemQuery.value = '';
    itemCantidad.value = 1;
    showItemDropdown.value = false;
};

const selectItem = (item: CatalogoItem) => {
    selectedItem.value = item;
    itemQuery.value = '';
    showItemDropdown.value = false;
    itemCantidad.value = 1;
};

const removeDetalle = (index: number) => {
    form.value.detalles.splice(index, 1);
};

const getPayload = (): EgresoPayload | null => {
    if (!form.value.fecha) {
        setMessage('error', 'La fecha es obligatoria.');
        return null;
    }
    if (!selectedResponsable.value) {
        setMessage('error', 'Debes seleccionar una persona responsable.');
        return null;
    }
    if (!selectedDestino.value) {
        setMessage('error', 'Debes seleccionar una entidad destino.');
        return null;
    }

    const detallesValidos = form.value.detalles
        .filter(item => item.itemCatalogoId && item.cantidad > 0)
        .map(item => ({
            itemCatalogoId: Number(item.itemCatalogoId),
            cantidad: Number(item.cantidad)
        }));

    if (usesItems.value && detallesValidos.length === 0) {
        setMessage('error', 'Debes agregar al menos un ítem.');
        return null;
    }

    if (usesPecuniario.value) {
        if (!form.value.cuentaOrigenId) {
            setMessage('error', 'Debes seleccionar una cuenta de origen.');
            return null;
        }
        if (!form.value.metodoTransferencia) {
            setMessage('error', 'Debes seleccionar un método de transferencia.');
            return null;
        }
        if (Number(form.value.montoManual || 0) <= 0) {
            setMessage('error', 'El monto total debe ser mayor a cero.');
            return null;
        }
    }

    const anotacionesTexto = form.value.anotaciones.trim();
    const anotacionesFinales = showAjusteSentido.value
        ? `[Ajuste ${form.value.sentidoAjuste}]${anotacionesTexto ? ` ${anotacionesTexto}` : ''}`
        : anotacionesTexto;

    const payload: EgresoPayload = {
        egreso: {
            fecha: form.value.fecha,
            tipoEgreso: normalizeTipo(lockedTipo.value || form.value.tipoEgreso || 'Ayuda Social'),
            montoTotal: usesItems.value ? totalItems.value : Number(form.value.montoManual || 0),
            responsableInternoId: selectedResponsable.value.id,
            destinoEntidadId: selectedDestino.value.id,
            anotaciones: anotacionesFinales || undefined,
            propositoEspecifico: showProposito.value ? form.value.propositoEspecifico.trim() || undefined : undefined
        }
    };

    if (usesItems.value) payload.detalles = detallesValidos;

    if (usesPecuniario.value && form.value.cuentaOrigenId) {
        payload.pecuniario = {
            cuentaOrigenId: Number(form.value.cuentaOrigenId),
            metodoTransferencia: form.value.metodoTransferencia
        };
    }

    return payload;
};

const submitForm = async () => {
    const payload = getPayload();
    if (!payload) return;

    submitting.value = true;
    try {
        const response = await apiService.crearEgreso(payload);
        setMessage('success', `Egreso registrado correctamente (ID ${response.id}).`);
        resetForm();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo registrar el egreso.');
    } finally {
        submitting.value = false;
    }
};

watch(
    () => props.mode,
    () => {
        draftReady.value = false;
        applyModeDefaults();
        resetForm(false);
        restoreDraft();
        draftReady.value = true;
    }
);

watch(
    () => form.value.modo,
    value => {
        if (lockedFormMode.value && value !== lockedFormMode.value) {
            form.value.modo = lockedFormMode.value;
        }
    }
);

watch([form, selectedResponsable, selectedDestino], persistDraft, { deep: true });

onMounted(async () => {
    applyModeDefaults();
    await Promise.all([loadOptions(), loadCurrentResponsible()]);
    restoreDraft();
    draftReady.value = true;
});
</script>

<template>
    <div class="form-page space-y-4">
        <div
            v-if="message"
            :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']"
        >
            {{ message.text }}
        </div>

        <div class="form-shell">
            <div v-if="showKindTabs" class="border-b border-[var(--card-border)] p-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                        class="w-full rounded-lg px-5 py-3 text-sm font-semibold transition text-left"
                        :class="form.modo === 'pecuniario' ? 'bg-[var(--accent-color)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'"
                        @click="form.modo = 'pecuniario'"
                    >
                        <span class="inline-flex items-center gap-2">
                            <HandCoins class="w-4 h-4" /> Egreso Pecuniario
                        </span>
                        <p class="text-xs mt-1" :class="form.modo === 'pecuniario' ? 'text-white/85' : 'text-gray-500'">
                            Cuenta de origen, método de pago y monto.
                        </p>
                    </button>
                    <button
                        class="w-full rounded-lg px-5 py-3 text-sm font-semibold transition text-left"
                        :class="form.modo === 'items' ? 'bg-[var(--accent-color)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'"
                        @click="form.modo = 'items'"
                    >
                        <span class="inline-flex items-center gap-2">
                            <Boxes class="w-4 h-4" /> Egreso en Especie
                        </span>
                        <p class="text-xs mt-1" :class="form.modo === 'items' ? 'text-white/85' : 'text-gray-500'">
                            Catálogo, cantidades y valorización PPP.
                        </p>
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div>
                    <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 class="text-base font-semibold text-gray-900">{{ form.modo === 'pecuniario' ? 'Egreso pecuniario' : 'Egreso en especie' }}</h3>
                            <p class="text-sm text-gray-500">Completa todos los campos.</p>
                        </div>
                        <div class="flex flex-wrap items-start gap-3 sm:justify-end">
                            <InlineDateControl v-model="form.fecha" />
                            <button
                                type="button"
                                class="btn-secondary h-10 px-4 text-sm"
                                @click="resetForm()"
                            >
                                Limpiar
                            </button>
                        </div>
                    </div>

                    <form class="space-y-4" @submit.prevent="submitForm">
                        <section
                            class="grid grid-cols-1 md:grid-cols-2 gap-4"
                            :class="usesItems ? 'form-panel' : ''"
                        >
                            <div v-if="usesItems" class="md:col-span-2">
                                <h3 class="text-base font-semibold text-gray-900 mb-1">1. Identificar actores</h3>
                            </div>
                            <div class="md:col-span-2 relative">
                                <label>Responsable interno <span class="text-red-500">*</span></label>
                                <div v-if="selectedResponsable" class="selected-card mt-1 flex items-center justify-between p-3">
                                    <div>
                                        <p class="font-semibold text-gray-900">{{ selectedResponsable.nombreCompleto }}</p>
                                        <p class="text-xs text-gray-500">{{ formatRutForDisplay(selectedResponsable.identificador) }}</p>
                                    </div>
                                    <button v-if="canChangeResponsible" type="button" class="text-xs text-[#006d8f] hover:underline" @click="selectedResponsable = null">
                                        Cambiar
                                    </button>
                                </div>
                                <div v-else-if="resolvingResponsable" class="form-panel-muted mt-1 p-3 text-sm text-[var(--text-muted)]">
                                    Resolviendo responsable interno...
                                </div>
                                <div v-else class="relative mt-1">
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
                                    <div v-if="responsableLoading" class="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</div>
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

                            <div class="md:col-span-2 relative">
                                <label>{{ entidadLabel }} <span class="text-red-500">*</span></label>
                                <div v-if="selectedDestino" class="selected-card mt-1 flex items-center justify-between p-3">
                                    <div>
                                        <p class="font-semibold text-gray-900">{{ selectedDestino.nombreCompleto }}</p>
                                        <p class="text-xs text-gray-500">{{ formatRutForDisplay(selectedDestino.identificador) }}</p>
                                    </div>
                                    <button type="button" class="text-xs text-[#006d8f] hover:underline" @click="selectedDestino = null">
                                        Cambiar
                                    </button>
                                </div>
                                <div v-else class="relative mt-1">
                                    <input
                                        v-model="destinoQuery"
                                        type="text"
                                        placeholder="Buscar por nombre o RUT..."
                                        class="compact-control"
                                        @input="searchDestino(destinoQuery)"
                                        @focus="showDestinoDropdown = true"
                                        @blur="closeDestinoDropdownDelayed"
                                    />
                                    <div v-if="destinoLoading" class="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</div>
                                    <ul v-if="showDestinoDropdown && destinoResults.length > 0" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-auto">
                                        <li
                                            v-for="entidad in destinoResults"
                                            :key="entidad.id"
                                            @mousedown.prevent="selectedDestino = entidad; destinoQuery = ''; showDestinoDropdown = false"
                                        >
                                            <p class="text-sm font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <div v-if="showAjusteSentido" class="md:col-span-2">
                                <label>Tipo de ajuste <span class="text-red-500">*</span></label>
                                <select
                                    v-model="form.sentidoAjuste"
                                    class="mt-1 compact-control"
                                >
                                    <option value="Egreso">Egreso</option>
                                    <option value="Ingreso">Ingreso</option>
                                </select>
                            </div>

                            <div v-if="showProposito" class="md:col-span-2">
                                <label>Programa / Evento</label>
                                <input
                                    v-model="form.propositoEspecifico"
                                    type="text"
                                    placeholder="Programa de invierno, jornada especial..."
                                    class="mt-1 compact-control"
                                />
                            </div>

                            <div class="md:col-span-2">
                                <label>{{ anotacionesLabel }}</label>
                                <textarea
                                    v-model="form.anotaciones"
                                    rows="2"
                                    placeholder="Describe el contexto del egreso..."
                                    class="mt-1 compact-control"
                                ></textarea>
                            </div>

                            <template v-if="!usesItems">
                                <div class="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label>Monto total <span class="text-red-500">*</span></label>
                                        <input
                                            :value="form.montoManual"
                                            type="text"
                                            inputmode="numeric"
                                            pattern="[0-9]*"
                                            required
                                            class="mt-1 compact-control"
                                            @input="form.montoManual = integerFromInput($event)"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label>Cuenta origen <span class="text-red-500">*</span></label>
                                    <select
                                        v-model.number="form.cuentaOrigenId"
                                        required
                                        class="mt-1 compact-control"
                                    >
                                        <option :value="null" disabled>Seleccionar cuenta</option>
                                        <option v-for="cuenta in cuentas" :key="cuenta.id" :value="cuenta.id">
                                            {{ cuenta.nombre }}
                                        </option>
                                    </select>
                                </div>
                                <div>
                                    <label>Método de transferencia <span class="text-red-500">*</span></label>
                                    <select
                                        v-model="form.metodoTransferencia"
                                        required
                                        class="mt-1 compact-control"
                                    >
                                        <option v-for="metodo in transferenciaOptions" :key="metodo" :value="metodo">{{ metodo }}</option>
                                    </select>
                                </div>
                            </template>
                        </section>

                        <template v-if="usesItems">
                            <section class="form-panel space-y-3">
                                <h3 class="text-sm font-semibold text-gray-900 mb-1">2. Gestión de ítems</h3>
                                <div class="relative">
                                    <label>Buscar Ítem del Catálogo <span class="text-red-500">*</span></label>
                                    <div v-if="selectedItem" class="selected-card mt-1 flex items-center justify-between p-2.5">
                                        <div>
                                            <p class="font-semibold text-gray-900">{{ selectedItem.nombre }}</p>
                                            <p class="text-xs text-gray-500">
                                                Stock: {{ selectedItem.stockActual ?? 0 }} | Precio PPP: {{ currency.format(roundedPpp(selectedItem)) }}
                                            </p>
                                            <p class="text-xs text-gray-500">Unidad: {{ unitLabel(selectedItem) }}</p>
                                        </div>
                                        <button type="button" class="text-xs text-[#006d8f] hover:underline" @click="selectedItem = null">
                                            Cambiar
                                        </button>
                                    </div>
                                    <div v-else class="relative mt-1">
                                        <input
                                            v-model="itemQuery"
                                            type="text"
                                            placeholder="Buscar ítem por nombre..."
                                            class="compact-control"
                                            @input="searchItems(itemQuery)"
                                            @focus="showItemDropdown = true"
                                            @blur="closeItemDropdownDelayed"
                                        />
                                        <div v-if="itemLoading" class="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</div>
                                        <ul v-if="showItemDropdown && itemResults.length > 0" class="dropdown-panel absolute z-20 mt-1 max-h-56 w-full overflow-auto">
                                            <li
                                                v-for="item in itemResults"
                                                :key="item.id"
                                                @mousedown.prevent="selectItem(item)"
                                            >
                                                <p class="text-sm font-medium text-gray-900">{{ item.nombre }}</p>
                                                <p class="text-xs text-gray-500">
                                                    Stock: {{ item.stockActual ?? 0 }} | Precio PPP: {{ currency.format(roundedPpp(item)) }}
                                                </p>
                                                <p class="text-xs text-gray-500">Unidad: {{ unitLabel(item) }}</p>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <div v-if="selectedItem" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label>Cantidad ({{ unitLabel(selectedItem) }}) <span class="text-red-500">*</span></label>
                                        <input
                                            v-model.number="itemCantidad"
                                            type="number"
                                            min="1"
                                            step="0.01"
                                            class="mt-1 compact-control"
                                        />
                                    </div>
                                    <div>
                                        <label>Precio PPP por {{ unitLabel(selectedItem) }}</label>
                                        <input
                                            :value="currency.format(roundedPpp(selectedItem))"
                                            type="text"
                                            readonly
                                            class="mt-1 compact-control cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)]"
                                        />
                                    </div>
                                    <div class="flex items-end">
                                        <button
                                            type="button"
                                            class="btn-secondary h-10 w-full justify-center px-3 text-sm"
                                            @click="addItemToList"
                                        >
                                            <Plus class="w-4 h-4 mr-1" /> Agregar
                                        </button>
                                    </div>
                                </div>
                            </section>

                            <section v-if="form.detalles.length" class="form-panel space-y-3">
                                <h3 class="text-sm font-semibold text-gray-900 mb-1">3. Ítems agregados</h3>
                                <div class="overflow-x-auto rounded-md border border-gray-100">
                                    <table class="min-w-full divide-y divide-gray-100">
                                        <thead class="bg-gray-50">
                                            <tr>
                                                <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ítem</th>
                                                <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cantidad</th>
                                                <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                                                <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">PPP</th>
                                                <th class="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Subtotal</th>
                                                <th class="px-3 py-2.5"></th>
                                            </tr>
                                        </thead>
                                        <tbody class="bg-white divide-y divide-gray-100">
                                            <tr v-for="(detalle, index) in form.detalles" :key="`${detalle.itemCatalogoId}-${index}`">
                                                <td class="px-3 py-2.5 text-sm font-medium text-gray-900">{{ catalogoById.get(detalle.itemCatalogoId || 0)?.nombre || `Ítem #${detalle.itemCatalogoId}` }}</td>
                                                <td class="px-3 py-2.5 text-sm text-gray-700">{{ detalle.cantidad }}</td>
                                                <td class="px-3 py-2.5 text-sm text-gray-700">{{ unitLabel(catalogoById.get(detalle.itemCatalogoId || 0) || null) }}</td>
                                                <td class="px-3 py-2.5 text-sm text-gray-700">{{ currency.format(resolveDetallePrice(detalle)) }}</td>
                                                <td class="px-3 py-2.5 text-sm font-semibold text-gray-900">{{ currency.format(Number(detalle.cantidad || 0) * resolveDetallePrice(detalle)) }}</td>
                                                <td class="px-3 py-2.5 text-right">
                                                    <button type="button" class="inline-flex items-center justify-center px-2 py-2 rounded-md text-red-600 border border-red-200 hover:bg-red-50" @click="removeDetalle(index)">
                                                        <Trash2 class="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </template>

                        <div class="form-panel-muted flex items-center justify-between px-4 py-3 text-sm">
                            <span class="text-gray-600">Monto total del egreso</span>
                            <strong class="text-gray-900">{{ currency.format(montoCalculado) }}</strong>
                        </div>

                        <div class="form-actions flex justify-end border-t pt-4">
                            <button type="submit" :disabled="submitting || loadingOptions" class="btn-primary h-10 w-full justify-center px-6 md:w-auto">
                                <Loader2 v-if="submitting" class="w-4 h-4 mr-2 animate-spin" />
                                {{ submitting ? 'Guardando...' : 'Registrar egreso' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>
