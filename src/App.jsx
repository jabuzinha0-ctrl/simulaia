import { useState, useEffect, useRef } from "react";

// ─── Palette & constants ───────────────────────────────────────────────────
const COLORS = {
  navy: "#0B1F3A",
  navyMid: "#162B4D",
  gold: "#C9973A",
  goldLight: "#E8B94F",
  emerald: "#1A6B4A",
  emeraldLight: "#22A86E",
  red: "#C0392B",
  redLight: "#E74C3C",
  slate: "#E8EDF4",
  muted: "#8898AA",
  white: "#FFFFFF",
};

// ─── Storage helpers ───────────────────────────────────────────────────────
const STORAGE_KEY = "simulado_concursos_v1";
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { simulados: [], config: {} };
  } catch { return { simulados: [], config: {} }; }
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home"); // home | config | exam | results | history | detail
  const [appData, setAppData] = useState(loadData);
  const [activeSimulado, setActiveSimulado] = useState(null);
  const [examState, setExamState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { saveData(appData); }, [appData]);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Generate exam via Claude API ──
  async function generateExam(config) {
    setLoading(true);
    try {
      const systemPrompt = `Você é um especialista em concursos públicos brasileiros. Gere um simulado REAL e completo conforme solicitado.
SEMPRE responda APENAS com JSON válido, sem texto antes ou depois, sem markdown.
Formato exato:
{
  "titulo": "string",
  "objetivas": [
    {
      "numero": 1,
      "disciplina": "string",
      "enunciado": "string com o texto completo da questão",
      "alternativas": { "A": "texto", "B": "texto", "C": "texto", "D": "texto", "E": "texto" },
      "gabarito": "A",
      "explicacao": "explicação detalhada do gabarito"
    }
  ],
  "discursivas": [
    {
      "numero": 1,
      "disciplina": "string",
      "enunciado": "string com o texto completo da questão discursiva",
      "valorMaximo": 10,
      "criterios": ["critério 1", "critério 2"],
      "gabarito": "resposta modelo detalhada"
    }
  ]
}`;

      const userPrompt = `Gere um simulado para o seguinte concurso:
Banca: ${config.banca}
Cargo/Área: ${config.cargo}
Edital/Conteúdo programático: ${config.edital}
Nível: ${config.nivel}
Quantidade de questões objetivas: ${config.qtdObjetivas}
Quantidade de questões discursivas: ${config.qtdDiscursivas}
Disciplinas foco: ${config.disciplinas || "conforme edital"}
Ano/Concurso de referência (se houver): ${config.referencia || "não especificado"}

Crie questões no estilo exato da banca ${config.banca}, com linguagem técnica adequada ao cargo ${config.cargo}. 
As questões devem ser originais, inéditas e de nível ${config.nivel}.
Para questões objetivas, inclua 5 alternativas (A a E) com apenas uma correta.
Para discursivas, inclua critérios de avaliação claros.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await response.json();
      const text = data.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      setLoading(false);
      return parsed;
    } catch (e) {
      setLoading(false);
      showToast("Erro ao gerar simulado. Tente novamente.", "err");
      return null;
    }
  }

  // ── Grade discursive with AI ──
  async function gradeDiscursiva(questao, resposta) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "Você é um examinador de concursos públicos. Responda APENAS com JSON válido, sem texto extra.",
          messages: [{
            role: "user",
            content: `Avalie a seguinte resposta discursiva de concurso público.
Questão: ${questao.enunciado}
Critérios de avaliação: ${questao.criterios.join("; ")}
Gabarito modelo: ${questao.gabarito}
Valor máximo: ${questao.valorMaximo} pontos
Resposta do candidato: ${resposta}

Retorne JSON:
{
  "nota": número de 0 a ${questao.valorMaximo},
  "percentual": número de 0 a 100,
  "feedback": "feedback detalhado com pontos fortes e fracos",
  "criteriosAtendidos": ["critério 1", ...],
  "criteriosFaltantes": ["critério x", ...]
}`
          }],
        }),
      });
      const d = await response.json();
      const txt = d.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
      return JSON.parse(txt);
    } catch { return { nota: 0, percentual: 0, feedback: "Erro na correção automática.", criteriosAtendidos: [], criteriosFaltantes: [] }; }
  }

  // ── Finish exam ──
  async function finishExam() {
    setLoading(true);
    const { simulado, respostas, respostasDiscursivas, startTime } = examState;
    const tempo = Math.round((Date.now() - startTime) / 60000);

    // Grade objectives
    const objetivasResult = simulado.objetivas.map((q, i) => ({
      numero: q.numero,
      disciplina: q.disciplina,
      resposta: respostas[i] || null,
      gabarito: q.gabarito,
      acertou: respostas[i] === q.gabarito,
      explicacao: q.explicacao,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
    }));

    // Grade discursives
    const discursivasResult = [];
    for (let i = 0; i < simulado.discursivas.length; i++) {
      const q = simulado.discursivas[i];
      const resp = respostasDiscursivas[i] || "";
      const grade = resp.length > 10 ? await gradeDiscursiva(q, resp) : { nota: 0, percentual: 0, feedback: "Resposta em branco ou muito curta.", criteriosAtendidos: [], criteriosFaltantes: q.criterios };
      discursivasResult.push({ numero: q.numero, disciplina: q.disciplina, enunciado: q.enunciado, resposta: resp, gabarito: q.gabarito, criterios: q.criterios, valorMaximo: q.valorMaximo, ...grade });
    }

    const totalObj = objetivasResult.length;
    const acertosObj = objetivasResult.filter(r => r.acertou).length;
    const percObj = totalObj > 0 ? Math.round((acertosObj / totalObj) * 100) : 0;
    const notaDisc = discursivasResult.reduce((s, r) => s + (r.nota || 0), 0);
    const maxDisc = discursivasResult.reduce((s, r) => s + r.valorMaximo, 0);
    const percDisc = maxDisc > 0 ? Math.round((notaDisc / maxDisc) * 100) : 0;

    // Per-discipline stats
    const byDisciplina = {};
    objetivasResult.forEach(r => {
      if (!byDisciplina[r.disciplina]) byDisciplina[r.disciplina] = { acertos: 0, total: 0 };
      byDisciplina[r.disciplina].total++;
      if (r.acertou) byDisciplina[r.disciplina].acertos++;
    });

    const result = {
      id: Date.now(),
      data: new Date().toLocaleDateString("pt-BR"),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      titulo: simulado.titulo,
      config: examState.config,
      tempo,
      objetivas: objetivasResult,
      discursivas: discursivasResult,
      stats: { acertosObj, totalObj, percObj, notaDisc, maxDisc, percDisc, byDisciplina },
    };

    setAppData(prev => ({ ...prev, simulados: [result, ...prev.simulados] }));
    setActiveSimulado(result);
    setLoading(false);
    setExamState(null);
    setView("results");
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.navy, fontFamily: "'Segoe UI', system-ui, sans-serif", color: COLORS.white }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {view === "home" && (
        <HomeScreen
          simulados={appData.simulados}
          onNew={() => setView("config")}
          onHistory={() => setView("history")}
          onDetail={s => { setActiveSimulado(s); setView("detail"); }}
        />
      )}
      {view === "config" && (
        <ConfigScreen
          onBack={() => setView("home")}
          onGenerate={async (cfg) => {
            const sim = await generateExam(cfg);
            if (sim) {
              setExamState({ simulado: sim, config: cfg, respostas: {}, respostasDiscursivas: {}, startTime: Date.now(), currentQ: 0, section: "objetivas" });
              setView("exam");
            }
          }}
        />
      )}
      {view === "exam" && examState && (
        <ExamScreen
          examState={examState}
          setExamState={setExamState}
          onFinish={finishExam}
          onBack={() => { setExamState(null); setView("home"); }}
        />
      )}
      {view === "results" && activeSimulado && (
        <ResultsScreen
          result={activeSimulado}
          onHome={() => setView("home")}
          onHistory={() => setView("history")}
        />
      )}
      {view === "history" && (
        <HistoryScreen
          simulados={appData.simulados}
          onBack={() => setView("home")}
          onDetail={s => { setActiveSimulado(s); setView("detail"); }}
          onClear={() => { setAppData(prev => ({ ...prev, simulados: [] })); showToast("Histórico apagado."); }}
        />
      )}
      {view === "detail" && activeSimulado && (
        <DetailScreen result={activeSimulado} onBack={() => setView("history")} />
      )}
    </div>
  );
}

// ─── Loading ───────────────────────────────────────────────────────────────
function LoadingScreen() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length < 3 ? d + "." : "."), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: COLORS.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ width: 64, height: 64, border: `4px solid ${COLORS.navyMid}`, borderTop: `4px solid ${COLORS.gold}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <p style={{ color: COLORS.gold, fontSize: 18, fontWeight: 600 }}>Gerando simulado com IA{dots}</p>
      <p style={{ color: COLORS.muted, fontSize: 14 }}>Isso pode levar alguns segundos</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: type === "err" ? COLORS.red : COLORS.emerald, color: "#fff", padding: "12px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
      {msg}
    </div>
  );
}

