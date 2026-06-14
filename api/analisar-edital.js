export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { texto } = req.body;

    if (!texto) {
      return res.status(400).json({
        error: "Texto do edital não informado",
      });
    }

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system:
            "Você é especialista em concursos públicos. Responda SOMENTE com JSON válido.",
          messages: [
            {
              role: "user",
              content: `
Analise o edital abaixo e retorne apenas JSON válido.

Campos:
{
  "banca":"",
  "cargo":"",
  "nivel":"",
  "disciplinas":"",
  "qtdObjetivas":0,
  "qtdDiscursivas":0,
  "temRedacao":false,
  "referencia":""
}

EDITAL:
${texto.slice(0, 12000)}
`,
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro Anthropic",
        details: data,
      });
    }

    const text = (data.content || [])
      .map((item) => item.text || "")
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    try {
      const resultado = JSON.parse(text);
      return res.status(200).json(resultado);
    } catch {
      return res.status(200).json({
        raw: text,
        error: "Claude retornou JSON inválido",
      });
    }
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Erro interno",
      details: err.message,
    });
  }
}
