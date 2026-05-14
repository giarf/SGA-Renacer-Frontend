<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Edit3, KeyRound, Loader2, Plus, RefreshCw, Shield, ShieldCheck, UserCheck, UserX, X } from 'lucide-vue-next';
import { authentikAdminService, type ManagedAuthentikUser } from '../api/authentikAdminService';

const users = ref<ManagedAuthentikUser[]>([]);
const loading = ref(false);
const busyId = ref<number | null>(null);
const saving = ref(false);
const search = ref('');
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const modalMode = ref<'create' | 'edit' | null>(null);
const selectedUser = ref<ManagedAuthentikUser | null>(null);
const showPasswordModal = ref(false);

const form = reactive({
    name: '',
    email: '',
    username: '',
    password: '',
    isAdmin: false,
    isActive: true
});

const passwordForm = reactive({
    password: '',
    confirm: ''
});

const filteredUsers = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return users.value;
    return users.value.filter(user =>
        user.name.toLowerCase().includes(term) ||
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
    );
});

const initials = (user: ManagedAuthentikUser) => {
    const base = user.name || user.username || '?';
    const parts = base.trim().split(/\s+/);
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?';
};

const formattedDate = (date?: string | null) => {
    if (!date) return 'Sin ingreso';
    return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
};

const setMessage = (type: 'success' | 'error', text: string) => {
    message.value = { type, text };
    window.setTimeout(() => {
        if (message.value?.text === text) message.value = null;
    }, 4200);
};

const loadUsers = async () => {
    loading.value = true;
    try {
        users.value = await authentikAdminService.listUsers();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudieron cargar los usuarios.');
    } finally {
        loading.value = false;
    }
};

const resetForm = () => {
    form.name = '';
    form.email = '';
    form.username = '';
    form.password = '';
    form.isAdmin = false;
    form.isActive = true;
};

const openCreate = () => {
    selectedUser.value = null;
    resetForm();
    modalMode.value = 'create';
};

const openEdit = (user: ManagedAuthentikUser) => {
    selectedUser.value = user;
    form.name = user.name;
    form.email = user.email;
    form.username = user.username;
    form.password = '';
    form.isAdmin = user.isAdmin;
    form.isActive = user.isActive;
    modalMode.value = 'edit';
};

const closeUserModal = () => {
    modalMode.value = null;
    selectedUser.value = null;
    resetForm();
};

const saveUser = async () => {
    saving.value = true;
    try {
        if (modalMode.value === 'create') {
            await authentikAdminService.createUser({
                name: form.name,
                email: form.email,
                username: form.username,
                password: form.password,
                isAdmin: form.isAdmin
            });
            setMessage('success', 'Usuario creado en renacer-miembros.');
        } else if (selectedUser.value) {
            await authentikAdminService.updateUser(selectedUser.value.id, {
                name: form.name,
                email: form.email,
                isActive: form.isActive
            });
            if (form.isAdmin !== selectedUser.value.isAdmin) {
                await authentikAdminService.setAdmin(selectedUser.value.id, form.isAdmin);
            }
            setMessage('success', 'Usuario actualizado.');
        }
        closeUserModal();
        await loadUsers();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo guardar el usuario.');
    } finally {
        saving.value = false;
    }
};

const toggleActive = async (user: ManagedAuthentikUser) => {
    busyId.value = user.id;
    try {
        await authentikAdminService.updateUser(user.id, { isActive: !user.isActive });
        setMessage('success', user.isActive ? 'Usuario desactivado.' : 'Usuario activado.');
        await loadUsers();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo cambiar el estado.');
    } finally {
        busyId.value = null;
    }
};

const toggleAdmin = async (user: ManagedAuthentikUser) => {
    busyId.value = user.id;
    try {
        await authentikAdminService.setAdmin(user.id, !user.isAdmin);
        setMessage('success', user.isAdmin ? 'Permiso admin removido.' : 'Permiso admin agregado.');
        await loadUsers();
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo cambiar el permiso admin.');
    } finally {
        busyId.value = null;
    }
};

const openPassword = (user: ManagedAuthentikUser) => {
    selectedUser.value = user;
    passwordForm.password = '';
    passwordForm.confirm = '';
    showPasswordModal.value = true;
};

const closePassword = () => {
    showPasswordModal.value = false;
    selectedUser.value = null;
    passwordForm.password = '';
    passwordForm.confirm = '';
};

