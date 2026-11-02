<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Loader2, Minus, PackageCheck, Plus, ScanBarcode, Trash2, X } from 'lucide-vue-next';
import type { CatalogoItem, EntidadResumen, LineaEscaneada, SolicitudRegistrada } from '../types';
import { apiService } from '../api/apiService';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import EntidadSelector from './EntidadSelector.vue';
import EscanerCodigos from './EscanerCodigos.vue';

// Entrega de una vez: se parte de lo pedido y se ajusta a lo que sale de verdad (cantidades, agregar, quitar).
const props = defineProps<{
    solicitud: SolicitudRegistrada;
    catalogo: Map<number, CatalogoItem>;
    solicitanteNombre: string;
}>();

const emit = defineEmits<{ close: []; entregada: [egresoId: number] }>();

type Linea = { itemCatalogoId: number; nombre: string; unidad: string; stock: number; pedido: number | null; cantidad: number };

const hoy = new Date().toISOString().split('T')[0] ?? '';
const fecha = ref(hoy);
const anotaciones = ref('');
const responsable = ref<EntidadResumen | null>(null);
const resolviendoResponsable = ref(true);
const guardando = ref(false);
const errores = ref<string[]>([]);
const showEscaner = ref(false);

const busqueda = ref('');
const resultados = ref<CatalogoItem[]>([]);
const buscando = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

const crearLinea = (item: CatalogoItem | undefined, itemId: number, cantidad: number, pedido: number | null): Linea => ({
    itemCatalogoId: itemId,
    nombre: item?.nombre || `Ítem #${itemId}`,
    unidad: item?.unidadMedidaEstandar || 'unidad',
    stock: Number(item?.stockActual || 0),
    pedido,
    cantidad
});

// Se prellena con lo pedido del catálogo; lo pedido "a mano" no tiene stock y se resuelve aparte.
const lineas = ref<Linea[]>(
    props.solicitud.items
        .filter(item => item.itemCatalogoId)
        .map(item => crearLinea(props.catalogo.get(item.itemCatalogoId!), item.itemCatalogoId!, Number(item.cantidadRequerida || 0), Number(item.cantidadRequerida || 0)))
);
const pedidosManuales = computed(() => props.solicitud.items.filter(item => !item.itemCatalogoId && item.descripcionManual));

const agregarItem = (item: CatalogoItem, cantidad = 1) => {
    const existente = lineas.value.find(linea => linea.itemCatalogoId === item.id);
    if (existente) existente.cantidad = Math.round((existente.cantidad + cantidad) * 1000) / 1000;
    else lineas.value.push(crearLinea(item, item.id, cantidad, null));
    busqueda.value = '';
    resultados.value = [];
};

const agregarEscaneado = async (linea: LineaEscaneada) => {
    if (!linea.itemCatalogoId) return;
    let item = props.catalogo.get(linea.itemCatalogoId);
    if (!item) {
        try { item = (await apiService.getCatalogoItems()).find(i => i.id === linea.itemCatalogoId); } catch { /* nombre por ID */ }
    }
    agregarItem(item ?? ({ id: linea.itemCatalogoId, nombre: linea.nombre, unidadMedidaEstandar: linea.unidad, stockActual: 0 } as CatalogoItem), linea.cantidad);
};

// El escáner no deja pasar más de lo que hay, sumando lo que ya está en la lista.
const validarEscaneado = (linea: LineaEscaneada): string | null => {
    if (!linea.itemCatalogoId) return null;
    const stock = Number(props.catalogo.get(linea.itemCatalogoId)?.stockActual ?? Infinity);
    const enLista = lineas.value.find(l => l.itemCatalogoId === linea.itemCatalogoId)?.cantidad ?? 0;
    return linea.cantidad + enLista > stock ? `Stock insuficiente: quedan ${Math.max(0, stock - enLista)}.` : null;
};

const buscar = () => {
    if (timer) clearTimeout(timer);
    const texto = busqueda.value.trim();
    if (texto.length < 2) { resultados.value = []; return; }
    timer = setTimeout(async () => {
        buscando.value = true;
        try { resultados.value = await apiService.buscarCatalogo(texto); } catch { resultados.value = []; } finally { buscando.value = false; }
    }, 300);
};

