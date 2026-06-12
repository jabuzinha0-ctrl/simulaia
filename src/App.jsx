import { useState, useEffect, useRef } from "react";

// ─── Palette ───────────────────────────────────────────────────────────────
const C = {
  navy: "#0B1F3A", navyMid: "#162B4D", navyLight: "#1E3560",
  gold: "#C9973A", goldLight: "#E8B94F",
  emerald: "#1A6B4A", emeraldLight: "#22A86E",
  red: "#C0392B", redLight: "#E74C3C",
  muted: "#8898AA", white: "#FFFFFF",
};

// ─── Storage ───────────────────────────────────────────────────────────────
const SK = "simulaia_v2";
function load() {
  try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : { users: [], currentUser: null }; }
  catch { return { users: [], currentUser: null }; }
}
function save(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }

// ─── Banca logos (text-based fallback + search hint) ──────────────────────
const BANCA_INFO = {
  "CESPE/CEBRASPE": { color: "#003366", abbr: "CEBRASPE" },
  "FCC": { color: "#1a1a2e", abbr: "FCC" },
  "FGV": { color: "#003087", abbr: "FGV" },
  "VUNESP": { color: "#8B0000", abbr: "VUNESP" },
  "QUADRIX": { color: "#00529B", abbr: "QUADRIX" },
  "IBFC": { color: "#1B4F72", abbr: "IBFC" },
  "AOCP": { color: "#2C3E50", abbr: "AOCP" },
  "IDECAN": { color: "#1A5276", abbr: "IDECAN" },
  "IADES": { color: "#154360", abbr: "IADES" },
  "CONSULPLAN": { color: "#1F618D", abbr: "CONSULPLAN" },
  "FEPESE": { color: "#117A65", abbr: "FEPESE" },
  "NC-UFPR": { color: "#6C3483", abbr: "NC-UFPR" },
  "Outra": { color: "#2C3E50", abbr: "BANCA" },
};

const BANCAS = Object.keys(BANCA_INFO);
const NIVEIS = ["Médio", "Médio-técnico", "Superior", "Especialista"];

// ─── Input style ───────────────────────────────────────────────────────────
const inp = { width: "100%", background: C.navyMid, color: C.white, border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "12px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" };
const btnG = { background: "transparent", color: C.muted, border: "none", cursor: "pointer", fontSize: 14, padding: "6px 0" };

