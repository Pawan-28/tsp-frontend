/** TS Publication brand logo — uses the official dark-background logo mark */

export const TS_PUBLICATION_LOGO_SRC = "/ts-publication-logo.png";

/**
 * @param {number}  size            Width/height in px (default 36)
 * @param {string}  className       Extra Tailwind classes
 * @param {boolean} showBackground  Show dark container (default true)
 * @param {"square"|"rounded"|"circle"} shape  Corner style (default "rounded")
 */
export default function TSPublicationDoodleLogo({
  size = 36,
  className = "",
  showBackground = true,
  shape = "rounded",
}) {
  const radius =
    shape === "circle"
      ? "rounded-full"
      : shape === "square"
      ? "rounded-none"
      : size >= 56
      ? "rounded-2xl"
      : size >= 40
      ? "rounded-xl"
      : "rounded-lg";

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${
        showBackground
          ? "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.1)] ring-1 ring-black/5"
          : ""
      } ${radius} ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={TS_PUBLICATION_LOGO_SRC}
        alt="TS Publication"
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}
