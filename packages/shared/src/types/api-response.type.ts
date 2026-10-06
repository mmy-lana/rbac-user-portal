export interface ApiResponseEnvelope<T> {
  success: boolean;
  statusCode: number;
  data: T | null;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown> | null;
  } | null;
  meta: {
    timestamp: string;
    requestId: string;
    pagination?: {
      totalRecords: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}
