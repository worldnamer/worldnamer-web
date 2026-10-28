// The message the login form shows for a failed login. status is the HTTP status, or null when there was no response
// at all (a network error). A wrong username and a wrong password share one message on purpose.
export function loginErrorMessage(status: number | null): string {
  if (status === 401) return 'Invalid username or password.'
  if (status === 429) return 'Too many attempts. Try again in a few minutes.'
  return 'Something went wrong. Try again.'
}
