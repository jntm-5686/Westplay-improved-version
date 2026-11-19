import type { CSSProperties } from 'react'
import { useCabin } from '../state/store'
import { imeCandidates } from './imeCandidates'
import { useKeyboard } from './store'

/**
 * The pinyin IME's bar, at the top of the on-screen keyboard: what the letters just typed could be, as an IME
 * offers them, a click or a tap writing the word into the field (owner 2026-11-17: "候选框做到这里来…
 * 出现候选框的时候键盘ui也记得往上提"). It sits inside the keyboard, which grows upwards to hold it, so the keys
 * move up as it comes and back as it goes (keyboard.css).
 */
export function ImeBar() {
  const pinyin = useCabin((state) => state.pinyinInput)
  const text = useKeyboard((state) => state.text)
  const field = useKeyboard((state) => state.field)
  // The letters still being spelled: those at the end of the field's text.
  const typed = /[a-z']+$/i.exec(text)?.[0] ?? ''
  const candidates = pinyin && field && !/[^\x20-\x7e]/.test(typed) && typed ? imeCandidates(typed, 5) : []
  if (candidates.length === 0) return null
  return (
    <div className="ime-bar glass" role="listbox" aria-label="pinyin candidates">
      {candidates.map((candidate, index) => (
        <button
          key={candidate.word}
          type="button"
          tabIndex={-1}
          role="option"
          aria-selected="false"
          style={{ '--i': index } as CSSProperties}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            const kept = text.slice(0, Math.max(0, text.length - typed.length))
            field?.write(kept + candidate.word)
          }}
        >
          <span className="ime-index" aria-hidden="true">
            {index + 1}
          </span>
          {candidate.word}
        </button>
      ))}
    </div>
  )
}
