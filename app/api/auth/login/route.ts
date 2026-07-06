import { API_BASE_URL } from "@/lib/api-constants"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const backendResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const contentType = backendResponse.headers.get("content-type")

    if (!contentType?.includes("application/json")) {
      return Response.json(
        {
          success: false,
          message: "Login service returned an invalid response",
        },
        { status: backendResponse.status || 502 }
      )
    }

    const payload = await backendResponse.json()

    return Response.json(payload, { status: backendResponse.status })
  } catch {
    return Response.json(
      {
        success: false,
        message: "Unable to reach login service",
      },
      { status: 502 }
    )
  }
}

