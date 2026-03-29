import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type DropdownChangeEvent = {
  target: {
    value: string
  }
}

type ParsedOption = {
  key: string
  label: ReactNode
  value: string
  disabled: boolean
  groupLabel?: string
}

type DropdownSelectProps = {
  id?: string
  className?: string
  value: string
  disabled?: boolean
  autoFocus?: boolean
  children: ReactNode
  onChange?: (event: DropdownChangeEvent) => void
  onOpen?: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
}

function parseOptions(children: ReactNode, groupLabel?: string): ParsedOption[] {
  const options: ParsedOption[] = []

  Children.forEach(children, (child, index) => {
    if (!isValidElement(child)) {
      return
    }

    const props = child.props as {
      children?: ReactNode
      disabled?: boolean
      label?: ReactNode
      value?: string
    }

    if (child.type === 'option') {
      const optionValue = String(props.value ?? '')
      options.push({
        key: `${groupLabel ?? 'option'}-${optionValue}-${index}`,
        label: props.children,
        value: optionValue,
        disabled: Boolean(props.disabled),
        groupLabel,
      })
      return
    }

    if (child.type === 'optgroup') {
      const nextGroupLabel = String(props.label ?? '')
      options.push(...parseOptions(props.children, nextGroupLabel))
    }
  })

  return options
}

export default function DropdownSelect({
  id,
  className,
  value,
  disabled = false,
  autoFocus = false,
  children,
  onChange,
  onOpen,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: DropdownSelectProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const generatedId = useId()
  const listboxId = `${id ?? generatedId}-listbox`
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  const options = useMemo(() => parseOptions(children), [children])
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0] ?? null

  useEffect(() => {
    if (autoFocus) {
      triggerRef.current?.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const updateMenuPosition = () => {
      if (!triggerRef.current) {
        return
      }

      const rect = triggerRef.current.getBoundingClientRect()
      const viewportPadding = 12
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - viewportPadding * 2)
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding)
      const top = rect.bottom + 8
      const maxHeight = Math.max(132, window.innerHeight - top - viewportPadding)

      setMenuPosition({
        top,
        left,
        width,
        maxHeight,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      const enabledOptions = options.filter((option) => !option.disabled)
      if (enabledOptions.length === 0) {
        return
      }

      const currentEnabledIndex = enabledOptions.findIndex((option) => option.value === options[activeIndex]?.value)
      if (event.key === 'Enter') {
        const nextOption = enabledOptions[Math.max(currentEnabledIndex, 0)]
        if (nextOption) {
          onChange?.({ target: { value: nextOption.value } })
          setIsOpen(false)
          triggerRef.current?.focus()
        }
        return
      }

      const offset = event.key === 'ArrowDown' ? 1 : -1
      const nextEnabledIndex =
        currentEnabledIndex >= 0
          ? (currentEnabledIndex + offset + enabledOptions.length) % enabledOptions.length
          : event.key === 'ArrowDown'
            ? 0
            : enabledOptions.length - 1
      const nextValue = enabledOptions[nextEnabledIndex]?.value
      const nextIndex = options.findIndex((option) => option.value === nextValue)
      setActiveIndex(nextIndex)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeIndex, isOpen, onChange, options])

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(selectedIndex)
    }
  }, [isOpen, selectedIndex])

  const openMenu = () => {
    if (disabled || options.length === 0) {
      return
    }

    onOpen?.()
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled))
    setIsOpen(true)
  }

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!isOpen) {
        openMenu()
      }
    }
  }

  const handleOptionSelect = (nextValue: string) => {
    onChange?.({ target: { value: nextValue } })
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <div className={`dropdown-select${disabled ? ' is-disabled' : ''}`}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={`dropdown-select__trigger${className ? ` ${className}` : ''}`}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          disabled={disabled}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false)
              return
            }

            openMenu()
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="dropdown-select__value">{selectedOption?.label ?? ''}</span>
          <span className={`dropdown-select__caret${isOpen ? ' is-open' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path
                d="M2 4.5 6 8l4-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>

      {isOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              className="dropdown-select__menu"
              role="listbox"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                width: `${menuPosition.width}px`,
                maxHeight: `${menuPosition.maxHeight}px`,
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex

                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    className={`dropdown-select__option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleOptionSelect(option.value)}
                  >
                    <span className="dropdown-select__option-label">{option.label}</span>
                    {isSelected ? (
                      <span className="dropdown-select__option-check" aria-hidden="true">
                        <svg viewBox="0 0 16 16">
                          <path
                            d="M3.5 8.4 6.7 11.5 12.5 4.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
