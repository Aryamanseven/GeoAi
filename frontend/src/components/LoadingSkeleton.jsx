export default function LoadingSkeleton({ lines = 3, height = 16, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="geo-shimmer rounded-xl"
          style={{
            height,
            width: `${Math.max(58, 100 - index * 9)}%`
          }}
        />
      ))}
    </div>
  );
}
