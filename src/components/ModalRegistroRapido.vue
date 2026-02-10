<script setup lang="ts">
import { ref, reactive } from 'vue';
import type { RegistroPersonaPayload } from '../types';
import { apiService } from '../api/apiService';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'registrado', nuevaEntidadId: number, nombre: string, rut: string): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);

const form = reactive<RegistroPersonaPayload>({
  rut: '',
  tipoEntidad: 'Persona',
  nombres: '',
  apellidos: '',
  correo: '',
  telefono: '',
  direccion: '',
  comuna: '',
  genero: ''
});

// Format RUT for backend: sin puntos, con guion (example: 12345678-9)
const formatRutForBackend = (rut: string): string => {
    // Remove all dots and spaces, keep only numbers and hyphen
    return rut.replace(/\./g, '').replace(/\s/g, '').trim();
};

// Format RUT for display: con puntos y guion (example: 12.345.678-9)
const formatRutForDisplay = (value: string): string => {
    // Remove all non-numeric characters except hyphen
    let clean = value.replace(/[^\dkK-]/g, '');
    
    // Remove hyphens temporarily
    clean = clean.replace(/-/g, '');
    
    if (clean.length === 0) return '';
    
    // Separate number and check digit
    const numberPart = clean.slice(0, -1);
    const checkDigit = clean.slice(-1);
    
    if (numberPart.length === 0) return clean;
    
    // Add dots to number part (from right to left)
    let formatted = '';
    for (let i = numberPart.length - 1, count = 0; i >= 0; i--, count++) {
        if (count > 0 && count % 3 === 0) {
            formatted = '.' + formatted;
        }
        formatted = numberPart[i] + formatted;
    }
    
    return formatted + '-' + checkDigit;
};

const handleRutInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const formatted = formatRutForDisplay(input.value);
    form.rut = formatted;
};

const submit = async () => {
    loading.value = true;
    error.value = null;
    try {
        // Format RUT for backend (sin puntos, con guion)
        const payloadToSend = {
            ...form,
            rut: formatRutForBackend(form.rut)
        };
        const newId = await apiService.registrarPersona(payloadToSend);
        emit('registrado', newId, `${form.nombres} ${form.apellidos}`, payloadToSend.rut);
        // Reset form
        Object.assign(form, {
             rut: '', nombres: '', apellidos: '', correo: '', telefono: '', direccion: '', comuna: '', genero: ''
        });
    } catch (e: any) {
        error.value = e.message || 'Error al registrar persona';
    } finally {
        loading.value = false;
    }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="$emit('close')"></div>
      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
        
        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Registro Rápido de Persona</h3>
            
            <form @submit.prevent="submit" class="grid grid-cols-1 gap-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">RUT</label>
                        <input 
                            v-model="form.rut" 
                            @input="handleRutInput"
                            required 
                            placeholder="12.345.678-9"
                            maxlength="12"
                            class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Nombres</label>
                        <input v-model="form.nombres" required class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Apellidos</label>
                        <input v-model="form.apellidos" required class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                    </div>
                </div>
                 <div>
                    <label class="block text-sm font-medium text-gray-700">Correo</label>
                    <input type="email" v-model="form.correo" class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                </div>
                <!-- Optional fields to satisfy contract but maybe keep simple in UI? User asked for "Datos basicos". 
                     However the contract requires all fields. Let's add them but maybe compact. 
                     The curl sends everything. We must send everything. -->
                 <div class="grid grid-cols-2 gap-4">
                     <div>
                        <label class="block text-sm font-medium text-gray-700">Teléfono</label>
                        <input v-model="form.telefono" class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                     </div>
                     <div>
                        <label class="block text-sm font-medium text-gray-700">Comuna</label>
                        <input v-model="form.comuna" class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                     </div>
                 </div>
                 <div>
                    <label class="block text-sm font-medium text-gray-700">Dirección</label>
                    <input v-model="form.direccion" class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                </div>
                 <div>
                    <label class="block text-sm font-medium text-gray-700">Género</label>
                    <select v-model="form.genero" class="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md border p-2 focus:ring-institutional-blue focus:border-institutional-blue">
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>
            </form>

            <div v-if="error" class="mt-2 text-red-600 text-sm">{{ error }}</div>
        </div>

        <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-institutional-blue text-base font-medium text-white hover:bg-blue-800 sm:ml-3 sm:w-auto sm:text-sm" @click="submit" :disabled="loading">
            {{ loading ? 'Guardando...' : 'Registrar Persona' }}
          </button>
          <button type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" @click="$emit('close')">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
