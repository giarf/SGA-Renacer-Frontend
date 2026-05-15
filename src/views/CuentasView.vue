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
    nombre: ''
});
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const currency = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short'
});

const parseApiDate = (value: string): Date | null => {
    if (!value) return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        return new Date(year, month, day);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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
            nombre: cuenta.nombre
        };
    } else {
        editingId.value = null;
        form.value = {
            nombre: ''
        };
    }
};

const resetForm = () => {
    editingId.value = null;
    form.value = {
        nombre: ''
    };
};

const saveCuenta = async () => {
    if (!form.value.nombre.trim()) {
        showToast('error', 'El nombre de la cuenta es obligatorio.');
        return;
    }

    const payload: CuentaPayload = {
        nombre: form.value.nombre.trim()
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

const movimientoDescripcion = (mov: { anotaciones?: string; descripcion?: string; tipoTransaccion?: string }) => {
    return mov.anotaciones || mov.descripcion || mov.tipoTransaccion || 'Movimiento';
};

const movimientoMonto = (mov: { montoTotal: number; monto?: number }) => {
    return mov.montoTotal ?? mov.monto ?? 0;
};

const movimientoFecha = (mov: { fecha: string }) => {
    const parsed = parseApiDate(mov.fecha);
    if (!parsed) return mov.fecha;
    return dateFormatter.format(parsed);
};

onMounted(() => {
    loadCuentas();
});
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <header class="space-y-3">
            <p class="eyebrow text-[var(--accent-color)]">Finanzas comunitarias</p>
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 class="text-3xl font-bold text-[var(--text-primary)]">Cuentas y fondos internos</h2>
                    <p class="text-[var(--text-muted)]">Administra las cuentas operativas, monitorea saldos y revisa movimientos recientes.</p>
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
            <div class="surface-card p-4">
                <p class="text-sm text-[var(--text-muted)]">Saldo total disponible</p>
                <p class="text-3xl font-bold text-[var(--text-primary)] mt-1">{{ currency.format(totalSaldo) }}</p>
                <p class="text-xs text-[var(--text-muted)] mt-3">Actualizado en tiempo real desde el backend de Renacer</p>
            </div>
            <div class="surface-card p-4">
                <p class="text-sm uppercase tracking-wide text-[var(--text-muted)]">Cuentas activas</p>
                <p class="text-3xl font-bold text-[var(--text-primary)] mt-1">{{ cuentasCount }}</p>
                <p class="text-sm text-[var(--text-muted)] mt-2">Incluye cuentas corrientes, caja chica y fondos especiales.</p>
            </div>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <section class="xl:col-span-2 surface-card p-0 overflow-hidden">
                <div class="px-5 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
                    <h3 class="text-base font-semibold text-[var(--text-primary)]">Cuentas configuradas</h3>
                    <span v-if="loading" class="text-sm text-[var(--text-muted)]">Cargando...</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-[var(--card-border)] table-soft">
                        <thead class="bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <tr>
                                <th class="px-4 py-3 text-left">Nombre</th>
                                <th class="px-4 py-3 text-right">Saldo actual</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)] bg-white dark:bg-[var(--bg-card)]">
                            <tr
                                v-for="cuenta in cuentas"
                                :key="cuenta.id"
                                @click="selectCuenta(cuenta)"
                                class="cursor-pointer transition hover:bg-black/5 dark:hover:bg-white/5"
                                :class="selectedCuenta?.id === cuenta.id ? 'highlighted-row ring-1 ring-[var(--accent-color)]' : ''"
                            >
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ cuenta.nombre }}</div>
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                                    {{ currency.format(cuenta.saldoActual || 0) }}
                                </td>
                            </tr>
                            <tr v-if="!loading && cuentas.length === 0">
                                <td colspan="2" class="px-4 py-8 text-center text-sm text-gray-500">
                                    No hay cuentas registradas aún. Crea la primera para comenzar a trackear saldos.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <aside class="space-y-4">
                <div class="surface-card p-4">
                    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-4">Detalle de cuenta</h3>
                    <div v-if="selectedCuenta" class="space-y-3">
                        <div>
                            <p class="text-sm text-[var(--text-muted)]">Nombre</p>
                            <p class="text-lg font-semibold text-[var(--text-primary)]">{{ selectedCuenta.nombre }}</p>
                        </div>
                        <div>
                            <p class="text-sm text-[var(--text-muted)]">Saldo disponible</p>
                            <p class="text-2xl font-bold text-[var(--text-primary)]">{{ currency.format(selectedCuenta.saldoActual || 0) }}</p>
                        </div>
                    </div>
                    <div v-else class="text-sm text-[var(--text-muted)]">
                        Selecciona una cuenta para ver sus detalles y movimientos.
                    </div>
                </div>

                <div class="surface-card p-5">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-[var(--text-primary)]">Movimientos recientes</h3>
                        <span v-if="movimientosLoading" class="text-xs text-[var(--text-muted)]">Actualizando...</span>
                    </div>
                    <div v-if="selectedCuenta && movimientos">
                        <div class="grid grid-cols-1 gap-4">
                            <div>
                                <p class="text-xs uppercase tracking-wide text-green-600 font-semibold mb-2">Ingresos</p>
                                <ul class="space-y-2">
                                    <li v-for="mov in topMovimientos.ingresos" :key="`ing-${mov.id}`" class="flex justify-between items-start gap-3 text-sm">
                                        <div>
                                            <p class="text-[var(--text-primary)]">{{ movimientoDescripcion(mov) }}</p>
                                            <p class="text-xs text-[var(--text-muted)]">{{ movimientoFecha(mov) }} · {{ mov.tipoTransaccion || 'Ingreso' }}</p>
                                        </div>
                                        <span class="font-semibold text-green-600 whitespace-nowrap">{{ currency.format(movimientoMonto(mov)) }}</span>
                                    </li>
                                    <li v-if="topMovimientos.ingresos.length === 0" class="text-[var(--text-muted)] text-sm">Sin registros</li>
                                </ul>
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-wide text-red-600 font-semibold mb-2">Egresos</p>
                                <ul class="space-y-2">
                                    <li v-for="mov in topMovimientos.egresos" :key="`egr-${mov.id}`" class="flex justify-between items-start gap-3 text-sm">
                                        <div>
                                            <p class="text-[var(--text-primary)]">{{ movimientoDescripcion(mov) }}</p>
                                            <p class="text-xs text-[var(--text-muted)]">{{ movimientoFecha(mov) }} · {{ mov.tipoTransaccion || 'Egreso' }}</p>
                                        </div>
                                        <span class="font-semibold text-red-600 whitespace-nowrap">-{{ currency.format(movimientoMonto(mov)) }}</span>
                                    </li>
                                    <li v-if="topMovimientos.egresos.length === 0" class="text-[var(--text-muted)] text-sm">Sin registros</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-sm text-[var(--text-muted)]">
                        Selecciona una cuenta para visualizar los ingresos y egresos más recientes.
                    </div>
                </div>

                <div class="surface-card p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <p class="text-xs uppercase tracking-widest text-[var(--accent-color)] font-semibold">Gestión de fondos</p>
                            <h3 class="text-lg font-semibold text-[var(--text-primary)]">
                                {{ editingId ? 'Editar cuenta existente' : 'Crear nuevo fondo' }}
                            </h3>
                        </div>
                        <button
                            type="button"
                            class="text-sm text-[var(--accent-color)] hover:text-[var(--accent-color-hover)]"
                            @click="resetForm"
                        >
                            {{ editingId ? 'Cancelar edición' : 'Limpiar' }}
                        </button>
                    </div>
                    <form class="space-y-4" @submit.prevent="saveCuenta">
                        <div>
                            <label class="block mb-1">Nombre</label>
                            <input
                                v-model="form.nombre"
                                type="text"
                                required
                                placeholder="Caja chica, Banco Estado, etc."
                            />
                        </div>
                        <div class="flex justify-end">
                            <button type="submit" class="btn btn-primary">
                                {{ editingId ? 'Guardar cambios' : 'Crear cuenta' }}
                            </button>
                        </div>
                    </form>
                </div>
            </aside>
        </div>
    </div>
</template>
