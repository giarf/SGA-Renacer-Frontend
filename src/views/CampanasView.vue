<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Columns3, HandHeart, Hash, IdCard, Info, ListFilter, MessageCircle, Pencil, Plus, RefreshCw, Search, SquareCheck, Trash2, Type, User, UserPlus, X } from 'lucide-vue-next';
import { ApiError, apiService } from '../api/apiService';
import AsistenciaDialog from '../components/AsistenciaDialog.vue';
import AgregarPersonaRapida from '../components/AgregarPersonaRapida.vue';
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import { buscarCoherente } from '../components/EntidadSelector.vue';
import AsistenciaCelda from '../components/AsistenciaCelda.vue';
import CampanaMensajeCelda from '../components/CampanaMensajeCelda.vue';
import type { ColumnaCampana } from '../types';
import { matchesSearch } from '../utils/search';
import { whatsappUrl } from '../utils/whatsapp';
import { CAMPOS_FICHA, campoDe, cumpleFiltros, datoFicha, describirFiltro, modoDe, opcionesLista, telefonoGestor, textoFicha, type FiltroCampana, type PersonaFicha } from '../utils/campanaFiltros';
import type { Campana, CampoFicha, CrearCampana, DetalleCampana, EntidadResumen, EstadoCampana, ParticipanteCampana, TipoColumnaCampana, GuardarValorCampana, ValorAsistencia, ValorCampana } from '../types';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.campanaId) || null);
const campanas = ref<Campana[]>([]);
const detalle = ref<DetalleCampana | null>(null);
const loading = ref(false);
const busy = ref(false);
const pending = ref(0);
const working = computed(() => busy.value || pending.value > 0);
const error = ref('');
const notice = ref('');
const filtro = ref('');
const filtros = ref<FiltroCampana[]>([]);
/** Filtro en construcción: primero se elige qué filtrar ("padrino" o el id de una columna) y luego su condición. */
const nuevoFiltro = ref({ objetivo: '', marcada: 'si', desde: '', hasta: '', valor: '', texto: '' });
const modal = ref<'campana' | 'persona' | 'padrino' | 'columna' | 'mensaje' | 'quitar' | 'quitarColumna' | null>(null);
const mensajeColumna = ref<ColumnaCampana | null>(null);
const columnaAQuitar = ref<ColumnaCampana | null>(null);
const mensajeForm = ref('');
const modalError = ref('');
const selected = ref<ParticipanteCampana | null>(null);
const form = ref<CrearCampana>({ nombre: '', fecha: '', descripcion: '', plantilla: 'apadrinamiento' });
const columna = ref<{ nombre: string; tipo: TipoColumnaCampana; persona: PersonaFicha; campo: CampoFicha }>({ nombre: '', tipo: 'boolean', persona: 'beneficiario', campo: 'edad' });
const nombreSugerido = computed(() => {
    const etiqueta = CAMPOS_FICHA.find(c => c.campo === columna.value.campo)?.etiqueta ?? '';
    return columna.value.persona === 'padrino' ? `${etiqueta} del padrino` : etiqueta;
});
const camposUsados = computed(() => new Set(detalle.value?.columnas.filter(c => c.tipo === 'ficha').map(c => c.clave) ?? []));
const search = ref('');
const results = ref<EntidadResumen[]>([]);
const searching = ref(false);
const cerrada = computed(() => detalle.value?.campana.estado === 'cerrada');
const title = computed(() => ({ campana: 'Crear campaña', persona: 'Agregar beneficiario', padrino: 'Asignar padrino o madrina', columna: 'Agregar columna', mensaje: 'Editar mensaje para todos', quitar: 'Retirar participante', quitarColumna: 'Eliminar columna' }[modal.value ?? 'campana']));
const list = computed(() => campanas.value.filter(c => matchesSearch(filtro.value, c.nombre, c.descripcion)));
const columnasFicha = computed(() => detalle.value?.columnas.filter(c => c.tipo === 'ficha') ?? []);
const rows = computed(() => (detalle.value?.participantes ?? []).filter(p =>
    matchesSearch(filtro.value, p.beneficiario.nombreCompleto, p.padrino?.nombreCompleto, p.padrino?.gestor,
        ...columnasFicha.value.map(c => textoFicha(p, c))) &&
    cumpleFiltros(p, filtros.value, detalle.value?.columnas ?? [])));
