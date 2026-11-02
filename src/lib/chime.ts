// The sound for the end of a phase, made by the browser with Web Audio so there is no file to host. Browsers only let a
// page make sound after a click or key press, so the audio context is created or resumed by `prepareChime`, which the
// Start button calls; the later phase ends reuse that one context. If Web Audio is missing or throws, the chime is
// silently skipped: it is a nicety, and the title and the bar still show that the phase ended.
let context: AudioContext | null = null

export function prepareChime(): void {
  try {
    if (context === null) context = new AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
  } catch {
    context = null
  }
}

// One short sine tone. The gain ramps up and then down so the tone starts and ends without a click.
function tone(audio: AudioContext, frequency: number, startAt: number, seconds: number): void {
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.linearRampToValueAtTime(0.2, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + seconds)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + seconds)
}

// Two tones, a rising pair. Does nothing if `prepareChime` could not make a context.
export function playChime(): void {
  if (context === null) return
  try {
    const t = context.currentTime
    tone(context, 660, t, 0.35)
    tone(context, 880, t + 0.2, 0.5)
  } catch {
    // Silently skipped.
  }
}
