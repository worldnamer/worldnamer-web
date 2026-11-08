// Whole minutes as hours and minutes for display: 20 -> "20 min", 60 -> "1 hr", 125 -> "2 hr 5 min".
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}
