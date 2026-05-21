<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Ban, Clock3, Pencil, Plus, RefreshCw, Printer, FileSpreadsheet, Funnel, Save, X } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import { hasAnyGroup } from '../auth/authService';
import { ADMIN_GROUPS } from '../auth/permissions';
import type { CatalogoItem, CompraBoletaMetadata, CompraResumen, Cuenta, EgresoPayload, EgresoRecurso, IngresoDetalleResponse, IngresoResumen } from '../types';

type LogRegistro = {
    key: string;
    id: number;
    movimiento: 'ingreso' | 'egreso';
    tipo: string;
    fecha: string;
    montoTotal: number;
    estado?: string;
    descripcion?: string;
};

type EditDetalle = {
    id?: number;
    itemCatalogoId: number;
    cantidad: number;
    precio: number;
};

type EditForm = {
    movimiento: 'ingreso' | 'egreso';
    id: number;
    fecha: string;
    montoTotal: number;
    estado?: string;
    tipo?: string;
    responsableInternoId?: number;
    entidadId?: number;
    anotaciones?: string;
    proposito?: string;
    documento?: string;
    cuentaId?: number;
    metodoTransferencia?: string;
    detalles: EditDetalle[];
    rawIngreso?: IngresoDetalleResponse;
    rawEgreso?: EgresoRecurso;
};

const historial = ref<LogRegistro[]>([]);
const ingresos = ref<IngresoResumen[]>([]);
const egresos = ref<EgresoRecurso[]>([]);
const catalogo = ref<CatalogoItem[]>([]);
const cuentas = ref<Cuenta[]>([]);
const compras = ref<CompraResumen[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const boletaLoadingId = ref<number | null>(null);
const anulandoKey = ref<string | null>(null);
const editLoadingKey = ref<string | null>(null);
const editSaving = ref(false);
const editForm = ref<EditForm | null>(null);
const boletaStatus = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.familiarenacer.cl/api').replace(/\/$/, '');
const apiOrigin = apiBaseUrl.replace(/\/api$/, '');

const filtroTipo = ref<'todos' | string>('todos');
const filtroEstado = ref<'todos' | string>('todos');
const filtroPrograma = ref('');
const filtroDesde = ref('');
const filtroHasta = ref('');
const isAdmin = computed(() => hasAnyGroup(ADMIN_GROUPS));

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium'
});

