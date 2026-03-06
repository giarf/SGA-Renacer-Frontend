<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type Component } from 'vue';
import {
    HandCoins,
    HandHeart,
    Users,
    Home,
    ClipboardList,
    Boxes,
    Wallet,
    IdCard,
    Sun,
    Moon,
    Monitor,
    ChevronDown,
    ScrollText,
    ShoppingCart,
    Handshake,
    Building2,
    SlidersHorizontal,
    PackageSearch,
    Landmark
} from 'lucide-vue-next';
import EntidadesView from './views/EntidadesView.vue';
import DonacionesView from './views/DonacionesView.vue';
import CatalogoView from './views/CatalogoView.vue';
import CuentasView from './views/CuentasView.vue';
import FamiliasView from './views/FamiliasView.vue';
import SolicitudesView from './views/SolicitudesView.vue';
import RolesView from './views/RolesView.vue';
import LogsView from './views/LogsView.vue';
import ComprasView from './views/ComprasView.vue';
import AyudaSocialView from './views/AyudaSocialView.vue';
import ConsumoInternoView from './views/ConsumoInternoView.vue';
import AjusteBienesView from './views/AjusteBienesView.vue';
import AjustePecuniarioView from './views/AjustePecuniarioView.vue';

type ViewKey =
    | 'donaciones'
    | 'entidades'
    | 'catalogo'
    | 'cuentas'
    | 'compras'
    | 'ayudaSocial'
    | 'consumoInterno'
    | 'ajusteBienes'
    | 'ajustePecuniario'
    | 'familias'
    | 'solicitudes'
    | 'roles'
    | 'logs';

const currentView = ref<ViewKey>('donaciones');

type NavigationChild = {
    key: string;
    id: ViewKey;
    label: string;
    icon: Component;
};

type NavigationItem = {
    key: string;
    id?: ViewKey;
    label: string;
    icon: Component;
    badge?: string;
    children?: NavigationChild[];
};

const navigationGroups: { title: string; items: NavigationItem[] }[] = [
    {
        title: 'Gestionar',
        items: [
            { key: 'donaciones', id: 'donaciones', label: 'Donaciones', icon: HandCoins },
            { key: 'compras', id: 'compras', label: 'Compras', icon: ShoppingCart },
            {
                key: 'ayudasConsumos',
                label: 'Ayudas y Consumos',
                icon: HandHeart,
                children: [
                    { key: 'ayudaSocial', id: 'ayudaSocial', label: 'Ayuda Social', icon: Handshake },
                    { key: 'consumoInterno', id: 'consumoInterno', label: 'Consumo Interno', icon: Building2 }
                ]
            },
            {
                key: 'ajustes',
                label: 'Ajustes',
                icon: SlidersHorizontal,
                children: [
                    { key: 'ajusteBienes', id: 'ajusteBienes', label: 'Ajuste de Bienes', icon: PackageSearch },
                    { key: 'ajustePecuniario', id: 'ajustePecuniario', label: 'Ajuste Pecuniario', icon: Landmark }
                ]
            }
        ]
    },
    {
        title: 'Acceder',
        items: [
            { key: 'entidades', id: 'entidades', label: 'Entidades', icon: Users },
            { key: 'familias', id: 'familias', label: 'Familias', icon: Home },
            { key: 'solicitudes', id: 'solicitudes', label: 'Solicitudes', icon: ClipboardList }
        ]
    },
    {
        title: 'Inventario y Finanzas',
        items: [
            { key: 'catalogo', id: 'catalogo', label: 'Catálogo', icon: Boxes },
            { key: 'cuentas', id: 'cuentas', label: 'Cuentas', icon: Wallet, badge: 'Nuevo' },
            { key: 'roles', id: 'roles', label: 'Roles', icon: IdCard }
        ]
    },
    {
        title: 'Registros y Analisis',
        items: [
            { key: 'logs', id: 'logs', label: 'Logs', icon: ScrollText }
        ]
    }
];

type NavigationLeaf = {
    id: ViewKey;
    label: string;
    icon: Component;
    badge?: string;
    mobileLabel: string;
};

const flatNavigation = computed<NavigationLeaf[]>(() => {
    const leaves: NavigationLeaf[] = [];
    navigationGroups.forEach(group => {
        group.items.forEach(item => {
            if (item.children?.length) {
                item.children.forEach(child => {
                    leaves.push({
                        id: child.id,
                        label: child.label,
                        icon: child.icon,
                        mobileLabel: `${item.label} · ${child.label}`
                    });
                });
                return;
            }
            if (item.id) {
                leaves.push({
                    id: item.id,
                    label: item.label,
                    icon: item.icon,
                    badge: item.badge,
                    mobileLabel: item.label
                });
            }
        });
    });
    return leaves;
});

