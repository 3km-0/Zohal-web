/**
 * Error handling utilities for Zohal Web
 * Maps backend errors to user-friendly messages
 */

/** Backend error codes from Edge Functions */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'limit_exceeded'
  | 'upstream_failed'
  | 'internal';

/** Error category for UI styling */
export type ErrorCategory =
  | 'auth'
  | 'network'
  | 'not_found'
  | 'limit'
  | 'permission'
  | 'server'
  | 'unknown';

/** User-facing error */
export interface UserFacingError {
  title: string;
  message: string;
  category: ErrorCategory;
  action?: 'retry' | 'sign-in' | 'upgrade' | 'dismiss';
  requestId?: string;
}

/** Backend error response envelope */
interface BackendErrorResponse {
  ok?: boolean;
  error_code?: string;
  message?: string;
  request_id?: string;
  // Legacy error format
  error?: string;
}

/**
 * Map any error to a user-facing error
 */
export function mapError(error: unknown, endpoint?: string): UserFacingError {
  // Already a UserFacingError
  if (isUserFacingError(error)) {
    return error;
  }

  // Supabase / fetch response error with data
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const data = (error as { data?: unknown }).data;
    return mapHttpError(status, data, endpoint);
  }

  // Error object
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
      return networkError();
    }
    
    return serverError(undefined, error.message);
  }

  return unknownError();
}

/**
 * Map HTTP status code and response data to UserFacingError
 */
export function mapHttpError(
  status: number,
  data: unknown,
  endpoint?: string
): UserFacingError {
  let backendResponse: BackendErrorResponse | undefined;
  let requestId: string | undefined;
  let errorCode: ErrorCode | undefined;
  let serverMessage: string | undefined;

  // Parse backend response
  if (data && typeof data === 'object') {
    backendResponse = data as BackendErrorResponse;
    requestId = backendResponse.request_id;
    errorCode = backendResponse.error_code as ErrorCode | undefined;
    serverMessage = backendResponse.message ?? backendResponse.error;
  }

  // Map by error code first (more specific)
  if (errorCode) {
    return mapErrorCode(errorCode, requestId);
  }

  // Fall back to HTTP status
  switch (status) {
    case 400:
      return {
        title: 'Invalid Request',
        message: serverMessage ?? 'The request couldn\'t be processed.',
        category: 'unknown',
        action: 'dismiss',
        requestId,
      };
    case 401:
      return authRequired(requestId);
    case 403:
      return permissionDenied(requestId);
    case 404:
      return notFound(undefined, requestId);
    case 429:
      return limitExceeded(requestId);
    case 502:
    case 503:
    case 504:
      return upstreamFailed(requestId);
    default:
      return serverError(requestId, serverMessage);
  }
}

/**
 * Map backend error code to UserFacingError
 */
function mapErrorCode(code: ErrorCode, requestId?: string): UserFacingError {
  switch (code) {
    case 'unauthenticated':
      return authRequired(requestId);
    case 'forbidden':
      return permissionDenied(requestId);
    case 'not_found':
      return notFound(undefined, requestId);
    case 'invalid_input':
      return {
        title: 'Invalid Input',
        message: 'Please check your input and try again.',
        category: 'unknown',
        action: 'dismiss',
        requestId,
      };
    case 'limit_exceeded':
      return limitExceeded(requestId);
    case 'upstream_failed':
      return upstreamFailed(requestId);
    case 'internal':
    default:
      return serverError(requestId);
  }
}

// MARK: - Common Errors

export function networkError(requestId?: string): UserFacingError {
  return {
    title: 'Connection Error',
    message: 'Unable to connect. Please check your internet connection.',
    category: 'network',
    action: 'retry',
    requestId,
  };
}

export function authRequired(requestId?: string): UserFacingError {
  return {
    title: 'Sign In Required',
    message: 'Please sign in to continue.',
    category: 'auth',
    action: 'sign-in',
    requestId,
  };
}

export function notFound(resource = 'content', requestId?: string): UserFacingError {
  return {
    title: 'Not Found',
    message: `The requested ${resource} could not be found.`,
    category: 'not_found',
    action: 'dismiss',
    requestId,
  };
}

export function limitExceeded(requestId?: string): UserFacingError {
  return {
    title: 'Limit Reached',
    message: 'You\'ve reached your usage limit. Upgrade for unlimited access.',
    category: 'limit',
    action: 'upgrade',
    requestId,
  };
}

export function permissionDenied(requestId?: string): UserFacingError {
  return {
    title: 'Access Denied',
    message: 'You don\'t have permission to access this content.',
    category: 'permission',
    action: 'dismiss',
    requestId,
  };
}

export function serverError(requestId?: string, originalMessage?: string): UserFacingError {
  return {
    title: 'Something Went Wrong',
    message: 'We\'re having trouble processing your request. Please try again.',
    category: 'server',
    action: 'retry',
    requestId,
  };
}

export function upstreamFailed(requestId?: string): UserFacingError {
  return {
    title: 'Service Unavailable',
    message: 'The service is temporarily unavailable. Please try again in a moment.',
    category: 'server',
    action: 'retry',
    requestId,
  };
}

export function unknownError(requestId?: string): UserFacingError {
  return {
    title: 'Error',
    message: 'An unexpected error occurred. Please try again.',
    category: 'unknown',
    action: 'retry',
    requestId,
  };
}

// MARK: - Type Guards

function isUserFacingError(error: unknown): error is UserFacingError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'title' in error &&
    'message' in error &&
    'category' in error
  );
}

