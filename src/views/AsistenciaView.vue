<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowUpRight, CalendarCheck, CalendarDays, Check, ClipboardList, Columns3, Link, LoaderCircle, Plus, Search, Trash2, UserPlus, Users } from 'lucide-vue-next';
import { ApiError, apiService } from '../api/apiService';
import AsistenciaCelda from '../components/AsistenciaCelda.vue';
import AsistenciaDialog from '../components/AsistenciaDialog.vue';
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import type { ColumnaAsistencia, DetalleAsistencia, EntidadResumen, EventoAsistencia, TipoColumnaAsistencia, ValorAsistencia } from '../types';

const route = useRoute();
const router = useRouter();
const eventoId = computed(() => Number(route.params.eventoId) || null);
const eventos = ref<EventoAsistencia[]>([]);
const detalle = ref<DetalleAsistencia | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const connected = ref(false);
const lastSync = ref('');
const busy = ref(false);
const pendingWrites = ref(0);
const working = computed(() => busy.value || pendingWrites.value > 0);
const error = ref('');
const notice = ref('');
const eventFilter = ref('');
const tableFilter = ref('');
const search = ref('');
const results = ref<EntidadResumen[]>([]);
const searching = ref(false);
const searchError = ref('');
const showResults = ref(false);
const activeResult = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const newPersonOpen = ref(false);
const modal = ref<'event' | 'column' | 'delete' | null>(null);
const modalError = ref('');
const eventForm = ref({ nombre: '', fecha: '', descripcion: '' });
const columnForm = ref<{ nombre: string; tipo: TipoColumnaAsistencia }>({ nombre: '', tipo: 'boolean' });
const deletion = ref<{ kind: 'event' | 'column' | 'person'; id: number; eventoId: number; name: string } | null>(null);
let revision = 0;
let readSequence = 0;
let searchSequence = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let disposed = false;

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.\-]/g, '');
const filteredEvents = computed(() => eventos.value.filter(e => normalize(e.nombre).includes(normalize(eventFilter.value))));
const asistentes = computed(() => (detalle.value?.asistentes ?? []).filter(p => normalize(`${p.nombreCompleto} ${p.rut ?? ''}`).includes(normalize(tableFilter.value))));
const presentIds = computed(() => new Set(detalle.value?.asistentes.map(p => p.personaId)));
const modalTitle = computed(() => modal.value === 'event' ? 'Crear evento' : modal.value === 'column' ? 'Agregar columna' : deletion.value?.kind === 'event' ? 'Eliminar evento' : deletion.value?.kind === 'column' ? 'Eliminar columna' : 'Quitar asistencia');
const fecha = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const hora = (value: string) => new Date(value).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.';

