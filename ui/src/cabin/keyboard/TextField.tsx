import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { isInHost } from '../../shared/host'
import { useCabin } from '../state/store'
import { useLanguage, useText } from '../state/text'
import { keyboardLanguage, type ReturnKind } from './layouts'
import { type Typing, useKeyboard } from './store'

interface TextFieldProps {
  /** Unique among the fields on screen. */
  id: string
  value: string
  onChange(value: string): void
  /** The return key (on-screen or the player's own). */
  onSubmit?(): void
  returnKind?: ReturnKind
  /** What the field is for, shown while it's empty. */
  hint: string
  /** Its name for screen readers. */
  label: string
  /** A symbol before the text (search's magnifier). */
  icon?: ReactNode
  /** Selected as it comes (Safari's address field, pressed: typed into at once, the keyboard up). */
  autoSelect?: boolean
  /** Before it takes the keyboard: what pressing it should show (the NetEase app's search page) — the app brings it
   *  up first, so the keyboard isn't put away by the very page change that follows. */
  onSelect?(): void
}

/**
 * A field the keyboard types into. Not an `<input>`: the page never has the PC's keyboard (the game does),
 * so WestPlay draws its own field, caret and all, and the keyboard (store.ts) writes into it. Pressing it
 * selects it and brings the keyboard up; it lets go when it leaves the screen.
 */
export function TextField({
  id,
  value,
  onChange,
  onSubmit,
  returnKind = 'done',
  hint,
  label,
  icon,
  autoSelect = false,
  onSelect,
}: TextFieldProps) {
  const text = useText()
  const typing = useKeyboard((state) => state.field?.id === id)
  const pinyin = useCabin((state) => state.pinyinInput)
  // Chinese: pinyin, or English's keys while the player turned the IME off.
  const own = keyboardLanguage(useLanguage())
  const language = own === 'zh' && !pinyin ? 'en' : own

  // The newest props, for the keyboard to call; and the text as last written, so keys pressed faster than
  // the page redraws (the player's own keyboard) each build on the one before.
  const latest = useRef({ onChange, onSubmit })
  const current = useRef(value)
  useLayoutEffect(() => {
    latest.current = { onChange, onSubmit }
    current.current = value
  })
  const field = useMemo<Typing>(
    () => ({
      id,
      returnKind,
      read: () => current.current,
      write: (next) => {
        current.current = next
        useKeyboard.getState().setText(next)
        latest.current.onChange(next)
      },
      submit: () => latest.current.onSubmit?.(),
    }),
    [id, returnKind],
  )
  const select = () => {
    onSelect?.()
    useKeyboard.getState().attach(field, language)
  }

  useEffect(() => () => useKeyboard.getState().detach(field.id), [field])
  useEffect(() => {
    if (autoSelect) select()
  }, [])

  // A long text shows its end, where the typing is.
  const shown = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (shown.current) shown.current.scrollLeft = shown.current.scrollWidth
  }, [value, typing])

  return (
    <div
      className={typing ? 'text-field typing' : 'text-field'}
      role="textbox"
      aria-label={label}
      onPointerDown={(event) => {
        if (event.button === 0) select()
      }}
    >
      {icon}
      {!isInHost() ? (
        <input
          className="text-field-input"
          value={value}
          aria-label={label}
          placeholder={hint}
          autoFocus={autoSelect}
          onPointerDown={(event) => {
            event.stopPropagation()
            select()
          }}
          onChange={(event) => {
            current.current = event.target.value
            useKeyboard.getState().setText(event.target.value)
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') latest.current.onSubmit?.()
          }}
        />
      ) : (
      <span ref={shown} className="text-field-text">
        {value}
        {typing && <span className="text-field-caret" aria-hidden />}
        {!value && <span className="text-field-hint">{hint}</span>}
      </span>
      )}
      {value && (
        <button
          type="button"
          tabIndex={-1}
          className="text-field-clear"
          aria-label={text.keyboard.clear}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            current.current = ''
            onChange('')
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
