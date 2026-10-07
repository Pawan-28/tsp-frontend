/** Minimal loading placeholders — an animate-pulse block, sized/rounded via className. */
export function SkeletonBlock({ className = "h-4 w-16", ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-md bg-slate-200/80 animate-pulse align-middle ${className}`}
      {...rest}
    />
  );
}

/** Drop-in for a StatCard `value` while its number is still loading. */
export function StatValueSkeleton({ className = "h-6 w-14" }) {
  return <SkeletonBlock className={className} />;
}

export default SkeletonBlock;
