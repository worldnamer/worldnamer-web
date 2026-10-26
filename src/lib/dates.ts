const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// '2016-02' -> 'Feb 2016'; a bare year or 'present' is shown as written (capitalized).
export function formatDate(value: string): string {
  if (value === 'present') return 'Present'
  const [year, month] = value.split('-')
  return month ? `${months[Number(month) - 1]} ${year}` : year
}

export function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`
}
