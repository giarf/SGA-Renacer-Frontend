<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, CircleSlash, Loader2, Pencil, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-vue-next';
import type { Confirmacion, TipoAccion } from '../ai/aiActions';

const props = defineProps<{ c: Confirmacion }>();
const emit = defineEmits<{ decidir: [aprobado: boolean] }>();

const ETIQUETA: Record<TipoAccion, string> = { crear: 'Crear', modificar: 'Modificar', eliminar: 'Eliminar' };
const ICONO = { crear: Plus, modificar: Pencil, eliminar: Trash2 };

const conteo = computed(() => {
    const total = { crear: 0, modificar: 0, eliminar: 0 };
    props.c.operaciones.forEach(op => { total[op.tipo] += 1; });
    return total;
});
const hayEliminaciones = computed(() => conteo.value.eliminar > 0);
const errores = computed(() => props.c.operaciones.filter(op => op.resultado && !op.resultado.ok).length);
const textoBoton = computed(() => {
    if (!hayEliminaciones.value) return props.c.operaciones.length > 1 ? `Confirmar ${props.c.operaciones.length} acciones` : 'Confirmar';
    return props.c.operaciones.length > 1 ? `Sí, aplicar ${props.c.operaciones.length} acciones` : 'Sí, eliminar';
});
const esLista = (valor: unknown): valor is string[] => Array.isArray(valor);
</script>

<template>
    <article class="confirm" :class="[`estado-${c.estado}`, { peligro: hayEliminaciones }]" :aria-label="'Confirmación de acciones'">
        <header class="confirm-head">
            <span class="head-icon"><ShieldAlert :size="20" /></span>
            <div class="head-text">
                <p class="eyebrow-sm">{{ c.estado === 'pendiente' ? 'Revisa antes de confirmar' : 'Acciones propuestas' }}</p>
                <h3>{{ c.resumen || 'Cambios propuestos' }}</h3>
                <div class="counts">
                    <span v-if="conteo.crear" class="count crear"><Plus :size="12" />{{ conteo.crear }} nuevo{{ conteo.crear > 1 ? 's' : '' }}</span>
                    <span v-if="conteo.modificar" class="count modificar"><Pencil :size="12" />{{ conteo.modificar }} cambio{{ conteo.modificar > 1 ? 's' : '' }}</span>
                    <span v-if="conteo.eliminar" class="count eliminar"><Trash2 :size="12" />{{ conteo.eliminar }} eliminación{{ conteo.eliminar > 1 ? 'es' : '' }}</span>
                </div>
            </div>
        </header>

        <ol class="ops">
            <li v-for="(op, i) in c.operaciones" :key="i" class="op" :class="op.tipo">
                <div class="op-head">
                    <span class="badge" :class="op.tipo"><component :is="ICONO[op.tipo]" :size="13" />{{ ETIQUETA[op.tipo] }}</span>
                    <strong class="op-title">{{ op.titulo }}</strong>
                    <span v-if="op.resultado" class="op-result" :class="{ ok: op.resultado.ok }">
                        <CheckCircle2 v-if="op.resultado.ok" :size="15" /><XCircle v-else :size="15" />{{ op.resultado.mensaje }}
                    </span>
                </div>

                <p v-if="op.advertencia" class="warning"><AlertTriangle :size="15" />{{ op.advertencia }}</p>

                <p v-if="op.tipo === 'eliminar' && op.campos.length" class="lead">Se eliminará:</p>
                <dl v-if="op.campos.length" class="fields">
                    <template v-for="campo in op.campos" :key="campo.etiqueta">
                        <dt>{{ campo.etiqueta }}</dt>
                        <dd>
                            <template v-if="op.tipo === 'modificar' && campo.antes !== undefined">
                                <span class="before">
                                    <template v-if="esLista(campo.antes)">{{ campo.antes.join(', ') }}</template><template v-else>{{ campo.antes }}</template>
                                </span>
                                <ArrowRight :size="14" class="arrow" />
                            </template>
                            <ul v-if="esLista(op.tipo === 'eliminar' ? campo.antes : campo.despues)" class="value-list" :class="{ long: ((op.tipo === 'eliminar' ? campo.antes : campo.despues) as string[]).length > 8 }">
                                <li v-for="(item, j) in (op.tipo === 'eliminar' ? campo.antes : campo.despues) as string[]" :key="j">{{ item }}</li>
                            </ul>
                            <span v-else class="value">{{ op.tipo === 'eliminar' ? campo.antes : campo.despues }}</span>
                        </dd>
                    </template>
                </dl>
            </li>
        </ol>

        <footer class="confirm-foot">
            <template v-if="c.estado === 'pendiente'">
                <p class="hint">Nada se modifica hasta que confirmes.</p>
                <div class="buttons">
                    <button type="button" class="btn-secondary" @click="emit('decidir', false)">Cancelar</button>
                    <button type="button" class="btn-confirm" :class="{ danger: hayEliminaciones }" @click="emit('decidir', true)">
                        <Trash2 v-if="hayEliminaciones" :size="16" /><CheckCircle2 v-else :size="16" />{{ textoBoton }}
                    </button>
                </div>
            </template>
            <p v-else-if="c.estado === 'ejecutando'" class="status"><Loader2 :size="16" class="animate-spin" /> Aplicando cambios…</p>
            <p v-else-if="c.estado === 'completada'" class="status" :class="errores ? 'bad' : 'good'">
                <CheckCircle2 v-if="!errores" :size="16" /><AlertTriangle v-else :size="16" />
                {{ errores ? `${c.operaciones.length - errores} de ${c.operaciones.length} acciones aplicadas; ${errores} con error.` : 'Cambios aplicados.' }}
            </p>
            <p v-else-if="c.estado === 'rechazada'" class="status muted"><Ban :size="16" /> Cancelado. No se hizo ningún cambio.</p>
            <p v-else class="status muted"><CircleSlash :size="16" /> Sin confirmar. No se hizo ningún cambio.</p>
        </footer>
    </article>
