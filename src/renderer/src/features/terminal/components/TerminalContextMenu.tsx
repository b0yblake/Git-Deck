import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * The commands, in order: Phase 10's six, plus "Paste selection" (2026-09-04).
 * Exported so the spec can assert the list rather than re-typing it — an
 * eighth would have to be added here, which is exactly what the test watches.
 *
 * "Paste selection" sends the highlighted text to the shell as if typed, so a
 * line of earlier output becomes the next command without a Copy in between.
 * It presses nothing: Enter is still the user's.
 */
export const TERMINAL_MENU_COMMANDS = [
  'Copy',
  'Paste',
  'Paste selection',
  'Clear',
  'Rename terminal',
  'Duplicate terminal',
  'Close terminal'
] as const

export type TerminalMenuCommand = (typeof TERMINAL_MENU_COMMANDS)[number]

export interface TerminalContextMenuProps {
  readonly x: number
  readonly y: number
  /** Whether the terminal has text highlighted — "Paste selection" needs it. */
  readonly hasSelection?: boolean
  readonly onCommand: (command: TerminalMenuCommand) => void
  readonly onDismiss: () => void
}

/**
 * A right-click menu over a terminal.
 *
 * Every command maps to an action that already existed before this phase; none
 * of them reaches IPC directly, and none adds a channel. `Ctrl+Shift+P` stays
 * unclaimed — the command palette is post-MVP.
 */
export const TerminalContextMenu = ({
  x,
  y,
  hasSelection = false,
  onCommand,
  onDismiss
}: TerminalContextMenuProps): React.JSX.Element => {
  const firstRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLMenuElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // A right-click near the bottom or right edge would otherwise push the menu
  // off screen, where the pane's overflow clips it. Measure once it has laid
  // out and pull it back inside the viewport.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - width)),
      top: Math.max(0, Math.min(y, window.innerHeight - height))
    })
  }, [x, y])

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss])

  return (
    <div className="context-menu-backdrop" onMouseDown={onDismiss}>
      <menu
        ref={menuRef}
        className="context-menu"
        role="menu"
        style={position}
        aria-label="Terminal actions"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {TERMINAL_MENU_COMMANDS.map((command, index) => (
          <li key={command} role="none">
            <button
              type="button"
              role="menuitem"
              ref={index === 0 ? firstRef : undefined}
              disabled={command === 'Paste selection' && !hasSelection}
              onClick={() => onCommand(command)}
            >
              {command}
            </button>
          </li>
        ))}
      </menu>
    </div>
  )
}
