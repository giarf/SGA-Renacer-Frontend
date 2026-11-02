<script setup lang="ts">
import { reactive, ref, useId } from 'vue';
import { apiService } from '../api/apiService';
import PhoneInput from './PhoneInput.vue';
import type { EntidadResumen } from '../types';

// Registro mínimo para no frenar un formulario cuando la persona no está en el sistema.
// El resto de la ficha (RUT, dirección, etc.) lo completa un administrador en Entidades.
const props = defineProps<{ initialSearch?: string }>();
const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'busy', value: boolean): void;
    (e: 'created', rut: string, id: number, entidad: EntidadResumen): void;
}>();

const initialText = (props.initialSearch ?? '').trim().replace(/\s+/g, ' ');
const initialIsRut = /^(?=.*\d)[\d.kK-]+$/.test(initialText);
const initialWords = initialIsRut || !initialText ? [] : initialText.split(' ');
// "Juan Pérez" -> nombres Juan, apellidos Pérez; "Juan Carlos Pérez Soto" -> dos y dos.
const corte = initialWords.length >= 4 ? 2 : initialWords.length >= 2 ? initialWords.length - 1 : initialWords.length;

const fieldId = useId();
const loading = ref(false);
const error = ref<string | null>(null);
const form = reactive({
    nombres: initialWords.slice(0, corte).join(' '),
    apellidos: initialWords.slice(corte).join(' '),
    telefono: ''
});

const submit = async () => {
    if (loading.value) return;
    loading.value = true;
    emit('busy', true);
    error.value = null;
    try {
        const entidad = await apiService.registrarPersonaRapida({
            nombres: form.nombres.trim(),
            apellidos: form.apellidos.trim(),
            telefono: form.telefono.trim()
        });
        emit('created', '', entidad.id, entidad);
    } catch (e: any) {
        error.value = e.message || 'No se pudo registrar la persona';
    } finally {
        loading.value = false;
        emit('busy', false);
    }
};
</script>

<template>
    <form class="quick-form" :aria-busy="loading" @submit.prevent="submit">
        <fieldset :disabled="loading" class="quick-fields">
            <div>
                <label :for="`${fieldId}-nombres`" class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Nombres *</label>
                <input :id="`${fieldId}-nombres`" v-model="form.nombres" required autofocus autocomplete="off" placeholder="Juan" class="compact-control" />
            </div>
            <div>
                <label :for="`${fieldId}-apellidos`" class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Apellidos *</label>
                <input :id="`${fieldId}-apellidos`" v-model="form.apellidos" required autocomplete="off" placeholder="Pérez" class="compact-control" />
            </div>
            <div class="quick-full">
                <label :for="`${fieldId}-telefono`" class="mb-1 block text-sm font-medium text-[var(--text-primary)]">Teléfono *</label>
                <PhoneInput v-model="form.telefono" :input-id="`${fieldId}-telefono`" :required="true" />
            </div>
            <p class="quick-full quick-hint">Solo lo necesario para registrarla. Un administrador completa el resto de la ficha.</p>
        </fieldset>
        <footer class="quick-footer">
            <div v-if="error" class="message-banner message-error" role="alert">{{ error }}</div>
            <div class="quick-actions">
                <button type="button" class="btn-secondary disabled:opacity-50" :disabled="loading" @click="emit('cancel')">Cancelar</button>
                <button type="submit" class="btn-primary disabled:opacity-50" :disabled="loading">
                    {{ loading ? 'Registrando...' : 'Registrar y seleccionar' }}
                </button>
            </div>
        </footer>
    </form>
</template>

<style scoped>
.quick-form { display: flex; flex-direction: column; min-height: 0; }
.quick-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; min-width: 0; margin: 0; padding: 1.25rem 1.5rem; border: 0; }
.quick-fields > * { min-width: 0; }
.quick-full { grid-column: 1 / -1; }
.quick-hint { font-size: .75rem; color: var(--text-muted); }
.quick-footer { display: grid; gap: .75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--card-border); }
.quick-footer .message-banner { margin: 0; }
.quick-actions { display: flex; justify-content: flex-end; gap: .75rem; }
.quick-actions button { min-height: 2.75rem; }
@media (max-width: 600px) {
    .quick-form :deep(input), .quick-form :deep(select) { font-size: 1rem; }
}
@media (max-width: 480px) {
    .quick-fields { grid-template-columns: minmax(0, 1fr); padding: 1rem; }
    .quick-footer { padding: .85rem 1rem; }
    .quick-actions .btn-primary { flex: 1; }
}
</style>
