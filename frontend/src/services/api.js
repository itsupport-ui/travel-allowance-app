import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

if (!API_URL) {
  throw new Error('VITE_API_URL is not configured');
}

const api = axios.create({
  baseURL: API_URL,
});

export default api;
