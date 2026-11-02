<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Ban, PackageCheck, RefreshCw } from 'lucide-vue-next';
import type { CatalogoItem, EntidadResumen, SolicitudItemPayload, SolicitudRegistrada } from '../types';
import { apiService } from '../api/apiService';
import ModalEntregaSolicitud from './ModalEntregaSolicitud.vue';

type Filtro = 'Pendiente' | 'Entregada' | 'Cancelada' | 'todas';

// Administradores ven todas y entregan; un miembro ve solo las suyas (solicitanteId) y puede cancelarlas.
const props = withDefaults(defineProps<{ puedeEntregar?: boolean; solicitanteId?: number | null }>(), {
    puedeEntregar: false,
    solicitanteId: null
});

const solicitudes = ref<SolicitudRegistrada[]>([]);
const catalogo = ref(new Map<number, CatalogoItem>());
const entidades = ref(new Map<number, EntidadResumen>());
const cargando = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);
const filtro = ref<Filtro>('Pendiente');
const entregando = ref<SolicitudRegistrada | null>(null);
const cancelandoId = ref<number | null>(null);

const filtros: { valor: Filtro; texto: string }[] = [
    { valor: 'Pendiente', texto: 'Pendientes' },
    { valor: 'Entregada', texto: 'Entregadas' },
    { valor: 'Cancelada', texto: 'Canceladas' },
    { valor: 'todas', texto: 'Todas' }
];

const cargar = async () => {
    cargando.value = true;
    error.value = null;
    try {
        const [lista, items, personas] = await Promise.all([
            apiService.getSolicitudes(),
            apiService.getCatalogoItems(),
            apiService.getEntidades().catch(() => [] as EntidadResumen[])
        ]);
        solicitudes.value = props.solicitanteId == null ? lista : lista.filter(s => s.solicitanteId === props.solicitanteId);
        catalogo.value = new Map(items.map(item => [item.id, item]));
        entidades.value = new Map(personas.map(entidad => [entidad.id, entidad]));
    } catch (e: any) {
        error.value = e.message || 'No se pudieron cargar las solicitudes.';
    } finally {
        cargando.value = false;
    }
};

const visibles = computed(() =>
    filtro.value === 'todas' ? solicitudes.value : solicitudes.value.filter(s => (s.estado || 'Pendiente') === filtro.value)
);
const conteo = (valor: Filtro) =>
    valor === 'todas' ? solicitudes.value.length : solicitudes.value.filter(s => (s.estado || 'Pendiente') === valor).length;

const nombreSolicitante = (s: SolicitudRegistrada) =>
    (s.solicitanteId && entidades.value.get(s.solicitanteId)?.nombreCompleto) || (s.solicitanteId ? `Entidad #${s.solicitanteId}` : 'Sin solicitante');

const nombreItem = (item: SolicitudItemPayload) =>
    item.itemCatalogoId ? catalogo.value.get(item.itemCatalogoId)?.nombre || `Ítem #${item.itemCatalogoId}` : item.descripcionManual || 'Ítem';

const unidadItem = (item: SolicitudItemPayload) =>
    item.itemCatalogoId ? catalogo.value.get(item.itemCatalogoId)?.unidadMedidaEstandar || '' : '';

const formatoFecha = (valor: string | null) => {
    if (!valor) return '';
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

const estadoClase = (estado: string | null) => {
    if (estado === 'Entregada') return 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300';
    if (estado === 'Cancelada') return 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
};

const cancelar = async (s: SolicitudRegistrada) => {
    if (!window.confirm(`¿Cancelar la solicitud #${s.id}? No se va a entregar.`)) return;
    cancelandoId.value = s.id;
    try {
        await apiService.cancelarSolicitud(s.id);
        aviso.value = `Solicitud #${s.id} cancelada.`;
        await cargar();
    } catch (e: any) {
        error.value = e.message || 'No se pudo cancelar la solicitud.';
    } finally {
        cancelandoId.value = null;
    }
};

const alEntregar = async (egresoId: number) => {
    const id = entregando.value?.id;
    entregando.value = null;
    aviso.value = `Solicitud #${id} entregada: consumo interno #${egresoId}.`;
    await cargar();
};

defineExpose({ cargar });
onMounted(cargar);
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1" role="tablist">
                <button
                    v-for="opcion in filtros"
                    :key="opcion.valor"
                    type="button"
                    role="tab"
                    :aria-selected="filtro === opcion.valor"
                    class="rounded-full border px-3 py-1.5 text-sm"
                    :class="filtro === opcion.valor ? 'border-[var(--accent-color)] bg-[var(--accent-color)] text-white' : 'border-[var(--card-border)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]'"
                    @click="filtro = opcion.valor"
                >
                    {{ opcion.texto }} <span class="opacity-75">{{ conteo(opcion.valor) }}</span>
                </button>
            </div>
            <button type="button" class="btn-secondary h-9 px-3 text-sm" :disabled="cargando" @click="cargar">
                <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': cargando }" /> Actualizar
            </button>
        </div>

        <div v-if="aviso" class="message-banner message-success">{{ aviso }}</div>
        <div v-if="error" class="message-banner message-error">{{ error }}</div>

        <p v-if="!cargando && visibles.length === 0" class="rounded-xl border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No hay solicitudes {{ filtro === 'todas' ? '' : filtros.find(f => f.valor === filtro)?.texto.toLowerCase() }}.
        </p>

        <article v-for="s in visibles" :key="s.id" class="rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-xs text-[var(--text-muted)]">#{{ s.id }} · {{ formatoFecha(s.fechaSolicitud) }}</p>
                    <h4 class="font-semibold text-[var(--text-primary)]">{{ s.programa || 'Sin programa' }}</h4>
                    <p class="text-sm text-[var(--text-muted)]">Pide {{ nombreSolicitante(s) }}</p>
                </div>
                <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="estadoClase(s.estado)">{{ s.estado || 'Pendiente' }}</span>
            </div>

            <ul class="mt-3 space-y-1 text-sm">
                <li v-for="item in s.items" :key="item.id" class="flex justify-between gap-3">
                    <span class="text-[var(--text-primary)]">
                        {{ nombreItem(item) }}
                        <span v-if="!item.itemCatalogoId" class="text-xs text-amber-600">(fuera del catálogo)</span>
                    </span>
                    <span class="shrink-0 text-[var(--text-muted)]">
                        <template v-if="s.estado === 'Entregada'">{{ item.cantidadEntregada ?? 0 }} de </template>{{ item.cantidadRequerida }} {{ unidadItem(item) }}
                    </span>
                </li>
            </ul>

            <p v-if="s.egresoIds.length" class="mt-2 text-xs text-[var(--text-muted)]">
                Entregada como consumo interno {{ s.egresoIds.map(id => `#${id}`).join(', ') }} (ver en Logs).
            </p>

            <div v-if="(s.estado || 'Pendiente') === 'Pendiente'" class="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" class="btn-secondary h-9 px-3 text-sm" :disabled="cancelandoId === s.id" @click="cancelar(s)">
                    <Ban class="h-4 w-4" /> Cancelar
                </button>
                <button v-if="puedeEntregar" type="button" class="btn-primary h-9 px-4 text-sm" @click="entregando = s">
                    <PackageCheck class="h-4 w-4" /> Entregar
                </button>
            </div>
        </article>

        <ModalEntregaSolicitud
            v-if="entregando"
            :solicitud="entregando"
            :catalogo="catalogo"
            :solicitante-nombre="nombreSolicitante(entregando)"
            @close="entregando = null"
            @entregada="alEntregar"
        />
    </div>
</template>
