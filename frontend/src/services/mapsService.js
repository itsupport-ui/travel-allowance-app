import api from "./api";

export const getDistance = async ( fromLocation, toLocation, token ) => {
    const response = await api.get(
        "/maps/distance",
        {
            params: { from_location: fromLocation, to_location: toLocation },
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    return response.data;
};

export const reverseGeocode = async ( latitude, longitude, token ) => {
    const response = await api.get(
        "/maps/reverse-geocode",
        {
            params: { latitude, longitude },
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    return response.data;
};

export const getAddressSuggestions = async (query, sessionToken) => {
    const response = await api.get("/maps/autocomplete", {
        params: { q: query, session_token: sessionToken },
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    return response.data?.suggestions || [];
};

export const getPlaceLocation = async (placeId, sessionToken) => {
    const response = await api.get("/maps/place", {
        params: { place_id: placeId, session_token: sessionToken },
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    return response.data;
};
