<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Download, FileDown, ImageDown, Table2, BarChart3 } from 'lucide-vue-next';
import type { FormatoValor, Visualizacion } from '../ai/aiAgent';
import type { Valor } from '../ai/queryEngine';

const props = defineProps<{ v: Visualizacion }>();

const contenedor = ref<HTMLElement | null>(null);
const ancho = ref(560);
const verTabla = ref(props.v.tipo === 'tabla');
const hover = ref<{ x: number; y: number; titulo: string; lineas: { serie: number; texto: string }[] } | null>(null);

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (!contenedor.value) return;
    observer = new ResizeObserver(entries => { ancho.value = Math.max(260, Math.floor(entries[0]?.contentRect.width ?? ancho.value)); });
    observer.observe(contenedor.value);
});
onBeforeUnmount(() => observer?.disconnect());

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const moneda = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });

const formatear = (valor: Valor, formato: FormatoValor = props.v.formato, corto = false) => {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'number') {
        if (formato === 'moneda') return corto && Math.abs(valor) >= 10000 ? `$${compacto.format(valor)}` : moneda.format(valor);
        if (formato === 'porcentaje') return `${numero.format(valor)}%`;
        return corto && Math.abs(valor) >= 10000 ? compacto.format(valor) : numero.format(valor);
    }
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (Array.isArray(valor)) return valor.join(', ');
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return new Date(valor).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return new Date(`${valor}T00:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
    if (/^\d{4}-\d{2}$/.test(valor)) return new Date(`${valor}-01T00:00:00`).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
    return valor;
};

const filas = computed(() => props.v.resultado.filas);
const xCampo = computed(() => props.v.x ?? props.v.resultado.columnas[0] ?? '');
const series = computed(() => props.v.y.length ? props.v.y : props.v.resultado.columnas.filter(c => c !== xCampo.value).slice(0, 1));
const valorNum = (fila: Record<string, Valor>, campo: string) => { const n = Number(fila[campo]); return Number.isFinite(n) ? n : 0; };

const tipoGrafico = computed(() => {
    if (props.v.tipo === 'barras' && (filas.value.length > 8 || filas.value.some(f => String(f[xCampo.value] ?? '').length > 18))) return 'barras_horizontales';
    return props.v.tipo;
});

const kpi = computed(() => {
    const campo = series.value[0];
    if (!campo) return null;
    const valor = filas.value.length === 1 ? filas.value[0]?.[campo] : filas.value.reduce((acc, f) => acc + valorNum(f, campo), 0);
    return { valor: formatear(valor), etiqueta: campo };
});

// Escala "agradable" para los ejes: 4-5 marcas en múltiplos de 1, 2 o 5.
const escala = (maximo: number, marcas = 4) => {
    if (maximo <= 0) return { max: 1, ticks: [0, 1] };
    const paso = Math.pow(10, Math.floor(Math.log10(maximo / marcas)));
    const factor = [1, 2, 5, 10].find(f => (maximo / (paso * f)) <= marcas) ?? 10;
    const tamano = paso * factor;
    const max = Math.ceil(maximo / tamano) * tamano;
    return { max, ticks: Array.from({ length: Math.round(max / tamano) + 1 }, (_, i) => i * tamano) };
};

const maximo = computed(() => Math.max(0, ...filas.value.flatMap(f => series.value.map(s => valorNum(f, s)))));

const ALTO = 260;
const M = { top: 12, right: 12, bottom: 44, left: 52 };

const barras = computed(() => {
    const { max, ticks } = escala(maximo.value);
    const ancho_ = ancho.value - M.left - M.right;
    const alto = ALTO - M.top - M.bottom;
    const banda = ancho_ / Math.max(1, filas.value.length);
    const grupo = Math.min(banda * 0.72, 30 * series.value.length + 6);
    const anchoBarra = Math.max(3, (grupo - 2 * (series.value.length - 1)) / series.value.length);
    const maxChars = Math.max(3, Math.floor(banda / 6.5));
    return {
        ticks: ticks.map(t => ({ valor: t, y: M.top + alto - (t / max) * alto })),
        base: M.top + alto,
        grupos: filas.value.map((fila, i) => {
            const centro = M.left + banda * i + banda / 2;
            const etiqueta = String(formatear(fila[xCampo.value], 'numero'));
            return {
                fila,
                centro,
                banda,
                etiqueta: etiqueta.length > maxChars ? `${etiqueta.slice(0, maxChars - 1)}…` : etiqueta,
                barras: series.value.map((s, j) => {
                    const h = (valorNum(fila, s) / max) * alto;
                    return { serie: j, x: centro - grupo / 2 + j * (anchoBarra + 2), y: M.top + alto - h, w: anchoBarra, h };
                })
            };
        })
    };
});

const FILA_H = 30;
const horizontales = computed(() => {
    const etiquetaAncho = Math.min(180, ancho.value * 0.36);
    const valorAncho = 70;
    const disponible = ancho.value - etiquetaAncho - valorAncho;
    const max = maximo.value || 1;
    const alturaGrupo = FILA_H * Math.max(1, series.value.length * 0.7);
    const maxChars = Math.floor(etiquetaAncho / 7);
    return {
        alto: filas.value.length * alturaGrupo + 8,
        etiquetaAncho,
        filas: filas.value.map((fila, i) => {
            const etiqueta = String(formatear(fila[xCampo.value], 'numero'));
            const y = i * alturaGrupo + 4;
            const barraAlto = Math.min(18, (alturaGrupo - 8) / series.value.length - 2);
            return {
                fila,
                y,
                alturaGrupo,
                etiqueta: etiqueta.length > maxChars ? `${etiqueta.slice(0, maxChars - 1)}…` : etiqueta,
                completa: etiqueta,
                barras: series.value.map((s, j) => {
                    const w = Math.max(2, (valorNum(fila, s) / max) * disponible);
                    return { serie: j, x: etiquetaAncho, y: y + 4 + j * (barraAlto + 2), w, h: barraAlto, texto: formatear(fila[s], props.v.formato, true) };
                })
            };
        })
    };
});

const lineas = computed(() => {
    const { max, ticks } = escala(maximo.value);
    const ancho_ = ancho.value - M.left - M.right;
    const alto = ALTO - M.top - M.bottom;
    const n = filas.value.length;
    const xDe = (i: number) => M.left + (n <= 1 ? ancho_ / 2 : (i / (n - 1)) * ancho_);
    const yDe = (v: number) => M.top + alto - (v / max) * alto;
    const cadaCuanto = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(ancho_ / 80))));
    return {
        ticks: ticks.map(t => ({ valor: t, y: yDe(t) })),
        base: M.top + alto,
        etiquetas: filas.value.map((f, i) => ({ x: xDe(i), texto: String(formatear(f[xCampo.value], 'numero')), visible: i % cadaCuanto === 0 || i === n - 1 })),
        puntos: filas.value.map((f, i) => ({ x: xDe(i), fila: f })),
        series: series.value.map((s, j) => ({
            serie: j,
            nombre: s,
            path: filas.value.map((f, i) => `${i ? 'L' : 'M'}${xDe(i).toFixed(1)},${yDe(valorNum(f, s)).toFixed(1)}`).join(' '),
            puntos: filas.value.map((f, i) => ({ x: xDe(i), y: yDe(valorNum(f, s)) }))
        }))
    };
});

const torta = computed(() => {
    const campo = series.value[0] ?? '';
    const ordenadas = [...filas.value].filter(f => valorNum(f, campo) > 0).sort((a, b) => valorNum(b, campo) - valorNum(a, campo));
    const principales = ordenadas.slice(0, 5).map(f => ({ etiqueta: String(formatear(f[xCampo.value], 'numero')), valor: valorNum(f, campo), otros: false }));
    const resto = ordenadas.slice(5).reduce((acc, f) => acc + valorNum(f, campo), 0);
    if (resto > 0) principales.push({ etiqueta: 'Otros', valor: resto, otros: true });
    const total = principales.reduce((acc, p) => acc + p.valor, 0) || 1;
    const R = 92;
    const r = 58;
    let angulo = -Math.PI / 2;
    const punto = (a: number, radio: number) => `${(110 + radio * Math.cos(a)).toFixed(2)},${(110 + radio * Math.sin(a)).toFixed(2)}`;
    return {
        total,
        partes: principales.map((p, i) => {
            const inicio = angulo;
            const barrido = (p.valor / total) * Math.PI * 2;
            angulo += barrido;
            const fin = inicio + Math.min(barrido, Math.PI * 2 - 0.0001);
            const grande = barrido > Math.PI ? 1 : 0;
            return {
                ...p,
                serie: p.otros ? -1 : i,
                pct: Math.round((p.valor / total) * 1000) / 10,
                d: `M${punto(inicio, R)} A${R},${R} 0 ${grande} 1 ${punto(fin, R)} L${punto(fin, r)} A${r},${r} 0 ${grande} 0 ${punto(inicio, r)} Z`
            };
        })
    };
});

const mostrarHover = (evento: MouseEvent, titulo: string, fila: Record<string, Valor>) => {
    const rect = contenedor.value?.getBoundingClientRect();
    if (!rect) return;
    hover.value = {
        x: evento.clientX - rect.left,
        y: evento.clientY - rect.top,
        titulo,
        lineas: series.value.map((s, i) => ({ serie: i, texto: `${s}: ${formatear(fila[s])}` }))
    };
};

const columnasTabla = computed(() => props.v.resultado.columnas);

const nombreArchivo = (extension: string) => `${props.v.titulo.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || 'grafico'}.${extension}`;

const descargar = (blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const articulo = ref<HTMLElement | null>(null);
const exportando = ref(false);
const puedeExportarImagen = computed(() => props.v.tipo !== 'tabla' && !verTabla.value && (props.v.tipo === 'kpi' || filas.value.length > 0));

// Las clases y variables CSS no existen dentro de una imagen, así que se copian los estilos ya resueltos.
const ESTILOS_SVG = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'font-variant-numeric', 'text-anchor', 'dominant-baseline', 'display'];
const inlinearEstilos = (origen: Element, copia: Element) => {
    const estilo = getComputedStyle(origen);
    // Los bordes color tarjeta separan porciones en pantalla, pero sobre un fondo transparente se verían como líneas blancas.
    const sinBorde = origen.classList.contains('slice') || origen.classList.contains('ring');
    copia.setAttribute('style', ESTILOS_SVG.map(p => `${p}:${sinBorde && p === 'stroke' ? 'none' : estilo.getPropertyValue(p)}`).join(';'));
    copia.removeAttribute('class');
    Array.from(origen.children).forEach((hijo, i) => { const c = copia.children[i]; if (c) inlinearEstilos(hijo, c); });
};

const xml = (texto: string) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Compone título, leyenda y gráfico en un único SVG autónomo, sin fondo.
const construirSvg = () => {
    if (!articulo.value || !contenedor.value) throw new Error('No se pudo generar la imagen.');
    const estilo = getComputedStyle(articulo.value);
    const fuente = estilo.fontFamily.replace(/"/g, "'");
    const primario = estilo.color;
    const secundario = estilo.getPropertyValue('--text-muted').trim() || '#5d626a';
    const grafico = contenedor.value.querySelector('svg');
    const PAD = 24;
    const anchoGrafico = grafico ? Number(grafico.getAttribute('width')) || grafico.getBoundingClientRect().width : 320;
    const W = Math.max(anchoGrafico, 320) + PAD * 2;
    const partes: string[] = [];
    let y = PAD;

    partes.push(`<text x="${PAD}" y="${y + 18}" font-size="18" font-weight="700" fill="${primario}">${xml(props.v.titulo)}</text>`);
    y += 28;
    if (props.v.subtitulo) {
        partes.push(`<text x="${PAD}" y="${y + 13}" font-size="13" fill="${secundario}">${xml(props.v.subtitulo)}</text>`);
        y += 22;
    }
    y += 8;

    const leyenda = Array.from(contenedor.value.querySelectorAll('.legend li'));
    if (leyenda.length) {
        let x = PAD;
        leyenda.forEach(item => {
            const muestra = item.querySelector('i');
            const color = muestra ? getComputedStyle(muestra).backgroundColor : primario;
            const texto = (item.textContent ?? '').trim();
            const anchoItem = 18 + texto.length * 7 + 16;
            if (x + anchoItem > W - PAD && x > PAD) { x = PAD; y += 22; }
            partes.push(`<rect x="${x}" y="${y + 2}" width="11" height="11" rx="3" fill="${color}"/><text x="${x + 17}" y="${y + 12}" font-size="12" fill="${primario}">${xml(texto)}</text>`);
            x += anchoItem;
        });
        y += 30;
    }

    if (props.v.tipo === 'kpi' && kpi.value) {
        partes.push(`<text x="${PAD}" y="${y + 50}" font-size="54" font-weight="750" letter-spacing="-1.5" fill="${primario}">${xml(String(kpi.value.valor))}</text>`);
        partes.push(`<text x="${PAD}" y="${y + 78}" font-size="14" fill="${secundario}">${xml(kpi.value.etiqueta)}</text>`);
        y += 90;
    } else if (grafico) {
        const copia = grafico.cloneNode(true) as SVGSVGElement;
        inlinearEstilos(grafico, copia);
        copia.querySelectorAll('[data-export="omitir"]').forEach(el => el.remove());
        const altoGrafico = Number(grafico.getAttribute('height')) || grafico.getBoundingClientRect().height;
        copia.setAttribute('x', String((W - anchoGrafico) / 2));
        copia.setAttribute('y', String(y));
        copia.setAttribute('overflow', 'visible');
        partes.push(new XMLSerializer().serializeToString(copia));
        y += altoGrafico;
    }

    const H = y + PAD;
    return { W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fuente}">${partes.join('')}</svg>` };
};

