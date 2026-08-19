export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton-line ${className}`} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonLine key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}
