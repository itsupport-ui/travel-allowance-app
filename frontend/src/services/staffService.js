import api from "./api"
import { authConfig } from "./http"

export const getTherapistsForManagement = async () => {
  const response = await api.get("/therapists/manage", authConfig())
  return response.data
}

export const updateTherapist = async (therapistId, payload) => {
  const response = await api.put(
    `/therapists/${therapistId}`,
    payload,
    authConfig(),
  )
  return response.data
}

export const getDoctorsForManagement = async () => {
  const response = await api.get("/doctors/manage", authConfig())
  return response.data
}

export const createDoctorUser = async (payload) => {
  const response = await api.post("/users/doctors", payload, authConfig())
  return response.data
}

export const createDoctorProfile = async (payload) => {
  const response = await api.post("/doctors/", payload, authConfig())
  return response.data
}

export const updateDoctor = async (doctorId, payload) => {
  const response = await api.put(
    `/doctors/${doctorId}`,
    payload,
    authConfig(),
  )
  return response.data
}
