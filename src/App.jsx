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
  try {
    const r = localStorage.getItem(SK);
    return r ? JSON.parse(r) : { users: [], currentUser: null };
  } catch {
    return { users: [], currentUser: null };
  }
}

function save(d) {
  try {
    localStorage.setItem(SK, JSON.stringify(d));
  } catch {}
}

// ─── Banca logos ──────────────────────────────────────────────────────────
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

// ─── Styles ────────────────────────────────────────────────────────────────
const inp = {
  width: "100%",
  background: C.navyMid,
  color: C.white,
  border: `1px solid rgba(255,255,255,0.12)`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box"
};

const btnG = {
  background: "transparent",
  color: C.muted,
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  padding: "6px 0"
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{
        display:"block",
        fontSize:13,
        fontWeight:700,
        color:C.gold,
        marginBottom:6
      }}>
        {label}
      </label>

      {children}

      {hint &&
        <p style={{
          fontSize:12,
          color:C.muted,
          margin:"4px 0 0"
        }}>
          {hint}
        </p>
      }
    </div>
  );
}

function Toast({msg,type}) {
  return (
    <div style={{
      position:"fixed",
      top:16,
      right:16,
      zIndex:9999,
      background:type==="err"?C.red:C.emerald,
      color:"#fff",
      padding:"12px 20px",
      borderRadius:10,
      fontWeight:600,
      fontSize:14
    }}>
      {msg}
    </div>
  );
}

function LoadingScreen({msg="Gerando simulado com IA"}) {
  const [dots,setDots]=useState(".");

  useEffect(()=>{
    const t=setInterval(()=>{
      setDots(d=>d.length<3?d+".":".")
    },500);

    return()=>clearInterval(t);
  },[]);

  return (
    <div style={{
      minHeight:"100vh",
      background:C.navy,
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      justifyContent:"center"
    }}>
      <div style={{
        width:64,
        height:64,
        border:`4px solid ${C.navyMid}`,
        borderTop:`4px solid ${C.gold}`,
        borderRadius:"50%",
        animation:"spin 1s linear infinite"
      }}/>

      <p style={{
        color:C.gold,
        fontSize:18,
        fontWeight:600
      }}>
        {msg}{dots}
      </p>

      <style>{`
        @keyframes spin {
          to {transform:rotate(360deg);}
        }
      `}</style>
    </div>
  );
}


// ─── Main App ──────────────────────────────────────────────────────────────

