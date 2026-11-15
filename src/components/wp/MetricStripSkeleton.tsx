import { Skeleton } from "./ui";

export function MetricStripSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border border-line rounded-[6px] bg-panel divide-x divide-line">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-36" />
        </div>
      ))}
    </div>
  );
}

