// How a task list's name is shown. The API strips surrounding spaces, so a blank name arrives as "", but the check
// trims anyway in case it does not.

export function isBlank(name: string) {
  return name.trim() === ''
}

// The most characters of a name the row shows before cutting it.
export const ROW_NAME_MAX = 20

// The name as the row shows it: cut to ROW_NAME_MAX characters with "..." appended when longer. Characters are counted
// as code points (Array.from), so an emoji or other character outside the Basic Multilingual Plane is never split.
export function rowName(name: string) {
  const chars = Array.from(name)
  return chars.length > ROW_NAME_MAX ? `${chars.slice(0, ROW_NAME_MAX).join('')}...` : name
}

// The name a screen reader hears for a list: always the full name, or "Unnamed list" for a blank one.
export function accessibleListName(name: string) {
  return isBlank(name) ? 'Unnamed list' : name
}