const descargarImagen = async (formato: 'png' | 'svg') => {
    if (exportando.value) return;
    exportando.value = true;
    hover.value = null;
    try {
        const { W, H, svg } = construirSvg();
        if (formato === 'svg') {
            descargar(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), nombreArchivo('svg'));
            return;
        }
        const imagen = new Image();
        await new Promise<void>((resolve, reject) => {
            imagen.onload = () => resolve();
            imagen.onerror = () => reject(new Error('No se pudo generar la imagen.'));
            imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });

        // Cuádruple resolución para que aguante impresión y proyección; el lienzo queda transparente.
        const escala = 4;
        const canvas = document.createElement('canvas');
        canvas.width = W * escala;
        canvas.height = H * escala;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('El navegador no permite generar imágenes.');
        ctx.scale(escala, escala);
        ctx.drawImage(imagen, 0, 0, W, H);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo generar la imagen.');
        descargar(blob, nombreArchivo('png'));
    } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : 'No se pudo generar la imagen.');
    } finally {
        exportando.value = false;
    }
};

const descargarCsv = () => {
    const escapar = (valor: Valor) => {
        const texto = Array.isArray(valor) ? valor.join('; ') : String(valor ?? '');
        return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const csv = [columnasTabla.value.map(escapar).join(','), ...filas.value.map(f => columnasTabla.value.map(c => escapar(f[c])).join(','))].join('\n');
    descargar(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), nombreArchivo('csv'));
};
</script>