const currentViewMeta = computed(() => flatNavigation.value.find(item => item.id === currentView.value));
const loadingProgress = ref(0);
const showLoadingBar = ref(false);
let loadingInterval: number | null = null;
let loadingFinishTimeout: number | null = null;

const startLoadingBar = () => {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
    if (loadingFinishTimeout) {
        clearTimeout(loadingFinishTimeout);
        loadingFinishTimeout = null;
    }
    showLoadingBar.value = true;
    loadingProgress.value = 0;
    // Initial ramp
    loadingProgress.value = 8;
    loadingInterval = window.setInterval(() => {
        if (loadingProgress.value < 75) {
            loadingProgress.value += 7;
        }
    }, 120);
};

const finishLoadingBar = () => {
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
    loadingProgress.value = 100;
    loadingFinishTimeout = window.setTimeout(() => {
        showLoadingBar.value = false;
        loadingProgress.value = 0;
        loadingFinishTimeout = null;
    }, 250);
};

const selectView = (view: ViewKey) => {
    if (currentView.value === view) return;
    startLoadingBar();
    currentView.value = view;
    setTimeout(() => finishLoadingBar(), 500);
};

const expandedGroups = ref<Record<string, boolean>>({});
navigationGroups.forEach(group => {
    expandedGroups.value[group.title] = true;
});
const toggleGroup = (title: string) => { expandedGroups.value[title] = !expandedGroups.value[title]; };

const expandedItems = ref<Record<string, boolean>>({
    ayudasConsumos: true,
    ajustes: true
});

const toggleItem = (itemKey: string) => {
    expandedItems.value[itemKey] = !expandedItems.value[itemKey];
};

const isParentActive = (item: NavigationItem) => {
    if (!item.children?.length) return false;
    return item.children.some(child => child.id === currentView.value);
};

type ThemeOption = 'system' | 'light' | 'dark';
const theme = ref<ThemeOption>('system');
const effectiveTheme = ref<'light' | 'dark'>('light');
let mediaQuery: MediaQueryList | null = null;
const themeSequence: ThemeOption[] = ['system', 'light', 'dark'];
const themeMeta = computed(() => {
    if (theme.value === 'light') return { label: 'Claro', icon: Sun };
    if (theme.value === 'dark') return { label: 'Oscuro', icon: Moon };
    return { label: 'Sistema', icon: Monitor };
});

const applyTheme = () => {
    const prefersDark = mediaQuery?.matches ?? false;
    const finalTheme = theme.value === 'system' ? (prefersDark ? 'dark' : 'light') : theme.value;
    effectiveTheme.value = finalTheme;
    if (finalTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', applyTheme);
    applyTheme();
});

onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', applyTheme);
    if (loadingInterval) clearInterval(loadingInterval);
    if (loadingFinishTimeout) clearTimeout(loadingFinishTimeout);
});

const setTheme = (value: ThemeOption) => {
    theme.value = value;
    applyTheme();
};

const cycleTheme = () => {
    const currentIdx = themeSequence.indexOf(theme.value);
    const nextTheme = themeSequence[(currentIdx + 1) % themeSequence.length] ?? 'system';
    setTheme(nextTheme);
};

const sidebarClasses = computed(() =>
    effectiveTheme.value === 'dark'
        ? 'bg-[#1f1f24] text-slate-200 border-black/40'
        : 'bg-white text-slate-700 border-slate-200'
);

const layoutClasses = computed(() =>
    effectiveTheme.value === 'dark'
        ? 'bg-[#141417] text-slate-100'
        : 'bg-[#f8f6f3] text-slate-900'
);
</script>

