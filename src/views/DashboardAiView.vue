<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowUp, KeyRound, Loader2, MessageSquare, PanelLeft, RefreshCw, ShieldCheck, Sparkles, SquarePen, Square, Trash2, X } from 'lucide-vue-next';
import AiChart from '../components/AiChart.vue';
import AiConfirmacion from '../components/AiConfirmacion.vue';
import AiMarkdown from '../components/AiMarkdown.vue';
import { nuevoHistorial, preguntar, type Visualizacion } from '../ai/aiAgent';
import type { Confirmacion } from '../ai/aiActions';
import { AI_PRESETS, borrarAiSettings, cargarAiSettings, guardarAiSettings, type AiSettings } from '../ai/aiSettings';
import { cargarChats, guardarChats, nuevoChat, type Chat, type Turno } from '../ai/chatStore';
import { limpiarCacheDatasets } from '../ai/datasets';

const SUGERENCIAS = [
    '¿Cuántos niños atendimos en Fiestas Patrias?',
    'Gráfico de asistentes por evento este año',
    'Ayuda social entregada por mes',
    'Distribución de beneficiarios por grupo etario',
    'Crea el evento "Once Navideña" para el 20 de diciembre',
    'Campañas: beneficiarios con y sin padrino'
];

const settings = ref<AiSettings>(cargarAiSettings());
const borrador = ref<AiSettings>({ ...settings.value });
const mostrarConfig = ref(false);
const configurado = computed(() => Boolean(settings.value.apiKey && settings.value.baseUrl && settings.value.model));

const chats = ref<Chat[]>(cargarChats());
const chatActivoId = ref<string | null>(null);
const chatActivo = computed(() => chats.value.find(c => c.id === chatActivoId.value) ?? null);
const turnos = computed<Turno[]>(() => chatActivo.value?.turnos ?? []);
const chatsOrdenados = computed(() => [...chats.value].sort((a, b) => b.actualizado.localeCompare(a.actualizado)));
const sidebarAbierta = ref(false);
const borrandoId = ref<string | null>(null);

const pregunta = ref('');
const trabajandoEn = ref<string | null>(null);
const trabajando = computed(() => trabajandoEn.value !== null);
const hilo = ref<HTMLElement | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);
const pendientes = new Map<string, (aprobado: boolean) => void>();
let controlador: AbortController | null = null;

let guardado: ReturnType<typeof setTimeout> | undefined;
watch(chats, valor => {
    clearTimeout(guardado);
    guardado = setTimeout(() => guardarChats(valor), 400);
}, { deep: true });

const abrirConfig = () => {
    borrador.value = { ...settings.value };
    mostrarConfig.value = true;
};

const aplicarPreset = (preset: (typeof AI_PRESETS)[number]) => {
    borrador.value = { ...borrador.value, baseUrl: preset.baseUrl, model: preset.model };
};

const guardarConfig = () => {
    settings.value = { ...borrador.value, baseUrl: borrador.value.baseUrl.trim(), model: borrador.value.model.trim(), apiKey: borrador.value.apiKey.trim() };
    guardarAiSettings(settings.value);
    mostrarConfig.value = false;
};

const olvidarKey = () => {
    borrarAiSettings();
    settings.value = cargarAiSettings();
    borrador.value = { ...settings.value };
};

const desplazar = async () => {
    await nextTick();
    hilo.value?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
};

const ajustarAltura = () => {
    const el = textarea.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
};

const fechaCorta = (iso: string) => {
    const fecha = new Date(iso);
    const hoy = new Date();
    if (fecha.toDateString() === hoy.toDateString()) return fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
};

const seleccionarChat = (id: string | null) => {
    chatActivoId.value = id;
    sidebarAbierta.value = false;
    borrandoId.value = null;
    desplazar();
};

const eliminarChat = (id: string) => {
    if (trabajandoEn.value === id) return;
    chats.value = chats.value.filter(c => c.id !== id);
    if (chatActivoId.value === id) chatActivoId.value = null;
    borrandoId.value = null;
};

const resolverPendientes = (aprobado: boolean) => {
    pendientes.forEach(resolver => resolver(aprobado));
    pendientes.clear();
};

const decidir = (confirmacion: Confirmacion, aprobado: boolean) => {
    pendientes.get(confirmacion.id)?.(aprobado);
    pendientes.delete(confirmacion.id);
};

