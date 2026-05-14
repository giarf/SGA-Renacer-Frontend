import { createRouter, createWebHistory } from 'vue-router';
import AjusteBienesView from './views/AjusteBienesView.vue';
import AjustePecuniarioView from './views/AjustePecuniarioView.vue';
import AyudaSocialView from './views/AyudaSocialView.vue';
import CatalogoView from './views/CatalogoView.vue';
import ComprasView from './views/ComprasView.vue';
import ConsumoInternoView from './views/ConsumoInternoView.vue';
import CuentasView from './views/CuentasView.vue';
import DonacionesView from './views/DonacionesView.vue';
import EntidadesView from './views/EntidadesView.vue';
import FamiliasView from './views/FamiliasView.vue';
import LogsView from './views/LogsView.vue';
import RolesView from './views/RolesView.vue';
import SolicitudesView from './views/SolicitudesView.vue';
import { authService, hasAnyGroup } from './auth/authService';
import { ADMIN_GROUPS, DAILY_OPERATION_GROUPS } from './auth/permissions';
import CallbackView from './views/CallbackView.vue';
import LoginView from './views/LoginView.vue';
import UnauthorizedView from './views/UnauthorizedView.vue';
import UsuariosView from './views/UsuariosView.vue';

declare module 'vue-router' {
    interface RouteMeta {
        label?: string;
        requiredGroups?: readonly string[];
        public?: boolean;
    }
}

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/donaciones' },
        { path: '/login', name: 'login', component: LoginView, meta: { public: true, label: 'Login' } },
        { path: '/callback', name: 'callback', component: CallbackView, meta: { public: true, label: 'Callback' } },
        { path: '/sin-permisos', name: 'unauthorized', component: UnauthorizedView, meta: { label: 'Sin permisos' } },
        { path: '/donaciones', name: 'donaciones', component: DonacionesView, meta: { label: 'Donaciones', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/compras', name: 'compras', component: ComprasView, meta: { label: 'Compras', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/ayuda-social', name: 'ayudaSocial', component: AyudaSocialView, meta: { label: 'Ayuda social', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/consumo-interno', name: 'consumoInterno', component: ConsumoInternoView, meta: { label: 'Consumo interno', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/ajustes/bienes', name: 'ajusteBienes', component: AjusteBienesView, meta: { label: 'Ajuste de bienes', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/ajustes/pecuniario', name: 'ajustePecuniario', component: AjustePecuniarioView, meta: { label: 'Ajuste pecuniario', requiredGroups: DAILY_OPERATION_GROUPS } },
        { path: '/entidades', name: 'entidades', component: EntidadesView, meta: { label: 'Entidades', requiredGroups: ADMIN_GROUPS } },
        { path: '/familias', name: 'familias', component: FamiliasView, meta: { label: 'Familias', requiredGroups: ADMIN_GROUPS } },
        { path: '/solicitudes', name: 'solicitudes', component: SolicitudesView, meta: { label: 'Solicitudes', requiredGroups: ADMIN_GROUPS } },
        { path: '/catalogo', name: 'catalogo', component: CatalogoView, meta: { label: 'Catálogo', requiredGroups: ADMIN_GROUPS } },
        { path: '/cuentas', name: 'cuentas', component: CuentasView, meta: { label: 'Cuentas', requiredGroups: ADMIN_GROUPS } },
        { path: '/roles', name: 'roles', component: RolesView, meta: { label: 'Roles', requiredGroups: ADMIN_GROUPS } },
        { path: '/usuarios', name: 'usuarios', component: UsuariosView, meta: { label: 'Usuarios', requiredGroups: ADMIN_GROUPS } },
        { path: '/logs', name: 'logs', component: LogsView, meta: { label: 'Logs', requiredGroups: ADMIN_GROUPS } },
        { path: '/:pathMatch(.*)*', redirect: '/donaciones' }
    ],
    scrollBehavior() {
        return { top: 0 };
    }
});

router.beforeEach(async to => {
    if (to.meta.public) return true;

    const user = await authService.initialize();
    if (!user) {
        return { path: '/login', query: { returnTo: to.fullPath } };
    }

    const requiredGroups = to.meta.requiredGroups ?? [];
    if (!hasAnyGroup(requiredGroups)) {
        return { path: '/sin-permisos' };
    }

    return true;
});
