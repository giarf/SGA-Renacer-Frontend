import type { Confirmacion } from './aiActions';
import type { MensajeChat, Visualizacion } from './aiAgent';

// Los chats del Dashboard AI se guardan en el navegador de cada administrador.

export type Bloque =
    | { tipo: 'texto'; md: string; error?: boolean }
    | { tipo: 'viz'; v: Visualizacion }
    | { tipo: 'confirmacion'; c: Confirmacion };

export interface Turno {
    id: string;
    pregunta: string;
    pasos: string[];
    bloques: Bloque[];
    estado: 'trabajando' | 'listo' | 'error';
}

export interface Chat {
    id: string;
    titulo: string;
    actualizado: string;
    historial: MensajeChat[];
    turnos: Turno[];
}

const STORAGE_KEY = 'sga-dashboard-ai-chats-v1';
const MAX_CHATS = 40;
const MAX_FILAS_GUARDADAS = 300;

export const nuevoChat = (historial: MensajeChat[]): Chat => ({
    id: crypto.randomUUID(),
    titulo: 'Nuevo chat',
    actualizado: new Date().toISOString(),
    historial,
    turnos: []
});

export const cargarChats = (): Chat[] => {
    try {
        const chats = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Chat[];
        if (!Array.isArray(chats)) return [];
        // Lo que quedó a medias al cerrar la página no puede continuar.
        chats.forEach(chat => chat.turnos.forEach(turno => {
            if (turno.estado === 'trabajando') {
                turno.estado = 'error';
                turno.bloques.push({ tipo: 'texto', md: 'La consulta se interrumpió al cerrar la página.', error: true });
            }
            turno.bloques.forEach(b => {
                if (b.tipo === 'confirmacion' && (b.c.estado === 'pendiente' || b.c.estado === 'ejecutando')) b.c.estado = 'expirada';
            });
        }));
        return chats;
    } catch {
        return [];
    }
};

const compactar = (chat: Chat): Chat => ({
    ...chat,
    turnos: chat.turnos.map(t => ({
        ...t,
        bloques: t.bloques.map(b => (b.tipo === 'viz' ? { ...b, v: { ...b.v, resultado: { ...b.v.resultado, filas: b.v.resultado.filas.slice(0, MAX_FILAS_GUARDADAS) } } } : b))
    }))
});

export const guardarChats = (chats: Chat[]) => {
    let lista = chats.filter(c => c.turnos.length).slice(0, MAX_CHATS).map(compactar);
    // Si se llena el almacenamiento se descartan los chats más antiguos.
    while (lista.length) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
            return;
        } catch {
            lista = lista.slice(0, -1);
        }
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento */ }
};