<template>
    <article ref="articulo" class="viz surface-card" :class="{ 'viz-kpi': v.tipo === 'kpi' }">
        <header class="viz-head">
            <div>
                <h3>{{ v.titulo }}</h3>
                <p v-if="v.subtitulo" class="viz-sub">{{ v.subtitulo }}</p>
            </div>
            <div class="viz-actions">
                <button v-if="v.tipo !== 'tabla' && v.tipo !== 'kpi'" type="button" class="icon-btn" :aria-pressed="verTabla" :title="verTabla ? 'Ver gráfico' : 'Ver tabla'" @click="verTabla = !verTabla">
                    <BarChart3 v-if="verTabla" :size="16" /><Table2 v-else :size="16" />
                </button>
                <button v-if="puedeExportarImagen" type="button" class="icon-btn btn-descarga" :disabled="exportando" title="Descargar imagen PNG (sin fondo)" aria-label="Descargar imagen PNG" @click="descargarImagen('png')"><ImageDown :size="15" />PNG</button>
                <button v-if="puedeExportarImagen" type="button" class="icon-btn btn-descarga" :disabled="exportando" title="Descargar imagen vectorial SVG (sin fondo, calidad ilimitada)" aria-label="Descargar imagen SVG" @click="descargarImagen('svg')"><FileDown :size="15" />SVG</button>
                <button v-if="v.tipo !== 'kpi'" type="button" class="icon-btn btn-descarga" title="Descargar CSV" aria-label="Descargar CSV" @click="descargarCsv"><Download :size="15" />CSV</button>
            </div>
        </header>

        <div ref="contenedor" class="viz-body" @mouseleave="hover = null">
            <div v-if="v.tipo === 'kpi' && kpi" class="kpi">
                <strong>{{ kpi.valor }}</strong>
                <span>{{ kpi.etiqueta }}</span>
            </div>

            <p v-else-if="!filas.length" class="viz-empty">La consulta no devolvió resultados.</p>

            <div v-else-if="verTabla" class="viz-table">
                <table>
                    <thead><tr><th v-for="c in columnasTabla" :key="c">{{ c }}</th></tr></thead>
                    <tbody>
                        <tr v-for="(f, i) in filas" :key="i">
                            <td v-for="c in columnasTabla" :key="c" :class="{ num: typeof f[c] === 'number' }">{{ formatear(f[c], series.includes(c) ? v.formato : 'numero') }}</td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="v.resultado.total > filas.length" class="viz-sub">Mostrando {{ filas.length }} de {{ v.resultado.total }} filas.</p>
            </div>

            <template v-else>
                <ul v-if="series.length > 1 || tipoGrafico === 'torta'" class="legend">
                    <template v-if="tipoGrafico === 'torta'">
                        <li v-for="p in torta.partes" :key="p.etiqueta"><i :class="p.otros ? 'sw-otros' : `sw-${p.serie}`" />{{ p.etiqueta }} <b>{{ p.pct }}%</b></li>
                    </template>
                    <template v-else>
                        <li v-for="(s, i) in series" :key="s"><i :class="`sw-${i}`" />{{ s }}</li>
                    </template>
                </ul>

                <svg v-if="tipoGrafico === 'barras'" :width="ancho" :height="ALTO" role="img" :aria-label="v.titulo">
                    <g class="grid">
                        <g v-for="t in barras.ticks" :key="t.valor">
                            <line :x1="M.left" :x2="ancho - M.right" :y1="t.y" :y2="t.y" />
                            <text :x="M.left - 8" :y="t.y + 4" text-anchor="end">{{ formatear(t.valor, v.formato, true) }}</text>
                        </g>
                    </g>
                    <g v-for="g in barras.grupos" :key="g.etiqueta + g.centro">
                        <rect class="hit" data-export="omitir" :x="g.centro - g.banda / 2" :y="M.top" :width="g.banda" :height="barras.base - M.top" @mousemove="mostrarHover($event, String(formatear(g.fila[xCampo], 'numero')), g.fila)" />
                        <path v-for="b in g.barras" :key="b.serie" :class="`fill-${b.serie}`" :d="`M${b.x},${barras.base} V${b.y + Math.min(4, b.h)} q0,-${Math.min(4, b.h)} ${Math.min(4, b.w / 2)},-${Math.min(4, b.h)} H${b.x + b.w - Math.min(4, b.w / 2)} q${Math.min(4, b.w / 2)},0 ${Math.min(4, b.w / 2)},${Math.min(4, b.h)} V${barras.base} Z`" pointer-events="none" />
                        <text class="axis-label" :x="g.centro" :y="barras.base + 18" text-anchor="middle">{{ g.etiqueta }}</text>
                    </g>
                    <line class="baseline" :x1="M.left" :x2="ancho - M.right" :y1="barras.base" :y2="barras.base" />
                </svg>

                <svg v-else-if="tipoGrafico === 'barras_horizontales'" :width="ancho" :height="horizontales.alto" role="img" :aria-label="v.titulo">
                    <g v-for="f in horizontales.filas" :key="f.completa + f.y">
                        <rect class="hit" data-export="omitir" x="0" :y="f.y" :width="ancho" :height="f.alturaGrupo" @mousemove="mostrarHover($event, f.completa, f.fila)" />
                        <text class="axis-label" :x="horizontales.etiquetaAncho - 10" :y="f.y + f.alturaGrupo / 2 + 2" text-anchor="end" dominant-baseline="middle">{{ f.etiqueta }}</text>
                        <g v-for="b in f.barras" :key="b.serie" pointer-events="none">
                            <rect :class="`fill-${b.serie}`" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="4" />
                            <text class="value-label" :x="b.x + b.w + 6" :y="b.y + b.h / 2 + 1" dominant-baseline="middle">{{ b.texto }}</text>
                        </g>
                    </g>
                </svg>

                <svg v-else-if="tipoGrafico === 'lineas'" :width="ancho" :height="ALTO" role="img" :aria-label="v.titulo">
                    <g class="grid">
                        <g v-for="t in lineas.ticks" :key="t.valor">
                            <line :x1="M.left" :x2="ancho - M.right" :y1="t.y" :y2="t.y" />
                            <text :x="M.left - 8" :y="t.y + 4" text-anchor="end">{{ formatear(t.valor, v.formato, true) }}</text>
                        </g>
                    </g>
                    <template v-for="e in lineas.etiquetas" :key="e.x">
                        <text v-if="e.visible" class="axis-label" :x="e.x" :y="lineas.base + 18" text-anchor="middle">{{ e.texto }}</text>
                    </template>
                    <path v-for="s in lineas.series" :key="s.nombre" :class="`linea-${s.serie}`" :d="s.path" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
                    <template v-for="s in lineas.series" :key="`p-${s.nombre}`">
                        <circle v-for="(p, i) in s.puntos" v-show="lineas.puntos.length <= 24 || (hover && Math.abs(hover.x - p.x) < 1)" :key="i" :class="`fill-${s.serie} ring`" :cx="p.x" :cy="p.y" r="4" />
                    </template>
                    <rect v-for="(p, i) in lineas.puntos" :key="`h-${i}`" class="hit" data-export="omitir" :x="p.x - (ancho / Math.max(2, lineas.puntos.length)) / 2" :y="M.top" :width="ancho / Math.max(2, lineas.puntos.length)" :height="lineas.base - M.top" @mousemove="mostrarHover($event, String(formatear(p.fila[xCampo], 'numero')), p.fila)" />
                    <line class="baseline" :x1="M.left" :x2="ancho - M.right" :y1="lineas.base" :y2="lineas.base" />
                </svg>

                <div v-else-if="tipoGrafico === 'torta'" class="donut">
                    <svg viewBox="0 0 220 220" width="220" height="220" role="img" :aria-label="v.titulo">
                        <path v-for="p in torta.partes" :key="p.etiqueta" :class="p.otros ? 'fill-otros' : `fill-${p.serie}`" class="slice" :d="p.d" />
                        <text x="110" y="106" text-anchor="middle" class="donut-total">{{ formatear(torta.total, v.formato, true) }}</text>
                        <text x="110" y="126" text-anchor="middle" class="axis-label">total</text>
                    </svg>
                </div>
            </template>

            <div v-if="hover" class="tooltip" :style="{ left: `${Math.min(hover.x + 14, ancho - 180)}px`, top: `${hover.y + 14}px` }">
                <strong>{{ hover.titulo }}</strong>
                <span v-for="l in hover.lineas" :key="l.serie"><i :class="`sw-${l.serie}`" />{{ l.texto }}</span>
            </div>
        </div>
    </article>
