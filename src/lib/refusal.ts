import { ApiError } from '@/api/client'

// The API's own message for refused input (422), if it sent one, to show the user instead of a generic line.
export function refusal(error: Error) {
  return error instanceof ApiError && error.status === 422 ? error.serverMessage : undefined
}
