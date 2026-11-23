export class MapProviderError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
  }
}

export function mapProviderMessage(error: unknown) {
  if (error instanceof MapProviderError) return { message: error.message, status: error.status };
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { message: "The map provider took too long to respond. Try again.", status: 504 };
  }
  return { message: "The map provider is temporarily unavailable. Try again later.", status: 503 };
}
