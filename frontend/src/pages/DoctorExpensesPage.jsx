import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import {
  FaBus,
  FaCalendarDay,
  FaEdit,
  FaFileInvoice,
  FaPlus,
  FaReceipt,
  FaRupeeSign,
  FaTrash,
  FaUpload,
} from "react-icons/fa"

import DoctorLayout from "../layouts/DoctorLayout"
import {
  createDoctorExpense,
  deleteDoctorExpense,
  getMyDoctorExpenses,
  getTodayDoctorExpenses,
  openDoctorExpenseProof,
  updateDoctorExpense,
} from "../services/doctorExpenseService"
import { getTodayCompletedDoctorVisits } from "../services/doctorVisitService"


const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500"


const getLocalDate = () => {
  const now = new Date()
  const localTime = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  )
  return localTime.toISOString().slice(0, 10)
}


const createInitialForm = () => ({
  expense_date: getLocalDate(),
  from_location: "",
  to_location: "",
  transport_mode: "",
  fare: "",
  remarks: "",
  visit_id: "",
  entry_mode: "visit",
  expense_category: "public_transport",
  manual_reason: "",
  correction_reason: "",
})


const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ")
  }
  return fallback
}


const formatDate = (value) => {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}


const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)


const getProofFilename = (proofFile) => {
  if (!proofFile) return null
  return proofFile.split(/[\\/]/).pop()
}


function Modal({ title, description, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1.5 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  )
}


