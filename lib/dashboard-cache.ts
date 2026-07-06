import type { DashboardTest } from "@/lib/dashboard-data"
import { getAuthToken } from "@/lib/auth"

const CACHE_KEY = "preproute_dashboard_tests_cache_v1"
const CACHE_VERSION = 1
const FRESH_FOR_MS = 5 * 60 * 1000
const KEEP_STALE_FOR_MS = 24 * 60 * 60 * 1000

type DashboardTestsCachePayload = {
  version: typeof CACHE_VERSION
  owner: string
  savedAt: number
  tests: DashboardTest[]
}

export type DashboardTestsCacheSnapshot = {
  tests: DashboardTest[]
  savedAt: number
  ageMs: number
  isFresh: boolean
}

let cacheEpoch = 0

function hashToken(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash.toString(36)
}

export function getDashboardCacheOwner() {
  const token = getAuthToken()

  return token ? hashToken(token) : null
}

export function getDashboardCacheEpoch() {
  return cacheEpoch
}

function isDashboardTestsCachePayload(
  value: unknown
): value is DashboardTestsCachePayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const payload = value as Partial<DashboardTestsCachePayload>

  return (
    payload.version === CACHE_VERSION &&
    typeof payload.owner === "string" &&
    typeof payload.savedAt === "number" &&
    Array.isArray(payload.tests)
  )
}

export function readDashboardTestsCache(): DashboardTestsCacheSnapshot | null {
  if (typeof window === "undefined") {
    return null
  }

  const owner = getDashboardCacheOwner()

  if (!owner) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY)

    if (!raw) {
      return null
    }

    const payload = JSON.parse(raw) as unknown

    if (!isDashboardTestsCachePayload(payload) || payload.owner !== owner) {
      window.localStorage.removeItem(CACHE_KEY)
      return null
    }

    const ageMs = Date.now() - payload.savedAt

    if (ageMs < 0 || ageMs > KEEP_STALE_FOR_MS) {
      window.localStorage.removeItem(CACHE_KEY)
      return null
    }

    return {
      tests: payload.tests,
      savedAt: payload.savedAt,
      ageMs,
      isFresh: ageMs <= FRESH_FOR_MS,
    }
  } catch {
    window.localStorage.removeItem(CACHE_KEY)
    return null
  }
}

export function writeDashboardTestsCache(
  tests: DashboardTest[],
  options: { epoch?: number } = {}
) {
  if (typeof window === "undefined") {
    return false
  }

  if (
    typeof options.epoch === "number" &&
    options.epoch !== getDashboardCacheEpoch()
  ) {
    return false
  }

  const owner = getDashboardCacheOwner()

  if (!owner) {
    return false
  }

  const payload: DashboardTestsCachePayload = {
    version: CACHE_VERSION,
    owner,
    savedAt: Date.now(),
    tests,
  }

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function invalidateDashboardTestsCache() {
  cacheEpoch += 1

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CACHE_KEY)
  }
}
