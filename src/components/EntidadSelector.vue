<script lang="ts">
import type { EntidadResumen } from '../types';
import { apiService } from '../api/apiService';
import { matchesSearch, normalizeSearch } from '../utils/search';

export type TipoEntidadBusqueda = 'PersonaNatural' | 'Institucion';

const coincide = (q: string, e: EntidadResumen) =>
    matchesSearch(q, e.nombreCompleto, e.nombres, e.apellidos, e.identificador, e.rut);

// Primero quien empieza por lo escrito, luego quien tiene una palabra que empieza así, luego el resto.
const rango = (q: string, e: EntidadResumen) => {
    const nq = normalizeSearch(q);
    const nombre = normalizeSearch(e.nombreCompleto ?? '');
    if (nombre.startsWith(nq)) return 0;
    if (nombre.split(' ').some(p => p.startsWith(nq.split(' ')[0] ?? ''))) return 1;
    return 2;
};

const filtrarOrdenar = (q: string, lista: EntidadResumen[], tipo?: TipoEntidadBusqueda) => lista
    .filter(e => (!tipo || e.tipoEntidad === tipo) && coincide(q, e))
    .map((e, i) => ({ e, i, r: rango(q, e) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.e);

/**
 * Búsqueda única de entidades: nombre y apellido en cualquier orden, sin tildes, y RUT con o sin formato.
 * Usa /entidades?q= y filtra/ordena en el cliente con matchesSearch para que todos los buscadores coincidan.
 */
export const buscarCoherente = async (q: string, tipo?: TipoEntidadBusqueda): Promise<EntidadResumen[]> =>
    filtrarOrdenar(q, await apiService.buscarEntidades(q, tipo), tipo);
</script>

<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref, useId } from 'vue';
import { formatRutForDisplay } from '../utils/rutFormatter';
import AgregarPersonaRapida from './AgregarPersonaRapida.vue';

// Asíncrono: ModalCrearPersona incluye PersonaForm, que a su vez usa este buscador.
const ModalCrearPersona = defineAsyncComponent(() => import('./ModalCrearPersona.vue'));

// Buscador de personas/entidades que comparten todos los formularios (donador, responsable, gestor, etc.).
const props = withDefaults(defineProps<{
    modelValue: EntidadResumen | null;
    label?: string;
    required?: boolean;
    locked?: boolean;
    lockedHint?: string;
    placeholder?: string;
    tipo?: TipoEntidadBusqueda;
    /** Muestra "Agregar persona" sin resultados; abre el alta rápida y deja la persona creada seleccionada. */
    crearPersona?: boolean;
    /** Excluye resultados (por ejemplo, quienes ya están en la lista). */
    filtro?: (entidad: EntidadResumen) => boolean;
    disabled?: boolean;
    minChars?: number;
}>(), {
    label: '',
    required: false,
    locked: false,
    lockedHint: '',
    placeholder: 'Buscar por nombre o RUT...',
    tipo: undefined,
    crearPersona: false,
    filtro: undefined,
    disabled: false,
    minChars: 2
});

const emit = defineEmits<{
    'update:modelValue': [value: EntidadResumen | null];
    /** Se emite tras crear una persona desde el buscador (además de seleccionarla). */
    creada: [entidad: EntidadResumen];
}>();

const inputId = useId();
const query = ref('');
const results = ref<EntidadResumen[]>([]);
const loading = ref(false);
const fallo = ref(false);
const open = ref(false);
const activo = ref(-1);
const modalAbierto = ref(false);
const busquedaModal = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

const buscar = () => {
    if (timer) clearTimeout(timer);
    const texto = query.value.trim();
    activo.value = -1;
    open.value = true;
    if (texto.length < props.minChars) {
        requestSeq++;
        results.value = [];
        loading.value = false;
        fallo.value = false;
        return;
    }
    loading.value = true;
    fallo.value = false;
    timer = setTimeout(async () => {
        const seq = ++requestSeq;
        try {
            const data = await buscarCoherente(texto, props.tipo);
            if (seq === requestSeq) results.value = props.filtro ? data.filter(props.filtro) : data;
        } catch (e) {
            console.error('Error buscando entidades', e);
            if (seq === requestSeq) {
                results.value = [];
                fallo.value = true;
            }
        } finally {
            if (seq === requestSeq) loading.value = false;
        }
    }, 300);
};

const seleccionar = (entidad: EntidadResumen) => {
    emit('update:modelValue', entidad);
    query.value = '';
    results.value = [];
    open.value = false;
    activo.value = -1;
};

const cambiar = () => emit('update:modelValue', null);

const teclado = (event: KeyboardEvent) => {
    if (!open.value || !results.value.length) {
        if (event.key === 'Escape') open.value = false;
        return;
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        activo.value = (activo.value + 1) % results.value.length;
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activo.value = activo.value <= 0 ? results.value.length - 1 : activo.value - 1;
    } else if (event.key === 'Enter' && activo.value >= 0) {
        event.preventDefault();
        const elegido = results.value[activo.value];
        if (elegido) seleccionar(elegido);
    } else if (event.key === 'Escape') {
        open.value = false;
    }
};

const abrirAlta = () => {
    busquedaModal.value = query.value.trim();
    open.value = false;
    modalAbierto.value = true;
};

const personaCreada = async (rut: string, _id?: number, entidad?: EntidadResumen) => {
    // Búsqueda exacta por RUT solo si el alta no devolvió la entidad creada.
    if (!entidad && rut) {
        try {
            entidad = (await apiService.buscarEntidades(rut)).find(e => e.identificador === rut || e.rut === rut);
        } catch {
            entidad = undefined;
        }
    }
    if (!entidad) return;
    seleccionar(entidad);
    emit('creada', entidad);
};

onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
});
</script>

