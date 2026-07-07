with open("src/components/AdminPanel.tsx", "r") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if "useEffect(() => {" in line:
        new_lines.append(line)
        new_lines.append("    if (isAuthenticated) {\n")
    elif "fetchRoster();" in line and i < 50:
        new_lines.append("      fetchRoster();\n")
    elif "}, []);" in line and i < 50:
        new_lines.append("    }\n")
        new_lines.append("  }, [isAuthenticated]);\n")
    elif "return (" in line and "bg-black/85" in lines[i+1]:
        auth_block = """
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === "1152") {
      setIsAuthenticated(true);
    } else {
      alert("Senha incorreta!");
      setPasswordInput("");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-[#1e1e24] w-full max-w-sm rounded-2xl border border-zinc-700 overflow-hidden flex flex-col shadow-2xl p-6">
          <div className="flex flex-col items-center justify-center text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-cyan-900/30 flex items-center justify-center mb-4">
              <Key className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-lg font-bold text-white font-display">Acesso Restrito</h2>
            <p className="text-xs text-zinc-400 mt-1">Insira a senha de administrador</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
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

"""
        new_lines.append(auth_block)
        new_lines.append(line)
    else:
        new_lines.append(line)

with open("src/components/AdminPanel.tsx", "w") as f:
    f.writelines(new_lines)
