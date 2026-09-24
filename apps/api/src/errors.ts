import { z } from "zod";

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[] | undefined;
    requestId: string;
  };
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: { path: string; message: string }[] | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: { path: string; message: string }[]
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        })
      )
      .optional(),
    requestId: z.string(),
  }),
});
