import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-xl"
        >
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