// ─── Helpers ───────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}
function Toast({ msg, type }) {
  return <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: type === "err" ? C.red : C.emerald, color: "#fff", padding: "12px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>{msg}</div>;
}
function LoadingScreen({ msg = "Gerando simulado com IA" }) {
  const [dots, setDots] = useState(".");
  useEffect(() => { const t = setInterval(() => setDots(d => d.length < 3 ? d + "." : "."), 500); return () => clearInterval(t); }, []);
  return (
    <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ width: 64, height: 64, border: `4px solid ${C.navyMid}`, borderTop: `4px solid ${C.gold}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <p style={{ color: C.gold, fontSize: 18, fontWeight: 600 }}>{msg}{dots}</p>
      <p style={{ color: C.muted, fontSize: 14 }}>Isso pode levar alguns segundos</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(load);
  const [view, setView] = useState("login");
  const [activeSimulado, setActiveSimulado] = useState(null);
  const [examState, setExamState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Gerando simulado com IA");
  const [toast, setToast] = useState(null);

  useEffect(() => { save(data); }, [data]);
  useEffect(() => { if (data.currentUser) setView("home"); }, []);

  const user = data.users.find(u => u.id === data.currentUser);

  function showToast(msg, type = "ok") { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }

  function login(userId) { setData(p => ({ ...p, currentUser: userId })); setView("home"); }
  function logout() { setData(p => ({ ...p, currentUser: null })); setView("login"); }

  function saveResult(result) {
    setData(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === data.currentUser
        ? { ...u, simulados: [result, ...(u.simulados || [])] }
        : u)
    }));
  }

  async function generateExam(config) {
    setLoadingMsg("Gerando simulado com IA");
    setLoading(true);
    try {
      const hasRedacao = config.tipoDiscursiva === "redacao";
      const systemPrompt = `Você é um especialista em concursos públicos brasileiros. Gere um simulado REAL e completo.
RESPONDA APENAS com JSON válido, sem texto antes ou depois, sem markdown.
Formato:
{
  "titulo": "string",
  "objetivas": [{"numero":1,"disciplina":"string","enunciado":"string","alternativas":{"A":"","B":"","C":"","D":"","E":""},"gabarito":"A","explicacao":"string"}],
  "discursivas": [{"numero":1,"disciplina":"string","enunciado":"string","valorMaximo":10,"criterios":["c1"],"gabarito":"string"}],
  "redacao": {"tema":"string","tipo":"Dissertativa-argumentativa","criterios":["c1","c2"],"textoMotivador":"string","gabarito":"string","valorMaximo":10}
}
Se não tiver discursivas, envie array vazio. Se não tiver redação, envie null.`;

      const userPrompt = `Gere simulado para:
Banca: ${config.banca}
Cargo: ${config.cargo}
Edital/Matérias: ${config.edital}
Nível: ${config.nivel}
Questões objetivas: ${config.qtdObjetivas}
Questões discursivas (dissertativas): ${hasRedacao ? 0 : config.qtdDiscursivas}
Incluir redação: ${hasRedacao && config.qtdDiscursivas > 0 ? "SIM — gere um tema de redação no estilo da banca" : "NÃO"}
Disciplinas foco: ${config.disciplinas || "conforme edital"}
Referência: ${config.referencia || "não especificado"}

Crie questões ORIGINAIS no estilo exato da banca ${config.banca} para o cargo ${config.cargo} de nível ${config.nivel}.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
      });
      const d = await response.json();
      const text = d.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      setLoading(false);
      return parsed;
    } catch (e) {
      setLoading(false);
      showToast("Erro ao gerar simulado. Tente novamente.", "err");
      return null;
    }
  }

  async function gradeDiscursiva(questao, resposta) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "Você é examinador de concursos. Responda APENAS com JSON válido.",
          messages: [{ role: "user", content: `Avalie a resposta discursiva:
Questão: ${questao.enunciado}
Critérios: ${questao.criterios.join("; ")}
Gabarito modelo: ${questao.gabarito}
Valor máximo: ${questao.valorMaximo}
Resposta do candidato: ${resposta}
JSON: {"nota":0,"percentual":0,"feedback":"string","criteriosAtendidos":[],"criteriosFaltantes":[]}` }],
        }),
      });
      const d = await response.json();
      return JSON.parse(d.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim());
    } catch { return { nota: 0, percentual: 0, feedback: "Erro na correção.", criteriosAtendidos: [], criteriosFaltantes: [] }; }
  }

  async function gradeRedacao(redacao, resposta) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1200,
          system: "Você é um corretor de redação de concurso público experiente. Responda APENAS com JSON válido.",
          messages: [{ role: "user", content: `Corrija esta redação de concurso público:
Tema: ${redacao.tema}
Tipo: ${redacao.tipo}
Critérios de avaliação: ${redacao.criterios.join("; ")}
Valor máximo: ${redacao.valorMaximo} pontos
Redação do candidato: ${resposta}
JSON: {"nota":0,"percentual":0,"feedback":"feedback detalhado por critério","pontoFortes":["p1"],"pontosAMelhorar":["p1"],"criteriosAtendidos":[],"criteriosFaltantes":[]}` }],
        }),
      });
      const d = await response.json();
      return JSON.parse(d.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim());
    } catch { return { nota: 0, percentual: 0, feedback: "Erro na correção.", pontosFortes: [], pontosAMelhorar: [], criteriosAtendidos: [], criteriosFaltantes: [] }; }
  }

  async function finishExam() {
    setLoadingMsg("Corrigindo suas respostas");
    setLoading(true);
    const { simulado, respostas, respostasDiscursivas, respostaRedacao, startTime, config } = examState;
    const tempo = Math.round((Date.now() - startTime) / 60000);

    const objetivasResult = simulado.objetivas.map((q, i) => ({
      numero: q.numero, disciplina: q.disciplina, enunciado: q.enunciado, alternativas: q.alternativas,
      resposta: respostas[i] || null, gabarito: q.gabarito, acertou: respostas[i] === q.gabarito, explicacao: q.explicacao,
    }));

    const discursivasResult = [];
    for (let i = 0; i < (simulado.discursivas || []).length; i++) {
      const q = simulado.discursivas[i];
      const resp = respostasDiscursivas[i] || "";
      const grade = resp.length > 10 ? await gradeDiscursiva(q, resp) : { nota: 0, percentual: 0, feedback: "Resposta em branco.", criteriosAtendidos: [], criteriosFaltantes: q.criterios };
      discursivasResult.push({ ...q, resposta: resp, ...grade });
    }

    let redacaoResult = null;
    if (simulado.redacao) {
      const resp = respostaRedacao || "";
      const grade = resp.length > 30 ? await gradeRedacao(simulado.redacao, resp) : { nota: 0, percentual: 0, feedback: "Redação em branco.", pontosFortes: [], pontosAMelhorar: [], criteriosAtendidos: [], criteriosFaltantes: simulado.redacao.criterios };
      redacaoResult = { ...simulado.redacao, resposta: resp, ...grade };
    }

    const acertosObj = objetivasResult.filter(r => r.acertou).length;
    const totalObj = objetivasResult.length;
    const percObj = totalObj > 0 ? Math.round((acertosObj / totalObj) * 100) : 0;
    const byDisciplina = {};
    objetivasResult.forEach(r => {
      if (!byDisciplina[r.disciplina]) byDisciplina[r.disciplina] = { acertos: 0, total: 0 };
      byDisciplina[r.disciplina].total++;
      if (r.acertou) byDisciplina[r.disciplina].acertos++;
    });

    const result = {
      id: Date.now(), data: new Date().toLocaleDateString("pt-BR"),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      titulo: simulado.titulo, config, tempo,
      objetivas: objetivasResult, discursivas: discursivasResult, redacao: redacaoResult,
      stats: { acertosObj, totalObj, percObj, byDisciplina },
    };

    saveResult(result);
    setActiveSimulado(result);
    setLoading(false);
    setExamState(null);
    setView("results");
  }

  if (loading) return <LoadingScreen msg={loadingMsg} />;

  return (
    <div style={{ minHeight: "100vh", background: C.navy, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.white }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {view === "login" && <LoginScreen data={data} setData={setData} onLogin={login} />}
      {view === "home" && user && <HomeScreen user={user} onNew={() => setView("config")} onHistory={() => setView("history")} onDetail={s => { setActiveSimulado(s); setView("detail"); }} onLogout={logout} />}
      {view === "config" && <ConfigScreen onBack={() => setView("home")} onGenerate={async cfg => { const sim = await generateExam(cfg); if (sim) { setExamState({ simulado: sim, config: cfg, respostas: {}, respostasDiscursivas: {}, respostaRedacao: "", startTime: Date.now(), currentQ: 0, section: "objetivas" }); setView("exam"); } }} />}
      {view === "exam" && examState && <ExamScreen examState={examState} setExamState={setExamState} onFinish={finishExam} onBack={() => { setExamState(null); setView("home"); }} />}
      {view === "results" && activeSimulado && <ResultsScreen result={activeSimulado} onHome={() => setView("home")} onHistory={() => setView("history")} />}
      {view === "history" && user && <HistoryScreen simulados={user.simulados || []} onBack={() => setView("home")} onDetail={s => { setActiveSimulado(s); setView("detail"); }} />}
      {view === "detail" && activeSimulado && <DetailScreen result={activeSimulado} onBack={() => setView("history")} />}
    </div>
  );
}

