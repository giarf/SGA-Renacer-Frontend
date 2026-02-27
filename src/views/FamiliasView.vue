<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Familia, BeneficiarioFamilia, EntidadResumen } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import ModalCrearPersona from '../components/ModalCrearPersona.vue';
import { Plus } from 'lucide-vue-next';

const familias = ref<Familia[]>([]);
const loading = ref(true);
const selectedFamilia = ref<Familia | null>(null);
const beneficiarios = ref<BeneficiarioFamilia[]>([]);
const beneficiariosLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const showCrearPersonaModal = ref(false);
const personaModalContext = ref<'jefe' | 'beneficiario' | null>(null);

const debounce = (fn: (...args: any[]) => void, delay = 300) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 3500);
};

const loadFamilias = async () => {
    loading.value = true;
    try {
        familias.value = await apiService.getFamilias();
        if (familias.value.length && !selectedFamilia.value) {
            await selectFamilia(familias.value[0]!);
        }
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron cargar las familias.');
    } finally {
        loading.value = false;
    }
};

const selectFamilia = async (familia: Familia) => {
    selectedFamilia.value = familia;
    await loadBeneficiarios(familia.id);
};

const loadBeneficiarios = async (familiaId: number) => {
    beneficiariosLoading.value = true;
    try {
        beneficiarios.value = await apiService.getBeneficiariosFamilia(familiaId);
    } catch (e: any) {
        beneficiarios.value = [];
        showToast('error', e.message || 'No se pudieron cargar los beneficiarios.');
    } finally {
        beneficiariosLoading.value = false;
    }
};

// New family form
const jefeSeleccionado = ref<EntidadResumen | null>(null);
const jefeQuery = ref('');
const jefeResults = ref<EntidadResumen[]>([]);
const jefeLoading = ref(false);
const showJefeDropdown = ref(false);

const searchJefe = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        jefeResults.value = [];
        return;
    }
    jefeLoading.value = true;
    try {
        jefeResults.value = await apiService.buscarEntidades(query);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron buscar personas.');
    } finally {
        jefeLoading.value = false;
    }
});

const formFamilia = ref({
    nombreFamilia: '',
    puntosVulnerabilidad: 75
});

const crearFamilia = async () => {
    if (!formFamilia.value.nombreFamilia.trim()) {
        showToast('error', 'El nombre de la familia es obligatorio.');
        return;
    }
    if (!jefeSeleccionado.value) {
        showToast('error', 'Selecciona a la persona jefa de hogar.');
        return;
    }
    try {
        await apiService.crearFamilia({
            nombreFamilia: formFamilia.value.nombreFamilia.trim(),
            puntosVulnerabilidad: formFamilia.value.puntosVulnerabilidad,
            jefeHogarId: jefeSeleccionado.value.id
        });
        showToast('success', 'Familia creada con éxito.');
        formFamilia.value = { nombreFamilia: '', puntosVulnerabilidad: 75 };
        jefeSeleccionado.value = null;
        jefeQuery.value = '';
        await loadFamilias();
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo crear la familia.');
    }
};

// Add beneficiary
const nuevoBeneficiario = ref<EntidadResumen | null>(null);
const beneficiarioQuery = ref('');
const beneficiarioResults = ref<EntidadResumen[]>([]);
const beneficiarioLoadingSearch = ref(false);
const showBeneficiarioDropdown = ref(false);

const searchBeneficiario = debounce(async (query: string) => {
    if (!query || query.trim().length < 2) {
        beneficiarioResults.value = [];
        return;
    }
    beneficiarioLoadingSearch.value = true;
    try {
        beneficiarioResults.value = await apiService.buscarEntidades(query);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron buscar personas.');
    } finally {
        beneficiarioLoadingSearch.value = false;
    }
});

const agregarBeneficiario = async () => {
    if (!selectedFamilia.value) {
        showToast('error', 'Selecciona una familia primero.');
        return;
    }
    if (!nuevoBeneficiario.value) {
        showToast('error', 'Debes seleccionar a la persona beneficiaria.');
        return;
    }
    try {
        await apiService.agregarBeneficiarioFamilia(selectedFamilia.value.id, nuevoBeneficiario.value.id);
        showToast('success', 'Beneficiario agregado.');
        nuevoBeneficiario.value = null;
        beneficiarioQuery.value = '';
        await loadBeneficiarios(selectedFamilia.value.id);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo agregar al beneficiario.');
    }
};