const enviar = async (texto = pregunta.value) => {
    const consulta = texto.trim();
    if (!consulta || trabajando.value) return;
    if (!configurado.value) {
        abrirConfig();
        return;
    }

    let chat = chatActivo.value;
    if (!chat) {
        chats.value.push(nuevoChat(nuevoHistorial()));
        chat = chats.value[chats.value.length - 1]!;
        chatActivoId.value = chat.id;
    }
    if (!chat.turnos.length) chat.titulo = consulta.length > 48 ? `${consulta.slice(0, 47)}…` : consulta;
    chat.actualizado = new Date().toISOString();

    pregunta.value = '';
    await nextTick();
    ajustarAltura();

    chat.turnos.push({ id: crypto.randomUUID(), pregunta: consulta, pasos: [], bloques: [], estado: 'trabajando' });
    // Se toma desde el arreglo reactivo para que los cambios se reflejen en pantalla.
    const actual = chat.turnos[chat.turnos.length - 1]!;
    trabajandoEn.value = chat.id;
    controlador = new AbortController();
    desplazar();

    try {
        const respuesta = await preguntar(settings.value, chat.historial, consulta, {
            onPaso: paso => { if (actual.pasos[actual.pasos.length - 1] !== paso) actual.pasos.push(paso); },
            onTexto: md => { actual.bloques.push({ tipo: 'texto', md }); desplazar(); },
            onVisualizacion: (v: Visualizacion) => { actual.bloques.push({ tipo: 'viz', v }); desplazar(); },
            onConfirmacion: confirmacion => {
                actual.bloques.push({ tipo: 'confirmacion', c: confirmacion });
                const bloque = actual.bloques[actual.bloques.length - 1]!;
                const observada = bloque.tipo === 'confirmacion' ? bloque.c : confirmacion;
                desplazar();
                return new Promise(resolve => {
                    pendientes.set(confirmacion.id, aprobado => {
                        observada.estado = aprobado ? 'ejecutando' : 'rechazada';
                        resolve(aprobado ? observada : null);
                    });
                });
            }
        }, controlador.signal);
        actual.bloques.push({ tipo: 'texto', md: respuesta });
        actual.estado = 'listo';
    } catch (error) {
        actual.estado = 'error';
        const mensaje = error instanceof DOMException && error.name === 'AbortError'
            ? 'Detuviste la consulta.'
            : error instanceof TypeError
                ? 'No se pudo conectar con el proveedor de IA. Revisa la URL base y que el proveedor permita llamadas desde el navegador (CORS).'
                : error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
        actual.bloques.push({ tipo: 'texto', md: mensaje, error: true });
    } finally {
        resolverPendientes(false);
        chat.actualizado = new Date().toISOString();
        trabajandoEn.value = null;
        controlador = null;
        desplazar();
    }
};

const detener = () => {
    resolverPendientes(false);
    controlador?.abort();
};

const nuevaConversacion = () => {
    seleccionarChat(null);
    textarea.value?.focus();
};

const refrescarDatos = () => {
    limpiarCacheDatasets();
    chatActivo.value?.historial.push({ role: 'user', content: 'Nota: los datos se acaban de recargar desde el sistema; vuelve a consultarlos en vez de usar cifras anteriores.' }, { role: 'assistant', content: 'Entendido.' });
};

const alTeclear = (evento: KeyboardEvent) => {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
        evento.preventDefault();
        enviar();
    }
};

const anchoVisual = (v: Visualizacion) => (v.tipo === 'kpi' ? 'span-kpi' : v.tipo === 'tabla' || v.tipo === 'lineas' || v.resultado.filas.length > 10 ? 'span-full' : '');

// Agrupa visualizaciones consecutivas en una misma grilla para armar mini tableros.
const segmentos = (turno: Turno) => {
    const resultado: ({ tipo: 'vizs'; items: Visualizacion[]; key: string } | (Turno['bloques'][number] & { key: string }))[] = [];
    turno.bloques.forEach((bloque, i) => {
        const ultimo = resultado[resultado.length - 1];
        if (bloque.tipo === 'viz') {
            if (ultimo?.tipo === 'vizs') ultimo.items.push(bloque.v);
            else resultado.push({ tipo: 'vizs', items: [bloque.v], key: `v${i}` });
        } else {
            resultado.push({ ...bloque, key: `b${i}` });
        }
    });
    return resultado;
};

