<script setup lang="ts">
import EntidadSelector from '../components/EntidadSelector.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { Boxes, HandCoins, Loader2, Plus, ScanBarcode, Trash2 } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import type { CatalogoItem, Cuenta, EgresoPayload, EntidadResumen, LineaEscaneada, MetodoTransferencia } from '../types';
import EscanerCodigos from '../components/EscanerCodigos.vue';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../utils/formDraft';
import { integerFromInput } from '../utils/integerInput';
import InlineDateControl from '../components/InlineDateControl.vue';
import CantidadStepper from '../components/CantidadStepper.vue';
import { errorCantidad, redondearCantidad } from '../utils/cantidad';

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

const resolvingResponsable = ref(false);
const selectedResponsable = ref<EntidadResumen | null>(null);
const selectedDestino = ref<EntidadResumen | null>(null);

const itemQuery = ref('');
const itemResults = ref<CatalogoItem[]>([]);
const itemLoading = ref(false);
const showItemDropdown = ref(false);
const selectedItem = ref<CatalogoItem | null>(null);
const itemCantidad = ref(1);
const showEscaner = ref(false);

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
const esAjuste = computed(() => props.mode === 'ajusteBienes' || props.mode === 'ajustePecuniario');
// Ambos ajustes eligen sentido: "Egreso" (falta) se registra como egreso; "Ingreso" (sobra) como ingreso de ajuste.
const showAjusteSentido = esAjuste;
const esAjusteEntrada = computed(() => esAjuste.value && form.value.sentidoAjuste === 'Ingreso');
// Un ajuste es una corrección interna: no hay contraparte obligatoria.
const entidadObligatoria = computed(() => !esAjuste.value);
const entidadLabel = computed(() => (esAjuste.value ? 'Entidad relacionada (opcional)' : 'Entidad destino'));
const tituloFormulario = computed(() => {
    if (esAjuste.value) {
        const base = props.mode === 'ajusteBienes' ? 'Ajuste de bienes' : 'Ajuste pecuniario';
        return `${base} · ${esAjusteEntrada.value ? 'entrada (sobra)' : 'salida (falta)'}`;
    }
    return form.value.modo === 'pecuniario' ? 'Egreso pecuniario' : 'Egreso en especie';
});
const cuentaLabel = computed(() => (esAjusteEntrada.value ? 'Cuenta que recibe el ajuste' : 'Cuenta origen'));
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
    selectedResponsable.value = null;
    resolvingResponsable.value = true;
    try {
        selectedResponsable.value = await resolveCurrentResponsible();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo resolver el responsable interno.');
    } finally {
        resolvingResponsable.value = false;
    }
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

const closeItemDropdownDelayed = () => {
    setTimeout(() => (showItemDropdown.value = false), 200);
};

type EgresoDraft = {
    form: typeof form.value;
    selectedDestino: EntidadResumen | null;
};

const restoreDraft = () => {
    const draft = loadFormDraft<EgresoDraft>(draftKey.value);
    if (!draft) return;
    form.value = { ...form.value, ...draft.form };
    selectedDestino.value = draft.selectedDestino;
};

