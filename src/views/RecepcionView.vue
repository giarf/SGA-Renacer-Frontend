<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { EntidadResumen, DonacionPayload, Cuenta } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';

// State
const entidades = ref<EntidadResumen[]>([]);
const loadingEntidades = ref(false);
const searchQuery = ref('');
const isDropdownOpen = ref(false);
const selectedEntidad = ref<EntidadResumen | null>(null);

const fondos = ref<Cuenta[]>([]);
const fondosLoading = ref(false);
const selectedFondoId = ref<number | null>(null);
const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const showGestorDropdown = ref(false);
const gestorLoading = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);
const responsableQuery = ref('');
const responsableResults = ref<EntidadResumen[]>([]);
const showResponsableDropdown = ref(false);
const responsableLoading = ref(false);
const resolvingResponsable = ref(false);
const selectedResponsable = ref<EntidadResumen | null>(null);

const today = new Date().toISOString().split('T')[0] ?? '';

const donationForm = ref({
    fecha: today,
    monto: 0,
    proposito: '',
    anotaciones: ''
});
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);
const currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

// Methods
const loadEntidades = async () => {
    loadingEntidades.value = true;
    try {
        entidades.value = await apiService.getEntidades();
    } catch (e) {
        console.error("Failed to load entities", e);
    } finally {
        loadingEntidades.value = false;
    }
};

const loadFondos = async () => {
    fondosLoading.value = true;
    try {
        fondos.value = await apiService.getCuentas();
        if (fondos.value.length > 0 && selectedFondoId.value === null) {
            selectedFondoId.value = fondos.value[0]!.id;
        }
    } catch (e) {
        console.error('Failed to load funds', e);
    } finally {
        fondosLoading.value = false;
    }
};

const selectedFondo = computed(() =>
    fondos.value.find(f => f.id === selectedFondoId.value) || null
);

const filteredEntidades = computed(() => {
    if (!searchQuery.value) return entidades.value;
    const q = searchQuery.value.toLowerCase();
    return entidades.value.filter(e => 
        (e.nombreCompleto || '').toLowerCase().includes(q) || 
        (e.identificador || '').toLowerCase().includes(q)
    );
});

const selectEntidad = (e: EntidadResumen) => {
    selectedEntidad.value = e;
    searchQuery.value = '';
    isDropdownOpen.value = false;
};

const closeGestorDropdownDelayed = () => {
    setTimeout(() => {
        showGestorDropdown.value = false;
    }, 200);
};

let gestorSearchTimer: ReturnType<typeof setTimeout> | null = null;
let responsableSearchTimer: ReturnType<typeof setTimeout> | null = null;

const loadCurrentResponsible = async () => {
    resolvingResponsable.value = true;
    try {
        selectedResponsable.value = await resolveCurrentResponsible();
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudo resolver el responsable interno.' };
    } finally {
        resolvingResponsable.value = false;
    }
};

const searchResponsables = (query: string) => {
    if (responsableSearchTimer) clearTimeout(responsableSearchTimer);
    if (!query || query.trim().length < 2) {
        responsableResults.value = [];
        return;
    }
    responsableSearchTimer = setTimeout(async () => {
        responsableLoading.value = true;
        try {
            responsableResults.value = await apiService.buscarEntidades(query);
            showResponsableDropdown.value = true;
        } catch {
            responsableResults.value = [];
        } finally {
            responsableLoading.value = false;
        }
    }, 300);
};

const closeResponsableDropdownDelayed = () => {
    setTimeout(() => {
        showResponsableDropdown.value = false;
    }, 200);
};

const searchGestores = (query: string) => {
    if (gestorSearchTimer) clearTimeout(gestorSearchTimer);
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        return;
    }
    gestorSearchTimer = setTimeout(async () => {
        gestorLoading.value = true;
        try {
            gestorResults.value = await apiService.buscarEntidades(query);
            showGestorDropdown.value = true;
        } catch (e) {
            console.error('Error buscando gestores', e);
            gestorResults.value = [];
        } finally {
            gestorLoading.value = false;
        }
    }, 300);
};

const selectGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const clearGestor = () => {
    selectedGestor.value = null;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const submitDonacion = async () => {
    if (!selectedEntidad.value) {
        message.value = { type: 'error', text: 'Debes seleccionar un donante.' };
        return;
    }
    if (!donationForm.value.monto || donationForm.value.monto <= 0) {
        message.value = { type: 'error', text: 'Debes ingresar un monto mayor a cero.' };
        return;
    }
    if (!selectedFondo.value) {
        message.value = { type: 'error', text: 'Debes seleccionar un fondo destino.' };
        return;
    }
    if (!selectedResponsable.value) {
        message.value = { type: 'error', text: 'No se pudo identificar el responsable interno.' };
        return;
    }
    submitting.value = true;
    message.value = null;

    const destinoBase = selectedFondo.value?.nombre || 'Fondo sin nombre';
    const anotaciones = donationForm.value.anotaciones?.trim() || '';
    const proposito = donationForm.value.proposito?.trim() || destinoBase;
    const payload: DonacionPayload = {
        ingreso: {
            origenEntidadId: selectedEntidad.value.id,
            responsableInternoId: selectedResponsable.value.id,
            montoTotal: donationForm.value.monto,
            tipoTransaccion: 'Donacion',
            estado: 'Cerrado',
            fecha: donationForm.value.fecha,
            anotaciones: anotaciones || undefined
        },
        donacion: {
            propositoEspecifico: proposito,
            gestorId: selectedGestor.value?.id
        },
        pecuniario: {
            cuentaDestinoId: selectedFondo.value!.id,
            metodoTransferencia: 'Transferencia'
        }
    };

    try {
        await apiService.registrarDonacion(payload);
        message.value = { type: 'success', text: 'Donación registrada exitosamente.' };
        // Reset
        donationForm.value = { fecha: today, monto: 0, proposito: '', anotaciones: '' };
        selectedEntidad.value = null;
        selectedGestor.value = null;
        selectedFondoId.value = fondos.value[0]?.id ?? null;
    } catch (e: any) {
         message.value = { type: 'error', text: 'Error al registrar donación.' };
    } finally {
        submitting.value = false;
    }
};

onMounted(() => {
    loadEntidades();
    loadFondos();
    loadCurrentResponsible();
});
</script>

<template>
    <div class="form-page space-y-4">
        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>
        <div class="form-shell">
            <div class="form-shell-header border-b px-5 py-4">
                <h3 class="text-lg font-semibold text-[var(--text-primary)]">Donación pecuniaria</h3>
                <p class="text-xs text-[var(--text-muted)]">Completa donante, responsable, fondo y monto.</p>
            </div>

            <form @submit.prevent="submitDonacion" class="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div class="md:col-span-2 relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Donante <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedEntidad" class="selected-card flex flex-col gap-2 p-3">
                        <div>
                             <span class="block text-sm font-semibold text-[var(--text-primary)]">{{ selectedEntidad.nombreCompleto }}</span>
                             <span class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(selectedEntidad.identificador) }}</span>
                        </div>
                        <button type="button" @click="selectedEntidad = null" class="btn-secondary px-3 py-1.5 text-xs">
                            Cambiar donante
                        </button>
                    </div>
                    <div v-else class="relative">
                        <input
                            type="text"
                            v-model="searchQuery"
                            @focus="isDropdownOpen = true"
                            placeholder="Buscar por nombre o RUT..."
                            class="compact-control"
                        >
                        <div v-if="isDropdownOpen" class="dropdown-panel absolute z-10 mt-1 w-full overflow-hidden">
                            <ul class="max-h-60 overflow-auto">
                                <li
                                    v-for="entidad in filteredEntidades"
                                    :key="entidad.id"
                                    @click="selectEntidad(entidad)"
                                    class="cursor-pointer border-b border-[var(--card-border)] px-4 py-2.5 hover:bg-[var(--accent-color-muted)] last:border-0"
                                >
                                    <p class="font-medium text-[var(--text-primary)]">{{ entidad.nombreCompleto }}</p>
                                    <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                </li>
                            </ul>
                            <div v-if="filteredEntidades.length === 0" class="bg-[var(--surface-muted)] p-4 text-center text-sm text-[var(--text-muted)]">
                                No se encontraron resultados para "{{ searchQuery }}"
                            </div>
                        </div>
                    </div>
                </div>

                <div class="md:col-span-2 relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                        Responsable interno <span class="text-red-500">*</span>
                    </label>
                    <div v-if="selectedResponsable" class="selected-card flex items-center justify-between p-3">
                        <div>
                            <p class="font-semibold text-[var(--text-primary)]">{{ selectedResponsable.nombreCompleto }}</p>
                            <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(selectedResponsable.identificador) }}</p>
                            <p v-if="!canChangeResponsible" class="mt-1 text-xs text-[var(--text-muted)]">Asignado automáticamente desde Authentik</p>
                        </div>
                        <button v-if="canChangeResponsible" type="button" class="text-xs text-blue-700 hover:underline" @click="selectedResponsable = null">Cambiar</button>
                    </div>
                    <div v-else-if="resolvingResponsable" class="form-panel-muted p-3 text-sm text-[var(--text-muted)]">
                        Resolviendo responsable interno...
                    </div>
                    <div v-else class="relative">
                        <input
                            v-if="canChangeResponsible"
                            type="text"
                            v-model="responsableQuery"
                            @input="searchResponsables(responsableQuery)"
                            @focus="showResponsableDropdown = true"
                            @blur="closeResponsableDropdownDelayed"
                            placeholder="Buscar responsable por nombre o RUT..."
                            class="compact-control"
                        />
                        <div v-else class="message-banner message-error">
                            No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.
                        </div>
                        <div v-if="responsableLoading" class="absolute right-3 top-2.5 text-xs text-[var(--text-muted)]">Buscando...</div>
                        <ul v-if="showResponsableDropdown && responsableResults.length > 0" class="dropdown-panel absolute z-10 mt-1 max-h-60 w-full overflow-auto">
                            <li
                                v-for="ent in responsableResults"
                                :key="ent.id"
                                @mousedown.prevent="selectedResponsable = ent; responsableQuery = ''; showResponsableDropdown = false"
                                class="cursor-pointer px-4 py-2 hover:bg-[var(--accent-color-muted)]"
                            >
                                <p class="font-medium text-[var(--text-primary)]">{{ ent.nombreCompleto }}</p>
                                <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(ent.identificador) }}</p>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="md:col-span-2 relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gestor interno (opcional)</label>
                    <div v-if="selectedGestor" class="selected-card flex items-center justify-between p-3">
                        <div>
                            <p class="font-semibold text-amber-800">{{ selectedGestor.nombreCompleto }}</p>
                            <p class="text-xs text-gray-600">{{ formatRutForDisplay(selectedGestor.identificador) }}</p>
                        </div>
                        <button type="button" class="text-xs text-amber-700 hover:underline" @click="clearGestor">Cambiar</button>
                    </div>
                    <div v-else class="relative">
                        <input
                            type="text"
                            v-model="gestorQuery"
                            @input="searchGestores(gestorQuery)"
                            @focus="showGestorDropdown = true"
                            @blur="closeGestorDropdownDelayed"
                            placeholder="Buscar gestor por nombre o RUT..."
                            class="compact-control"
                        />
                        <div v-if="gestorLoading" class="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</div>
                        <ul
                            v-if="showGestorDropdown && gestorResults.length > 0"
                            class="dropdown-panel absolute z-10 mt-1 max-h-60 w-full overflow-auto"
                        >
                            <li
                                v-for="ent in gestorResults"
                                :key="ent.id"
                                @mousedown.prevent="selectGestor(ent)"
                                class="cursor-pointer px-4 py-2 hover:bg-[var(--accent-color-muted)]"
                            >
                                <p class="font-medium text-gray-900">{{ ent.nombreCompleto }}</p>
                                <p class="text-xs text-gray-500">{{ formatRutForDisplay(ent.identificador) }}</p>
                            </li>
                        </ul>
                        <div
                            v-else-if="showGestorDropdown && gestorQuery.length >= 2 && !gestorLoading"
                            class="dropdown-panel absolute z-10 mt-1 w-full px-4 py-3 text-xs text-[var(--text-muted)]"
                        >
                            Sin coincidencias
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">
                        Fecha del ingreso <span class="text-red-500">*</span>
                    </label>
                    <input
                        v-model="donationForm.fecha"
                        type="date"
                        required
                        class="mt-1 compact-control"
                    >
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">
                        Monto ($) <span class="text-red-500">*</span>
                    </label>
                    <div class="mt-1 relative rounded-md shadow-sm">
                        <div class="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none">
                            <span class="text-[var(--text-muted)] sm:text-sm">$</span>
                        </div>
                        <input
                            v-model.number="donationForm.monto"
                            type="number"
                            required
                            class="compact-control pl-9 pr-12"
                        >
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Propósito específico</label>
                    <input
                        v-model="donationForm.proposito"
                        type="text"
                        placeholder="Ej: Programa Invierno"
                        class="mt-1 compact-control"
                    >
                </div>

                <div class="md:col-span-2 space-y-2">
                    <label class="block text-sm font-medium text-gray-700">
                        Fondo destino <span class="text-red-500">*</span>
                    </label>
                    <div v-if="fondosLoading" class="text-sm text-[var(--text-muted)]">Cargando fondos disponibles...</div>
                    <template v-else>
                        <select
                            v-if="fondos.length > 0"
                            v-model="selectedFondoId"
                            required
                            class="mt-1 compact-control"
                        >
                            <option v-for="fondo in fondos" :key="fondo.id" :value="fondo.id">
                                {{ fondo.nombre }} — Saldo: {{ currencyFormatter.format(fondo.saldoActual ?? 0) }}
                            </option>
                        </select>
                        <div v-else class="message-banner message-error">
                            No existen fondos disponibles. Dirígete a la sección "Cuentas y fondos" para crear uno nuevo.
                        </div>
                    </template>
                    <p class="text-xs text-[var(--text-muted)]">
                        Los fondos se administran en la sección "Cuentas y fondos" del menú lateral.
                    </p>
                </div>

                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Anotaciones (opcional)</label>
                    <textarea
                        v-model="donationForm.anotaciones"
                        rows="2"
                        placeholder="Notas adicionales o contexto"
                        class="mt-1 compact-control"
                    ></textarea>
                </div>

                <div class="form-actions md:col-span-2 flex justify-end border-t pt-4">
                    <button type="submit" :disabled="submitting" class="btn-primary h-10 w-full justify-center md:w-auto">
                        {{ submitting ? 'Guardando...' : 'Registrar Donación' }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>
