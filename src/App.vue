<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import {
    Boxes,
    Building2,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    ClipboardList,
    HandCoins,
    HandHeart,
    Handshake,
    Home,
    IdCard,
    Landmark,
    LogOut,
    Menu,
    Monitor,
    Moon,
    PackageSearch,
    ScrollText,
    ShoppingCart,
    SlidersHorizontal,
    Sun,
    Users,
    UserCog,
    Wallet
} from 'lucide-vue-next';
import { authService, hasAnyGroup } from './auth/authService';
import { ADMIN_GROUPS, DAILY_OPERATION_GROUPS } from './auth/permissions';

type NavigationChild = {
    key: string;
    to: string;
    label: string;
    helper: string;
    icon: Component;
    requiredGroups: readonly string[];
};

type NavigationItem = {
    key: string;
    to?: string;
    label: string;
    helper: string;
    icon: Component;
    badge?: string;
    requiredGroups?: readonly string[];
    children?: NavigationChild[];
};

type NavigationLeaf = {
    key: string;
    to: string;
    label: string;
    helper: string;
    icon: Component;
    badge?: string;
    mobileLabel: string;
    requiredGroups: readonly string[];
};

const route = useRoute();
const router = useRouter();

const navigationGroups: { title: string; items: NavigationItem[] }[] = [
    {
        title: 'Operación diaria',
        items: [
            { key: 'donaciones', to: '/donaciones', label: 'Donaciones', helper: 'Registrar aportes monetarios o en especie', icon: HandCoins, requiredGroups: DAILY_OPERATION_GROUPS },
            { key: 'compras', to: '/compras', label: 'Compras', helper: 'Ingresar compras y boletas', icon: ShoppingCart, requiredGroups: DAILY_OPERATION_GROUPS },
            {
                key: 'ayudasConsumos',
                label: 'Entregas y consumos',
                helper: 'Salida de recursos para personas o uso interno',
                icon: HandHeart,
                children: [
                    { key: 'ayudaSocial', to: '/ayuda-social', label: 'Ayuda social', helper: 'Entregar recursos a beneficiarios', icon: Handshake, requiredGroups: DAILY_OPERATION_GROUPS },
                    { key: 'consumoInterno', to: '/consumo-interno', label: 'Consumo interno', helper: 'Registrar uso interno de recursos', icon: Building2, requiredGroups: DAILY_OPERATION_GROUPS }
                ]
            },
            {
                key: 'ajustes',
                label: 'Ajustes',
                helper: 'Corregir inventario o saldos',
                icon: SlidersHorizontal,
                children: [
                    { key: 'ajusteBienes', to: '/ajustes/bienes', label: 'Ajuste de bienes', helper: 'Ajustar stock físico', icon: PackageSearch, requiredGroups: DAILY_OPERATION_GROUPS },
                    { key: 'ajustePecuniario', to: '/ajustes/pecuniario', label: 'Ajuste pecuniario', helper: 'Ajustar fondos o cuentas', icon: Landmark, requiredGroups: DAILY_OPERATION_GROUPS }
                ]
            }
        ]
    },
    {
        title: 'Personas y atención',
        items: [
            { key: 'entidades', to: '/entidades', label: 'Entidades', helper: 'Personas e instituciones', icon: Users, requiredGroups: ADMIN_GROUPS },
            { key: 'familias', to: '/familias', label: 'Familias', helper: 'Grupos familiares y beneficiarios', icon: Home, requiredGroups: ADMIN_GROUPS },
            { key: 'solicitudes', to: '/solicitudes', label: 'Solicitudes', helper: 'Requerimientos de programas', icon: ClipboardList, requiredGroups: ADMIN_GROUPS }
        ]
    },
    {
        title: 'Inventario y finanzas',
        items: [
            { key: 'catalogo', to: '/catalogo', label: 'Catálogo', helper: 'Ítems, stock y valorización', icon: Boxes, requiredGroups: ADMIN_GROUPS },
            { key: 'cuentas', to: '/cuentas', label: 'Cuentas', helper: 'Fondos internos y movimientos', icon: Wallet, badge: 'Nuevo', requiredGroups: ADMIN_GROUPS },
            { key: 'roles', to: '/roles', label: 'Roles', helper: 'Directorio por rol', icon: IdCard, requiredGroups: ADMIN_GROUPS }
        ]
    },
    {
        title: 'Seguimiento',
        items: [
            { key: 'usuarios', to: '/usuarios', label: 'Usuarios', helper: 'Crear accesos y permisos Authentik', icon: UserCog, requiredGroups: ADMIN_GROUPS },
            { key: 'logs', to: '/logs', label: 'Logs', helper: 'Historial y reportes', icon: ScrollText, requiredGroups: ADMIN_GROUPS }
        ]
    }
];

