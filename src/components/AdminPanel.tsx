import React, { useState, useEffect } from "react";
import { User, Plus, Trash2, Edit2, Calendar, Phone, RefreshCw, Check, Key } from "lucide-react";
import { ClientToken } from "../types";

interface AdminPanelProps {
  onClose: () => void;
  supportPhone: string;
  isAdmin?: boolean;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, isAdmin }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [clients, setClients] = useState<ClientToken[]>([]);
  const [globalSupport, setGlobalSupport] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMsg, setActionMsg] = useState<string>("");

  // Create/Edit client modal state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editPassword, setEditPassword] = useState<string>("");
  const [editToken, setEditToken] = useState<string>("");
  const [editExpDate, setEditExpDate] = useState<string>("");
  const [editSupport, setEditSupport] = useState<string>("");
  const [editSubscriptionType, setEditSubscriptionType] = useState<"demo" | "mensal" | "semestral">("demo");
  const [clientToDelete, setClientToDelete] = useState<ClientToken | null>(null);
  const [loginError, setLoginError] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

  useEffect(() => {
    if (isAdmin) {
      setIsAuthenticated(true);
    }
  }, [isAdmin]);

  // Fetch client roster
  const fetchRoster = () => {
    setLoading(true);
    fetch("/api/admin/clients")
      .then((res) => res.json())
      .then((data) => {
        const fetchedClients = data.clients || [];
        setClients(fetchedClients);
        setGlobalSupport(data.globalSupportPhone || "");
        setLoading(false);

        // Auto-healing sync logic: restore license tokens to server if it restarted
        try {
          const cachedStr = localStorage.getItem("cnc_master_clients_roster");
          if (cachedStr) {
            const cached: ClientToken[] = JSON.parse(cachedStr);
            // Find tokens that exist in local cache but are missing from fetched list
            const missingInFetched = cached.filter(
              (c1) => !fetchedClients.some((c2: any) => c2.token === c1.token)
            );

            if (missingInFetched.length > 0) {
              console.log("Restaurando licenças do cache local para o servidor:", missingInFetched);
              // Send each missing client back to the server to restore them
              Promise.all(
                missingInFetched.map((mc) =>
                  fetch("/api/admin/clients", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(mc),
                  })
                )
              ).then(() => {
                // Fetch final roster from server after auto-restoration
                fetch("/api/admin/clients")
                  .then((r) => r.json())
                  .then((d2) => {
                    const finalClients = d2.clients || [];
                    setClients(finalClients);
                    localStorage.setItem("cnc_master_clients_roster", JSON.stringify(finalClients));
                  });
              });
            } else {
              // Server is complete, keep local copy updated
              localStorage.setItem("cnc_master_clients_roster", JSON.stringify(fetchedClients));
            }
          } else {
            // Store initial roster copy
            localStorage.setItem("cnc_master_clients_roster", JSON.stringify(fetchedClients));
          }
        } catch (err) {
          console.error("Erro no auto-healing sync das licenças:", err);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRoster();
    }
  }, [isAuthenticated]);

  const handleResetSessions = () => {
    fetch("/api/admin/reset-sessions", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        setActionMsg("✅ Todas as sessões online foram limpas!");
      fetchRoster();
        setTimeout(() => setActionMsg(""), 3000);
      });
  };

  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editToken) {
      setFormError("Nome e Token são obrigatórios.");
      return;
    }
    setFormError("");

    const payload = {
      name: editName,
      email: editEmail || null,
      password: editPassword || null,
      token: editToken,
      expirationDate: editExpDate || null,
      supportPhone: editSupport || globalSupport,
      subscriptionType: editSubscriptionType,
    };

    // Update local cache first so it doesn't get treated as missing or outdated
    try {
      const cachedStr = localStorage.getItem("cnc_master_clients_roster");
      if (cachedStr) {
        const cached: ClientToken[] = JSON.parse(cachedStr);
        const index = cached.findIndex(c => c.token === editToken);
        const clientData: ClientToken = {
          name: editName,
          email: editEmail || undefined,
          password: editPassword || undefined,
          token: editToken,
          expirationDate: editExpDate || null,
          supportPhone: editSupport || globalSupport,
          subscriptionType: editSubscriptionType,
        };
        if (index !== -1) {
          cached[index] = clientData;
        } else {
          cached.push(clientData);
        }
        localStorage.setItem("cnc_master_clients_roster", JSON.stringify(cached));
      }
    } catch (err) {
      console.error("Erro ao sincronizar cache local antes de salvar:", err);
    }

    fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        setActionMsg(`✅ Licença "${editToken}" salva com sucesso!`);
        fetchRoster();
        setIsEditing(false);
        // Reset states
        setEditName("");
        setEditEmail("");
        setEditPassword("");
        setEditToken("");
        setEditExpDate("");
        setEditSupport("");
        setEditSubscriptionType("demo");
        setFormError("");
        setTimeout(() => setActionMsg(""), 3000);
      });
  };

  const handleDeleteClient = (token: string) => {
    // Find the client object to display in the custom confirmation dialog
    const target = clients.find(c => c.token === token);
    if (target) {
      setClientToDelete(target);
    }
  };

  const executeDeleteClient = (token: string) => {
    // Update local cache first so auto-heal doesn't restore it
    try {
      const cachedStr = localStorage.getItem("cnc_master_clients_roster");
      if (cachedStr) {
        const cached: ClientToken[] = JSON.parse(cachedStr);
        const filtered = cached.filter(c => c.token !== token);
        localStorage.setItem("cnc_master_clients_roster", JSON.stringify(filtered));
      }
    } catch (err) {
      console.error("Erro ao sincronizar cache local antes de excluir:", err);
    }

    fetch(`/api/admin/clients/${token}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        setActionMsg("✅ Token excluído com sucesso!");
        fetchRoster();
        setTimeout(() => setActionMsg(""), 3000);
      });
  };

  const startEdit = (c: ClientToken) => {
    setEditName(c.name);
    setEditEmail(c.email || "");
    setEditPassword(c.password || "");
    setEditToken(c.token);
    setEditExpDate(c.expirationDate || "");
    setEditSupport(c.supportPhone || globalSupport);
    setEditSubscriptionType(c.subscriptionType || "demo");
    setIsEditing(true);
  };


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === "1152") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("Senha de administrador incorreta!");
      setPasswordInput("");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#1e1e24] p-6 animate-in fade-in duration-200">
        <div className="w-full max-w-sm flex flex-col p-6">
          <div className="flex flex-col items-center justify-center text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-cyan-900/30 flex items-center justify-center mb-4">
              <Key className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-lg font-bold text-white font-display">Acesso Restrito</h2>
            <p className="text-xs text-zinc-400 mt-1">Insira a senha de administrador</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {loginError && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-center text-xs font-semibold text-red-400">
                ⚠️ {loginError}
              </div>
            )}
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full bg-[#121216] border border-zinc-700 rounded-lg px-4 py-3 text-white text-center tracking-widest text-lg font-mono focus:outline-none focus:border-cyan-400"
              placeholder="••••"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 rounded-lg transition"
              >
                Entrar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-[#1e1e24]">
        
        {/* Action Notifications */}
        {actionMsg && (
          <div className="bg-emerald-950/30 text-emerald-400 border-b border-emerald-500/20 px-6 py-2.5 text-center text-xs font-semibold">
            {actionMsg}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Main List Column */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            
            {/* Quick Actions Bar */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <button
                onClick={() => {
                  setEditName("");
                  setEditEmail("");
                  setEditPassword("");
                  setEditToken(`CNC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
                  setEditExpDate("");
                  setEditSupport(globalSupport);
                  setEditSubscriptionType("demo");
                  setIsEditing(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-2 shadow shadow-emerald-950"
              >
                <Plus className="w-4 h-4" />
                Criar Nova Licença / Token
              </button>

              <button
                onClick={handleResetSessions}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold py-2.5 px-4 rounded-xl transition flex items-center gap-2 border border-zinc-700"
                title="Limpa registros de sessões em caso de logins travados"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resetar Sessões (Liberar travados)
              </button>
            </div>

            {/* List Table */}
            <div className="flex-1 border border-zinc-800 bg-[#0d0d11] rounded-xl overflow-auto relative">
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 font-mono text-xs animate-pulse">
                  Carregando banco de dados de clientes...
                </div>
              ) : clients.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600 font-mono text-xs">
                  Nenhuma licença cadastrada.
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono text-zinc-300">
                  <thead className="bg-[#1f1f26] border-b border-zinc-800 text-zinc-400 select-none">
                    <tr>
                      <th className="p-3">Nome / Cliente</th>
                      <th className="p-3">Plano</th>
                      <th className="p-3">Token Acesso</th>
                      <th className="p-3">Expiração</th>
                      <th className="p-3">Telefone Suporte</th>
                      <th className="p-3 text-center">Online</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-zinc-800 hover:bg-zinc-900/40 transition"
                      >
                        <td className="p-3 font-sans text-zinc-100">
                          <div className="font-semibold text-sm">{c.name}</div>
                          {c.email && (
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5 flex flex-wrap gap-x-2">
                              <span>✉️ {c.email}</span>
                              {c.password && <span className="text-zinc-500">({c.password})</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            c.subscriptionType === 'semestral' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25' :
                            c.subscriptionType === 'mensal' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' :
                            'bg-zinc-500/10 text-zinc-400 border-zinc-500/25'
                          }`}>
                            {c.subscriptionType === 'semestral' ? 'Semestral' :
                             c.subscriptionType === 'mensal' ? 'Mensal' : 'Demo'}
                          </span>
                        </td>
                        <td className="p-3 text-cyan-400 font-bold">{c.token}</td>
                        <td className="p-3">
                          {c.expirationDate ? (
                            <span className="flex items-center gap-1 text-zinc-300">
                              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                              {c.expirationDate.split("-").reverse().join("/")}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold">Vitalício</span>
                          )}
                        </td>
                        <td className="p-3 text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-zinc-600" />
                            {c.supportPhone}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {c.isOnline ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-ping" />
                              Sim ({c.activeSessionsCount})
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-[10px]">Não</span>
                          )}
                        </td>
                        <td className="p-3 text-center flex justify-center gap-2">
                          <button
                            onClick={() => startEdit(c)}
                            className="p-1.5 text-zinc-400 hover:text-[#39ff14] hover:bg-zinc-800 rounded transition"
                            title="Editar Licença"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClient(c.token)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition"
                            title="Excluir Licença"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Form Overlay on side if adding/editing */}
          {isEditing && (
            <div className="w-80 border-l border-zinc-800 bg-[#16161c] p-6 flex flex-col justify-between overflow-y-auto">
              <form onSubmit={handleSaveClient} className="flex flex-col gap-4">
                <h3 className="font-display font-bold text-sm text-zinc-100 pb-2 border-b border-zinc-800">
                  Dados da Licença
                </h3>

                {formError && (
                  <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-center text-[11px] font-semibold text-red-400">
                    ⚠️ {formError}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Nome do Cliente
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    E-mail (Login)
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Ex: joao@email.com"
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Senha (Login)
                  </label>
                  <input
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Ex: 123456"
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Tipo de Plano / Licença
                  </label>
                  <select
                    value={editSubscriptionType}
                    onChange={(e) => {
                      const type = e.target.value as "demo" | "mensal" | "semestral";
                      setEditSubscriptionType(type);
                      
                      const date = new Date();
                      if (type === "demo" || type === "mensal") {
                        date.setDate(date.getDate() + 30);
                        setEditExpDate(date.toISOString().split("T")[0]);
                      } else if (type === "semestral") {
                        date.setDate(date.getDate() + 180);
                        setEditExpDate(date.toISOString().split("T")[0]);
                      }
                    }}
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-sans"
                  >
                    <option value="demo">Demonstração (30 dias trial)</option>
                    <option value="mensal">Mensal (R$ 11,90)</option>
                    <option value="semestral">Semestral (R$ 49,90)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Token de Acesso (Único)
                  </label>
                  <input
                    type="text"
                    required
                    value={editToken}
                    onChange={(e) => setEditToken(e.target.value.toUpperCase())}
                    placeholder="Ex: CNC-TOKEN-XYZ"
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={editExpDate}
                    onChange={(e) => setEditExpDate(e.target.value)}
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400 font-mono"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    Preenchido automaticamente ao alterar o plano, ou deixe vazio para licença vitalícia (Lifetime).
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    Telefone Suporte Dedicado
                  </label>
                  <input
                    type="text"
                    value={editSupport}
                    onChange={(e) => setEditSupport(e.target.value)}
                    placeholder="Ex: (18) 98765-4321"
                    className="w-full bg-[#0d0d11] text-zinc-100 p-2.5 rounded-lg border border-zinc-800 text-xs outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition"
                  >
                    Salvar Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-semibold py-2 px-3 rounded-lg text-xs transition border border-zinc-700"
                  >
                    Cancelar
                  </button>
                </div>
              </form>

              <div className="text-[10px] text-zinc-600 font-mono text-center">
                Licenciamento Master CNC v2.0
              </div>
            </div>
          )}
        </div>

      {clientToDelete && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-[#1e1e24] w-full max-w-sm rounded-2xl border border-red-500/40 p-6 flex flex-col shadow-2xl shadow-red-950/20">
            <div className="flex flex-col items-center justify-center text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mb-4 border border-red-500/20">
                <Trash2 className="w-6 h-6 text-red-500 animate-bounce" />
              </div>
              <h2 className="text-lg font-bold text-white font-display">Confirmar Exclusão</h2>
              <p className="text-xs text-zinc-400 mt-2">
                Tem certeza que deseja excluir permanentemente a licença de <strong>{clientToDelete.name}</strong>?
              </p>
              <div className="bg-[#121216] border border-zinc-800 rounded-lg p-2.5 mt-3 w-full text-center">
                <span className="text-xs font-mono font-bold text-cyan-400">{clientToDelete.token}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 rounded-lg transition text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const token = clientToDelete.token;
                  setClientToDelete(null);
                  executeDeleteClient(token);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition text-xs shadow shadow-red-950"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