</template>

<style scoped>
.viz {
    --series-0: #2a78d6;
    --series-1: #eb6834;
    --series-2: #1baf7a;
    --series-3: #eda100;
    --series-4: #e87ba4;
    --series-otros: #a3a7b0;
    --grid: color-mix(in srgb, var(--text-primary) 9%, transparent);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.1rem 1.2rem 1.2rem;
    border-radius: 1.25rem;
    min-width: 0;
    animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
:global(.dark) .viz {
    --series-0: #3987e5;
    --series-1: #d95926;
    --series-2: #199e70;
    --series-3: #c98500;
    --series-4: #d55181;
    --series-otros: #5d616b;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.viz-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 0.75rem; align-items: flex-start; }
.viz-head h3 { font-size: 0.98rem; font-weight: 650; line-height: 1.3; }
.viz-sub { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.15rem; }
.viz-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }
.icon-btn { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 999px; color: var(--text-muted); transition: background 0.15s ease, color 0.15s ease; }
.btn-descarga { display: inline-flex; gap: 0.3rem; width: auto; padding: 0 0.6rem; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; }
.icon-btn:hover, .icon-btn[aria-pressed="true"] { background: var(--surface-muted); color: var(--text-primary); }

.viz-body { position: relative; min-width: 0; }
.viz-empty { color: var(--text-muted); font-size: 0.9rem; padding: 1.5rem 0; text-align: center; }

.kpi { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.4rem 0 0.2rem; }
.kpi strong { font-size: clamp(2.4rem, 6vw, 3.4rem); font-weight: 750; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.kpi span { color: var(--text-muted); font-size: 0.85rem; }

svg { display: block; overflow: visible; }
svg text { font-size: 11px; fill: var(--text-muted); font-variant-numeric: tabular-nums; }
.grid line { stroke: var(--grid); stroke-width: 1; }
.baseline { stroke: color-mix(in srgb, var(--text-primary) 25%, transparent); stroke-width: 1; }
.axis-label { fill: var(--text-muted); }
.value-label { fill: var(--text-primary); font-weight: 600; }
.hit { fill: transparent; cursor: crosshair; }
.hit:hover { fill: color-mix(in srgb, var(--text-primary) 4%, transparent); }
.ring { stroke: var(--bg-card); stroke-width: 2; }
.slice { stroke: var(--bg-card); stroke-width: 2; }
.donut { display: flex; justify-content: center; }
.donut-total { font-size: 22px; font-weight: 700; fill: var(--text-primary); }

.fill-0 { fill: var(--series-0); } .fill-1 { fill: var(--series-1); } .fill-2 { fill: var(--series-2); }
.fill-3 { fill: var(--series-3); } .fill-4 { fill: var(--series-4); } .fill-otros { fill: var(--series-otros); }
/* No usar stroke-N: choca con las utilidades de Tailwind que fijan stroke-width. */
.linea-0 { stroke: var(--series-0); } .linea-1 { stroke: var(--series-1); } .linea-2 { stroke: var(--series-2); }
.sw-0 { background: var(--series-0); } .sw-1 { background: var(--series-1); } .sw-2 { background: var(--series-2); }
.sw-3 { background: var(--series-3); } .sw-4 { background: var(--series-4); } .sw-otros { background: var(--series-otros); }

.legend { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; font-size: 0.8rem; color: var(--text-primary); margin-bottom: 0.5rem; }
.legend li { display: inline-flex; align-items: center; gap: 0.4rem; }
.legend b { color: var(--text-muted); font-weight: 600; }
.legend i, .tooltip i { width: 0.65rem; height: 0.65rem; border-radius: 3px; display: inline-block; flex-shrink: 0; }

.tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 140px;
    max-width: 240px;
    padding: 0.55rem 0.7rem;
    border-radius: 0.7rem;
    background: var(--bg-card);
    border: 1px solid var(--card-border);
    box-shadow: var(--shadow-soft);
    font-size: 0.78rem;
}
.tooltip span { display: flex; align-items: center; gap: 0.4rem; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.viz-table { max-height: 360px; overflow: auto; border: 1px solid var(--card-border); border-radius: 0.8rem; }
.viz-table table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.viz-table th { position: sticky; top: 0; background: var(--surface-muted); text-align: left; font-weight: 600; padding: 0.5rem 0.7rem; color: var(--text-muted); white-space: nowrap; }
.viz-table td { padding: 0.45rem 0.7rem; border-top: 1px solid var(--card-border); }
.viz-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.viz-table .viz-sub { padding: 0.5rem 0.7rem; }
</style>
