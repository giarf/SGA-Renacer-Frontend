<script setup lang="ts">
import { ref, watch } from 'vue';
import type { EntidadResumen } from '../types';

const props = defineProps<{
  isOpen: boolean;
  entidad: EntidadResumen | null;
}>();

const emit = defineEmits<{(e: 'close'): void; (e: 'save', entidad: EntidadResumen): void;}>();

const formData = ref<EntidadResumen>({} as EntidadResumen);

watch(() => props.entidad, (newVal) => {
  if (newVal) {
    formData.value = { ...newVal };
  }
});

const save = () => {
  emit('save', formData.value);
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="$emit('close')"></div>

      <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="sm:flex sm:items-start">
            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                Editar Entidad: {{ formData.nombreCompleto }}
              </h3>
              <div class="mt-4 grid grid-cols-1 gap-y-4">
                <div v-if="formData.tipoEntidad === 'Persona'">
                  <label for="nombres" class="block text-sm font-medium text-gray-700">Nombres</label>
                  <input type="text" id="nombres" v-model="formData.nombres" class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>
                <div v-if="formData.tipoEntidad === 'Persona'">
                  <label for="apellidos" class="block text-sm font-medium text-gray-700">Apellidos</label>
                  <input type="text" id="apellidos" v-model="formData.apellidos" class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>
                <div v-if="formData.tipoEntidad === 'Institucion'">
                  <label for="nombreCompleto" class="block text-sm font-medium text-gray-700">Nombre</label>
                  <input type="text" id="nombreCompleto" v-model="formData.nombreCompleto" class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>
                <div>
                    <label for="correo" class="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" id="correo" v-model="formData.correo" class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>
                 <div>
                    <label for="telefono" class="block text-sm font-medium text-gray-700">Teléfono</label>
                    <input type="text" id="telefono" v-model="formData.telefono" class="mt-1 focus:ring-institutional-blue focus:border-institutional-blue block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2 border">
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-institutional-blue text-base font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-institutional-blue sm:ml-3 sm:w-auto sm:text-sm" @click="save">
            Guardar
          </button>
          <button type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" @click="$emit('close')">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