// ─── Login / Cadastro ──────────────────────────────────────────────────────
function LoginScreen({ data, setData, onLogin }) {
  const [tab, setTab] = useState("login");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  function handleLogin() {
    const u = data.users.find(u => u.usuario === usuario.trim().toLowerCase() && u.senha === senha);
    if (!u) { setErro("Usuário ou senha incorretos."); return; }
    onLogin(u.id);
  }

  function handleCadastro() {
    if (!nome.trim() || !usuario.trim() || !senha.trim()) { setErro("Preencha todos os campos."); return; }
    if (senha.length < 4) { setErro("Senha deve ter pelo menos 4 caracteres."); return; }
    if (data.users.find(u => u.usuario === usuario.trim().toLowerCase())) { setErro("Esse usuário já existe."); return; }
    const newUser = { id: Date.now().toString(), nome: nome.trim(), usuario: usuario.trim().toLowerCase(), senha, simulados: [] };
    setData(p => ({ ...p, users: [...p.users, newUser] }));
    onLogin(newUser.id);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 12px" }}>📋</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>SimulaIA</h1>
          <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 14 }}>Simulados inteligentes para concursos</p>
        </div>

        <div style={{ background: C.navyMid, borderRadius: 16, padding: "24px 20px", border: `1px solid rgba(255,255,255,0.07)` }}>
          <div style={{ display: "flex", marginBottom: 20, background: C.navy, borderRadius: 10, padding: 4 }}>
            {[["login", "Entrar"], ["cadastro", "Criar conta"]].map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); setErro(""); }} style={{ flex: 1, background: tab === k ? C.gold : "transparent", color: tab === k ? C.navy : C.muted, border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{l}</button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tab === "cadastro" && (
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" style={inp} />
            )}
            <input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Nome de usuário" style={inp} autoCapitalize="none" />
            <input value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha" type="password" style={inp} />
            {erro && <p style={{ color: C.redLight, fontSize: 13, margin: 0, textAlign: "center" }}>{erro}</p>}
            <button
              onClick={tab === "login" ? handleLogin : handleCadastro}
              style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: C.navy, border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, fontSize: 16, cursor: "pointer", marginTop: 4 }}
            >
              {tab === "login" ? "Entrar" : "Criar conta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Home ──────────────────────────────────────────────────────────────────
function HomeScreen({ user, onNew, onHistory, onDetail, onLogout }) {
  const simulados = user.simulados || [];
  const last3 = simulados.slice(0, 3);
  const avgPerc = simulados.length > 0 ? Math.round(simulados.reduce((s, r) => s + r.stats.percObj, 0) / simulados.length) : 0;
  const best = simulados.length > 0 ? Math.max(...simulados.map(r => r.stats.percObj)) : 0;
  const perfColor = p => p >= 70 ? C.emeraldLight : p >= 50 ? C.goldLight : C.redLight;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>SimulaIA</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: "2px 0 0" }}>Olá, {user.nome.split(" ")[0]}! 👋</p>
        </div>
        <button onClick={onLogout} style={{ ...btnG, fontSize: 13, color: C.muted }}>Sair</button>
      </div>

      {simulados.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[{ label: "Simulados", value: simulados.length, icon: "📝" }, { label: "Média", value: `${avgPerc}%`, icon: "📊", color: perfColor(avgPerc) }, { label: "Melhor", value: `${best}%`, icon: "🏆", color: C.goldLight }].map(s => (
            <div key={s.label} style={{ background: C.navyMid, borderRadius: 12, padding: "14px 10px", textAlign: "center", border: `1px solid rgba(255,255,255,0.06)` }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <button onClick={onNew} style={{ width: "100%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: C.navy, border: "none", borderRadius: 14, padding: "18px", fontSize: 17, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
        ✨ Gerar Novo Simulado com IA
      </button>
      {simulados.length > 0 && (
        <button onClick={onHistory} style={{ width: "100%", background: "transparent", color: C.gold, border: `2px solid ${C.gold}`, borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}>
          📈 Histórico ({simulados.length})
        </button>
      )}

      {last3.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Recentes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {last3.map(s => {
              const p = s.stats.percObj;
              return (
                <div key={s.id} onClick={() => onDetail(s)} style={{ background: C.navyMid, borderRadius: 12, padding: "14px 16px", cursor: "pointer", border: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.titulo}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{s.data} · {s.tempo}min · {s.config.banca}</div>
                  </div>
                  <div style={{ textAlign: "right", marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: perfColor(p) }}>{p}%</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{s.stats.acertosObj}/{s.stats.totalObj}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {simulados.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <p>Nenhum simulado ainda. Crie o seu primeiro!</p>
        </div>
      )}
    </div>
  );
}

// ─── Config ────────────────────────────────────────────────────────────────
function ConfigScreen({ onBack, onGenerate }) {
  const [cfg, setCfg] = useState({ banca: "CESPE/CEBRASPE", cargo: "", edital: "", nivel: "Superior", qtdObjetivas: 10, qtdDiscursivas: 0, tipoDiscursiva: "redacao", disciplinas: "", referencia: "" });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const fileRef = useRef();
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));
  const valid = cfg.cargo.trim().length > 3 && cfg.edital.trim().length > 10;

  async function handlePDF(e) {
  const file = e.target.files[0];
  if (!file) return;

  setPdfLoading(true);
  setPdfName(file.name);

  try {
    const text = await file.text();

    const extrair = (inicio, fim) => {
      const regex = new RegExp(`${inicio}[:\\s]+(.+?)(?=${fim}|$)`, "i");
      const match = text.match(regex);
      return match ? match[1].trim() : "";
    };

    const banca = 
      text.match(/banca(?: organizadora)?[:\s]+([^\n]+)/i)?.[1]?.trim() || "";

    const cargo =
      text.match(/cargo[:\s]+([^\n]+)/i)?.[1]?.trim() || "";

    const disciplinas = [
      "Português",
      "Raciocínio Lógico",
      "Informática",
      "Direito Constitucional",
      "Direito Administrativo",
      "Conhecimentos Específicos"
    ].filter(d => text.toLowerCase().includes(d.toLowerCase()));

    setCfg(prev => ({
      ...prev,
      banca: BANCAS.includes(banca) ? banca : prev.banca,
      cargo: cargo || prev.cargo,
      edital: disciplinas.length
        ? disciplinas.join(", ")
        : text.substring(0, 1000),
    }));

  } catch (error) {
    console.error(error);
    alert("Não foi possível ler o edital.");
  }

  setPdfLoading(false);
}
    const file = e.target.files[0];
    if (!file) return;
    setPdfLoading(true); setPdfName(file.name);
    try {
      const base64Data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = () => rej(); r.readAsDataURL(file); });
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: "Analise o edital. Responda APENAS com JSON válido.", messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }, { type: "text", text: `Extraia do edital: banca, cargo principal, nível, disciplinas, qtdObjetivas, qtdDiscursivas, se tem redação (temRedacao: bool), referencia. JSON: {"banca":"","cargo":"","nivel":"Superior","edital":"disciplinas separadas por vírgula","qtdObjetivas":10,"qtdDiscursivas":0,"temRedacao":false,"referencia":""}` }] }] }),
      });
      const d = await response.json();
      const parsed = JSON.parse(d.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim());
      setCfg(prev => ({ ...prev, ...parsed, tipoDiscursiva: parsed.temRedacao ? "redacao" : "discursiva" }));
    } catch { alert("Erro ao ler PDF. Preencha manualmente."); }
    setPdfLoading(false);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={btnG}>← Voltar</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Novo Simulado</h1>
      </div>

      <div style={{ background: `linear-gradient(135deg, rgba(201,151,58,0.12), rgba(201,151,58,0.04))`, border: `2px dashed ${C.gold}`, borderRadius: 14, padding: "20px 16px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
        <p style={{ color: C.white, fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>Envie o PDF do edital</p>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 12px" }}>A IA lê e preenche tudo automaticamente</p>
        <input ref={fileRef} type="file" accept=".pdf" onChange={handlePDF} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} disabled={pdfLoading} style={{ background: pdfLoading ? "#2a3a50" : `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: pdfLoading ? C.muted : C.navy, border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: pdfLoading ? "not-allowed" : "pointer" }}>
          {pdfLoading ? "⏳ Lendo edital..." : "📎 Selecionar PDF"}
        </button>
        {pdfName && !pdfLoading && <p style={{ color: C.emeraldLight, fontSize: 13, margin: "8px 0 0", fontWeight: 600 }}>✅ {pdfName} — campos preenchidos!</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ color: C.muted, fontSize: 12 }}>ou preencha manualmente</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Banca organizadora"><select value={cfg.banca} onChange={e => set("banca", e.target.value)} style={inp}>{BANCAS.map(b => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Cargo / Área *"><input value={cfg.cargo} onChange={e => set("cargo", e.target.value)} placeholder="Ex: Analista Judiciário – Administrativa" style={inp} /></Field>
        <Field label="Conteúdo do edital / Matérias *" hint="Cole as disciplinas cobradas na prova"><textarea value={cfg.edital} onChange={e => set("edital", e.target.value)} placeholder="Ex: Português, Raciocínio Lógico, Direito Constitucional..." rows={4} style={{ ...inp, resize: "vertical" }} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nível"><select value={cfg.nivel} onChange={e => set("nivel", e.target.value)} style={inp}>{NIVEIS.map(n => <option key={n}>{n}</option>)}</select></Field>
          <Field label="Questões objetivas"><select value={cfg.qtdObjetivas} onChange={e => set("qtdObjetivas", Number(e.target.value))} style={inp}>{[5,10,15,20].map(n => <option key={n} value={n}>{n} questões</option>)}</select></Field>
        </div>
        <Field label="Prova escrita">
          <select value={cfg.qtdDiscursivas === 0 ? "0" : cfg.tipoDiscursiva} onChange={e => { if (e.target.value === "0") { set("qtdDiscursivas", 0); } else { set("tipoDiscursiva", e.target.value); if (cfg.qtdDiscursivas === 0) set("qtdDiscursivas", 1); } }} style={inp}>
            <option value="0">Nenhuma</option>
            <option value="redacao">Redação</option>
            <option value="discursiva">Questão discursiva</option>
          </select>
        </Field>
        {cfg.qtdDiscursivas > 0 && cfg.tipoDiscursiva === "discursiva" && (
          <Field label="Quantidade de discursivas"><select value={cfg.qtdDiscursivas} onChange={e => set("qtdDiscursivas", Number(e.target.value))} style={inp}>{[1,2,3].map(n => <option key={n} value={n}>{n} questão{n>1?"s":""}</option>)}</select></Field>
        )}
        <Field label="Disciplinas prioritárias (opcional)"><input value={cfg.disciplinas} onChange={e => set("disciplinas", e.target.value)} placeholder="Ex: Direito Constitucional, Português" style={inp} /></Field>
        <Field label="Concurso de referência (opcional)"><input value={cfg.referencia} onChange={e => set("referencia", e.target.value)} placeholder="Ex: TRF 2025, INSS 2024" style={inp} /></Field>
      </div>

      <button onClick={() => onGenerate(cfg)} disabled={!valid} style={{ width: "100%", background: valid ? `linear-gradient(135deg, ${C.gold}, ${C.goldLight})` : "#1e3050", color: valid ? C.navy : C.muted, border: "none", borderRadius: 14, padding: "18px", fontSize: 17, fontWeight: 800, cursor: valid ? "pointer" : "not-allowed", marginTop: 24 }}>
        ✨ Gerar Simulado com IA
      </button>
      {!valid && <p style={{ textAlign: "center", color: C.muted, fontSize: 13, marginTop: 8 }}>Preencha o cargo e o conteúdo do edital</p>}
    </div>
  );
}

// ─── Exam ──────────────────────────────────────────────────────────────────
function ExamScreen({ examState, setExamState, onFinish, onBack }) {
  const { simulado, respostas, respostasDiscursivas, respostaRedacao, currentQ, section } = examState;
  const banca = examState.config.banca;
  const bancaInfo = BANCA_INFO[banca] || BANCA_INFO["Outra"];

  // Timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const t = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(t); }, []);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  const sections = ["objetivas", ...(simulado.discursivas?.length > 0 ? ["discursivas"] : []), ...(simulado.redacao ? ["redacao"] : [])];
  const questions = section === "objetivas" ? simulado.objetivas : section === "discursivas" ? simulado.discursivas : [simulado.redacao];
  const isLastSection = section === sections[sections.length - 1];
  const isLastQ = currentQ === questions.length - 1;

  const totalQ = simulado.objetivas.length + (simulado.discursivas?.length || 0) + (simulado.redacao ? 1 : 0);
  const answered = Object.keys(respostas).length + Object.keys(respostasDiscursivas).filter(k => respostasDiscursivas[k]?.trim().length > 0).length + (respostaRedacao?.trim().length > 30 ? 1 : 0);
  const progress = Math.round((answered / totalQ) * 100);

  function next() {
    if (!isLastQ) setExamState(p => ({ ...p, currentQ: p.currentQ + 1 }));
    else if (!isLastSection) {
      const nextSection = sections[sections.indexOf(section) + 1];
      setExamState(p => ({ ...p, section: nextSection, currentQ: 0 }));
    } else if (window.confirm("Finalizar o simulado e ver o resultado?")) onFinish();
  }
  function prev() {
    if (currentQ > 0) setExamState(p => ({ ...p, currentQ: p.currentQ - 1 }));
    else if (section !== "objetivas") {
      const prevSection = sections[sections.indexOf(section) - 1];
      const prevQ = prevSection === "objetivas" ? simulado.objetivas.length - 1 : simulado.discursivas.length - 1;
      setExamState(p => ({ ...p, section: prevSection, currentQ: prevQ }));
    }
  }

  const q = questions[currentQ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 80px" }}>
      {/* Banca header — like a real exam */}
      <div style={{ background: bancaInfo.color, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{bancaInfo.abbr}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{examState.config.cargo}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: elapsed > 7200 ? C.redLight : "#fff", fontFamily: "monospace" }}>{mins}:{secs}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>tempo de prova</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.1)" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: C.gold, transition: "width 0.3s" }} />
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Section indicator */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {sections.map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: s === section ? C.gold : sections.indexOf(s) < sections.indexOf(section) ? C.emeraldLight : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: C.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {section === "objetivas" ? `Questão ${currentQ + 1} de ${simulado.objetivas.length}` : section === "discursivas" ? `Discursiva ${currentQ + 1}` : "Redação"}
          </span>
          <span style={{ fontSize: 13, color: C.muted }}>{answered}/{totalQ} respondidas</span>
        </div>

        {/* Question card */}
        <div style={{ background: C.navyMid, borderRadius: 14, padding: "18px 16px", marginBottom: 14, border: `1px solid rgba(255,255,255,0.07)` }}>
          {section === "redacao" && simulado.redacao?.textoMotivador && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, borderLeft: `3px solid ${C.gold}` }}>
              <p style={{ fontSize: 12, color: C.gold, fontWeight: 700, margin: "0 0 6px" }}>TEXTO MOTIVADOR</p>
              <p style={{ fontSize: 13, color: "#BCC8D8", margin: 0, lineHeight: 1.7 }}>{simulado.redacao.textoMotivador}</p>
            </div>
          )}
          {q.disciplina && <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 8 }}>{q.disciplina}</div>}
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.white, margin: 0, fontFamily: "Georgia, serif" }}>{q.enunciado || q.tema}</p>
          {section === "redacao" && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: C.gold, fontWeight: 700, margin: "0 0 4px" }}>TIPO: {q.tipo}</p>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Critérios: {q.criterios?.join(" · ")}</p>
            </div>
          )}
        </div>

        {/* Answer area */}
        {section === "objetivas" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(q.alternativas).map(([letra, texto]) => {
              const sel = respostas[currentQ] === letra;
              return (
                <div key={letra} onClick={() => setExamState(p => ({ ...p, respostas: { ...p.respostas, [currentQ]: letra } }))}
                  style={{ background: sel ? `rgba(201,151,58,0.15)` : C.navyMid, border: `2px solid ${sel ? C.gold : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "13px 15px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: sel ? C.gold : "rgba(255,255,255,0.07)", color: sel ? C.navy : C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{letra}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.6, color: sel ? C.white : "#BCC8D8", fontFamily: "Georgia, serif" }}>{texto}</span>
                </div>
              );
            })}
          </div>
        ) : section === "discursivas" ? (
          <div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>Critérios: </span>
              <span style={{ fontSize: 12, color: C.muted }}>{q.criterios?.join(" · ")}</span>
            </div>
            <textarea value={respostasDiscursivas[currentQ] || ""} onChange={e => setExamState(p => ({ ...p, respostasDiscursivas: { ...p.respostasDiscursivas, [currentQ]: e.target.value } }))} placeholder="Digite sua resposta aqui..." rows={8} style={{ ...inp, lineHeight: 1.7, boxSizing: "border-box" }} />
            <p style={{ fontSize: 12, color: C.muted, textAlign: "right", margin: "4px 0 0" }}>{(respostasDiscursivas[currentQ] || "").length} caracteres</p>
          </div>
        ) : (
          <div>
            <textarea value={respostaRedacao || ""} onChange={e => setExamState(p => ({ ...p, respostaRedacao: e.target.value }))} placeholder="Escreva sua redação aqui..." rows={14} style={{ ...inp, lineHeight: 1.8, fontFamily: "Georgia, serif", boxSizing: "border-box" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Mínimo recomendado: 25 linhas</span>
              <span style={{ fontSize: 12, color: C.muted }}>{(respostaRedacao || "").split(/\s+/).filter(Boolean).length} palavras</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onBack} style={{ background: "transparent", color: C.muted, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 12, padding: "12px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>✕ Sair</button>
          <button onClick={prev} style={{ flex: 1, background: C.navyMid, color: C.white, border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, cursor: "pointer" }}>← Anterior</button>
          <button onClick={next} style={{ flex: 2, background: isLastQ && isLastSection ? `linear-gradient(135deg, ${C.emerald}, ${C.emeraldLight})` : `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: isLastQ && isLastSection ? C.white : C.navy, border: "none", borderRadius: 12, padding: "14px", fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
            {isLastQ && isLastSection ? "✅ Finalizar" : isLastQ ? "Próxima seção →" : "Próxima →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Results ───────────────────────────────────────────────────────────────
function ResultsScreen({ result, onHome, onHistory }) {
  const [tab, setTab] = useState("resumo");
  const { stats } = result;
  const perfColor = p => p >= 70 ? C.emeraldLight : p >= 50 ? C.goldLight : C.redLight;
  const bancaInfo = BANCA_INFO[result.config?.banca] || BANCA_INFO["Outra"];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 40px" }}>
      <div style={{ background: bancaInfo.color, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{bancaInfo.abbr}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Resultado do Simulado</div>
      </div>

      <div style={{ padding: "0 16px" }}>
        <div style={{ background: C.navyMid, borderRadius: 16, padding: "20px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 56, fontWeight: 900, color: perfColor(stats.percObj), lineHeight: 1 }}>{stats.percObj}%</div>
          <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{stats.acertosObj} de {stats.totalObj} objetivas</div>
          {result.redacao && <div style={{ fontSize: 14, color: C.goldLight, marginTop: 6 }}>Redação: {result.redacao.nota?.toFixed(1)}/{result.redacao.valorMaximo} pts</div>}
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 14 }}>
            {[{ v: `${result.tempo} min`, l: "Duração" }, { v: result.data, l: "Data" }, { v: result.config?.banca, l: "Banca" }].map(i => (
              <div key={i.l}><div style={{ fontSize: 14, fontWeight: 700 }}>{i.v}</div><div style={{ fontSize: 11, color: C.muted }}>{i.l}</div></div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[["resumo", "📊 Resumo"], ["objetivas", "✅ Objetivas"], ...(result.discursivas?.length > 0 ? [["discursivas", "📝 Discursivas"]] : []), ...(result.redacao ? [["redacao", "✍️ Redação"]] : [])].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, minWidth: 80, background: tab === k ? C.gold : C.navyMid, color: tab === k ? C.navy : C.muted, border: "none", borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{l}</button>
          ))}
        </div>

        {tab === "resumo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(stats.byDisciplina).sort((a, b) => (b[1].acertos / b[1].total) - (a[1].acertos / a[1].total)).map(([disc, d]) => {
              const p = Math.round((d.acertos / d.total) * 100);
              return (
                <div key={disc} style={{ background: C.navyMid, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{disc}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: perfColor(p) }}>{p}% ({d.acertos}/{d.total})</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${p}%`, background: perfColor(p), borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "objetivas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {result.objetivas.map((q, i) => (
              <div key={i} style={{ background: C.navyMid, borderRadius: 12, padding: "14px 16px", border: `2px solid ${q.acertou ? "rgba(26,107,74,0.4)" : "rgba(192,57,43,0.35)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Q{q.numero} · {q.disciplina}</span>
                  <span style={{ fontSize: 16 }}>{q.acertou ? "✅" : "❌"}</span>
                </div>
                <p style={{ fontSize: 13, color: C.white, margin: "0 0 10px", lineHeight: 1.6, fontFamily: "Georgia, serif" }}>{q.enunciado}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, background: "rgba(26,107,74,0.25)", color: C.emeraldLight, padding: "4px 10px", borderRadius: 6 }}>Gabarito: {q.gabarito}</span>
                  {!q.acertou && <span style={{ fontSize: 13, background: "rgba(192,57,43,0.25)", color: C.redLight, padding: "4px 10px", borderRadius: 6 }}>Sua resp: {q.resposta || "—"}</span>}
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>{q.explicacao}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "discursivas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {result.discursivas.map((q, i) => (
              <div key={i} style={{ background: C.navyMid, borderRadius: 12, padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Discursiva {q.numero} · {q.disciplina}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: perfColor(q.percentual || 0) }}>{q.nota?.toFixed(1)}/{q.valorMaximo}</span>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.6 }}>{q.enunciado}</p>
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: C.muted, margin: "0 0 4px", fontWeight: 700 }}>Sua resposta:</p>
                  <p style={{ fontSize: 13, color: "#BCC8D8", margin: 0, lineHeight: 1.6 }}>{q.resposta || "(em branco)"}</p>
                </div>
                <p style={{ fontSize: 13, color: C.goldLight, margin: "0 0 6px" }}>💬 {q.feedback}</p>
                {q.criteriosAtendidos?.length > 0 && <p style={{ fontSize: 12, color: C.emeraldLight, margin: "0 0 4px" }}>✅ {q.criteriosAtendidos.join(", ")}</p>}
                {q.criteriosFaltantes?.length > 0 && <p style={{ fontSize: 12, color: C.redLight, margin: 0 }}>❌ {q.criteriosFaltantes.join(", ")}</p>}
              </div>
            ))}
          </div>
        )}

        {tab === "redacao" && result.redacao && (
          <div style={{ background: C.navyMid, borderRadius: 12, padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Tema: {result.redacao.tema}</p>
                <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{result.redacao.tipo}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: perfColor(result.redacao.percentual || 0) }}>{result.redacao.nota?.toFixed(1)}</div>
                <div style={{ fontSize: 11, color: C.muted }}>/{result.redacao.valorMaximo} pts</div>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "12px", marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px", fontWeight: 700 }}>Sua redação:</p>
              <p style={{ fontSize: 13, color: "#BCC8D8", margin: 0, lineHeight: 1.8, fontFamily: "Georgia, serif", whiteSpace: "pre-wrap" }}>{result.redacao.resposta || "(em branco)"}</p>
            </div>
            <p style={{ fontSize: 14, color: C.goldLight, margin: "0 0 10px", lineHeight: 1.6 }}>💬 {result.redacao.feedback}</p>
            {result.redacao.pontosFortes?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 12, color: C.emeraldLight, fontWeight: 700, margin: "0 0 4px" }}>✅ Pontos fortes:</p>
                {result.redacao.pontosFortes.map((p, i) => <p key={i} style={{ fontSize: 12, color: "#BCC8D8", margin: "2px 0" }}>• {p}</p>)}
              </div>
            )}
            {result.redacao.pontosAMelhorar?.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: C.redLight, fontWeight: 700, margin: "0 0 4px" }}>❌ A melhorar:</p>
                {result.redacao.pontosAMelhorar.map((p, i) => <p key={i} style={{ fontSize: 12, color: "#BCC8D8", margin: "2px 0" }}>• {p}</p>)}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onHome} style={{ flex: 1, background: C.navyMid, color: C.white, border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, cursor: "pointer" }}>🏠 Início</button>
          <button onClick={onHistory} style={{ flex: 1, background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: C.navy, border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, cursor: "pointer" }}>📈 Histórico</button>
        </div>
      </div>
    </div>
  );
}

// ─── History ───────────────────────────────────────────────────────────────
function HistoryScreen({ simulados, onBack, onDetail }) {
  const sorted = [...simulados].sort((a, b) => b.id - a.id);
  const perfs = simulados.map(s => s.stats.percObj);
  const perfColor = p => p >= 70 ? C.emeraldLight : p >= 50 ? C.goldLight : C.redLight;
  const trend = perfs.length >= 2 ? perfs[0] - perfs[1] : 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={btnG}>← Voltar</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Histórico</h1>
      </div>

      {simulados.length > 1 && (
        <div style={{ background: C.navyMid, borderRadius: 14, padding: "16px", marginBottom: 20, display: "flex", justifyContent: "space-around" }}>
          {[{ v: simulados.length, l: "Simulados", c: C.gold }, { v: `${Math.round(perfs.reduce((a, b) => a + b, 0) / perfs.length)}%`, l: "Média", c: C.white }, { v: `${trend >= 0 ? "+" : ""}${trend}%`, l: "Tendência", c: trend >= 0 ? C.emeraldLight : C.redLight }, { v: `${Math.max(...perfs)}%`, l: "Melhor", c: C.emeraldLight }].map(i => (
            <div key={i.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: i.c }}>{i.v}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{i.l}</div>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: C.muted }}><p>Nenhum simulado ainda.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((s, idx) => {
            const p = s.stats.percObj;
            return (
              <div key={s.id} onClick={() => onDetail(s)} style={{ background: C.navyMid, borderRadius: 12, padding: "14px 16px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: idx === 0 ? `linear-gradient(135deg, ${C.gold}, ${C.goldLight})` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: idx === 0 ? C.navy : C.muted, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.titulo}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{s.data} · {s.tempo}min · {s.config?.banca}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: perfColor(p) }}>{p}%</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.stats.acertosObj}/{s.stats.totalObj}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────
function DetailScreen({ result, onBack }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={btnG}>← Voltar</button>
      </div>
      <ResultsScreen result={result} onHome={onBack} onHistory={onBack} />
    </div>
  );
}
