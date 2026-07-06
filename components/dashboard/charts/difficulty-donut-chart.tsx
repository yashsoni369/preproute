import type { Difficulty } from "@/lib/dashboard-data"

type DifficultyDonutChartProps = {
  data: { difficulty: Difficulty; count: number; percent: number }[]
}

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string }> = {
  easy: { label: "Easy", color: "#2ebdaf" },
  medium: { label: "Medium", color: "#2448dd" },
  hard: { label: "Hard", color: "#d1373f" },
}

const SIZE = 128
const STROKE = 16
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function buildSegments(data: DifficultyDonutChartProps["data"]) {
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1
  let offset = 0

  return data
    .filter((d) => d.count > 0)
    .map((d) => {
      const dash = (d.count / total) * CIRCUMFERENCE
      const segment = { ...d, dash, gap: CIRCUMFERENCE - dash, dashOffset: -offset }
      offset += dash + 2 // 2px surface gap between segments
      return segment
    })
}

export function DifficultyDonutChart({ data }: DifficultyDonutChartProps) {
  const segments = buildSegments(data)

  return (
    <div className="flex items-center gap-5">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Difficulty distribution across tests"
        className="-rotate-90 shrink-0"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#edf1f7"
          strokeWidth={STROKE}
        />
        {segments.map(({ difficulty, dash, gap, dashOffset }) => (
          <circle
            key={difficulty}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={DIFFICULTY_META[difficulty].color}
            strokeWidth={STROKE}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <ul className="flex flex-col gap-2.5">
        {data.map(({ difficulty, count, percent }) => (
          <li key={difficulty} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: DIFFICULTY_META[difficulty].color }}
              aria-hidden="true"
            />
            <span className="font-medium text-[#30384b]">
              {DIFFICULTY_META[difficulty].label}
            </span>
            <span className="tabular-nums text-[#98a2b3]">
              {count} - {percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