const parseApiDate = (value: string): Date | null => {
    if (!value) return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        return new Date(year, month, day);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const tipoLabels: Record<string, string> = {
    DonacionBienes: 'Donación en especie',
    Donacion: 'Donación',
    DonacionPecuniaria: 'Donación pecuniaria',
    'Ayuda Social': 'Egreso ayuda social',
    'Consumo Interno': 'Egreso consumo interno',
    Ajuste: 'Egreso ajuste'
};

const mapIngresoToLog = (item: IngresoResumen): LogRegistro => ({
    key: `ingreso-${item.id}`,
    id: item.id,
    movimiento: 'ingreso',
    tipo: item.tipo,
    fecha: item.fecha,
    montoTotal: item.montoTotal || 0,
    estado: item.estado,
    descripcion: item.descripcion
});

const mapEgresoToLog = (item: EgresoRecurso): LogRegistro => ({
    key: `egreso-${item.id}`,
    id: item.id,
    movimiento: 'egreso',
    tipo: item.tipoEgreso || 'Ajuste',
    fecha: item.fecha,
    montoTotal: item.montoTotal || 0,
    estado: item.estado,
    descripcion: item.propositoEspecifico || item.anotaciones || `Egreso #${item.id}`
});

const isAnulado = (estado?: string) => (estado || '').toLowerCase() === 'anulado';

const montoVigente = (item: { montoTotal?: number; estado?: string }) => isAnulado(item.estado) ? 0 : Number(item.montoTotal || 0);

const totalIngresosGlobal = computed(() =>
    ingresos.value.reduce((sum, item) => sum + montoVigente(item), 0)
);

const isEgresoPecuniario = (egreso: EgresoRecurso) => {
    const hasPecuniarioInfo = Boolean(
        egreso.egresoPecuniario &&
        (egreso.egresoPecuniario.cuentaOrigenId || egreso.egresoPecuniario.metodoTransferencia)
    );
    const hasItems = Array.isArray(egreso.detalleEgresoRecurso) && egreso.detalleEgresoRecurso.length > 0;
    const tipo = (egreso.tipoEgreso || '').toLowerCase();
    if (hasPecuniarioInfo) return true;
    if (hasItems) return false;
    if (tipo.includes('pecuni')) return true;
    if (tipo.includes('espec')) return false;
    return false;
};

const totalEgresosPecuniarios = computed(() =>
    egresos.value.filter(isEgresoPecuniario).reduce((sum, item) => sum + montoVigente(item), 0)
);

const totalEgresosNoPecuniarios = computed(() =>
    egresos.value.filter(item => !isEgresoPecuniario(item)).reduce((sum, item) => sum + montoVigente(item), 0)
);

const totalFondosGlobal = computed(() =>
    cuentas.value.reduce((sum, cuenta) => sum + Number(cuenta.saldoActual || 0), 0)
);

const totalStockPppGlobal = computed(() =>
    catalogo.value.reduce((sum, item) => {
        const valorInventario = Number(item.valorTotalStock ?? 0);
        if (valorInventario > 0) return sum + valorInventario;
        return sum + Number(item.stockActual || 0) * Math.round(Number(item.precioPromedioPonderado || 0));
    }, 0)
);

const catalogoById = computed(() => {
    const map = new Map<number, CatalogoItem>();
    catalogo.value.forEach(item => map.set(item.id, item));
    return map;
});

const diferenciaIngresosVsEgresoStock = computed(
    () =>
        totalIngresosGlobal.value -
        (totalEgresosPecuniarios.value + totalEgresosNoPecuniarios.value + totalStockPppGlobal.value + totalFondosGlobal.value)
);

const fetchHistorial = async () => {
    loading.value = true;
    error.value = null;
    try {
        const [ingresosData, egresosData, catalogoData, comprasData, cuentasData] = await Promise.all([
            apiService.getIngresos(),
            apiService.getEgresos(),
            apiService.getCatalogoItems(),
            apiService.getCompras(),
            apiService.getCuentas()
        ]);

        const egresosCompletos = await Promise.all(
            egresosData.map(async egreso => {
                if (egreso.egresoPecuniario || (egreso.detalleEgresoRecurso?.length ?? 0) > 0) return egreso;
                try {
                    return await apiService.getEgresoById(egreso.id);
                } catch {
                    return egreso;
                }
            })
        );

        ingresos.value = ingresosData;
        egresos.value = egresosCompletos;
        catalogo.value = catalogoData;
        cuentas.value = cuentasData;
        compras.value = comprasData;
        historial.value = [...ingresosData.map(mapIngresoToLog), ...egresosCompletos.map(mapEgresoToLog)];
    } catch (e: any) {
        error.value = e.message || 'No se pudo cargar historial, egresos, compras o stock.';
    } finally {
        loading.value = false;
    }
};

const tiposDisponibles = computed(() => {
    const values = new Set(historial.value.map(item => item.tipo).filter(Boolean));
    return Array.from(values);
});

const historialFiltrado = computed(() => {
    const normalize = (value: string) => value.toLowerCase().trim();
    const query = normalize(filtroPrograma.value);
    const fromDate = filtroDesde.value ? parseApiDate(filtroDesde.value) : null;
    const toDate = filtroHasta.value ? parseApiDate(filtroHasta.value) : null;
    const from = fromDate ? fromDate.getTime() : null;
    const to = toDate ? toDate.getTime() : null;

    return [...historial.value]
        .filter(item => {
            if (filtroTipo.value !== 'todos' && item.tipo !== filtroTipo.value) return false;
            if (filtroEstado.value !== 'todos' && (item.estado || '').toLowerCase() !== filtroEstado.value.toLowerCase()) return false;
            if (query) {
                const searchable = `${item.descripcion || ''} ${item.tipo || ''}`.toLowerCase();
                if (!searchable.includes(query)) return false;
            }
            const parsedDate = parseApiDate(item.fecha);
            if (!parsedDate) return false;
            const date = parsedDate.getTime();
            if (from && date < from) return false;
            if (to && date > to) return false;
            return true;
        })
        .sort((a, b) => {
            const dateA = parseApiDate(a.fecha)?.getTime() ?? 0;
            const dateB = parseApiDate(b.fecha)?.getTime() ?? 0;
            return dateB - dateA;
        });
});

const totalFiltrado = computed(() =>
    historialFiltrado.value.reduce((sum, item) => sum + montoVigente(item), 0)
);

const estadoClass = (estado?: string) => {
    const normalized = (estado || '').toLowerCase();
    if (normalized === 'cerrado') return 'bg-green-100 text-green-700';
    if (normalized === 'anulado') return 'bg-orange-100 text-orange-700';
    return 'bg-amber-100 text-amber-700';
};

const puedeAnular = (item: LogRegistro) => isAdmin.value && !isAnulado(item.estado);

const anularRegistro = async (item: LogRegistro) => {
    if (!puedeAnular(item)) return;
    const confirmado = window.confirm(`¿Anular ${item.movimiento} #${item.id}?`);
    if (!confirmado) return;
    anulandoKey.value = item.key;
    error.value = null;
    try {
        if (item.movimiento === 'ingreso') await apiService.anularIngreso(item.id);
        else await apiService.anularEgreso(item.id);
        await fetchHistorial();
    } catch (e: any) {
        error.value = e.message || 'No se pudo anular el registro.';
    } finally {
        anulandoKey.value = null;
    }
};

const itemNombre = (itemId: number) => catalogoById.value.get(itemId)?.nombre || `Item #${itemId || '?'}`;

const detalleTotal = (detalle: EditDetalle) => Number(detalle.cantidad || 0) * Number(detalle.precio || 0);

const recalcularMontoEdit = () => {
    if (!editForm.value || editForm.value.detalles.length === 0) return;
    editForm.value.montoTotal = editForm.value.detalles.reduce((sum, detalle) => sum + detalleTotal(detalle), 0);
};

const abrirEditarRegistro = async (item: LogRegistro) => {
    if (isAnulado(item.estado)) return;
    editLoadingKey.value = item.key;
    error.value = null;
    try {
        if (item.movimiento === 'ingreso') {
            const detalle = await apiService.getIngresoById(item.id);
            editForm.value = {
                movimiento: 'ingreso',
                id: item.id,
                fecha: detalle.ingreso.fecha || item.fecha,
                montoTotal: Number(detalle.ingreso.montoTotal || item.montoTotal || 0),
                estado: detalle.ingreso.estado || item.estado,
                tipo: detalle.ingreso.tipoTransaccion || item.tipo,
                responsableInternoId: Number(detalle.ingreso.responsableInternoId || 0),
                entidadId: Number(detalle.ingreso.origenEntidadId || 0),
                anotaciones: detalle.ingreso.anotaciones || '',
                proposito: detalle.donacion?.propositoEspecifico || detalle.subvencion?.nombreProyecto || '',
                documento: detalle.compra?.numeroFacturaBoleta || '',
                cuentaId: detalle.pecuniario?.cuentaDestinoId || detalle.compra?.cuentaOrigenId || 0,
                metodoTransferencia: detalle.pecuniario?.metodoTransferencia || '',
                detalles: detalle.detalles.map(d => ({
                    id: d.id,
                    itemCatalogoId: Number(d.itemCatalogoId || 0),
                    cantidad: Number(d.cantidad || 0),
                    precio: Number(d.precioUnitarioIngreso || 0)
                })),
                rawIngreso: detalle
            };
        } else {
            const egreso = await apiService.getEgresoById(item.id);
            editForm.value = {
                movimiento: 'egreso',
                id: item.id,
                fecha: egreso.fecha,
                montoTotal: Number(egreso.montoTotal || 0),
                estado: egreso.estado || item.estado,
                tipo: egreso.tipoEgreso,
                responsableInternoId: Number(egreso.responsableInternoId || 0),
                entidadId: Number(egreso.destinoEntidadId || 0),
                anotaciones: egreso.anotaciones || '',
                proposito: egreso.propositoEspecifico || '',
                cuentaId: egreso.egresoPecuniario?.cuentaOrigenId || 0,
                metodoTransferencia: egreso.egresoPecuniario?.metodoTransferencia || '',
                detalles: egreso.detalleEgresoRecurso.map(d => ({
                    itemCatalogoId: Number(d.itemCatalogoId || 0),
                    cantidad: Number(d.cantidad || 0),
                    precio: Number(d.precioUnitarioPpp || 0)
                })),
                rawEgreso: egreso
            };
        }
    } catch (e: any) {
        error.value = e.message || 'No se pudo cargar el registro para editar.';
    } finally {
        editLoadingKey.value = null;
    }
};

const cerrarEditarRegistro = () => {
    if (editSaving.value) return;
    editForm.value = null;
};

const agregarDetalleEdit = () => {
    if (!editForm.value) return;
    editForm.value.detalles.push({ itemCatalogoId: catalogo.value[0]?.id || 0, cantidad: 1, precio: 0 });
    recalcularMontoEdit();
};

const quitarDetalleEdit = (index: number) => {
    if (!editForm.value) return;
    editForm.value.detalles.splice(index, 1);
    recalcularMontoEdit();
};

const guardarEdicionRegistro = async () => {
    if (!editForm.value) return;
    const form = editForm.value;
    editSaving.value = true;
    error.value = null;
    try {
        if (form.movimiento === 'ingreso') {
            const raw = form.rawIngreso;
            await apiService.actualizarIngreso(form.id, {
                ingreso: {
                    ...raw?.ingreso,
                    id: form.id,
                    fecha: form.fecha,
                    montoTotal: form.montoTotal,
                    estado: form.estado,
                    tipoTransaccion: form.tipo,
                    responsableInternoId: form.responsableInternoId,
                    origenEntidadId: form.entidadId,
                    anotaciones: form.anotaciones
                },
                donacion: raw?.donacion ? { ...raw.donacion, propositoEspecifico: form.proposito } : undefined,
                compra: raw?.compra ? { ...raw.compra, numeroFacturaBoleta: form.documento } : undefined,
                subvencion: raw?.subvencion ? { ...raw.subvencion, nombreProyecto: form.proposito } : undefined,
                detalles: form.detalles.map(detalle => ({
                    id: detalle.id,
                    ingresoId: form.id,
                    itemCatalogoId: detalle.itemCatalogoId,
                    cantidad: detalle.cantidad,
                    precioUnitarioIngreso: detalle.precio
                }))
            });
        } else {
            const raw = form.rawEgreso;
            const payload: EgresoPayload = {
                egreso: {
                    fecha: form.fecha,
                    tipoEgreso: form.tipo || raw?.tipoEgreso || 'Ajuste',
                    montoTotal: form.montoTotal,
                    responsableInternoId: Number(form.responsableInternoId || 0),
                    destinoEntidadId: Number(form.entidadId || 0),
                    anotaciones: form.anotaciones,
                    propositoEspecifico: form.proposito
                },
                pecuniario: raw?.egresoPecuniario || undefined,
                detalles: form.detalles.map(detalle => ({
                    itemCatalogoId: detalle.itemCatalogoId,
                    cantidad: detalle.cantidad,
                    precioUnitarioPpp: detalle.precio
                }))
            };
            await apiService.actualizarEgreso(form.id, payload);
        }
        editForm.value = null;
        await fetchHistorial();
    } catch (e: any) {
        error.value = e.message || 'No se pudo guardar la edición.';
    } finally {
        editSaving.value = false;
    }
};

const comprasOrdenadas = computed(() =>
    [...compras.value].sort((a, b) => {
        const dateA = parseApiDate(a.fecha)?.getTime() ?? 0;
        const dateB = parseApiDate(b.fecha)?.getTime() ?? 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.idIngreso - a.idIngreso;
    })
);

const formatFecha = (value: string) => {
    const parsed = parseApiDate(value);
    if (!parsed) return value;
    return dateFormatter.format(parsed);
};

const limpiarFiltros = () => {
    filtroTipo.value = 'todos';
    filtroEstado.value = 'todos';
    filtroPrograma.value = '';
    filtroDesde.value = '';
    filtroHasta.value = '';
};

const imprimirInforme = () => {
    window.print();
};

const resolveBoletaUrl = (endpoint?: string, ingresoId?: number) => {
    if (endpoint) {
        if (/^https?:\/\//i.test(endpoint)) return endpoint;
        return `${apiOrigin}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }
    if (!ingresoId) return `${apiBaseUrl}/ingresos/compras`;
    return `${apiBaseUrl}/ingresos/compra/boleta/${ingresoId}/download`;
};

const abrirBoletaCompra = async (compra: CompraResumen) => {
    if (!compra.tieneBoleta) return;
    const popup = window.open('', '_blank');
    boletaLoadingId.value = compra.idIngreso;
    boletaStatus.value = null;
    try {
        const metadata: CompraBoletaMetadata = await apiService.getCompraBoleta(compra.idIngreso);
        const finalUrl = resolveBoletaUrl(
            metadata.downloadEndpoint ||
            metadata.boletaDownloadEndpoint ||
            compra.boletaDownloadEndpoint ||
            metadata.boletaEndpoint ||
            compra.boletaEndpoint,
            compra.idIngreso
        );
        if (popup) {
            popup.location.href = finalUrl;
        } else {
            window.open(finalUrl, '_blank', 'noopener,noreferrer');
        }
        boletaStatus.value = { type: 'success', text: `Boleta de compra #${compra.idIngreso} abierta en nueva pestaña.` };
    } catch (e: any) {
        if (popup) popup.close();
        boletaStatus.value = { type: 'error', text: e.message || `No se pudo abrir la boleta de compra #${compra.idIngreso}.` };
    } finally {
        boletaLoadingId.value = null;
    }
};

onMounted(fetchHistorial);
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-xs uppercase tracking-[0.35em] text-[#006d8f] font-semibold">Registros y análisis</p>
            <h2 class="text-3xl font-bold text-gray-900 dark:text-slate-100">Logs de ingresos y egresos</h2>
            <p class="text-gray-600 dark:text-slate-300 text-sm max-w-3xl">
                Centro de historial para auditoría, reportes e impresión de informes. Aquí quedará el flujo para papeleo y filtrado avanzado por programa.
            </p>
        </header>

        <section class="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 shadow p-5 space-y-4 no-print">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div class="flex items-center gap-2 text-gray-700 dark:text-slate-200">
                    <Funnel class="w-4 h-4 text-[#006d8f]" />
                    <p class="text-sm font-semibold">Filtros de consulta</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md border border-gray-200 dark:border-slate-600 px-3 py-2 text-sm text-gray-600 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                        @click="limpiarFiltros"
                    >
                        Limpiar
                    </button>
                    <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md border border-[#006d8f]/30 text-[#006d8f] px-3 py-2 text-sm hover:bg-[#006d8f]/5"
                        @click="fetchHistorial"
                        :disabled="loading"
                    >
                        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
                        Actualizar
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <div>
                    <label class="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Tipo</label>
                    <select v-model="filtroTipo" class="mt-1 w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100">
                        <option value="todos">Todos</option>
                        <option v-for="tipo in tiposDisponibles" :key="tipo" :value="tipo">
                            {{ tipoLabels[tipo] ?? tipo }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Estado</label>
                    <select v-model="filtroEstado" class="mt-1 w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100">
                        <option value="todos">Todos</option>
                        <option value="Cerrado">Cerrado</option>
                        <option value="abierto">Abierto</option>
                    </select>
                </div>
                <div>
                    <label class="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Programa / búsqueda</label>
                    <input
                        v-model="filtroPrograma"
                        type="text"
                        placeholder="Ej: Invierno, comedor, FSDA"
                        class="mt-1 w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                    />
                </div>
                <div>
                    <label class="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Desde</label>
                    <input v-model="filtroDesde" type="date" class="mt-1 w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                    <label class="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Hasta</label>
                    <input v-model="filtroHasta" type="date" class="mt-1 w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-800 dark:text-slate-100" />
                </div>
            </div>
        </section>

        <section class="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 shadow p-5 space-y-4 print-report">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                    <p class="text-sm text-gray-500 dark:text-slate-400">Resultado actual</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-slate-100">
                        {{ historialFiltrado.length }} registros, total valorizado {{ currency.format(totalFiltrado) }}
                    </p>
                </div>
                <div class="flex gap-2 no-print">
                    <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md border border-gray-200 dark:border-slate-600 px-3 py-2 text-sm text-gray-600 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                        @click="imprimirInforme"
                        :disabled="loading || historialFiltrado.length === 0"
                    >
                        <Printer class="w-4 h-4" />
                        Imprimir resumen
                    </button>
                    <button
                        type="button"
                        disabled
                        class="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-400 cursor-not-allowed no-print"
                    >
                        <FileSpreadsheet class="w-4 h-4" />
                        Exportar informe
                    </button>
                </div>
            </div>

            <div v-if="!loading && !error" class="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950/40 p-4 space-y-2">
                <p class="text-sm font-semibold text-gray-800 dark:text-slate-100">Comparativo global (APIs)</p>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2 text-sm">
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Total ingresos</p>
                        <p class="font-semibold text-gray-900 dark:text-slate-100">{{ currency.format(totalIngresosGlobal) }}</p>
                    </div>
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Egresos pecuniarios</p>
                        <p class="font-semibold text-gray-900 dark:text-slate-100">{{ currency.format(totalEgresosPecuniarios) }}</p>
                    </div>
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Egresos no pecuniarios</p>
                        <p class="font-semibold text-gray-900 dark:text-slate-100">{{ currency.format(totalEgresosNoPecuniarios) }}</p>
                    </div>
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Valor inventario</p>
                        <p class="font-semibold text-gray-900 dark:text-slate-100">{{ currency.format(totalStockPppGlobal) }}</p>
                    </div>
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Saldo en fondos</p>
                        <p class="font-semibold text-gray-900 dark:text-slate-100">{{ currency.format(totalFondosGlobal) }}</p>
                    </div>
                    <div class="rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                        <p class="text-gray-500 dark:text-slate-400">Diferencia</p>
                        <p
                            class="font-semibold"
                            :class="Math.abs(diferenciaIngresosVsEgresoStock) < 1 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'"
                        >
                            {{ currency.format(diferenciaIngresosVsEgresoStock) }}
                        </p>
                    </div>
                </div>
                <p class="text-xs text-gray-500 dark:text-slate-400">
                    Fórmula: Ingresos - (Egresos pecuniarios + Egresos no pecuniarios + Valor inventario + Saldo en fondos)
                </p>
            </div>

            <div v-if="loading" class="grid gap-3 md:grid-cols-2">
                <div v-for="n in 4" :key="n" class="h-20 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
            </div>

            <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                {{ error }}
            </div>

            <div v-else-if="historialFiltrado.length === 0" class="rounded-lg border border-dashed border-gray-200 dark:border-slate-600 px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                No hay registros que coincidan con los filtros actuales.
            </div>

            <div v-else class="overflow-x-auto border border-gray-100 dark:border-slate-700 rounded-lg">
                <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-700">
                    <thead class="bg-gray-50 dark:bg-slate-800">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Fecha</th>
                            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Tipo</th>
                            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Descripción</th>
                            <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Estado</th>
                            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Monto</th>
                            <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider no-print">Acción</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-700">
                        <tr v-for="item in historialFiltrado" :key="item.key" :class="isAnulado(item.estado) ? 'bg-orange-50/60 dark:bg-orange-950/10' : ''">
                            <td class="px-4 py-3 text-sm text-gray-800 dark:text-slate-100 whitespace-nowrap">
                                <div class="inline-flex items-center gap-2">
                                    <Clock3 class="w-3.5 h-3.5 text-[#006d8f]" />
                                    {{ formatFecha(item.fecha) }}
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700 dark:text-slate-200 whitespace-nowrap">
                                {{ tipoLabels[item.tipo] ?? item.tipo }}
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 min-w-[320px]">
                                {{ item.descripcion || 'Sin descripción' }}
                            </td>
                            <td class="px-4 py-3 text-sm whitespace-nowrap">
                                <span
                                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                    :class="estadoClass(item.estado)"
                                >
                                    {{ item.estado || 'Sin estado' }}
                                </span>
                            </td>
                            <td
                                class="px-4 py-3 text-sm font-semibold text-right whitespace-nowrap"
                                :class="item.movimiento === 'egreso' ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-slate-100'"
                            >
                                {{ item.movimiento === 'egreso' ? `-${currency.format(item.montoTotal || 0)}` : currency.format(item.montoTotal || 0) }}
                            </td>
                            <td class="px-4 py-3 text-right whitespace-nowrap no-print">
                                <button
                                    v-if="!isAnulado(item.estado)"
                                    type="button"
                                    class="mr-2 inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                    :disabled="editLoadingKey === item.key"
                                    @click="abrirEditarRegistro(item)"
                                >
                                    <RefreshCw v-if="editLoadingKey === item.key" class="w-3.5 h-3.5 animate-spin" />
                                    <Pencil v-else class="w-3.5 h-3.5" />
                                    {{ editLoadingKey === item.key ? 'Abriendo...' : 'Editar' }}
                                </button>
                                <button
                                    v-if="puedeAnular(item)"
                                    type="button"
                                    class="inline-flex items-center gap-1.5 rounded-md border border-orange-200 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                                    :disabled="anulandoKey === item.key"
                                    @click="anularRegistro(item)"
                                >
                                    <RefreshCw v-if="anulandoKey === item.key" class="w-3.5 h-3.5 animate-spin" />
                                    <Ban v-else class="w-3.5 h-3.5" />
                                    {{ anulandoKey === item.key ? 'Anulando...' : 'Anular' }}
                                </button>
                                <span v-else-if="isAnulado(item.estado)" class="text-xs text-gray-400 dark:text-slate-500">Anulado</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-semibold text-gray-800 dark:text-slate-100">Compras y boletas</p>
                    <p class="text-xs text-gray-500 dark:text-slate-400">{{ comprasOrdenadas.length }} compras</p>
                </div>

                <div
                    v-if="boletaStatus"
                    :class="boletaStatus.type === 'success' ? 'rounded-md border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-xs' : 'rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs'"
                >
                    {{ boletaStatus.text }}
                </div>

                <div v-if="loading" class="text-sm text-gray-500 dark:text-slate-400">Cargando compras...</div>
                <div
                    v-else-if="comprasOrdenadas.length === 0"
                    class="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-4 py-6 text-sm text-gray-500 dark:text-slate-400 text-center"
                >
                    No hay compras disponibles.
                </div>
                <div v-else class="overflow-x-auto border border-gray-100 dark:border-slate-700 rounded-lg">
                    <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-700">
                        <thead class="bg-gray-50 dark:bg-slate-800">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Fecha</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Ingreso</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Documento</th>
                                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Monto</th>
                                <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Boleta</th>
                                <th class="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-700">
                            <tr v-for="compra in comprasOrdenadas" :key="compra.idIngreso">
                                <td class="px-4 py-2 text-sm text-gray-700 dark:text-slate-200 whitespace-nowrap">{{ formatFecha(compra.fecha) }}</td>
                                <td class="px-4 py-2 text-sm text-gray-900 dark:text-slate-100 font-semibold whitespace-nowrap">#{{ compra.idIngreso }}</td>
                                <td class="px-4 py-2 text-sm text-gray-600 dark:text-slate-300">
                                    {{ compra.numeroFacturaBoleta || (compra.tieneBoleta ? 'Boleta adjunta' : 'Sin documento') }}
                                </td>
                                <td class="px-4 py-2 text-sm text-gray-900 dark:text-slate-100 font-semibold text-right whitespace-nowrap">{{ currency.format(compra.montoTotal || 0) }}</td>
                                <td class="px-4 py-2 text-sm whitespace-nowrap">
                                    <span
                                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                                        :class="compra.tieneBoleta ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
                                    >
                                        {{ compra.tieneBoleta ? 'Disponible' : 'Pendiente' }}
                                    </span>
                                </td>
                                <td class="px-4 py-2 text-right">
                                    <button
                                        v-if="compra.tieneBoleta"
                                        type="button"
                                        class="inline-flex items-center gap-2 rounded-md border border-[#006d8f]/30 text-[#006d8f] px-3 py-1.5 text-xs hover:bg-[#006d8f]/5 disabled:opacity-60"
                                        :disabled="boletaLoadingId === compra.idIngreso"
                                        @click="abrirBoletaCompra(compra)"
                                    >
                                        <RefreshCw v-if="boletaLoadingId === compra.idIngreso" class="w-3.5 h-3.5 animate-spin" />
                                        <span>{{ boletaLoadingId === compra.idIngreso ? 'Abriendo...' : 'Ver boleta' }}</span>
                                    </button>
                                    <span v-else class="text-xs text-gray-400 dark:text-slate-500">Sin archivo</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <div v-if="editForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
            <div class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
                <div class="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-slate-700">
                    <div>
                        <p class="text-xs uppercase tracking-[0.25em] text-[#006d8f]">Editar {{ editForm.movimiento }}</p>
                        <h3 class="text-xl font-semibold text-gray-900 dark:text-slate-100">Registro #{{ editForm.id }}</h3>
                        <p class="text-sm text-gray-500 dark:text-slate-400">
                            Si un detalle rompe la regla PPP, la API bloqueará el guardado y podrás corregir con ajuste.
                        </p>
                    </div>
                    <button type="button" class="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800" @click="cerrarEditarRegistro">
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <div class="grid gap-4 p-5 md:grid-cols-2">
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        Fecha
                        <input v-model="editForm.fecha" type="date" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        Monto total
                        <input v-model.number="editForm.montoTotal" type="number" min="0" step="1" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" :readonly="editForm.detalles.length > 0">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        Tipo
                        <input v-model="editForm.tipo" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        Responsable interno ID
                        <input v-model.number="editForm.responsableInternoId" type="number" min="0" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        {{ editForm.movimiento === 'ingreso' ? 'Origen entidad ID' : 'Destino entidad ID' }}
                        <input v-model.number="editForm.entidadId" type="number" min="0" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label v-if="editForm.documento !== undefined" class="text-sm font-medium text-gray-700 dark:text-slate-200">
                        Documento
                        <input v-model="editForm.documento" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200 md:col-span-2">
                        Propósito / descripción
                        <input v-model="editForm.proposito" type="text" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                    </label>
                    <label class="text-sm font-medium text-gray-700 dark:text-slate-200 md:col-span-2">
                        Anotaciones
                        <textarea v-model="editForm.anotaciones" rows="3" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"></textarea>
                    </label>
                </div>

                <div class="border-t border-gray-100 p-5 dark:border-slate-700">
                    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p class="text-sm font-semibold text-gray-900 dark:text-slate-100">Detalles de ítems</p>
                            <p class="text-xs text-gray-500 dark:text-slate-400">
                                Ingresos: bloquea si hay egresos posteriores. Egresos: bloquea si hay ingresos posteriores.
                            </p>
                        </div>
                        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200" @click="agregarDetalleEdit">
                            <Plus class="h-3.5 w-3.5" /> Agregar ítem
                        </button>
                    </div>

                    <div v-if="editForm.detalles.length === 0" class="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-400">
                        Este registro no tiene detalles de inventario. Puedes editar solo cabecera/monto.
                    </div>
                    <div v-else class="overflow-x-auto rounded-lg border border-gray-100 dark:border-slate-700">
                        <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-700">
                            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800 dark:text-slate-300">
                                <tr>
                                    <th class="px-3 py-2 text-left">Ítem</th>
                                    <th class="px-3 py-2 text-right">Cantidad</th>
                                    <th class="px-3 py-2 text-right">Precio</th>
                                    <th class="px-3 py-2 text-right">Total</th>
                                    <th class="px-3 py-2 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                                <tr v-for="(detalle, index) in editForm.detalles" :key="`${detalle.id || index}-${index}`">
                                    <td class="px-3 py-2 text-sm">
                                        <select v-model.number="detalle.itemCatalogoId" class="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950">
                                            <option :value="0">Seleccionar ítem</option>
                                            <option v-for="item in catalogo" :key="item.id" :value="item.id">
                                                {{ item.nombre || `Item #${item.id}` }}
                                            </option>
                                        </select>
                                        <p class="mt-1 text-xs text-gray-400">{{ itemNombre(detalle.itemCatalogoId) }}</p>
                                    </td>
                                    <td class="px-3 py-2 text-right">
                                        <input v-model.number="detalle.cantidad" type="number" min="0" step="0.01" class="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-950" @input="recalcularMontoEdit">
                                    </td>
                                    <td class="px-3 py-2 text-right">
                                        <input v-model.number="detalle.precio" type="number" min="0" step="0.01" class="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm dark:border-slate-600 dark:bg-slate-950" @input="recalcularMontoEdit">
                                    </td>
                                    <td class="px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:text-slate-100">
                                        {{ currency.format(detalleTotal(detalle)) }}
                                    </td>
                                    <td class="px-3 py-2 text-right">
                                        <button type="button" class="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50" @click="quitarDetalleEdit(index)">
                                            Quitar
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="flex flex-col gap-2 border-t border-gray-100 p-5 sm:flex-row sm:justify-end dark:border-slate-700">
                    <button type="button" class="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200" @click="cerrarEditarRegistro">
                        Cancelar
                    </button>
                    <button type="button" class="inline-flex items-center justify-center gap-2 rounded-md bg-[#006d8f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005d7a] disabled:opacity-60" :disabled="editSaving" @click="guardarEdicionRegistro">
                        <RefreshCw v-if="editSaving" class="h-4 w-4 animate-spin" />
                        <Save v-else class="h-4 w-4" />
                        {{ editSaving ? 'Guardando...' : 'Guardar cambios' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
@media print {
    .no-print {
        display: none !important;
    }

    .print-report {
        box-shadow: none !important;
        border: 1px solid #d1d5db !important;
    }
}
</style>
