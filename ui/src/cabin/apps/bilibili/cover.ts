/** A cover's own two colours, from its name: the app's gradient for a video without a picture (the browser preview has
 * no pictures; inside the host Bilibili's own covers are shown). */
export function coverTint(seed: string): [string, string] {
  let hash = 0
  for (const letter of seed) hash = (hash * 31 + letter.charCodeAt(0)) % 9973
  const hue = hash % 360
  return [`hsl(${hue} 54% 40%)`, `hsl(${(hue + 46) % 360} 48% 19%)`]
}
