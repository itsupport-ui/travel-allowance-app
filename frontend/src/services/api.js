import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

if (!API_URL) {
  throw new Error('VITE_API_URL is not configured');
}

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && localStorage.getItem("token")) {
      localStorage.removeItem("token")
      localStorage.removeItem("role")
      localStorage.removeItem("permissions")
      if (window.location.pathname !== "/") {
        window.location.assign("/?reason=session_expired")
      }
    }
    return Promise.reject(error)
  },
)

export default api;
