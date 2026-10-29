import type { Issue } from "@/domain/types";

export class ServiceError extends Error {
  constructor(public status: number, message: string, public issues: Issue[] = []) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to perform this action.") => new ServiceError(403, msg);
export const notFound = (what = "Record") => new ServiceError(404, `${what} not found.`);
export const badRequest = (msg: string, issues: Issue[] = []) => new ServiceError(400, msg, issues);
export const rejected = (issues: Issue[], msg = "This action violates one or more leave rules.") => new ServiceError(422, msg, issues);
