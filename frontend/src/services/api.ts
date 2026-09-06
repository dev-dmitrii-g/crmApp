import axios from 'axios';

// Автоматически подставляем IP/домен, с которого открыт сайт в браузере
const getBaseUrl = (): string => {
    const envUrl = import.meta.env.VITE_API_URL as string | undefined;

    // Если в .env / docker-compose прописан явный HTTP URL — берем его
    if (envUrl && envUrl.startsWith('http')) {
        return envUrl;
    }

    // Если VITE_API_URL прописан как относительный путь (например, '/api')
    if (envUrl && envUrl.startsWith('/')) {
        return envUrl;
    }

    // Для локальной сети: зашли по http://192.168.0.36:3000 -> запросы пойдут на http://192.168.0.36:8080/api
    const host = window.location.hostname;
    return `http://${host}:8080/api`;
};

const api = axios.create({
    baseURL: getBaseUrl(),
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// On 401 (expired or revoked session) — clear auth and reload to login screen.
// 503 means DB temporarily busy — do NOT log out, just let the request fail.
api.interceptors.response.use(
    res => res,
    err => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            window.location.reload();
        }
        return Promise.reject(err);
    },
);

export default api;