const selectJefe = (entidad: EntidadResumen) => {
    jefeSeleccionado.value = entidad;
    jefeQuery.value = entidad.nombreCompleto;
    showJefeDropdown.value = false;
};

const selectNuevoBeneficiario = (entidad: EntidadResumen) => {
    nuevoBeneficiario.value = entidad;
    beneficiarioQuery.value = entidad.nombreCompleto;
    showBeneficiarioDropdown.value = false;
};

const abrirModalPersona = (contexto: 'jefe' | 'beneficiario') => {
    personaModalContext.value = contexto;
    showCrearPersonaModal.value = true;
};

const handlePersonaCreada = async (rut: string) => {
    showCrearPersonaModal.value = false;
    try {
        const resultados = await apiService.buscarEntidades(rut);
        const encontrada = resultados.find(e => e.identificador === rut);
        if (!encontrada) {
            showToast('error', 'Persona creada pero no fue posible seleccionarla automáticamente.');
            return;
        }

        if (personaModalContext.value === 'jefe') {
            selectJefe(encontrada);
        } else if (personaModalContext.value === 'beneficiario') {
            selectNuevoBeneficiario(encontrada);
        }
        showToast('success', 'Persona registrada y asignada.');
    } catch (e: any) {
        showToast('error', e.message || 'Error al buscar la nueva persona.');
    } finally {
        personaModalContext.value = null;
    }
};

