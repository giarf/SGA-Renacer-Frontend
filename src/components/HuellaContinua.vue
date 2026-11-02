<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FingerprintPattern, Users } from 'lucide-vue-next';
import { ApiError, apiService } from '../api/apiService';
import type { AsistenciaPorHuella, PersonaIdentificada } from '../types';

const props = defineProps<{ eventoId: number; pausado: boolean }>();
const emit = defineEmits<{
    grupo: [persona: PersonaIdentificada];
    registrada: [resultado: Pick<AsistenciaPorHuella, 'persona' | 'asistenciaId' | 'creada'>];
}>();

// Cada vuelta deja el lector ocupado como máximo estos segundos, para liberarlo pronto al pausar.
const ESPERA_POR_VUELTA = 10;
const SESION = 'asistencia-huella-continua';

const activo = ref(false);
const estado = ref<'esperando' | 'pausado' | 'reintentando'>('esperando');
const aviso = ref<{ tipo: 'ok' | 'info' | 'error'; texto: string } | null>(null);
const recientes = ref<{ clave: number; persona: PersonaIdentificada; hora: string; creada: boolean }[]>([]);
let controller: AbortController | null = null;
let audio: AudioContext | null = null;
let contador = 0;

const titulo = computed(() => !activo.value ? 'Lectura con huella'
    : props.pausado || estado.value === 'pausado' ? 'Lectura en pausa'
    : estado.value === 'reintentando' ? 'Reconectando con el huellero…'
    : 'Esperando huella…');
const subtitulo = computed(() => !activo.value ? 'Actívala para registrar llegadas con solo poner el dedo.'
    : props.pausado ? 'Se reanuda sola al cerrar la ventana abierta.'
    : 'Cada huella reconocida queda en la lista. Puedes seguir buscando por nombre.');

const hora = () => new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const mensaje = (e: unknown) => e instanceof Error && e.name !== 'TimeoutError' && e.name !== 'AbortError' ? e.message : 'El huellero no respondió a tiempo.';

function esperar(ms: number, signal: AbortSignal) {
    return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
}

function tono(ok: boolean) {
    if (!audio) return;
    try {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = ok ? 880 : 240;
        gain.gain.value = 0.06;
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + (ok ? 0.12 : 0.3));
    } catch { /* El sonido es opcional. */ }
}

async function ciclo(signal: AbortSignal) {
    let fallos = 0;
    while (!signal.aborted) {
        if (props.pausado) { estado.value = 'pausado'; await esperar(400, signal); continue; }
        estado.value = 'esperando';
        let resultado: AsistenciaPorHuella;
        try {
            resultado = await apiService.registrarAsistenciaPorHuella(props.eventoId, { timeout: ESPERA_POR_VUELTA, signal });
        } catch (e) {
            if (signal.aborted) return;
            const codigo = e instanceof ApiError ? e.codigo : undefined;
            if (codigo === 'sin_dedo') {
                fallos = 0;
                if (aviso.value?.tipo === 'error') aviso.value = null;
                continue;
            }
            if (codigo === 'no_coincide') {
                fallos = 0;
                aviso.value = { tipo: 'info', texto: `${hora()} · Huella no reconocida. Busca a la persona por nombre o registra su huella en su ficha.` };
                tono(false);
                await esperar(1200, signal);
                continue;
            }
            if (codigo === 'sin_huellas') {
                aviso.value = { tipo: 'error', texto: 'Aún no hay huellas registradas. Regístralas desde la ficha de cada persona.' };
                detener();
                return;
            }
            if (codigo === 'calidad_baja') {
                fallos = 0;
                aviso.value = { tipo: 'info', texto: `${hora()} · Huella poco clara, vuelve a poner el dedo.` };
                continue;
            }
            if (e instanceof ApiError && e.status === 422) {
                aviso.value = { tipo: 'info', texto: `${hora()} · ${e.message} Vuelve a poner el dedo.` };
                await esperar(800, signal);
                continue;
            }
            fallos++;
            estado.value = 'reintentando';
            aviso.value = { tipo: 'error', texto: codigo === 'ocupado' ? 'El lector está ocupado (quizá registrando una huella). Reintentando…' : `${mensaje(e)} Reintentando…` };
            await esperar(Math.min(3000 * fallos, 15000), signal);
            continue;
        }
        if (signal.aborted) return;
        fallos = 0;
        const { persona, asistenciaId, creada } = resultado;
        recientes.value = [{ clave: ++contador, persona, hora: hora(), creada }, ...recientes.value].slice(0, 4);
        aviso.value = { tipo: 'ok', texto: creada ? `${persona.nombreCompleto}: llegada registrada.` : `${persona.nombreCompleto} ya estaba en la lista.` };
        tono(true);
        emit('registrada', { persona, asistenciaId, creada });
    }
}

