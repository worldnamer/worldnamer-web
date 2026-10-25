export type Health = {
  status: string
  db: string
}

// GET /api/v1/health. The API answers 200 when it and its database are up, and 503 when the database is down.
export async function fetchHealth(): Promise<Health> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/health`)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}
