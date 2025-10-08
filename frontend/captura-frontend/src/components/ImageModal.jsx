export default function ImageModal({ open, src, onClose, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="font-medium text-slate-800 truncate">{title || "Vista previa"}</div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-900"
            >
              Cerrar
            </button>
          </div>
          <div className="bg-slate-50">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={src} className="w-full h-auto object-contain max-h-[80vh]" />
          </div>
        </div>
      </div>
    </div>
  );
}
