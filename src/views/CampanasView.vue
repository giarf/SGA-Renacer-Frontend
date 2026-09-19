<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowUpRight, Columns3, HandHeart, MessageCircle, Plus, RefreshCw, Search, Trash2, UserPlus } from 'lucide-vue-next';
import { ApiError, apiService } from '../api/apiService';
import AsistenciaDialog from '../components/AsistenciaDialog.vue';
import AsistenciaCelda from '../components/AsistenciaCelda.vue';
import { matchesSearch } from '../utils/search';
import { whatsappUrl } from '../utils/whatsapp';
import type { Campana, CrearCampana, DetalleCampana, EntidadResumen, EstadoCampana, ParticipanteCampana, TipoColumnaAsistencia, ValorAsistencia, ValorCampana } from '../types';

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
const pendiente = ref('todos');
const modal = ref<'campana' | 'persona' | 'padrino' | 'columna' | 'whatsapp' | 'quitar' | null>(null);
const modalError = ref('');
const selected = ref<ParticipanteCampana | null>(null);
const form = ref<CrearCampana>({ nombre: '', fecha: '', descripcion: '', plantilla: 'apadrinamiento' });
const columna = ref<{ nombre: string; tipo: TipoColumnaAsistencia }>({ nombre: '', tipo: 'boolean' });
const search = ref('');
const results = ref<EntidadResumen[]>([]);
const searching = ref(false);
const message = ref('');
const cerrada = computed(() => detalle.value?.campana.estado === 'cerrada');
const title = computed(() => ({ campana: 'Crear campaña', persona: 'Agregar beneficiario', padrino: 'Asignar padrino o madrina', columna: 'Agregar columna', whatsapp: 'Compartir por WhatsApp', quitar: 'Retirar participante' }[modal.value ?? 'campana']));
const list = computed(() => campanas.value.filter(c => matchesSearch(filtro.value, c.nombre, c.descripcion)));
const rows = computed(() => (detalle.value?.participantes ?? []).filter(p =>
    matchesSearch(filtro.value, p.beneficiario.nombreCompleto, p.padrino?.nombreCompleto) &&
    (pendiente.value === 'todos' || (pendiente.value === 'sin_padrino' ? !p.padrino : valor(p, pendiente.value) !== true))));
