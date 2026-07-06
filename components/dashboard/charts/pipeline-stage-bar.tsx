type PipelineStageBarProps = {
  counts: { draft: number; in_progress: number; ready: number; live: number }
}

const STAGES = [
  { key: "draft", label: "Draft", color: "#98a2b3" },
  { key: "in_progress", label: "In progress", color: "#b5760a" },
  { key: "ready", label: "Ready", color: "#0a8a5c" },
  { key: "live", label: "Live", color: "#2448dd" },
] as const

export function PipelineStageBar({ counts }: PipelineStageBarProps) {
  const total = STAGES.reduce((sum, s) => sum + counts[s.key], 0) || 1

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {STAGES.map((stage) => {
          const count = counts[stage.key]
          if (count === 0) return null
          return (
            <div
              key={stage.key}
              title={`${stage.label}: ${count}`}
              style={{ width: `${(count / total) * 100}%`, background: stage.color }}
            />
          )
        })}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {STAGES.map((stage) => (
          <li key={stage.key} className="flex items-center gap-2 text-[12px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: stage.color }}
              aria-hidden="true"
            />
            <span className="font-medium text-[#30384b]">{stage.label}</span>
            <span className="tabular-nums text-[#98a2b3]">{counts[stage.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