const checkpoints = computed(() => detalle.value?.columnas.filter(c => c.tipo === 'boolean') ?? []);
const columnaObjetivo = computed(() => detalle.value?.columnas.find(c => String(c.id) === nuevoFiltro.value.objetivo) ?? null);
const modoObjetivo = computed(() => {
    const c = columnaObjetivo.value;
    if (nuevoFiltro.value.objetivo === 'padrino') return 'padrino';
    if (!c) return null;
    if (c.tipo === 'boolean') return 'casilla';
    const ref = campoDe(c);
    return ref ? modoDe(ref.campo) : null;
});
const opcionesObjetivo = computed(() => columnaObjetivo.value && modoObjetivo.value === 'lista' ? opcionesLista(detalle.value?.participantes ?? [], columnaObjetivo.value) : []);
const filtroValido = computed(() => {
    const f = nuevoFiltro.value;
    if (modoObjetivo.value === 'rango') return f.desde !== '' || f.hasta !== '';
    if (modoObjetivo.value === 'texto') return f.texto.trim() !== '';
    return modoObjetivo.value !== null;
});
watch(() => nuevoFiltro.value.objetivo, () => {
    Object.assign(nuevoFiltro.value, { desde: '', hasta: '', texto: '', valor: opcionesObjetivo.value[0] ?? '' });
});
let filtroSeq = 0;
function agregarFiltro() {
    const f = nuevoFiltro.value; const c = columnaObjetivo.value; const fid = String(++filtroSeq);
    let nuevo: FiltroCampana | null = null;
    if (modoObjetivo.value === 'padrino') nuevo = { id: fid, tipo: 'padrino', con: f.marcada === 'si' };
    else if (c && modoObjetivo.value === 'casilla') nuevo = { id: fid, tipo: 'casilla', columnaId: c.id, marcada: f.marcada === 'si' };
    else if (c && modoObjetivo.value === 'rango') nuevo = { id: fid, tipo: 'rango', columnaId: c.id, desde: f.desde === '' ? null : Number(f.desde), hasta: f.hasta === '' ? null : Number(f.hasta) };
    else if (c && modoObjetivo.value === 'lista') nuevo = { id: fid, tipo: 'lista', columnaId: c.id, valor: f.valor };
    else if (c && modoObjetivo.value === 'texto') nuevo = { id: fid, tipo: 'texto', columnaId: c.id, texto: f.texto.trim() };
    if (!nuevo) return;
    filtros.value = [...filtros.value, nuevo];
    nuevoFiltro.value = { objetivo: '', marcada: 'si', desde: '', hasta: '', valor: '', texto: '' };
}
const quitarFiltro = (fid: string) => { filtros.value = filtros.value.filter(f => f.id !== fid); };
function filtrarSinPadrino() {
    const activo = filtros.value.find(f => f.tipo === 'padrino');
    filtros.value = filtros.value.filter(f => f.tipo !== 'padrino');
    if (!activo || activo.con) filtros.value = [...filtros.value, { id: String(++filtroSeq), tipo: 'padrino', con: false }];
}
const filtrosAbiertos = ref(false);
/** Menú de opciones de una columna; se posiciona fijo para no quedar recortado por el scroll de la tabla. */
const menuColumna = ref<number | null>(null);
const menuPos = ref({ x: 0, y: 0 });
const menuColumnaActual = computed(() => {
    const columnas = detalle.value?.columnas ?? [];
    const index = columnas.findIndex(c => c.id === menuColumna.value);
    return index >= 0 ? { index, columna: columnas[index]! } : null;
});
function abrirMenuColumna(columnaId: number, event: MouseEvent) {
    if (menuColumna.value === columnaId) { menuColumna.value = null; return; }
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuPos.value = { x: Math.max(8, Math.min(r.right - 220, window.innerWidth - 228)), y: r.bottom + 4 };
    menuColumna.value = columnaId;
}
const ICONOS_COLUMNA = { boolean: SquareCheck, text: Type, number: Hash, whatsapp: MessageCircle, ficha: IdCard } as const;
const iconoColumna = (tipo: TipoColumnaCampana) => ICONOS_COLUMNA[tipo as keyof typeof ICONOS_COLUMNA] ?? Type;
const delivered = computed(() => detalle.value?.participantes.filter(p => valor(p, 'entregado') === true).length ?? 0);
const thanks = computed(() => detalle.value?.participantes.filter(p => valor(p, 'agradecimiento') === true).length ?? 0);
const hasDelivery = computed(() => detalle.value?.columnas.some(c => c.clave === 'entregado'));
let readSequence = 0;
let searchSequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.';
const fecha = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString('es-CL');
const actualizado = (v?: ValorCampana) => v ? new Date(v.actualizadoEn).toLocaleString('es-CL') : '';
function valor(p: ParticipanteCampana, clave: string) {
    const c = detalle.value?.columnas.find(c => c.clave === clave || String(c.id) === clave);
    return c ? p.valores[String(c.id)]?.valor : null;
}
function padrinoCount(personaId: number) { return detalle.value?.participantes.filter(p => p.padrino?.id === personaId).length ?? 0; }

async function load() {
    const currentId = id.value;
    const sequence = ++readSequence;
    loading.value = true;
    try {
        if (currentId) {
            const data = await apiService.getCampana(currentId);
            if (!disposed && sequence === readSequence) detalle.value = data;
        } else {
            const data = await apiService.getCampanas();
            if (!disposed && sequence === readSequence) campanas.value = data;
        }
    } catch (e) {
        if (!disposed && sequence === readSequence) {
            error.value = errorText(e);
            if (e instanceof ApiError && e.status === 404) detalle.value = null;
        }
    } finally { if (!disposed && sequence === readSequence) loading.value = false; }
}
watch(() => route.params.campanaId, () => {
    detalle.value = null; modal.value = null; filtro.value = ''; filtrosAbiertos.value = false; menuColumna.value = null; filtros.value = []; nuevoFiltro.value = { objetivo: '', marcada: 'si', desde: '', hasta: '', valor: '', texto: '' }; error.value = ''; notice.value = '';
    search.value = ''; ++searchSequence;
    void load();
}, { immediate: true });
watch(search, query => {
    clearTimeout(timer);
    const sequence = ++searchSequence;
    results.value = []; modalError.value = '';
    searching.value = query.trim().length >= 2;
    if (!searching.value) return;
    timer = setTimeout(async () => {
        try {
            // Misma búsqueda que EntidadSelector (nombre/apellido en cualquier orden, sin tildes, RUT con o sin formato).
            const data = await buscarCoherente(query.trim(), 'PersonaNatural');
            if (disposed || sequence !== searchSequence) return;
            results.value = data.filter(p => p.tipoEntidad === 'PersonaNatural' && (modal.value === 'persona'
                ? !detalle.value?.participantes.some(row => row.beneficiario.id === p.id)
                : p.id !== selected.value?.beneficiario.id)).slice(0, 20);
        } catch (e) { if (!disposed && sequence === searchSequence) modalError.value = errorText(e); }
        finally { if (!disposed && sequence === searchSequence) searching.value = false; }
    }, 250);
});
onBeforeUnmount(() => { disposed = true; ++readSequence; ++searchSequence; clearTimeout(timer); });

