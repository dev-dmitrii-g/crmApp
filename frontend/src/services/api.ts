import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080/api',
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// On 401 (expired or revoked session) — clear auth and reload to login screen.
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