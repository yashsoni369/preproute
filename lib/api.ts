import axios, { type AxiosRequestConfig } from "axios"

import { getAuthToken, type AuthUser } from "@/lib/auth"
import { invalidateDashboardTestsCache } from "@/lib/dashboard-cache"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

type ApiValidationError = {
  message?: string
  msg?: string
  path?: string
  code?: string
  details?: string
}

type ApiErrorDetails =
  | ApiValidationError[]
  | ApiValidationError
  | Record<string, unknown>
  | string
  | null

type ApiResponse<T> = {
  success?: boolean
  status?: string
  data?: T
  message?: string
  errors?: ApiErrorDetails
}

function getErrorDetailMessage(error: unknown): string | undefined {
  if (!error) return undefined

  if (typeof error === "string") {
    return error
  }

  if (Array.isArray(error)) {
    return error
      .map((item) => getErrorDetailMessage(item))
      .filter(Boolean)
      .join(", ")
  }

  if (typeof error === "object") {
    const detail = error as Record<string, unknown>
    const message = detail.msg ?? detail.message ?? detail.details

    if (typeof message === "string" && message.trim()) {
      return message
    }
  }

  return undefined
}

function getApiErrorMessage<T>(
  payload: ApiResponse<T>,
  fallbackMessage: string
) {
  const detailMessage = getErrorDetailMessage(payload.errors)

  if (payload.message && detailMessage) {
    return `${payload.message}: ${detailMessage}`
  }

  return detailMessage || payload.message || fallbackMessage
}

export function normalizeDifficultyForApi(value?: string) {
  if (value === "difficult") {
    return "hard"
  }

  return value || "easy"
}

export type LoginPayload = {
  userId: string
  password: string
}

export type LoginData = {
  token: string
  user?: AuthUser
}

export type Subject = {
  id: string
  name: string
}

export type Topic = {
  id: string
  name: string
  subject_id: string
}

export type SubTopic = {
  id: string
  name: string
  topic_id: string
}

export type CreateTestPayload = {
  name: string
  type: string
  subject: string
  topics: string[]
  sub_topics: string[]
  correct_marks: number
  wrong_marks: number
  unattempt_marks: number
  difficulty: string
  total_time: number
  total_marks: number
  total_questions: number
  status: string
}

export type UpdateTestPayload = Partial<CreateTestPayload> & {
  questions?: string[]
}

export type TestRecord = CreateTestPayload & {
  id: string
  created_at?: string
  updated_at?: string
}

export type CreateQuestionPayload = {
  type: "mcq"
  subject: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  correct_option: "option1" | "option2" | "option3" | "option4"
  explanation?: string
  difficulty?: string
  test_id: string
}

export type QuestionRecord = CreateQuestionPayload & {
  id: string
  created_at?: string
  updated_at?: string
}

const backendClient = axios.create({
  baseURL: "/api/backend",
  headers: {
    "Content-Type": "application/json",
  },
})

const SKIP_AUTH_HEADER = "X-Skip-Auth"

backendClient.interceptors.request.use((config) => {
  const skipAuth = config.headers.get(SKIP_AUTH_HEADER)
  config.headers.delete(SKIP_AUTH_HEADER)

  if (skipAuth) {
    return config
  }

  const token = getAuthToken()

  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`)
  }

  return config
})

function extractResponsePayload<T>(data: unknown): ApiResponse<T> {
  if (data && typeof data === "object") {
    return data as ApiResponse<T>
  }

  return {}
}

export async function apiRequest<T>(
  path: string,
  init: AxiosRequestConfig & { auth?: boolean } = {}
) {
  const { auth = true, headers, ...requestConfig } = init

  try {
    const response = await backendClient.request<ApiResponse<T>>({
      url: path,
      method: "GET",
      ...requestConfig,
      headers: { ...headers, ...(auth ? {} : { [SKIP_AUTH_HEADER]: "1" }) },
    })

    const payload = extractResponsePayload<T>(response.data)

    if (payload.success === false || payload.status === "error") {
      throw new ApiError(
        getApiErrorMessage(payload, `Request failed with status ${response.status}`),
        response.status
      )
    }

    return payload
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const payload = extractResponsePayload<T>(error.response?.data)

      throw new ApiError(
        getApiErrorMessage(payload, `Request failed with status ${status}`),
        status
      )
    }

    throw error
  }
}

export async function loginUser(payload: LoginPayload) {
  try {
    const response = await axios.post<ApiResponse<LoginData>>(
      "/api/auth/login",
      payload,
      { headers: { "Content-Type": "application/json" } }
    )

    const apiPayload = extractResponsePayload<LoginData>(response.data)

    if (apiPayload.success === false || apiPayload.status === "error") {
      throw new ApiError(
        getApiErrorMessage(apiPayload, `Request failed with status ${response.status}`),
        response.status
      )
    }

    return apiPayload
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const apiPayload = extractResponsePayload<LoginData>(error.response?.data)

      throw new ApiError(
        getApiErrorMessage(apiPayload, `Request failed with status ${status}`),
        status
      )
    }

    throw error
  }
}

export async function getSubjects() {
  return apiRequest<Subject[]>("/subjects")
}

export async function getTopicsBySubject(subjectId: string) {
  return apiRequest<Topic[]>(`/topics/subject/${subjectId}`)
}

export async function getSubTopicsByTopics(topicIds: string[]) {
  return apiRequest<SubTopic[]>("/sub-topics/multi-topics", {
    method: "POST",
    data: { topicIds },
  })
}

export async function createTest(payload: CreateTestPayload) {
  const response = await apiRequest<TestRecord>("/tests", {
    method: "POST",
    data: payload,
  })

  invalidateDashboardTestsCache()
  return response
}

export async function updateTest(testId: string, payload: UpdateTestPayload) {
  const response = await apiRequest<TestRecord>(`/tests/${testId}`, {
    method: "PUT",
    data: payload,
  })

  invalidateDashboardTestsCache()
  return response
}

export async function getTests(config?: Pick<AxiosRequestConfig, "signal">) {
  return apiRequest<TestDetailRecord[]>("/tests", config)
}

// `GET /tests` returns each test's `questions` array (the UUIDs of questions
// already created for it), so a real completion count is available straight
// from the list - no per-test detail fetch required. `GET /tests/:id` returns
// the same record shape for a single test.
export type TestDetailRecord = TestRecord & {
  questions?: string[]
}

export async function getTestById(
  testId: string,
  config?: Pick<AxiosRequestConfig, "signal">
) {
  return apiRequest<TestDetailRecord>(`/tests/${testId}`, config)
}

export async function createQuestionsBulk(questions: CreateQuestionPayload[]) {
  const response = await apiRequest<QuestionRecord[]>("/questions/bulk", {
    method: "POST",
    data: { questions },
  })

  invalidateDashboardTestsCache()
  return response
}

export async function fetchQuestionsBulk(
  questionIds: string[],
  config?: Pick<AxiosRequestConfig, "signal">
) {
  return apiRequest<QuestionRecord[]>("/questions/fetchBulk", {
    method: "POST",
    data: { question_ids: questionIds },
    ...config,
  })
}