const cambiar = (linea: Linea, delta: number) => {
    linea.cantidad = Math.max(0, Math.round((Number(linea.cantidad || 0) + delta) * 1000) / 1000);
};

const quitar = (index: number) => lineas.value.splice(index, 1);

const sinStock = (linea: Linea) => Number(linea.cantidad || 0) > linea.stock;

const validar = (): string[] => {
    const lista: string[] = [];
    if (!fecha.value) lista.push('La fecha es obligatoria.');
    if (!responsable.value) lista.push('Selecciona quién entrega.');
    if (lineas.value.length === 0) lista.push('Agrega al menos un ítem a entregar.');
    lineas.value.forEach(linea => {
        if (!(Number(linea.cantidad) > 0)) lista.push(`${linea.nombre}: la cantidad debe ser mayor a cero (o quítalo).`);
        else if (sinStock(linea)) lista.push(`${linea.nombre}: hay ${linea.stock} ${linea.unidad}. Registra una compra o entrega menos.`);
    });
    return lista;
};

const entregar = async () => {
    errores.value = validar();
    if (errores.value.length > 0) return;
    guardando.value = true;
    try {
        const respuesta = await apiService.entregarSolicitud(props.solicitud.id, {
            fecha: fecha.value,
            responsableInternoId: responsable.value!.id,
            anotaciones: anotaciones.value.trim() || undefined,
            items: lineas.value.map(linea => ({ itemCatalogoId: linea.itemCatalogoId, cantidad: Number(linea.cantidad) }))
        });
        emit('entregada', respuesta.egresoId);
    } catch (e: any) {
        errores.value = [e.message || 'No se pudo registrar la entrega.'];
    } finally {
        guardando.value = false;
    }
};