const savePassword = async () => {
    if (!selectedUser.value) return;
    if (passwordForm.password !== passwordForm.confirm) {
        setMessage('error', 'Las contraseñas no coinciden.');
        return;
    }

    saving.value = true;
    try {
        await authentikAdminService.setPassword(selectedUser.value.id, passwordForm.password);
        closePassword();
        setMessage('success', 'Contraseña temporal actualizada.');
    } catch (error: any) {
        setMessage('error', error.message || 'No se pudo cambiar la contraseña.');
    } finally {
        saving.value = false;
    }
};

onMounted(loadUsers);
</script>

<template>
    <div class="px-4 sm:px-6 lg:px-8 py-6">
        <div class="rounded-2xl border border-[var(--card-border)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
            <header class="flex flex-col gap-4 border-b border-[var(--card-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="flex items-center gap-3">
                    <div class="grid h-9 w-9 place-items-center rounded-xl bg-[#006d8f] text-white">
                        <ShieldCheck class="h-4 w-4" />
                    </div>
                    <div>
                        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Gestión de usuarios</h2>
                        <p class="text-xs text-[var(--text-muted)]">{{ filteredUsers.length }} de {{ users.length }} usuarios en renacer-miembros</p>
                    </div>
                </div>

                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input v-model="search" type="search" placeholder="Buscar usuarios..." class="h-10 min-w-[240px] rounded-xl text-sm" />
                    <button type="button" class="btn-secondary h-10" :disabled="loading" @click="loadUsers">
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                    </button>
                    <button type="button" class="btn-primary h-10" @click="openCreate">
                        <Plus class="h-4 w-4" />
                        Nuevo usuario
                    </button>
                </div>
            </header>

            <div v-if="message" :class="`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`">
                {{ message.text }}
            </div>

            <div v-if="loading" class="grid h-64 place-items-center text-sm text-[var(--text-muted)]">
                <div class="text-center">
                    <Loader2 class="mx-auto mb-3 h-6 w-6 animate-spin" />
                    Cargando usuarios...
                </div>
            </div>

            <div v-else-if="!filteredUsers.length" class="grid h-64 place-items-center text-sm text-[var(--text-muted)]">
                {{ search ? 'No se encontraron resultados.' : 'No hay usuarios registrados.' }}
            </div>

            <div v-else class="overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="bg-black/5 text-xs uppercase tracking-wide text-[var(--text-muted)] dark:bg-white/5">
                        <tr>
                            <th class="px-5 py-3 text-left font-semibold">Usuario</th>
                            <th class="px-5 py-3 text-left font-semibold">Correo</th>
                            <th class="px-5 py-3 text-left font-semibold">Estado</th>
                            <th class="px-5 py-3 text-left font-semibold">Último ingreso</th>
                            <th class="px-5 py-3 text-right font-semibold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--card-border)]">
                        <tr v-for="user in filteredUsers" :key="user.id" class="transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                            <td class="px-5 py-3">
                                <div class="flex items-center gap-3">
                                    <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#006d8f]/10 text-xs font-bold text-[#006d8f]">
                                        {{ initials(user) }}
                                    </div>
                                    <div class="min-w-0">
                                        <p class="truncate font-medium text-[var(--text-primary)]">{{ user.name || '-' }}</p>
                                        <p class="truncate text-xs text-[var(--text-muted)]">@{{ user.username }}</p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-5 py-3 text-[var(--text-muted)]">{{ user.email || '-' }}</td>
                            <td class="px-5 py-3">
                                <div class="flex flex-wrap gap-1.5">
                                    <span :class="`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`">
                                        <span :class="`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-slate-400'}`" />
                                        {{ user.isActive ? 'Activo' : 'Inactivo' }}
                                    </span>
                                    <span v-if="user.isAdmin" class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                                        <Shield class="h-3 w-3" /> Admin
                                    </span>
                                </div>
                            </td>
                            <td class="px-5 py-3 text-[var(--text-muted)]">{{ formattedDate(user.lastLogin) }}</td>
                            <td class="px-5 py-3">
                                <div class="flex justify-end gap-1">
                                    <button type="button" class="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-blue-50 hover:text-[#006d8f]" title="Editar" @click="openEdit(user)">
                                        <Edit3 class="h-4 w-4" />
                                    </button>
                                    <button type="button" class="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-indigo-50 hover:text-indigo-600" title="Cambiar contraseña" @click="openPassword(user)">
                                        <KeyRound class="h-4 w-4" />
                                    </button>
                                    <button type="button" class="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-amber-50 hover:text-amber-600" :title="user.isActive ? 'Desactivar' : 'Activar'" :disabled="busyId === user.id" @click="toggleActive(user)">
                                        <UserX v-if="user.isActive" class="h-4 w-4" />
                                        <UserCheck v-else class="h-4 w-4" />
                                    </button>
                                    <button type="button" :class="`rounded-lg p-2 transition ${user.isAdmin ? 'text-amber-600 hover:bg-amber-50' : 'text-[var(--text-muted)] hover:bg-green-50 hover:text-green-600'}`" :title="user.isAdmin ? 'Quitar admin' : 'Hacer admin'" :disabled="busyId === user.id" @click="toggleAdmin(user)">
                                        <ShieldCheck class="h-4 w-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-if="modalMode" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
            <form class="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-2xl border border-[var(--card-border)]" @submit.prevent="saveUser">
                <div class="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
                    <h3 class="text-lg font-semibold">{{ modalMode === 'create' ? 'Nuevo usuario' : 'Editar usuario' }}</h3>
                    <button type="button" class="rounded-lg p-1 text-[var(--text-muted)] hover:bg-black/5" @click="closeUserModal">
                        <X class="h-5 w-5" />
                    </button>
                </div>
                <div class="space-y-4 p-5">
                    <label class="block text-sm font-medium">Nombre completo<input v-model="form.name" required class="mt-1" /></label>
                    <label class="block text-sm font-medium">Correo<input v-model="form.email" required type="email" class="mt-1" /></label>
                    <label class="block text-sm font-medium">Usuario<input v-model="form.username" :disabled="modalMode === 'edit'" :required="modalMode === 'create'" class="mt-1 disabled:bg-black/5" placeholder="Opcional, se deriva del correo" /></label>
                    <label v-if="modalMode === 'create'" class="block text-sm font-medium">Contraseña temporal<input v-model="form.password" type="password" minlength="8" class="mt-1" /></label>
                    <label class="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-black/5 p-3 text-sm dark:bg-white/5">
                        <input v-model="form.isAdmin" type="checkbox" class="h-4 w-4" />
                        Pertenece a renacer-admin
                    </label>
                    <label v-if="modalMode === 'edit'" class="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-black/5 p-3 text-sm dark:bg-white/5">
                        <input v-model="form.isActive" type="checkbox" class="h-4 w-4" />
                        Usuario activo
                    </label>
                </div>
                <div class="flex gap-3 border-t border-[var(--card-border)] p-5">
                    <button type="button" class="btn-secondary flex-1 justify-center" @click="closeUserModal">Cancelar</button>
                    <button type="submit" class="btn-primary flex-1 justify-center" :disabled="saving">
                        <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
                        {{ modalMode === 'create' ? 'Crear' : 'Guardar' }}
                    </button>
                </div>
            </form>
        </div>

        <div v-if="showPasswordModal && selectedUser" class="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
            <form class="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-2xl border border-[var(--card-border)]" @submit.prevent="savePassword">
                <div class="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
                    <h3 class="text-lg font-semibold">Cambiar contraseña</h3>
                    <button type="button" class="rounded-lg p-1 text-[var(--text-muted)] hover:bg-black/5" @click="closePassword"><X class="h-5 w-5" /></button>
                </div>
                <div class="space-y-4 p-5">
                    <p class="text-sm text-[var(--text-muted)]">Nueva contraseña temporal para <strong class="text-[var(--text-primary)]">{{ selectedUser.name || selectedUser.username }}</strong>.</p>
                    <label class="block text-sm font-medium">Nueva contraseña<input v-model="passwordForm.password" required type="password" minlength="8" class="mt-1" autofocus /></label>
                    <label class="block text-sm font-medium">Confirmar contraseña<input v-model="passwordForm.confirm" required type="password" minlength="8" class="mt-1" /></label>
                </div>
                <div class="flex gap-3 border-t border-[var(--card-border)] p-5">
                    <button type="button" class="btn-secondary flex-1 justify-center" @click="closePassword">Cancelar</button>
                    <button type="submit" class="btn-primary flex-1 justify-center" :disabled="saving">
                        <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
                        Cambiar
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>
