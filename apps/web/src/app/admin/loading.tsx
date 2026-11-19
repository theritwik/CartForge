export default function Loading() {
  return (
    <div role="status" className="animate-pulse space-y-6">
      <span className="sr-only">Loading</span>
      <div className="bg-surface h-9 w-48 rounded" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-surface h-28 rounded-lg" />
        ))}
      </div>
      <div className="bg-surface h-64 rounded-lg" />
    </div>
  );
}