function StatusBadge({ expense }) {
  const normalized =
    expense.visit_id == null && expense.manual_review_status
      ? expense.manual_review_status
      : expense.status || "draft"
  const colorMap = {
    draft: "border-amber-200 bg-amber-50 text-amber-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    changes_requested: "border-rose-200 bg-rose-50 text-rose-700",
    cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${
        colorMap[normalized] || colorMap.draft
      }`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  )
}


function ReceiptUpload({
  selectedFile,
  existingProof,
  onChange,
  onOpenExisting,
  required = false,
}) {
  return (
    <div>
      <label className={labelClass}>
        Receipt {required ? "*" : "(optional)"}
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-blue-400 hover:bg-blue-50/50">
        <div className="rounded-lg bg-white p-2.5 text-blue-600 shadow-sm">
          <FaUpload />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-700">
            {selectedFile?.name ||
              getProofFilename(existingProof) ||
              "Choose receipt file"}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            PDF, JPG, JPEG, or PNG
          </p>
        </div>
        <input
          type="file"
          required={required && !existingProof}
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={onChange}
          className="sr-only"
        />
      </label>
      {existingProof && !selectedFile && (
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>Choose a new file only to replace the current receipt.</span>
          {onOpenExisting && (
            <button type="button" className="font-bold text-blue-700 underline" onClick={onOpenExisting}>
              View receipt
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function DoctorExpensesPage() {
  const [todayExpenses, setTodayExpenses] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [activeTab, setActiveTab] = useState("today")
  const [isLoading, setIsLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [expenseForm, setExpenseForm] = useState(createInitialForm)
  const [proofFile, setProofFile] = useState(null)
  const [visitOptions, setVisitOptions] = useState([])
  const [visitSearch, setVisitSearch] = useState("")

  const loadExpenses = async () => {
    const token = localStorage.getItem("token")
    const [todayData, allData] = await Promise.all([
      getTodayDoctorExpenses(token),
      getMyDoctorExpenses(token),
    ])
    setTodayExpenses(todayData || [])
    setAllExpenses(allData || [])
    const options = await getTodayCompletedDoctorVisits(token)
    setVisitOptions(options || [])
  }

  useEffect(() => {
    const token = localStorage.getItem("token")

    Promise.all([
      getTodayDoctorExpenses(token),
      getMyDoctorExpenses(token),
      getTodayCompletedDoctorVisits(token),
    ])
      .then(([todayData, allData, options]) => {
        setTodayExpenses(todayData || [])
        setAllExpenses(allData || [])
        setVisitOptions(options || [])
      })
      .catch((error) => {
        toast.error(
          getErrorMessage(error, "Failed to load doctor expenses")
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const todayTotal = useMemo(
    () =>
      todayExpenses.reduce(
        (total, expense) => total + Number(expense.fare || 0),
        0
      ),
    [todayExpenses]
  )

  const visibleExpenses =
    activeTab === "today" ? todayExpenses : allExpenses
  const availableVisitOptions = useMemo(
    () =>
      visitOptions.filter(
        (option) =>
          option.expense_id == null ||
          option.visit_id === selectedExpense?.visit_id
      ),
    [selectedExpense?.visit_id, visitOptions]
  )
  const filteredVisitOptions = useMemo(() => {
    const search = visitSearch.trim().toLowerCase()
    if (!search) return availableVisitOptions
    return availableVisitOptions.filter(
      (option) =>
        option.patient_name.toLowerCase().includes(search) ||
        option.patient_address.toLowerCase().includes(search)
    )
  }, [availableVisitOptions, visitSearch])
  const selectedVisitOption =
    availableVisitOptions.find(
      (option) =>
        String(option.visit_id) === String(expenseForm.visit_id)
    ) || null

  const closeModal = () => {
    if (actionId !== null) return
    setModal(null)
    setSelectedExpense(null)
    setExpenseForm(createInitialForm())
    setProofFile(null)
    setVisitSearch("")
  }

  const openCreateModal = () => {
    setSelectedExpense(null)
    setExpenseForm(createInitialForm())
    setProofFile(null)
    setModal("expense")
  }

  const openEditModal = (expense) => {
    setSelectedExpense(expense)
    setExpenseForm({
      expense_date: expense.expense_date,
      from_location: expense.from_location,
      to_location: expense.to_location,
      transport_mode: expense.transport_mode,
      fare: String(expense.fare),
      remarks: expense.remarks || "",
      visit_id: expense.visit_id ? String(expense.visit_id) : "",
      entry_mode: expense.visit_id ? "visit" : "manual",
      expense_category: expense.expense_category || "public_transport",
      manual_reason: expense.manual_reason || "",
      correction_reason: "",
    })
    setProofFile(null)
    setModal("expense")
  }

  const handleFormChange = (event) => {
    if (event.target.name === "visit_id") {
      const option = availableVisitOptions.find(
        (item) => String(item.visit_id) === event.target.value
      )
      setExpenseForm((current) => ({
        ...current,
        visit_id: event.target.value,
        from_location: option?.from_location || "",
        to_location: option?.to_location || "",
      }))
      return
    }
    if (event.target.name === "entry_mode") {
      setExpenseForm((current) => ({
        ...current,
        entry_mode: event.target.value,
        visit_id: "",
        from_location: "",
        to_location: "",
        expense_category: "public_transport",
      }))
      return
    }
    if (event.target.name === "expense_category") {
      setExpenseForm((current) => ({
        ...current,
        expense_category: event.target.value,
        transport_mode:
          event.target.value === "mileage"
            ? "car"
            : current.transport_mode,
      }))
      return
    }
    setExpenseForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const submitExpense = async (event) => {
    event.preventDefault()
    const isEditing = Boolean(selectedExpense)

    try {
      setActionId(isEditing ? `edit-${selectedExpense.id}` : "create")
      const token = localStorage.getItem("token")
      const payload = {
        ...expenseForm,
        fare:
          expenseForm.expense_category === "mileage"
            ? null
            : Number(expenseForm.fare),
        remarks: expenseForm.remarks.trim(),
        proof_file: proofFile,
        visit_id: expenseForm.visit_id
          ? Number(expenseForm.visit_id)
          : null,
        expense_category: expenseForm.expense_category,
        manual_reason: expenseForm.manual_reason.trim(),
      }
      if (payload.visit_id != null) {
        delete payload.from_location
        delete payload.to_location
        delete payload.manual_reason
      }
      if (isEditing && selectedExpense?.visit_id == null) {
        payload.correction_reason = expenseForm.correction_reason.trim()
        payload.version = selectedExpense.manual_review_version
      }

      if (isEditing) {
        await updateDoctorExpense(selectedExpense.id, payload, token)
      } else {
        await createDoctorExpense(payload, token)
      }

      await loadExpenses()
      setModal(null)
      setSelectedExpense(null)
      setExpenseForm(createInitialForm())
      setProofFile(null)
      toast.success(
        isEditing ? "Expense updated" : "Expense added"
      )
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isEditing
            ? "Unable to update expense"
            : "Unable to add expense"
        )
      )
    } finally {
      setActionId(null)
    }
  }

  const removeExpense = async (expense) => {
    const isManual = expense.visit_id == null
    const shouldDelete = window.confirm(
      `${isManual ? "Cancel" : "Delete"} the ${formatCurrency(expense.fare)} expense from ${expense.from_location} to ${expense.to_location}?`
    )
    if (!shouldDelete) return

    try {
      setActionId(`delete-${expense.id}`)
      const token = localStorage.getItem("token")
      await deleteDoctorExpense(expense.id, token)
      setTodayExpenses((current) =>
        current.filter((item) => item.id !== expense.id)
      )
      setAllExpenses((current) =>
        current.filter((item) => item.id !== expense.id)
      )
      toast.success(isManual ? "Manual expense cancelled" : "Expense deleted")
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to delete expense"))
    } finally {
      setActionId(null)
    }
  }

  const viewProof = async (expense) => {
    try {
      await openDoctorExpenseProof(expense.id, localStorage.getItem("token"))
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to open receipt"))
    }
  }

  const renderActions = (expense, mobile = false) => {
    const canModify = expense.available_actions?.includes("edit") || (
      expense.visit_id != null &&
      expense.status === "draft" &&
      expense.claim_id == null
    )
    const isDeleting = actionId === `delete-${expense.id}`

    if (!canModify) {
      return (
        <span className="text-xs font-medium text-slate-400">
          {expense.claim_id
            ? "Linked to claim"
            : expense.manual_review_status === "approved"
              ? "Approved · ready to claim"
              : expense.manual_review_status === "pending"
                ? "Awaiting review"
                : expense.manual_review_status === "changes_requested"
                  ? "Changes requested"
                  : "Read-only"}
        </span>
      )
    }

    return (
      <div
        className={`flex gap-2 ${
          mobile ? "grid grid-cols-2" : "justify-end"
        }`}
      >
        <button
          type="button"
          onClick={() => openEditModal(expense)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <FaEdit />
          Edit
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => removeExpense(expense)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
        >
          <FaTrash />
          {isDeleting
            ? expense.visit_id == null
              ? "Cancelling..."
              : "Deleting..."
            : expense.visit_id == null
              ? "Cancel"
              : "Delete"}
        </button>
      </div>
    )
  }

  return (
    <DoctorLayout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Doctor Expenses
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Record actual travel fares and manage draft expenses.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <FaPlus />
            Add Expense
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-2xl">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              activeTab === "today"
                ? "border-blue-200 bg-blue-50"
                : "border-slate-100 bg-white hover:border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Today&apos;s expenses
              </span>
              <FaCalendarDay className="text-blue-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {todayExpenses.length}
            </p>
          </button>

          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Today&apos;s total
              </span>
              <FaRupeeSign className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {formatCurrency(todayTotal)}
            </p>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === "today"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === "all"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            All Expenses
          </button>
        </div>

        <div className="space-y-4 md:hidden">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
              Loading expenses...
            </div>
          ) : visibleExpenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No expenses found.
            </div>
          ) : (
            visibleExpenses.map((expense) => (
              <article
                key={expense.id}
                className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-lg font-extrabold text-slate-900">
                      {formatCurrency(expense.fare)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(expense.expense_date)}
                    </p>
                  </div>
                  <StatusBadge expense={expense} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">From</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {expense.from_location}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">To</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {expense.to_location}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Transport</dt>
                    <dd className="mt-0.5 capitalize text-slate-700">
                      {expense.transport_mode} · {expense.expense_category?.replaceAll("_", " ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Receipt</dt>
                    <dd className="mt-0.5 text-slate-700">
                      {expense.proof_file ? "Attached" : "—"}
                    </dd>
                  </div>
                </dl>
                {expense.visit_id == null && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <p><span className="font-bold">Manual reason:</span> {expense.manual_reason}</p>
                    {expense.manual_review_reason && (
                      <p className="mt-1"><span className="font-bold">Review:</span> {expense.manual_review_reason}</p>
                    )}
                    <p className="mt-1 font-semibold">Revision {expense.manual_revision}</p>
                  </div>
                )}
                {renderActions(expense, true)}
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Route</th>
                  <th className="px-4 py-3.5">Transport</th>
                  <th className="px-4 py-3.5">Fare</th>
                  <th className="px-4 py-3.5">Receipt</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Loading expenses...
                    </td>
                  </tr>
                ) : visibleExpenses.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No expenses found.
                    </td>
                  </tr>
                ) : (
                  visibleExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="align-top transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4 text-sm text-slate-700">
                        {formatDate(expense.expense_date)}
                      </td>
                      <td className="max-w-[280px] px-4 py-4">
                        <p className="text-sm font-semibold text-slate-800">
                          {expense.from_location}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          to {expense.to_location}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm capitalize text-slate-700">
                        {expense.transport_mode}
                        <span className="mt-1 block text-xs text-slate-400">
                          {expense.expense_category?.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-900">
                        {formatCurrency(expense.fare)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {expense.proof_file ? (
                          <button type="button" onClick={() => viewProof(expense)} className="inline-flex items-center gap-1.5 font-semibold text-blue-700 underline">
                            <FaReceipt className="text-blue-500" />
                            View
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge expense={expense} />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(expense)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal === "expense" && (
        <Modal
          title={selectedExpense ? "Edit expense" : "Add expense"}
          description={
            selectedExpense
              ? "Update this draft expense or replace its receipt."
              : "Record the actual fare paid for doctor travel."
          }
          onClose={closeModal}
        >
          <form onSubmit={submitExpense} className="space-y-4">
            {!selectedExpense && (
              <div>
                <label className={labelClass}>Expense source</label>
                <select
                  name="entry_mode"
                  value={expenseForm.entry_mode}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  <option value="visit">Completed patient visit</option>
                  <option value="manual">Manual exception</option>
                </select>
                {expenseForm.entry_mode === "manual" && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Use this only when no completed visit can provide the route. A reason and receipt are required, and an administrator must approve it before claiming.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className={labelClass}>Expense date</label>
              <input
                required
                type="date"
                name="expense_date"
                value={expenseForm.expense_date}
                onChange={handleFormChange}
                readOnly={
                  expenseForm.entry_mode === "visit" ||
                  selectedExpense?.visit_id != null
                }
                className={inputClass}
              />
            </div>

            {!selectedExpense && expenseForm.entry_mode === "visit" && (
              <div className="space-y-2">
                <label className={labelClass}>
                  Completed patient visit
                </label>
                {availableVisitOptions.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    No completed patient visits available for today&apos;s
                    expenses.
                  </div>
                ) : (
                  <>
                    <input
                      type="search"
                      value={visitSearch}
                      onChange={(event) =>
                        setVisitSearch(event.target.value)
                      }
                      placeholder="Search patient or address"
                      className={inputClass}
                    />
                    <select
                      required
                      name="visit_id"
                      value={expenseForm.visit_id}
                      onChange={handleFormChange}
                      className={inputClass}
                    >
                      <option value="">Select completed visit</option>
                      {filteredVisitOptions.map((option) => (
                        <option
                          key={option.visit_id}
                          value={option.visit_id}
                        >
                          {option.patient_name} ·{" "}
                          {option.patient_address} ·{" "}
                          {option.visit_time.slice(0, 5)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Travel from</label>
                <input
                  required
                  name="from_location"
                  value={expenseForm.from_location}
                  onChange={handleFormChange}
                  readOnly={
                    expenseForm.entry_mode === "visit" ||
                    selectedExpense?.visit_id != null
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Travel to</label>
                <input
                  required
                  name="to_location"
                  value={expenseForm.to_location}
                  onChange={handleFormChange}
                  readOnly={
                    expenseForm.entry_mode === "visit" ||
                    selectedExpense?.visit_id != null
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Distance</label>
              <input
                readOnly
                value={
                  selectedVisitOption?.distance_km == null
                    ? selectedExpense?.distance_km == null
                      ? "Calculated on submission"
                      : `${Number(
                          selectedExpense.distance_km
                        ).toFixed(2)} km`
                    : `${Number(
                        selectedVisitOption.distance_km
                      ).toFixed(2)} km`
                }
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Expense category</label>
                <select
                  required
                  name="expense_category"
                  value={expenseForm.expense_category}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  {expenseForm.entry_mode === "visit" && (
                    <option value="mileage">Mileage reimbursement</option>
                  )}
                  <option value="public_transport">Public transport</option>
                  <option value="toll_parking">Toll / parking</option>
                  <option value="authorized_other">Authorized other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Transport mode</label>
                <select
                  required
                  name="transport_mode"
                  value={expenseForm.transport_mode}
                  onChange={handleFormChange}
                  className={inputClass}
                >
                  <option value="">Select transport</option>
                  <option value="auto">Auto</option>
                  <option value="bus">Bus</option>
                  <option value="cab">Cab / Taxi</option>
                  <option value="car">Car</option>
                  <option value="train">Train</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  {expenseForm.expense_category === "mileage"
                    ? "Calculated reimbursement"
                    : "Actual fare"}
                </label>
                <div className="relative">
                  <FaRupeeSign className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    required={expenseForm.expense_category !== "mileage"}
                    readOnly={expenseForm.expense_category === "mileage"}
                    type="number"
                    min="0.01"
                    step="0.01"
                    name="fare"
                    value={
                      expenseForm.expense_category === "mileage"
                        ? selectedExpense?.fare || ""
                        : expenseForm.fare
                    }
                    placeholder={
                      expenseForm.expense_category === "mileage"
                        ? "Calculated from verified distance"
                        : "0.00"
                    }
                    onChange={handleFormChange}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>
            </div>

            <ReceiptUpload
              selectedFile={proofFile}
              existingProof={selectedExpense?.proof_file}
              required={
                expenseForm.entry_mode === "manual" ||
                ["toll_parking", "authorized_other"].includes(
                  expenseForm.expense_category,
                )
              }
              onOpenExisting={
                selectedExpense?.proof_file
                  ? () => viewProof(selectedExpense)
                  : undefined
              }
              onChange={(event) =>
                setProofFile(event.target.files?.[0] || null)
              }
            />

            {expenseForm.entry_mode === "manual" && (
              <div>
                <label className={labelClass}>Why is this manual? *</label>
                <textarea
                  required
                  minLength="10"
                  maxLength="500"
                  rows="3"
                  name="manual_reason"
                  value={expenseForm.manual_reason}
                  onChange={handleFormChange}
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}

            {selectedExpense && selectedExpense.visit_id == null && (
              <div>
                <label className={labelClass}>Correction summary *</label>
                <textarea
                  required
                  minLength="5"
                  maxLength="500"
                  rows="2"
                  name="correction_reason"
                  value={expenseForm.correction_reason}
                  onChange={handleFormChange}
                  placeholder="Explain what changed in this revision"
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Remarks (optional)</label>
              <textarea
                rows="3"
                name="remarks"
                value={expenseForm.remarks}
                onChange={handleFormChange}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                <FaBus />
                {expenseForm.entry_mode === "visit"
                  ? "Route verified"
                  : "Manual exception review"}
              </span>
              <p className="mt-1">
                {expenseForm.entry_mode === "visit"
                  ? "Locations and distance are derived from attendance and patient visit GPS. Mileage is calculated by the server; actual-fare categories use the amount entered."
                  : "Typed routes are weaker evidence, so the entry cannot enter a claim until an administrator approves the reason and receipt."}
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  actionId !== null ||
                  (!selectedExpense && expenseForm.entry_mode === "visit" &&
                    availableVisitOptions.length === 0)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaFileInvoice />
                {actionId !== null
                  ? "Saving..."
                  : selectedExpense
                    ? "Update expense"
                    : "Add expense"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </DoctorLayout>
  )
}


export default DoctorExpensesPage
