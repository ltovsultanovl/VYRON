function LogoMark({
  height = 22,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <svg
      className={`logo__mark ${className}`}
      viewBox="-1 0 538 282"
      height={height}
      width={(height * 538) / 282}
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="-0.6,0 195.4,0 238.7,75 42.7,75" />
      <polygon points="330.7,0 536.6,0 373.8,282 271.3,282 228,207 329.8,207 406,75 374.5,75 314.5,179 151.9,179 108,103 271.3,103" />
    </svg>
  );
}

const SITE_NAME = "VYRON";

export default function Logo({ height = 22 }: { height?: number }) {
  return (
    <>
      <LogoMark height={height} />
      <span className="logo__text">{SITE_NAME}</span>
    </>
  );
}
