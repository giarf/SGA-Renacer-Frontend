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

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/donaciones' },
        { path: '/donaciones', name: 'donaciones', component: DonacionesView, meta: { label: 'Donaciones' } },
        { path: '/compras', name: 'compras', component: ComprasView, meta: { label: 'Compras' } },
        { path: '/ayuda-social', name: 'ayudaSocial', component: AyudaSocialView, meta: { label: 'Ayuda social' } },
        { path: '/consumo-interno', name: 'consumoInterno', component: ConsumoInternoView, meta: { label: 'Consumo interno' } },
        { path: '/ajustes/bienes', name: 'ajusteBienes', component: AjusteBienesView, meta: { label: 'Ajuste de bienes' } },
        { path: '/ajustes/pecuniario', name: 'ajustePecuniario', component: AjustePecuniarioView, meta: { label: 'Ajuste pecuniario' } },
        { path: '/entidades', name: 'entidades', component: EntidadesView, meta: { label: 'Entidades' } },
        { path: '/familias', name: 'familias', component: FamiliasView, meta: { label: 'Familias' } },
        { path: '/solicitudes', name: 'solicitudes', component: SolicitudesView, meta: { label: 'Solicitudes' } },
        { path: '/catalogo', name: 'catalogo', component: CatalogoView, meta: { label: 'Catálogo' } },
        { path: '/cuentas', name: 'cuentas', component: CuentasView, meta: { label: 'Cuentas' } },
        { path: '/roles', name: 'roles', component: RolesView, meta: { label: 'Roles' } },
        { path: '/logs', name: 'logs', component: LogsView, meta: { label: 'Logs' } },
        { path: '/:pathMatch(.*)*', redirect: '/donaciones' }
    ],
    scrollBehavior() {
        return { top: 0 };
    }
});
