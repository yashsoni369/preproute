import { getTests } from "@/lib/api"
import {
  getDashboardCacheEpoch,
  getDashboardCacheOwner,
  readDashboardTestsCache,
  writeDashboardTestsCache,
} from "@/lib/dashboard-cache"
import {
  mapTestRecordToDashboardTest,
  type DashboardTest,
} from "@/lib/dashboard-data"

let inflight:
  | {
      owner: string
      promise: Promise<DashboardTest[]>
    }
  | null = null

type DashboardTestsRequestConfig = {
  signal?: AbortSignal
}

export async function refreshDashboardTests(
  config: DashboardTestsRequestConfig = {}
) {
  const owner = getDashboardCacheOwner()

  if (!owner) {
    throw new Error("Dashboard data requires an authenticated session.")
  }

  if (inflight?.owner === owner) {
    return inflight.promise
  }

  const epoch = getDashboardCacheEpoch()
  const promise = getTests({ signal: config.signal }).then((response) => {
    const tests = (response.data ?? []).map(mapTestRecordToDashboardTest)
    writeDashboardTestsCache(tests, { epoch })
    return tests
  })

  inflight = { owner, promise }

  promise.then(
    () => {
      if (inflight?.promise === promise) {
        inflight = null
      }
    },
    () => {
      if (inflight?.promise === promise) {
        inflight = null
      }
    }
  )

  return promise
}

export function prefetchDashboardTests() {
  const cached = readDashboardTestsCache()

  if (cached?.isFresh) {
    return Promise.resolve(cached.tests)
  }

  return refreshDashboardTests().catch(() => undefined)
}
