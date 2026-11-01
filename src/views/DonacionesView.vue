<script setup lang="ts">
import { ref } from 'vue';
import { HandCoins, Boxes } from 'lucide-vue-next';
import RecepcionView from './RecepcionView.vue';
import RecepcionBienesView from './RecepcionBienesView.vue';

const activeTab = ref<'pecuniaria' | 'bienes'>('pecuniaria');
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
