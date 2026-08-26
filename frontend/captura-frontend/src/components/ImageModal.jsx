import { useEffect, useRef, useState } from "react";

export default function ImageModal({ open, src, onClose, title }) {
  const modalRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsFullscreen(false);
      return undefined;
    }

    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === modalRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [open]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
        return;
      }
      if (modalRef.current?.requestFullscreen) {
        await modalRef.current.requestFullscreen();
      } else {
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  }

  async function handleClose() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {}
    setIsFullscreen(false);
    onClose?.();
  }

  if (!open) return null;
  return (
    <div ref={modalRef} className="fixed inset-0 z-50 bg-black/0">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
      />
      {/* modal */}
      <div className={`absolute inset-0 flex items-center justify-center ${isFullscreen ? "p-0" : "p-4"}`}>
        <div
          className={[
            "shadow-xl w-full overflow-hidden",
            isFullscreen
              ? "h-screen max-w-none rounded-none bg-black"
              : "max-w-5xl rounded-2xl bg-white",
          ].join(" ")}
        >
          <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${isFullscreen ? "border-white/10 bg-black text-white" : "bg-white"}`}>
            <div className={`font-medium truncate ${isFullscreen ? "text-white" : "text-slate-800"}`}>
              {title || "Vista previa"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFullscreen}
                className={[
                  "px-3 py-1.5 rounded-lg text-sm font-medium",
                  isFullscreen
                    ? "bg-white/10 text-white hover:bg-white/20"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                {isFullscreen ? "Salir pantalla completa" : "Pantalla completa"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className={[
                  "px-3 py-1.5 rounded-lg text-sm font-medium text-white",
                  isFullscreen ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-900",
                ].join(" ")}
              >
                Cerrar
              </button>
            </div>
          </div>
          <div className={isFullscreen ? "grid h-[calc(100dvh-57px)] w-screen place-items-center bg-black" : "bg-slate-50"}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img
              src={src}
              className={isFullscreen ? "max-h-full max-w-full object-contain" : "w-full h-auto object-contain max-h-[80vh]"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
