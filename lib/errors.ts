/** Application error carrying an HTTP status, for API route handlers. */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}
