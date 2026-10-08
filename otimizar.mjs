// Otimizador de rota de carona — Passo 1 (script local)
// Uso:  ORS_KEY=sua_chave node otimizar.mjs viagem.json [--tempo]
// Por padrão otimiza por DISTÂNCIA (combustível). Com --tempo, otimiza por duração.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { montarPontos, melhorOrdem, linkGoogleMaps, linksPorTrecho } = require("./rota-core.cjs");

const ORS_KEY = process.env.ORS_KEY;
const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "viagem.json";
const porTempo = process.argv.includes("--tempo");

// ---------- 2. Matriz de distâncias/tempos (OpenRouteService) ----------
async function buscarMatriz(pontos) {
  const resp = await fetch("https://api.heigit.org/openrouteservice/v2/matrix/driving-car", {
    method: "POST",
    headers: { Authorization: ORS_KEY, "Content-Type": "application/json" },
    // Atenção: o ORS usa [longitude, latitude]
    body: JSON.stringify({
      locations: pontos.map((p) => [p.lng, p.lat]),
      metrics: ["distance", "duration"],
    }),
  });
  if (!resp.ok) throw new Error(`ORS respondeu ${resp.status}: ${await resp.text()}`);
  const { distances, durations } = await resp.json();
  const limpar = (m) => m.map((linha) => linha.map((v) => (v == null ? Infinity : v)));
  return { distancias: limpar(distances), tempos: limpar(durations) };
}

// ---------- Execução ----------
async function main() {
  if (!ORS_KEY) {
    console.error("Defina a variável ORS_KEY com sua chave do OpenRouteService.");
    process.exit(1);
  }
  const viagem = JSON.parse(readFileSync(arquivo, "utf8"));
  const { pontos, caroneiros, partida, chegada } = montarPontos(viagem);
  const { distancias, tempos } = await buscarMatriz(pontos);

  const { ordem } = melhorOrdem(porTempo ? tempos : distancias, caroneiros, partida, chegada);
  if (!ordem) throw new Error("Nenhuma rota possível (algum ponto está fora de estrada?).");

  let km = 0, min = 0;
  for (let i = 1; i < ordem.length; i++) {
    km += distancias[ordem[i - 1]][ordem[i]] / 1000;
    min += tempos[ordem[i - 1]][ordem[i]] / 60;
  }

  const paradas = ordem.map((i) => pontos[i]);
  console.log(`\nRota otimizada por ${porTempo ? "TEMPO" : "DISTÂNCIA"}:\n`);
  paradas.forEach((p, n) => {
    console.log(`${String(n + 1).padStart(2)}. ${p.nome}${p.ref ? ` — ${p.ref}` : ""}`);
  });
  console.log(`\nTotal: ${km.toFixed(1)} km · ~${Math.round(min)} min`);
  console.log(`\nGoogle Maps (visão geral, sem pontos de passagem):\n${linkGoogleMaps(paradas)}\n`);

  console.log("Navegação por trecho (use estes no carro):\n");
  linksPorTrecho(paradas, viagem.via).forEach(({ de, para, link }) => {
    console.log(`${de} -> ${para}\n${link}\n`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
