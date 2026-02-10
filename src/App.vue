<script setup lang="ts">
import { ref } from 'vue';
import EntidadesView from './views/EntidadesView.vue';
import RecepcionView from './views/RecepcionView.vue';
import RecepcionBienesView from './views/RecepcionBienesView.vue';

const currentView = ref<'recepcion' | 'recepcionBienes' | 'personas'>('recepcion');
const donacionesOpen = ref(false);
const entidadesOpen = ref(false);

const toggleDonaciones = () => {
  donacionesOpen.value = !donacionesOpen.value;
  entidadesOpen.value = false; // Close other dropdown
};

const toggleEntidades = () => {
  entidadesOpen.value = !entidadesOpen.value;
  donacionesOpen.value = false; // Close other dropdown
};

const selectView = (view: typeof currentView.value) => {
  currentView.value = view;
  donacionesOpen.value = false;
  entidadesOpen.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 font-sans">
    <!-- Navbar -->
    <nav class="bg-gray-800 shadow-lg">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center">
            <span class="text-white text-xl font-bold tracking-tight">SGA Renacer</span>
            <div class="ml-10 flex items-baseline space-x-4">
              
              <!-- Dropdown: Donaciones -->
              <div class="relative">
                <button 
                  @click="toggleDonaciones"
                  :class="`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    currentView === 'recepcion' || currentView === 'recepcionBienes' 
                      ? 'bg-blue-900 text-white' 
                      : 'bg-blue-700 text-white hover:bg-blue-800'
                  }`"
                >
                  Donaciones
                  <svg 
                    class="w-4 h-4 transition-transform" 
                    :class="{ 'rotate-180': donacionesOpen }"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <!-- Dropdown Menu -->
                <div 
                  v-if="donacionesOpen"
                  class="absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
                >
                  <div class="py-1">
                    <button
                      @click="selectView('recepcion')"
                      :class="`block w-full text-left px-4 py-2 text-sm ${
                        currentView === 'recepcion' 
                          ? 'bg-blue-50 text-blue-700 font-semibold' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`"
                    >
                      💰 Recepción Pecuniaria
                    </button>
                    <button
                      @click="selectView('recepcionBienes')"
                      :class="`block w-full text-left px-4 py-2 text-sm ${
                        currentView === 'recepcionBienes' 
                          ? 'bg-blue-50 text-blue-700 font-semibold' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`"
                    >
                      📦 Recepción No Pecuniaria
                    </button>
                  </div>
                </div>
              </div>

              <!-- Dropdown: Entidades -->
              <div class="relative">
                <button 
                  @click="toggleEntidades"
                  :class="`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    currentView === 'personas'
                      ? 'bg-blue-900 text-white' 
                      : 'bg-blue-700 text-white hover:bg-blue-800'
                  }`"
                >
                  Entidades
                  <svg 
                    class="w-4 h-4 transition-transform" 
                    :class="{ 'rotate-180': entidadesOpen }"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <!-- Dropdown Menu -->
                <div 
                  v-if="entidadesOpen"
                  class="absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50"
                >
                  <div class="py-1">
                    <button
                      @click="selectView('personas')"
                      :class="`block w-full text-left px-4 py-2 text-sm ${
                        currentView === 'personas' 
                          ? 'bg-blue-50 text-blue-700 font-semibold' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`"
                    >
                      👥 Personas
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Content -->
    <main class="py-10">
      <div v-if="currentView === 'recepcion'">
        <RecepcionView />
      </div>
      <div v-else-if="currentView === 'recepcionBienes'">
        <RecepcionBienesView />
      </div>
      <div v-else-if="currentView === 'personas'">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <EntidadesView />
        </div>
      </div>
    </main>
  </div>
</template>
