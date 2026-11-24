'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Inline editing, the way issue trackers do it: a value looks like text until you click it, then
 * that same box becomes an input. Shown and editing states share padding, border width, font and
 * line height, so nothing moves when you switch.
 *
 * Every field saves on its own: `onSave` gets the new value and resolves to true when it was
 * saved. While it runs, the field shows the new value; when it fails, the old one comes back
 * (the caller reports the error). Enter or leaving the field saves, Escape cancels.
 */

/**
 * Moves focus into an input as it appears. It only appears because the user clicked the value,
 * so focus follows their action (this is not autofocus on page load).
 */
const focusOnMount = (node: HTMLElement | null) => node?.focus();

/** Resolves to true when the value was saved. */
export type SaveHandler<T> = (value: T) => Promise<boolean>;

/** The shared box: identical geometry whether it shows a value or an input. */
const surface = (editing: boolean, editable: boolean) =>
  cn(
    '-mx-2 block w-[calc(100%+1rem)] min-w-0 rounded-lg border-2 px-2 py-1 text-left [font:inherit] outline-none',
    editing ? 'border-ring bg-background' : 'border-transparent',
    !editing &&
      editable &&
      'cursor-pointer hover:bg-muted focus-visible:border-ring focus-visible:bg-muted',
  );

/** Keeps the value being saved on screen until the new data arrives (or the save fails). */
function useSaving<T>(value: T, onSave: SaveHandler<T>) {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const save = async (next: T) => {
    if (Object.is(next, value) || JSON.stringify(next) === JSON.stringify(value)) return;
    setPending({ value: next });
    await onSave(next);
    setPending(null);
  };
  return { shown: pending ? pending.value : value, saving: pending !== null, save };
}

/**
 * The text being edited, or null when not editing. `end` hands the draft back once: Enter or
 * Escape removes the input while it has focus, and some browsers then fire blur on it as well,
 * which must not save (again, or after a cancel).
 */
function useDraft<T>(initial: T | null = null) {
  const [draft, setDraft] = useState<T | null>(initial);
  const open = useRef(initial !== null);
  return {
    draft,
    begin: (value: T) => {
      open.current = true;
      setDraft(value);
    },
    change: (value: T) => setDraft(value),
    /** Stops editing; returns the draft only the first time. */
    end: (): T | null => {
      if (!open.current) return null;
      open.current = false;
      setDraft(null);
      return draft;
    },
  };
}

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="font-normal text-muted-foreground italic">{children}</span>;
}

interface InlineFieldProps<T> {
  /** The accessible name, e.g. "Titel". */
  label: string;
  value: T;
  onSave: SaveHandler<T>;
  /** Without it the value is shown read-only, with no hover or click. */
  editable?: boolean;
  className?: string;
}

/** One line of text. `required` refuses to save an empty value (the old one stays). */
export function InlineText({
  label,
  value,
  onSave,
  editable = true,
  className,
  placeholder,
  maxLength,
  required = false,
  startEditing = false,
  onDone,
}: InlineFieldProps<string> & {
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  /** Opens straight in edit mode, e.g. right after choosing "someone without an account". */
  startEditing?: boolean;
  /** When editing ends, whether it saved, was cancelled or changed nothing. */
  onDone?: () => void;
}) {
  const { shown, saving, save } = useSaving(value, onSave);
  const { draft, begin, change, end } = useDraft<string>(startEditing ? value : null);
  const editing = draft !== null;

  const finish = () => {
    const ended = end();
    if (ended === null) return;
    const next = ended.trim();
    onDone?.();
    if (required && next === '') return;
    void save(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish();
    } else if (event.key === 'Escape') {
      // Cancels the edit.
      end();
      onDone?.();
    }
  };

  if (editing) {
    return (
      <input
        aria-label={label}
        ref={focusOnMount}
        onFocus={(event) => event.currentTarget.select()}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
        className={cn(surface(true, true), className)}
      />
    );
  }
  const content = shown || <Placeholder>{placeholder}</Placeholder>;
  if (!editable) {
    return <span className={cn(surface(false, false), className)}>{content}</span>;
  }
  return (
    <button
      type="button"
      aria-label={`${label}: ${shown || placeholder || ''}`}
      disabled={saving}
      onClick={() => begin(shown)}
      className={cn(surface(false, true), 'disabled:opacity-70', className)}
    >
      {content}
    </button>
  );
}

