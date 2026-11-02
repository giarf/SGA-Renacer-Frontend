<script setup lang="ts">
import EntidadSelector from '../components/EntidadSelector.vue';
import { ref, computed, onMounted, watch } from 'vue';
import type { EntidadResumen, DonacionPayload, Cuenta } from '../types';
import { apiService } from '../api/apiService';
import { canChangeResponsible, resolveCurrentResponsible } from '../auth/currentResponsible';
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../utils/formDraft';
import { integerFromInput } from '../utils/integerInput';
import InlineDateControl from '../components/InlineDateControl.vue';

// State
const selectedEntidad = ref<EntidadResumen | null>(null);

const fondos = ref<Cuenta[]>([]);
const fondosLoading = ref(false);
const selectedFondoId = ref<number | null>(null);
const selectedGestor = ref<EntidadResumen | null>(null);
const resolvingResponsable = ref(false);
const selectedResponsable = ref<EntidadResumen | null>(null);

const today = new Date().toISOString().split('T')[0] ?? '';

const donationForm = ref({
    fecha: today,
    monto: 0,
    proposito: '',
    anotaciones: ''
});
const draftReady = ref(false);
const draftKey = 'draft:operacion-diaria:donacion-pecuniaria';
const submitting = ref(false);
const message = ref<{ type: 'success' | 'error', text: string } | null>(null);
const currencyFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

// Methods
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

const loadCurrentResponsible = async () => {
    selectedResponsable.value = null;
    resolvingResponsable.value = true;
    try {
        selectedResponsable.value = await resolveCurrentResponsible();
    } catch (e: any) {
        message.value = { type: 'error', text: e.message || 'No se pudo resolver el responsable interno.' };
    } finally {
        resolvingResponsable.value = false;
    }
};

type DonationDraft = {
    donationForm: typeof donationForm.value;
    selectedEntidad: EntidadResumen | null;
    selectedFondoId: number | null;
    selectedGestor: EntidadResumen | null;
};

const restoreDraft = () => {
    const draft = loadFormDraft<DonationDraft>(draftKey);
    if (!draft) return;
    donationForm.value = { ...donationForm.value, ...draft.donationForm };
    selectedEntidad.value = draft.selectedEntidad;
    selectedFondoId.value = draft.selectedFondoId;
    selectedGestor.value = draft.selectedGestor;
};

const persistDraft = () => {
    if (!draftReady.value) return;
    saveFormDraft(draftKey, {
        donationForm: donationForm.value,
        selectedEntidad: selectedEntidad.value,
        selectedFondoId: selectedFondoId.value,
        selectedGestor: selectedGestor.value
    } satisfies DonationDraft);
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

    const anotaciones = donationForm.value.anotaciones?.trim() || '';
    const proposito = donationForm.value.proposito?.trim() || undefined;
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
        clearFormDraft(draftKey);
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

watch([donationForm, selectedEntidad, selectedFondoId, selectedGestor, selectedResponsable], persistDraft, { deep: true });

onMounted(async () => {
    await Promise.all([loadFondos(), loadCurrentResponsible()]);
    restoreDraft();
    draftReady.value = true;
});
</script>

<template>
    <div class="space-y-4">
        <div v-if="message" :class="['message-banner', message.type === 'success' ? 'message-success' : 'message-error']">
            {{ message.text }}
        </div>
        <div class="form-shell">
            <div class="form-shell-header flex items-center justify-between gap-3 border-b px-5 py-3">
                <h3 class="text-base font-semibold text-[var(--text-primary)]">Donación pecuniaria</h3>
                <InlineDateControl v-model="donationForm.fecha" />
            </div>

            <form @submit.prevent="submitDonacion" class="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <EntidadSelector
                    v-model="selectedEntidad"
                    class="md:col-span-2"
                    label="Donante"
                    required
                    crear-persona
                />

                <EntidadSelector
                    v-model="selectedResponsable"
                    class="md:col-span-2"
                    label="Responsable interno"
                    required
                    :locked="!canChangeResponsible || resolvingResponsable"
                    locked-hint="Asignado automáticamente desde Authentik"
                    placeholder="Buscar responsable por nombre o RUT..."
                >
                    <template #locked-empty>
                        <span v-if="resolvingResponsable">Resolviendo responsable interno...</span>
                        <span v-else class="text-red-600">No se encontró tu responsable interno. Debe existir una entidad con tu nombre o correo de Authentik.</span>
                    </template>
                </EntidadSelector>

                <EntidadSelector
                    v-model="selectedGestor"
                    class="md:col-span-2"
                    label="Gestor interno (opcional)"
                    placeholder="Buscar gestor por nombre o RUT..."
                />

                <div>
                    <label class="block text-sm font-medium text-gray-700">
                        Monto <span class="text-red-500">*</span>
                    </label>
                    <input
                        :value="donationForm.monto"
                        type="text"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        required
                        class="mt-1 compact-control"
                        @input="donationForm.monto = integerFromInput($event)"
                    >
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