<template>
    <div class="min-h-screen flex" :class="layoutClasses">
        <transition name="fade">
            <div
                v-if="showLoadingBar"
                class="fixed top-0 left-0 right-0 h-1.5 z-50"
                style="background-color: transparent"
            >
                <div
                    class="h-full rounded-r-full transition-all duration-150"
                    :style="{
                        width: loadingProgress + '%',
                        background: '#006d8f'
                    }"
                />
            </div>
        </transition>
        <!-- Sidebar -->
        <aside class="hidden lg:flex w-72 flex-col border-r" :class="sidebarClasses">
            <div class="px-6 py-6 border-b border-white/10">
                <p class="text-[10px] uppercase tracking-[0.4em] text-slate-500">Organización</p>
                <p class="text-2xl font-semibold mt-2" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                    SGA Renacer
                </p>
                <p class="text-sm mt-2" :class="effectiveTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'">
                    Panel unificado para operaciones sociales.
                </p>
            </div>
            <nav class="flex-1 overflow-y-auto px-4 py-6 space-y-6 text-sm">
                <section v-for="group in navigationGroups" :key="group.title">
                    <button
                        class="w-full flex items-center justify-between text-[11px] uppercase tracking-[0.35em] font-semibold mb-2 text-slate-500"
                        @click="toggleGroup(group.title)"
                    >
                        <span>{{ group.title }}</span>
                        <ChevronDown class="w-3 h-3 transition-transform" :class="expandedGroups[group.title] ? 'rotate-180' : ''" />
                    </button>
                    <transition name="fade">
                        <ul v-if="expandedGroups[group.title]" class="space-y-1">
                            <li v-for="item in group.items" :key="item.key">
                                <button
                                    class="w-full flex items-center gap-3 rounded-md px-3 py-2 transition"
                                    :class="(item.id && currentView === item.id) || isParentActive(item)
                                        ? 'bg-[#006d8f] text-white'
                                        : effectiveTheme === 'dark'
                                            ? 'text-slate-400 hover:text-white hover:bg-white/5'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'"
                                    @click="item.children?.length ? toggleItem(item.key) : (item.id && selectView(item.id))"
                                >
                                    <component :is="item.icon" class="w-4 h-4" :class="((item.id && currentView === item.id) || isParentActive(item)) ? 'text-white' : 'text-slate-400'" />
                                    <span class="font-medium text-sm flex-1 text-left">{{ item.label }}</span>
                                    <ChevronDown
                                        v-if="item.children?.length"
                                        class="w-3.5 h-3.5 transition-transform"
                                        :class="expandedItems[item.key] ? 'rotate-180 text-white' : ''"
                                    />
                                    <span v-if="item.badge" class="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-white/10">
                                        {{ item.badge }}
                                    </span>
                                </button>
                                <ul v-if="item.children?.length && expandedItems[item.key]" class="mt-1 ml-5 pl-4 border-l border-white/10 space-y-1">
                                    <li v-for="child in item.children" :key="child.key">
                                        <button
                                            class="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition"
                                            :class="currentView === child.id
                                                ? 'bg-[#006d8f] text-white'
                                                : effectiveTheme === 'dark'
                                                    ? 'text-slate-300 hover:text-white hover:bg-white/5'
                                                    : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'"
                                            @click="selectView(child.id)"
                                        >
                                            <component :is="child.icon" class="w-3.5 h-3.5" :class="currentView === child.id ? 'text-white' : 'text-slate-400'" />
                                            <span class="text-left">{{ child.label }}</span>
                                        </button>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </transition>
                </section>
            </nav>
        </aside>

        <div class="flex-1 flex flex-col">
            <header class="border-b border-white/10 px-6 lg:px-10 py-5 flex flex-col gap-4">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-slate-500">Panel operativo</p>
                        <h1 class="text-3xl font-bold" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                            {{ currentViewMeta?.label || 'Selecciona una vista' }}
                        </h1>
                    </div>
                    <div class="flex items-center">
                        <button
                            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition"
                            :class="effectiveTheme === 'dark'
                                ? 'border border-white/15 text-slate-200 hover:bg-white/5'
                                : 'border border-slate-200 text-slate-600 hover:bg-black/5'"
                            @click="cycleTheme"
                        >
                            <component :is="themeMeta.icon" class="w-4 h-4" />
                            {{ themeMeta.label }}
                        </button>
                    </div>
                </div>

                <div class="lg:hidden">
                    <select
                        v-model="currentView"
                        class="w-full bg-black/5 dark:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none"
                    >
                        <option v-for="item in flatNavigation" :key="item.id" :value="item.id">
                            {{ item.mobileLabel }}
                        </option>
                    </select>
                </div>
            </header>

            <main class="flex-1 overflow-y-auto">
                <section class="py-6">
                    <div v-if="currentView === 'donaciones'">
                        <DonacionesView />
                    </div>
                    <div v-else-if="currentView === 'entidades'">
                        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                            <EntidadesView />
                        </div>
                    </div>
                    <div v-else-if="currentView === 'catalogo'">
                        <CatalogoView />
                    </div>
                    <div v-else-if="currentView === 'cuentas'">
                        <CuentasView />
                    </div>
                    <div v-else-if="currentView === 'compras'">
                        <ComprasView />
                    </div>
                    <div v-else-if="currentView === 'ayudaSocial'">
                        <AyudaSocialView />
                    </div>
                    <div v-else-if="currentView === 'consumoInterno'">
                        <ConsumoInternoView />
                    </div>
                    <div v-else-if="currentView === 'ajusteBienes'">
                        <AjusteBienesView />
                    </div>
                    <div v-else-if="currentView === 'ajustePecuniario'">
                        <AjustePecuniarioView />
                    </div>
                    <div v-else-if="currentView === 'familias'">
                        <FamiliasView />
                    </div>
                    <div v-else-if="currentView === 'solicitudes'">
                        <SolicitudesView />
                    </div>
                    <div v-else-if="currentView === 'roles'">
                        <RolesView />
                    </div>
                    <div v-else-if="currentView === 'logs'">
                        <LogsView />
                    </div>
                </section>
            </main>
        </div>
    </div>
</template>