const checkpoints = computed(() => detalle.value?.columnas.filter(c => c.tipo === 'boolean') ?? []);
const delivered = computed(() => detalle.value?.participantes.filter(p => valor(p, 'entregado') === true).length ?? 0);
const thanks = computed(() => detalle.value?.participantes.filter(p => valor(p, 'agradecimiento') === true).length ?? 0);
const hasDelivery = computed(() => detalle.value?.columnas.some(c => c.clave === 'entregado'));
const messageUrl = computed(() => whatsappUrl(selected.value?.padrino?.telefono, message.value));
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
    detalle.value = null; modal.value = null; filtro.value = ''; pendiente.value = 'todos'; error.value = ''; notice.value = '';
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
            const data = await apiService.buscarEntidades(query.trim(), 'PersonaNatural');
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
    if (kind === 'columna') columna.value = { nombre: '', tipo: 'boolean' };
    if (kind === 'whatsapp' && row) {
        const gustos = valor(row, 'gustos');
        message.value = `Hola ${row.padrino?.nombreCompleto ?? ''}, te escribimos desde Fundación Familia Renacer por la campaña ${detalle.value?.campana.nombre}.\nEstás apoyando a ${row.beneficiario.nombreCompleto}.${gustos ? `\nSus gustos y preferencias son: ${gustos}` : ''}\n¡Muchas gracias por tu apoyo!`;
    }
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
    await mutate(async () => { await apiService.crearColumnaCampana(campaignId, columna.value); modal.value = null; });
}
async function setEstado(estado: EstadoCampana) {
    const c = detalle.value?.campana; if (!c) return;
    await mutate(async () => { await apiService.cambiarEstadoCampana(c.id, estado, c.version); notice.value = 'Estado actualizado.'; });
}
async function remove() {
    const campaignId = id.value; const row = selected.value; if (!campaignId || !row) return;
    await mutate(async () => { await apiService.quitarParticipanteCampana(campaignId, row.id); modal.value = null; notice.value = 'Participante retirado de la campaña.'; });
}
async function saveCell(rowId: number, columnId: number, value: ValorAsistencia): Promise<ValorCampana> {
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
        <RouterLink v-if="id" to="/campanas" class="back-link"><ArrowLeft :size="16" /> Todas las campañas</RouterLink>
        <header class="campaign-header">
            <div><p class="eyebrow">COMUNIDAD · VÍNCULOS Y SEGUIMIENTO</p><h1>{{ id ? (detalle?.campana.nombre ?? 'Campaña') : 'Campañas' }}</h1>
                <p class="intro">{{ id ? detalle?.campana.descripcion : 'Cada vínculo, cada entrega, cada agradecimiento. Todo en un mismo lugar.' }}</p>
                <p v-if="detalle" class="muted">Fecha de referencia: {{ fecha(detalle.campana.fecha) }} <span class="state">{{ detalle.campana.estado }}</span></p>
            </div>
            <div class="actions">
                <button class="btn btn-outline" :disabled="working || loading" aria-label="Actualizar campañas" @click="error = ''; load()"><RefreshCw :size="16" :class="{ 'animate-spin': loading }" /> Actualizar</button>
                <button v-if="!id" class="btn btn-primary" :disabled="working || loading" @click="open('campana')"><Plus :size="17" /> Nueva campaña</button>
                <template v-else-if="detalle">
                    <label class="state-control">Estado<select :value="detalle.campana.estado" :disabled="working || loading" @change="setEstado(($event.target as HTMLSelectElement).value as EstadoCampana)"><option value="borrador">Borrador</option><option value="activa">Activa</option><option value="cerrada">Cerrada</option></select></label>
                    <button class="btn btn-primary" :disabled="cerrada || working || loading" @click="open('persona')"><UserPlus :size="17" /> Agregar beneficiario</button>
                </template>
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
                    <p class="muted">{{ fecha(c.fecha) }}</p><h2>{{ c.nombre }}</h2><p class="card-description">{{ c.descripcion || 'Una campaña para conectar personas y acompañar cada entrega.' }}</p>
                    <footer><span><strong>{{ c.totalParticipantes }}</strong> beneficiarios</span><span><strong>{{ c.sinPadrino }}</strong> sin padrino</span></footer>
                </RouterLink>
            </div>
            <section v-else-if="!loading && !error" class="surface-card empty"><HandHeart :size="36" /><h2>{{ filtro ? 'No hay coincidencias' : 'El próximo vínculo empieza aquí' }}</h2><p>{{ filtro ? 'Prueba con otro nombre.' : 'Crea una campaña de apadrinamiento o una campaña personalizada.' }}</p><button v-if="!filtro" class="btn btn-primary" @click="open('campana')">Crear primera campaña</button></section>
        </template>

        <template v-else-if="detalle">
            <section class="summary" aria-label="Resumen de campaña">
                <div><strong>{{ detalle.campana.totalParticipantes }}</strong><span>Beneficiarios</span></div>
                <div><strong>{{ detalle.campana.sinPadrino }}</strong><span>Sin padrino asignado</span></div>
                <div v-if="hasDelivery"><strong>{{ delivered }}</strong><span>Regalos entregados</span></div>
                <div v-if="hasDelivery"><strong>{{ thanks }}</strong><span>Agradecimientos enviados</span></div>
            </section>
            <section class="surface-card tracking">
                <div class="table-toolbar"><div><h2>Seguimiento de participantes</h2><p class="muted">Una fila por beneficiario. Un mismo padrino puede aparecer en varias filas.</p></div><button class="btn btn-outline" :disabled="cerrada || working || loading" @click="open('columna')"><Columns3 :size="16" /> Agregar columna</button></div>
                <div class="filters"><label class="search-box"><Search :size="17" /><input v-model="filtro" placeholder="Buscar beneficiario o padrino…" aria-label="Buscar participante" /></label><select v-model="pendiente" aria-label="Filtrar pendientes"><option value="todos">Todos los registros</option><option value="sin_padrino">Sin padrino asignado</option><option v-for="c in checkpoints" :key="c.id" :value="String(c.id)">Pendiente: {{ c.nombre }}</option></select><span class="muted">{{ rows.length }} registros</span></div>
                <p v-if="cerrada" class="closed-note">Campaña cerrada. Cambia su estado a activa para continuar el seguimiento.</p>
                <div v-if="rows.length" class="table-scroll">
                    <table><thead><tr><th class="beneficiary">Beneficiario</th><th>Padrino / madrina</th><th v-for="c in detalle.columnas" :key="c.id">{{ c.nombre }}</th><th>Acciones</th></tr></thead>
                        <tbody><tr v-for="p in rows" :key="p.id">
                            <td class="beneficiary"><strong>{{ p.beneficiario.nombreCompleto }}</strong><a v-if="whatsappUrl(p.beneficiario.telefono)" :href="whatsappUrl(p.beneficiario.telefono)" target="_blank" rel="noopener noreferrer" class="phone" :aria-label="`WhatsApp de ${p.beneficiario.nombreCompleto}`"><MessageCircle :size="13" /> {{ p.beneficiario.telefono }}</a></td>
                            <td class="sponsor"><template v-if="p.padrino"><strong>{{ p.padrino.nombreCompleto }}</strong><a v-if="whatsappUrl(p.padrino.telefono)" :href="whatsappUrl(p.padrino.telefono)" target="_blank" rel="noopener noreferrer" class="phone"><MessageCircle :size="13" /> {{ p.padrino.telefono }}</a><span v-else class="muted">Sin teléfono válido para WhatsApp</span><small class="muted">{{ padrinoCount(p.padrino.id) }} beneficiario(s) en esta campaña</small></template><span v-else class="unassigned">Sin asignar</span><button class="text-action" :disabled="cerrada || working || loading" @click="open('padrino', p)">{{ p.padrino ? 'Cambiar asignación' : 'Asignar padrino / madrina' }}</button></td>
                            <td v-for="c in detalle.columnas" :key="c.id"><template v-if="cerrada"><span>{{ p.valores[String(c.id)]?.valor === true ? 'Sí' : p.valores[String(c.id)]?.valor === false ? 'No' : p.valores[String(c.id)]?.valor ?? '—' }}</span></template><AsistenciaCelda v-else :persona-nombre="p.beneficiario.nombreCompleto" :columna="c" :dato="p.valores[String(c.id)]" :save-value="v => saveCell(p.id, c.id, v)" /><small v-if="p.valores[String(c.id)]" class="timestamp" :title="`Última actualización: ${actualizado(p.valores[String(c.id)])}`">{{ actualizado(p.valores[String(c.id)]) }}</small></td>
                            <td><div class="row-actions"><button class="btn btn-outline" :disabled="!whatsappUrl(p.padrino?.telefono)" @click="open('whatsapp', p)"><MessageCircle :size="16" /> Compartir gustos</button><button class="btn-ghost" :disabled="cerrada || working || loading" :aria-label="`Retirar a ${p.beneficiario.nombreCompleto}`" @click="open('quitar', p)"><Trash2 :size="16" /></button></div></td>
                        </tr></tbody>
                    </table>
                </div>
                <div v-else class="empty"><h3>{{ detalle.participantes.length ? 'No hay registros para este filtro' : 'Agrega a los primeros beneficiarios' }}</h3><p>Los padrinos se pueden asignar después.</p></div>
                <footer class="tracking-footer">Los cambios se guardan por casilla. Usa Actualizar para consultar los últimos cambios del equipo.</footer>
            </section>
        </template>

        <AsistenciaDialog :open="modal !== null" :title="title" :busy="working || loading" @close="modal = null">
            <p v-if="modalError" role="alert" class="feedback error">{{ modalError }}</p>
            <form v-if="modal === 'campana'" class="dialog-form" @submit.prevent="create"><label>Nombre<input v-model="form.nombre" required maxlength="120" placeholder="Apadrinamiento Navidad 2026" /></label><label>Fecha de referencia<input v-model="form.fecha" type="date" required /></label><label>Descripción<textarea v-model="form.descripcion" maxlength="2000" rows="3" /></label><label>Plantilla<select v-model="form.plantilla"><option value="apadrinamiento">Apadrinamiento · regalos y agradecimientos</option><option value="personalizada">Personalizada · agregar mis columnas</option></select></label><p class="muted">Ambas permiten relacionar beneficiarios con padrinos y agregar columnas de seguimiento.</p><button class="btn btn-primary" :disabled="working || loading || !form.nombre.trim()">Crear campaña</button></form>
            <div v-else-if="modal === 'persona' || modal === 'padrino'" class="dialog-form"><p v-if="selected">Beneficiario: <strong>{{ selected.beneficiario.nombreCompleto }}</strong></p><p v-if="modal === 'padrino'" class="muted">Selecciona una persona existente. Puede apoyar a más de un beneficiario.</p><p v-if="modal === 'padrino' && selected?.padrino" class="muted">Al cambiar de padrino, la ficha y el agradecimiento quedan pendientes de enviar al nuevo contacto.</p><label>Buscar persona<input v-model="search" placeholder="Nombre o RUT (mínimo 2 caracteres)" :disabled="working" /></label><p v-if="searching" role="status">Buscando…</p><div v-else class="person-results"><button v-for="p in results" :key="p.id" :disabled="working || loading" @click="choose(p.id)"><strong>{{ p.nombreCompleto }}</strong><span>{{ p.identificador || 'Sin RUT' }}<template v-if="modal === 'padrino'"> · {{ padrinoCount(p.id) }} beneficiario(s)</template></span><Plus :size="16" /></button><p v-if="search.trim().length >= 2 && !results.length" class="muted">No hay coincidencias disponibles. Puedes registrar personas nuevas en Entidades.</p></div><button v-if="modal === 'padrino' && selected?.padrino" class="btn btn-outline" :disabled="working || loading" @click="choose(null)">Quitar padrino y dejar pendiente</button></div>
            <form v-else-if="modal === 'columna'" class="dialog-form" @submit.prevent="addColumn"><label>Nombre<input v-model="columna.nombre" required maxlength="120" /></label><label>Tipo<select v-model="columna.tipo"><option value="boolean">Casilla · Sí / No</option><option value="text">Texto</option><option value="number">Número</option></select></label><button class="btn btn-primary" :disabled="working || loading || !columna.nombre.trim()">Agregar columna</button></form>
            <div v-else-if="modal === 'whatsapp'" class="dialog-form"><p>Para <strong>{{ selected?.padrino?.nombreCompleto }}</strong> · {{ selected?.padrino?.telefono }}</p><label>Mensaje<textarea v-model="message" rows="8" /></label><p class="muted">Se abrirá WhatsApp con este texto. Después de enviarlo, marca «Ficha enviada» en la tabla. El dibujo se envía directamente por WhatsApp.</p><a v-if="messageUrl && message.trim()" class="btn btn-primary" :href="messageUrl" target="_blank" rel="noopener noreferrer"><MessageCircle :size="17" /> Abrir WhatsApp</a></div>
            <div v-else-if="modal === 'quitar'" class="dialog-form"><p>¿Retirar a <strong>{{ selected?.beneficiario.nombreCompleto }}</strong> de esta campaña? Se eliminará su seguimiento en esta campaña. La persona seguirá registrada en el sistema.</p><button class="btn btn-primary" :disabled="working || loading" @click="remove">Retirar participante</button></div>
        </AsistenciaDialog>
    </main>
</template>

<style scoped>
.campaign-page { max-width: 1600px; margin: 0 auto; padding: 1.5rem; color: var(--text-primary); }
.campaign-header { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; margin-bottom: 2rem; }
.eyebrow { font-size: .65rem; letter-spacing: .16em; font-weight: 800; color: var(--accent-color); margin-bottom: .65rem; }
h1 { font-size: clamp(1.8rem, 3vw, 2.6rem); font-weight: 800; letter-spacing: -.04em; line-height: 1.15; overflow-wrap: anywhere; }
h2 { font-size: 1.15rem; font-weight: 750; } h3 { font-weight: 700; }
.intro { margin: .75rem 0; max-width: 52rem; color: var(--text-muted); white-space: pre-line; }
.muted, .timestamp { color: var(--text-muted); font-size: .8rem; }
.actions, .filters, .table-toolbar, .row-actions { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
.actions { justify-content: flex-end; } .btn { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; }
.back-link { display: inline-flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--text-muted); margin-bottom: 1.25rem; }
.state { display: inline-block; padding: .25rem .65rem; border: 1px solid var(--card-border); border-radius: 999px; font-size: .7rem; text-transform: capitalize; margin-left: .5rem; }
.state-control { display: flex; gap: .5rem; align-items: center; font-size: .8rem; }
.state-control select { width: auto; } .search-box { display: flex; align-items: center; gap: .6rem; border: 1px solid var(--input-border); border-radius: .75rem; padding: .2rem .75rem; background: var(--input-bg); color: var(--text-muted); max-width: 34rem; }
.search-box input { border: 0; background: transparent; box-shadow: none; min-width: 0; }
.campaign-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 1.25rem; margin-top: 1.5rem; }
.campaign-card { display: flex; flex-direction: column; padding: 1.5rem; border-radius: 1rem; transition: border-color .15s, transform .15s; }
.campaign-card:hover { border-color: var(--accent-color); transform: translateY(-2px); }
.card-top { display: flex; align-items: center; gap: .5rem; color: var(--accent-color); margin-bottom: 1.75rem; } .card-top .state { margin-left: auto; color: var(--text-muted); }
.campaign-card h2 { margin: .4rem 0 .65rem; overflow-wrap: anywhere; } .card-description { color: var(--text-muted); font-size: .85rem; flex: 1; white-space: pre-line; overflow-wrap: anywhere; }
.campaign-card footer { display: flex; gap: 1.5rem; border-top: 1px solid var(--card-border); margin-top: 1.5rem; padding-top: 1rem; color: var(--text-muted); font-size: .8rem; } .campaign-card footer strong { color: var(--text-primary); }
.summary { display: flex; flex-wrap: wrap; border-top: 1px solid var(--card-border); border-bottom: 1px solid var(--card-border); margin-bottom: 2rem; }
.summary div { flex: 1; min-width: 150px; padding: 1.25rem 1rem; } .summary strong { display: block; font-size: 2rem; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -.05em; } .summary span { font-size: .75rem; color: var(--text-muted); }
.tracking { overflow: hidden; border-radius: 1rem; } .table-toolbar { padding: 1.25rem; justify-content: space-between; } .table-toolbar p { margin-top: .35rem; }
.filters { padding: 0 1.25rem 1.25rem; } .filters .search-box { flex: 1; min-width: 220px; } .filters select { width: auto; max-width: 100%; }
.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: separate; border-spacing: 0; text-align: left; font-size: .85rem; }
th { padding: .85rem 1rem; background: var(--bg-base); font-size: .7rem; font-weight: 700; white-space: nowrap; border-block: 1px solid var(--card-border); }
td { padding: .85rem 1rem; border-bottom: 1px solid var(--card-border); vertical-align: top; } td strong { display: block; }
.beneficiary { position: sticky; left: 0; z-index: 1; min-width: 210px; max-width: 260px; background: var(--bg-card); border-right: 1px solid var(--card-border); }
th.beneficiary { background: var(--bg-base); } .sponsor { min-width: 230px; } .sponsor small { display: block; margin-top: .4rem; }
.phone { display: flex; gap: .35rem; align-items: center; color: var(--accent-color); margin-top: .45rem; font-size: .8rem; text-decoration: underline; text-underline-offset: 3px; }
.text-action { display: block; font-size: .75rem; margin-top: .5rem; color: var(--accent-color); text-decoration: underline; } .unassigned { color: var(--text-muted); font-style: italic; }
.timestamp { display: block; font-size: .65rem; margin-top: .4rem; white-space: nowrap; } .row-actions { min-width: 185px; } .row-actions .btn { font-size: .75rem; }
.tracking-footer, .closed-note { padding: 1rem 1.25rem; font-size: .75rem; color: var(--text-muted); background: var(--bg-base); }
.feedback { padding: .8rem 1rem; margin-bottom: 1rem; border: 1px solid var(--accent-color); border-radius: .75rem; background: var(--accent-color-muted); } .feedback.error { border-color: var(--text-muted); background: var(--bg-card); }
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: .8rem; padding: 3rem 1rem; margin-top: 1rem; color: var(--text-muted); } .empty h2 { color: var(--text-primary); }
.dialog-form { display: grid; gap: 1rem; } .dialog-form label { display: grid; gap: .4rem; font-size: .85rem; font-weight: 650; } .dialog-form textarea { resize: vertical; }
.person-results { display: grid; gap: .5rem; max-height: 320px; overflow-y: auto; } .person-results button { position: relative; padding: .85rem 2rem .85rem .85rem; border: 1px solid var(--card-border); border-radius: .65rem; text-align: left; } .person-results button:hover { border-color: var(--accent-color); } .person-results strong, .person-results span { display: block; } .person-results span { color: var(--text-muted); font-size: .75rem; margin-top: .25rem; } .person-results svg { position: absolute; right: .75rem; top: 1rem; }
button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 760px) { .campaign-page { padding: 1rem; } .campaign-header { flex-direction: column; } .actions { justify-content: flex-start; } .summary div { min-width: 45%; } .beneficiary { position: static; } .filters { align-items: stretch; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .campaign-card { transition: none; } .campaign-card:hover { transform: none; } }
</style>
