import type { ReactNode } from "react"
import { IconMinus, IconPlus } from "@tabler/icons-react"
import { cn } from "cn"

import { Info } from "@/components/info"
import { Card } from "@/components/ui/card"
import { Segmented } from "@/dive/form/rows"
import { Haptic } from "@/lib/haptic"
import { isReturn } from "@/lib/keys"
import {
  modelInfo,
  ndlModels,
  setNdlModel,
  useNdlModel,
} from "@/tools/ndl-model"

// A small heading over a tool's card, as You's sections have.
export function ToolHeading({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return (
    <h2
      id={id}
      className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground"
    >
      {children}
    </h2>
  )
}

const stepButton =
  "relative inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted text-foreground transition-[scale,opacity] duration-150 ease-out select-none hover:opacity-80 active:scale-96 active:opacity-70 active:duration-0 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40 desk:size-10"

// The boards' big figure between a minus and a plus, typed or stepped.
export function Stepper({
  label,
  value,
  placeholder,
  unit,
  inputMode,
  onType,
  onDone,
  onStep,
  less,
  more,
  atLeast,
  atMost,
  children,
}: {
  // For screen readers, as the figure has no visible label.
  label: string
  value: string
  placeholder?: string
  unit: string
  inputMode: "numeric" | "decimal"
  onType: (text: string) => void
  // The field is left, so what was typed can show as the value it gave.
  onDone: () => void
  onStep: (direction: -1 | 1) => void
  less: string
  more: string
  // At the ends of the range, so a step that can't change anything is off.
  atLeast?: boolean
  atMost?: boolean
  children?: ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          aria-label={less}
          disabled={atLeast}
          onClick={() => onStep(-1)}
          className={stepButton}
        >
          <IconMinus aria-hidden className="size-5" />
          <Haptic />
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <span className="sr-only">{label}</span>
          <input
            type="text"
            inputMode={inputMode}
            enterKeyHint="done"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={(event) => {
              if (isReturn(event)) event.currentTarget.blur()
            }}
            onBlur={onDone}
            onFocus={(event) => {
              // Again after the tap: WebKit's mouseup clears a selection
              // made on focus, and typing would add to the old figure.
              const input = event.currentTarget
              input.select()
              requestAnimationFrame(() => {
                if (document.activeElement === input) input.select()
              })
            }}
            className="w-full max-w-32 min-w-0 bg-transparent p-0 text-right text-[44px] leading-[52px] font-semibold tracking-[-0.03em] tabular-nums outline-none placeholder:text-muted-foreground/45"
          />
          {/* As faint as the placeholder while the figure is blank. */}
          <span
            className={cn(
              "text-xl font-medium text-muted-foreground",
              !value && "text-muted-foreground/45"
            )}
          >
            {unit}
          </span>
        </label>
        <button
          type="button"
          aria-label={more}
          disabled={atMost}
          onClick={() => onStep(1)}
          className={stepButton}
        >
          <IconPlus aria-hidden className="size-5" />
          <Haptic />
        </button>
      </div>
      {children}
    </Card>
  )
}

// The NDL model both tools share, picked on either.
export function ModelPicker({ className }: { className?: string }) {
  const model = useNdlModel()
  return (
    <section aria-labelledby="ndl-model" className={cn(className)}>
      <ToolHeading id="ndl-model">
        <span className="flex items-center gap-1.5">
          NDL model
          <Info term="the NDL model" title={modelInfo[model].title}>
            {modelInfo[model].body}
          </Info>
        </span>
      </ToolHeading>
      <Segmented
        labelledBy="ndl-model"
        value={model}
        onChange={(next) => {
          if (next) setNdlModel(next)
        }}
        options={ndlModels}
      />
    </section>
  )
}