onMounted(async () => {
    try { responsable.value = await resolveCurrentResponsible(); } catch { /* se elige a mano */ } finally { resolviendoResponsable.value = false; }
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <div class="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[var(--card-border)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl">
                <div class="flex items-start justify-between gap-4 border-b border-[var(--card-border)] px-5 py-4">
                    <div class="min-w-0">
                        <p class="text-xs uppercase tracking-[0.2em] text-[var(--accent-color)]">Entregar solicitud #{{ solicitud.id }}</p>
                        <h3 class="truncate text-lg font-semibold text-[var(--text-primary)]">{{ solicitud.programa }}</h3>
                        <p class="text-sm text-[var(--text-muted)]">Para {{ solicitanteNombre }} · se registrará como consumo interno</p>
                    </div>
                    <button type="button" class="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" aria-label="Cerrar" @click="emit('close')">
                        <X class="h-5 w-5" />
                    </button>
                </div>

                <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div class="grid gap-4 md:grid-cols-2">
                        <label class="text-sm font-medium text-[var(--text-primary)]">
                            Fecha de entrega <span class="text-red-500">*</span>
                            <input v-model="fecha" type="date" class="compact-control mt-1" />
                        </label>
                        <div v-if="resolviendoResponsable" class="text-sm text-[var(--text-muted)]">Resolviendo responsable...</div>
                        <EntidadSelector
                            v-else
                            v-model="responsable"
                            label="Entrega"
                            required
                            :locked="!canChangeResponsible && !!responsable"
                            locked-hint="Asignado automáticamente desde Authentik"
                        />
                    </div>

                    <div>
                        <div class="mb-2 flex items-center justify-between gap-2">
                            <h4 class="form-section-title !mb-0">Lo que se entrega</h4>
                            <span class="text-xs text-[var(--text-muted)]">Ajusta a lo que sale de verdad</span>
                        </div>

                        <div v-if="lineas.length" class="flat-table">
                            <table class="min-w-full divide-y divide-[var(--card-border)]">
                                <thead class="bg-[var(--surface-muted)]">
                                    <tr>
                                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ítem</th>
                                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Pedido</th>
                                        <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Entrega</th>
                                        <th class="px-3 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-[var(--card-border)]">
                                    <tr v-for="(linea, index) in lineas" :key="linea.itemCatalogoId">
                                        <td class="px-3 py-2 text-sm">
                                            <p class="font-medium text-[var(--text-primary)]">{{ linea.nombre }}</p>
                                            <p class="text-xs" :class="sinStock(linea) ? 'font-semibold text-red-600' : 'text-[var(--text-muted)]'">
                                                Stock {{ linea.stock }} {{ linea.unidad }}
                                            </p>
                                        </td>
                                        <td class="px-3 py-2 text-sm text-[var(--text-muted)]">
                                            {{ linea.pedido ?? 'Agregado' }}
                                        </td>
                                        <td class="px-3 py-2">
                                            <div class="flex items-center gap-1">
                                                <button type="button" class="btn-secondary h-9 w-9 shrink-0 !px-0" aria-label="Restar uno" @click="cambiar(linea, -1)"><Minus class="h-4 w-4" /></button>
                                                <input v-model.number="linea.cantidad" type="number" min="0" step="0.01" inputmode="decimal" class="compact-control w-20 text-center" :class="{ '!border-red-400': sinStock(linea) }" />
                                                <button type="button" class="btn-secondary h-9 w-9 shrink-0 !px-0" aria-label="Sumar uno" @click="cambiar(linea, 1)"><Plus class="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                        <td class="px-3 py-2 text-right">
                                            <button type="button" class="inline-flex items-center rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50" aria-label="Quitar" @click="quitar(index)">
                                                <Trash2 class="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p v-else class="text-sm text-[var(--text-muted)]">No hay ítems para entregar. Agrega desde el catálogo o escanea.</p>

                        <div v-if="pedidosManuales.length" class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            <p class="font-semibold">Pedidos que no están en el catálogo:</p>
                            <ul class="list-disc pl-5">
                                <li v-for="item in pedidosManuales" :key="item.id">{{ item.descripcionManual }} × {{ item.cantidadRequerida }}</li>
                            </ul>
                            <p class="mt-1 text-xs">Si se entregan, búscalos o escanéalos abajo; si no hay, déjalos fuera.</p>
                        </div>

                        <div class="relative mt-3 flex gap-2">
                            <input v-model="busqueda" type="text" placeholder="Agregar otro ítem del catálogo..." class="compact-control flex-1" @input="buscar" />
                            <button type="button" class="btn-secondary h-10 shrink-0 px-3" @click="showEscaner = true">
                                <ScanBarcode class="h-4 w-4" /> Escanear
                            </button>
                            <div v-if="busqueda.trim().length >= 2" class="dropdown-panel absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto">
                                <div v-if="buscando" class="p-3 text-sm text-[var(--text-muted)]">Buscando...</div>
                                <ul v-else-if="resultados.length">
                                    <li v-for="item in resultados" :key="item.id" @click="agregarItem(item)">
                                        <p class="font-medium text-[var(--text-primary)]">{{ item.nombre }}</p>
                                        <p class="text-xs text-[var(--text-muted)]">Stock {{ item.stockActual ?? 0 }} {{ item.unidadMedidaEstandar || '' }}</p>
                                    </li>
                                </ul>
                                <div v-else class="p-3 text-sm text-[var(--text-muted)]">Sin resultados</div>
                            </div>
                        </div>
                    </div>

                    <label class="block text-sm font-medium text-[var(--text-primary)]">
                        Anotaciones
                        <textarea v-model="anotaciones" rows="2" placeholder="Opcional: por qué se entregó distinto a lo pedido, quién recibió..." class="compact-control mt-1"></textarea>
                    </label>

                    <div v-if="errores.length" class="message-banner message-error">
                        <ul class="list-disc pl-5">
                            <li v-for="error in errores" :key="error">{{ error }}</li>
                        </ul>
                    </div>
                </div>

                <div class="flex flex-col-reverse gap-2 border-t border-[var(--card-border)] px-5 py-4 sm:flex-row sm:justify-end">
                    <button type="button" class="btn-secondary h-10 px-4" @click="emit('close')">Cancelar</button>
                    <button type="button" class="btn-primary h-10 px-5" :disabled="guardando" @click="entregar">
                        <Loader2 v-if="guardando" class="h-4 w-4 animate-spin" />
                        <PackageCheck v-else class="h-4 w-4" />
                        {{ guardando ? 'Registrando...' : 'Registrar entrega' }}
                    </button>
                </div>
            </div>
        </div>

        <EscanerCodigos
            v-if="showEscaner"
            solo-catalogo
            :con-precio="false"
            :validar="validarEscaneado"
            titulo="Escanear lo que se entrega"
            @agregar="agregarEscaneado"
            @close="showEscaner = false"
        />
    </Teleport>
</template>
