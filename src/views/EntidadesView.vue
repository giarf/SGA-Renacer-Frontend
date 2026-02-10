<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import type { EntidadResumen, PersonaEditPayload, RegistrarPersonaPayload } from '../types';
import { apiService } from '../api/apiService';
import PhoneInput from '../components/PhoneInput.vue';
import { formatRutForDisplay, formatRutForBackend } from '../utils/rutFormatter';

const entidades = ref<EntidadResumen[]>([]);
const loading = ref(true);
const filterTipo = ref<'Todos' | 'Persona' | 'Institucion'>('Todos');
const searchQuery = ref('');

// Inline editing state
const editingId = ref<number | null>(null);
const editForm = ref<PersonaEditPayload>({
    id: 0,
    rut: '',
    tipoEntidad: 'Persona',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    nombres: '',
    apellidos: '',
    genero: ''
});
const saving = ref(false);
const message = ref<{type: 'success' | 'error', text: string} | null>(null);

// Modal state for creating new person
const showModal = ref(false);
const newPersonForm = ref<RegistrarPersonaPayload>({
    rut: '',
    tipoEntidad: 'Persona',
    telefono: '',
    correo: '',
    direccion: '',
    comuna: '',
    nombres: '',
    apellidos: '',
    genero: ''
});

const fetchEntidades = async () => {
    loading.value = true;
    try {
        const typeParam = filterTipo.value === 'Todos' ? undefined : filterTipo.value;
        const entidadesList = await apiService.getEntidades(typeParam);
        
        // Load detailed data for each Persona to get nombres and apellidos separately
        const entidadesConDetalles = await Promise.all(
            entidadesList.map(async (entidad) => {
                if (entidad.tipoEntidad === 'Persona') {
                    try {
                        const response = await fetch(`http://localhost:8080/api/personas?id=${entidad.id}`);
                        if (response.ok) {
                            const personaData = await response.json();
                            entidad.nombres = personaData.nombres;
                            entidad.apellidos = personaData.apellidos;
                        }
                    } catch (e) {
                        console.error(`Error loading details for persona ${entidad.id}:`, e);
                    }
                }
                return entidad;
            })
        );
        
        entidades.value = entidadesConDetalles;
    } catch (e) {
        console.error(e);
    } finally {
        loading.value = false;
    }
};

const filteredEntidades = computed(() => {
    let result = entidades.value;
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter(e => 
            e.nombreCompleto.toLowerCase().includes(q) || 
            e.identificador.toLowerCase().includes(q)
        );
    }
    return result;
});

const startEdit = async (entidad: EntidadResumen) => {
    // Fetch full persona data from API
    try {
        const response = await fetch(`http://localhost:8080/api/personas?id=${entidad.id}`);
        if (!response.ok) throw new Error('Error fetching persona');
        const personaData = await response.json();
        
        // Update the entidad object with detailed nombres/apellidos from API
        entidad.nombres = personaData.nombres;
        entidad.apellidos = personaData.apellidos;
        
        editingId.value = entidad.id;
        editForm.value = {
            id: personaData.id,
            rut: personaData.rut,
            tipoEntidad: 'Persona',
            telefono: personaData.telefono || '',
            correo: personaData.correo || '',
            direccion: personaData.direccion || '',
            comuna: personaData.comuna || '',
            nombres: personaData.nombres || '',
            apellidos: personaData.apellidos || '',
            genero: personaData.genero || ''
        };
    } catch (e) {
        console.error(e);
        message.value = { type: 'error', text: 'Error al cargar datos de la persona' };
    }
};

const saveEdit = async () => {
    saving.value = true;
    message.value = null;
    try {
        await apiService.editarPersona(editForm.value);
        
        // Update local data
        await fetchEntidades();
        
        message.value = { type: 'success', text: '✅ Persona actualizada exitosamente' };
        editingId.value = null;
        
        // Clear success message after 3 seconds
        setTimeout(() => {
            message.value = null;
        }, 3000);
    } catch (e: any) {
        message.value = { type: 'error', text: `❌ Error al guardar: ${e.message}` };
    } finally {
        saving.value = false;
    }
};

