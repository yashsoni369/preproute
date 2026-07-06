type SubjectCoverageChartProps = {
  data: { subject: string; count: number }[]
}

export function SubjectCoverageChart({ data }: SubjectCoverageChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div
      aria-label="Subject coverage list"
      className="max-h-[360px] overflow-y-auto pr-1 outline-none xl:max-h-[500px]"
      data-slot="coverage-scroll"
      tabIndex={0}
    >
      <ul className="flex flex-col gap-3">
        {data.map(({ subject, count }) => (
          <li key={subject} className="grid grid-cols-[104px_1fr_28px] items-center gap-3">
            <span className="truncate text-[12.5px] font-medium text-[#30384b]">
              {subject}
            </span>
            <div className="h-[7px] rounded-full bg-[#edf1f7]">
              <div
                className="h-full rounded-full bg-[#2448dd]"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-right text-[12px] font-medium tabular-nums text-[#6b7286]">
              {count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
