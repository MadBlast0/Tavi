"use client";

import { useAui } from "@assistant-ui/react";
import { ChevronDownIcon, GaugeIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import type { KeyStatus } from "./key-types";

type SlimModel = {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  free: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  supportsEffort: boolean;
  reasoningMandatory: boolean;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number;
  completionPrice: number;
};

type CatalogResponse = {
  models?: SlimModel[];
  stale?: boolean;
  error?: string;
};

type Hovered = { model: SlimModel; top: number; left: number } | null;

const MODEL_KEY = "ai-app.model";
const EFFORT_KEY = "ai-app.effort";

const EFFORTS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
] as const;

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeStored = (key: string, value: string | undefined) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; selection still works for this session.
  }
};

const modelLabel = (model: SlimModel) =>
  model.name.replace(/\s*\(free\)$/, "");

const priceLabel = (model: SlimModel) =>
  model.free
    ? "free"
    : `$${(model.promptPrice * 1e6).toFixed(2)}/M in · $${(
        model.completionPrice * 1e6
      ).toFixed(2)}/M out`;

const DetailRow = ({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-6 py-1">
    <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
    <span
      className={cn(
        "min-w-0 truncate text-right text-xs",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {value}
    </span>
  </div>
);

/**
 * Hover detail panel. Positioned against the viewport rather than inside the
 * menu, so it is unaffected by the list scrolling and never interferes with the
 * menu's own focus and dismissal handling.
 */
const ModelDetails = ({ hovered }: { hovered: Hovered }) => {
  if (!hovered) return null;
  const { model, top, left } = hovered;
  const flipLeft = left > window.innerWidth - 300;

  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground pointer-events-none fixed z-50 w-64 rounded-lg border p-3 shadow-lg"
      style={{
        top: Math.max(8, Math.min(top, window.innerHeight - 200)),
        left: flipLeft ? Math.max(8, left - 272) : left,
      }}
    >
      <div className="mb-1.5 border-b pb-1.5 text-sm font-medium">
        {modelLabel(model)}
      </div>
      <DetailRow label="Provider" value={model.provider} />
      <DetailRow
        label="Inputs"
        value={model.inputModalities.join(", ") || "text"}
      />
      <DetailRow
        label="Tools"
        value={model.supportsTools ? "Tool calling" : "No tool calling"}
        muted={!model.supportsTools}
      />
      <DetailRow
        label="Reasoning"
        value={
          model.supportsReasoning
            ? model.reasoningMandatory
              ? "Always reasons"
              : "Optional"
            : "No reasoning"
        }
        muted={!model.supportsReasoning}
      />
      <DetailRow
        label="Context"
        value={
          model.contextLength
            ? model.contextLength.toLocaleString()
            : "unknown"
        }
      />
      <DetailRow label="Price" value={priceLabel(model)} />
    </div>
  );
};

/**
 * Model and reasoning-effort picker for the composer rail.
 *
 * Mounted inside the assistant runtime provider so the selection can be
 * registered with assistant-ui's model context, which is what reaches the next
 * request.
 */
export const ComposerModelPicker = ({ className }: { className?: string }) => {
  const aui = useAui();

  const [catalog, setCatalog] = useState<SlimModel[]>([]);
  const [freeOnly, setFreeOnly] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<KeyStatus | null>(null);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<Hovered>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [modelId, setModelId] = useState<string | undefined>(() =>
    readStored(MODEL_KEY),
  );
  const [effort, setEffort] = useState<string | undefined>(() =>
    readStored(EFFORT_KEY),
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/models")
      .then((r) => r.json() as Promise<CatalogResponse>)
      .then((data) => {
        if (cancelled) return;
        if (!data.models) return setError(data.error ?? "No catalog");
        setCatalog(data.models);
        setStale(Boolean(data.stale));
      })
      .catch(() => !cancelled && setError("Catalog unreachable"));

    fetch("/api/key")
      .then((r) => r.json() as Promise<KeyStatus>)
      .then((s) => !cancelled && setKey(s))
      .catch(() => !cancelled && setKey({ valid: false }));

    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (freeOnly ? catalog.filter((m) => m.free) : catalog),
    [catalog, freeOnly],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [visible, query]);

  const groups = useMemo(() => {
    const map = new Map<string, SlimModel[]>();
    for (const model of filtered) {
      const list = map.get(model.provider) ?? [];
      list.push(model);
      map.set(model.provider, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Publishes the selection so it reaches the next request.
  useEffect(() => {
    if (!modelId) return;
    return aui.modelContext.register({
      getModelContext: () => ({
        config: {
          modelName: modelId,
          ...(effort ? { reasoningEffort: effort } : {}),
        },
      }),
    });
  }, [aui, modelId, effort]);

  const selected = catalog.find((m) => m.id === modelId);
  const showEffort = selected?.supportsEffort ?? false;
  const effectiveEffort = showEffort ? effort : undefined;

  const showDetails = (model: SlimModel, element: HTMLElement) => {
    const row = element.getBoundingClientRect();
    const menu = listRef.current?.parentElement?.getBoundingClientRect();
    const anchorRight = menu ? menu.right : row.right;
    setHovered({ model, top: row.top - 12, left: anchorRight + 8 });
  };

  if (error) {
    return (
      <span className={cn("text-destructive truncate text-xs", className)}>
        {error}
      </span>
    );
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setQuery("");
            setHovered(null);
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Model: ${selected ? modelLabel(selected) : "not selected"}`}
              className={cn(
                "text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
                className,
              )}
            >
              <span className="max-w-[9rem] truncate">
                {selected ? modelLabel(selected) : "Select model"}
              </span>
              {showEffort && effectiveEffort && (
                <span className="text-foreground/70 shrink-0">
                  {effectiveEffort}
                </span>
              )}
              <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
            </button>
          }
        />

        {/* bg-popover matches the content so the search row reads as part of the
            same surface; no divider between it and the list. */}
        <DropdownMenuContent
          align="start"
          className="bg-popover w-72 p-0"
          onScroll={() => setHovered(null)}
        >
          <div className="bg-popover flex items-center gap-1.5 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onMouseMove={() => setHovered(null)}
              placeholder="Search models or providers…"
              aria-label="Search models"
              className="placeholder:text-muted-foreground/70 h-7 w-full min-w-0 rounded-md bg-transparent px-1.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setFreeOnly((v) => !v)}
              aria-pressed={freeOnly}
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap transition-colors",
                freeOnly
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Free
            </button>
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto py-0.5">
            {groups.length === 0 && (
              <p className="text-muted-foreground px-2 py-3 text-sm">
                No models match.
              </p>
            )}
            {groups.map(([provider, models]) => (
              <div key={provider}>
                {groups.length > 1 && (
                  <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-xs">
                    {provider}
                  </DropdownMenuLabel>
                )}
                {models.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    // This dropdown-menu is Base UI based and takes `onClick`;
                    // `onSelect` would be silently ignored.
                    onClick={() => {
                      setModelId(model.id);
                      writeStored(MODEL_KEY, model.id);
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLElement>) =>
                      showDetails(model, e.currentTarget)
                    }
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      "gap-0 py-1.5",
                      model.id === modelId && "font-medium",
                    )}
                  >
                    {modelLabel(model)}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </div>

          {showEffort && (
            <>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <GaugeIcon className="size-3.5" aria-hidden />
                  Thinking
                </span>
                <DropdownMenuRadioGroup
                  value={effectiveEffort ?? ""}
                  onValueChange={(next) => {
                    setEffort(next);
                    writeStored(EFFORT_KEY, next);
                  }}
                  aria-label="Reasoning effort"
                  className="flex items-center gap-0.5"
                >
                  {EFFORTS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.id}
                      value={option.id}
                      className="cursor-pointer rounded-md px-2 py-1 text-xs"
                    >
                      {option.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </div>
            </>
          )}

          {key && (
            <>
              <DropdownMenuSeparator />
              <p className="text-muted-foreground px-2 py-1.5 text-xs">
                {key.valid
                  ? key.isFreeTier
                    ? "Key valid · free tier"
                    : "Key valid"
                  : "Key not recognised"}
                {stale ? " · cached catalog" : ""}
              </p>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ModelDetails hovered={hovered} />
    </>
  );
};