onBeforeUnmount(() => {
    detener();
    clearTimeout(guardado);
    guardarChats(chats.value);
});
</script>

<template>
    <div class="ai-shell">
        <aside class="sidebar" :class="{ open: sidebarAbierta }">
            <div class="sidebar-head">
                <button type="button" class="new-chat" @click="nuevaConversacion"><SquarePen :size="16" /> Nuevo chat</button>
                <button type="button" class="icon-close only-mobile" aria-label="Cerrar lista de chats" @click="sidebarAbierta = false"><X :size="18" /></button>
            </div>
            <p v-if="!chatsOrdenados.length" class="sidebar-empty">Tus conversaciones aparecerán aquí.</p>
            <nav class="chat-list" aria-label="Chats">
                <div v-for="c in chatsOrdenados" :key="c.id" class="chat-item" :class="{ active: c.id === chatActivoId }">
                    <template v-if="borrandoId === c.id">
                        <span class="confirm-delete">¿Eliminar este chat?</span>
                        <button type="button" class="mini danger" @click="eliminarChat(c.id)">Eliminar</button>
                        <button type="button" class="mini" @click="borrandoId = null">No</button>
                    </template>
                    <template v-else>
                        <button type="button" class="chat-link" @click="seleccionarChat(c.id)">
                            <Loader2 v-if="trabajandoEn === c.id" :size="14" class="animate-spin chat-icon" />
                            <MessageSquare v-else :size="14" class="chat-icon" />
                            <span class="chat-title">{{ c.titulo }}</span>
                            <span class="chat-date">{{ fechaCorta(c.actualizado) }}</span>
                        </button>
                        <button type="button" class="chat-delete" :disabled="trabajandoEn === c.id" :aria-label="`Eliminar chat ${c.titulo}`" @click="borrandoId = c.id"><Trash2 :size="14" /></button>
                    </template>
                </div>
            </nav>
            <p class="sidebar-note">Los chats se guardan sólo en este navegador.</p>
        </aside>
        <div v-if="sidebarAbierta" class="scrim only-mobile" @click="sidebarAbierta = false" />

        <div class="ai-page" :class="{ 'is-empty': !turnos.length }">
            <div class="ai-toolbar">
                <div class="toolbar-left">
                    <button type="button" class="btn-ghost small only-mobile" aria-label="Ver chats" @click="sidebarAbierta = true"><PanelLeft :size="16" /> Chats</button>
                    <span class="status" :class="{ ok: configurado }">
                        <ShieldCheck v-if="configurado" :size="14" /><KeyRound v-else :size="14" />
                        {{ configurado ? settings.model : 'Sin API key' }}
                    </span>
                </div>
                <div class="toolbar-actions">
                    <button type="button" class="btn-ghost small" title="Volver a cargar los datos del sistema" @click="refrescarDatos"><RefreshCw :size="15" /> Datos</button>
                    <button type="button" class="btn-secondary small" @click="abrirConfig"><KeyRound :size="15" /> Configurar IA</button>
                </div>
            </div>

            <section v-if="!turnos.length" class="hero">
                <div class="orb" aria-hidden="true"><Sparkles :size="26" /></div>
                <h2>Pregunta, analiza o pide cambios</h2>
                <p>Escribe en lenguaje normal. La IA consulta asistencia, campañas, ingresos, egresos, inventario y personas, responde con cifras, tablas y gráficos, y puede crear o modificar registros siempre que tú lo confirmes.</p>
            </section>

            <div v-else ref="hilo" class="thread">
                <section v-for="t in turnos" :key="t.id" class="turn">
                    <p class="question">{{ t.pregunta }}</p>

                    <template v-for="s in segmentos(t)" :key="s.key">
                        <div v-if="s.tipo === 'vizs'" class="viz-grid">
                            <AiChart v-for="v in s.items" :key="v.id" :v="v" :class="anchoVisual(v)" />
                        </div>
                        <AiConfirmacion v-else-if="s.tipo === 'confirmacion'" :c="s.c" @decidir="decidir(s.c, $event)" />
                        <div v-else-if="s.tipo === 'texto'" class="answer" :class="{ error: s.error }">
                            <Sparkles v-if="!s.error" :size="16" class="answer-icon" />
                            <AiMarkdown :source="s.md" />
                        </div>
                    </template>

                    <div v-if="t.estado === 'trabajando' && t.pasos.length" class="steps" role="status">
                        <span v-for="(p, i) in t.pasos" :key="i" class="step" :class="{ current: i === t.pasos.length - 1 }">
                            <Loader2 v-if="i === t.pasos.length - 1" :size="13" class="animate-spin" />{{ p }}
                        </span>
                    </div>
                </section>
            </div>

            <div class="composer-wrap">
                <form class="composer" @submit.prevent="enviar()">
                    <textarea
                        ref="textarea"
                        v-model="pregunta"
                        rows="1"
                        :placeholder="configurado ? 'Pregunta o pide un cambio: «agrega a Ana Pérez al evento Fiestas Patrias»' : 'Configura tu API key para comenzar'"
                        aria-label="Mensaje para el Dashboard AI"
                        @input="ajustarAltura"
                        @keydown="alTeclear"
                    />
                    <button v-if="trabajando" type="button" class="send stop" aria-label="Detener" @click="detener"><Square :size="14" /></button>
                    <button v-else type="submit" class="send" :disabled="!pregunta.trim()" aria-label="Enviar"><ArrowUp :size="18" /></button>
                </form>
                <div v-if="!turnos.length" class="chips">
                    <button v-for="s in SUGERENCIAS" :key="s" type="button" class="chip" @click="enviar(s)">{{ s }}</button>
                </div>
                <p class="privacy">Las consultas se calculan en tu navegador y todo cambio requiere tu confirmación. Al proveedor de IA nunca se envían RUT, teléfonos, correos ni direcciones de las consultas.</p>
            </div>
        </div>

        <div v-if="mostrarConfig" class="overlay" @click.self="mostrarConfig = false">
            <form class="dialog surface-card" @submit.prevent="guardarConfig">
                <header>
                    <div><p class="eyebrow">Dashboard AI</p><h2>Conectar proveedor de IA</h2></div>
                    <button type="button" class="icon-close" aria-label="Cerrar" @click="mostrarConfig = false"><X :size="18" /></button>
                </header>
                <p class="muted">Funciona con cualquier API compatible con OpenAI. La key se guarda sólo en este navegador y se envía directamente al proveedor, nunca al servidor de Renacer.</p>
                <div class="presets">
                    <button v-for="p in AI_PRESETS" :key="p.nombre" type="button" class="chip" :class="{ active: borrador.baseUrl === p.baseUrl }" @click="aplicarPreset(p)">{{ p.nombre }}</button>
                </div>
                <label>URL base<input v-model="borrador.baseUrl" required placeholder="https://api.openai.com/v1" /></label>
                <label>Modelo<input v-model="borrador.model" required placeholder="gpt-4.1-mini" /></label>
                <label>API key<input v-model="borrador.apiKey" type="password" autocomplete="off" placeholder="sk-…" /></label>
                <label class="check"><input v-model="borrador.recordar" type="checkbox" /> Recordar en este navegador (si no, se borra al cerrar la pestaña)</label>
                <footer>
                    <button v-if="settings.apiKey" type="button" class="btn-ghost" @click="olvidarKey">Olvidar key</button>
                    <button type="submit" class="btn-primary" :disabled="!borrador.baseUrl.trim() || !borrador.model.trim()">Guardar</button>
                </footer>
            </form>
        </div>
    </div>
