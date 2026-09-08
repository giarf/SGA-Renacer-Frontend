<script setup lang="ts">
import { ref, reactive, useId, onBeforeUnmount } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { apiService } from '../api/apiService';
import { formatRutForBackend, formatRutForDisplay } from '../utils/rutFormatter';
import PhoneInput from './PhoneInput.vue';
import ProfilePhotoInput from './ProfilePhotoInput.vue';
import EtiquetaChipsSelector from './EtiquetaChipsSelector.vue';
import RegionComunaSelect from './RegionComunaSelect.vue';
import type { RegistrarPersonaPayload, EntidadResumen } from '../types';

const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'busy', value: boolean): void;
    (e: 'created', rut: string, id?: number): void;
}>();

const fieldId = useId();
const loading = ref(false);

const revealInvalidField = (event: Event) => {
    const details = (event.target as HTMLElement).closest('details');
    if (details) details.open = true;
};
const error = ref<string | null>(null);
const fotoFile = ref<File | null>(null);
const selectedEtiquetaIds = ref<number[]>([]);

const gestorQuery = ref('');
const gestorResults = ref<EntidadResumen[]>([]);
const gestorLoading = ref(false);
const showGestorDropdown = ref(false);
const selectedGestor = ref<EntidadResumen | null>(null);

let gestorDebounceTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => {
    if (gestorDebounceTimer) clearTimeout(gestorDebounceTimer);
});
const searchGestor = (query: string) => {
    if (gestorDebounceTimer) clearTimeout(gestorDebounceTimer);
    if (!query || query.trim().length < 2) {
        gestorResults.value = [];
        return;
    }
    gestorDebounceTimer = setTimeout(async () => {
        gestorLoading.value = true;
        try {
            gestorResults.value = await apiService.buscarEntidades(query);
        } catch (e) {
            gestorResults.value = [];
        } finally {
            gestorLoading.value = false;
        }
    }, 300);
};

const selectGestor = (entidad: EntidadResumen) => {
    selectedGestor.value = entidad;
    form.gestorId = entidad.id;
    gestorQuery.value = '';
    showGestorDropdown.value = false;
};

const clearGestor = () => {
    selectedGestor.value = null;
    form.gestorId = undefined;
    gestorQuery.value = '';
};

const form = reactive<RegistrarPersonaPayload>({
    rut: '',
    tipoEntidad: 'Persona',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    region: '',
    redSocial: '',
    gestorId: undefined,
    anotaciones: '',
    sector: '',
    nombres: '',
    apellidos: '',
    genero: '',
    ocupacion: '',
    fechaNacimiento: ''
});

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
        tipoEntidad: 'Persona',
        telefono: '',
        correo: '',
        direccion: '',
        comuna: '',
        region: '',
        redSocial: '',
        gestorId: undefined,
        anotaciones: '',
        sector: '',
        nombres: '',
        apellidos: '',
        genero: '',
        ocupacion: '',
        fechaNacimiento: ''
    });
    clearGestor();
    fotoFile.value = null;
    selectedEtiquetaIds.value = [];
};

const submit = async () => {
    if (loading.value) return;
    loading.value = true;
    emit('busy', true);
    error.value = null;
    try {
        const payloadToSend = Object.fromEntries(
            Object.entries(form).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
        ) as unknown as RegistrarPersonaPayload;

        if (payloadToSend.rut) {
            payloadToSend.rut = formatRutForBackend(payloadToSend.rut);
        }

        const created = await apiService.registrarPersonaNueva(payloadToSend, fotoFile.value ?? undefined);
        if (created.id && selectedEtiquetaIds.value.length > 0) {
            await Promise.all(selectedEtiquetaIds.value.map(etiquetaId => apiService.asignarEtiquetaEntidad(created.id, etiquetaId)));
        }
        emit('created', payloadToSend.rut || '', created.id);
        resetForm();
    } catch (e: any) {
        error.value = e.message || 'Error al registrar persona';
    } finally {
        loading.value = false;
        emit('busy', false);
    }
};
</script>

