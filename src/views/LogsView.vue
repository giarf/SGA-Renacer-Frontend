<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Clock3, RefreshCw, Printer, FileSpreadsheet, Funnel } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import type { CatalogoItem, CompraBoletaMetadata, CompraResumen, Cuenta, EgresoRecurso, IngresoResumen } from '../types';

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

const historial = ref<LogRegistro[]>([]);
const ingresos = ref<IngresoResumen[]>([]);
const egresos = ref<EgresoRecurso[]>([]);
const catalogo = ref<CatalogoItem[]>([]);
const cuentas = ref<Cuenta[]>([]);
const compras = ref<CompraResumen[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const boletaLoadingId = ref<number | null>(null);
const boletaStatus = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.familiarenacer.cl/api').replace(/\/$/, '');
const apiOrigin = apiBaseUrl.replace(/\/api$/, '');

const filtroTipo = ref<'todos' | string>('todos');
const filtroEstado = ref<'todos' | string>('todos');
const filtroPrograma = ref('');
const filtroDesde = ref('');
const filtroHasta = ref('');

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
    descripcion: item.propositoEspecifico || item.anotaciones || `Egreso #${item.id}`
});

const totalIngresosGlobal = computed(() =>
    ingresos.value.reduce((sum, item) => sum + Number(item.montoTotal || 0), 0)
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
    egresos.value.filter(isEgresoPecuniario).reduce((sum, item) => sum + Number(item.montoTotal || 0), 0)
);

const totalEgresosNoPecuniarios = computed(() =>
    egresos.value.filter(item => !isEgresoPecuniario(item)).reduce((sum, item) => sum + Number(item.montoTotal || 0), 0)
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
    historialFiltrado.value.reduce((sum, item) => sum + (item.montoTotal || 0), 0)
);

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
                        </tr>
                    </thead>
                    <tbody class="bg-white dark:bg-slate-900 divide-y divide-gray-100 dark:divide-slate-700">
                        <tr v-for="item in historialFiltrado" :key="item.key">
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
                                    :class="(item.estado || '').toLowerCase() === 'cerrado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
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