<template>
    <div class="relative">
        <label v-if="props.label" :for="inputId" class="mb-1 block text-sm font-medium text-[var(--text-primary)]">
            {{ props.label }} <span v-if="props.required" class="text-red-500">*</span>
        </label>

        <div v-if="props.modelValue" class="selected-card flex flex-col gap-1 p-3">
            <span class="font-semibold text-[var(--text-primary)]">{{ props.modelValue.nombreCompleto }}</span>
            <span v-if="props.modelValue.identificador" class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(props.modelValue.identificador) }}</span>
            <slot name="selected" :entidad="props.modelValue" />
            <span v-if="props.locked && props.lockedHint" class="text-xs text-[var(--text-muted)]">{{ props.lockedHint }}</span>
            <button
                v-if="!props.locked && !props.disabled"
                type="button"
                class="self-start text-xs text-[var(--accent-color)] underline hover:text-[var(--accent-color-hover)]"
                @click="cambiar"
            >
                Cambiar
            </button>
        </div>

        <div v-else-if="props.locked" class="form-panel-muted p-3 text-sm text-[var(--text-muted)]">
            <slot name="locked-empty">Sin asignar</slot>
        </div>

        <div v-else class="relative">
            <input
                :id="inputId"
                v-model="query"
                type="text"
                autocomplete="off"
                role="combobox"
                :aria-expanded="open && query.trim().length >= props.minChars"
                :placeholder="props.placeholder"
                :disabled="props.disabled"
                class="compact-control"
                @input="buscar"
                @focus="open = true"
                @blur="open = false"
                @keydown="teclado"
            />
            <div v-if="open && query.trim().length >= props.minChars" class="dropdown-panel absolute z-30 mt-1 max-h-60 w-full overflow-auto">
                <div v-if="loading" class="p-4 text-center text-sm text-[var(--text-muted)]">Buscando...</div>
                <div v-else-if="fallo" class="p-4 text-center text-sm text-red-600">No se pudo buscar. Revisa la conexión e inténtalo de nuevo.</div>
                <ul v-else-if="results.length > 0" role="listbox">
                    <!-- mousedown.prevent: elegir antes de que el blur cierre el menú -->
                    <li
                        v-for="(entidad, i) in results"
                        :key="entidad.id"
                        role="option"
                        :aria-selected="i === activo"
                        :class="{ 'bg-[var(--accent-color-muted)]': i === activo }"
                        @mousedown.prevent="seleccionar(entidad)"
                    >
                        <slot name="item" :entidad="entidad">
                            <p class="font-medium text-[var(--text-primary)]">{{ entidad.nombreCompleto }}</p>
                            <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(entidad.identificador) }}</p>
                        </slot>
                    </li>
                </ul>
                <AgregarPersonaRapida v-else-if="props.crearPersona" :query="query" @agregar="abrirAlta" />
                <div v-else class="p-4 text-center text-sm text-[var(--text-muted)]">No se encontraron resultados</div>
            </div>
        </div>

        <ModalCrearPersona
            v-if="props.crearPersona"
            :is-open="modalAbierto"
            :initial-search="busquedaModal"
            @close="modalAbierto = false"
            @created="personaCreada"
        />
    </div>
</template>
