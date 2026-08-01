function PageState({ loading, error, empty, onRetry, emptyTitle, emptyText }) {
  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-800">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-md bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <h3 className="text-sm font-bold text-slate-800">
          {emptyTitle || "No records found"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {emptyText || "Try changing the current filters."}
        </p>
      </div>
    )
  }

  return null
}

export default PageState
