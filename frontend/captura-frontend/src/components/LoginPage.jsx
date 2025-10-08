// src/components/LoginPage.jsx
import { useState } from "react";
import orcaLogo from "../assets/orca.png";

export default function LoginPage({
  onLogin,
  // Opcionales (para depuración)
  base,
  onBaseChange,
  showBackendField = false, // 👈 oculto por defecto
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError("Ingresa correo y contraseña para continuar.");
      return;
    }

    setSubmitting(true);
    try {
      await onLogin?.({ email: trimmedEmail, password: trimmedPassword });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No fue posible iniciar sesión. Intenta nuevamente.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="relative rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_55%)] pointer-events-none" />
          <div className="relative p-8">
            <header className="mb-8 text-center space-y-3">
              <div className="flex items-center justify-center gap-3">
                <img
                  src={orcaLogo}
                  alt="Orca Tecnología"
                  className="h-24 w-24 object-contain select-none"
                  loading="eager"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <h1 className="text-3xl font-semibold text-white tracking-tight">
                  Estados Orca
                </h1>
              </div>
              <p className="text-sm text-white/60">
                Usa tu correo corporativo y contraseña para entrar al panel.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-200 px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Correo electrónico
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Contraseña
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition"
                  autoComplete="current-password"
                  required
                />
              </label>

              {/* Campo de backend oculto por defecto */}
              {showBackendField && (
                <label className="block space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/70">
                    URL del backend
                  </span>
                  <input
                    type="url"
                    value={base}
                    onChange={(e) => onBaseChange?.(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition"
                  />
                </label>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 hover:from-sky-400 hover:via-indigo-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                aria-live="polite"
              >
                {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
              </button>
            </form>

            <footer className="mt-8 text-center text-xs text-white/50 space-y-1">
              <p>¿Primera vez? Solicita a un administrador que cree tu cuenta.</p>
              {/* Quité la mención al backend para que no confunda */}
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
