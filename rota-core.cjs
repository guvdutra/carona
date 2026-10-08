// Lógica pura de otimização de rota — compartilhada entre o script Node (otimizar.mjs)
// e o hook do PocketBase (pocketbase/pb_hooks/*.pb.js, que roda num motor JS goja,
// por isso aqui evitamos sintaxe recente demais, tipo "??" e "Array.prototype.at").

// ---------- 1. Monta a lista de pontos ----------
function montarPontos(viagem) {
  const pontos = [{ ...viagem.partida, nome: `Partida (${viagem.partida.nome || "início"})` }];
  const caroneiros = viagem.caroneiros.map((c) => {
    const emb = pontos.push({ ...c.embarque, nome: `Embarque ${c.nome}` }) - 1;
    const des = pontos.push({ ...c.desembarque, nome: `Desembarque ${c.nome}` }) - 1;
    return { nome: c.nome, emb, des };
  });
  // Chegada é opcional: sem ela, a viagem termina no último desembarque.
  const chegada = viagem.chegada
    ? pontos.push({ ...viagem.chegada, nome: `Chegada (${viagem.chegada.nome || "fim"})` }) - 1
    : null;
  return { pontos, caroneiros, partida: 0, chegada };
}

// ---------- 2. Melhor ordem (força bruta com poda + precedência) ----------
// estado[i]: 0 = ainda não embarcou, 1 = no carro, 2 = já desceu
function melhorOrdem(custo, caroneiros, partida, chegada) {
  let melhor = { custo: Infinity, ordem: null };
  const totalParadas = 1 + 2 * caroneiros.length;

  const visitar = (atual, ordem, total, estado) => {
    if (total >= melhor.custo) return; // poda: já é pior que a melhor achada
    if (ordem.length === totalParadas) {
      const fim = chegada == null ? 0 : custo[atual][chegada];
      if (total + fim < melhor.custo) {
        melhor = { custo: total + fim, ordem: chegada == null ? ordem : [...ordem, chegada] };
      }
      return;
    }
    caroneiros.forEach((c, i) => {
      if (estado[i] === 2) return;
      const prox = estado[i] === 0 ? c.emb : c.des; // embarque sempre antes do desembarque
      const novo = [...estado];
      novo[i]++;
      visitar(prox, [...ordem, prox], total + custo[atual][prox], novo);
    });
  };

  visitar(partida, [partida], 0, caroneiros.map(() => 0));
  return melhor;
}

// ---------- 3. Link de navegação (Google Maps) — visão geral da viagem toda ----------
// Sem pontos de passagem: serve só pra ter uma ideia geral da rota. Com muitos
// caroneiros isso já usa quase todas as paradas que o Google aceita, então não
// dá pra também empurrar pontos de passagem forçados aqui (não escala).
function linkGoogleMaps(paradas) {
  const coord = (p) => `${p.lat},${p.lng}`;
  const meio = paradas.slice(1, -1).map(coord);
  const params = [
    "api=1",
    `origin=${encodeURIComponent(coord(paradas[0]))}`,
    `destination=${encodeURIComponent(coord(paradas[paradas.length - 1]))}`,
    "travelmode=driving",
  ];
  if (meio.length) params.push(`waypoints=${encodeURIComponent(meio.join("|"))}`);
  return `https://www.google.com/maps/dir/?${params.join("&")}`;
}

// ---------- 4. Links de navegação por trecho (ponto a ponto) ----------
// Em vez de um único link com a viagem inteira (que esbarra no limite de
// paradas do Google conforme o número de caroneiros cresce), gera um link por
// trecho (parada N -> parada N+1). O(s) ponto(s) de passagem forçado(s) —
// "via" — entram só no trecho em que a rota deixa de coletar caroneiros e
// passa a rodar o trecho longo até os desembarques (logo após o último
// embarque), que é o único trecho onde o Google costuma escolher um caminho
// pior do que uma rodovia conhecida por quem dirige. Assim o limite de paradas
// nunca é afetado pelo número de caroneiros.
function linksPorTrecho(paradas, via) {
  const coord = (p) => `${p.lat},${p.lng}`;
  const link = (origem, destino, pontosVia) => {
    const params = [
      "api=1",
      `origin=${encodeURIComponent(coord(origem))}`,
      `destination=${encodeURIComponent(coord(destino))}`,
      "travelmode=driving",
    ];
    if (pontosVia && pontosVia.length) {
      params.push(`waypoints=${encodeURIComponent(pontosVia.map(coord).join("|"))}`);
    }
    return `https://www.google.com/maps/dir/?${params.join("&")}`;
  };

  let ultimoEmbarque = -1;
  paradas.forEach((p, i) => {
    if (p.nome && p.nome.indexOf("Embarque") === 0) ultimoEmbarque = i;
  });

  const trechos = [];
  for (let i = 0; i < paradas.length - 1; i++) {
    const usarVia = via && via.length && i === ultimoEmbarque;
    trechos.push({
      de: paradas[i].nome,
      para: paradas[i + 1].nome,
      link: link(paradas[i], paradas[i + 1], usarVia ? via : null),
    });
  }
  return trechos;
}

module.exports = { montarPontos, melhorOrdem, linkGoogleMaps, linksPorTrecho };
