type ApiErrorEnvelope = {
  code?: string;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    status: number;
    method: string;
    path: string;
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.code = input.code;
    this.details = input.details;
  }
}

async function parseApiError(response: Response, method: string, path: string): Promise<ApiRequestError> {
  const fallbackMessage = `${method} ${path} failed (${response.status})`;

  let payload: ApiErrorEnvelope | null = null;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as ApiErrorEnvelope;
    } catch {
      payload = null;
    }
  } else {
    try {
      const text = (await response.text()).trim();
      if (text) {
        try {
          payload = JSON.parse(text) as ApiErrorEnvelope;
        } catch {
          payload = { message: text, error: text };
        }
      }
    } catch {
      payload = null;
    }
  }

  const message =
    (typeof payload?.message === "string" && payload.message.trim()) ||
    (typeof payload?.error === "string" && payload.error.trim()) ||
    fallbackMessage;
  const code = typeof payload?.code === "string" && payload.code.trim() ? payload.code : undefined;
  const details = payload?.details && typeof payload.details === "object" ? payload.details : undefined;

  return new ApiRequestError({
    status: response.status,
    method,
    path,
    message: code ? `${message} (${code})` : message,
    code,
    details
  });
}

export class ApiClient {
  constructor(private baseUrl: string, private token: string) {}

  setAuth(baseUrl: string, token: string): void {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "x-api-token": this.token
      }
    });

    if (!response.ok) {
      throw await parseApiError(response, "GET", path);
    }

    return (await response.json()) as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const hasBody = body !== undefined;
    const headers: Record<string, string> = {
      "x-api-token": this.token
    };

    if (hasBody) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: hasBody ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw await parseApiError(response, "POST", path);
    }

    return (await response.json()) as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-api-token": this.token
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw await parseApiError(response, "PUT", path);
    }

    return (await response.json()) as T;
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "x-api-token": this.token
      }
    });

    if (!response.ok) {
      throw await parseApiError(response, "DELETE", path);
    }

    return (await response.json()) as T;
  }
}
