<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Flashlight, FlashlightOff, Keyboard, Loader2, Minus, Plus, ScanBarcode, X } from 'lucide-vue-next';
import { apiService, ApiError } from '../api/apiService';
import type { BusquedaCodigoBarras, LineaEscaneada } from '../types';
import { crearFiltroRepetidos, esCodigoValido, normalizarCodigo, parseCantidad } from '../utils/barcode';
import { integerFromInput } from '../utils/integerInput';

const props = withDefaults(defineProps<{
    /** "multiple": flujo ágil con hoja de cantidad/precio. "unico": devuelve el primer código válido y cierra. */
    modo?: 'multiple' | 'unico';
    titulo?: string;
    /** Solo acepta productos que ya están en el catálogo (egresos, ajustes, edición de registros). */
    soloCatalogo?: boolean;
    /** Pide precio unitario. En egresos el valor sale del PPP y no se pregunta. */
    conPrecio?: boolean;
    /** Validación extra de la vista (p. ej. stock); devuelve el mensaje de error o null. */
    validar?: (linea: LineaEscaneada) => string | null;
}>(), { modo: 'multiple', titulo: '', soloCatalogo: false, conPrecio: true, validar: undefined });

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'agregar', linea: LineaEscaneada): void;
    (e: 'codigo', codigo: string): void;
}>();

// Tipos mínimos de la Barcode Detection API (no está en lib.dom de TS).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
    new (options?: { formats: string[] }): BarcodeDetectorLike;
    getSupportedFormats?: () => Promise<string[]>;
};
type ScannerControls = { stop(): void };

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a'];

const videoRef = ref<HTMLVideoElement | null>(null);
const cantidadRef = ref<HTMLInputElement | null>(null);
const nombreRef = ref<HTMLInputElement | null>(null);
const manualRef = ref<HTMLInputElement | null>(null);

const iniciando = ref(true);
const camaraError = ref<string | null>(null);
const torchDisponible = ref(false);
const torchActiva = ref(false);
const aviso = ref<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
const escaneados = ref(0);
const mostrarManual = ref(false);
const codigoManual = ref('');

// Hoja inferior (modo multiple)
type Hoja = {
    estado: 'buscando' | 'listo';
    codigo: string;
    resultado: BusquedaCodigoBarras | null;
    nombre: string;
    categoria: string;
    unidad: string;
    imagenUrl: string | null;
    detalle: string;
};
const hoja = ref<Hoja | null>(null);
const cantidadTexto = ref('1');
const precio = ref(0);
const hojaError = ref<string | null>(null);
const categorias = ref<string[]>([]);
const unidades = ref<string[]>([]);

const pausado = computed(() => hoja.value !== null || mostrarManual.value);
const esNuevo = computed(() => !!hoja.value?.resultado && hoja.value.resultado.fuente !== 'catalogo');
const tituloVisible = computed(() => props.titulo || (props.modo === 'unico' ? 'Escanear código' : 'Escanear productos'));

let stream: MediaStream | null = null;
let controls: ScannerControls | null = null;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let avisoTimer: ReturnType<typeof setTimeout> | null = null;
let detenido = false;
let audioCtx: AudioContext | null = null;
let consultaActual = 0;
const procesarLectura = crearFiltroRepetidos(2000);

const mostrarAviso = (tipo: 'ok' | 'error', texto: string) => {
    aviso.value = { tipo, texto };
    if (avisoTimer) clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => (aviso.value = null), 2200);
};

const feedback = (exito = true) => {
    try { navigator.vibrate?.(exito ? 60 : [40, 60, 40]); } catch { /* sin vibración */ }
    try {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioCtx ??= new Ctx() as AudioContext;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = exito ? 1150 : 320;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.09);
    } catch { /* sin audio */ }
};

const mensajeCamara = (e: any): string => {
    if (!window.isSecureContext) return 'La cámara solo funciona con HTTPS o en localhost. Puedes escribir el código a mano.';
    switch (e?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Permiso de cámara denegado. Actívalo en los ajustes del navegador (ícono del candado junto a la dirección) y toca “Reintentar”.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No se encontró una cámara en este dispositivo.';
        case 'NotReadableError':
            return 'La cámara está siendo usada por otra aplicación. Ciérrala y toca “Reintentar”.';
        default:
            return e?.message || 'No se pudo abrir la cámara.';
    }
};

