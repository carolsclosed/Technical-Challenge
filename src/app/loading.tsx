export default function Loading() {
  return (
    <div className="container" aria-busy="true">
      <div className="skeleton" />
      <div className="grid" style={{ marginTop: 24 }}>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}