function open(kind: NonNullable<typeof modal.value>, row: ParticipanteCampana | null = null) {
    selected.value = row; modalError.value = ''; search.value = ''; results.value = []; modal.value = kind;
    if (kind === 'campana') {
        const today = new Date();
        form.value = { nombre: '', fecha: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`, descripcion: '', plantilla: 'apadrinamiento' };
    }
    if (kind === 'columna') columna.value = { nombre: '', tipo: 'boolean', persona: 'beneficiario', campo: 'edad' };
}
async function mutate(action: () => Promise<void>) {
    if (working.value || loading.value) return;
    busy.value = true; error.value = ''; modalError.value = ''; notice.value = '';
    try { await action(); }
    catch (e) { if (modal.value) modalError.value = errorText(e); else error.value = errorText(e); }
    finally { busy.value = false; if (!disposed) await load(); }
}
async function create() {
    await mutate(async () => {
        const created = await apiService.crearCampana(form.value);
        modal.value = null; await router.push(`/campanas/${created.id}`);
    });
}
// Persona no encontrada: alta rápida y se asigna de inmediato.
const crearPersonaAbierto = ref(false);
function personaCreada(_rut: string, personaId?: number) {
    if (personaId) void choose(personaId);
}

async function choose(personaId: number | null) {
    const campaignId = id.value; const row = selected.value; const kind = modal.value;
    if (!campaignId) return;
    await mutate(async () => {
        if (kind === 'persona' && personaId) await apiService.agregarParticipanteCampana(campaignId, personaId);
        else if (row) await apiService.asignarPadrino(campaignId, row.id, personaId, row.version);
        modal.value = null; notice.value = kind === 'persona' ? 'Beneficiario agregado.' : 'Asignación actualizada.';
    });
}
async function addColumn() {
    const campaignId = id.value; if (!campaignId) return;
    const { nombre, tipo, persona, campo } = columna.value;
    const datos = tipo === 'ficha'
        ? { nombre: nombre.trim() || nombreSugerido.value, tipo, campo: `${persona}.${campo}` }
        : { nombre, tipo };
    await mutate(async () => { await apiService.crearColumnaCampana(campaignId, datos); modal.value = null; });
}
async function moverColumna(index: number, delta: -1 | 1) {
    const campaignId = id.value; const columnas = detalle.value?.columnas;
    const destino = index + delta;
    if (!campaignId || !columnas || destino < 0 || destino >= columnas.length) return;
    const orden = columnas.map(c => c.id);
    [orden[index], orden[destino]] = [orden[destino]!, orden[index]!];
    await mutate(async () => { await apiService.ordenarColumnasCampana(campaignId, orden); });
}
function pedirQuitarColumna(c: ColumnaCampana) {
    columnaAQuitar.value = c; modalError.value = ''; modal.value = 'quitarColumna';
}
async function quitarColumna() {
    const campaignId = id.value; const c = columnaAQuitar.value; if (!campaignId || !c) return;
    await mutate(async () => { await apiService.eliminarColumnaCampana(campaignId, c.id); modal.value = null; filtros.value = filtros.value.filter(f => f.tipo === 'padrino' || f.columnaId !== c.id); notice.value = `Columna "${c.nombre}" eliminada.`; });
}
function editarMensaje(c: ColumnaCampana) {
    mensajeColumna.value = { ...c }; mensajeForm.value = c.mensaje; modalError.value = ''; modal.value = 'mensaje';
}
async function configurarMensaje(c: ColumnaCampana, mensaje: string, destinatario = c.destinatario) {
    const campaignId = id.value; if (!campaignId) return;
    await mutate(async () => {
        await apiService.configurarMensajeCampana(campaignId, c.id, { mensaje, destinatario, version: c.version });
        modal.value = null;
    });
}
async function setEstado(estado: EstadoCampana) {
    const c = detalle.value?.campana; if (!c) return;
    await mutate(async () => { await apiService.cambiarEstadoCampana(c.id, estado, c.version); notice.value = 'Estado actualizado.'; });
}
async function remove() {
    const campaignId = id.value; const row = selected.value; if (!campaignId || !row) return;
    await mutate(async () => { await apiService.quitarParticipanteCampana(campaignId, row.id); modal.value = null; notice.value = 'Participante retirado de la campaña.'; });
}
async function saveCell(rowId: number, columnId: number, value: GuardarValorCampana): Promise<ValorCampana> {
    const campaignId = id.value;
    if (!campaignId || cerrada.value || busy.value || loading.value) throw new Error('Espera a que termine la actualización antes de editar.');
    ++pending.value;
    try {
        const result = await apiService.guardarValorCampana(campaignId, rowId, columnId, value);
        if (id.value === campaignId) {
            const row = detalle.value?.participantes.find(p => p.id === rowId);
            if (row) row.valores[String(columnId)] = result;
        }
        return result;
    } catch (e) {
        if (e instanceof ApiError && e.status === 409 && id.value === campaignId) await load();
        throw e;
    } finally { --pending.value; }
}
</script>

<template>
    <main class="campaign-page">
        <header v-if="id" class="detail-header">
            <RouterLink to="/campanas" class="back-link" aria-label="Todas las campañas" title="Todas las campañas"><ArrowLeft :size="16" /></RouterLink>
            <div class="detail-title">
                <h1>{{ detalle?.campana.nombre ?? 'Campaña' }}</h1>
                <span v-if="detalle" class="muted-sm">{{ fecha(detalle.campana.fecha) }}</span>
                <span v-if="detalle?.campana.descripcion" class="description-hint" :title="detalle.campana.descripcion"><Info :size="14" /></span>
            </div>
            <div v-if="detalle" class="stats" aria-label="Resumen de campaña">
                <span><strong>{{ detalle.campana.totalParticipantes }}</strong> beneficiarios</span>
                <button type="button" class="stat-link" :class="{ active: filtros.some(f => f.tipo === 'padrino' && !f.con) }" title="Filtrar sin padrino" @click="filtrarSinPadrino"><strong>{{ detalle.campana.sinPadrino }}</strong> sin padrino</button>
                <span v-if="hasDelivery"><strong>{{ delivered }}</strong> entregados</span>
                <span v-if="hasDelivery"><strong>{{ thanks }}</strong> agradecidos</span>
            </div>
            <div class="detail-actions">
                <select v-if="detalle" class="state-select" :class="`state-${detalle.campana.estado}`" :value="detalle.campana.estado" :disabled="working || loading" aria-label="Estado de la campaña" @change="setEstado(($event.target as HTMLSelectElement).value as EstadoCampana)"><option value="borrador">Borrador</option><option value="activa">Activa</option><option value="cerrada">Cerrada</option></select>
                <button type="button" class="tool" :disabled="working || loading" aria-label="Actualizar campaña" title="Actualizar" @click="error = ''; load()"><RefreshCw :size="14" :class="{ 'animate-spin': loading }" /></button>
            </div>
        </header>
        <header v-else class="campaign-header">
            <div />
            <div class="actions">
                <button class="btn btn-outline" :disabled="working || loading" aria-label="Actualizar campañas" @click="error = ''; load()"><RefreshCw :size="16" :class="{ 'animate-spin': loading }" /> Actualizar</button>
                <button class="btn btn-primary" :disabled="working || loading" @click="open('campana')"><Plus :size="17" /> Nueva campaña</button>
            </div>
        </header>
        <p v-if="error" role="alert" class="feedback error">{{ error }}</p>
        <p v-if="notice" role="status" class="feedback">{{ notice }}</p>
        <p v-if="loading && !detalle && !campanas.length" role="status" class="empty">Cargando campañas…</p>

        <template v-if="!id">
            <label class="search-box"><Search :size="18" /><input v-model="filtro" aria-label="Buscar campaña" placeholder="Buscar campaña…" /></label>
            <div v-if="list.length" class="campaign-grid">
                <RouterLink v-for="c in list" :key="c.id" :to="`/campanas/${c.id}`" class="surface-card campaign-card">
                    <div class="card-top"><HandHeart :size="25" /><span class="state">{{ c.estado }}</span><ArrowUpRight :size="18" /></div>
                    <p class="muted">{{ fecha(c.fecha) }}</p><h2>{{ c.nombre }}</h2><p v-if="c.descripcion" class="card-description">{{ c.descripcion }}</p>
                    <footer><span><strong>{{ c.totalParticipantes }}</strong> beneficiarios</span><span><strong>{{ c.sinPadrino }}</strong> sin padrino</span></footer>
                </RouterLink>
            </div>
            <section v-else-if="!loading && !error" class="surface-card empty"><HandHeart :size="36" /><h2>{{ filtro ? 'No hay coincidencias' : 'El próximo vínculo empieza aquí' }}</h2><button v-if="!filtro" class="btn btn-primary" @click="open('campana')">Crear primera campaña</button></section>
        </template>

        <template v-else-if="detalle">
            <section class="grid-shell">
                <div class="grid-toolbar">
                    <div class="toolbar-group">
                        <div class="filter-anchor">
                            <button type="button" class="tool" :class="{ active: filtros.length }" :aria-expanded="filtrosAbiertos" @click="filtrosAbiertos = !filtrosAbiertos"><ListFilter :size="14" /> {{ filtros.length ? `${filtros.length} ${filtros.length === 1 ? 'filtro' : 'filtros'}` : 'Filtrar' }}</button>
                            <template v-if="filtrosAbiertos">
                                <div class="popover-backdrop" @click="filtrosAbiertos = false" />
                                <div class="filter-popover" role="dialog" aria-label="Filtros">
                                    <p v-if="!filtros.length" class="popover-empty">Sin filtros aplicados a esta vista.</p>
                                    <ul v-else class="filter-list">
                                        <li v-for="(f, i) in filtros" :key="f.id"><span class="filter-join">{{ i === 0 ? 'Donde' : 'y' }}</span><span class="filter-desc">{{ describirFiltro(f, detalle.columnas) }}</span><button type="button" class="icon-btn" :aria-label="`Quitar filtro ${describirFiltro(f, detalle.columnas)}`" @click="quitarFiltro(f.id)"><X :size="13" /></button></li>
                                    </ul>
                                    <form class="filter-builder" @submit.prevent="agregarFiltro">
                                        <span class="filter-join">{{ filtros.length ? 'y' : 'Donde' }}</span>
                                        <select v-model="nuevoFiltro.objetivo" aria-label="Filtrar por"><option value="" disabled>Campo…</option><option value="padrino">Padrino / madrina</option><optgroup v-if="checkpoints.length" label="Casillas"><option v-for="c in checkpoints" :key="c.id" :value="String(c.id)">{{ c.nombre }}</option></optgroup><optgroup v-if="columnasFicha.length" label="Datos de la ficha"><option v-for="c in columnasFicha" :key="c.id" :value="String(c.id)">{{ c.nombre }}</option></optgroup></select>
                                        <select v-if="modoObjetivo === 'padrino'" v-model="nuevoFiltro.marcada" aria-label="Condición"><option value="si">está asignado</option><option value="no">no está asignado</option></select>
                                        <select v-else-if="modoObjetivo === 'casilla'" v-model="nuevoFiltro.marcada" aria-label="Condición"><option value="si">está marcado</option><option value="no">no está marcado</option></select>
                                        <template v-else-if="modoObjetivo === 'rango'"><input v-model="nuevoFiltro.desde" type="number" placeholder="Desde" aria-label="Desde" class="range-input" /><input v-model="nuevoFiltro.hasta" type="number" placeholder="Hasta" aria-label="Hasta" class="range-input" /></template>
                                        <select v-else-if="modoObjetivo === 'lista'" v-model="nuevoFiltro.valor" aria-label="Valor"><option v-for="o in opcionesObjetivo" :key="o" :value="o">{{ o || 'Sin dato' }}</option></select>
                                        <input v-else-if="modoObjetivo === 'texto'" v-model="nuevoFiltro.texto" placeholder="contiene…" aria-label="Texto a buscar" />
                                        <button class="tool add" :disabled="!filtroValido"><Plus :size="13" /> Agregar</button>
                                    </form>
                                    <button v-if="filtros.length" type="button" class="clear-filters" @click="filtros = []">Quitar todos los filtros</button>
                                </div>
                            </template>
                        </div>
                        <button type="button" class="tool" :disabled="cerrada || working || loading" @click="open('columna')"><Columns3 :size="14" /> Agregar columna</button>
                        <button type="button" class="tool" :disabled="cerrada || working || loading" @click="open('persona')"><UserPlus :size="14" /> Agregar beneficiario</button>
                    </div>
                    <label class="grid-search"><Search :size="14" /><input v-model="filtro" placeholder="Buscar…" aria-label="Buscar participante" /></label>
                </div>
                <p v-if="cerrada" class="closed-note">Campaña cerrada. Cambia su estado a activa para continuar el seguimiento.</p>
                <div v-if="rows.length" class="table-scroll" @scroll="menuColumna = null">
                    <table class="campaign-table">
                        <thead><tr>
                            <th class="row-num" aria-label="Fila" />
                            <th class="beneficiary"><span class="head-label"><User :size="13" /> Beneficiario</span></th>
                            <th class="sponsor"><span class="head-label"><HandHeart :size="13" /> Padrino / madrina</span></th>
                            <th v-for="c in detalle.columnas" :key="c.id" :class="`col-${c.tipo}`">
                                <div class="head-cell">
                                    <span class="head-label" :title="c.nombre"><component :is="iconoColumna(c.tipo)" :size="13" /><span class="head-name">{{ c.nombre }}</span></span>
                                    <button type="button" class="icon-btn head-menu-btn" :aria-label="`Opciones de ${c.nombre}`" :aria-expanded="menuColumna === c.id" @click="abrirMenuColumna(c.id, $event)"><ChevronDown :size="13" /></button>
                                </div>
                            </th>
                            <th class="actions-col" aria-label="Acciones" />
                        </tr></thead>
                        <tbody><tr v-for="(p, n) in rows" :key="p.id">
                            <td class="row-num">{{ n + 1 }}</td>
                            <td class="beneficiary"><span class="cell-name" :title="p.beneficiario.nombreCompleto">{{ p.beneficiario.nombreCompleto }}</span><a v-if="whatsappUrl(p.beneficiario.telefono)" :href="whatsappUrl(p.beneficiario.telefono)" target="_blank" rel="noopener noreferrer" class="phone" :aria-label="`WhatsApp de ${p.beneficiario.nombreCompleto}`"><MessageCircle :size="12" /> {{ p.beneficiario.telefono }}</a></td>
                            <td class="sponsor">
                                <div class="sponsor-cell">
                                    <div v-if="p.padrino" class="sponsor-info">
                                        <span class="cell-name" :title="p.padrino.nombreCompleto">{{ p.padrino.nombreCompleto }}<span v-if="padrinoCount(p.padrino.id) > 1" class="count-badge" :title="`${padrinoCount(p.padrino.id)} beneficiarios en esta campaña`">{{ padrinoCount(p.padrino.id) }}</span></span>
                                        <a v-if="whatsappUrl(p.padrino.telefono)" :href="whatsappUrl(p.padrino.telefono)" target="_blank" rel="noopener noreferrer" class="phone" :aria-label="`WhatsApp de ${p.padrino.nombreCompleto}`"><MessageCircle :size="12" /> {{ p.padrino.telefono }}</a>
                                        <span v-else class="muted-sm">Sin WhatsApp</span>
                                    </div>
                                    <span v-else class="unassigned">Sin asignar</span>
                                    <button type="button" class="icon-btn row-edit" :disabled="cerrada || working || loading" :aria-label="p.padrino ? `Cambiar padrino de ${p.beneficiario.nombreCompleto}` : `Asignar padrino a ${p.beneficiario.nombreCompleto}`" :title="p.padrino ? 'Cambiar asignación' : 'Asignar padrino / madrina'" @click="open('padrino', p)"><Pencil v-if="p.padrino" :size="13" /><Plus v-else :size="13" /></button>
                                </div>
                            </td>
                            <td v-for="c in detalle.columnas" :key="c.id" :class="`col-${c.tipo}`">
                                <template v-if="c.tipo === 'ficha'">
                                    <template v-if="campoDe(c)?.campo === 'apoderado' && typeof datoFicha(p, c) === 'object'">
                                        <span class="cell-name">{{ (datoFicha(p, c) as { nombre: string }).nombre }}<small v-if="(datoFicha(p, c) as { parentesco?: string }).parentesco" class="muted-sm"> · {{ (datoFicha(p, c) as { parentesco?: string }).parentesco }}</small></span>
                                        <a v-if="whatsappUrl((datoFicha(p, c) as { telefono?: string }).telefono)" :href="whatsappUrl((datoFicha(p, c) as { telefono?: string }).telefono)" target="_blank" rel="noopener noreferrer" class="phone"><MessageCircle :size="12" /> {{ (datoFicha(p, c) as { telefono?: string }).telefono }}</a>
                                    </template>
                                    <template v-else-if="campoDe(c)?.campo === 'gestor' && textoFicha(p, c)">
                                        <span class="cell-name">{{ textoFicha(p, c) }}</span>
                                        <a v-if="whatsappUrl(telefonoGestor(p, c))" :href="whatsappUrl(telefonoGestor(p, c))" target="_blank" rel="noopener noreferrer" class="phone" :aria-label="`WhatsApp de ${textoFicha(p, c)}`"><MessageCircle :size="12" /> {{ telefonoGestor(p, c) }}</a>
                                    </template>
                                    <a v-else-if="campoDe(c)?.campo === 'telefono' && whatsappUrl(textoFicha(p, c))" :href="whatsappUrl(textoFicha(p, c))" target="_blank" rel="noopener noreferrer" class="phone"><MessageCircle :size="12" /> {{ textoFicha(p, c) }}</a>
                                    <span v-else-if="textoFicha(p, c)" class="ficha-value" :title="textoFicha(p, c)">{{ textoFicha(p, c) }}</span>
                                    <span v-else class="muted-sm">—</span>
                                </template>
                                <CampanaMensajeCelda v-else-if="c.tipo === 'whatsapp'" :mensaje="c.mensaje" :columna-version="c.version" :dato="p.valores[String(c.id)]" :label="`${c.nombre} · ${p.beneficiario.nombreCompleto}`" :telefono="c.destinatario === 'beneficiario' ? p.beneficiario.telefono : p.padrino?.telefono" :readonly="cerrada || busy || loading" :variables="{ nombre: (c.destinatario === 'beneficiario' ? p.beneficiario.nombreCompleto : p.padrino?.nombreCompleto) ?? '', beneficiario: p.beneficiario.nombreCompleto, campana: detalle.campana.nombre, gustos: String(valor(p, 'gustos') ?? '') }" :save-value="v => saveCell(p.id, c.id, v)" />
                                <template v-else-if="cerrada"><span>{{ p.valores[String(c.id)]?.valor === true ? 'Sí' : p.valores[String(c.id)]?.valor === false ? 'No' : p.valores[String(c.id)]?.valor ?? '—' }}</span></template>
                                <AsistenciaCelda v-else :persona-nombre="p.beneficiario.nombreCompleto" :columna="{ ...c, tipo: c.tipo }" :dato="p.valores[String(c.id)] as ValorAsistencia | undefined" :save-value="async v => await saveCell(p.id, c.id, v) as ValorAsistencia" :title="p.valores[String(c.id)] ? `Última actualización: ${actualizado(p.valores[String(c.id)])}` : undefined" />
                            </td>
                            <td class="actions-col"><button type="button" class="icon-btn row-delete" :disabled="cerrada || working || loading" :aria-label="`Retirar a ${p.beneficiario.nombreCompleto}`" title="Retirar de la campaña" @click="open('quitar', p)"><Trash2 :size="14" /></button></td>
                        </tr></tbody>
                    </table>
                </div>
                <div v-else class="empty"><h3>{{ detalle.participantes.length ? 'No hay registros para este filtro' : 'Agrega a los primeros beneficiarios' }}</h3></div>
                <footer class="grid-footer">{{ rows.length }} {{ rows.length === 1 ? 'registro' : 'registros' }}<template v-if="rows.length !== detalle.participantes.length"> de {{ detalle.participantes.length }}</template></footer>
            </section>
            <template v-if="menuColumnaActual">
                <div class="popover-backdrop" @click="menuColumna = null" />
                <div class="column-menu" role="menu" :style="{ top: `${menuPos.y}px`, left: `${menuPos.x}px` }">
                    <template v-if="menuColumnaActual.columna.tipo === 'whatsapp'">
                        <button type="button" role="menuitem" :disabled="cerrada || working || loading" @click="menuColumna = null; editarMensaje(menuColumnaActual.columna)"><Pencil :size="14" /> Editar mensaje</button>
                        <label class="menu-field">Enviar a<select :value="menuColumnaActual.columna.destinatario" :disabled="cerrada || working || loading" @change="configurarMensaje(menuColumnaActual.columna, menuColumnaActual.columna.mensaje, ($event.target as HTMLSelectElement).value as 'beneficiario' | 'colaborador')"><option value="beneficiario">Beneficiario</option><option value="colaborador">Colaborador</option></select></label>
                        <hr />
                    </template>
                    <button type="button" role="menuitem" :disabled="cerrada || working || loading || menuColumnaActual.index === 0" @click="moverColumna(menuColumnaActual.index, -1); menuColumna = null"><ChevronLeft :size="14" /> Mover a la izquierda</button>
                    <button type="button" role="menuitem" :disabled="cerrada || working || loading || menuColumnaActual.index === detalle.columnas.length - 1" @click="moverColumna(menuColumnaActual.index, 1); menuColumna = null"><ChevronRight :size="14" /> Mover a la derecha</button>
                    <hr />
                    <button type="button" role="menuitem" class="danger" :disabled="cerrada || working || loading" @click="menuColumna = null; pedirQuitarColumna(menuColumnaActual.columna)"><Trash2 :size="14" /> Eliminar columna</button>
                </div>
            </template>
        </template>

        <AsistenciaDialog :open="modal !== null" :title="title" :busy="working || loading" @close="modal = null">
            <p v-if="modalError" role="alert" class="feedback error">{{ modalError }}</p>
            <form v-if="modal === 'mensaje' && mensajeColumna" class="dialog-form" @submit.prevent="configurarMensaje(mensajeColumna, mensajeForm)"><label>Mensaje<textarea v-model="mensajeForm" maxlength="2000" rows="8" /></label><p class="muted">{nombre}: destinatario · {beneficiario} · {campana} · {gustos}</p><button class="btn btn-primary" :disabled="working || loading">Guardar para todos</button></form>
            <form v-if="modal === 'campana'" class="dialog-form" @submit.prevent="create"><label>Nombre<input v-model="form.nombre" required maxlength="120" placeholder="Apadrinamiento Navidad 2026" /></label><label>Fecha de referencia<input v-model="form.fecha" type="date" required /></label><label>Descripción<textarea v-model="form.descripcion" maxlength="2000" rows="3" /></label><label>Plantilla<select v-model="form.plantilla"><option value="apadrinamiento">Apadrinamiento · regalos y agradecimientos</option><option value="personalizada">Personalizada · agregar mis columnas</option></select></label><button class="btn btn-primary" :disabled="working || loading || !form.nombre.trim()">Crear campaña</button></form>
            <div v-else-if="modal === 'persona' || modal === 'padrino'" class="dialog-form"><p v-if="selected">Beneficiario: <strong>{{ selected.beneficiario.nombreCompleto }}</strong></p><p v-if="modal === 'padrino' && selected?.padrino" class="muted">Al cambiar de padrino, la ficha y el agradecimiento quedan pendientes de enviar al nuevo contacto.</p><label>Buscar persona<input v-model="search" placeholder="Nombre o RUT (mínimo 2 caracteres)" :disabled="working" /></label><p v-if="searching" role="status">Buscando…</p><div v-else class="person-results"><button v-for="p in results" :key="p.id" :disabled="working || loading" @click="choose(p.id)"><strong>{{ p.nombreCompleto }}</strong><span>{{ p.identificador || 'Sin RUT' }}<template v-if="modal === 'padrino'"> · {{ padrinoCount(p.id) }} beneficiario(s)</template></span><Plus :size="16" /></button><AgregarPersonaRapida v-if="search.trim().length >= 2 && !results.length" :query="search" @agregar="crearPersonaAbierto = true" /></div><button v-if="modal === 'padrino' && selected?.padrino" class="btn btn-outline" :disabled="working || loading" @click="choose(null)">Quitar padrino y dejar pendiente</button></div>
            <form v-else-if="modal === 'columna'" class="dialog-form" @submit.prevent="addColumn"><label>Nombre<input v-model="columna.nombre" :required="columna.tipo !== 'ficha'" maxlength="120" :placeholder="columna.tipo === 'ficha' ? nombreSugerido : ''" /></label><label>Tipo<select v-model="columna.tipo"><option value="boolean">Casilla · Sí / No</option><option value="text">Texto</option><option value="number">Número</option><option value="whatsapp">Mensaje de WhatsApp</option><option value="ficha">Dato de la ficha · solo lectura</option></select></label><template v-if="columna.tipo === 'ficha'"><label>De quién<select v-model="columna.persona"><option value="beneficiario">Beneficiario</option><option value="padrino">Padrino / madrina</option></select></label><label>Dato<select v-model="columna.campo"><option v-for="c in CAMPOS_FICHA" :key="c.campo" :value="c.campo" :disabled="camposUsados.has(`${columna.persona}.${c.campo}`)">{{ c.etiqueta }}{{ camposUsados.has(`${columna.persona}.${c.campo}`) ? ' (ya agregado)' : '' }}</option></select></label><p class="muted">Se muestra lo que dice la ficha de cada persona y se actualiza solo. Para cambiar un dato, edita la ficha.</p></template><button class="btn btn-primary" :disabled="working || loading || (columna.tipo === 'ficha' ? camposUsados.has(`${columna.persona}.${columna.campo}`) : !columna.nombre.trim())">Agregar columna</button></form>
            <div v-else-if="modal === 'quitar'" class="dialog-form"><p>¿Retirar a <strong>{{ selected?.beneficiario.nombreCompleto }}</strong> de esta campaña? Se eliminará su seguimiento en esta campaña. La persona seguirá registrada en el sistema.</p><button class="btn btn-primary" :disabled="working || loading" @click="remove">Retirar participante</button></div>
            <div v-else-if="modal === 'quitarColumna'" class="dialog-form"><p>¿Eliminar la columna <strong>{{ columnaAQuitar?.nombre }}</strong>? Se borrarán los datos de esta columna para todos los participantes y no se pueden recuperar.</p><button class="btn btn-primary" :disabled="working || loading" @click="quitarColumna">Eliminar columna</button></div>
        </AsistenciaDialog>
        <ModalCrearPersona :is-open="crearPersonaAbierto" :initial-search="search" @close="crearPersonaAbierto = false" @created="personaCreada" />
    </main>
</template>

<style scoped>
.campaign-page { max-width: 1600px; margin: 0 auto; padding: 1rem 1.5rem; color: var(--text-primary); }
.campaign-header { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; margin-bottom: 1.25rem; }
h1 { font-size: clamp(1.8rem, 3vw, 2.6rem); font-weight: 800; letter-spacing: -.04em; line-height: 1.15; overflow-wrap: anywhere; }
h2 { font-size: 1.15rem; font-weight: 750; } h3 { font-weight: 700; }
.muted { color: var(--text-muted); font-size: .8rem; }
.muted-sm { color: var(--text-muted); font-size: .72rem; }
.actions { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; justify-content: flex-end; } .btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; }
.state { display: inline-block; padding: .25rem .65rem; border: 1px solid var(--card-border); border-radius: 999px; font-size: .7rem; text-transform: capitalize; margin-left: .5rem; }
.search-box { display: flex; align-items: center; gap: .6rem; border: 1px solid var(--input-border); border-radius: .75rem; padding: .2rem .75rem; background: var(--input-bg); color: var(--text-muted); max-width: 34rem; }
.search-box input { border: 0; background: transparent; box-shadow: none; min-width: 0; }
.campaign-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 1.25rem; margin-top: 1.5rem; }
.campaign-card { display: flex; flex-direction: column; padding: 1.5rem; border-radius: 1rem; transition: border-color .15s, transform .15s; }
.campaign-card:hover { border-color: var(--accent-color); transform: translateY(-2px); }
.card-top { display: flex; align-items: center; gap: .5rem; color: var(--accent-color); margin-bottom: 1.75rem; } .card-top .state { margin-left: auto; color: var(--text-muted); }
.campaign-card h2 { margin: .4rem 0 .65rem; overflow-wrap: anywhere; } .card-description { color: var(--text-muted); font-size: .85rem; flex: 1; white-space: pre-line; overflow-wrap: anywhere; }
.campaign-card footer { display: flex; gap: 1.5rem; border-top: 1px solid var(--card-border); margin-top: 1.5rem; padding-top: 1rem; color: var(--text-muted); font-size: .8rem; } .campaign-card footer strong { color: var(--text-primary); }

/* ---- Detalle: encabezado compacto ---- */
.detail-header { display: flex; align-items: center; gap: .75rem 1.25rem; flex-wrap: wrap; margin-bottom: .6rem; }
.back-link { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: .4rem; color: var(--text-muted); }
.back-link:hover { background: var(--accent-color-muted); color: var(--text-primary); }
.detail-title { display: flex; align-items: baseline; gap: .6rem; min-width: 0; }
.detail-title h1 { font-size: 1.15rem; font-weight: 750; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.description-hint { align-self: center; display: inline-flex; color: var(--text-muted); cursor: help; }
.stats { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; font-size: .75rem; color: var(--text-muted); }
.stats > * { padding: .2rem .55rem; border: 1px solid var(--card-border); border-radius: .4rem; background: var(--bg-card); }
.stats strong { color: var(--text-primary); font-variant-numeric: tabular-nums; font-weight: 700; }
.stat-link:hover, .stat-link.active { border-color: var(--accent-color); background: var(--accent-color-muted); }
.detail-actions { display: flex; align-items: center; gap: .4rem; margin-left: auto; }
.state-select { width: auto; height: 28px; padding: 0 1.75rem 0 .6rem; font-size: .75rem; font-weight: 650; border-radius: .4rem; }
.state-activa { color: var(--accent-color); }
.state-cerrada { color: var(--text-muted); }

/* ---- Grilla estilo hoja de cálculo ---- */
.grid-shell { display: flex; flex-direction: column; border: 1px solid var(--card-border); border-radius: .5rem; background: var(--bg-card); overflow: hidden; }
.grid-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .35rem .5rem; border-bottom: 1px solid var(--card-border); flex-wrap: wrap; }
.toolbar-group { display: flex; align-items: center; gap: .15rem; flex-wrap: wrap; }
.tool { display: inline-flex; align-items: center; gap: .35rem; height: 28px; padding: 0 .55rem; border-radius: .35rem; font-size: .78rem; font-weight: 550; color: var(--text-primary); white-space: nowrap; }
.tool:hover:not(:disabled) { background: var(--accent-color-muted); }
.tool.active { background: var(--accent-color-muted); color: var(--accent-color); font-weight: 700; }
.grid-search { display: flex; align-items: center; gap: .35rem; height: 28px; padding: 0 .5rem; border: 1px solid transparent; border-radius: .35rem; color: var(--text-muted); width: 15rem; max-width: 100%; }
.grid-search:focus-within, .grid-search:hover { border-color: var(--input-border); background: var(--input-bg); }
.grid-search input { border: 0; padding: 0; height: 100%; background: transparent; box-shadow: none; font-size: .8rem; min-width: 0; }
.filter-anchor { position: relative; }
.popover-backdrop { position: fixed; inset: 0; z-index: 20; }
.filter-popover { position: absolute; top: calc(100% + 6px); left: 0; z-index: 21; width: min(560px, calc(100vw - 2rem)); padding: .75rem; border: 1px solid var(--card-border); border-radius: .5rem; background: var(--bg-card); box-shadow: 0 12px 32px rgba(0, 0, 0, .22); }
.popover-empty { font-size: .78rem; color: var(--text-muted); margin-bottom: .6rem; }
.filter-list { display: grid; gap: .35rem; margin-bottom: .5rem; }
.filter-list li { display: flex; align-items: center; gap: .5rem; font-size: .78rem; }
.filter-desc { flex: 1; padding: .3rem .55rem; border: 1px solid var(--card-border); border-radius: .35rem; background: var(--bg-base); }
.filter-join { width: 3rem; flex: none; font-size: .72rem; color: var(--text-muted); }
.filter-builder { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.filter-builder select, .filter-builder input { width: auto; max-width: 100%; height: 30px; padding-block: 0; font-size: .78rem; }
.filter-builder .add { color: var(--accent-color); }
.range-input { width: 5.5rem !important; }
.clear-filters { display: block; margin-top: .6rem; font-size: .72rem; color: var(--text-muted); text-decoration: underline; }
.icon-btn { display: inline-grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: .3rem; color: var(--text-muted); }
.icon-btn:hover:not(:disabled) { background: var(--accent-color-muted); color: var(--text-primary); }

/* La tabla se desplaza dentro de su propio marco para que el encabezado y la columna del beneficiario queden fijos. */
.table-scroll { overflow: auto; max-height: calc(100vh - 9rem); max-height: calc(100dvh - 9rem); overscroll-behavior: contain; }
.campaign-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; text-align: left; font-size: .8rem; }
.campaign-table thead { position: sticky; top: 0; z-index: 3; }
.campaign-table th, .campaign-table td { border-right: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); }
.campaign-table th { height: 33px; padding: 0 .5rem; background: var(--bg-base); font-size: .75rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.campaign-table td { padding: .35rem .5rem; vertical-align: top; line-height: 1.35; background: var(--bg-card); }
.campaign-table tbody tr:hover td { background: color-mix(in srgb, var(--accent-color) 5%, var(--bg-card)); }
.head-cell { display: flex; align-items: center; justify-content: space-between; gap: .25rem; }
.head-label { display: inline-flex; align-items: center; gap: .35rem; min-width: 0; }
.head-name { overflow: hidden; text-overflow: ellipsis; max-width: 16rem; }
.head-menu-btn { opacity: 0; } th:hover .head-menu-btn, .head-menu-btn[aria-expanded="true"], .head-menu-btn:focus-visible { opacity: 1; }
.row-num { position: sticky; left: 0; z-index: 1; width: 40px; min-width: 40px; text-align: center; color: var(--text-muted); font-size: .7rem; font-variant-numeric: tabular-nums; }
.beneficiary { position: sticky; left: 40px; z-index: 1; min-width: 200px; max-width: 240px; box-shadow: 1px 0 0 var(--card-border); }
th.row-num, th.beneficiary { z-index: 3; }
.sponsor { min-width: 210px; max-width: 260px; }
.cell-name { display: block; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }
.sponsor-cell { display: flex; align-items: flex-start; gap: .25rem; }
.sponsor-info { flex: 1; min-width: 0; }
.row-edit, .row-delete { opacity: 0; } tr:hover .row-edit, tr:hover .row-delete, .row-edit:focus-visible, .row-delete:focus-visible { opacity: 1; }
.unassigned { flex: 1; color: var(--text-muted); font-style: italic; }
.count-badge { display: inline-grid; place-items: center; min-width: 17px; height: 17px; margin-left: .35rem; padding: 0 .3rem; border-radius: 999px; background: var(--accent-color-muted); color: var(--accent-color); font-size: .65rem; font-weight: 700; vertical-align: 1px; }
.phone { display: inline-flex; gap: .3rem; align-items: center; color: var(--accent-color); margin-top: .15rem; font-size: .75rem; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
.ficha-value { display: block; max-width: 18rem; white-space: pre-line; overflow-wrap: anywhere; }
.actions-col { width: 36px; min-width: 36px; text-align: center; }
.col-boolean { min-width: 120px; } .col-text, .col-number { min-width: 150px; }
.campaign-table :deep(.attendance-cell) { min-width: 0; }
.campaign-table :deep(.check-cell) { min-height: 26px; padding: .15rem .5rem; gap: .3rem; border-radius: .35rem; font-size: .72rem; }
.campaign-table :deep(.value-input) { height: 28px; padding: .2rem .4rem; font-size: .8rem; }
.campaign-table :deep(.message-cell) { min-width: 260px; max-width: 320px; gap: .3rem; }
.campaign-table :deep(.message-cell .preview) { max-height: 3.2em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
.campaign-table :deep(.message-cell .controls button) { padding: .2rem .5rem; }
.grid-footer { padding: .35rem .75rem; font-size: .72rem; color: var(--text-muted); border-top: 1px solid var(--card-border); background: var(--bg-base); }
.column-menu { position: fixed; z-index: 21; width: 220px; padding: .3rem; border: 1px solid var(--card-border); border-radius: .5rem; background: var(--bg-card); box-shadow: 0 12px 32px rgba(0, 0, 0, .22); }
.column-menu button { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .4rem .5rem; border-radius: .35rem; font-size: .78rem; text-align: left; }
.column-menu button:hover:not(:disabled) { background: var(--accent-color-muted); }
.column-menu .danger:hover:not(:disabled) { color: var(--danger-color, #c0392b); }
.column-menu hr { margin: .3rem 0; border: 0; border-top: 1px solid var(--card-border); }
.menu-field { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .3rem .5rem; font-size: .75rem; color: var(--text-muted); }
.menu-field select { width: auto; height: 26px; padding-block: 0; font-size: .75rem; }
.closed-note { padding: .4rem .75rem; font-size: .75rem; color: var(--text-muted); background: var(--bg-base); border-bottom: 1px solid var(--card-border); }

.feedback { padding: .5rem .75rem; margin-bottom: .6rem; font-size: .8rem; border: 1px solid var(--accent-color); border-radius: .5rem; background: var(--accent-color-muted); } .feedback.error { border-color: var(--text-muted); background: var(--bg-card); }
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: .8rem; padding: 3rem 1rem; color: var(--text-muted); } .empty h2 { color: var(--text-primary); }
.dialog-form { display: grid; gap: 1rem; } .dialog-form label { display: grid; gap: .4rem; font-size: .85rem; font-weight: 650; } .dialog-form textarea { resize: vertical; }
.person-results { display: grid; gap: .5rem; max-height: 320px; overflow-y: auto; } .person-results button { position: relative; padding: .85rem 2rem .85rem .85rem; border: 1px solid var(--card-border); border-radius: .65rem; text-align: left; } .person-results button:hover { border-color: var(--accent-color); } .person-results strong, .person-results span { display: block; } .person-results span { color: var(--text-muted); font-size: .75rem; margin-top: .25rem; } .person-results svg { position: absolute; right: .75rem; top: 1rem; }
button:disabled { opacity: .5; cursor: not-allowed; }
@media (hover: none) { .head-menu-btn, .row-edit, .row-delete { opacity: 1; } }
@media (max-width: 760px) { .campaign-page { padding: .75rem; } .campaign-header { flex-direction: column; } .actions { justify-content: flex-start; } .detail-actions { margin-left: 0; } .beneficiary { position: static; } .grid-search { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .campaign-card { transition: none; } .campaign-card:hover { transform: none; } }
</style>