const cancelEdit = () => {
    editingId.value = null;
    message.value = null;
};

const resetNewPersonForm = () => {
    newPersonForm.value = {
        rut: '',
        tipoEntidad: 'Persona',
        telefono: '',
        correo: '',
        direccion: '',
        comuna: '',
        nombres: '',
        apellidos: '',
        genero: ''
    };
};

// Format RUT: 12.345.678-9
const formatRut = (value: string) => {
    // Remove all non-alphanumeric characters
    const clean = value.replace(/[^0-9kK]/g, '');
    
    if (clean.length === 0) return '';
    
    // Separate body and verifier digit
    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1).toUpperCase();
    
    // Format body with dots
    const formattedBody = body.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    
    // Return formatted RUT
    return formattedBody ? `${formattedBody}-${verifier}` : verifier;
};

const handleRutInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const cursorPosition = input.selectionStart || 0;
    const oldValue = input.value;
    const formatted = formatRut(input.value);
    
    newPersonForm.value.rut = formatted;
    
    // Adjust cursor position after formatting
    setTimeout(() => {
        const diff = formatted.length - oldValue.length;
        input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
    }, 0);
};

const createPerson = async () => {
    try {
        // Format RUT for backend (remove dots, keep hyphen)
        const payloadToSend = {
            ...newPersonForm.value,
            rut: formatRutForBackend(newPersonForm.value.rut)
        };
        
        await apiService.registrarPersonaNueva(payloadToSend);
        showModal.value = false;
        resetNewPersonForm();
        await fetchEntidades();
        message.value = { type: 'success', text: '✅ Persona creada exitosamente' };
        setTimeout(() => { message.value = null; }, 3000);
    } catch (e: any) {
        message.value = { type: 'error', text: `❌ Error al crear: ${e.message}` };
    }
};

const closeModal = () => {
    showModal.value = false;
    resetNewPersonForm();
};

watch(filterTipo, () => {
    fetchEntidades();
});

onMounted(fetchEntidades);
</script>

