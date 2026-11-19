import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import { useCabin } from '../state/store'
import { ExpandGlyph } from './glyphs'
import { imeCandidates, type ImeCandidate } from './imeCandidates'
import { acceptedText, moreShown, panelCandidates, PANEL_STEP, shownCandidates } from './imePanel'
import { useKeyboard } from './store'

/** How many candidates the bar itself shows; the rest wait in the panel (`展开全部候选`). */
const BAR_LIMIT = 5

/** The panel while it's open: the letters it was opened over, and how many of their candidates it shows.
 *  The letters changing under it (typing on) starts it at the first page again. */
interface Expanded {
  typed: string
  shown: number
}

/**
 * The pinyin IME's bar, at the top of the on-screen keyboard: what the letters just typed could be, as an IME
 * offers them, a click or a tap writing the word into the field (owner 2026-11-17: "候选框做到这里来…
 * 出现候选框的时候键盘ui也记得往上提"). It sits inside the keyboard, which grows upwards to hold it, so the keys
 * move up as it comes and back as it goes (keyboard.css).
 *
 * Its few candidates are the dictionary's most common; a rarer character (a name's, an uncommon one) is one of
 * the hundreds behind them. So a chevron at its right opens 展开全部候选: a panel above the bar with every candidate
 * the dictionary has for the letters, in a grid that scrolls (the wheel, a finger, or dragged with the cab's
 * mouse), a page more with the count at its foot. A word pressed writes it exactly as one of the bar's does and
 * the panel folds away. The panel is the keyboard's own, sharing the bar's height-and-opacity arrival and its
 * glass; no app owns any of it.
 */
export function ImeBar() {
  const pinyin = useCabin((state) => state.pinyinInput)
  const text = useKeyboard((state) => state.text)
  const field = useKeyboard((state) => state.field)
  // The letters still being spelled: those at the end of the field's text.
  const typed = /[a-z']+$/i.exec(text)?.[0] ?? ''
  const candidates = pinyin && field && !/[^\x20-\x7e]/.test(typed) && typed ? imeCandidates(typed, BAR_LIMIT) : []
  const [expanded, setExpanded] = useState<Expanded | null>(null)
  const [closing, setClosing] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  // A drag of the mouse over the panel: it scrolls the list, and the word it's let go over isn't picked.
  const drag = useRef<{ pointer: number; y: number; top: number; moved: boolean } | null>(null)
  // The letters changing under an open panel bring a new list: it starts at its top.
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0
  }, [typed])
  if (candidates.length === 0) {
    // The letters are all gone (or aren't pinyin): there's nothing to expand, even if it was open.
    if (expanded || closing) {
      setExpanded(null)
      setClosing(false)
    }
    return null
  }

  // Every candidate the dictionary has, in the panel's own pages (the bar's first five lead it).
  const all = expanded ? panelCandidates(typed) : []
  // Typing on moves the panel to a new list: it starts again at its first page.
  const shown = expanded ? (expanded.typed === typed ? expanded.shown : PANEL_STEP) : 0
  const visible = shownCandidates(all, shown)
  const open = expanded !== null && !closing

  const pick = (candidate: ImeCandidate) => {
    field?.write(acceptedText(text, typed, candidate))
    // The letters it replaced are gone: the bar (and this panel with it) folds away by itself.
  }

  const toggle = () => {
    if (expanded) {
      setClosing(!closing)
      return
    }
    setExpanded({ typed, shown: PANEL_STEP })
  }

  const more = () => {
    setExpanded((now) => (now ? { typed, shown: moreShown(shown, all.length) } : now))
  }

  /** A page more when the list is scrolled to its foot, so a long list is walked without the button. */
  const onScroll = () => {
    const element = list.current
    if (!element || closing || shown >= all.length) return
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 40) more()
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    // A finger scrolls the list natively (keyboard.css's `touch-action`); the cab's mouse is dragged.
    if (event.pointerType === 'touch' || event.button !== 0) return
    drag.current = { pointer: event.pointerId, y: event.clientY, top: list.current?.scrollTop ?? 0, moved: false }
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current
    const element = list.current
    if (!held || held.pointer !== event.pointerId || !element) return
    const by = event.clientY - held.y
    if (!held.moved && Math.abs(by) < 5) return
    held.moved = true
    element.scrollTop = held.top - by
    event.preventDefault()
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current
    if (!held || held.pointer !== event.pointerId) return
    drag.current = null
    if (held.moved) event.preventDefault()
  }

  return (
    <div className="ime-bar glass" role="group" aria-label="pinyin candidates">
      <div className="ime-words" role="listbox" aria-label="pinyin candidates">
        {candidates.map((candidate, index) => (
          <button
            key={candidate.word}
            type="button"
            tabIndex={-1}
            role="option"
            aria-selected="false"
            className="ime-word"
            style={{ '--i': index } as CSSProperties}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              field?.write(acceptedText(text, typed, candidate))
            }}
          >
            <span className="ime-index" aria-hidden="true">
              {index + 1}
            </span>
            {candidate.word}
          </button>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className={open ? 'ime-expand on' : 'ime-expand'}
        aria-label={open ? 'show fewer candidates' : 'show all candidates'}
        title={open ? 'show fewer candidates' : 'show all candidates'}
        aria-expanded={open}
        aria-controls={open ? 'ime-panel' : undefined}
        onPointerDown={(event) => {
          event.stopPropagation()
          event.preventDefault()
        }}
        onClick={toggle}
      >
        <ExpandGlyph />
      </button>
      {expanded && (
        <div
          id="ime-panel"
          className={closing ? 'ime-panel glass closing' : 'ime-panel glass'}
          role="group"
          aria-label="all pinyin candidates"
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget || !closing) return
            setExpanded(null)
            setClosing(false)
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            className="ime-panel-head"
            aria-label="hide all candidates"
            onClick={toggle}
          >
            <span className="ime-panel-typed">{typed}</span>
            <span className="ime-panel-count">{all.length}</span>
            <ExpandGlyph />
          </button>
          <div
            ref={list}
            className="ime-panel-list"
            role="listbox"
            aria-label="all pinyin candidates"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onScroll={onScroll}
          >
            {visible.map((candidate, index) => (
              <button
                key={`${candidate.word}:${index}`}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected="false"
                className="ime-panel-word"
                onPointerUp={(event) => {
                  if (event.button !== 0 || drag.current?.moved) return
                  pick(candidate)
                }}
              >
                {candidate.word}
              </button>
            ))}
          </div>
          {shown < all.length ? (
            <button type="button" tabIndex={-1} className="ime-panel-more" onClick={more}>
              <span className="ime-panel-more-count">
                {shown} / {all.length}
              </span>
              <ExpandGlyph />
            </button>
          ) : (
            <p className="ime-panel-foot" aria-hidden="true">
              {all.length}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
