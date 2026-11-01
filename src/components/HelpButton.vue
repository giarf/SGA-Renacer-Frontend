<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Info, X } from 'lucide-vue-next';
import { viewHelp } from '../help/viewHelp';

const route = useRoute();
const open = ref(false);

const help = computed(() => {
    const name = typeof route.name === 'string' ? route.name : '';
    return viewHelp[name] ?? null;
});

const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') open.value = false;
};

watch(open, value => {
    if (value) window.addEventListener('keydown', onKeydown);
    else window.removeEventListener('keydown', onKeydown);
});

watch(() => route.fullPath, () => {
    open.value = false;
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <template v-if="help">
        <button
            type="button"
            class="help-fab"
            :class="{ 'help-fab--raised': route.name === 'dashboardAi' }"
            aria-label="Cómo usar esta pantalla"
            title="Cómo usar esta pantalla"
            @click="open = true"
        >
            <Info :size="18" />
        </button>

        <Teleport to="body">
            <transition name="help-fade">
                <div v-if="open" class="help-backdrop" @click.self="open = false">
                    <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
                        <header class="help-head">
                            <span class="help-icon"><Info :size="18" /></span>
                            <h2 id="help-title">{{ help.title }}</h2>
                            <button type="button" class="help-close" aria-label="Cerrar ayuda" @click="open = false">
                                <X :size="18" />
                            </button>
                        </header>
                        <div class="help-body">
                            <p class="help-intro">{{ help.intro }}</p>
                            <template v-if="help.steps?.length">
                                <h3>Paso a paso</h3>
                                <ol>
                                    <li v-for="step in help.steps" :key="step">{{ step }}</li>
                                </ol>
                            </template>
                            <template v-if="help.tips?.length">
                                <h3>Ten en cuenta</h3>
                                <ul>
                                    <li v-for="tip in help.tips" :key="tip">{{ tip }}</li>
                                </ul>
                            </template>
                        </div>
                    </section>
                </div>
            </transition>
        </Teleport>
    </template>
</template>

<style scoped>
.help-fab {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 40;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    border: 1px solid var(--card-border);
    background: var(--bg-card);
    color: var(--text-muted);
    box-shadow: var(--shadow-soft);
    transition: color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.help-fab--raised {
    bottom: 7rem;
}

.help-fab:hover,
.help-fab:focus-visible {
    color: var(--accent-color);
    border-color: var(--accent-color);
    transform: translateY(-1px);
}

.help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
}

.help-dialog {
    width: min(32rem, 100%);
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    border-radius: 1.25rem;
    background: var(--bg-card);
    color: var(--text-primary);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.help-head {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 1.1rem 1.25rem 0.5rem;
}

.help-head h2 {
    flex: 1;
    font-size: 1.05rem;
    font-weight: 700;
}

.help-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--accent-color-muted);
    color: var(--accent-color);
}

.help-close {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    color: var(--text-muted);
}

.help-close:hover {
    background: var(--surface-muted);
    color: var(--text-primary);
}

.help-body {
    padding: 0.25rem 1.25rem 1.4rem;
    font-size: 0.9rem;
    line-height: 1.55;
}

.help-intro {
    color: var(--text-muted);
}

.help-body h3 {
    margin: 1rem 0 0.4rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
}

.help-body ol,
.help-body ul {
    display: grid;
    gap: 0.35rem;
    padding-left: 1.2rem;
}

.help-body ol {
    list-style: decimal;
}

.help-body ul {
    list-style: disc;
}

.help-body li::marker {
    color: var(--accent-color);
    font-weight: 700;
}

.help-fade-enter-active,
.help-fade-leave-active {
    transition: opacity 0.15s ease;
}

.help-fade-enter-from,
.help-fade-leave-to {
    opacity: 0;
}

@media print {
    .help-fab {
        display: none;
    }
}
</style>
