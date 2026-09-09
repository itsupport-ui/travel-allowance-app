import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import AdminLayout from "../layouts/AdminLayout"
import PageState from "../components/ui/PageState"
import StatusBadge from "../components/ui/StatusBadge"
import {
  createOperationsStaff,
  getOperationsStaff,
  resetOperationsStaffPassword,
  updateOperationsStaff,
} from "../services/staffService"
import { getErrorMessage } from "../services/http"
import { isValidEmail, validatePassword } from "../utils/validation"

const ROLE_LABELS = {
  telecaller: "Telecaller",
  clinical_head: "Clinical Operations Head",
}

const emptyCreateForm = {
  username: "",
  email: "",
  password: "",
  role: "clinical_head",
}

function AdminOperationsStaffPage() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [resettingId, setResettingId] = useState(null)
  const [resetPassword, setResetPassword] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getOperationsStaff()
      setStaff(data)
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load operations staff"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (createForm.username.trim().length < 2) {
      toast.error("Name must contain at least 2 characters")
      return
    }
    if (!isValidEmail(createForm.email)) {
      toast.error("Enter a valid email address")
      return
    }
    const passwordError = validatePassword(createForm.password)
    if (passwordError) {
      toast.error(passwordError)
      return
    }

    setCreating(true)
    try {
      await createOperationsStaff({
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      })
      toast.success("Operations staff account created")
      setCreateForm(emptyCreateForm)
      load()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to create account"))
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (user) => {
    setEditingId(user.id)
    setEditForm({
      username: user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(null)
  }

  const saveEdit = async (userId) => {
    if (!isValidEmail(editForm.email)) {
      toast.error("Enter a valid email address")
      return
    }
    try {
      await updateOperationsStaff(userId, editForm)
      toast.success("Account updated")
      cancelEdit()
      load()
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to update account"))
    }
  }

  const submitPasswordReset = async (userId) => {
    const passwordError = validatePassword(resetPassword)
    if (passwordError) {
      toast.error(passwordError)
      return
    }
    try {
      await resetOperationsStaffPassword(userId, resetPassword)
      toast.success("Password reset")
      setResettingId(null)
      setResetPassword("")
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, "Unable to reset password"))
    }
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Operations Staff
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage named Telecaller and Clinical Operations Head
            accounts. Shared logins are not supported — every staff member
            should sign in with their own account.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-5 sm:p-6 grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Full Name
            </label>
            <input
              type="text"
              required
              value={createForm.username}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Temporary Password
            </label>
            <input
              type="password"
              required
              placeholder="Minimum 8 characters"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, password: e.target.value }))
              }
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Role
            </label>
            <select
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, role: e.target.value }))
              }
              className="w-full border border-gray-300 bg-gray-50/30 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="clinical_head">Clinical Operations Head</option>
              <option value="telecaller">Telecaller</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-8 py-2.5 rounded-xl transition-colors duration-150 shadow-sm"
            >
              {creating ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          {loading || error ? (
            <div className="p-6">
              <PageState loading={loading} error={error} onRetry={load} />
            </div>
          ) : staff.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No operations staff accounts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staff.map((user) => (
                    <tr key={user.id}>
                      {editingId === user.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              value={editForm.username}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  username: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              value={editForm.email}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  email: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                              value={editForm.role}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  role: e.target.value,
                                }))
                              }
                            >
                              <option value="clinical_head">
                                Clinical Operations Head
                              </option>
                              <option value="telecaller">Telecaller</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
                              <input
                                type="checkbox"
                                checked={editForm.is_active}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    is_active: e.target.checked,
                                  }))
                                }
                              />
                              Active
                            </label>
                          </td>
                          <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => saveEdit(user.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {user.username}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {user.email}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {ROLE_LABELS[user.role] || user.role}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={user.is_active ? "active" : "inactive"}
                            />
                          </td>
                          <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                            <button
                              onClick={() => startEdit(user)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            {resettingId === user.id ? (
                              <span className="inline-flex items-center gap-2">
                                <input
                                  type="password"
                                  placeholder="New password"
                                  value={resetPassword}
                                  onChange={(e) =>
                                    setResetPassword(e.target.value)
                                  }
                                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-32"
                                />
                                <button
                                  onClick={() => submitPasswordReset(user.id)}
                                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setResettingId(null)
                                    setResetPassword("")
                                  }}
                                  className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setResettingId(user.id)}
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                              >
                                Reset Password
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminOperationsStaffPage
