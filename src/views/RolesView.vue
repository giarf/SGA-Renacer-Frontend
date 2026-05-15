<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import type { RolPersona } from '../types';
import { apiService } from '../api/apiService';
import { formatRutForDisplay } from '../utils/rutFormatter';

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
    <div class="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header class="space-y-2">
            <p class="eyebrow text-[var(--accent-color)]">Directorio humano</p>
            <h2 class="text-3xl font-bold text-[var(--text-primary)]">Roles y redes de apoyo</h2>
            <p class="text-[var(--text-muted)]">Consulta rápidamente a las personas clave en cada rol dentro de la organización.</p>
        </header>

        <div class="surface-card p-1">
            <div class="flex flex-wrap gap-1">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="flex-1 min-w-[160px] rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
                    :class="activeTab === tab.id ? 'bg-[var(--surface-muted)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'"
                    @click="setActiveTab(tab.id)"
                >
                    {{ tab.label }}
                </button>
            </div>
            <div class="px-4 py-3 border-t border-[var(--card-border)] text-sm text-[var(--text-muted)]">
                {{ tabs.find(tab => tab.id === activeTab)?.description }}
            </div>
        </div>

        <div v-if="loading" class="text-center py-12 text-[var(--text-muted)]">
            Cargando información...
        </div>

        <div v-else class="space-y-4">
            <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 rounded-md p-4">
                {{ error }}
            </div>

            <div v-else-if="registros.length === 0" class="surface-card p-6 text-center text-[var(--text-muted)]">
                No se encontraron registros para este rol.
            </div>

            <div v-else class="surface-card p-0 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-[var(--card-border)] table-soft">
                        <thead class="bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <tr>
                                <th class="px-4 py-3 text-left">Persona</th>
                                <th class="px-4 py-3 text-left">Contacto</th>
                                <th class="px-4 py-3 text-left">Rol</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-white dark:bg-[var(--bg-card)]">
                            <tr
                                v-for="persona in registros"
                                :key="persona.id"
                                class="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            >
                                <td class="px-4 py-3 text-sm">
                                    <p class="font-semibold text-gray-900 dark:text-gray-100">{{ persona.nombres }} {{ persona.apellidos }}</p>
                                    <p class="text-xs text-gray-500">{{ formatRutForDisplay(persona.rut) }}</p>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                    <p>{{ persona.correo || 'Sin correo' }}</p>
                                    <p class="text-xs text-gray-500">{{ persona.telefono || 'Sin teléfono' }}</p>
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <span class="inline-flex rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
                                        {{ persona.rol || tabs.find(tab => tab.id === activeTab)?.label }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>
