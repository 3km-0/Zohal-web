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
  // Optional legacy metadata (ignored by default mapping)
  current_tier?: string;
  required_tier?: string;
  feature?: string;
}

type UiLocale = 'en' | 'ar';

function getUiLocale(): UiLocale {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const raw = match ? decodeURIComponent(match[1]) : 'en';
  return raw === 'ar' ? 'ar' : 'en';
}

function tr(en: string, ar: string): string {
  return getUiLocale() === 'ar' ? ar : en;
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

  // Handle legacy errors returned by some functions (no error_code envelope).
  // This keeps the UI from showing generic "Access denied" for upgrade/limit gates.
  const legacyError = backendResponse?.error;
  if (legacyError === 'feature_not_available') {
    return {
      title: tr('Upgrade Required', 'الترقية مطلوبة'),
      message:
        serverMessage ??
        tr(
          'This feature requires a paid subscription. Upgrade to continue.',
          'هذه الميزة تتطلب اشتراكًا مدفوعًا. قم بالترقية للمتابعة.'
        ),
      category: 'limit',
      action: 'upgrade',
      requestId,
    };
  }
  if (legacyError === 'limit_exceeded') {
    return limitExceeded(requestId);
  }

  // Map by error code first (more specific)
  if (errorCode) {
    return mapErrorCode(errorCode, requestId);
  }

  // Fall back to HTTP status
  switch (status) {
    case 400:
      return {
        title: tr('Invalid Request', 'طلب غير صالح'),
        message: serverMessage ?? tr("The request couldn't be processed.", 'تعذر معالجة الطلب.'),
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
        title: tr('Invalid Input', 'إدخال غير صالح'),
        message: tr('Please check your input and try again.', 'يرجى التحقق من المدخلات والمحاولة مرة أخرى.'),
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
    title: tr('Connection Error', 'مشكلة في الاتصال'),
    message: tr(
      'Unable to connect. Please check your internet connection.',
      'تعذر الاتصال. يرجى التحقق من اتصال الإنترنت.'
    ),
    category: 'network',
    action: 'retry',
    requestId,
  };
}

export function authRequired(requestId?: string): UserFacingError {
  return {
    title: tr('Sign In Required', 'يتطلب تسجيل الدخول'),
    message: tr('Please sign in to continue.', 'يرجى تسجيل الدخول للمتابعة.'),
    category: 'auth',
    action: 'sign-in',
    requestId,
  };
}

export function notFound(resource = 'content', requestId?: string): UserFacingError {
  return {
    title: tr('Not Found', 'غير موجود'),
    message: tr(`The requested ${resource} could not be found.`, 'لم يتم العثور على المحتوى المطلوب.'),
    category: 'not_found',
    action: 'dismiss',
    requestId,
  };
}

export function limitExceeded(requestId?: string): UserFacingError {
  return {
    title: tr('Limit Reached', 'تم الوصول إلى الحد'),
    message: tr(
      "You've reached your usage limit. Upgrade for unlimited access.",
      'لقد وصلت إلى حد الاستخدام. قم بالترقية للوصول غير المحدود.'
    ),
    category: 'limit',
    action: 'upgrade',
    requestId,
  };
}

export function permissionDenied(requestId?: string): UserFacingError {
  return {
    title: tr('Access Denied', 'تم رفض الوصول'),
    message: tr("You don't have permission to access this content.", 'ليست لديك صلاحية للوصول إلى هذا المحتوى.'),
    category: 'permission',
    action: 'dismiss',
    requestId,
  };
}

export function serverError(requestId?: string, originalMessage?: string): UserFacingError {
  return {
    title: tr('Something Went Wrong', 'حدث خطأ'),
    message: tr(
      "We're having trouble processing your request. Please try again.",
      'نواجه مشكلة في معالجة طلبك. يرجى المحاولة مرة أخرى.'
    ),
    category: 'server',
    action: 'retry',
    requestId,
  };
}

export function upstreamFailed(requestId?: string): UserFacingError {
  return {
    title: tr('Service Unavailable', 'الخدمة غير متاحة'),
    message: tr(
      'The service is temporarily unavailable. Please try again in a moment.',
      'الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.'
    ),
    category: 'server',
    action: 'retry',
    requestId,
  };
}

export function unknownError(requestId?: string): UserFacingError {
  return {
    title: tr('Error', 'خطأ'),
    message: tr('An unexpected error occurred. Please try again.', 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.'),
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