</template>

<style scoped>
.confirm {
    --crear: #1a8a5c;
    --modificar: #b7791f;
    --eliminar: #d03b3b;
    border-radius: 1.25rem;
    border: 1px solid var(--card-border);
    background: var(--bg-card);
    box-shadow: var(--shadow-soft);
    overflow: hidden;
    animation: rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
:global(.dark) .confirm { --crear: #3cc48a; --modificar: #e0a645; --eliminar: #f06b6b; }
.confirm.estado-pendiente { border-color: color-mix(in srgb, var(--accent-color) 45%, var(--card-border)); box-shadow: 0 0 0 4px var(--accent-color-muted), var(--shadow-soft); }
.confirm.estado-pendiente.peligro { border-color: color-mix(in srgb, var(--eliminar) 50%, var(--card-border)); box-shadow: 0 0 0 4px color-mix(in srgb, var(--eliminar) 12%, transparent), var(--shadow-soft); }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.confirm-head { display: flex; gap: 0.85rem; padding: 1.1rem 1.2rem 0.9rem; }
.head-icon { width: 2.4rem; height: 2.4rem; flex-shrink: 0; display: grid; place-items: center; border-radius: 0.8rem; background: var(--accent-color-muted); color: var(--accent-color); }
.peligro .head-icon { background: color-mix(in srgb, var(--eliminar) 14%, transparent); color: var(--eliminar); }
.head-text { min-width: 0; }
.eyebrow-sm { font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; color: var(--text-muted); }
.head-text h3 { font-size: 1.02rem; font-weight: 650; margin-top: 0.15rem; line-height: 1.35; }
.counts { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
.count { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; }
.count.crear, .badge.crear { color: var(--crear); background: color-mix(in srgb, var(--crear) 12%, transparent); }
.count.modificar, .badge.modificar { color: var(--modificar); background: color-mix(in srgb, var(--modificar) 14%, transparent); }
.count.eliminar, .badge.eliminar { color: var(--eliminar); background: color-mix(in srgb, var(--eliminar) 12%, transparent); }

.ops { display: flex; flex-direction: column; gap: 0.6rem; padding: 0 1.2rem 1rem; max-height: 520px; overflow-y: auto; }
.op { border: 1px solid var(--card-border); border-left: 4px solid var(--crear); border-radius: 0.9rem; padding: 0.75rem 0.9rem; background: color-mix(in srgb, var(--crear) 3%, var(--bg-card)); }
.op.modificar { border-left-color: var(--modificar); background: color-mix(in srgb, var(--modificar) 3%, var(--bg-card)); }
.op.eliminar { border-left-color: var(--eliminar); background: color-mix(in srgb, var(--eliminar) 4%, var(--bg-card)); }
.op-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.badge { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.2rem 0.55rem; border-radius: 0.45rem; }
.op-title { font-weight: 600; font-size: 0.93rem; }
.op-result { margin-left: auto; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 600; color: var(--eliminar); }
.op-result.ok { color: var(--crear); }
.warning { display: flex; gap: 0.45rem; align-items: flex-start; margin-top: 0.6rem; font-size: 0.83rem; color: var(--eliminar); background: color-mix(in srgb, var(--eliminar) 8%, transparent); padding: 0.5rem 0.65rem; border-radius: 0.6rem; }
.warning svg { flex-shrink: 0; margin-top: 0.1rem; }
.op.modificar .warning { color: var(--modificar); background: color-mix(in srgb, var(--modificar) 9%, transparent); }
.lead { margin-top: 0.6rem; font-size: 0.8rem; font-weight: 700; color: var(--eliminar); }

.fields { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 0.35rem 1rem; margin-top: 0.6rem; font-size: 0.86rem; }
.fields dt { color: var(--text-muted); font-weight: 500; }
.fields dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; min-width: 0; overflow-wrap: anywhere; }
.op.eliminar .value { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--eliminar) 55%, transparent); }
.op.modificar .value { font-weight: 650; color: var(--text-primary); background: color-mix(in srgb, var(--modificar) 12%, transparent); padding: 0 0.3rem; border-radius: 0.3rem; }
.before { color: var(--text-muted); text-decoration: line-through; }
.arrow { color: var(--text-muted); align-self: center; }
.value-list { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; width: 100%; }
.value-list.long { max-height: 190px; overflow-y: auto; padding-right: 0.3rem; }
.value-list li { padding: 0.2rem 0.55rem; border-radius: 0.45rem; background: var(--surface-muted); }
.op.eliminar .value-list li { background: color-mix(in srgb, var(--eliminar) 8%, transparent); }
@media (max-width: 560px) { .fields { grid-template-columns: 1fr; } .fields dd { margin-bottom: 0.35rem; } }

.confirm-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.85rem 1.2rem; border-top: 1px solid var(--card-border); background: var(--surface-muted); }
.hint { font-size: 0.8rem; color: var(--text-muted); }
.buttons { display: flex; gap: 0.5rem; margin-left: auto; }
.btn-confirm { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.6rem 1.25rem; border-radius: 999px; font-weight: 650; color: #fff; background: var(--accent-color); transition: background 0.15s ease, transform 0.15s ease; }
.btn-confirm:hover { background: var(--accent-color-hover); transform: translateY(-1px); }
.btn-confirm.danger { background: var(--eliminar); }
.btn-confirm.danger:hover { background: color-mix(in srgb, var(--eliminar) 85%, black); }
.status { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.86rem; font-weight: 600; }
.status.good { color: var(--crear); }
.status.bad { color: var(--modificar); }
.status.muted { color: var(--text-muted); }
</style>