export default function App(){

  const [data,setData]=useState(load);
  const [view,setView]=useState("login");
  const [activeSimulado,setActiveSimulado]=useState(null);
  const [examState,setExamState]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadingMsg,setLoadingMsg]=useState("Gerando simulado com IA");
  const [toast,setToast]=useState(null);

  useEffect(()=>{
    save(data);
  },[data]);

  useEffect(()=>{
    if(data.currentUser)
      setView("home");
  },[]);

  const user=data.users.find(
    u=>u.id===data.currentUser
  );

  function showToast(msg,type="ok"){
    setToast({msg,type});
    setTimeout(()=>setToast(null),3500);
  }

  function login(userId){
    setData(p=>({
      ...p,
      currentUser:userId
    }));

    setView("home");
  }

  function logout(){
    setData(p=>({
      ...p,
      currentUser:null
    }));

    setView("login");
  }  function saveResult(result){
    setData(prev=>({
      ...prev,
      users:prev.users.map(u=>
        u.id===data.currentUser
        ? {
            ...u,
            simulados:[
              result,
              ...(u.simulados||[])
            ]
          }
        :u
      )
    }));
  }


  async function generateExam(config){

    setLoadingMsg("Gerando simulado com IA");
    setLoading(true);

    try{

      const hasRedacao =
        config.tipoDiscursiva==="redacao";


      const systemPrompt=`
Você é especialista em concursos públicos brasileiros.
Gere um simulado completo.

Responda APENAS JSON válido.

Formato:
{
"titulo":"",
"objetivas":[],
"discursivas":[],
"redacao":null
}
`;

      const userPrompt=`
Banca: ${config.banca}

Cargo:
${config.cargo}

Matérias:
${config.edital}

Nível:
${config.nivel}

Quantidade:
${config.qtdObjetivas}

Discursivas:
${hasRedacao?0:config.qtdDiscursivas}

Redação:
${hasRedacao?"SIM":"NÃO"}
`;


      const response=await fetch(
        "/api/generate",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            systemPrompt,
            userPrompt
          })
        }
      );


      const parsed=await response.json();

      setLoading(false);

      return parsed;


    }catch(e){

      setLoading(false);

      showToast(
        "Erro ao gerar simulado.",
        "err"
      );

      return null;
    }
  }



  async function gradeDiscursiva(
    questao,
    resposta
  ){

    try{

      const response=await fetch(
        "/api/correct",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            questao,
            resposta
          })
        }
      );


      return await response.json();


    }catch{

      return {
        nota:0,
        percentual:0,
        feedback:"Erro na correção."
      };

    }
  }



  async function gradeRedacao(
    redacao,
    resposta
  ){

    try{

      const response=await fetch(
        "/api/correct-redacao",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            redacao,
            resposta
          })
        }
      );


      return await response.json();


    }catch{

      return {
        nota:0,
        percentual:0,
        feedback:"Erro na correção."
      };

    }
  }



  async function finishExam(){

    setLoadingMsg(
      "Corrigindo suas respostas"
    );

    setLoading(true);


    const {
      simulado,
      respostas,
      respostasDiscursivas,
      respostaRedacao,
      startTime,
      config
    }=examState;


    const tempo=Math.round(
      (Date.now()-startTime)/60000
    );


    const objetivasResult=
      simulado.objetivas.map(
        (q,i)=>({

          ...q,

          resposta:
          respostas[i]||null,

          acertou:
          respostas[i]===q.gabarito

        })
      );



    const acertosObj=
      objetivasResult.filter(
        q=>q.acertou
      ).length;


    const totalObj=
      objetivasResult.length;


    const percObj=
      totalObj
      ?
      Math.round(
        acertosObj/totalObj*100
      )
      :
      0;



    const result={

      id:Date.now(),

      data:
      new Date()
      .toLocaleDateString("pt-BR"),

      hora:
      new Date()
      .toLocaleTimeString("pt-BR"),


      titulo:
      simulado.titulo,


      config,

      tempo,


      objetivas:
      objetivasResult,


      stats:{

        acertosObj,

        totalObj,

        percObj

      }

    };


    saveResult(result);


    setActiveSimulado(result);

    setLoading(false);

    setExamState(null);

    setView("results");

  }  if (loading) return <LoadingScreen msg={loadingMsg} />;

  return (
    <div
      style={{
        minHeight:"100vh",
        background:C.navy,
        fontFamily:"'Segoe UI',system-ui,sans-serif",
        color:C.white
      }}
    >

      {toast &&
        <Toast
          msg={toast.msg}
          type={toast.type}
        />
      }


      {view==="login" &&
        <LoginScreen
          data={data}
          setData={setData}
          onLogin={login}
        />
      }


      {view==="home" && user &&
        <HomeScreen
          user={user}
          onNew={()=>setView("config")}
          onHistory={()=>setView("history")}
          onDetail={(s)=>{
            setActiveSimulado(s);
            setView("detail");
          }}
          onLogout={logout}
        />
      }



      {view==="config" &&
        <ConfigScreen
          onBack={()=>setView("home")}
          onGenerate={async cfg=>{

            const sim =
              await generateExam(cfg);

            if(sim){

              setExamState({

                simulado:sim,

                config:cfg,

                respostas:{},

                respostasDiscursivas:{},

                respostaRedacao:"",

                startTime:Date.now(),

                currentQ:0,

                section:"objetivas"

              });


              setView("exam");

            }

          }}
        />
      }



      {view==="exam" && examState &&
        <ExamScreen
          examState={examState}
          setExamState={setExamState}
          onFinish={finishExam}
          onBack={()=>{

            setExamState(null);

            setView("home");

          }}
        />
      }



      {view==="results" &&
        activeSimulado &&
        <ResultsScreen
          result={activeSimulado}
          onHome={()=>setView("home")}
          onHistory={()=>setView("history")}
        />
      }



      {view==="history" && user &&
        <HistoryScreen
          simulados={user.simulados || []}
          onBack={()=>setView("home")}
          onDetail={(s)=>{

            setActiveSimulado(s);

            setView("detail");

          }}
        />
      }



      {view==="detail" &&
        activeSimulado &&
        <DetailScreen
          result={activeSimulado}
          onBack={()=>setView("history")}
        />
      }


    </div>
  );

} // ─── Login / Cadastro ──────────────────────────────────────────────────────