function activar() {
    if (activo.value) return;
    try { audio ??= new AudioContext(); } catch { audio = null; }
    activo.value = true;
    aviso.value = null;
    sessionStorage.setItem(SESION, String(props.eventoId));
    controller = new AbortController();
    void ciclo(controller.signal);
}

function detener() {
    controller?.abort();
    controller = null;
    activo.value = false;
    sessionStorage.removeItem(SESION);
}

onMounted(() => { if (sessionStorage.getItem(SESION) === String(props.eventoId)) activar(); });
onBeforeUnmount(() => { controller?.abort(); void audio?.close(); });
</script>

<template>
    <section class="fp-bar" :class="{ active: activo }" aria-label="Lectura con huella">
        <div class="fp-main">
            <span class="fp-icon" :class="{ pulse: activo && !pausado && estado === 'esperando' }"><FingerprintPattern :size="24" aria-hidden="true" /></span>
            <div class="fp-text">
                <strong>{{ titulo }}</strong>
                <p>{{ subtitulo }}</p>
            </div>
            <button type="button" :class="activo ? 'btn-secondary' : 'btn-primary'" @click="activo ? detener() : activar()">
                <FingerprintPattern v-if="!activo" :size="18" aria-hidden="true" />{{ activo ? 'Detener lectura' : 'Activar lectura con huella' }}
            </button>
        </div>
        <p v-if="aviso" role="status" class="fp-notice" :class="aviso.tipo">{{ aviso.texto }}</p>
        <ul v-if="recientes.length" class="fp-recent" aria-label="Últimas huellas reconocidas">
            <li v-for="r in recientes" :key="r.clave">
                <span><strong>{{ r.persona.nombreCompleto }}</strong><small>{{ r.hora }} · {{ r.creada ? 'Llegada registrada' : 'Ya estaba presente' }}</small></span>
                <button type="button" class="btn-ghost !px-3 !py-1.5 text-sm" @click="emit('grupo', r.persona)"><Users :size="15" aria-hidden="true" /> Acompañantes</button>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.fp-bar { display: grid; gap: .6rem; padding: .6rem 1rem; margin-bottom: .75rem; border: 1px solid var(--card-border); border-radius: 1rem; background: var(--bg-card); }
.fp-bar.active { border-color: var(--accent-color); }
.fp-main { display: flex; align-items: center; gap: .9rem; flex-wrap: wrap; }
.fp-icon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: .9rem; flex-shrink: 0; color: var(--accent-color); background: var(--accent-color-muted); }
.fp-icon.pulse { animation: fp-pulse 1.6s ease-in-out infinite; }
.fp-text { flex: 1; min-width: 12rem; }
.fp-text strong { font-size: .95rem; }
.fp-text p { font-size: .78rem; color: var(--text-muted); margin-top: .15rem; }
.fp-notice { font-size: .85rem; padding: .6rem .8rem; border-radius: .6rem; background: var(--surface-muted); }
.fp-notice.ok { background: var(--accent-color-muted); }
.fp-notice.error { background: var(--surface-strong); border-left: 3px solid #d58925; }
.fp-recent { display: grid; gap: .35rem; }
.fp-recent li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .45rem .75rem; border-radius: .6rem; background: var(--surface-muted); }
.fp-recent strong, .fp-recent small { display: block; }
.fp-recent strong { font-size: .85rem; }
.fp-recent small { font-size: .72rem; color: var(--text-muted); }
@keyframes fp-pulse { 50% { box-shadow: 0 0 0 6px var(--accent-color-muted); } }
@media (prefers-reduced-motion: reduce) { .fp-icon.pulse { animation: none; } }
@media (max-width: 640px) { .fp-bar { padding: .75rem; } .fp-main > button { width: 100%; } }
</style>
