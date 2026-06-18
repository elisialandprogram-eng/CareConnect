/**
 * TableSkeleton — standardised loading placeholder for table/list views.
 * Drop in when `isLoading` is true instead of a Loader2 spinner to avoid layout shift.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

/**
 * Renders a table-shaped skeleton grid.
 *
 * @param rows  Number of placeholder rows (default 5)
 * @param cols  Number of columns per row (default 4)
 */
export function TableSkeleton({ rows = 5, cols = 4, className }: TableSkeletonProps) {
  return (
    <div className={cn("w-full space-y-2", className)} data-testid="table-skeleton" aria-busy="true">
      {/* Header row */}
      <div className="flex gap-3 px-1 pb-2 border-b">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 rounded" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-1 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn(
                "h-4 rounded flex-1",
                c === 0 && "flex-[2]",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * CardSkeleton — loading placeholder for card-based layouts.
 */
interface CardSkeletonProps {
  count?: number;
  className?: string;
}

export function CardSkeleton({ count = 3, className }: CardSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)} data-testid="card-skeleton" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full flex-shrink-0" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-3 w-1/4 rounded" />
            <Skeleton className="h-3 w-1/4 rounded" />
            <Skeleton className="h-3 w-1/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * InlineSpinner — inline loading indicator for tight spaces (buttons, cells).
 * Use CardSkeleton / TableSkeleton for full-section loading.
 */
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      aria-hidden="true"
    />
  );
}