const persistDraft = () => {
    if (!draftReady.value) return;
    saveFormDraft(draftKey.value, {
        form: form.value,
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
    itemQuery.value = '';
    itemResults.value = [];
    showItemDropdown.value = false;
    selectedItem.value = null;
    itemCantidad.value = 1;
};

const addItemToList = () => {
    const errorItem = selectedItem.value ? errorCantidad(itemCantidad.value, selectedItem.value.unidadMedidaEstandar) : null;
    if (!selectedItem.value || errorItem) {
        setMessage('error', errorItem || 'Debes seleccionar un ítem con una cantidad válida.');
        return;
    }
    // Al agregar a mano también se respeta el stock (sumando lo que ya está en la lista), igual que el escáner.
    if (!catalogoById.value.has(selectedItem.value.id)) catalogo.value = [...catalogo.value, selectedItem.value];
    const disponible = disponibleParaAgregar(selectedItem.value.id);
    if (disponible != null && Number(itemCantidad.value) > disponible) {
        setMessage('error', `Stock insuficiente: quedan ${Math.max(0, disponible)} ${unitLabel(selectedItem.value)}.`);
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

// Un ajuste de entrada suma stock; todo lo demás lo descuenta y no puede pasar del disponible.
const descuentaStock = computed(() => !esAjusteEntrada.value);

// Stock del catálogo cargado (misma fuente que usa el escáner). null = sin dato o sin tope.
const stockDe = (itemId: number | null) => {
    if (!descuentaStock.value || !itemId) return null;
    const item = catalogoById.value.get(itemId);
    return item ? Number(item.stockActual || 0) : null;
};
const cantidadEnLista = (itemId: number | null, exceptoIndex = -1) =>
    form.value.detalles.reduce((sum, d, i) => (i !== exceptoIndex && d.itemCatalogoId === itemId ? sum + Number(d.cantidad || 0) : sum), 0);
const disponibleParaAgregar = (itemId: number) => {
    const stock = stockDe(itemId);
    return stock == null ? null : redondearCantidad(stock - cantidadEnLista(itemId));
};
// Tope de una línea: el stock menos lo que ya ocupan otras líneas del mismo ítem.
const maxLinea = (index: number) => {
    const detalle = form.value.detalles[index];
    const stock = detalle ? stockDe(detalle.itemCatalogoId) : null;
    return stock == null || !detalle ? null : redondearCantidad(stock - cantidadEnLista(detalle.itemCatalogoId, index));
};
const lineaSinStock = (index: number) => {
    const max = maxLinea(index);
    return max != null && Number(form.value.detalles[index]?.cantidad || 0) > max;
};
const lineaConError = (index: number) => {
    const detalle = form.value.detalles[index];
    if (!detalle) return null;
    if (lineaSinStock(index)) return `Supera el stock: hay ${stockDe(detalle.itemCatalogoId)} ${unitLabel(catalogoById.value.get(detalle.itemCatalogoId || 0))}.`;
    return errorCantidad(detalle.cantidad, catalogoById.value.get(detalle.itemCatalogoId || 0)?.unidadMedidaEstandar);
};
const hayLineaSinStock = computed(() => usesItems.value && form.value.detalles.some((_, index) => lineaSinStock(index)));

const validarEscaneado = (linea: LineaEscaneada): string | null => {
    if (!descuentaStock.value || !linea.itemCatalogoId) return null;
    const item = catalogoById.value.get(linea.itemCatalogoId);
    if (!item) return null;
    const enLista = form.value.detalles
        .filter(detalle => detalle.itemCatalogoId === linea.itemCatalogoId)
        .reduce((sum, detalle) => sum + Number(detalle.cantidad || 0), 0);
    const disponible = Number(item.stockActual || 0) - enLista;
    return linea.cantidad > disponible
        ? `Stock insuficiente: quedan ${Math.max(0, disponible)} ${unitLabel(item)}.`
        : null;
};

// Lectura del escáner: misma lista de ítems; si ya está, suma la cantidad.
const agregarEscaneado = async (linea: LineaEscaneada) => {
    if (!linea.itemCatalogoId) return;
    if (!catalogoById.value.has(linea.itemCatalogoId)) {
        try { catalogo.value = await apiService.getCatalogoItems(); } catch { /* el nombre se muestra con su ID */ }
    }
    const existente = form.value.detalles.find(detalle => detalle.itemCatalogoId === linea.itemCatalogoId);
    if (existente) existente.cantidad = Math.round((Number(existente.cantidad || 0) + linea.cantidad) * 1000) / 1000;
    else form.value.detalles.push({ itemCatalogoId: linea.itemCatalogoId, cantidad: linea.cantidad });
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
    if (entidadObligatoria.value && !selectedDestino.value) {
        setMessage('error', 'Debes seleccionar una entidad destino.');
        return null;
    }
    if (esAjuste.value && !form.value.anotaciones.trim()) {
        setMessage('error', 'Indica el motivo del ajuste.');
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
    if (usesItems.value) {
        const index = form.value.detalles.findIndex((_, i) => lineaConError(i));
        if (index !== -1) {
            const detalle = form.value.detalles[index]!;
            setMessage('error', `${catalogoById.value.get(detalle.itemCatalogoId || 0)?.nombre || `Ítem #${detalle.itemCatalogoId}`}: ${lineaConError(index)}`);
            return null;
        }
    }

    if (usesPecuniario.value) {
        if (!form.value.cuentaOrigenId) {
            setMessage('error', 'Debes seleccionar una cuenta de origen.');
            return null;
        }
        if (!esAjuste.value && !form.value.metodoTransferencia) {
            setMessage('error', 'Debes seleccionar un método de transferencia.');
            return null;
        }
        if (Number(form.value.montoManual || 0) <= 0) {
            setMessage('error', 'El monto total debe ser mayor a cero.');
            return null;
        }
    }

    const anotacionesFinales = form.value.anotaciones.trim();

    const payload: EgresoPayload = {
        egreso: {
            fecha: form.value.fecha,
            tipoEgreso: normalizeTipo(lockedTipo.value || form.value.tipoEgreso || 'Ayuda Social'),
            montoTotal: usesItems.value ? totalItems.value : Number(form.value.montoManual || 0),
            responsableInternoId: selectedResponsable.value.id,
            destinoEntidadId: selectedDestino.value?.id,
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
        if (esAjusteEntrada.value) {
            // Sobra: entra como ingreso de ajuste (suma stock o saldo), no como egreso.
            const response = await apiService.registrarAjusteIngreso({
                ingreso: {
                    fecha: payload.egreso.fecha,
                    responsableInternoId: payload.egreso.responsableInternoId,
                    origenEntidadId: payload.egreso.destinoEntidadId,
                    anotaciones: payload.egreso.anotaciones || '',
                    montoTotal: usesPecuniario.value ? payload.egreso.montoTotal : undefined
                },
                items: usesItems.value
                    ? payload.detalles?.map(d => ({ itemCatalogoId: Number(d.itemCatalogoId), cantidad: Number(d.cantidad) }))
                    : undefined,
                pecuniario: usesPecuniario.value && payload.pecuniario
                    ? { cuentaDestinoId: Number(payload.pecuniario.cuentaOrigenId), metodoTransferencia: payload.pecuniario.metodoTransferencia || undefined }
                    : undefined
            });
            setMessage('success', `Ajuste de entrada registrado (ingreso ID ${response.id_ingreso}).`);
            resetForm();
            return;
        }
        const response = await apiService.crearEgreso(payload);
        setMessage('success', `${esAjuste.value ? 'Ajuste de salida' : 'Egreso'} registrado correctamente (ID ${response.id}).`);
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

        <div v-if="showKindTabs" class="page-toolbar">
            <div class="segmented" role="tablist" aria-label="Tipo de egreso">
                <button
                    type="button"
                    role="tab"
                    :aria-selected="form.modo === 'pecuniario'"
                    :class="{ 'is-active': form.modo === 'pecuniario' }"
                    @click="form.modo = 'pecuniario'"
                >
                    <HandCoins class="w-4 h-4" /> Pecuniario
                </button>
                <button
                    type="button"
                    role="tab"
                    :aria-selected="form.modo === 'items'"
                    :class="{ 'is-active': form.modo === 'items' }"
                    @click="form.modo = 'items'"
                >
                    <Boxes class="w-4 h-4" /> En especie
                </button>
            </div>
        </div>

        <div class="form-shell">
            <div class="form-shell-header flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <h3 class="text-base font-semibold text-[var(--text-primary)]">{{ tituloFormulario }}</h3>
                <div class="flex flex-wrap items-center gap-3">
                    <InlineDateControl v-model="form.fecha" />
                    <button
                        type="button"
                        class="btn-ghost h-9 px-3 text-sm"
                        @click="resetForm()"
                    >
                        Limpiar
                    </button>
                </div>
            </div>

            <div class="p-5">
                <div>
                    <form class="space-y-4" @submit.prevent="submitForm">
                        <section
                            class="grid grid-cols-1 md:grid-cols-2 gap-4"
                            :class="usesItems ? 'form-panel' : ''"
                        >
                            <div v-if="usesItems" class="md:col-span-2">
                                <h4 class="form-section-title !mb-0">1 · Actores</h4>
                            </div>
                            <EntidadSelector
                                v-model="selectedResponsable"
                                class="md:col-span-2"
                                label="Responsable interno"
                                required
                                :locked="!canChangeResponsible || resolvingResponsable"
                                locked-hint="Asignado automáticamente desde Authentik"
                            >
                                <template #locked-empty>
                                    <span v-if="resolvingResponsable">Resolviendo responsable interno...</span>
                                    <span v-else class="text-red-600">No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.</span>
                                </template>
                            </EntidadSelector>

                            <EntidadSelector
                                v-model="selectedDestino"
                                class="md:col-span-2"
                                :label="entidadLabel"
                                :required="entidadObligatoria"
                                crear-persona
                            />

                            <div v-if="showAjusteSentido" class="md:col-span-2">
                                <label>Tipo de ajuste <span class="text-red-500">*</span></label>
                                <select
                                    v-model="form.sentidoAjuste"
                                    class="mt-1 compact-control"
                                >
                                    <option value="Egreso">Egreso · falta (descuenta {{ mode === 'ajusteBienes' ? 'stock' : 'saldo' }})</option>
                                    <option value="Ingreso">Ingreso · sobra (suma {{ mode === 'ajusteBienes' ? 'stock' : 'saldo' }})</option>
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
                                <label>{{ esAjuste ? 'Motivo del ajuste' : anotacionesLabel }} <span v-if="esAjuste" class="text-red-500">*</span></label>
                                <textarea
                                    v-model="form.anotaciones"
                                    rows="2"
                                    :placeholder="esAjuste ? 'Ej: conteo físico del 01-11, faltan 3 kg de arroz' : 'Describe el contexto del egreso...'"
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
                                    <label>{{ cuentaLabel }} <span class="text-red-500">*</span></label>
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
                                <div v-if="!esAjuste">
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
                                <h4 class="form-section-title">2 · Ítems</h4>
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
                                        <div class="flex gap-2">
                                            <input
                                                v-model="itemQuery"
                                                type="text"
                                                placeholder="Buscar ítem por nombre..."
                                                class="compact-control flex-1"
                                                @input="searchItems(itemQuery)"
                                                @focus="showItemDropdown = true"
                                                @blur="closeItemDropdownDelayed"
                                            />
                                            <button type="button" class="btn-secondary h-10 shrink-0 px-3" @click="showItemDropdown = false; showEscaner = true">
                                                <ScanBarcode class="h-4 w-4" /> Escanear
                                            </button>
                                        </div>
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
                                <h4 class="form-section-title">3 · Agregados</h4>
                                <div class="overflow-x-auto">
                                    <table class="min-w-full divide-y divide-gray-100">
                                        <thead class="bg-[var(--surface-muted)]">
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
                                            <tr v-for="(detalle, index) in form.detalles" :key="`${detalle.itemCatalogoId}-${index}`" :class="{ 'bg-red-50 dark:bg-red-950/30': lineaSinStock(index) }">
                                                <td class="px-3 py-2.5 text-sm">
                                                    <p class="font-medium text-[var(--text-primary)]">{{ catalogoById.get(detalle.itemCatalogoId || 0)?.nombre || `Ítem #${detalle.itemCatalogoId}` }}</p>
                                                    <p v-if="stockDe(detalle.itemCatalogoId) != null" class="text-xs" :class="lineaSinStock(index) ? 'font-semibold text-red-600' : 'text-[var(--text-muted)]'">
                                                        Stock {{ stockDe(detalle.itemCatalogoId) }} {{ unitLabel(catalogoById.get(detalle.itemCatalogoId || 0) || null) }}
                                                    </p>
                                                </td>
                                                <td class="px-3 py-2">
                                                    <CantidadStepper
                                                        v-model="detalle.cantidad"
                                                        :unidad="catalogoById.get(detalle.itemCatalogoId || 0)?.unidadMedidaEstandar"
                                                        :max="maxLinea(index)"
                                                        :invalid="lineaSinStock(index)"
                                                    />
                                                    <p v-if="lineaConError(index)" class="mt-1 text-xs font-medium text-red-600">{{ lineaConError(index) }}</p>
                                                </td>
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

                        <div class="form-actions flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <p class="text-sm text-[var(--text-muted)]">
                                Total <strong class="ml-1 text-lg text-[var(--text-primary)]">{{ currency.format(montoCalculado) }}</strong>
                            </p>
                            <button type="submit" :disabled="submitting || loadingOptions || hayLineaSinStock" :title="hayLineaSinStock ? 'Hay ítems que superan el stock disponible' : undefined" class="btn-primary h-10 w-full justify-center px-6 md:w-auto">
                                <Loader2 v-if="submitting" class="w-4 h-4 mr-2 animate-spin" />
                                {{ submitting ? 'Guardando...' : (esAjuste ? 'Registrar ajuste' : 'Registrar egreso') }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
    <EscanerCodigos
        v-if="showEscaner"
        solo-catalogo
        :con-precio="false"
        :validar="validarEscaneado"
        titulo="Escanear ítems del egreso"
        @agregar="agregarEscaneado"
        @close="showEscaner = false"
    />
</template>
