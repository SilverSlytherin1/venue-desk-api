import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toProblem } from './problem.js';

const logger = new Logger('ProblemFilter');

/**
 * Writes any error as a problem document. This is the handler of last resort, so it must not
 * throw: the path is cut by hand because URL parsing rejects a request target such as "//".
 */
export function sendProblem(exception: unknown, request: Request, response: Response): void {
  // originalUrl rather than path: path is relative to whichever router handled the request.
  const [instance = ''] = request.originalUrl.split('?');
  const problem = toProblem(exception, instance);

  if (problem.status >= 500) {
    logger.error(exception instanceof Error ? exception.stack : exception);
  }
  response.status(problem.status).type('application/problem+json').json(problem);
}

/** The single place where errors thrown by the application become HTTP responses. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendProblem(exception, http.getRequest<Request>(), http.getResponse<Response>());
  }
}
