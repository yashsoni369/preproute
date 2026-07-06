"use client"

import { useId, useState } from "react"

type CreationTrendChartProps = {
  data: { week: string; count: number }[]
}

const WIDTH = 560
const HEIGHT = 160
const PAD_X = 8
const PAD_TOP = 16
const PAD_BOTTOM = 24

export function CreationTrendChart({ data }: CreationTrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const gradientId = useId()

  const max = Math.max(...data.map((d) => d.count), 1)
  const plotWidth = WIDTH - PAD_X * 2
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0

  const points = data.map((d, index) => {
    const x = PAD_X + stepX * index
    const y = PAD_TOP + plotHeight - (d.count / max) * plotHeight
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_TOP + plotHeight} L${points[0].x},${PAD_TOP + plotHeight} Z`

  const activePoint = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1]
  const isHovering = hoverIndex !== null

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.round((relativeX - PAD_X) / (stepX || 1))
    setHoverIndex(Math.min(Math.max(index, 0), data.length - 1))
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="New tests created per week, last eight weeks"
        className="w-full"
        style={{ height: "auto" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2448dd" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2448dd" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_TOP + plotHeight * fraction}
            y2={PAD_TOP + plotHeight * fraction}
            stroke="#edf1f7"
            strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke="#2448dd" strokeWidth={2} />

        {isHovering ? (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="#c7d1ff"
            strokeWidth={1}
          />
        ) : null}

        <circle
          cx={activePoint.x}
          cy={activePoint.y}
          r={isHovering ? 5 : 4}
          fill="#2448dd"
          stroke="#ffffff"
          strokeWidth={2}
        />

        {points.map((p, index) => (
          <text
            key={p.week}
            x={p.x}
            y={HEIGHT - 4}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            fontSize={10.5}
            fill="#98a2b3"
          >
            {index % 2 === 0 ? p.week : ""}
          </text>
        ))}

        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      <div
        className="pointer-events-none absolute top-0 rounded-md border border-[#e4e8f0] bg-white px-2.5 py-1.5 text-[11.5px] shadow-[0_6px_16px_rgba(17,24,61,0.12)] transition-opacity"
        style={{
          left: `${(activePoint.x / WIDTH) * 100}%`,
          transform: `translate(${activePoint.x > WIDTH * 0.75 ? "-100%" : "-8%"}, -4px)`,
          opacity: isHovering ? 1 : 0,
        }}
      >
        <div className="font-semibold text-[#11183d]">{activePoint.count} tests created</div>
        <div className="text-[#98a2b3]">Week of {activePoint.week}</div>
      </div>

      <table className="sr-only">
        <caption>New tests created per week</caption>
        <thead>
          <tr>
            <th>Week</th>
            <th>Tests created</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.week}>
              <td>{d.week}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