// ─── Home ──────────────────────────────────────────────────────────────────
function HomeScreen({ simulados, onNew, onHistory, onDetail }) {
  const last3 = simulados.slice(0, 3);
  const avgPerc = simulados.length > 0 ? Math.round(simulados.reduce((s, r) => s + r.stats.percObj, 0) / simulados.length) : 0;
  const best = simulados.length > 0 ? Math.max(...simulados.map(r => r.stats.percObj)) : 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 12px" }}>📋</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.white, margin: 0 }}>SimulaIA</h1>
        <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 14 }}>Simulados inteligentes para concursos públicos</p>
      </div>

      {/* Stats */}
      {simulados.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Simulados", value: simulados.length, icon: "📝" },
            { label: "Média geral", value: `${avgPerc}%`, icon: "📊", color: avgPerc >= 70 ? COLORS.emeraldLight : avgPerc >= 50 ? COLORS.goldLight : COLORS.redLight },
            { label: "Melhor", value: `${best}%`, icon: "🏆", color: COLORS.goldLight },
          ].map(s => (
            <div key={s.label} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "14px 10px", textAlign: "center", border: `1px solid rgba(255,255,255,0.06)` }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color || COLORS.white }}>{s.value}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button onClick={onNew} style={{ width: "100%", background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`, color: COLORS.navy, border: "none", borderRadius: 14, padding: "18px 24px", fontSize: 17, fontWeight: 800, cursor: "pointer", marginBottom: 12, letterSpacing: 0.3 }}>
        ✨ Gerar Novo Simulado com IA
      </button>
      {simulados.length > 0 && (
        <button onClick={onHistory} style={{ width: "100%", background: "transparent", color: COLORS.gold, border: `2px solid ${COLORS.gold}`, borderRadius: 14, padding: "14px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}>
          📈 Ver Histórico Completo ({simulados.length})
        </button>
      )}

      {/* Recent */}
      {last3.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Recentes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {last3.map(s => (
              <SimuladoCard key={s.id} s={s} onClick={() => onDetail(s)} />
            ))}
          </div>
        </div>
      )}

      {simulados.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <p style={{ fontSize: 15 }}>Nenhum simulado ainda.<br />Crie o seu primeiro acima!</p>
        </div>
      )}
    </div>
  );
}

function SimuladoCard({ s, onClick }) {
  const perc = s.stats.percObj;
  const color = perc >= 70 ? COLORS.emeraldLight : perc >= 50 ? COLORS.goldLight : COLORS.redLight;
  return (
    <div onClick={onClick} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "14px 16px", cursor: "pointer", border: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.titulo}</div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{s.data} · {s.tempo} min · {s.config.banca}</div>
      </div>
      <div style={{ textAlign: "right", marginLeft: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color }}>{perc}%</div>
        <div style={{ fontSize: 11, color: COLORS.muted }}>{s.stats.acertosObj}/{s.stats.totalObj}</div>
      </div>
    </div>
  );
}

// ─── Config ────────────────────────────────────────────────────────────────
const BANCAS = ["CESPE/CEBRASPE", "FCC", "FGV", "VUNESP", "QUADRIX", "IBFC", "AOCP", "IDECAN", "IADES", "CONSULPLAN", "FEPESE", "NC-UFPR", "Outra"];
const NIVEIS = ["Médio", "Médio-técnico", "Superior", "Especialista"];

function ConfigScreen({ onBack, onGenerate }) {
  const [cfg, setCfg] = useState({ banca: "CESPE/CEBRASPE", cargo: "", edital: "", nivel: "Superior", qtdObjetivas: 10, qtdDiscursivas: 1, disciplinas: "", referencia: "" });
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));

  const valid = cfg.cargo.trim().length > 3 && cfg.edital.trim().length > 10;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={btnGhost}>← Voltar</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Configurar Simulado</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Banca organizadora">
          <select value={cfg.banca} onChange={e => set("banca", e.target.value)} style={inputStyle}>
            {BANCAS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        <Field label="Cargo / Área de conhecimento *">
          <input value={cfg.cargo} onChange={e => set("cargo", e.target.value)} placeholder="Ex: Analista Judiciário – Área Administrativa" style={inputStyle} />
        </Field>

        <Field label="Conteúdo do edital / Matérias *" hint="Cole as disciplinas do edital ou descreva o que deve ser cobrado">
          <textarea value={cfg.edital} onChange={e => set("edital", e.target.value)} placeholder="Ex: Língua Portuguesa, Raciocínio Lógico, Direito Constitucional, Direito Administrativo, Administração Pública..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nível">
            <select value={cfg.nivel} onChange={e => set("nivel", e.target.value)} style={inputStyle}>
              {NIVEIS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Questões objetivas">
            <select value={cfg.qtdObjetivas} onChange={e => set("qtdObjetivas", Number(e.target.value))} style={inputStyle}>
              {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} questões</option>)}
            </select>
          </Field>
        </div>

        <Field label="Questões discursivas">
          <select value={cfg.qtdDiscursivas} onChange={e => set("qtdDiscursivas", Number(e.target.value))} style={inputStyle}>
            {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? "Nenhuma" : `${n} questão${n > 1 ? "s" : ""}`}</option>)}
          </select>
        </Field>

        <Field label="Disciplinas prioritárias (opcional)" hint="Se quiser focar em matérias específicas">
          <input value={cfg.disciplinas} onChange={e => set("disciplinas", e.target.value)} placeholder="Ex: Direito Constitucional, Português" style={inputStyle} />
        </Field>

        <Field label="Concurso de referência (opcional)" hint="Para questões no mesmo estilo de um concurso específico">
          <input value={cfg.referencia} onChange={e => set("referencia", e.target.value)} placeholder="Ex: TRF 2025, INSS 2024" style={inputStyle} />
        </Field>
      </div>

      <button
        onClick={() => onGenerate(cfg)}
        disabled={!valid}
        style={{ width: "100%", background: valid ? `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})` : "#2a3a50", color: valid ? COLORS.navy : COLORS.muted, border: "none", borderRadius: 14, padding: "18px 24px", fontSize: 17, fontWeight: 800, cursor: valid ? "pointer" : "not-allowed", marginTop: 24 }}
      >
        ✨ Gerar Simulado com IA
      </button>
      {!valid && <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 13, marginTop: 8 }}>Preencha o cargo e o conteúdo do edital para continuar</p>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: COLORS.gold, marginBottom: 6, letterSpacing: 0.3 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

const inputStyle = { width: "100%", background: COLORS.navyMid, color: COLORS.white, border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "12px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" };
const btnGhost = { background: "transparent", color: COLORS.muted, border: "none", cursor: "pointer", fontSize: 14, padding: "6px 0" };

// ─── Exam ──────────────────────────────────────────────────────────────────
function ExamScreen({ examState, setExamState, onFinish, onBack }) {
  const { simulado, respostas, respostasDiscursivas, currentQ, section } = examState;
  const isObj = section === "objetivas";
  const questions = isObj ? simulado.objetivas : simulado.discursivas;
  const total = simulado.objetivas.length + simulado.discursivas.length;
  const answered = Object.keys(respostas).length + Object.keys(respostasDiscursivas).filter(k => respostasDiscursivas[k]?.trim().length > 0).length;
  const progress = Math.round((answered / total) * 100);

  const q = questions[currentQ];
  const isLastQ = currentQ === questions.length - 1;
  const isLastSection = section === "discursivas" || simulado.discursivas.length === 0;

  function next() {
    if (!isLastQ) {
      setExamState(p => ({ ...p, currentQ: p.currentQ + 1 }));
    } else if (!isLastSection) {
      setExamState(p => ({ ...p, section: "discursivas", currentQ: 0 }));
    } else {
      if (window.confirm("Finalizar o simulado e ver resultados?")) onFinish();
    }
  }

  function prev() {
    if (currentQ > 0) {
      setExamState(p => ({ ...p, currentQ: p.currentQ - 1 }));
    } else if (section === "discursivas") {
      setExamState(p => ({ ...p, section: "objetivas", currentQ: simulado.objetivas.length - 1 }));
    }
  }

  const globalIdx = isObj ? currentQ : simulado.objetivas.length + currentQ;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 16px 80px" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => { if (window.confirm("Sair do simulado? Progresso será perdido.")) onBack(); }} style={btnGhost}>✕ Sair</button>
        <span style={{ fontSize: 13, color: COLORS.muted, fontWeight: 600 }}>
          {isObj ? "Objetivas" : "Discursivas"} · Q{currentQ + 1}/{questions.length}
        </span>
        <span style={{ fontSize: 13, color: COLORS.gold, fontWeight: 700 }}>{answered}/{total} resp.</span>
      </div>

      {/* Progress */}
      <div style={{ height: 4, background: COLORS.navyMid, borderRadius: 4, marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.goldLight})`, borderRadius: 4, transition: "width 0.3s" }} />
      </div>

      {/* Question */}
      <div style={{ background: COLORS.navyMid, borderRadius: 16, padding: "20px 18px", marginBottom: 16, border: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <span style={{ background: COLORS.gold, color: COLORS.navy, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>Q{globalIdx + 1}</span>
          <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>{q.disciplina}</span>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: COLORS.white, margin: 0 }}>{q.enunciado}</p>
      </div>

      {/* Answer area */}
      {isObj ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(q.alternativas).map(([letra, texto]) => {
            const sel = respostas[currentQ] === letra;
            return (
              <div key={letra} onClick={() => setExamState(p => ({ ...p, respostas: { ...p.respostas, [currentQ]: letra } }))}
                style={{ background: sel ? `rgba(201,151,58,0.18)` : COLORS.navyMid, border: `2px solid ${sel ? COLORS.gold : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", transition: "all 0.15s" }}>
                <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: sel ? COLORS.gold : "rgba(255,255,255,0.08)", color: sel ? COLORS.navy : COLORS.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{letra}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: sel ? COLORS.white : "#BCC8D8" }}>{texto}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: COLORS.gold, fontWeight: 700 }}>Critérios: </span>
            <span style={{ fontSize: 12, color: COLORS.muted }}>{q.criterios.join(" · ")}</span>
          </div>
          <textarea
            value={respostasDiscursivas[currentQ] || ""}
            onChange={e => setExamState(p => ({ ...p, respostasDiscursivas: { ...p.respostasDiscursivas, [currentQ]: e.target.value } }))}
            placeholder="Digite sua resposta aqui..."
            rows={8}
            style={{ ...inputStyle, width: "100%", lineHeight: 1.7, boxSizing: "border-box" }}
          />
          <p style={{ fontSize: 12, color: COLORS.muted, textAlign: "right", margin: "4px 0 0" }}>
            {(respostasDiscursivas[currentQ] || "").length} caracteres
          </p>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={prev} disabled={globalIdx === 0} style={{ flex: 1, background: COLORS.navyMid, color: globalIdx === 0 ? COLORS.muted : COLORS.white, border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: globalIdx === 0 ? "not-allowed" : "pointer" }}>← Anterior</button>
        <button onClick={next} style={{ flex: 1, background: (isLastQ && isLastSection) ? `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldLight})` : `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`, color: (isLastQ && isLastSection) ? COLORS.white : COLORS.navy, border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {isLastQ && isLastSection ? "✅ Finalizar" : isLastQ && !isLastSection ? "Discursivas →" : "Próxima →"}
        </button>
      </div>
    </div>
  );
}

// ─── Results ───────────────────────────────────────────────────────────────
function ResultsScreen({ result, onHome, onHistory }) {
  const [tab, setTab] = useState("resumo");
  const { stats } = result;

  const perfColor = (p) => p >= 70 ? COLORS.emeraldLight : p >= 50 ? COLORS.goldLight : COLORS.redLight;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>Resultado</h1>
      <p style={{ textAlign: "center", color: COLORS.muted, fontSize: 13, margin: "0 0 20px" }}>{result.titulo}</p>

      {/* Score hero */}
      <div style={{ background: `linear-gradient(135deg, ${COLORS.navyMid}, #1e3050)`, borderRadius: 18, padding: "24px 20px", marginBottom: 20, textAlign: "center", border: `1px solid rgba(255,255,255,0.08)` }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: perfColor(stats.percObj), lineHeight: 1 }}>{stats.percObj}%</div>
        <div style={{ fontSize: 16, color: COLORS.muted, marginTop: 4 }}>{stats.acertosObj} de {stats.totalObj} objetivas</div>
        {stats.maxDisc > 0 && <div style={{ fontSize: 14, color: COLORS.gold, marginTop: 8 }}>Discursivas: {stats.notaDisc.toFixed(1)}/{stats.maxDisc} pts</div>}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 16 }}>
          {[{ v: `${result.tempo} min`, l: "Duração" }, { v: result.data, l: "Data" }, { v: result.config.banca, l: "Banca" }].map(i => (
            <div key={i.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>{i.v}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{i.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["resumo", "📊 Resumo"], ["objetivas", "✅ Objetivas"], ...(result.discursivas.length > 0 ? [["discursivas", "📝 Discursivas"]] : [])].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, background: tab === k ? COLORS.gold : COLORS.navyMid, color: tab === k ? COLORS.navy : COLORS.muted, border: "none", borderRadius: 10, padding: "10px 8px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {tab === "resumo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(stats.byDisciplina).sort((a, b) => (b[1].acertos / b[1].total) - (a[1].acertos / a[1].total)).map(([disc, d]) => {
            const p = Math.round((d.acertos / d.total) * 100);
            return (
              <div key={disc} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>{disc}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: perfColor(p) }}>{p}% ({d.acertos}/{d.total})</span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${p}%`, background: perfColor(p), borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "objetivas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result.objetivas.map((q, i) => (
            <div key={i} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "14px 16px", border: `2px solid ${q.acertou ? "rgba(26,107,74,0.4)" : "rgba(192,57,43,0.4)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: COLORS.muted }}>Q{q.numero} · {q.disciplina}</span>
                <span style={{ fontSize: 16 }}>{q.acertou ? "✅" : "❌"}</span>
              </div>
              <p style={{ fontSize: 13, color: COLORS.white, margin: "0 0 10px", lineHeight: 1.5 }}>{q.enunciado}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 13, background: "rgba(26,107,74,0.25)", color: COLORS.emeraldLight, padding: "4px 10px", borderRadius: 6 }}>Gabarito: {q.gabarito}</span>
                {!q.acertou && <span style={{ fontSize: 13, background: "rgba(192,57,43,0.25)", color: COLORS.redLight, padding: "4px 10px", borderRadius: 6 }}>Sua resp: {q.resposta || "—"}</span>}
              </div>
              <p style={{ fontSize: 12, color: COLORS.muted, margin: 0, lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>{q.explicacao}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "discursivas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {result.discursivas.map((q, i) => {
            const pc = q.percentual || 0;
            return (
              <div key={i} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: COLORS.muted }}>Q{q.numero} · {q.disciplina}</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: perfColor(pc) }}>{q.nota?.toFixed(1)}/{q.valorMaximo}</span>
                </div>
                <p style={{ fontSize: 13, color: COLORS.white, margin: "0 0 10px", lineHeight: 1.5 }}>{q.enunciado}</p>
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 4px", fontWeight: 700 }}>Sua resposta:</p>
                  <p style={{ fontSize: 13, color: "#BCC8D8", margin: 0, lineHeight: 1.6 }}>{q.resposta || "(em branco)"}</p>
                </div>
                <p style={{ fontSize: 13, color: COLORS.goldLight, margin: "0 0 8px", lineHeight: 1.5 }}>💬 {q.feedback}</p>
                {q.criteriosAtendidos?.length > 0 && <p style={{ fontSize: 12, color: COLORS.emeraldLight, margin: "0 0 4px" }}>✅ {q.criteriosAtendidos.join(", ")}</p>}
                {q.criteriosFaltantes?.length > 0 && <p style={{ fontSize: 12, color: COLORS.redLight, margin: 0 }}>❌ {q.criteriosFaltantes.join(", ")}</p>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onHome} style={{ flex: 1, background: COLORS.navyMid, color: COLORS.white, border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>🏠 Início</button>
        <button onClick={onHistory} style={{ flex: 1, background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})`, color: COLORS.navy, border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>📈 Histórico</button>
      </div>
    </div>
  );
}

// ─── History ───────────────────────────────────────────────────────────────
function HistoryScreen({ simulados, onBack, onDetail, onClear }) {
  const sorted = [...simulados].sort((a, b) => b.id - a.id);
  const perfs = simulados.map(s => s.stats.percObj);
  const trend = perfs.length >= 2 ? perfs[0] - perfs[1] : 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={btnGhost}>← Voltar</button>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Histórico</h1>
        </div>
        {simulados.length > 0 && (
          <button onClick={() => { if (window.confirm("Apagar todo o histórico?")) onClear(); }} style={{ ...btnGhost, color: COLORS.redLight, fontSize: 13 }}>🗑 Limpar</button>
        )}
      </div>

      {simulados.length > 1 && (
        <div style={{ background: COLORS.navyMid, borderRadius: 14, padding: "16px", marginBottom: 20, display: "flex", justifyContent: "space-around" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.gold }}>{simulados.length}</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Simulados</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.white }}>{Math.round(perfs.reduce((a, b) => a + b, 0) / perfs.length)}%</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Média</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: trend >= 0 ? COLORS.emeraldLight : COLORS.redLight }}>{trend >= 0 ? "+" : ""}{trend}%</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Tendência</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.emeraldLight }}>{Math.max(...perfs)}%</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Melhor</div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: COLORS.muted }}>
          <p>Nenhum simulado no histórico ainda.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((s, idx) => (
            <div key={s.id} onClick={() => onDetail(s)} style={{ background: COLORS.navyMid, borderRadius: 12, padding: "14px 16px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: idx === 0 ? `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.goldLight})` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: idx === 0 ? COLORS.navy : COLORS.muted, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.titulo}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{s.data} · {s.tempo}min · {s.config.banca} · {s.config.nivel}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.stats.percObj >= 70 ? COLORS.emeraldLight : s.stats.percObj >= 50 ? COLORS.goldLight : COLORS.redLight }}>{s.stats.percObj}%</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{s.stats.acertosObj}/{s.stats.totalObj}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail ────────────────────────────────────────────────────────────────
function DetailScreen({ result, onBack }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={btnGhost}>← Voltar</button>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.titulo}</h1>
      </div>
      <ResultsScreen result={result} onHome={onBack} onHistory={onBack} />
    </div>
  );
}

