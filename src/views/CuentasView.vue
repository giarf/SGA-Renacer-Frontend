<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Cuenta, CuentaPayload, CuentaMovimientosResponse } from '../types';
import { apiService } from '../api/apiService';
import { Plus, Pencil } from 'lucide-vue-next';

const cuentas = ref<Cuenta[]>([]);
const loading = ref(true);
const selectedCuenta = ref<Cuenta | null>(null);
const movimientos = ref<CuentaMovimientosResponse | null>(null);
const movimientosLoading = ref(false);
const editingId = ref<number | null>(null);
const form = ref<CuentaPayload>({
    nombre: '',
    saldoActual: 0,
    descripcion: ''
});
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

const totalSaldo = computed(() =>
    cuentas.value.reduce((sum, cuenta) => sum + (cuenta.saldoActual ?? 0), 0)
);

const cuentasCount = computed(() => cuentas.value.length);

const showToast = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    setTimeout(() => {
        if (message.value?.text === text) {
            message.value = null;
        }
    }, 4000);
};

const loadCuentas = async () => {
    loading.value = true;
    try {
        const data = await apiService.getCuentas();
        cuentas.value = data;
        if (data.length === 0) {
            selectedCuenta.value = null;
            movimientos.value = null;
            return;
        }
        if (selectedCuenta.value) {
            const stillExists = data.find(c => c.id === selectedCuenta.value?.id);
            if (stillExists) {
                await selectCuenta(stillExists);
                return;
            }
        }
        await selectCuenta(data[0]!);
    } catch (e: any) {
        showToast('error', e.message || 'No se pudieron cargar las cuentas.');
    } finally {
        loading.value = false;
    }
};

const selectCuenta = async (cuenta: Cuenta) => {
    selectedCuenta.value = cuenta;
    movimientosLoading.value = true;
    try {
        movimientos.value = await apiService.getCuentaMovimientos(cuenta.id);
    } catch (e: any) {
        movimientos.value = null;
        showToast('error', e.message || 'No se pudieron obtener los movimientos.');
    } finally {
        movimientosLoading.value = false;
    }
};

const openForm = (cuenta?: Cuenta) => {
    if (cuenta) {
        editingId.value = cuenta.id;
        form.value = {
            id: cuenta.id,
            nombre: cuenta.nombre,
            saldoActual: cuenta.saldoActual,
            descripcion: cuenta.descripcion || ''
        };
    } else {
        editingId.value = null;
        form.value = {
            nombre: '',
            saldoActual: 0,
            descripcion: ''
        };
    }
};

const resetForm = () => {
    editingId.value = null;
    form.value = {
        nombre: '',
        saldoActual: 0,
        descripcion: ''
    };
};

const saveCuenta = async () => {
    if (!form.value.nombre.trim()) {
        showToast('error', 'El nombre de la cuenta es obligatorio.');
        return;
    }

    const payload: CuentaPayload = {
        nombre: form.value.nombre.trim(),
        saldoActual: Number(form.value.saldoActual) || 0,
        descripcion: form.value.descripcion?.trim() || ''
    };

    try {
        if (editingId.value) {
            await apiService.actualizarCuenta(editingId.value, payload);
            showToast('success', 'Cuenta actualizada correctamente.');
        } else {
            await apiService.crearCuenta(payload);
            showToast('success', 'Cuenta creada correctamente.');
        }
        resetForm();
        await loadCuentas();
    } catch (e: any) {
        showToast('error', e.message || 'No se pudo guardar la cuenta.');
    }
};

const topMovimientos = computed(() => {
    if (!movimientos.value) return { ingresos: [], egresos: [] };
    return {
        ingresos: movimientos.value.ingresos.slice(0, 5),
        egresos: movimientos.value.egresos.slice(0, 5)
    };
});

