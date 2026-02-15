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
      const text = await response.text();
      throw new Error(text || `GET ${path} failed`);
    }

    return (await response.json()) as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-token": this.token
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `POST ${path} failed`);
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
      const text = await response.text();
      throw new Error(text || `PUT ${path} failed`);
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
      const text = await response.text();
      throw new Error(text || `DELETE ${path} failed`);
    }

    return (await response.json()) as T;
  }
}