const filteredNavigationGroups = computed(() =>
    navigationGroups
        .map(group => ({
            ...group,
            items: group.items
                .map(item => {
                    if (item.children?.length) {
                        const children = item.children.filter(child => hasAnyGroup(child.requiredGroups));
                        return children.length ? { ...item, children } : null;
                    }
                    return hasAnyGroup(item.requiredGroups ?? []) ? item : null;
                })
                .filter((item): item is NavigationItem => Boolean(item))
        }))
        .filter(group => group.items.length > 0)
);

const flatNavigation = computed<NavigationLeaf[]>(() => {
    const leaves: NavigationLeaf[] = [];
    filteredNavigationGroups.value.forEach(group => {
        group.items.forEach(item => {
            if (item.children?.length) {
                item.children.forEach(child => {
                    leaves.push({
                        ...child,
                        mobileLabel: `${item.label} · ${child.label}`
                    });
                });
                return;
            }
            if (item.to) {
                leaves.push({
                    key: item.key,
                    to: item.to,
                    label: item.label,
                    helper: item.helper,
                    icon: item.icon,
                    badge: item.badge,
                    mobileLabel: item.label,
                    requiredGroups: item.requiredGroups ?? []
                });
            }
        });
    });
    return leaves;
});

const currentViewMeta = computed(() => {
    const exact = flatNavigation.value.find(item => item.to === route.path);
    return exact ?? flatNavigation.value.find(item => route.path.startsWith(item.to));
});

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

watch(
    () => route.fullPath,
    () => {
        startLoadingBar();
        window.setTimeout(() => finishLoadingBar(), 320);
    }
);

const expandedGroups = ref<Record<string, boolean>>({});
navigationGroups.forEach(group => {
    expandedGroups.value[group.title] = true;
});

const toggleGroup = (title: string) => {
    if (isSidebarCollapsed.value) return;
    expandedGroups.value[title] = !expandedGroups.value[title];
};

const expandedItems = ref<Record<string, boolean>>({
    ayudasConsumos: true,
    ajustes: true
});

const toggleItem = (itemKey: string) => {
    if (isSidebarCollapsed.value) return;
    expandedItems.value[itemKey] = !expandedItems.value[itemKey];
};

const isItemActive = (item: { to?: string }) => Boolean(item.to && route.path === item.to);
const isParentActive = (item: NavigationItem) => Boolean(item.children?.some(child => route.path === child.to));

const isSidebarCollapsed = ref(false);
const toggleSidebar = () => {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
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
    document.documentElement.classList.toggle('dark', finalTheme === 'dark');
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

const navigateFromMobile = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    if (target.value && target.value !== route.path) {
        router.push(target.value);
    }
};

const logout = () => {
    authService.logout();
};
</script>

