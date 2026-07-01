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