<template>
    <div class="px-4 py-6 sm:px-0">
        <!-- Success/Error Message -->
        <div v-if="message" :class="`mb-4 p-4 rounded-md ${ message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`">
            {{ message.text }}
        </div>

        <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <h2 class="text-2xl font-bold text-gray-900">Directorio de Entidades</h2>
            
            <div class="flex space-x-2 items-center">
                <button 
                    @click="showModal = true"
                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2"
                >
                    <span>+</span> Nueva Persona
                </button>
                <select v-model="filterTipo" class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border">
                    <option value="Todos">Todos</option>
                    <option value="Persona">Personas</option>
                    <option value="Institucion">Instituciones</option>
                </select>
                <input v-model="searchQuery" placeholder="Buscar por Nombre o RUT..." class="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-64 sm:text-sm border-gray-300 rounded-md border p-2">
            </div>
        </div>

        <div class="bg-white shadow overflow-x-auto border-b border-gray-200 sm:rounded-lg">
             <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RUT</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombres</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Apellidos</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirección</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comuna</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Género</th>
                        <th class="relative px-6 py-3"><span class="sr-only">Acciones</span></th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-if="loading"><td colspan="10" class="px-6 py-4 text-center">Cargando...</td></tr>
                    <tr v-else v-for="entidad in filteredEntidades" :key="entidad.id" :class="{ 'bg-blue-50': editingId === entidad.id }">
                        <!-- RUT (non-editable) -->
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {{ formatRutForDisplay(entidad.identificador) }}
                        </td>
                        
                        <!-- Nombres (editable for Persona) -->
                        <td class="px-6 py-4 text-sm text-gray-900">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.nombres"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="Nombres"
                            />
                            <span v-else>{{ entidad.nombres || '-' }}</span>
                        </td>
                        
                        <!-- Apellidos (editable for Persona) -->
                        <td class="px-6 py-4 text-sm text-gray-900">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.apellidos"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="Apellidos"
                            />
                            <span v-else>{{ entidad.apellidos || '-' }}</span>
                        </td>
                        
                        <!-- Email (editable) -->
                        <td class="px-6 py-4 text-sm text-gray-500">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.correo"
                                type="email"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="email@ejemplo.com"
                            />
                            <span v-else>{{ entidad.correo || entidad.email || '-' }}</span>
                        </td>
                        
                        <!-- Teléfono (editable) -->
                        <td class="px-6 py-4 text-sm text-gray-500">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.telefono"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="+56912345678"
                            />
                            <span v-else>{{ entidad.telefono || '-' }}</span>
                        </td>
                        
                        <!-- Dirección (editable) -->
                        <td class="px-6 py-4 text-sm text-gray-500">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.direccion"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="Dirección"
                            />
                            <span v-else>{{ entidad.direccion || '-' }}</span>
                        </td>
                        
                        <!-- Comuna (editable) -->
                        <td class="px-6 py-4 text-sm text-gray-500">
                            <input 
                                v-if="editingId === entidad.id"
                                v-model="editForm.comuna"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                                placeholder="Comuna"
                            />
                            <span v-else>{{ entidad.comuna || '-' }}</span>
                        </td>
                        
                        <!-- Género (editable with dropdown) -->
                        <td class="px-6 py-4 text-sm text-gray-500">
                            <select 
                                v-if="editingId === entidad.id"
                                v-model="editForm.genero"
                                class="w-full px-2 py-1 border border-blue-400 rounded focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Masculino">Masculino</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Otro">Otro</option>
                            </select>
                            <span v-else>{{ entidad.genero || '-' }}</span>
                        </td>
                        
                        <!-- Actions -->
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div v-if="editingId === entidad.id" class="flex gap-2 justify-end">
                                <button 
                                    @click="saveEdit" 
                                    :disabled="saving"
                                    class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold"
                                >
                                    {{ saving ? '⏳' : '✅ Guardar' }}
                                </button>
                                <button 
                                    @click="cancelEdit"
                                    :disabled="saving"
                                    class="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold"
                                >
                                    ❌ Cancelar
                                </button>
                            </div>
                            <button 
                                v-else-if="entidad.tipoEntidad === 'Persona'"
                                @click="startEdit(entidad)" 
                                class="text-blue-600 hover:text-blue-800 font-semibold"
                            >
                                ✏️ Editar
                            </button>
                            <span v-else class="text-gray-400">-</span>
                        </td>
                    </tr>
                </tbody>
              </table>
        </div>

        <!-- Modal for Creating New Person -->
        <div v-if="showModal" class="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
            <div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-2xl font-bold text-gray-900">Nueva Persona</h3>
                    <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-2xl">
                        ×
                    </button>
                </div>

                <form @submit.prevent="createPerson" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- RUT -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">RUT *</label>
                            <input 
                                v-model="newPersonForm.rut" 
                                @input="handleRutInput"
                                required
                                placeholder="12.345.678-9"
                                maxlength="12"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <!-- Nombres -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Nombres *</label>
                            <input 
                                v-model="newPersonForm.nombres" 
                                required
                                placeholder="María"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <!-- Apellidos -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Apellidos *</label>
                            <input 
                                v-model="newPersonForm.apellidos" 
                                required
                                placeholder="González López"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <!-- Género -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Género *</label>
                            <select 
                                v-model="newPersonForm.genero" 
                                required
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Seleccionar...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>

                        <!-- Email -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                            <input 
                                v-model="newPersonForm.correo" 
                                type="email"
                                required
                                placeholder="maria@example.com"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <!-- Teléfono -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                            <PhoneInput 
                                v-model="newPersonForm.telefono" 
                                :required="true"
                            />
                        </div>

                        <!-- Dirección -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
                            <input 
                                v-model="newPersonForm.direccion" 
                                required
                                placeholder="Av. Principal 456"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <!-- Comuna -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Comuna *</label>
                            <input 
                                v-model="newPersonForm.comuna" 
                                required
                                placeholder="Quillota"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button 
                            type="button"
                            @click="closeModal"
                            class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
                        >
                            Registrar Persona
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>
