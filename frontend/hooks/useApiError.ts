import { useCallback } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export function useApiError() {
  const handleApiError = useCallback((error: any, fallbackMessage?: string) => {
    console.error('API Error caught by hook:', error);

    if (error instanceof ApiError) {
      const status = error.status;
      const message = error.message;

      if (status === 403) {
        toast.error("You don't have permission to do that.");
        return;
      }

      if (status === 404) {
        toast.error("Requested resource was not found.");
        return;
      }

      if (status === 429) {
        toast.error("Too many requests. Please wait a moment.");
        return;
      }

      if (status >= 500) {
        toast.error("Something went wrong on our end. We're looking into it.");
        return;
      }

      // 400, 422, 409 etc. - show the actual message returned by API if available
      toast.error(message || fallbackMessage || "An error occurred");
    } else if (error instanceof Error) {
      toast.error(error.message || fallbackMessage || "An unexpected error occurred");
    } else {
      toast.error(fallbackMessage || "Something went wrong");
    }
  }, []);

  return { handleApiError };
}
