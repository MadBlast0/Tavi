"use client"

import * as React from "react"
import { CodeXmlIcon, MessageCircleIcon } from "lucide-react"

import { PREF, readPref, writePref } from "@/lib/prefs"
import {
  IconSwitch,
  type IconSwitchOption,
} from "@/components/icon-switch"

/** Which of the two composer layouts is in force. */
export type ComposerVariant = "chat" | "code"

/**
 * The two composer layouts. The selected entry shows its icon and label; the
 * other collapses to just its icon, so the control keeps a stable width and the
 * sliding indicator in `ToggleGroup` does the work of showing which is active.
 */
const VARIANT_OPTIONS: IconSwitchOption<ComposerVariant>[] = [
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
 *
 * The switch itself is now `IconSwitch`, shared with the theme switch in
 * settings. That is not tidiness for its own sake — both are the same decision
 * (a few options, one of them in force, the control keeping its size whichever
 * is chosen) with the same animation, and as two hand-written copies they would
 * have started to differ the first time either was touched.
 */
export function ComposerVariantSwitch({ className }: { className?: string }) {
  const { variant, setVariant } = useComposerVariant()

  return (
    <IconSwitch
      aria-label="Composer"
      value={variant}
      onValueChange={setVariant}
      options={VARIANT_OPTIONS}
      className={className}
    />
  )
}