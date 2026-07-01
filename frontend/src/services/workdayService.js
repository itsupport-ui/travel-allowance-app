
const API_URL = "http://localhost:8000";

export const startWorkDay = async (token, payload) => {
  const response = await fetch(
    `${API_URL}/therapist/workday/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || "Failed to start work day")
  }

  return response.json()
}
