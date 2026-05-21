<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { apiService } from '../api/apiService';
import type { Comuna, Region } from '../types';

const props = defineProps<{
    region?: string;
    comuna?: string;
}>();

const emit = defineEmits<{
    (e: 'update:region', value: string): void;
    (e: 'update:comuna', value: string): void;
}>();

const regiones = ref<Region[]>([]);
const comunas = ref<Comuna[]>([]);
const selectedRegionId = ref<number | ''>('');
const loading = ref(false);
const error = ref<string | null>(null);

const comunasFiltradas = computed(() => {
    if (!selectedRegionId.value) return [];
    return comunas.value.filter(comuna => comuna.regionId === Number(selectedRegionId.value));
});

const syncFromValues = () => {
    if (!regiones.value.length || !comunas.value.length) return;
    const regionMatch = props.region
        ? regiones.value.find(region => region.nombre.toLowerCase() === props.region?.toLowerCase())
        : null;
    const comunaMatch = props.comuna
        ? comunas.value.find(comuna => comuna.nombre.toLowerCase() === props.comuna?.toLowerCase())
        : null;

    const regionId = regionMatch?.id ?? comunaMatch?.regionId;
    if (regionId) {
        selectedRegionId.value = regionId;
    } else if (!props.region && !props.comuna) {
        selectedRegionId.value = 5;
        const valparaiso = regiones.value.find(r => r.id === 5);
        if (valparaiso) emit('update:region', valparaiso.nombre);
        const quillota = comunas.value.find(c => c.id === 50305);
        if (quillota) emit('update:comuna', quillota.nombre);
    } else {
        selectedRegionId.value = '';
    }
};

const loadUbicaciones = async () => {
    loading.value = true;
    error.value = null;
    try {
        const [regionesData, comunasData] = await Promise.all([
            apiService.getRegiones(),
            apiService.getComunas()
        ]);
        regiones.value = regionesData;
        comunas.value = comunasData;
        syncFromValues();
    } catch (e: any) {
        error.value = e.message || 'No se pudieron cargar regiones y comunas.';
    } finally {
        loading.value = false;
    }
};

const onRegionChange = () => {
    const region = regiones.value.find(item => item.id === Number(selectedRegionId.value));
    emit('update:region', region?.nombre ?? '');
    const currentComuna = comunas.value.find(item => item.nombre === props.comuna);
    if (!currentComuna || currentComuna.regionId !== Number(selectedRegionId.value)) {
        emit('update:comuna', '');
    }
};

watch(() => [props.region, props.comuna, regiones.value.length, comunas.value.length], syncFromValues);

onMounted(loadUbicaciones);
</script>

<template>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Región</label>
            <select v-model="selectedRegionId" class="compact-control" :disabled="loading" @change="onRegionChange">
                <option value="">Seleccionar región...</option>
                <option v-for="regionItem in regiones" :key="regionItem.id" :value="regionItem.id">
                    {{ regionItem.nombre }}
                </option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Comuna</label>
            <select
                :value="props.comuna || ''"
                class="compact-control"
                :disabled="loading || !selectedRegionId"
                @change="emit('update:comuna', ($event.target as HTMLSelectElement).value)"
            >
                <option value="">{{ selectedRegionId ? 'Seleccionar comuna...' : 'Selecciona una región primero' }}</option>
                <option v-if="props.comuna && !comunasFiltradas.some(comuna => comuna.nombre === props.comuna)" :value="props.comuna">
                    {{ props.comuna }}
                </option>
                <option v-for="comunaItem in comunasFiltradas" :key="comunaItem.id" :value="comunaItem.nombre">
                    {{ comunaItem.nombre }}
                </option>
            </select>
        </div>
        <p v-if="error" class="md:col-span-2 text-sm text-red-600">{{ error }}</p>
    </div>
</template>
