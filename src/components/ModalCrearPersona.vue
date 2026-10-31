<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue';
import PersonaForm from './PersonaForm.vue';
import HuellasPanel from './HuellasPanel.vue';
import { X, UserPlus, FingerprintPattern } from 'lucide-vue-next';

const props = defineProps<{ isOpen: boolean; initialSearch?: string }>();
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'created', rut: string, id?: number): void;
}>();
const dialog = ref<HTMLDialogElement | null>(null);
const busy = ref(false);
const titleId = useId();
const creada = ref<{ rut: string; id: number } | null>(null);

watch(() => props.isOpen, async (open) => {
    await nextTick();
    if (open && props.isOpen) {
        busy.value = false;
        creada.value = null;
        dialog.value?.showModal();
    } else if (!props.isOpen) {
        dialog.value?.close();
    }
}, { immediate: true });

const finish = () => {
    const persona = creada.value;
    creada.value = null;
    if (persona) emit('created', persona.rut, persona.id);
    emit('close');
};

const requestClose = () => {
    if (busy.value) return;
    if (creada.value) finish();
    else emit('close');
};

// Con la persona ya creada se ofrece registrar su huella antes de devolverla.
const handleCreated = (rut: string, id?: number) => {
    if (id) creada.value = { rut, id };
    else {
        emit('created', rut, id);
        emit('close');
    }
};
</script>

<template>
    <Teleport to="body">
        <dialog ref="dialog" class="person-dialog" :aria-labelledby="titleId" @cancel.prevent="requestClose">
            <header class="person-dialog-header">
                <div class="person-dialog-icon"><FingerprintPattern v-if="creada" :size="21" aria-hidden="true" /><UserPlus v-else :size="21" aria-hidden="true" /></div>
                <div class="min-w-0 flex-1">
                    <h2 :id="titleId">{{ creada ? 'Registrar huella' : 'Nueva persona' }}</h2>
                    <p>{{ creada ? 'Persona registrada. Puedes agregar su huella ahora u omitir este paso.' : 'Registra sus datos sin salir de esta página.' }}</p>
                </div>
                <button type="button" class="person-dialog-close" aria-label="Cerrar nueva persona" :disabled="busy" @click="requestClose">
                    <X :size="20" aria-hidden="true" />
                </button>
            </header>
            <template v-if="isOpen && creada">
                <div class="person-dialog-step"><HuellasPanel :persona-id="creada.id" /></div>
                <footer class="person-dialog-footer"><button type="button" class="btn-primary" @click="finish">Listo</button></footer>
            </template>
            <PersonaForm v-else-if="isOpen" :initial-search="initialSearch" @cancel="requestClose" @created="handleCreated" @busy="busy = $event" />
        </dialog>
    </Teleport>
</template>

<style scoped>
.person-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(40rem, calc(100% - 2rem));
    max-width: none;
    max-height: min(48rem, calc(100dvh - 3rem));
    padding: 0;
    overflow: hidden;
    color: var(--text-primary);
    background: var(--bg-card);
    border: 1px solid var(--card-border);
    border-radius: 1.5rem;
    box-shadow: 0 24px 80px #0003, 0 4px 16px #0001;
}
.person-dialog[open] { display: flex; flex-direction: column; }
.person-dialog::backdrop { background: rgb(15 23 42 / 24%); }
:global(body:has(.person-dialog[open])) { overflow: hidden; }
.person-dialog-header {
    display: flex;
    align-items: center;
    gap: .8rem;
    flex-shrink: 0;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--card-border);
}
.person-dialog-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: .9rem;
    color: var(--accent-color);
    background: var(--accent-color-muted);
}
.person-dialog-header h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -.02em; }
.person-dialog-header p { margin-top: .15rem; font-size: .8rem; color: var(--text-muted); }
.person-dialog-close {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: .75rem;
    color: var(--text-muted);
}
.person-dialog-close:hover { background: var(--surface-muted); }
.person-dialog-close:disabled { opacity: .4; cursor: wait; }
.person-dialog-close:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.person-dialog-step { overflow-y: auto; padding: 1.25rem 1.5rem; }
.person-dialog-footer { display: flex; justify-content: flex-end; flex-shrink: 0; padding: 1rem 1.5rem; border-top: 1px solid var(--card-border); }
@media (max-width: 480px) {
    .person-dialog-step, .person-dialog-footer { padding: 1rem; }
    .person-dialog { width: calc(100% - 1.25rem); max-height: calc(100dvh - 1.5rem); border-radius: 1.15rem; }
    .person-dialog-header { padding: 1rem; gap: .65rem; }
    .person-dialog-icon { display: none; }
}
</style>
