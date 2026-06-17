/** Shared ambient overlays — grid + purple/blue glows behind all pages. */
export function PageAmbientBackground() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(168,85,247,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168,85,247,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-0 left-1/4 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-0 right-1/4 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />
    </>
  );
}