<template>
    <form @submit.prevent="submit" @invalid.capture="revealInvalidField" class="person-form" :aria-busy="loading">
        <div class="person-form-scroll">
            <fieldset :disabled="loading" class="person-fields">
                <div class="person-section-heading">
                    <h3>Datos principales</h3>
                    <span>* Obligatorios</span>
                </div>
                <div class="person-grid">
                    <div>
                        <label :for="`${fieldId}-nombres`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Nombres *</label>
                        <input :id="`${fieldId}-nombres`" v-model="form.nombres" autocomplete="given-name" autofocus
                            required
                            placeholder="Juan"
                            class="compact-control"
                        />
                    </div>
                    <div>
                        <label :for="`${fieldId}-apellidos`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Apellidos *</label>
                        <input :id="`${fieldId}-apellidos`" v-model="form.apellidos" autocomplete="family-name"
                            required
                            placeholder="Pérez"
                            class="compact-control"
                        />
                    </div>
                    <div>
                        <label :for="`${fieldId}-telefono`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Teléfono *</label>
                        <PhoneInput :input-id="`${fieldId}-telefono`" v-model="form.telefono"
                            :required="true"
                        />
                    </div>
                    <div>
                        <label :for="`${fieldId}-rut`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">RUT</label>
                        <input :id="`${fieldId}-rut`" v-model="form.rut"
                            @input="handleRutInput"
                            placeholder="12.345.678-9"
                            maxlength="12"
                            class="compact-control"
                        />
                    </div>
                </div>

                <details class="person-details">
                    <summary>
                        <div>
                            <span class="person-details-title">Más información <span>Opcional</span></span>
                            <p>Foto, gestor, dirección y otros datos</p>
                        </div>
                        <ChevronDown :size="18" class="person-details-chevron" aria-hidden="true" />
                    </summary>
                    <div class="person-details-content">
                        <div class="person-extras-heading">
                            <div class="relative">
                                <label :for="`${fieldId}-gestor`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Gestor</label>
                                <div v-if="selectedGestor" class="selected-card flex items-center justify-between p-3">
                                    <div>
                                        <span class="block font-bold text-[var(--accent-color)]">{{ selectedGestor.nombreCompleto }}</span>
                                        <span class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(selectedGestor.identificador) }}</span>
                                    </div>
                                    <button type="button" @click="clearGestor" class="text-sm text-[var(--accent-color)] underline">Cambiar</button>
                                </div>
                                <div v-else>
                                    <input
                                        :id="`${fieldId}-gestor`"
                                        type="text"
                                        v-model="gestorQuery"
                                        @input="searchGestor(gestorQuery)"
                                        @focus="showGestorDropdown = true"
                                        placeholder="Buscar gestor por nombre o RUT..."
                                        class="compact-control"
                                    />
                                    <div v-if="showGestorDropdown && gestorQuery.length >= 2" class="dropdown-panel absolute z-20 mt-1 max-h-48 w-full overflow-auto">
                                        <div v-if="gestorLoading" class="p-3 text-center text-sm text-[var(--text-muted)]">Buscando...</div>
                                        <ul v-else-if="gestorResults.length > 0">
                                            <li
                                                v-for="entidad in gestorResults"
                                                :key="entidad.id"
                                            >
                                                <button type="button" class="w-full text-left" @click="selectGestor(entidad)">
                                                    <p class="font-medium text-[var(--text-primary)] text-sm">{{ entidad.nombreCompleto }}</p>
                                                    <p class="text-xs text-[var(--text-muted)]">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                                </button>
                                            </li>
                                        </ul>
                                        <div v-else class="p-3 text-center text-sm text-[var(--text-muted)]">No se encontraron resultados</div>
                                    </div>
                                </div>
                            </div>
                            <ProfilePhotoInput
                                v-model="fotoFile"
                                label="Foto de perfil"
                                :fallback="form.nombres || form.apellidos || 'P'"
                                @error="error = $event"
                            />
                        </div>

                        <div class="person-grid">
                            <div>
                                <label :for="`${fieldId}-genero`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Género</label>
                                <select :id="`${fieldId}-genero`" v-model="form.genero"
                                    class="compact-control"
                                >
                                    <option value="">Seleccionar...</option>
                                    <option value="Masculino">Masculino</option>
                                    <option value="Femenino">Femenino</option>
                                    <option value="Otro">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label :for="`${fieldId}-fechaNacimiento`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Fecha de nacimiento</label>
                                <input :id="`${fieldId}-fechaNacimiento`" v-model="form.fechaNacimiento"
                                    type="date"
                                    class="compact-control"
                                />
                            </div>
                            <div>
                                <label :for="`${fieldId}-correo`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Email</label>
                                <input :id="`${fieldId}-correo`" v-model="form.correo"
                                    type="email"
                                    placeholder="juan.perez@example.com"
                                    class="compact-control"
                                />
                            </div>
                            <div>
                                <label :for="`${fieldId}-direccion`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Calle y número</label>
                                <input :id="`${fieldId}-direccion`" v-model="form.direccion"
                                    placeholder="Calle y número"
                                    class="compact-control"
                                />
                            </div>
                            <RegionComunaSelect v-model:region="form.region" v-model:comuna="form.comuna" class="person-location" />
                            <div>
                                <label :for="`${fieldId}-sector`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Sector</label>
                                <input :id="`${fieldId}-sector`" v-model="form.sector"
                                    placeholder="Alfaro"
                                    class="compact-control"
                                />
                            </div>
                            <div>
                                <label :for="`${fieldId}-ocupacion`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Ocupación</label>
                                <input :id="`${fieldId}-ocupacion`" v-model="form.ocupacion"
                                    placeholder="Ej. Docente"
                                    class="compact-control"
                                />
                            </div>
                            <div>
                                <label :for="`${fieldId}-redSocial`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Red Social</label>
                                <input :id="`${fieldId}-redSocial`" v-model="form.redSocial"
                                    placeholder="@usuario"
                                    class="compact-control"
                                />
                            </div>
                        </div>

                        <div>
                            <EtiquetaChipsSelector v-model="selectedEtiquetaIds" />
                        </div>

                        <div>
                            <label :for="`${fieldId}-anotaciones`" class="block text-sm font-medium text-[var(--text-primary)] mb-1">Anotaciones</label>
                            <textarea :id="`${fieldId}-anotaciones`" v-model="form.anotaciones"
                                rows="2"
                                class="compact-control"
                            ></textarea>
                        </div>

                    </div>
                </details>
            </fieldset>
        </div>
        <footer class="person-form-footer">
            <div v-if="error" class="message-banner message-error" role="alert">{{ error }}</div>
            <div class="person-form-actions">
                <button type="button" @click="emit('cancel')" :disabled="loading" class="btn-secondary disabled:opacity-50">Cancelar</button>
                <button type="submit" :disabled="loading" class="btn-primary disabled:opacity-50">
                    <span v-if="loading" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" aria-hidden="true"></span>
                    {{ loading ? 'Registrando...' : 'Registrar persona' }}
                </button>
            </div>
        </footer>
    </form>
