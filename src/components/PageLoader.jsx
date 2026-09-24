export default function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-full border-2 border-rose-200 border-t-[#be123c] animate-spin" />
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading</p>
      </div>
    </div>
  );
}
