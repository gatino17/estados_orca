// src/components/UsersPage.jsx
import { useMemo, useState } from "react";

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "cliente", label: "Cliente" },
  { value: "soporte", label: "Soporte" },
];

const ROLE_BADGE_LIGHT = {
  admin: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  cliente: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
  soporte: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
};

const EMPTY_DRAFT = {
  id: null,
  name: "",
  email: "",
  role: "cliente",
  password: "",
};

export default function UsersPage({
  embedded = false,
  currentUser,
  users = [],
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onEnterDashboard,
}) {
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [users]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState("create"); // create | edit
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [listError, setListError] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const openCreate = () => {
    setMode("create");
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setMode("edit");
    setDraft({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      role: user.role || "cliente",
      password: "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraft(EMPTY_DRAFT);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const name = draft.name.trim();
    const email = draft.email.trim();
    const role = draft.role.trim() || "cliente";
    const password = draft.password.trim();

    if (!name) {
      setFormError("El nombre es obligatorio.");
      return;
    }

    if (!email) {
      setFormError("El correo es obligatorio.");
      return;
    }

    try {
      if (mode === "create") {
        if (!password) {
          setFormError("Define una contrasena para la nueva cuenta.");
          return;
        }
        await onCreateUser?.({ name, email, role, password });
      } else {
        const updates = { name, email, role };
        if (password) {
          updates.password = password;
        }
        await onUpdateUser?.(draft.id, updates);
      }
      setListError("");
      closeModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar el usuario.");
    }
  };

  const handleDelete = async (userId) => {
    try {
      await onDeleteUser?.(userId);
      setListError("");
      setConfirmId(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
      setConfirmId(null);
    }
  };

  const renderEmbedded = () => (
    <section className="space-y-4">
      <div className="rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usuarios</h2>
            <p className="text-sm text-slate-600">
              {sortedUsers.length} cuenta{sortedUsers.length === 1 ? "" : "s"} activas.
            </p>
            {listError && (
              <p className="mt-2 text-sm text-rose-600 bg-rose-50/80 border border-rose-300 rounded-lg px-3 py-2">
                {listError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              Nuevo usuario
            </button>
            {onEnterDashboard && (
              <button
                onClick={onEnterDashboard}
                className="inline-flex items-center gap-2 rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300"
              >
                Volver al panel
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow ring-1 ring-black/5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedUsers.map((user) => (
                <tr key={user.id} className="odd:bg-white even:bg-slate-50/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{user.name}</div>
                    <div className="text-xs text-slate-500 mt-1">ID: {user.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium",
                        ROLE_BADGE_LIGHT[user.role] || ROLE_BADGE_LIGHT.cliente,
                      ].join(" ")}
                    >
                      {ROLE_OPTIONS.find((r) => r.value === user.role)?.label || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end items-center gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmId(user.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      >
                        Eliminar
                      </button>
                    </div>
                    {confirmId === user.id && (
                      <div className="mt-3 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-800">
                        <p className="mb-2">
                          Eliminar la cuenta de <strong>{user.name}</strong>? Esta accion es permanente.
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-3 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-3 py-1 rounded bg-rose-600 text-white hover:bg-rose-500 transition"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No hay usuarios registrados todavia. Crea uno nuevo para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white ring-1 ring-black/10 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  {mode === "create" ? "Nuevo usuario" : "Editar usuario"}
                </p>
                <h3 className="text-lg font-semibold text-slate-900 mt-1">
                  {mode === "create" ? "Crear cuenta" : "Actualizar datos"}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-700 rounded-full p-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Cerrar"
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
              {formError && (
                <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 text-rose-700 px-4 py-3 text-sm">
                  {formError}
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                  Nombre completo
                </span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej. Maria Gonzalez"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                  Correo electronico
                </span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                  Rol asignado
                </span>
                <select
                  value={draft.role}
                  onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                  {mode === "create" ? "Contrasena" : "Nueva contrasena (opcional)"}
                </span>
                <input
                  type="password"
                  value={draft.password}
                  onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder={mode === "create" ? "Define una contrasena" : "Deja vacio para no cambiar"}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {mode === "create" ? "Crear usuario" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );

  if (embedded) {
    return renderEmbedded();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-4xl w-full">{renderEmbedded()}</div>
    </div>
  );
}
