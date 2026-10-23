<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';

const props = defineProps<{ source: string }>();

// html: false escapa cualquier HTML del modelo, así el v-html sólo recibe markup generado por markdown-it.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const renderLinkPorDefecto = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx]!.attrSet('target', '_blank');
    tokens[idx]!.attrSet('rel', 'noopener noreferrer');
    return renderLinkPorDefecto(tokens, idx, options, env, self);
};
md.renderer.rules.table_open = () => '<div class="md-table"><table>';
md.renderer.rules.table_close = () => '</table></div>';

const html = computed(() => md.render(props.source ?? ''));
</script>

<template>
    <div class="md" v-html="html" />
</template>

<style scoped>
.md { line-height: 1.6; overflow-wrap: anywhere; min-width: 0; }
.md :deep(> * + *) { margin-top: 0.7rem; }
.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4) { font-weight: 700; line-height: 1.3; margin-top: 1.1rem; }
.md :deep(h1) { font-size: 1.3rem; } .md :deep(h2) { font-size: 1.15rem; } .md :deep(h3), .md :deep(h4) { font-size: 1rem; }
.md :deep(strong) { font-weight: 700; }
.md :deep(ul), .md :deep(ol) { padding-left: 1.35rem; }
.md :deep(ul) { list-style: disc; } .md :deep(ol) { list-style: decimal; }
.md :deep(li + li) { margin-top: 0.25rem; }
.md :deep(li::marker) { color: var(--text-muted); }
.md :deep(a) { color: var(--accent-color); text-decoration: underline; text-underline-offset: 2px; }
.md :deep(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; background: var(--surface-muted); padding: 0.1rem 0.35rem; border-radius: 0.35rem; }
.md :deep(pre) { background: var(--surface-muted); padding: 0.8rem 1rem; border-radius: 0.8rem; overflow-x: auto; }
.md :deep(pre code) { background: none; padding: 0; }
.md :deep(blockquote) { border-left: 3px solid var(--accent-color); padding-left: 0.85rem; color: var(--text-muted); }
.md :deep(hr) { border: 0; border-top: 1px solid var(--card-border); }
.md :deep(.md-table) { overflow-x: auto; border: 1px solid var(--card-border); border-radius: 0.85rem; background: var(--bg-card); }
.md :deep(table) { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.md :deep(th) { background: var(--surface-muted); color: var(--text-muted); font-weight: 600; text-align: left; padding: 0.55rem 0.8rem; white-space: nowrap; }
.md :deep(td) { padding: 0.5rem 0.8rem; border-top: 1px solid var(--card-border); font-variant-numeric: tabular-nums; }
.md :deep(tbody tr:hover) { background: color-mix(in srgb, var(--accent-color) 5%, transparent); }
</style>