onMounted(() => {
    loadFamilias();
});
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-sm uppercase tracking-widest text-amber-600 font-semibold">Red familiar</p>
            <h2 class="text-3xl font-bold text-gray-900">Familias y beneficiarios</h2>
            <p class="text-gray-600">Gestiona grupos familiares, identifica al jefe o jefa de hogar y suma beneficiarios vinculados.</p>
        </header>

        <div v-if="message" :class="`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`">
            {{ message.text }}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section class="lg:col-span-2 space-y-6">
                <div class="bg-white rounded-xl shadow border border-gray-100">
                    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-900">Listado de familias</h3>
                        <span v-if="loading" class="text-sm text-gray-500">Cargando...</span>
                    </div>
                    <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            v-for="fam in familias"
                            :key="fam.id"
                            class="text-left rounded-xl border p-4 transition hover:shadow"
                            :class="selectedFamilia?.id === fam.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white'"
                            @click="selectFamilia(fam)"
                        >
                            <p class="text-sm text-gray-500">ID {{ fam.id }}</p>
                            <p class="text-xl font-bold text-gray-900">{{ fam.nombreFamilia }}</p>
                            <p class="text-sm text-gray-600 mt-2">Puntos de vulnerabilidad: <strong>{{ fam.puntosVulnerabilidad }}</strong></p>
                        </button>
                        <div v-if="!loading && familias.length === 0" class="col-span-full text-center text-sm text-gray-500 py-6">
                            No hay familias registradas aún.
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow border border-gray-100 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">Beneficiarios</h3>
                            <p class="text-sm text-gray-500" v-if="selectedFamilia">Pertenece a {{ selectedFamilia.nombreFamilia }}</p>
                        </div>
                        <span v-if="beneficiariosLoading" class="text-xs text-gray-500">Actualizando...</span>
                    </div>

                    <div v-if="selectedFamilia" class="space-y-4">
                        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <p class="text-xs uppercase text-gray-500 tracking-wide">Jefe(a) de hogar</p>
                            <p class="text-lg font-semibold text-gray-900">{{ selectedFamilia.jefeHogarNombre || 'Sin información cargada' }}</p>
                        </div>

                        <div class="flex flex-wrap gap-3">
                            <div class="relative flex-1 min-w-[220px]">
                                <input
                                    v-model="beneficiarioQuery"
                                    type="text"
                                    placeholder="Agregar beneficiario (buscar por RUT o nombre)"
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    @input="searchBeneficiario(beneficiarioQuery)"
                                    @focus="showBeneficiarioDropdown = true"
                                />
                                <div
                                    v-if="showBeneficiarioDropdown && beneficiarioQuery.length >= 2"
                                    class="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow mt-1 max-h-56 overflow-y-auto"
                                >
                                    <div v-if="beneficiarioLoadingSearch" class="p-3 text-sm text-gray-500">Buscando...</div>
                                    <template v-else>
                                        <button
                                            v-for="entidad in beneficiarioResults"
                                            :key="entidad.id"
                                            type="button"
                                            class="w-full text-left px-3 py-2 hover:bg-amber-50"
                                            @click="selectNuevoBeneficiario(entidad)"
                                        >
                                            <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                        </button>
                                        <div v-if="beneficiarioResults.length === 0" class="p-3 text-center text-sm text-gray-500 space-y-2">
                                            <p>Sin resultados para "{{ beneficiarioQuery }}".</p>
                                            <button
                                                type="button"
                                                class="inline-flex items-center px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                                                @click="abrirModalPersona('beneficiario')"
                                            >
                                                + Registrar persona
                                            </button>
                                        </div>
                                    </template>
                                </div>
                            </div>
                            <button class="btn btn-primary" @click="agregarBeneficiario">
                                <Plus class="w-4 h-4" /> Agregar
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div
                                v-for="benef in beneficiarios"
                                :key="benef.id"
                                class="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
                            >
                                <p class="text-sm text-gray-500">Beneficiario #{{ benef.id }}</p>
                                <p class="text-lg font-semibold text-gray-900">{{ benef.nombres }} {{ benef.apellidos }}</p>
                                <p class="text-sm text-gray-600">{{ formatRutForDisplay(benef.rut) }}</p>
                            </div>
                            <div v-if="!beneficiariosLoading && beneficiarios.length === 0" class="col-span-full text-sm text-gray-500">
                                Esta familia aún no tiene beneficiarios asociados.
                            </div>
                        </div>
                    </div>

                    <div v-else class="text-sm text-gray-500">
                        Selecciona una familia para ver sus beneficiarios.
                    </div>
                </div>
            </section>

            <aside class="space-y-6">
                <div class="bg-white rounded-xl shadow border border-gray-100 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Crear nueva familia</h3>
                    <form class="space-y-4" @submit.prevent="crearFamilia">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre de familia *</label>
                            <input
                                v-model="formFamilia.nombreFamilia"
                                type="text"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                placeholder="Ej: Familia Soto González"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Puntos de vulnerabilidad</label>
                            <input
                                v-model.number="formFamilia.puntosVulnerabilidad"
                                type="number"
                                min="0"
                                max="100"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                        </div>
                        <div class="relative">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Jefe(a) de hogar *</label>
                            <div v-if="jefeSeleccionado" class="bg-amber-50 border border-amber-200 rounded-md px-3 py-3 flex items-center justify-between">
                                <div>
                                    <p class="font-semibold text-amber-700">{{ jefeSeleccionado.nombreCompleto }}</p>
                                    <p class="text-xs text-gray-600">{{ formatRutForDisplay(jefeSeleccionado.identificador) }}</p>
                                </div>
                                <button class="text-sm text-amber-600" type="button" @click="jefeSeleccionado = null">Cambiar</button>
                            </div>
                            <div v-else>
                                <input
                                    v-model="jefeQuery"
                                    type="text"
                                    placeholder="Busca por nombre o RUT"
                                    class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    @input="searchJefe(jefeQuery)"
                                    @focus="showJefeDropdown = true"
                                />
                                <div
                                    v-if="showJefeDropdown && jefeQuery.length >= 2"
                                    class="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow mt-1 max-h-56 overflow-y-auto"
                                >
                                    <div v-if="jefeLoading" class="p-3 text-sm text-gray-500">Buscando...</div>
                                    <template v-else>
                                        <button
                                            v-for="entidad in jefeResults"
                                            :key="entidad.id"
                                            type="button"
                                            class="w-full text-left px-3 py-2 hover:bg-amber-50"
                                            @click="selectJefe(entidad)"
                                        >
                                            <p class="font-medium text-gray-900">{{ entidad.nombreCompleto }}</p>
                                            <p class="text-xs text-gray-500">{{ formatRutForDisplay(entidad.identificador) }}</p>
                                        </button>
                                        <div v-if="jefeResults.length === 0" class="p-3 text-center text-sm text-gray-500 space-y-2">
                                            <p>Sin resultados para "{{ jefeQuery }}".</p>
                                            <button
                                                type="button"
                                                class="inline-flex items-center px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                                                @click="abrirModalPersona('jefe')"
                                            >
                                                + Registrar persona
                                            </button>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-end">
                            <button class="px-5 py-2 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700" type="submit">
                                Guardar familia
                            </button>
                        </div>
                    </form>
                </div>
            </aside>
        </div>
    </div>

    <ModalCrearPersona
        :isOpen="showCrearPersonaModal"
        @close="showCrearPersonaModal = false"
        @created="handlePersonaCreada"
    />
</template>
