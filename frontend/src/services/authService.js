import api from './api';

export const loginUser = async (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
    return response.data;
};

export const getCurrentUser = async (token) => {
    const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
};

export const registerUser = async ( UserData, token ) => {
    const response = await api.post('/auth/register', UserData, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
}