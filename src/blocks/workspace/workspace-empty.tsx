"use client"

import * as React from "react"
import { LayoutPanelLeftIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/empty"
import { useWorkspace } from "@/lib/workspace-state"
import { ViewsPicker } from "./views-picker"

/**
 * The empty workspace.
 *
 * Shown when the workspace is open and holds no panes. Not before: the
 * landing screen is not an empty workspace, and the two have to stay
 * distinct. The landing screen asks a question and offers a box to type
 * in; this says the workspace is empty and offers a way to fill it.
 *
 * It is quiet on purpose. The Code landing screen is the app's loudest
 * surface, and a second loud thing in the same place would be a
 * competition rather than a state.
 */
export function WorkspaceEmpty({ className }: { className?: string }) {
  const { panes } = useWorkspace()
  if (panes.length > 0) return null

  return (
    <Empty size="sm" className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LayoutPanelLeftIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing open yet</EmptyTitle>
        <EmptyDescription>
          Add a view to arrange your work here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ViewsPicker />
      </EmptyContent>
    </Empty>
  )
}
