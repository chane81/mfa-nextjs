export interface SkeletonProps {
  label: string;
}

export function Skeleton({ label }: SkeletonProps) {
  return (
    <div className="rounded-lg border border-dashed border-line p-6 text-center font-mono text-[13px] text-muted">
      {label}
    </div>
  );
}
