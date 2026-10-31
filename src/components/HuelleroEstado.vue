<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { FingerprintPattern } from 'lucide-vue-next';
import { apiService } from '../api/apiService';

const estado = ref<{ conectado: boolean; error?: string } | null>(null);
const abierto = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let secuencia = 0;

const texto = computed(() => estado.value === null ? 'Comprobando huellero…'
    : estado.value.conectado ? 'Huellero conectado'
    : estado.value.error || 'Huellero sin conexión');

async function comprobar() {
    if (document.hidden) return;
    const actual = ++secuencia;
    try {
        const data = await apiService.getEstadoHuellero();
        if (actual === secuencia) estado.value = data;
    } catch {
        if (actual === secuencia) estado.value = { conectado: false, error: 'No se pudo consultar el estado del huellero en el backend del SGA.' };
    }
}

function alternar() {
    abierto.value = !abierto.value;
    void comprobar();
}

onMounted(() => {
    void comprobar();
    timer = setInterval(comprobar, 30000);
    document.addEventListener('visibilitychange', comprobar);
});
onBeforeUnmount(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', comprobar);
});
</script>

<template>
    <div class="relative" @mouseleave="abierto = false">
        <button type="button" class="fp-status" :class="estado === null ? 'checking' : estado.conectado ? 'on' : 'off'"
            :aria-label="texto" :aria-expanded="abierto" @click="alternar" @mouseenter="abierto = true">
            <FingerprintPattern class="h-4 w-4" aria-hidden="true" />
            <span class="fp-track" aria-hidden="true"><span class="fp-thumb" /></span>
        </button>
        <div v-if="abierto" role="status" class="fp-tooltip">
            <strong>{{ estado && !estado.conectado ? 'Huellero sin conexión' : texto }}</strong>
            <span v-if="estado && !estado.conectado && estado.error">{{ estado.error }}</span>
            <span v-else>huella.familiarenacer.cl · se comprueba cada 30 s</span>
        </div>
    </div>
</template>

<style scoped>
.fp-status { display: inline-flex; align-items: center; gap: .45rem; height: 2.5rem; padding: 0 .7rem; border-radius: 999px; border: 1px solid var(--card-border); color: var(--text-muted); transition: background .2s; }
.fp-status:hover { background: var(--surface-muted); }
.fp-status:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.fp-track { position: relative; width: 1.9rem; height: 1.05rem; border-radius: 999px; background: #94a3b8; transition: background .2s; }
.fp-thumb { position: absolute; top: .15rem; left: .15rem; width: .75rem; height: .75rem; border-radius: 999px; background: #fff; transition: transform .2s; }
.on .fp-track { background: #16a34a; }
.on .fp-thumb { transform: translateX(.85rem); }
.off .fp-track { background: #dc2626; }
.checking .fp-thumb { transform: translateX(.42rem); }
.fp-tooltip { position: absolute; right: 0; top: calc(100% + .5rem); z-index: 40; display: grid; gap: .25rem; width: min(18rem, calc(100vw - 2rem)); padding: .7rem .85rem; border-radius: .9rem; border: 1px solid var(--card-border); background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-soft); font-size: .8rem; }
.fp-tooltip span { color: var(--text-muted); font-size: .75rem; }
@media (prefers-reduced-motion: reduce) { .fp-track, .fp-thumb { transition: none; } }
</style>
