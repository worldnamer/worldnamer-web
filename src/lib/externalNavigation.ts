// Sends the whole browser window to another address (for example Google's consent screen). It exists so tests can
// replace it: jsdom cannot navigate, and window.location.assign cannot be spied on directly.
export function navigateTo(url: string): void {
  window.location.assign(url)
}
