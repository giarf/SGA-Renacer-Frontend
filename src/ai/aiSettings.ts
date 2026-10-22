// La API key la pone cada administrador y vive sólo en su navegador: nunca pasa por el backend.

export interface AiSettings {
    baseUrl: string;
    apiKey: string;
    model: string;
    recordar: boolean;
}

export const AI_PRESETS = [
    { nombre: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
    { nombre: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
    { nombre: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { nombre: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:14b' }
] as const;

const STORAGE_KEY = 'sga-dashboard-ai-settings';

const DEFAULTS: AiSettings = { baseUrl: AI_PRESETS[0].baseUrl, apiKey: '', model: AI_PRESETS[0].model, recordar: false };

const leer = (storage: Storage): Partial<AiSettings> | null => {
    try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const cargarAiSettings = (): AiSettings => {
    const guardado = leer(localStorage) ?? leer(sessionStorage);
    return { ...DEFAULTS, ...(guardado ?? {}) };
};

export const guardarAiSettings = (settings: AiSettings) => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        (settings.recordar ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Sin almacenamiento disponible la configuración dura sólo mientras la página esté abierta.
    }
};

export const borrarAiSettings = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nada que borrar.
    }
};