function LoginScreen({data,setData,onLogin}){

const [tab,setTab]=useState("login");
const [nome,setNome]=useState("");
const [usuario,setUsuario]=useState("");
const [senha,setSenha]=useState("");
const [erro,setErro]=useState("");


function handleLogin(){

const u=data.users.find(
u=>
u.usuario===usuario.trim().toLowerCase()
&&
u.senha===senha
);


if(!u){

setErro("Usuário ou senha incorretos.");

return;

}


onLogin(u.id);

}



function handleCadastro(){

if(
!nome.trim()
||
!usuario.trim()
||
!senha.trim()
){

setErro("Preencha todos os campos.");

return;

}



if(senha.length<4){

setErro("Senha deve ter pelo menos 4 caracteres.");

return;

}



if(
data.users.find(
u=>u.usuario===usuario.trim().toLowerCase()
)
){

setErro("Esse usuário já existe.");

return;

}



const newUser={

id:Date.now().toString(),

nome:nome.trim(),

usuario:usuario.trim().toLowerCase(),

senha,

simulados:[]

};



setData(p=>({

...p,

users:[
...p.users,
newUser
]

}));


onLogin(newUser.id);


}



return (

<div
style={{
minHeight:"100vh",
display:"flex",
alignItems:"center",
justifyContent:"center",
padding:16
}}
>

<div
style={{
width:"100%",
maxWidth:400
}}
>


<div
style={{
textAlign:"center",
marginBottom:30
}}
>

<div
style={{
fontSize:40
}}
>
📋
</div>

<h1
style={{
margin:0,
fontSize:28,
fontWeight:900
}}
>
SimulaIA
</h1>

<p
style={{
color:C.muted
}}
>
Simulados inteligentes para concursos
</p>

</div>



<div
style={{
background:C.navyMid,
borderRadius:16,
padding:20
}}
>


<div
style={{
display:"flex",
marginBottom:20
}}
>

<button
onClick={()=>{
setTab("login");
setErro("");
}}
style={{
flex:1,
padding:10,
background:tab==="login"?C.gold:"transparent",
border:"none",
borderRadius:8,
fontWeight:700
}}
>
Entrar
</button>


<button
onClick={()=>{
setTab("cadastro");
setErro("");
}}
style={{
flex:1,
padding:10,
background:tab==="cadastro"?C.gold:"transparent",
border:"none",
borderRadius:8,
fontWeight:700
}}
>
Criar conta
</button>


</div>




<div
style={{
display:"flex",
flexDirection:"column",
gap:12
}}
>


{tab==="cadastro" &&

<input

value={nome}

onChange={e=>setNome(e.target.value)}

placeholder="Nome completo"

style={inp}

/>

}



<input

value={usuario}

onChange={e=>setUsuario(e.target.value)}

placeholder="Usuário"

style={inp}

/>



<input

value={senha}

onChange={e=>setSenha(e.target.value)}

placeholder="Senha"

type="password"

style={inp}

/>



{erro &&

<p
style={{
color:C.redLight,
fontSize:13
}}
>
{erro}
</p>

}



<button

onClick={
tab==="login"
?
handleLogin
:
handleCadastro
}

style={{

background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,

border:"none",

borderRadius:12,

padding:14,

fontWeight:800,

fontSize:16,

cursor:"pointer"

}}

>

{
tab==="login"
?
"Entrar"
:
"Criar conta"
}

</button>



</div>


</div>


</div>


</div>

);

}