<template>
    <RouterView v-if="route.meta.public" />
    <div v-else class="min-h-screen flex" :class="layoutClasses">
        <transition name="fade">
            <div v-if="showLoadingBar" class="fixed top-0 left-0 right-0 h-1.5 z-50">
                <div
                    class="h-full rounded-r-full transition-all duration-150"
                    :style="{ width: loadingProgress + '%', background: 'var(--accent-color)' }"
                />
            </div>
        </transition>

        <aside
            class="hidden lg:flex shrink-0 flex-col border-r transition-[width] duration-300"
            :class="[sidebarClasses, isSidebarCollapsed ? 'w-20' : 'w-72']"
        >
            <div class="border-b border-white/10" :class="isSidebarCollapsed ? 'px-3 py-5' : 'px-6 py-6'">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0" :class="isSidebarCollapsed ? 'sr-only' : ''">
                        <p class="text-[10px] uppercase tracking-[0.4em] text-slate-500">Organización</p>
                        <p class="text-2xl font-semibold mt-2" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                            SGA Renacer
                        </p>
                        <p class="text-sm mt-2" :class="effectiveTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'">
                            Panel unificado para operaciones sociales.
                        </p>
                    </div>
                    <button
                        type="button"
                        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition"
                        :class="effectiveTheme === 'dark' ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-black/5'"
                        :aria-label="isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'"
                        @click="toggleSidebar"
                    >
                        <ChevronsRight v-if="isSidebarCollapsed" class="w-4 h-4" />
                        <ChevronsLeft v-else class="w-4 h-4" />
                    </button>
                </div>
            </div>

            <nav v-if="isSidebarCollapsed" class="flex-1 px-3 py-5 space-y-2 text-sm" aria-label="Navegación compacta">
                <RouterLink
                    v-for="item in flatNavigation"
                    :key="item.key"
                    :to="item.to"
                    class="group relative flex h-12 w-12 items-center justify-center rounded-2xl transition"
                    :class="isItemActive(item)
                        ? 'bg-[#006d8f] text-white shadow-sm'
                        : effectiveTheme === 'dark'
                            ? 'text-slate-300 hover:text-white hover:bg-white/5'
                            : 'text-slate-600 hover:text-slate-950 hover:bg-black/5'"
                    :aria-label="item.label"
                >
                    <component :is="item.icon" class="w-5 h-5" />
                    <span
                        class="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] px-3 py-2 text-left text-xs text-[var(--text-primary)] opacity-0 shadow-xl transition group-hover:opacity-100"
                    >
                        <strong class="block text-sm">{{ item.label }}</strong>
                        <span class="text-[var(--text-muted)]">{{ item.helper }}</span>
                    </span>
                </RouterLink>
            </nav>

            <nav v-else class="flex-1 overflow-y-auto px-4 py-6 space-y-6 text-sm" aria-label="Navegación principal">
                <section v-for="group in filteredNavigationGroups" :key="group.title">
                    <button
                        type="button"
                        class="w-full flex items-center justify-between text-[11px] uppercase tracking-[0.35em] font-semibold mb-2 text-slate-500"
                        @click="toggleGroup(group.title)"
                    >
                        <span>{{ group.title }}</span>
                        <ChevronDown class="w-3 h-3 transition-transform" :class="expandedGroups[group.title] ? 'rotate-180' : ''" />
                    </button>
                    <transition name="fade">
                        <ul v-if="expandedGroups[group.title]" class="space-y-1">
                            <li v-for="item in group.items" :key="item.key">
                                <RouterLink
                                    v-if="item.to"
                                    :to="item.to"
                                    class="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
                                    :class="isItemActive(item)
                                        ? 'bg-[#006d8f] text-white shadow-sm'
                                        : effectiveTheme === 'dark'
                                            ? 'text-slate-400 hover:text-white hover:bg-white/5'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'"
                                >
                                    <component :is="item.icon" class="w-4 h-4" :class="isItemActive(item) ? 'text-white' : 'text-slate-400'" />
                                    <span class="min-w-0 flex-1 text-left">
                                        <span class="block font-medium text-sm">{{ item.label }}</span>
                                        <span class="block truncate text-xs opacity-70">{{ item.helper }}</span>
                                    </span>
                                    <span v-if="item.badge" class="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-white/10">
                                        {{ item.badge }}
                                    </span>
                                </RouterLink>

                                <template v-else>
                                    <button
                                        type="button"
                                        class="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
                                        :class="isParentActive(item)
                                            ? 'bg-[#006d8f] text-white shadow-sm'
                                            : effectiveTheme === 'dark'
                                                ? 'text-slate-400 hover:text-white hover:bg-white/5'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'"
                                        @click="toggleItem(item.key)"
                                    >
                                        <component :is="item.icon" class="w-4 h-4" :class="isParentActive(item) ? 'text-white' : 'text-slate-400'" />
                                        <span class="min-w-0 flex-1 text-left">
                                            <span class="block font-medium text-sm">{{ item.label }}</span>
                                            <span class="block truncate text-xs opacity-70">{{ item.helper }}</span>
                                        </span>
                                        <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="expandedItems[item.key] ? 'rotate-180' : ''" />
                                    </button>
                                    <ul v-if="item.children?.length && expandedItems[item.key]" class="mt-1 ml-5 pl-4 border-l border-white/10 space-y-1">
                                        <li v-for="child in item.children" :key="child.key">
                                            <RouterLink
                                                :to="child.to"
                                                class="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
                                                :class="isItemActive(child)
                                                    ? 'bg-[#006d8f] text-white'
                                                    : effectiveTheme === 'dark'
                                                        ? 'text-slate-300 hover:text-white hover:bg-white/5'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'"
                                            >
                                                <component :is="child.icon" class="w-3.5 h-3.5" :class="isItemActive(child) ? 'text-white' : 'text-slate-400'" />
                                                <span class="min-w-0 text-left">
                                                    <span class="block">{{ child.label }}</span>
                                                    <span class="block truncate text-xs opacity-70">{{ child.helper }}</span>
                                                </span>
                                            </RouterLink>
                                        </li>
                                    </ul>
                                </template>
                            </li>
                        </ul>
                    </transition>
                </section>
            </nav>
        </aside>

        <div class="min-w-0 flex-1 flex flex-col">
            <header class="border-b border-white/10 px-6 lg:px-10 py-5 flex flex-col gap-4">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <p class="text-xs uppercase tracking-[0.35em] text-slate-500">Panel operativo</p>
                        <h1 class="text-3xl font-bold" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                            {{ currentViewMeta?.label || route.meta.label || 'SGA Renacer' }}
                        </h1>
                        <p class="mt-1 text-sm text-[var(--text-muted)]">
                            {{ currentViewMeta?.helper || 'Accede directo al flujo que necesitas realizar.' }}
                        </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="hidden sm:block text-right mr-2">
                            <p class="text-sm font-medium" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                                {{ authService.displayName }}
                            </p>
                            <p class="text-xs text-[var(--text-muted)]">Authentik</p>
                        </div>
                        <button
                            type="button"
                            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition"
                            :class="effectiveTheme === 'dark'
                                ? 'border border-white/15 text-slate-200 hover:bg-white/5'
                                : 'border border-slate-200 text-slate-600 hover:bg-black/5'"
                            @click="cycleTheme"
                        >
                            <component :is="themeMeta.icon" class="w-4 h-4" />
                            {{ themeMeta.label }}
                        </button>
                        <button
                            type="button"
                            class="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition"
                            :class="effectiveTheme === 'dark'
                                ? 'border border-white/15 text-slate-200 hover:bg-white/5'
                                : 'border border-slate-200 text-slate-600 hover:bg-black/5'"
                            @click="logout"
                        >
                            <LogOut class="w-4 h-4" />
                            Salir
                        </button>
                    </div>
                </div>

                <div class="lg:hidden grid grid-cols-[auto,1fr] gap-3 items-center">
                    <div class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)]">
                        <Menu class="w-4 h-4" />
                    </div>
                    <select
                        :value="route.path"
                        class="w-full bg-black/5 dark:bg-white/10 border border-white/10 rounded-2xl px-3 py-2 text-sm focus:outline-none"
                        aria-label="Cambiar sección"
                        @change="navigateFromMobile"
                    >
                        <option v-for="item in flatNavigation" :key="item.key" :value="item.to">
                            {{ item.mobileLabel }}
                        </option>
                    </select>
                </div>
            </header>

            <main class="flex-1 overflow-y-auto">
                <section class="py-6">
                    <RouterView v-slot="{ Component: RouteComponent }">
                        <transition name="route-fade" mode="out-in">
                            <div :key="route.fullPath">
                                <div v-if="route.path === '/entidades'" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                                    <component :is="RouteComponent" />
                                </div>
                                <component v-else :is="RouteComponent" />
                            </div>
                        </transition>
                    </RouterView>
                </section>
            </main>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active,
.route-fade-enter-active,
.route-fade-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-enter-from,
.fade-leave-to,
.route-fade-enter-from,
.route-fade-leave-to {
    opacity: 0;
    transform: translateY(4px);
}
</style>