onMounted(() => {
    loadCuentas();
});
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="space-y-3">
            <p class="text-sm uppercase tracking-wider text-blue-600 font-semibold">Finanzas comunitarias</p>
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 class="text-3xl font-bold text-gray-900">Cuentas y fondos internos</h2>
                    <p class="text-gray-600">Administra las cuentas operativas, monitorea saldos y revisa movimientos recientes.</p>
                </div>
                <div class="flex gap-3">
                    <button
                        class="btn btn-primary"
                        @click="resetForm()"
                    >
                        <Plus class="w-4 h-4" /> Nueva cuenta
                    </button>
                    <button
                        class="btn btn-outline"
                        :disabled="!selectedCuenta"
                        @click="selectedCuenta && openForm(selectedCuenta)"
                    >
                        <Pencil class="w-4 h-4" /> Editar seleccionada
                    </button>
                </div>
            </div>
        </header>

        <div v-if="message" :class="`rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`">
            {{ message.text }}
        </div>

        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-white rounded-xl shadow p-6 border border-gray-100">
                <p class="text-sm text-gray-500">Saldo total disponible</p>
                <p class="text-3xl font-bold text-gray-900 mt-1">{{ currency.format(totalSaldo) }}</p>
                <p class="text-xs text-gray-400 mt-3">Actualizado en tiempo real desde el backend de Renacer</p>
            </div>
            <div class="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl shadow p-6 text-white">
                <p class="text-sm uppercase tracking-wide opacity-80">Cuentas activas</p>
                <p class="text-3xl font-bold mt-1">{{ cuentasCount }}</p>
                <p class="text-sm opacity-80 mt-2">Incluye cuentas corrientes, caja chica y fondos especiales.</p>
            </div>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section class="xl:col-span-2 bg-white rounded-xl shadow border border-gray-100">
                <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-900">Cuentas configuradas</h3>
                    <span v-if="loading" class="text-sm text-gray-500">Cargando...</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-100">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo actual</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-100">
                            <tr
                                v-for="cuenta in cuentas"
                                :key="cuenta.id"
                                @click="selectCuenta(cuenta)"
                                class="cursor-pointer hover:bg-blue-50 transition"
                                :class="selectedCuenta?.id === cuenta.id ? 'bg-blue-50' : ''"
                            >
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm font-semibold text-gray-900">{{ cuenta.nombre }}</div>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600">
                                    {{ cuenta.descripcion || 'Sin descripción' }}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
                                    {{ currency.format(cuenta.saldoActual || 0) }}
                                </td>
                            </tr>
                            <tr v-if="!loading && cuentas.length === 0">
                                <td colspan="3" class="px-6 py-8 text-center text-sm text-gray-500">
                                    No hay cuentas registradas aún. Crea la primera para comenzar a trackear saldos.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <aside class="space-y-6">
                <div class="bg-white rounded-xl shadow border border-gray-100 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Detalle de cuenta</h3>
                    <div v-if="selectedCuenta" class="space-y-3">
                        <div>
                            <p class="text-sm text-gray-500">Nombre</p>
                            <p class="text-lg font-semibold text-gray-900">{{ selectedCuenta.nombre }}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Saldo disponible</p>
                            <p class="text-2xl font-bold text-blue-600">{{ currency.format(selectedCuenta.saldoActual || 0) }}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Descripción</p>
                            <p class="text-sm text-gray-700">{{ selectedCuenta.descripcion || 'Sin descripción' }}</p>
                        </div>
                    </div>
                    <div v-else class="text-sm text-gray-500">
                        Selecciona una cuenta para ver sus detalles y movimientos.
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow border border-gray-100 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-gray-900">Movimientos recientes</h3>
                        <span v-if="movimientosLoading" class="text-xs text-gray-500">Actualizando...</span>
                    </div>
                    <div v-if="selectedCuenta && movimientos">
                        <div class="grid grid-cols-1 gap-4">
                            <div>
                                <p class="text-xs uppercase tracking-wide text-green-600 font-semibold mb-2">Ingresos</p>
                                <ul class="space-y-2">
                                    <li v-for="mov in topMovimientos.ingresos" :key="`ing-${mov.id}`" class="flex justify-between text-sm">
                                        <span class="text-gray-600">{{ mov.descripcion }}</span>
                                        <span class="font-semibold text-green-600">{{ currency.format(mov.monto) }}</span>
                                    </li>
                                    <li v-if="topMovimientos.ingresos.length === 0" class="text-gray-400 text-sm">Sin registros</li>
                                </ul>
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-wide text-red-600 font-semibold mb-2">Egresos</p>
                                <ul class="space-y-2">
                                    <li v-for="mov in topMovimientos.egresos" :key="`egr-${mov.id}`" class="flex justify-between text-sm">
                                        <span class="text-gray-600">{{ mov.descripcion }}</span>
                                        <span class="font-semibold text-red-600">-{{ currency.format(mov.monto) }}</span>
                                    </li>
                                    <li v-if="topMovimientos.egresos.length === 0" class="text-gray-400 text-sm">Sin registros</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-sm text-gray-500">
                        Selecciona una cuenta para visualizar los ingresos y egresos más recientes.
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow border border-gray-100 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-xs uppercase tracking-widest text-blue-500 font-semibold">Gestión de fondos</p>
                            <h3 class="text-lg font-semibold text-gray-900">
                                {{ editingId ? 'Editar cuenta existente' : 'Crear nuevo fondo' }}
                            </h3>
                        </div>
                        <button
                            type="button"
                            class="text-sm text-blue-600 hover:text-blue-800"
                            @click="resetForm"
                        >
                            {{ editingId ? 'Cancelar edición' : 'Limpiar' }}
                        </button>
                    </div>
                    <form class="space-y-4" @submit.prevent="saveCuenta">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                            <input
                                v-model="form.nombre"
                                type="text"
                                required
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Caja chica, Banco Estado, etc."
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Saldo actual</label>
                            <input
                                v-model.number="form.saldoActual"
                                type="number"
                                min="0"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                            <textarea
                                v-model="form.descripcion"
                                rows="3"
                                class="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Notas internas para identificar la cuenta"
                            ></textarea>
                        </div>
                        <div class="flex justify-end">
                            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                                {{ editingId ? 'Guardar cambios' : 'Crear cuenta' }}
                            </button>
                        </div>
                    </form>
                </div>
            </aside>
        </div>
    </div>
</template>
