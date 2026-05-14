<script setup lang="ts">
import { ref } from 'vue';
import { HandCoins, Boxes } from 'lucide-vue-next';
import RecepcionView from './RecepcionView.vue';
import RecepcionBienesView from './RecepcionBienesView.vue';

const activeTab = ref<'pecuniaria' | 'bienes'>('pecuniaria');
</script>

<template>
    <div class="form-page space-y-4">
        <div class="form-shell">
            <div class="border-b border-[var(--card-border)] p-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                    class="w-full rounded-lg px-5 py-3 text-sm font-semibold transition text-left"
                    :class="activeTab === 'pecuniaria' ? 'bg-[var(--accent-color)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'"
                    @click="activeTab = 'pecuniaria'"
                >
                    <span class="inline-flex items-center gap-2">
                        <HandCoins class="w-4 h-4" /> Donación Pecuniaria
                    </span>
                    <p class="text-xs mt-1" :class="activeTab === 'pecuniaria' ? 'text-white/85' : 'text-gray-500'">
                        Certificados, fondos internos y comentarios.
                    </p>
                </button>
                <button
                    class="w-full rounded-lg px-5 py-3 text-sm font-semibold transition text-left"
                    :class="activeTab === 'bienes' ? 'bg-[var(--accent-color)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'"
                    @click="activeTab = 'bienes'"
                >
                    <span class="inline-flex items-center gap-2">
                        <Boxes class="w-4 h-4" /> Donación en Especie
                    </span>
                    <p class="text-xs mt-1" :class="activeTab === 'bienes' ? 'text-white/85' : 'text-gray-500'">
                        Valorizaciones, catálogo y responsables.
                    </p>
                </button>
                </div>
            </div>

            <div class="animate-fade-in">
                <template v-if="activeTab === 'pecuniaria'">
                    <RecepcionView />
                </template>
                <template v-else>
                    <RecepcionBienesView />
                </template>
            </div>
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