/** Multi-line text that grows with its content. Ctrl/Cmd+Enter or leaving it saves. */
export function InlineTextarea({
  label,
  value,
  onSave,
  editable = true,
  className,
  placeholder,
  maxLength,
}: InlineFieldProps<string> & { placeholder?: string; maxLength?: number }) {
  const { shown, saving, save } = useSaving(value, onSave);
  const { draft, begin, change, end } = useDraft<string>();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus it when it opens (after a click), with the cursor after the text.
  const editing = draft !== null;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!editing || !node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing]);
  // Size it to its content, so it is exactly as tall as the text it replaced.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  const finish = () => {
    const ended = end();
    if (ended !== null) void save(ended.trim());
  };

  const text = 'min-h-[4.5rem] whitespace-pre-wrap break-words';
  if (draft !== null) {
    return (
      <textarea
        ref={ref}
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            finish();
          } else if (event.key === 'Escape') {
            end();
          }
        }}
        className={cn(surface(true, true), text, 'resize-none overflow-hidden', className)}
      />
    );
  }
  const content = shown || <Placeholder>{placeholder}</Placeholder>;
  if (!editable) {
    return <div className={cn(surface(false, false), text, className)}>{content}</div>;
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={saving}
      onClick={() => begin(shown)}
      className={cn(surface(false, true), text, 'disabled:opacity-70', className)}
    >
      {content}
    </button>
  );
}

/** A calendar day ("2026-12-01"), or null. Empty clears it. */
export function InlineDate({
  label,
  value,
  onSave,
  editable = true,
  className,
  placeholder,
  format,
}: InlineFieldProps<string | null> & {
  placeholder: string;
  /** How a day is shown when not editing. */
  format: (day: string) => ReactNode;
}) {
  const { shown, saving, save } = useSaving(value, onSave);
  const { draft, begin, change, end } = useDraft<string>();

  const finish = () => {
    const ended = end();
    if (ended !== null) void save(ended === '' ? null : ended);
  };

  if (draft !== null) {
    return (
      <input
        type="date"
        aria-label={label}
        ref={focusOnMount}
        value={draft}
        onChange={(event) => change(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish();
          } else if (event.key === 'Escape') {
            end();
          }
        }}
        className={cn(surface(true, true), 'h-9', className)}
      />
    );
  }
  const content = shown ? format(shown) : <Placeholder>{placeholder}</Placeholder>;
  if (!editable) {
    return <span className={cn(surface(false, false), 'h-9', className)}>{content}</span>;
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={saving}
      onClick={() => begin(shown ?? '')}
      className={cn(surface(false, true), 'h-9 disabled:opacity-70', className)}
    >
      {content}
    </button>
  );
}

export interface InlineOption<V extends string> {
  value: V;
  /** In the menu. */
  label: ReactNode;
}

/**
 * One choice from a list. The value stays where it is and the options open as a menu under it,
 * so choosing saves at once without anything shifting.
 */
export function InlineSelect<V extends string>({
  label,
  value,
  onSave,
  editable = true,
  className,
  options,
  render,
}: InlineFieldProps<V> & {
  options: InlineOption<V>[];
  /** How the current value is shown. */
  render: (value: V) => ReactNode;
}) {
  const { shown, saving, save } = useSaving(value, onSave);
  if (!editable) {
    return <span className={cn(surface(false, false), 'h-9', className)}>{render(shown)}</span>;
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={label}
        disabled={saving}
        className={cn(
          surface(false, true),
          'group/inline flex h-9 items-center justify-between gap-2 aria-expanded:border-ring aria-expanded:bg-background disabled:opacity-70',
          className,
        )}
      >
        <span className="min-w-0 truncate">{render(shown)}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover/inline:opacity-100 group-aria-expanded/inline:opacity-100"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuRadioGroup value={shown} onValueChange={(next) => void save(next as V)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Several choices (e.g. labels). Toggling happens in a popover under the value; the selection is
 * saved once when it closes. `footer` goes under the options, e.g. a field to add a new one.
 */
export function InlineMultiSelect({
  label,
  value,
  onSave,
  editable = true,
  className,
  options,
  render,
  placeholder,
  footer,
}: InlineFieldProps<string[]> & {
  options: InlineOption<string>[];
  render: (values: string[]) => ReactNode;
  placeholder: string;
  footer?: (select: (value: string) => void) => ReactNode;
}) {
  const { shown, saving, save } = useSaving(value, onSave);
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? shown;

  const close = () => {
    if (draft === null) return;
    setDraft(null);
    const next = [...draft].sort();
    const unchanged = next.join() === [...shown].sort().join();
    if (!unchanged) void save(next);
  };
  const toggle = (id: string) =>
    setDraft((current) => {
      const base = current ?? shown;
      return base.includes(id) ? base.filter((v) => v !== id) : [...base, id];
    });
  const content = selected.length > 0 ? render(selected) : <Placeholder>{placeholder}</Placeholder>;

  if (!editable) {
    return <span className={cn(surface(false, false), 'min-h-9', className)}>{content}</span>;
  }
  return (
    <Popover open={draft !== null} onOpenChange={(open) => (open ? setDraft([...shown]) : close())}>
      <PopoverTrigger
        aria-label={label}
        disabled={saving}
        className={cn(
          surface(false, true),
          'flex min-h-9 items-center aria-expanded:border-ring aria-expanded:bg-background disabled:opacity-70',
          className,
        )}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-2 p-2">
        {options.length > 0 && (
          <ul className="flex flex-col">
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border-2',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {checked && <Check className="size-3" aria-hidden />}
                    </span>
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footer?.((id) => setDraft((current) => [...(current ?? shown), id]))}
      </PopoverContent>
    </Popover>
  );
}
