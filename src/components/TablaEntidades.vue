<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { EntidadResumen } from '../types';
import { apiService } from '../api/apiService';
import ModalEditar from './ModalEditar.vue';

const entidades = ref<EntidadResumen[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const filtroTipo = ref<string>(''); // '' | 'PERSONA' | 'INSTITUCION'
const selectedEntidad = ref<EntidadResumen | null>(null);
const isModalOpen = ref(false);

const fetchEntidades = async () => {
    loading.value = true;
    error.value = null;
    try {
        entidades.value = await apiService.getEntidades(filtroTipo.value || undefined);
    } catch (e: any) {
        error.value = 'Error al cargar las entidades';
    } finally {
        loading.value = false;
    }
};

const handleEdit = (entidad: EntidadResumen) => {
    selectedEntidad.value = entidad;
    isModalOpen.value = true;
};

const handleSave = async (updatedData: any) => {
    try {
        await apiService.actualizarEntidad(updatedData.id, updatedData);
        // Refresh the list to get updated data from server
        await fetchEntidades();
        isModalOpen.value = false;
    } catch (e: any) {
        alert('Error al guardar cambios: ' + (e.message || 'Error desconocido'));
    }
};

onMounted(() => {
    fetchEntidades();
});

const filtrar = (tipo: string) => {
    filtroTipo.value = tipo;
    fetchEntidades();
}
</script>

<template>
  <div class="flex flex-col">
    <!-- Filters -->
    <div class="mb-4 flex space-x-2">
        <button @click="filtrar('')" :class="`px-4 py-2 rounded ${filtroTipo === '' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`">Todos</button>
        <button @click="filtrar('PERSONA')" :class="`px-4 py-2 rounded ${filtroTipo === 'PERSONA' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`">Personas</button>
        <button @click="filtrar('INSTITUCION')" :class="`px-4 py-2 rounded ${filtroTipo === 'INSTITUCION' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'}`">Instituciones</button>
    </div>

    <div v-if="loading" class="text-center py-4">
        <span class="text-gray-500">Cargando datos...</span>
    </div>

    <div v-else-if="error" class="text-center py-4 text-red-600">
        {{ error }}
    </div>

    <div v-else class="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
      <div class="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
        <div class="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Identificador
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" class="relative px-6 py-3">
                  <span class="sr-only">Editar</span>
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="entidad in entidades" :key="entidad.id">
                <td class="px-6 py-4 whitespace-nowrap">
                   <span :class="`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entidad.tipo === 'PERSONA' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`">
                     {{ entidad.tipo }}
                   </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ entidad.identificador }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ entidad.nombreCompleto }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ entidad.email }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <a href="#" class="text-institutional-blue hover:text-blue-900" @click.prevent="handleEdit(entidad)">Editar</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <ModalEditar :isOpen="isModalOpen" :entidad="selectedEntidad" @close="isModalOpen = false" @save="handleSave" />
  </div>
</template>
