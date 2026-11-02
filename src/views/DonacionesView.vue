<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { HandCoins, Boxes } from 'lucide-vue-next';
import RecepcionView from './RecepcionView.vue';
import RecepcionBienesView from './RecepcionBienesView.vue';

type DonacionTab = 'pecuniaria' | 'bienes';

const STORAGE_KEY = 'sga.donaciones.activeTab';
const DEFAULT_TAB: DonacionTab = 'pecuniaria';

const isTab = (value: unknown): value is DonacionTab => value === 'pecuniaria' || value === 'bienes';

const firstValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const readStoredTab = (): DonacionTab | null => {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return isTab(value) ? value : null;
    } catch {
        return null;
    }
};

const writeStoredTab = (tab: DonacionTab) => {
    try {
        localStorage.setItem(STORAGE_KEY, tab);
    } catch {
        // Sin almacenamiento disponible (modo privado, bloqueado): se ignora.
    }
};

const route = useRoute();

// Prioridad: parámetro de ruta o query (?tab=bienes) > última pestaña guardada > Pecuniaria.
const tabFromRoute = (): DonacionTab | null => {
    const value = firstValue(route.params.tab) ?? firstValue(route.query.tab);
    return isTab(value) ? value : null;
};

const activeTab = ref<DonacionTab>(tabFromRoute() ?? readStoredTab() ?? DEFAULT_TAB);

watch(activeTab, writeStoredTab);

watch(
    () => [route.params.tab, route.query.tab],
    () => {
        const tab = tabFromRoute();
        if (tab) activeTab.value = tab;
    }
);
</script>

<template>
    <div class="form-page space-y-4">
        <div class="segmented" role="tablist" aria-label="Tipo de donación">
            <button
                type="button"
                role="tab"
                :aria-selected="activeTab === 'pecuniaria'"
                :class="{ 'is-active': activeTab === 'pecuniaria' }"
                @click="activeTab = 'pecuniaria'"
            >
                <HandCoins class="w-4 h-4" /> Pecuniaria
            </button>
            <button
                type="button"
                role="tab"
                :aria-selected="activeTab === 'bienes'"
                :class="{ 'is-active': activeTab === 'bienes' }"
                @click="activeTab = 'bienes'"
            >
                <Boxes class="w-4 h-4" /> En especie
            </button>
        </div>

        <div :key="activeTab" class="animate-fade-in">
            <RecepcionView v-if="activeTab === 'pecuniaria'" />
            <RecepcionBienesView v-else />
        </div>
    </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.25s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