const detener = () => {
    detenido = true;
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
    try { controls?.stop(); } catch { /* ya detenido */ }
    controls = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    if (videoRef.value) videoRef.value.srcObject = null;
    torchActiva.value = false;
};

const alDetectar = (raw: string) => {
    const codigo = normalizarCodigo(raw);
    if (!codigo || detenido) return;
    // Se alimenta el filtro aunque esté pausado: así el mismo producto frente a la cámara no reaparece al reanudar.
    if (!procesarLectura(codigo, Date.now()) || pausado.value) return;
    void manejarCodigo(codigo);
};

const iniciarNativo = async (Ctor: BarcodeDetectorCtor) => {
    const detector = new Ctor({ formats: FORMATOS_NATIVOS });
    const tick = async () => {
        if (detenido) return;
        const video = videoRef.value;
        if (video && video.readyState >= 2) {
            try {
                const codigos = await detector.detect(video);
                const primero = codigos[0];
                if (primero) alDetectar(primero.rawValue);
            } catch { /* frame no disponible */ }
        }
        if (!detenido) loopTimer = setTimeout(tick, 120);
    };
    void tick();
};

const iniciarZxing = async () => {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library')
    ]);
    if (detenido || !videoRef.value) return;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 300 });
    controls = await reader.decodeFromVideoElement(videoRef.value, result => {
        if (result) alDetectar(result.getText());
    });
    if (detenido) { controls.stop(); controls = null; }
};

const obtenerDetectorNativo = async (): Promise<BarcodeDetectorCtor | null> => {
    const Ctor = (window as any).BarcodeDetector as BarcodeDetectorCtor | undefined;
    if (!Ctor) return null;
    try {
        const soportados = (await Ctor.getSupportedFormats?.()) ?? [];
        return FORMATOS_NATIVOS.every(f => soportados.includes(f)) ? Ctor : null;
    } catch {
        return null;
    }
};

const iniciar = async () => {
    detener();
    detenido = false;
    iniciando.value = true;
    camaraError.value = null;
    try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(''), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' });
        const nuevoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (detenido) { nuevoStream.getTracks().forEach(t => t.stop()); return; }
        stream = nuevoStream;
        const video = videoRef.value!;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const track = stream.getVideoTracks()[0];
        const capacidades = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
        torchDisponible.value = !!capacidades.torch;

        const nativo = await obtenerDetectorNativo();
        if (nativo) await iniciarNativo(nativo);
        else await iniciarZxing();
    } catch (e: any) {
        if (!detenido) {
            camaraError.value = mensajeCamara(e);
            detener();
        }
    } finally {
        iniciando.value = false;
    }
};

const alternarLinterna = async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
        await track.applyConstraints({ advanced: [{ torch: !torchActiva.value } as MediaTrackConstraintSet] });
        torchActiva.value = !torchActiva.value;
    } catch {
        torchDisponible.value = false;
    }
};

const enfocarHoja = async () => {
    await nextTick();
    const destino = hoja.value?.resultado?.fuente === 'no-encontrado' ? nombreRef.value : cantidadRef.value;
    destino?.focus();
    destino?.select();
};

const manejarCodigo = async (codigo: string) => {
    if (!esCodigoValido(codigo)) {
        feedback(false);
        mostrarAviso('error', 'Código inválido');
        return;
    }
    feedback(true);

    if (props.modo === 'unico') {
        emit('codigo', codigo);
        cerrar();
        return;
    }

    const consulta = ++consultaActual;
    hojaError.value = null;
    cantidadTexto.value = '1';
    precio.value = 0;
    hoja.value = { estado: 'buscando', codigo, resultado: null, nombre: '', categoria: '', unidad: '', imagenUrl: null, detalle: '' };
    try {
        const resultado = await apiService.buscarPorCodigoBarras(codigo);
        if (consulta !== consultaActual || !hoja.value) return;
        const base: Hoja = { ...hoja.value, estado: 'listo', resultado };
        if (props.soloCatalogo && resultado.fuente !== 'catalogo') {
            hoja.value = null;
            feedback(false);
            mostrarAviso('error', 'No está en el catálogo');
            return;
        }
        if (resultado.fuente === 'catalogo') {
            const item = resultado.item;
            Object.assign(base, {
                nombre: item.nombre,
                categoria: item.categoria || '',
                unidad: item.unidadMedidaEstandar || 'unidad',
                detalle: [item.categoria, `Stock ${item.stockActual ?? 0} ${item.unidadMedidaEstandar || ''}`.trim()].filter(Boolean).join(' · ')
            });
            precio.value = Math.round(item.precioReferencia || 0);
        } else if (resultado.fuente === 'openfoodfacts') {
            const s = resultado.sugerencia;
            Object.assign(base, {
                nombre: s.nombre || '',
                categoria: s.categoria || '',
                unidad: 'unidad',
                imagenUrl: s.imagenUrl,
                detalle: [s.marca, s.cantidad].filter(Boolean).join(' · ')
            });
        } else {
            base.unidad = 'unidad';
        }
        hoja.value = base;
        void enfocarHoja();
    } catch (e: any) {
        if (consulta !== consultaActual) return;
        hoja.value = null;
        if (props.soloCatalogo && e instanceof ApiError && e.status === 404) {
            feedback(false);
            mostrarAviso('error', 'No está en el catálogo');
        } else if (e instanceof ApiError && e.status === 400) {
            feedback(false);
            mostrarAviso('error', 'Código inválido');
        } else {
            mostrarAviso('error', e?.message || 'No se pudo consultar el código');
        }
    }
};

