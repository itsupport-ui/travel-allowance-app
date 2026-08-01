import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaEnvelope, FaIdBadge, FaShieldAlt, FaSignOutAlt, FaUserCircle } from "react-icons/fa"
import DoctorLayout from "../layouts/DoctorLayout"
import TherapistLayout from "../layouts/TherapistLayout"
import PageState from "../components/ui/PageState"
import ConfirmDialog from "../components/ui/ConfirmDialog"
import StatusBadge from "../components/ui/StatusBadge"
import { getCurrentUser } from "../services/authService"
import { getErrorMessage } from "../services/http"

function ProfilePage({ role }) {
  const Layout = role === "doctor" ? DoctorLayout : TherapistLayout
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [confirmingLogout, setConfirmingLogout] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setUser(await getCurrentUser(localStorage.getItem("token")))
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load profile"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Resolve the authenticated identity when the profile opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile()
  }, [loadProfile])

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    localStorage.removeItem("permissions")
    navigate("/")
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5">
          <h1 className="text-2xl font-black text-slate-900">My Profile</h1>
          <p className="mt-1 text-sm text-slate-500">Account identity and access details.</p>
        </header>
        <PageState loading={loading} error={error} onRetry={loadProfile} />
        {!loading && !error && user && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-4 border-b border-slate-200 bg-slate-50 p-6 text-center sm:flex-row sm:text-left">
              <FaUserCircle className="text-6xl text-slate-300" />
              <div className="flex-1">
                <h2 className="text-xl font-black text-slate-900">{user.username}</h2>
                <p className="mt-1 text-sm capitalize text-slate-500">{user.role}</p>
              </div>
              <StatusBadge status={user.is_active ? "active" : "inactive"} />
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-4">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><FaEnvelope /> Email</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{user.email}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-4">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><FaIdBadge /> Account ID</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">#{user.id}</p>
              </div>
              <div className="rounded-md border border-slate-200 p-4 sm:col-span-2">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><FaShieldAlt /> Access</p>
                <p className="mt-2 text-sm font-semibold capitalize text-slate-800">{user.role} portal</p>
                <p className="mt-1 text-xs text-slate-500">{user.permissions.length} permissions assigned</p>
              </div>
            </div>
            <div className="border-t border-slate-200 p-6">
              <button type="button" onClick={() => setConfirmingLogout(true)} className="inline-flex items-center gap-2 rounded-md bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800">
                <FaSignOutAlt /> Logout
              </button>
            </div>
          </section>
        )}
      </div>
      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        message="Your current session will end on this browser."
        confirmLabel="Log out"
        destructive
        onClose={() => setConfirmingLogout(false)}
        onConfirm={logout}
      />
    </Layout>
  )
}

export default ProfilePage
