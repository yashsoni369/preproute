import { API_BASE_URL } from "@/lib/api-constants"

type BackendRouteContext = {
  params: Promise<{
    path: string[]
  }>
}

async function forwardRequest(request: Request, context: BackendRouteContext) {
  const { path } = await context.params
  const targetPath = path.join("/")
  const targetUrl = new URL(`${API_BASE_URL}/${targetPath}`)
  const requestUrl = new URL(request.url)

  requestUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value)
  })

  const headers = new Headers()
  const contentType = request.headers.get("content-type")
  const authorization = request.headers.get("authorization")

  if (contentType) {
    headers.set("Content-Type", contentType)
  }

  if (authorization) {
    headers.set("Authorization", authorization)
  }

  const hasBody = !["GET", "HEAD"].includes(request.method)
  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
    signal: request.signal,
  })
  const responseHeaders = new Headers()
  const backendContentType = backendResponse.headers.get("content-type")

  if (backendContentType) {
    responseHeaders.set("Content-Type", backendContentType)
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  })
}

export async function GET(request: Request, context: BackendRouteContext) {
  return forwardRequest(request, context)
}

export async function POST(request: Request, context: BackendRouteContext) {
  return forwardRequest(request, context)
}

export async function PUT(request: Request, context: BackendRouteContext) {
  return forwardRequest(request, context)
}

export async function DELETE(request: Request, context: BackendRouteContext) {
  return forwardRequest(request, context)
}
