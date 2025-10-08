// ToggleSwitch.jsx
export default function ToggleSwitch({
  checked,
  onChange,
  disabled,
  busy,
  size = "sm",
  labelTop,
  labelClassName = "",
  className = "",
}) {
  const sizes = {
    md: { w: 56, h: 28, knob: 24, font: "text-[10px]" },
    sm: { w: 44, h: 22, knob: 18, font: "text-[9px]" },
  };
  const S = sizes[size] || sizes.md;

  return (
    <div className={["inline-flex flex-col items-start", className].join(" ")}>
      {labelTop && (
        <span
          className={["text-[12px] mb-1", labelClassName || "text-slate-700"].join(" ")}
        >
          {labelTop}
        </span>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={[
          "relative rounded-full transition-all border focus:outline-none focus:ring-2 focus:ring-offset-1",
          checked
            ? "bg-emerald-700 border-emerald-700 focus:ring-emerald-300"
            : "bg-slate-300 border-slate-300 focus:ring-slate-300",
          disabled || busy ? "opacity-60 cursor-not-allowed" : "hover:brightness-110",
        ].join(" ")}
        style={{ width: S.w, height: S.h }}
      >
        {/* Etiquetas ON/OFF */}
        <span
          className={[
            "absolute left-1 top-1/2 -translate-y-1/2 font-bold leading-none",
            "text-white select-none",
            S.font,
            checked ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          ON
        </span>
        <span
          className={[
            "absolute right-1 top-1/2 -translate-y-1/2 font-bold leading-none",
            "text-slate-700 select-none",
            S.font,
            checked ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          OFF
        </span>

        {/* Knob */}
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all"
          style={{
            width: S.knob,
            height: S.knob,
            left: checked ? S.w - S.knob - 2 : 2,
          }}
        />
      </button>
    </div>
  );
}
