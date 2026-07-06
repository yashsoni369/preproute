export const TOKEN_STORAGE_KEY = "preproute_auth_token"
export const USER_STORAGE_KEY = "preproute_auth_user"

export type AuthUser = Record<string, unknown>

export function getAuthToken() {
  if (typeof window === "undefined") {
    return null
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function getAuthUser() {
  if (typeof window === "undefined") {
    return null
  }

  const storedUser = window.localStorage.getItem(USER_STORAGE_KEY)

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser) as AuthUser
  } catch {
    return null
  }
}

export function setAuthSession(token: string, user?: AuthUser) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)

  if (user) {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  }
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(USER_STORAGE_KEY)
}
