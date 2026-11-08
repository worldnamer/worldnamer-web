// A row's icons are hidden only where the device can hover, and come back while the row (a `group`) is hovered or holds
// focus. Opacity, not removal, so they keep their space (the text does not jump), stay in the tab order and show when
// focused. Where the device cannot hover (touch) they are always shown.
export const revealOnHover =
  'can-hover:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