async function refresh() {
    const id = eventoId.value;
    const sequence = ++readSequence;
    const version = revision;
    refreshing.value = true;
    try {
        const data = id ? await apiService.getAsistencia(id) : await apiService.getEventosAsistencia();
        if (disposed || sequence !== readSequence || version !== revision || working.value) return;
        if (id) detalle.value = data as DetalleAsistencia;
        else eventos.value = data as EventoAsistencia[];
        connected.value = true;
        lastSync.value = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch (e) {
        if (disposed || sequence !== readSequence) return;
        connected.value = false;
        if (e instanceof ApiError && e.status === 404) {
            detalle.value = null;
            error.value = 'Este evento fue eliminado. Vuelve a los eventos para continuar.';
        } else if (loading.value) error.value = errorText(e);
    } finally {
        if (sequence === readSequence && !disposed) { refreshing.value = false; loading.value = false; }
    }
}

watch(() => route.params.eventoId, () => {
    ++revision;
    ++searchSequence;
    detalle.value = null;
    loading.value = true;
    connected.value = false;
    error.value = '';
    notice.value = '';
    search.value = '';
    tableFilter.value = '';
    modal.value = null;
    newPersonOpen.value = false;
    void refresh();
}, { immediate: true });

watch(search, query => {
    clearTimeout(searchTimer);
    const sequence = ++searchSequence;
    results.value = [];
    searchError.value = '';
    activeResult.value = 0;
    showResults.value = query.trim().length >= 2;
    searching.value = showResults.value;
    if (!showResults.value) return;
    searchTimer = setTimeout(async () => {
        try {
            const data = await apiService.buscarEntidades(query.trim(), 'Persona');
            if (sequence === searchSequence && !disposed) results.value = data.filter(p => p.tipoEntidad === 'Persona').slice(0, 20);
        } catch (e) {
            if (sequence === searchSequence && !disposed) searchError.value = errorText(e);
        } finally {
            if (sequence === searchSequence && !disposed) searching.value = false;
        }
    }, 250);
});

async function mutate(action: () => Promise<void>) {
    if (working.value) return;
    busy.value = true;
    ++revision;
    error.value = '';
    notice.value = '';
    modalError.value = '';
    try { await action(); }
    catch (e) {
        if (modal.value) modalError.value = errorText(e);
        else error.value = errorText(e);
    } finally {
        busy.value = false;
        ++revision;
        if (!disposed) await refresh();
    }
}

function openEvent() {
    const today = new Date();
    eventForm.value = { nombre: '', fecha: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`, descripcion: '' };
    modalError.value = '';
    modal.value = 'event';
}

async function createEvent() {
    await mutate(async () => {
        const result = await apiService.crearEventoAsistencia({ ...eventForm.value, nombre: eventForm.value.nombre.trim() });
        modal.value = null;
        await router.push(`/asistencia/${result.id}`);
    });
}

function openColumn() {
    columnForm.value = { nombre: '', tipo: 'boolean' };
    modalError.value = '';
    modal.value = 'column';
}

async function createColumn() {
    const id = eventoId.value;
    if (!id) return;
    await mutate(async () => {
        await apiService.crearColumnaAsistencia(id, { ...columnForm.value, nombre: columnForm.value.nombre.trim() });
        modal.value = null;
        notice.value = 'Columna agregada. Ya está disponible para todos los asistentes.';
    });
}

async function addPerson(personaId: number, nombre: string) {
    const id = eventoId.value;
    if (!id || presentIds.value.has(personaId)) return;
    await mutate(async () => {
        const result = await apiService.agregarAsistente(id, personaId);
        search.value = '';
        showResults.value = false;
        notice.value = result.creada ? `${nombre}: asistencia registrada.` : `${nombre} ya estaba en la asistencia. No se duplicó el registro.`;
        await nextTick();
        searchInput.value?.focus();
    });
    searchInput.value?.focus();
}

async function personCreated(rut: string, id?: number) {
    if (id) await addPerson(id, 'Nueva persona');
    else search.value = rut;
}

function chooseActive() {
    const person = results.value[activeResult.value];
    if (showResults.value && person) void addPerson(person.id, person.nombreCompleto);
}

function confirmDelete(kind: 'event' | 'column' | 'person', id: number, name: string, eventId = eventoId.value) {
    if (!eventId) return;
    deletion.value = { kind, id, name, eventoId: eventId };
    modalError.value = '';
    modal.value = 'delete';
}

async function performDelete() {
    const target = deletion.value;
    if (!target) return;
    await mutate(async () => {
        if (target.kind === 'event') {
            await apiService.eliminarEventoAsistencia(target.id);
            if (eventoId.value === target.id) await router.push('/asistencia');
        } else if (target.kind === 'column') await apiService.eliminarColumnaAsistencia(target.eventoId, target.id);
        else await apiService.quitarAsistente(target.eventoId, target.id);
        modal.value = null;
        notice.value = target.kind === 'person' ? 'Asistencia retirada. La persona sigue en el sistema.' : 'Eliminado correctamente.';
    });
}

async function saveCell(asistenciaId: number, columnaId: number, dato: ValorAsistencia): Promise<ValorAsistencia> {
    const id = eventoId.value;
    if (!id) throw new Error('Selecciona un evento.');
    // The page owns pending requests even if a filter or remote deletion unmounts the cell.
    ++pendingWrites.value;
    ++revision;
    error.value = '';
    try {
        const result = await apiService.guardarValorAsistencia(id, asistenciaId, columnaId, dato);
        const row = detalle.value?.evento.id === id ? detalle.value.asistentes.find(p => p.id === asistenciaId) : undefined;
        if (row) row.valores[String(columnaId)] = result;
        return result;
    } catch (e) {
        error.value = errorText(e);
        throw e;
    } finally {
        --pendingWrites.value;
        ++revision;
        if (!disposed && !working.value) void refresh();
    }
}

function summary(column: ColumnaAsistencia) {
    const values = (detalle.value?.asistentes ?? []).map(p => p.valores[String(column.id)]?.valor);
    if (column.tipo === 'boolean') return `${values.filter(v => v === true).length} sí · ${values.filter(v => v === false).length} no`;
    if (column.tipo === 'number') return `Total: ${values.reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0).toLocaleString('es-CL')}`;
    const count = values.filter(v => typeof v === 'string' && v.trim()).length;
    return `${count} ${count === 1 ? 'respuesta' : 'respuestas'}`;
}

async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); notice.value = 'Enlace copiado. Ábrelo en otro equipo con acceso al sistema.'; }
    catch { error.value = 'No se pudo copiar el enlace. Puedes copiar la dirección del navegador.'; }
}

function resume() { if (!document.hidden && !working.value && !refreshing.value) void refresh(); }
onMounted(() => {
    pollTimer = setInterval(resume, 3000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
});
onBeforeUnmount(() => {
    disposed = true;
    ++readSequence;
    ++searchSequence;
    clearTimeout(searchTimer);
    clearInterval(pollTimer);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
});
</script>

<template>
    <main class="attendance-page">
        <header class="page-heading">
            <div>
                <RouterLink v-if="eventoId" to="/asistencia" class="back-link"><ArrowLeft :size="16" /> Todos los eventos</RouterLink>
                <p v-else class="eyebrow">Comunidad · Encuentros</p>
                <h1>{{ eventoId ? (detalle?.evento.nombre ?? 'Asistencia del evento') : 'Asistencia' }}</h1>
                <p class="muted mt-2">{{ eventoId ? 'Busca a cada persona al llegar y registra su participación.' : 'Cada encuentro, su propia lista. Registra a las personas a medida que llegan.' }}</p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <template v-if="detalle">
                    <button class="btn-secondary" @click="copyLink"><Link :size="17" /> Copiar enlace</button>
                    <button class="btn-ghost !p-3" aria-label="Eliminar evento" :disabled="working" @click="confirmDelete('event', detalle.evento.id, detalle.evento.nombre)"><Trash2 :size="18" /></button>
                </template>
                <button v-else-if="!eventoId" class="btn-primary" :disabled="working" @click="openEvent"><Plus :size="19" /> Crear evento</button>
            </div>
        </header>

        <div v-if="error" role="alert" class="message error-message">{{ error }} <button class="underline ml-2" @click="refresh">Reintentar</button></div>
        <div v-if="notice" role="status" class="message success-message"><Check :size="18" /> {{ notice }} <button class="ml-auto" aria-label="Cerrar aviso" @click="notice = ''">×</button></div>
        <div v-if="!loading && !connected" role="status" class="message error-message">No se pudo actualizar la lista. Reintentando automáticamente…</div>
        <div v-if="loading" class="empty-state"><LoaderCircle class="animate-spin" :size="28" /><p>Cargando asistencia…</p></div>

        <template v-else-if="!eventoId">
            <div class="section-bar">
                <p class="muted">{{ eventos.length }} {{ eventos.length === 1 ? 'evento' : 'eventos' }}</p>
                <label class="search-field"><Search :size="18" /><input v-model="eventFilter" aria-label="Buscar evento" placeholder="Buscar evento…" /></label>
            </div>
            <div v-if="!eventos.length && connected" class="empty-state surface-card">
                <CalendarCheck :size="44" class="accent" />
                <h2>El próximo encuentro empieza aquí</h2>
                <p>Crea un evento, como “18 de septiembre”. Su lista comenzará vacía.</p>
                <button class="btn-primary mt-2" @click="openEvent"><Plus :size="18" /> Crear primer evento</button>
            </div>
            <p v-else-if="!filteredEvents.length" class="empty-state muted">No hay eventos que coincidan con la búsqueda.</p>
            <div class="events-grid">
                <article v-for="event in filteredEvents" :key="event.id" class="event-card">
                    <RouterLink :to="`/asistencia/${event.id}`" class="event-link">
                        <span class="event-date"><CalendarDays :size="16" /> {{ fecha(event.fecha) }}</span>
                        <h2>{{ event.nombre }}</h2>
                        <p class="muted event-description">{{ event.descripcion || 'Lista abierta para registrar a quienes lleguen.' }}</p>
                        <span class="event-bottom"><span class="flex items-center gap-2"><Users :size="18" /> <strong>{{ event.totalAsistentes }}</strong> asistentes</span><ArrowUpRight :size="22" /></span>
                    </RouterLink>
                    <button class="event-delete btn-ghost !p-2" :aria-label="`Eliminar ${event.nombre}`" :disabled="working" @click="confirmDelete('event', event.id, event.nombre, event.id)"><Trash2 :size="16" /></button>
                </article>
            </div>
        </template>

        <template v-else-if="detalle">
            <section class="event-overview">
                <div class="attendance-count"><strong>{{ detalle.asistentes.length }}</strong><span>personas presentes</span></div>
                <div class="event-context"><p class="flex items-center gap-2"><CalendarDays :size="17" /> {{ fecha(detalle.evento.fecha) }}</p><p v-if="detalle.evento.descripcion" class="muted mt-2 whitespace-pre-wrap">{{ detalle.evento.descripcion }}</p></div>
                <div class="sync-status" :class="{ offline: !connected }"><span class="sync-dot" /><div><strong>{{ pendingWrites ? 'Guardando cambios…' : connected ? 'Actualización automática' : 'Reconectando…' }}</strong><p>{{ lastSync ? `Última actualización ${lastSync}` : 'Conectando con el evento' }}</p></div></div>
            </section>

            <section class="arrival-panel" aria-labelledby="arrival-title">
                <div class="arrival-label"><UserPlus :size="22" /><div><h2 id="arrival-title">Registrar llegada</h2><p class="muted">Busca, selecciona y agrega a la lista.</p></div></div>
                <div class="person-search">
                    <label for="attendance-person-search" class="sr-only">Buscar persona por nombre o RUT</label>
                    <div class="search-field large"><Search :size="20" /><input id="attendance-person-search" ref="searchInput" v-model="search" placeholder="Nombre o RUT de la persona…" autocomplete="off" role="combobox" :aria-expanded="showResults" aria-controls="attendance-person-results" :aria-activedescendant="showResults && results.length ? `person-result-${activeResult}` : undefined" :disabled="busy" @focus="showResults = search.trim().length >= 2" @keydown.down.prevent="activeResult = Math.min(activeResult + 1, results.length - 1)" @keydown.up.prevent="activeResult = Math.max(0, activeResult - 1)" @keydown.enter.prevent="chooseActive" @keydown.esc="showResults = false" /> <LoaderCircle v-if="searching" :size="18" class="animate-spin" /></div>
                    <div v-if="showResults" class="search-dropdown">
                        <p v-if="searching" class="p-4 muted" role="status">Buscando personas…</p>
                        <p v-else-if="searchError" class="p-4" role="alert">{{ searchError }}</p>
                        <p v-else-if="!results.length" class="p-4 muted">No encontramos personas. Puedes crear una con el botón “Nueva persona”.</p>
                        <ul id="attendance-person-results" role="listbox" aria-label="Personas encontradas">
                            <li v-for="(person, index) in results" :id="`person-result-${index}`" :key="person.id" role="option" :aria-selected="index === activeResult" :aria-disabled="presentIds.has(person.id)">
                                <button type="button" class="person-result" :class="{ active: index === activeResult }" :disabled="working || presentIds.has(person.id)" @click="addPerson(person.id, person.nombreCompleto)">
                                    <span><strong>{{ person.nombreCompleto }}</strong><small>{{ person.rut || person.identificador }}</small></span><span class="result-action">{{ presentIds.has(person.id) ? 'Ya presente' : 'Agregar' }} <Check v-if="presentIds.has(person.id)" :size="16" /><Plus v-else :size="16" /></span>
                                </button>
                            </li>
                        </ul>
                        <p v-if="results.length === 20" class="p-3 text-xs muted">Mostrando 20 resultados. Escribe más para precisar la búsqueda.</p>
                    </div>
                </div>
                <button class="btn-secondary" :disabled="working" @click="showResults = false; newPersonOpen = true"><Plus :size="17" /> Nueva persona</button>
            </section>

            <section class="attendance-sheet" aria-labelledby="sheet-title">
                <div class="sheet-toolbar">
                    <div><h2 id="sheet-title">Lista de asistencia</h2><p class="muted text-sm">{{ tableFilter ? `${asistentes.length} de ${detalle.asistentes.length} asistentes` : 'Los cambios se guardan automáticamente.' }}</p></div>
                    <div class="flex gap-3 flex-wrap items-center"><label class="search-field"><Search :size="16" /><input v-model="tableFilter" aria-label="Filtrar asistentes" placeholder="Buscar en esta lista…" /></label><button class="btn-secondary" :disabled="working" @click="openColumn"><Columns3 :size="17" /> Agregar columna</button></div>
                </div>
                <div v-if="detalle.columnas.length" class="column-totals" aria-label="Totales del evento"><div v-for="column in detalle.columnas" :key="column.id"><span>{{ column.nombre }}</span><strong>{{ summary(column) }}</strong></div></div>
                <div class="table-scroll">
                    <table>
                        <thead><tr><th class="person-column">Persona</th><th>RUT</th><th>Llegada</th><th v-for="column in detalle.columnas" :key="column.id"><div class="column-heading"><span>{{ column.nombre }}<small>{{ column.tipo === 'boolean' ? 'Sí / No' : column.tipo === 'number' ? 'Número' : 'Texto' }}</small></span><button class="btn-ghost !p-2" :aria-label="`Eliminar columna ${column.nombre}`" :disabled="working" @click="confirmDelete('column', column.id, column.nombre)"><Trash2 :size="14" /></button></div></th><th><span class="sr-only">Acciones</span></th></tr></thead>
                        <tbody>
                            <tr v-for="person in asistentes" :key="person.id"><td class="person-column"><span class="person-name">{{ person.nombreCompleto }}</span></td><td class="rut-cell">{{ person.rut || 'Sin RUT' }}</td><td class="muted tabular-nums">{{ hora(person.llegada) }}</td><td v-for="column in detalle.columnas" :key="column.id"><AsistenciaCelda :persona-nombre="person.nombreCompleto" :columna="column" :dato="person.valores[String(column.id)]" :save-value="dato => saveCell(person.id, column.id, dato)" /></td><td><button class="btn-ghost !p-2" :aria-label="`Quitar asistencia de ${person.nombreCompleto}`" :disabled="working" @click="confirmDelete('person', person.id, person.nombreCompleto)"><Trash2 :size="16" /></button></td></tr>
                        </tbody>
                    </table>
                </div>
                <div v-if="!detalle.asistentes.length" class="empty-state sheet-empty"><ClipboardList :size="34" class="accent" /><h3>Esperando a la primera persona</h3><p>Busca su nombre o RUT arriba para registrar su llegada.</p><p class="text-sm">Puedes agregar columnas ahora o durante el evento.</p></div>
                <p v-else-if="!asistentes.length" class="empty-state muted">No hay asistentes que coincidan con la búsqueda.</p>
                <footer class="sheet-footer">{{ detalle.asistentes.length }} asistentes en total <span>Compartida entre todos los equipos · Se actualiza cada 3 segundos</span></footer>
            </section>
        </template>

        <AsistenciaDialog :open="modal !== null" :title="modalTitle" :busy="busy" @close="modal = null">
            <p v-if="modalError" role="alert" class="message error-message mb-4">{{ modalError }}</p>
            <form v-if="modal === 'event'" class="dialog-form" @submit.prevent="createEvent">
                <label>Nombre del evento<input v-model="eventForm.nombre" required maxlength="120" placeholder="Ej. 18 de septiembre" autofocus :disabled="busy" /></label>
                <label>Fecha<input v-model="eventForm.fecha" type="date" required :disabled="busy" /></label>
                <label>Descripción <span class="font-normal">(opcional)</span><textarea v-model="eventForm.descripcion" maxlength="2000" rows="3" placeholder="Lugar, motivo u otros detalles del encuentro" :disabled="busy" /></label>
                <p class="muted text-sm">La lista comienza vacía. Agrega personas y columnas cuando lo necesites.</p>
                <div class="dialog-actions"><button type="button" class="btn-secondary" :disabled="busy" @click="modal = null">Cancelar</button><button class="btn-primary" :disabled="busy || !eventForm.nombre.trim()">{{ busy ? 'Creando…' : 'Crear evento' }}</button></div>
            </form>
            <form v-else-if="modal === 'column'" class="dialog-form" @submit.prevent="createColumn">
                <label>Nombre de la columna<input v-model="columnForm.nombre" required maxlength="120" placeholder="Ej. Traje típico o Recibió choripán" autofocus :disabled="busy" /></label>
                <label>Tipo de respuesta<select v-model="columnForm.tipo" :disabled="busy"><option value="boolean">Sí / No — marcar con un clic</option><option value="text">Texto — notas o respuestas libres</option><option value="number">Número — cantidades</option></select></label>
                <p class="muted text-sm">La columna aparecerá para todas las personas de este evento. {{ columnForm.tipo === 'boolean' ? 'Verás el total de respuestas sí y no.' : columnForm.tipo === 'number' ? 'Verás la suma de las cantidades.' : 'Verás cuántas personas tienen una respuesta.' }}</p>
                <div class="dialog-actions"><button type="button" class="btn-secondary" :disabled="busy" @click="modal = null">Cancelar</button><button class="btn-primary" :disabled="busy || !columnForm.nombre.trim()">{{ busy ? 'Agregando…' : 'Agregar columna' }}</button></div>
            </form>
            <div v-else-if="modal === 'delete' && deletion" class="dialog-form">
                <p><strong>{{ deletion.name }}</strong></p>
                <p class="muted">{{ deletion.kind === 'event' ? 'Se eliminarán el evento, su lista de asistencia y todas sus columnas. Las personas seguirán en el sistema. Esta acción no se puede deshacer.' : deletion.kind === 'column' ? 'Se eliminará esta columna y todas sus respuestas en el evento. Esta acción no se puede deshacer.' : 'Se quitará a esta persona de la lista y se borrarán sus respuestas en este evento. Su ficha seguirá en el sistema.' }}</p>
                <div class="dialog-actions"><button class="btn-secondary" :disabled="busy" autofocus @click="modal = null">Cancelar</button><button class="btn-primary" :disabled="busy" @click="performDelete">{{ busy ? 'Eliminando…' : deletion.kind === 'person' ? 'Quitar asistencia' : 'Sí, eliminar' }}</button></div>
            </div>
        </AsistenciaDialog>
        <ModalCrearPersona :is-open="newPersonOpen" @close="newPersonOpen = false" @created="personCreated" />
    </main>
</template>

<style scoped>
.attendance-page { max-width: 1600px; margin: 0 auto; padding: 1.5rem; color: var(--text-primary); }
.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; margin-bottom: 1.75rem; }
.eyebrow { color: var(--accent-color); text-transform: uppercase; letter-spacing: .18em; font-size: .7rem; font-weight: 700; margin-bottom: .5rem; }
h1 { font-size: clamp(1.8rem, 3vw, 2.5rem); line-height: 1.2; font-weight: 750; letter-spacing: -.035em; overflow-wrap: anywhere; }
h2, h3 { font-weight: 700; }
.muted { color: var(--text-muted); }
.accent { color: var(--accent-color); }
.back-link { display: inline-flex; align-items: center; gap: .5rem; font-size: .85rem; margin-bottom: .8rem; }
.section-bar, .sheet-toolbar { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1.25rem; }
.search-field { display: flex; align-items: center; gap: .5rem; background: var(--input-bg); border: 1px solid var(--input-border); padding: 0 .8rem; border-radius: .75rem; color: var(--text-muted); }
.search-field input { border: 0; box-shadow: none; background: transparent; padding-left: .1rem; min-width: 0; }
.search-field:focus-within { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.search-field input:focus { box-shadow: none; }
.events-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 1.25rem; }
.event-card { position: relative; background: var(--bg-card); border: 1px solid var(--card-border); border-radius: 1.25rem; transition: border-color .18s, box-shadow .18s; overflow: hidden; }
.event-card:hover { border-color: var(--accent-color); box-shadow: var(--shadow-soft); }
.event-link { display: block; padding: 1.5rem; color: var(--text-primary); height: 100%; }
.event-date { display: flex; gap: .5rem; align-items: center; color: var(--text-muted); font-size: .8rem; padding-right: 1.4rem; }
.event-card h2 { font-size: 1.45rem; letter-spacing: -.03em; margin-top: 1.25rem; overflow-wrap: anywhere; }
.event-description { font-size: .9rem; margin: .5rem 0 1.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6rem; }
.event-bottom { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--card-border); padding-top: 1rem; color: var(--accent-color); font-size: .85rem; }
.event-delete { position: absolute; right: .6rem; top: .85rem; }
.empty-state { padding: 3.5rem 1rem; display: flex; flex-direction: column; align-items: center; text-align: center; gap: .75rem; }
.empty-state h2 { font-size: 1.4rem; }
.empty-state p { color: var(--text-muted); max-width: 30rem; }
.message { display: flex; gap: .65rem; align-items: center; padding: .9rem 1rem; border: 1px solid var(--card-border); border-radius: .75rem; margin-bottom: 1rem; font-size: .9rem; }
.error-message { background: var(--surface-strong); border-left: 3px solid #d58925; }
.success-message { background: var(--accent-color-muted); color: var(--text-primary); }
.event-overview { display: flex; gap: 2rem; align-items: center; padding: 1.25rem 1.5rem; background: var(--bg-card); border: 1px solid var(--card-border); border-radius: 1rem; margin-bottom: 1.25rem; }
.attendance-count { display: flex; align-items: center; gap: .85rem; flex-shrink: 0; }
.attendance-count strong { font-size: 3rem; font-weight: 750; letter-spacing: -.06em; line-height: 1; color: var(--accent-color); }
.attendance-count span { font-size: .85rem; max-width: 5rem; color: var(--text-muted); }
.event-context { flex: 1; font-size: .85rem; padding-left: 1.5rem; border-left: 1px solid var(--card-border); overflow-wrap: anywhere; }
.sync-status { display: flex; align-items: center; gap: .6rem; font-size: .7rem; color: var(--text-muted); }
.sync-status strong { color: var(--text-primary); font-weight: 600; }
.sync-status p { margin-top: .2rem; }
.sync-dot { width: 8px; height: 8px; border-radius: 100%; background: #24a176; flex-shrink: 0; }
.offline .sync-dot { background: #d58925; }
.arrival-panel { display: flex; align-items: center; gap: 1.5rem; padding: 1.5rem; border-radius: 1rem; background: var(--accent-color-muted); margin-bottom: 1.5rem; }
.arrival-label { display: flex; gap: .75rem; align-items: center; }
.arrival-label > svg { color: var(--accent-color); flex-shrink: 0; }
.arrival-label p { font-size: .75rem; margin-top: .2rem; }
.person-search { flex: 1; position: relative; min-width: 200px; }
.large { background: var(--bg-card); min-height: 50px; }
.search-dropdown { position: absolute; top: calc(100% + .5rem); left: 0; right: 0; z-index: 20; border: 1px solid var(--card-border); background: var(--bg-card); box-shadow: var(--shadow-soft); border-radius: .75rem; overflow: auto; max-height: 360px; }
.person-result { display: flex; align-items: center; justify-content: space-between; gap: 1rem; text-align: left; width: 100%; padding: .8rem 1rem; border-bottom: 1px solid var(--card-border); }
.person-result.active, .person-result:hover { background: var(--surface-muted); }
.person-result strong, .person-result small { display: block; }
.person-result strong { font-size: .9rem; }
.person-result small { color: var(--text-muted); font-size: .75rem; margin-top: .2rem; }
.result-action { display: flex; gap: .35rem; align-items: center; font-size: .75rem; color: var(--accent-color); white-space: nowrap; }
.attendance-sheet { background: var(--bg-card); border: 1px solid var(--card-border); border-radius: 1rem; overflow: hidden; }
.sheet-toolbar { padding: 1.25rem 1.5rem; margin: 0; }
.sheet-toolbar h2 { font-size: 1.1rem; }
.column-totals { display: flex; flex-wrap: wrap; gap: .5rem; padding: 0 1.5rem 1.2rem; }
.column-totals > div { display: flex; gap: .65rem; font-size: .75rem; align-items: center; padding: .5rem .75rem; background: var(--surface-muted); border-radius: .5rem; overflow-wrap: anywhere; }
.column-totals span { color: var(--text-muted); }
.table-scroll { position: relative; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: .85rem; }
th { background: var(--surface-muted); color: var(--text-muted); font-size: .75rem; font-weight: 600; }
th, td { padding: .85rem 1rem; border-bottom: 1px solid var(--card-border); vertical-align: middle; }
td { background: var(--bg-card); }
tr:hover td { background: var(--input-bg); }
.person-column { min-width: 220px; position: sticky; left: 0; z-index: 1; }
.person-name { font-weight: 650; }
.rut-cell { white-space: nowrap; font-variant-numeric: tabular-nums; }
.column-heading { display: flex; align-items: center; justify-content: space-between; gap: .7rem; min-width: 155px; max-width: 290px; overflow-wrap: anywhere; }
.column-heading small { display: block; opacity: .75; font-size: .65rem; margin-top: .2rem; }
.sheet-footer { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.5rem; color: var(--text-muted); font-size: .7rem; }
.dialog-form { display: flex; flex-direction: column; gap: 1rem; }
.dialog-form label input, .dialog-form label select, .dialog-form label textarea { display: block; margin-top: .5rem; }
.dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .75rem; margin-top: .5rem; }
button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 1000px) { .arrival-panel { flex-wrap: wrap; } .arrival-label { width: 100%; } .event-overview { flex-wrap: wrap; gap: 1rem; } .sync-status { margin-left: auto; } }
@media (max-width: 640px) { .attendance-page { padding: .75rem; } .page-heading, .section-bar, .sheet-toolbar { flex-direction: column; align-items: stretch; } .page-heading { gap: 1rem; } .arrival-panel { padding: 1rem; gap: .8rem; } .person-search { flex-basis: 100%; min-width: 0; } .event-overview { padding: 1rem; } .event-context { padding-left: 1rem; } .sync-status { margin-left: 0; } .sheet-toolbar { padding: 1rem; } .sheet-toolbar .search-field { flex-basis: 100%; } .sheet-footer { flex-direction: column; padding: 1rem; gap: .35rem; } .column-totals { padding-left: 1rem; padding-right: 1rem; } .person-column { position: static; min-width: 180px; } }
</style>
