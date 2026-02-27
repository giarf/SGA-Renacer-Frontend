<script setup lang="ts">
import { ref } from 'vue';
import { HandCoins, Boxes } from 'lucide-vue-next';
import RecepcionView from './RecepcionView.vue';
import RecepcionBienesView from './RecepcionBienesView.vue';

const activeTab = ref<'pecuniaria' | 'bienes'>('pecuniaria');
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-2">
            <p class="text-xs uppercase tracking-[0.35em] text-blue-500 font-semibold">Recepción</p>
            <h2 class="text-3xl font-bold text-gray-900">Donaciones entrantes</h2>
            <p class="text-gray-600 text-sm max-w-3xl">
                Gestiona aportes monetarios y en especie con el mismo flujo, manteniendo el contexto del donante y el tipo de registro.
            </p>
        </header>

        <div class="bg-white rounded-xl shadow border border-gray-100">
            <div class="flex flex-col md:flex-row">
                <button
                    class="flex-1 px-5 py-3 text-sm font-semibold transition border-b md:border-b-0 md:border-r border-gray-100"
                    :class="activeTab === 'pecuniaria' ? 'text-blue-600 border-b-2 md:border-b-0 md:border-r-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'"
                    @click="activeTab = 'pecuniaria'"
                >
                    <span class="inline-flex items-center gap-2">
                        <HandCoins class="w-4 h-4" /> Donación Pecuniaria
                    </span>
                    <p class="text-xs text-gray-500 mt-1">Certificados, fondos internos y comentarios.</p>
                </button>
                <button
                    class="flex-1 px-5 py-3 text-sm font-semibold transition"
                    :class="activeTab === 'bienes' ? 'text-purple-600 border-b-2 md:border-b-0 border-purple-500 bg-purple-50' : 'text-gray-500 hover:bg-gray-50'"
                    @click="activeTab = 'bienes'"
                >
                    <span class="inline-flex items-center gap-2">
                        <Boxes class="w-4 h-4" /> Donación en Especie
                    </span>
                    <p class="text-xs text-gray-500 mt-1">Valorizaciones, catálogo y responsables.</p>
                </button>
            </div>

            <div class="p-6 animate-fade-in">
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
