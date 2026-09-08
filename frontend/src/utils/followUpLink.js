const ALLOWED_DOMAINS = new Set([
  "attendance",
  "clinical",
  "claims",
  "expenses",
  "location",
  "reporting",
  "scheduling",
  "staff",
  "travel",
])

export function buildFollowUpLink({ domain, entityType, entityId, title }) {
  const params = new URLSearchParams({
    source_domain: ALLOWED_DOMAINS.has(domain) ? domain : "clinical",
    source_entity_type: String(entityType || "").slice(0, 80),
    source_entity_id: String(entityId || "").slice(0, 100),
    title: String(title || "Review operational exception").slice(0, 160),
  })
  return `/admin/follow-ups?${params.toString()}`
}
