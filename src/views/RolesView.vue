<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import type { RolPersona } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';
import { Mail, Phone } from 'lucide-vue-next';

const tabs = [
    { id: 'beneficiarios', label: 'Beneficiarios', accent: 'emerald', description: 'Personas que reciben apoyos directos.' },
    { id: 'colaboradores', label: 'Colaboradores', accent: 'cyan', description: 'Voluntarios o aliados activos.' },
    { id: 'trabajadores', label: 'Trabajadores', accent: 'indigo', description: 'Equipo contratado por la fundación.' },
    { id: 'directivos', label: 'Directivos', accent: 'amber', description: 'Gobernanza y toma de decisiones.' }
 ] as const;

type TabId = typeof tabs[number]['id'];

const activeTab = ref<TabId>('beneficiarios');
const registros = ref<RolPersona[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const setActiveTab = (tabId: TabId) => {
    if (activeTab.value !== tabId) {
        activeTab.value = tabId;
    }
};

const loadRegistros = async () => {
    loading.value = true;
    error.value = null;
    try {
        registros.value = await apiService.getRoles(activeTab.value);
    } catch (e: any) {
        error.value = e.message || 'No se pudo cargar el directorio.';
        registros.value = [];
    } finally {
        loading.value = false;
    }
};

watch(activeTab, () => {
    loadRegistros();
});

onMounted(() => {
    loadRegistros();
});
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-sm uppercase tracking-widest text-purple-600 font-semibold">Directorio humano</p>
            <h2 class="text-3xl font-bold text-gray-900">Roles y redes de apoyo</h2>
            <p class="text-gray-600">Consulta rápidamente a las personas clave en cada rol dentro de la organización.</p>
        </header>

        <div class="bg-white rounded-xl shadow border border-gray-100">
            <div class="flex flex-wrap">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="flex-1 min-w-[160px] px-4 py-3 text-sm font-semibold transition"
                    :class="activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'"
                    @click="setActiveTab(tab.id)"
                >
                    {{ tab.label }}
                </button>
            </div>
            <div class="px-6 py-4 border-t border-gray-100 text-sm text-gray-600">
                {{ tabs.find(tab => tab.id === activeTab)?.description }}
            </div>
        </div>

        <div v-if="loading" class="text-center py-12 text-gray-500">
            Cargando información...
        </div>

        <div v-else class="space-y-4">
            <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 rounded-md p-4">
                {{ error }}
            </div>

            <div v-else-if="registros.length === 0" class="bg-white rounded-xl shadow border border-gray-100 p-6 text-center text-gray-500">
                No se encontraron registros para este rol.
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <article
                    v-for="persona in registros"
                    :key="persona.id"
                    class="border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition p-5"
                >
                    <p class="text-xs uppercase tracking-widest text-gray-400">ID {{ persona.id }}</p>
                    <h3 class="text-xl font-bold text-gray-900">{{ persona.nombres }} {{ persona.apellidos }}</h3>
                    <p class="text-sm text-gray-500">{{ formatRutForDisplay(persona.rut) }}</p>
                    <div class="mt-3 space-y-2 text-sm">
                        <p class="text-gray-600 flex items-center gap-2" v-if="persona.correo">
                            <Mail class="w-4 h-4 text-gray-500" /> {{ persona.correo }}
                        </p>
                        <p class="text-gray-600 flex items-center gap-2" v-if="persona.telefono">
                            <Phone class="w-4 h-4 text-gray-500" /> {{ persona.telefono }}
                        </p>
                        <span class="inline-flex mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                            {{ persona.rol || tabs.find(tab => tab.id === activeTab)?.label }}
                        </span>
                    </div>
                </article>
            </div>
        </div>
    </div>
</template>
