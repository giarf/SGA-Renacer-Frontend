<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import {
    Boxes,
    Building2,
    ChevronDown,
    ChevronsLeft,
    ClipboardList,
    HandCoins,
    HandHeart,
    Handshake,
    Home,
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
import { resolveCurrentResponsible } from './auth/currentResponsible';
import { ADMIN_GROUPS, DAILY_OPERATION_GROUPS } from './auth/permissions';
import type { EntidadResumen } from './types';

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

const navigationGroups: { title: string; items: NavigationItem[] }[] = [
    {
        title: 'Operación diaria',
        items: [
            { key: 'donaciones', to: '/donaciones', label: 'Donaciones', helper: 'Registrar aportes monetarios o en especie', icon: HandCoins, requiredGroups: DAILY_OPERATION_GROUPS },
            { key: 'compras', to: '/compras', label: 'Compras', helper: 'Ingresar compras y boletas', icon: ShoppingCart, requiredGroups: DAILY_OPERATION_GROUPS },
            {
                key: 'ayudasConsumos',
                label: 'Egresos',
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
        title: 'Comunidad',
        items: [
            { key: 'entidades', to: '/entidades', label: 'Entidades', helper: 'Personas e instituciones', icon: Users, requiredGroups: ADMIN_GROUPS },
            { key: 'familias', to: '/familias', label: 'Familias', helper: 'Grupos familiares y beneficiarios', icon: Home, requiredGroups: ADMIN_GROUPS },
            { key: 'solicitudes', to: '/solicitudes', label: 'Solicitudes', helper: 'Requerimientos de programas', icon: ClipboardList, requiredGroups: ADMIN_GROUPS }
        ]
    },
    {
        title: 'Recursos',
        items: [
            { key: 'catalogo', to: '/catalogo', label: 'Catálogo', helper: 'Ítems, stock y valorización', icon: Boxes, requiredGroups: ADMIN_GROUPS },
            { key: 'cuentas', to: '/cuentas', label: 'Cuentas', helper: 'Fondos internos y movimientos', icon: Wallet, badge: 'Nuevo', requiredGroups: ADMIN_GROUPS }
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
        compactOpenItem.value = null;
        mobileSidebarOpen.value = false;
        userMenuOpen.value = false;
        startLoadingBar();
        window.setTimeout(() => finishLoadingBar(), 320);
    }
);

const expandedItems = ref<Record<string, boolean>>({
    ayudasConsumos: true,
    ajustes: true
});

const toggleItem = (itemKey: string) => {
    expandedItems.value[itemKey] = !expandedItems.value[itemKey];
};

const isItemActive = (item: { to?: string }) => Boolean(item.to && route.path === item.to);
const isParentActive = (item: NavigationItem) => Boolean(item.children?.some(child => route.path === child.to));

const isSidebarCollapsed = ref(false);
const mobileSidebarOpen = ref(false);
const compactOpenItem = ref<string | null>(null);
const userMenuOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);
const currentUserPerson = ref<EntidadResumen | null>(null);
const toggleSidebar = () => {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
    compactOpenItem.value = null;
};

const openMobileSidebar = () => {
    mobileSidebarOpen.value = true;
};

const closeMobileSidebar = () => {
    mobileSidebarOpen.value = false;
};

const toggleCompactItem = (itemKey: string) => {
    compactOpenItem.value = compactOpenItem.value === itemKey ? null : itemKey;
};

const userInitial = computed(() => authService.displayName.trim().charAt(0).toUpperCase() || 'U');
const userPhotoUrl = computed(() => currentUserPerson.value?.fotoUrl || '');

const loadCurrentUserPerson = async () => {
    try {
        currentUserPerson.value = await resolveCurrentResponsible();
    } catch {
        currentUserPerson.value = null;
    }
};

const toggleUserMenu = () => {
    userMenuOpen.value = !userMenuOpen.value;
};

const closeUserMenuOnOutsideClick = (event: PointerEvent) => {
    if (!userMenuOpen.value) return;
    const target = event.target as Node | null;
    if (target && userMenuRef.value?.contains(target)) return;
    userMenuOpen.value = false;
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
    document.addEventListener('pointerdown', closeUserMenuOnOutsideClick);
    applyTheme();
    loadCurrentUserPerson();
});

onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', applyTheme);
    document.removeEventListener('pointerdown', closeUserMenuOnOutsideClick);
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

const activeNavClasses = 'bg-[var(--surface-muted)] !text-[var(--text-primary)] font-semibold shadow-sm';
const activeNavIconClasses = '!text-[var(--text-primary)]';

const logout = () => {
    userMenuOpen.value = false;
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

        <transition name="fade">
            <button
                v-if="mobileSidebarOpen"
                type="button"
                class="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
                aria-label="Cerrar navegación"
                @click="closeMobileSidebar"
            />
        </transition>

        <transition name="mobile-sidebar">
            <aside
                v-if="mobileSidebarOpen"
                class="app-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(16rem,88vw)] flex-col border-r shadow-2xl lg:hidden"
                :class="sidebarClasses"
                aria-label="Navegación móvil"
            >
                <div class="border-b border-white/10 px-5 py-5">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
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
                            aria-label="Cerrar barra lateral"
                            @click="closeMobileSidebar"
                        >
                            <ChevronsLeft class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <nav class="flex-1 overflow-y-auto px-4 py-6 space-y-6 text-sm" aria-label="Navegación principal móvil">
                    <section v-for="group in filteredNavigationGroups" :key="group.title">
                        <p class="mb-2 text-[11px] uppercase tracking-[0.35em] font-semibold text-slate-500">{{ group.title }}</p>
                        <ul class="space-y-1">
                                <li v-for="item in group.items" :key="item.key">
                                    <RouterLink
                                        v-if="item.to"
                                        :to="item.to"
                                        class="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
                                        :class="isItemActive(item)
                                            ? activeNavClasses
                                            : effectiveTheme === 'dark'
                                                ? '!text-slate-400 hover:!text-white hover:bg-white/5'
                                                : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                        @click="closeMobileSidebar"
                                    >
                                        <component :is="item.icon" class="w-4 h-4" :class="isItemActive(item) ? activeNavIconClasses : '!text-slate-400'" />
                                        <span class="min-w-0 flex-1 text-left">
                                            <span class="block font-medium text-sm">{{ item.label }}</span>
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
                                                ? activeNavClasses
                                                : effectiveTheme === 'dark'
                                                    ? '!text-slate-400 hover:!text-white hover:bg-white/5'
                                                    : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                            @click="toggleItem(item.key)"
                                        >
                                            <component :is="item.icon" class="w-4 h-4" :class="isParentActive(item) ? activeNavIconClasses : '!text-slate-400'" />
                                            <span class="min-w-0 flex-1 text-left">
                                                <span class="block font-medium text-sm">{{ item.label }}</span>
                                            </span>
                                            <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="expandedItems[item.key] ? 'rotate-180' : ''" />
                                        </button>
                                        <ul v-if="item.children?.length && expandedItems[item.key]" class="mt-1 ml-5 pl-4 border-l border-white/10 space-y-1">
                                            <li v-for="child in item.children" :key="child.key">
                                                <RouterLink
                                                    :to="child.to"
                                                    class="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition"
                                                    :class="isItemActive(child)
                                                        ? activeNavClasses
                                                        : effectiveTheme === 'dark'
                                                            ? '!text-slate-300 hover:!text-white hover:bg-white/5'
                                                            : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                                    @click="closeMobileSidebar"
                                                >
                                                    <span class="min-w-0 text-left">
                                                        <span class="block">{{ child.label }}</span>
                                                    </span>
                                                </RouterLink>
                                            </li>
                                        </ul>
                                    </template>
                                </li>
                        </ul>
                    </section>
                </nav>
            </aside>
        </transition>

        <aside
            class="app-sidebar sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-300 lg:flex"
            :class="[sidebarClasses, isSidebarCollapsed ? 'w-16' : 'w-[14.4rem]']"
        >
            <button
                type="button"
                class="group absolute -right-[11px] top-1/2 z-30 h-10 w-3 -translate-y-1/2 rounded-full text-[var(--text-muted)]/55 transition hover:text-[var(--text-primary)]"
                :aria-label="isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'"
                @click="toggleSidebar"
            >
                <span class="mx-auto block h-5 w-0.5 rounded-full bg-current" />
                <span
                    class="compact-tooltip pointer-events-none absolute left-[calc(100%+0.6rem)] top-1/2 z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[var(--accent-color)] px-2.5 py-1.5 text-left text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100"
                >
                    <strong class="block text-xs font-semibold">{{ isSidebarCollapsed ? 'Expandir' : 'Colapsar' }}</strong>
                </span>
            </button>

            <div class="border-b border-white/10" :class="isSidebarCollapsed ? 'px-2 py-5' : 'px-6 py-6'">
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
                </div>
            </div>

            <nav v-if="isSidebarCollapsed" class="flex-1 px-2 py-4 space-y-1 text-sm" aria-label="Navegación compacta">
                <template v-for="group in filteredNavigationGroups" :key="group.title">
                    <template v-for="item in group.items" :key="item.key">
                        <RouterLink
                            v-if="item.to"
                            :to="item.to"
                            class="group relative flex h-10 w-11 items-center justify-center rounded-xl transition"
                            :class="isItemActive(item)
                                ? activeNavClasses
                                : effectiveTheme === 'dark'
                                    ? '!text-slate-300 hover:!text-white hover:bg-white/5'
                                    : '!text-slate-600 hover:!text-slate-950 hover:bg-black/5'"
                            :aria-label="item.label"
                        >
                            <component :is="item.icon" class="w-4 h-4" />
                            <span
                                class="compact-tooltip pointer-events-none absolute left-[calc(100%+0.6rem)] top-1/2 z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[var(--accent-color)] px-2.5 py-1.5 text-left text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100"
                            >
                                <strong class="block text-xs font-semibold">{{ item.label }}</strong>
                            </span>
                        </RouterLink>

                        <div v-else class="group relative">
                            <button
                                type="button"
                                class="flex h-10 w-11 items-center justify-center rounded-xl transition"
                                :class="isParentActive(item)
                                    ? activeNavClasses
                                    : effectiveTheme === 'dark'
                                        ? '!text-slate-300 hover:!text-white hover:bg-white/5'
                                        : '!text-slate-600 hover:!text-slate-950 hover:bg-black/5'"
                                :aria-expanded="compactOpenItem === item.key"
                                :aria-label="item.label"
                                @click="toggleCompactItem(item.key)"
                            >
                                <component :is="item.icon" class="w-4 h-4" />
                            </button>
                            <span
                                v-if="compactOpenItem !== item.key"
                                class="compact-tooltip pointer-events-none absolute left-[calc(100%+0.6rem)] top-1/2 z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[var(--accent-color)] px-2.5 py-1.5 text-left text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100"
                            >
                                <strong class="block text-xs font-semibold">{{ item.label }}</strong>
                            </span>
                            <div
                                v-if="compactOpenItem === item.key"
                                class="compact-tooltip absolute left-[calc(100%+0.6rem)] top-0 z-[9999] min-w-44 rounded-xl bg-[var(--accent-color)] p-1.5 text-sm text-white shadow-xl"
                            >
                                <p class="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/75">{{ item.label }}</p>
                                <RouterLink
                                    v-for="child in item.children"
                                    :key="child.key"
                                    :to="child.to"
                                    class="block rounded-lg px-2.5 py-1.5 text-xs transition"
                                    :class="isItemActive(child)
                                        ? 'bg-white/18 !text-white font-semibold'
                                        : '!text-white/85 hover:!text-white hover:bg-white/12'"
                                >
                                    {{ child.label }}
                                </RouterLink>
                            </div>
                        </div>
                    </template>
                </template>
            </nav>

            <nav v-else class="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm" aria-label="Navegación principal">
                <section v-for="group in filteredNavigationGroups" :key="group.title">
                    <p class="mb-1.5 text-[11px] uppercase tracking-[0.35em] font-semibold text-slate-500">{{ group.title }}</p>
                    <ul class="space-y-0.5">
                            <li v-for="item in group.items" :key="item.key">
                                <RouterLink
                                    v-if="item.to"
                                    :to="item.to"
                                    class="w-full flex items-center gap-3 rounded-2xl px-3 py-2 transition"
                                    :class="isItemActive(item)
                                        ? activeNavClasses
                                        : effectiveTheme === 'dark'
                                            ? '!text-slate-400 hover:!text-white hover:bg-white/5'
                                            : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                >
                                    <component :is="item.icon" class="w-4 h-4" :class="isItemActive(item) ? activeNavIconClasses : '!text-slate-400'" />
                                    <span class="min-w-0 flex-1 text-left">
                                        <span class="block font-medium text-sm">{{ item.label }}</span>
                                    </span>
                                    <span v-if="item.badge" class="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-white/10">
                                        {{ item.badge }}
                                    </span>
                                </RouterLink>

                                <template v-else>
                                    <button
                                        type="button"
                                        class="w-full flex items-center gap-3 rounded-2xl px-3 py-2 transition"
                                        :class="isParentActive(item)
                                            ? activeNavClasses
                                            : effectiveTheme === 'dark'
                                                ? '!text-slate-400 hover:!text-white hover:bg-white/5'
                                                : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                        @click="toggleItem(item.key)"
                                    >
                                        <component :is="item.icon" class="w-4 h-4" :class="isParentActive(item) ? activeNavIconClasses : '!text-slate-400'" />
                                        <span class="min-w-0 flex-1 text-left">
                                            <span class="block font-medium text-sm">{{ item.label }}</span>
                                        </span>
                                        <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="expandedItems[item.key] ? 'rotate-180' : ''" />
                                    </button>
                                     <ul v-if="item.children?.length && expandedItems[item.key]" class="mt-1 ml-5 pl-4 border-l border-white/10 space-y-0.5">
                                        <li v-for="child in item.children" :key="child.key">
                                            <RouterLink
                                                :to="child.to"
                                                class="w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition"
                                                :class="isItemActive(child)
                                                    ? activeNavClasses
                                                    : effectiveTheme === 'dark'
                                                        ? '!text-slate-300 hover:!text-white hover:bg-white/5'
                                                        : '!text-slate-600 hover:!text-slate-900 hover:bg-black/5'"
                                            >
                                                <span class="min-w-0 text-left">
                                                    <span class="block">{{ child.label }}</span>
                                                </span>
                                            </RouterLink>
                                        </li>
                                    </ul>
                                </template>
                            </li>
                    </ul>
                </section>
            </nav>
        </aside>

        <div class="min-w-0 flex-1 flex flex-col">
            <header class="border-b border-white/10 px-6 lg:px-10 py-5 flex flex-col gap-4">
                <div class="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        class="lg:hidden inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-muted)]"
                        aria-label="Abrir barra lateral"
                        @click="openMobileSidebar"
                    >
                        <Menu class="w-6 h-6" />
                    </button>

                    <div class="hidden min-w-0 lg:block">
                        <h1 class="text-3xl font-bold" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                            {{ currentViewMeta?.label || route.meta.label || 'SGA Renacer' }}
                        </h1>
                        <p class="mt-1 text-sm text-[var(--text-muted)]">
                            {{ currentViewMeta?.helper || 'Accede directo al flujo que necesitas realizar.' }}
                        </p>
                    </div>

                    <div class="ml-auto flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            class="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full text-sm transition sm:w-auto sm:px-4"
                            :class="effectiveTheme === 'dark'
                                ? 'border border-white/15 text-slate-200 hover:bg-white/5'
                                : 'border border-slate-200 text-slate-600 hover:bg-black/5'"
                            @click="cycleTheme"
                        >
                            <component :is="themeMeta.icon" class="w-4 h-4" />
                            <span class="hidden sm:inline">{{ themeMeta.label }}</span>
                        </button>
                        <div ref="userMenuRef" class="relative">
                            <button
                                type="button"
                                class="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-[var(--card-border)] bg-[var(--surface-muted)] text-sm font-bold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-strong)]"
                                :aria-expanded="userMenuOpen"
                                aria-label="Abrir menú de usuario"
                                @click="toggleUserMenu"
                            >
                                <img
                                    v-if="userPhotoUrl"
                                    :src="userPhotoUrl"
                                    :alt="`Foto de ${currentUserPerson?.nombreCompleto || authService.displayName}`"
                                    class="h-full w-full object-cover"
                                >
                                <span v-else>{{ userInitial }}</span>
                            </button>
                            <transition name="fade">
                                <div
                                    v-if="userMenuOpen"
                                    class="absolute right-0 top-[calc(100%+0.6rem)] z-30 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xl"
                                >
                                    <div class="border-b border-[var(--card-border)] px-4 py-3">
                                        <p class="text-xs uppercase tracking-[0.25em] text-[var(--text-muted)]">Authentik</p>
                                        <p class="mt-1 truncate text-sm font-semibold">{{ authService.displayName }}</p>
                                        <p v-if="currentUserPerson" class="mt-1 truncate text-xs text-[var(--text-muted)]">
                                            Persona interna: {{ currentUserPerson.nombreCompleto }}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                                        @click="logout"
                                    >
                                        <LogOut class="h-4 w-4" />
                                        Cerrar sesión
                                    </button>
                                </div>
                            </transition>
                        </div>
                    </div>
                </div>

                <div class="min-w-0 lg:hidden">
                    <h1 class="text-3xl font-bold" :class="effectiveTheme === 'dark' ? 'text-white' : 'text-slate-900'">
                        {{ currentViewMeta?.label || route.meta.label || 'SGA Renacer' }}
                    </h1>
                    <p class="mt-1 text-sm text-[var(--text-muted)]">
                        {{ currentViewMeta?.helper || 'Accede directo al flujo que necesitas realizar.' }}
                    </p>
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
.app-sidebar :deep(a) {
    color: inherit;
}

.compact-tooltip::before {
    content: "";
    position: absolute;
    left: -3px;
    top: 50%;
    width: 10px;
    height: 10px;
    background: var(--accent-color);
    transform: translateY(-50%) rotate(45deg);
    border-radius: 1px;
}

.compact-tooltip > * {
    position: relative;
    z-index: 1;
}

.fade-enter-active,
.fade-leave-active,
.route-fade-enter-active,
.route-fade-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.mobile-sidebar-enter-active,
.mobile-sidebar-leave-active {
    transition: transform 0.22s ease, opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to,
.route-fade-enter-from,
.route-fade-leave-to {
    opacity: 0;
    transform: translateY(4px);
}

.mobile-sidebar-enter-from,
.mobile-sidebar-leave-to {
    opacity: 0;
    transform: translateX(-100%);
}
</style>