</template>

<style scoped>
.person-form { display: flex; flex-direction: column; min-height: 0; }
.person-form-scroll { overflow-y: auto; overscroll-behavior: contain; padding: 1.25rem 1.5rem; }
.person-fields { min-width: 0; padding: 0; border: 0; }
.person-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; margin-bottom: 1rem; }
.person-section-heading h3 { font-size: .85rem; font-weight: 650; }
.person-section-heading > span { font-size: .7rem; color: var(--text-muted); }
.person-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.person-grid > *, .person-extras-heading > * { min-width: 0; }
.person-location { grid-column: 1 / -1; }
.person-details { margin-top: 1.25rem; border: 1px solid var(--card-border); border-radius: .9rem; }
.person-details summary { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .85rem 1rem; cursor: pointer; list-style: none; }
.person-details summary::-webkit-details-marker { display: none; }
.person-details summary:hover { background: var(--surface-muted); border-radius: .9rem; }
.person-details summary:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; border-radius: .9rem; }
.person-details-title { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .85rem; font-weight: 600; }
.person-details-title > span { padding: .1rem .45rem; border-radius: 1rem; font-size: .65rem; font-weight: 500; color: var(--text-muted); background: var(--surface-muted); }
.person-details summary p { margin-top: .15rem; color: var(--text-muted); font-size: .75rem; }
.person-details-chevron { flex-shrink: 0; color: var(--text-muted); }
.person-details[open] .person-details-chevron { transform: rotate(180deg); }
.person-details-content { display: grid; gap: 1.25rem; padding: 1rem; border-top: 1px solid var(--card-border); }
.person-extras-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; }
.person-form-footer { flex-shrink: 0; display: grid; gap: .75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--card-border); background: var(--bg-card); }
.person-form-footer .message-banner { margin: 0; max-height: 5rem; overflow: auto; }
.person-form-actions { display: flex; justify-content: flex-end; gap: .75rem; }
.person-form-actions button { min-height: 2.75rem; }
.person-form :deep(input), .person-form :deep(select), .person-form :deep(textarea) { min-width: 0; max-width: 100%; }
@media (max-width: 600px) {
    .person-form :deep(input), .person-form :deep(select), .person-form :deep(textarea) { font-size: 1rem; }
}
@media (max-width: 480px) {
    .person-form-scroll { padding: 1rem; }
    .person-grid, .person-extras-heading { grid-template-columns: minmax(0, 1fr); }
    .person-form-footer { padding: .85rem 1rem; }
    .person-form-actions { gap: .5rem; }
    .person-form-actions button { padding-inline: .9rem; }
    .person-form-actions .btn-primary { flex: 1; }
    .person-details-content { padding: .85rem; }
}
</style>