</template>

<style scoped>
.ai-shell {
    --glow-a: color-mix(in srgb, var(--accent-color) 55%, transparent);
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 1.5rem;
    max-width: 1380px;
    margin: 0 auto;
    padding: 0 1rem;
}

.sidebar { position: sticky; top: 0; align-self: start; max-height: calc(100vh - 11rem); display: flex; flex-direction: column; gap: 0.6rem; }
.sidebar-head { display: flex; gap: 0.5rem; align-items: center; }
.new-chat {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.6rem 1rem; border-radius: 999px; font-weight: 600; font-size: 0.9rem;
    color: var(--accent-color); background: var(--accent-color-muted); border: 1px solid color-mix(in srgb, var(--accent-color) 30%, transparent); transition: background 0.15s ease;
}
.new-chat:hover { background: color-mix(in srgb, var(--accent-color) 20%, transparent); }
.sidebar-empty, .sidebar-note { font-size: 0.78rem; color: var(--text-muted); padding: 0 0.4rem; }
.chat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.15rem; }
.chat-item { display: flex; align-items: center; gap: 0.25rem; border-radius: 0.75rem; padding-right: 0.25rem; transition: background 0.15s ease; }
.chat-item:hover { background: var(--surface-muted); }
.chat-item.active { background: var(--bg-card); box-shadow: 0 0 0 1px var(--card-border), var(--input-shadow); }
.chat-link { flex: 1; min-width: 0; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 0.5rem; text-align: left; padding: 0.5rem 0.6rem; }
.chat-icon { grid-row: span 2; margin-top: 0.2rem; color: var(--text-muted); }
.chat-item.active .chat-icon { color: var(--accent-color); }
.chat-title { font-size: 0.86rem; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-date { font-size: 0.72rem; color: var(--text-muted); }
.chat-delete { opacity: 0; padding: 0.35rem; border-radius: 0.5rem; color: var(--text-muted); transition: opacity 0.15s ease, color 0.15s ease; }
.chat-item:hover .chat-delete, .chat-delete:focus-visible { opacity: 1; }
.chat-delete:hover { color: #d03b3b; }
.chat-delete:disabled { display: none; }
.confirm-delete { flex: 1; font-size: 0.8rem; font-weight: 600; padding: 0.55rem 0.6rem; }
.mini { font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.55rem; border-radius: 999px; border: 1px solid var(--card-border); background: var(--bg-card); }
.mini.danger { color: #fff; background: #d03b3b; border-color: #d03b3b; }

.only-mobile { display: none; }
.scrim { position: fixed; inset: 0; background: rgba(10, 12, 16, 0.4); z-index: 49; }

@media (max-width: 900px) {
    .ai-shell { grid-template-columns: minmax(0, 1fr); }
    .only-mobile { display: inline-flex; }
    .scrim.only-mobile { display: block; }
    .sidebar {
        position: fixed; top: 0; left: 0; bottom: 0; z-index: 50; width: min(300px, 86vw); max-height: none; padding: 1rem;
        background: var(--bg-base); box-shadow: var(--shadow-soft); transform: translateX(-105%); transition: transform 0.25s ease;
    }
    .sidebar.open { transform: none; }
    .chat-delete { opacity: 1; }
}

.ai-page { position: relative; min-width: 0; min-height: calc(100vh - 12rem); display: flex; flex-direction: column; }
.ai-page.is-empty { justify-content: center; }
.ai-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.ai-page.is-empty .ai-toolbar { position: absolute; top: 0; left: 0; right: 0; }
.toolbar-left, .toolbar-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.small { padding: 0.4rem 0.9rem; font-size: 0.85rem; }
.status { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--text-muted); padding: 0.3rem 0.7rem; border-radius: 999px; background: var(--surface-muted); }
.status.ok { color: var(--accent-color); background: var(--accent-color-muted); }

.hero { text-align: center; max-width: 660px; margin: 3.5rem auto 1.75rem; animation: fade 0.6s ease both; }
.hero h2 { font-size: clamp(1.6rem, 3.6vw, 2.35rem); font-weight: 750; letter-spacing: -0.025em; line-height: 1.15; margin-top: 1.1rem; }
.hero p { color: var(--text-muted); margin-top: 0.75rem; line-height: 1.55; }
.orb {
    width: 4rem; height: 4rem; margin: 0 auto; border-radius: 1.4rem; display: grid; place-items: center; color: #fff;
    background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--accent-color) 60%, white), var(--accent-color) 55%, color-mix(in srgb, var(--accent-color) 60%, #eb6834));
    box-shadow: 0 14px 40px -10px var(--glow-a), 0 0 0 8px var(--accent-color-muted);
    animation: breathe 4s ease-in-out infinite;
}
@keyframes breathe { 50% { box-shadow: 0 18px 50px -8px var(--glow-a), 0 0 0 14px color-mix(in srgb, var(--accent-color) 6%, transparent); } }
@keyframes fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

.thread { display: flex; flex-direction: column; gap: 2.25rem; padding-bottom: 1.5rem; flex: 1; }
.turn { display: flex; flex-direction: column; gap: 0.9rem; }
.question {
    align-self: flex-end; max-width: min(80%, 620px); padding: 0.7rem 1.05rem; border-radius: 1.2rem 1.2rem 0.35rem 1.2rem;
    background: var(--accent-color); color: #fff; font-weight: 500; line-height: 1.45; white-space: pre-line; animation: fade 0.3s ease both;
}
.steps { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.step { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--text-muted); padding: 0.25rem 0.65rem; border-radius: 999px; border: 1px solid var(--card-border); animation: fade 0.25s ease both; }
.step.current { color: var(--accent-color); border-color: color-mix(in srgb, var(--accent-color) 40%, transparent); background: var(--accent-color-muted); }

.viz-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.9rem; }
.viz-grid > * { grid-column: span 3; }
.viz-grid > .span-kpi { grid-column: span 2; }
.viz-grid > .span-full, .viz-grid > :only-child { grid-column: 1 / -1; }
@media (max-width: 760px) { .viz-grid > *, .viz-grid > .span-kpi { grid-column: 1 / -1; } }