const cantidadValor = computed(() => parseCantidad(cantidadTexto.value));

const cambiarCantidad = (delta: number) => {
    const actual = Number.isFinite(cantidadValor.value) ? cantidadValor.value : 0;
    cantidadTexto.value = String(Math.max(1, Math.round((actual + delta) * 1000) / 1000));
};

const descartar = () => {
    consultaActual++;
    hoja.value = null;
    hojaError.value = null;
};

const agregar = () => {
    const h = hoja.value;
    if (!h || h.estado !== 'listo' || !h.resultado) return;
    const nombre = h.nombre.trim();
    if (!nombre) { hojaError.value = 'Escribe el nombre del producto.'; nombreRef.value?.focus(); return; }
    const cantidad = cantidadValor.value;
    if (!Number.isFinite(cantidad) || cantidad <= 0) { hojaError.value = 'La cantidad debe ser mayor a cero.'; cantidadRef.value?.focus(); return; }
    if (props.conPrecio && precio.value <= 0) { hojaError.value = 'Indica el precio unitario.'; return; }

    const linea: LineaEscaneada = {
        itemCatalogoId: h.resultado.fuente === 'catalogo' ? h.resultado.item.id : undefined,
        codigoBarras: h.codigo,
        nombre,
        categoria: h.categoria.trim() || 'Sin categoría',
        unidad: h.unidad.trim() || 'unidad',
        cantidad,
        precio: props.conPrecio ? precio.value : 0
    };
    const errorVista = props.validar?.(linea) ?? null;
    if (errorVista) { hojaError.value = errorVista; cantidadRef.value?.focus(); return; }

    emit('agregar', linea);
    escaneados.value++;
    mostrarAviso('ok', `${nombre} agregado`);
    hoja.value = null;
    hojaError.value = null;
};

const abrirManual = async () => {
    descartar();
    mostrarManual.value = true;
    codigoManual.value = '';
    await nextTick();
    manualRef.value?.focus();
};

const enviarManual = () => {
    const codigo = normalizarCodigo(codigoManual.value);
    if (!codigo) return;
    mostrarManual.value = false;
    procesarLectura(codigo, Date.now());
    void manejarCodigo(codigo);
};

const cerrar = () => {
    detener();
    emit('close');
};

const cargarUtilitarios = async () => {
    if (props.modo !== 'multiple') return;
    try {
        const data = await apiService.getCatalogoUtilitarios();
        categorias.value = data.categorias ?? [];
        unidades.value = data.unidades ?? [];
    } catch { /* las sugerencias son opcionales */ }
};

const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (hoja.value) descartar();
    else if (mostrarManual.value) mostrarManual.value = false;
    else cerrar();
};

const onVisibilidad = () => {
    if (document.visibilityState === 'hidden') detener();
    else if (!stream && !camaraError.value) void iniciar();
};

onMounted(() => {
    void iniciar();
    void cargarUtilitarios();
    window.addEventListener('keydown', onKeydown);
    document.addEventListener('visibilitychange', onVisibilidad);
    window.addEventListener('pagehide', detener);
});

