"use client"

import * as React from "react"
import { CodeXmlIcon, MessageCircleIcon } from "lucide-react"

import { PREF, readPref, writePref } from "@/lib/prefs"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group"

/** Which of the two composer layouts is in force. */
export type ComposerVariant = "chat" | "code"

/**
 * The two composer layouts. The selected entry shows its icon and label; the
 * other collapses to just its icon, so the control keeps a stable width and the
 * sliding indicator in `ToggleGroup` does the work of showing which is active.
 */
const VARIANT_OPTIONS: {
  value: ComposerVariant
  label: string
  icon: React.ReactNode
}[] = [
  { value: "chat", label: "Chat", icon: <MessageCircleIcon /> },
  { value: "code", label: "Code", icon: <CodeXmlIcon /> },
]

type ComposerVariantContextValue = {
  variant: ComposerVariant
  setVariant: React.Dispatch<React.SetStateAction<ComposerVariant>>
}

const ComposerVariantContext = React.createContext<ComposerVariantContextValue | null>(
  null
)

/**
 * Owns which composer layout is in force.
 *
 * This lives above the shell rather than inside the prompt block because the
 * control that changes it sits in the sidebar while the thing it changes is the
 * composer. The two are in different halves of the tree, and the only way for
 * one to reach the other without threading props through the shell's children
 * is a context. The stored preference moves with it, so the choice survives a
 * reload whichever half of the app asked for it.
 */
export function ComposerVariantProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [variant, setVariant] = React.useState<ComposerVariant>(() =>
    readPref(PREF.variant) === "chat" ? "chat" : "code"
  )

  React.useEffect(() => {
    writePref(PREF.variant, variant)
  }, [variant])

  const value = React.useMemo(
    () => ({ variant, setVariant }),
    [variant]
  )

  return (
    <ComposerVariantContext.Provider value={value}>
      {children}
    </ComposerVariantContext.Provider>
  )
}

export function useComposerVariant() {
  const context = React.useContext(ComposerVariantContext)
  if (!context) {
    throw new Error(
      "useComposerVariant must be used inside a ComposerVariantProvider"
    )
  }
  return context
}

/**
 * The Chat/Code switch, unchanged in shape from when it sat in the work area's
 * header. It is the same component in a different place: radius matches the
 * composer box (`--composer-radius`) so the two read as the same shape, and the
 * items are fully rounded so the indicator inherits that radius and the
 * highlight is a pill.
 */
export function ComposerVariantSwitch({ className }: { className?: string }) {
  const { variant, setVariant } = useComposerVariant()

  return (
    <ToggleGroup
      className={cn("gap-0 rounded-[1.625rem] bg-muted/50 p-1", className)}
      aria-label="Composer"
      size="sm"
      value={[variant]}
      onValueChange={(next) => {
        const [value] = next as ComposerVariant[]
        if (value) setVariant(value)
      }}
    >
      {VARIANT_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="rounded-full gap-0 px-2"
        >
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {option.icon}
          </span>
          {/* Collapses to zero width when unselected. The grid track approach is
              content-sized, so a longer label would widen the control on its
              own rather than being clipped. The easing matches the indicator's
              own glide. */}
          <span
            className={cn(
              "ms-0 grid grid-cols-[0fr] transition-[grid-template-columns] duration-300",
              "ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              "group-data-pressed/toggle:ms-1.5",
              "group-data-pressed/toggle:grid-cols-[1fr]"
            )}
          >
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap opacity-0",
                "transition-opacity duration-200 motion-reduce:transition-none",
                "group-data-pressed/toggle:opacity-100"
              )}
            >
              {option.label}
            </span>
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}