.answer { display: flex; gap: 0.6rem; align-items: flex-start; max-width: 820px; animation: fade 0.35s ease both; }
.answer > :last-child { flex: 1; min-width: 0; }
.answer-icon { color: var(--accent-color); margin-top: 0.3rem; flex-shrink: 0; }
.answer.error { color: #b42318; background: color-mix(in srgb, #e34948 10%, transparent); padding: 0.75rem 1rem; border-radius: 0.9rem; }

.composer-wrap { position: sticky; bottom: 0; padding: 0.75rem 0 1rem; background: linear-gradient(to top, var(--bg-base) 70%, transparent); z-index: 10; }
.ai-page.is-empty .composer-wrap { position: static; background: none; max-width: 760px; width: 100%; margin: 0 auto; }
.composer {
    position: relative; display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.55rem 0.55rem 0.55rem 1.1rem;
    border-radius: 1.6rem; background: var(--bg-card); border: 1px solid var(--card-border); box-shadow: var(--shadow-soft);
    transition: box-shadow 0.25s ease, border-color 0.25s ease;
}
.composer::before {
    content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0; transition: opacity 0.3s ease;
    background: linear-gradient(120deg, var(--accent-color), #eb6834, var(--accent-color));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
}
.composer:focus-within::before { opacity: 1; }
.composer:focus-within { box-shadow: 0 16px 40px -14px var(--glow-a); }
.composer textarea { flex: 1; resize: none; border: 0; background: transparent; box-shadow: none; padding: 0.55rem 0; font-size: 1rem; line-height: 1.5; max-height: 180px; }
.composer textarea:focus { box-shadow: none; }
.send { width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: 999px; display: grid; place-items: center; background: var(--accent-color); color: #fff; transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease; }
.send:hover:not(:disabled) { background: var(--accent-color-hover); transform: translateY(-1px); }
.send:disabled { opacity: 0.35; cursor: not-allowed; }
.send.stop { background: var(--text-primary); color: var(--bg-card); }

.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 1rem; }
.chip { font-size: 0.83rem; padding: 0.45rem 0.9rem; border-radius: 999px; border: 1px solid var(--card-border); background: var(--bg-card); color: var(--text-primary); transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease; }
.chip:hover { border-color: var(--accent-color); transform: translateY(-1px); }
.chip.active { border-color: var(--accent-color); background: var(--accent-color-muted); color: var(--accent-color); font-weight: 600; }
.chips .chip { animation: fade 0.5s ease both; }
.chips .chip:nth-child(2) { animation-delay: 0.05s; } .chips .chip:nth-child(3) { animation-delay: 0.1s; }
.chips .chip:nth-child(4) { animation-delay: 0.15s; } .chips .chip:nth-child(5) { animation-delay: 0.2s; } .chips .chip:nth-child(6) { animation-delay: 0.25s; }
.privacy { text-align: center; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.6rem; }

.overlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem; background: rgba(10, 12, 16, 0.45); backdrop-filter: blur(4px); }
.dialog { width: min(520px, 100%); padding: 1.4rem; display: flex; flex-direction: column; gap: 0.9rem; animation: fade 0.25s ease both; }
.dialog header { display: flex; justify-content: space-between; align-items: flex-start; }
.dialog h2 { font-size: 1.25rem; font-weight: 700; margin-top: 0.25rem; }
.dialog label { display: flex; flex-direction: column; gap: 0.35rem; }
.dialog label.check { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 500; }
.dialog footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
.presets { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.muted { color: var(--text-muted); font-size: 0.88rem; line-height: 1.5; }
.icon-close { color: var(--text-muted); padding: 0.3rem; border-radius: 999px; }
.icon-close:hover { background: var(--surface-muted); color: var(--text-primary); }
</style>
