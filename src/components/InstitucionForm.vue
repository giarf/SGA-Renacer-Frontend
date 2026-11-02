<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import EntidadSelector from './EntidadSelector.vue';
import PhoneInput from './PhoneInput.vue';
import { apiService } from '../api/apiService';
import { formatRutForBackend } from '../utils/rutFormatter';
import type { RegistrarInstitucionPayload, EntidadResumen } from '../types';

const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'created'): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);

const form = reactive({
    rut: '',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    redSocial: '',
    gestorId: undefined as number | undefined,
    anotaciones: '',
    sector: '',
    razonSocial: '',
    nombreFantasia: '',
    subtipoInstitucion: '',
    rubro: ''
});

const selectedGestor = ref<EntidadResumen | null>(null);
// El gestor elegido en el buscador se guarda en el payload.
watch(selectedGestor, (entidad) => { form.gestorId = entidad?.id; });

const clearGestor = () => {
    selectedGestor.value = null;
    form.gestorId = undefined;
};

const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length === 0) return '';
    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1).toUpperCase();
    const formattedBody = body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    return formattedBody ? `${formattedBody}-${verifier}` : verifier;
};

const handleRutInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const formatted = formatRut(input.value);
    form.rut = formatted;
};

const resetForm = () => {
    Object.assign(form, {
        rut: '',
        telefono: '',
        correo: '',
        direccion: '',
        comuna: '',
        redSocial: '',
        gestorId: undefined,
        anotaciones: '',
        sector: '',
        razonSocial: '',
        nombreFantasia: '',
        subtipoInstitucion: '',
        rubro: ''
    });
    clearGestor();
};

const submit = async () => {
    if (!form.razonSocial.trim()) {
        error.value = 'La razón social es obligatoria.';
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        const payload = Object.fromEntries(
            Object.entries(form).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
        ) as unknown as RegistrarInstitucionPayload;
        if (payload.rut) {
            payload.rut = formatRutForBackend(payload.rut);
        }
        await apiService.registrarInstitucionNueva(payload);
        resetForm();
        emit('created');
    } catch (e: any) {
        error.value = e.message || 'Error al registrar institución.';
    } finally {
        loading.value = false;
    }
};
</script>

<template>
    <form @submit.prevent="submit" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Razón social *</label>
                <input v-model="form.razonSocial" required placeholder="ONG Solidaria" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Nombre fantasía</label>
                <input v-model="form.nombreFantasia" placeholder="Nombre comercial" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">RUT</label>
                <input v-model="form.rut" @input="handleRutInput" maxlength="12" placeholder="12.345.678-9" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Subtipo</label>
                <input v-model="form.subtipoInstitucion" placeholder="ONG, Fundación, etc." />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Rubro</label>
                <input v-model="form.rubro" placeholder="Asistencia social" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Teléfono</label>
                <PhoneInput v-model="form.telefono" :required="false" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Correo</label>
                <input v-model="form.correo" type="email" placeholder="contacto@ong.cl" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Red social</label>
                <input v-model="form.redSocial" placeholder="@solidaria" />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Dirección</label>
                <input v-model="form.direccion" placeholder="Av. Principal 123" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Comuna</label>
                <input v-model="form.comuna" placeholder="Santiago" />
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Sector</label>
                <input v-model="form.sector" placeholder="Centro" />
            </div>
        </div>

        <EntidadSelector v-model="selectedGestor" label="Gestor" placeholder="Buscar gestor por nombre o RUT..." />

        <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Anotaciones</label>
            <textarea v-model="form.anotaciones" rows="2"></textarea>
        </div>

        <div v-if="error" class="message-banner message-error">
            {{ error }}
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-[var(--card-border)]">
            <button type="button" class="btn-secondary" @click="emit('cancel')" :disabled="loading">
                Cancelar
            </button>
            <button type="submit" class="btn-primary min-w-[160px]" :disabled="loading">
                <span v-if="loading" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                <span v-else>Registrar institución</span>
            </button>
        </div>
    </form>
</template>