onBeforeUnmount(() => {
    detener();
    if (avisoTimer) clearTimeout(avisoTimer);
    void audioCtx?.close().catch(() => undefined);
    window.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', onVisibilidad);
    window.removeEventListener('pagehide', detener);
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-[1300] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" :aria-label="tituloVisible">
            <div class="scanner-shell relative flex h-full w-full flex-col overflow-hidden bg-black sm:h-[min(44rem,92vh)] sm:max-w-lg sm:rounded-2xl sm:border sm:border-[var(--card-border)] sm:shadow-[var(--shadow-soft)]">
                <!-- Barra superior -->
                <div class="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
                    <div class="flex min-w-0 items-center gap-2">
                        <ScanBarcode class="h-5 w-5 shrink-0" />
                        <span class="truncate text-sm font-semibold">{{ tituloVisible }}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <button v-if="torchDisponible" type="button" class="scanner-icon-btn" :aria-pressed="torchActiva" :aria-label="torchActiva ? 'Apagar linterna' : 'Encender linterna'" @click="alternarLinterna">
                            <FlashlightOff v-if="torchActiva" class="h-5 w-5" />
                            <Flashlight v-else class="h-5 w-5" />
                        </button>
                        <button type="button" class="scanner-icon-btn" aria-label="Escribir código a mano" @click="abrirManual">
                            <Keyboard class="h-5 w-5" />
                        </button>
                        <button type="button" class="scanner-icon-btn" aria-label="Cerrar escáner" @click="cerrar">
                            <X class="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <!-- Cámara -->
                <div class="relative flex-1">
                    <video ref="videoRef" class="absolute inset-0 h-full w-full object-cover" muted playsinline autoplay></video>
                    <div v-if="!camaraError" class="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div class="scanner-frame" :class="{ 'opacity-40': pausado }"></div>
                    </div>
                    <div v-if="iniciando && !camaraError" class="absolute inset-0 flex items-center justify-center text-white">
                        <Loader2 class="h-8 w-8 animate-spin" />
                    </div>
                    <div v-if="camaraError" class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
                        <p class="max-w-xs text-sm">{{ camaraError }}</p>
                        <div class="flex gap-2">
                            <button type="button" class="btn-secondary h-10 px-4" @click="iniciar">Reintentar</button>
                            <button type="button" class="btn-primary h-10 px-4" @click="abrirManual">
                                <Keyboard class="h-4 w-4" /> Escribir código
                            </button>
                        </div>
                    </div>
                    <div v-if="aviso" class="absolute inset-x-0 top-20 z-20 flex justify-center px-4">
                        <span class="rounded-full px-4 py-1.5 text-sm font-semibold text-white shadow-lg" :class="aviso.tipo === 'ok' ? 'bg-emerald-600' : 'bg-red-600'">{{ aviso.texto }}</span>
                    </div>
                </div>

                <!-- Pie: contador + terminar -->
                <div v-if="modo === 'multiple' && !hoja && !mostrarManual" class="z-10 flex items-center justify-between gap-3 bg-[var(--bg-card)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <span class="text-sm text-[var(--text-muted)]">
                        <strong class="text-[var(--text-primary)]">{{ escaneados }}</strong>
                        {{ escaneados === 1 ? 'producto escaneado' : 'productos escaneados' }}
                    </span>
                    <button type="button" class="btn-primary h-10 px-5" @click="cerrar">Terminar</button>
                </div>

                <!-- Ingreso manual -->
                <form v-if="mostrarManual" class="scanner-sheet" @submit.prevent="enviarManual">
                    <label class="mb-1 block text-sm font-medium text-[var(--text-primary)]" for="codigo-manual">Código de barras</label>
                    <div class="flex gap-2">
                        <input id="codigo-manual" ref="manualRef" v-model="codigoManual" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="13" placeholder="7801234567890" class="compact-control flex-1 tracking-widest" />
                        <button type="submit" class="btn-primary h-10 px-4" :disabled="!codigoManual.trim()">Buscar</button>
                    </div>
                    <button type="button" class="btn-ghost mt-3 h-9 px-3 text-sm" @click="mostrarManual = false">Volver a la cámara</button>
                </form>

                <!-- Hoja del producto escaneado -->
                <form v-if="hoja" class="scanner-sheet" @submit.prevent="agregar">
                    <div v-if="hoja.estado === 'buscando'" class="flex items-center gap-3 py-4 text-sm text-[var(--text-muted)]">
                        <Loader2 class="h-5 w-5 animate-spin" /> Buscando {{ hoja.codigo }}…
                    </div>
                    <template v-else>
                        <div class="mb-3 flex items-start gap-3">
                            <img v-if="hoja.imagenUrl" :src="hoja.imagenUrl" alt="" class="h-14 w-14 shrink-0 rounded-xl bg-white object-contain ring-1 ring-[var(--card-border)]" referrerpolicy="no-referrer" />
                            <div class="min-w-0 flex-1">
                                <p v-if="!esNuevo" class="truncate font-semibold text-[var(--text-primary)]">{{ hoja.nombre }}</p>
                                <input v-else ref="nombreRef" v-model="hoja.nombre" type="text" required placeholder="Nombre del producto" class="compact-control font-semibold" aria-label="Nombre del producto" />
                                <p class="mt-1 truncate text-xs text-[var(--text-muted)]">
                                    <span class="font-mono">{{ hoja.codigo }}</span>
                                    <template v-if="hoja.detalle"> · {{ hoja.detalle }}</template>
                                    <span v-if="hoja.resultado?.fuente === 'openfoodfacts'"> · Sugerido</span>
                                    <span v-else-if="hoja.resultado?.fuente === 'no-encontrado'" class="text-amber-600"> · Nuevo</span>
                                </p>
                            </div>
                        </div>

                        <div v-if="esNuevo" class="mb-3 grid grid-cols-2 gap-2">
                            <input v-model="hoja.categoria" type="text" list="escaner-categorias" placeholder="Categoría" class="compact-control" aria-label="Categoría" />
                            <input v-model="hoja.unidad" type="text" list="escaner-unidades" placeholder="Unidad" class="compact-control" aria-label="Unidad" />
                            <datalist id="escaner-categorias"><option v-for="c in categorias" :key="c" :value="c" /></datalist>
                            <datalist id="escaner-unidades"><option v-for="u in unidades" :key="u" :value="u" /></datalist>
                        </div>

                        <div class="grid gap-3" :class="conPrecio ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'">
                            <div>
                                <label class="mb-1 block text-xs font-medium text-[var(--text-muted)]" for="escaner-cantidad">Cantidad ({{ hoja.unidad || 'unidad' }})</label>
                                <div class="flex items-center gap-1">
                                    <button type="button" class="btn-secondary h-10 w-10 shrink-0 !px-0" aria-label="Restar uno" @click="cambiarCantidad(-1)"><Minus class="h-4 w-4" /></button>
                                    <input id="escaner-cantidad" ref="cantidadRef" v-model="cantidadTexto" type="text" inputmode="decimal" autocomplete="off" class="compact-control min-w-0 text-center text-base font-semibold" />
                                    <button type="button" class="btn-secondary h-10 w-10 shrink-0 !px-0" aria-label="Sumar uno" @click="cambiarCantidad(1)"><Plus class="h-4 w-4" /></button>
                                </div>
                            </div>
                            <div v-if="conPrecio">
                                <label class="mb-1 block text-xs font-medium text-[var(--text-muted)]" for="escaner-precio">Precio unitario</label>
                                <input id="escaner-precio" :value="precio" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="compact-control text-base" @input="precio = integerFromInput($event)" @focus="($event.target as HTMLInputElement).select()" />
                            </div>
                        </div>

                        <p v-if="hojaError" class="mt-2 text-xs font-medium text-red-600">{{ hojaError }}</p>

                        <div class="mt-4 flex gap-2">
                            <button type="button" class="btn-secondary h-11 flex-1" @click="descartar">Descartar</button>
                            <button type="submit" class="btn-primary h-11 flex-[2]">
                                <Plus class="h-4 w-4" /> Agregar
                            </button>
                        </div>
                    </template>
                </form>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.scanner-icon-btn {
    display: inline-flex;
    height: 2.5rem;
    width: 2.5rem;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: rgba(0, 0, 0, 0.35);
    color: #fff;
}
.scanner-icon-btn:hover,
.scanner-icon-btn[aria-pressed='true'] {
    background: rgba(255, 255, 255, 0.25);
}
.scanner-frame {
    width: min(78%, 22rem);
    aspect-ratio: 2 / 1;
    border-radius: 1rem;
    border: 3px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
    transition: opacity 0.2s ease;
}
.scanner-sheet {
    position: relative;
    z-index: 30;
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    border-top: 1px solid var(--card-border);
    background: var(--bg-card);
    color: var(--text-primary);
    padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom));
    animation: subir 0.18s ease-out;
}
@keyframes subir {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
</style>
