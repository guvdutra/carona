/// <reference path="../pb_data/types.d.ts" />

// GET /api/viagens/:id/otimizar[?tempo=1]
// Lê a viagem e suas reservas aprovadas no banco, monta a rota (mesma lógica
// pura do otimizar.mjs, compartilhada via rota-core.cjs) e devolve a ordem
// de paradas + o link do Google Maps.
routerAdd("GET", "/api/viagens/{id}/otimizar", (e) => {
  const { montarPontos, melhorOrdem, linkGoogleMaps, linksPorTrecho } = require(`${__hooks}/../../rota-core.cjs`);

  const id = e.request.pathValue("id");

  let viagemRecord;
  try {
    viagemRecord = e.app.findRecordById("viagens", id);
  } catch (err) {
    return e.json(404, { error: "Viagem não encontrada." });
  }

  const reservas = e.app.findRecordsByFilter(
    "reservas",
    "viagem = {:id} && status = 'aprovada'",
    "",
    200,
    0,
    { id }
  );

  if (reservas.length === 0) {
    return e.json(400, { error: "Nenhuma reserva aprovada para essa viagem." });
  }

  const viagem = {
    partida: {
      nome: viagemRecord.getString("partida_nome"),
      lat: viagemRecord.getFloat("partida_lat"),
      lng: viagemRecord.getFloat("partida_lng"),
    },
    chegada: viagemRecord.getString("chegada_nome")
      ? {
          nome: viagemRecord.getString("chegada_nome"),
          lat: viagemRecord.getFloat("chegada_lat"),
          lng: viagemRecord.getFloat("chegada_lng"),
        }
      : null,
    caroneiros: reservas.map((r) => ({
      nome: r.getString("caroneiro_nome"),
      embarque: {
        lat: r.getFloat("embarque_lat"),
        lng: r.getFloat("embarque_lng"),
        ref: r.getString("embarque_ref"),
      },
      desembarque: {
        lat: r.getFloat("desembarque_lat"),
        lng: r.getFloat("desembarque_lng"),
        ref: r.getString("desembarque_ref"),
      },
    })),
  };

  const ORS_KEY = $os.getenv("ORS_KEY");
  if (!ORS_KEY) {
    return e.json(500, { error: "Variável ORS_KEY não definida no servidor." });
  }

  const { pontos, caroneiros, partida, chegada } = montarPontos(viagem);

  const resp = $http.send({
    url: "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
    method: "POST",
    headers: { Authorization: ORS_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      locations: pontos.map((p) => [p.lng, p.lat]),
      metrics: ["distance", "duration"],
    }),
    timeout: 30,
  });

  if (resp.statusCode !== 200) {
    return e.json(502, { error: `ORS respondeu ${resp.statusCode}`, detalhe: resp.json });
  }

  const limpar = (m) => m.map((linha) => linha.map((v) => (v == null ? Infinity : v)));
  const distancias = limpar(resp.json.distances);
  const tempos = limpar(resp.json.durations);

  const porTempo = e.request.url.query().get("tempo") === "1";
  const { ordem } = melhorOrdem(porTempo ? tempos : distancias, caroneiros, partida, chegada);

  if (!ordem) {
    return e.json(422, { error: "Nenhuma rota possível (algum ponto está fora de estrada?)." });
  }

  let km = 0;
  let min = 0;
  for (let i = 1; i < ordem.length; i++) {
    km += distancias[ordem[i - 1]][ordem[i]] / 1000;
    min += tempos[ordem[i - 1]][ordem[i]] / 60;
  }

  const paradas = ordem.map((i) => pontos[i]);
  // "via" é guardado como texto (JSON serializado), não como campo JSON nativo:
  // o motor JS do PocketBase não desserializa campos "json" em objetos JS comuns
  // automaticamente, então JSON.parse manual é mais simples e confiável aqui.
  const viaTexto = viagemRecord.getString("via");
  const via = viaTexto ? JSON.parse(viaTexto) : null;

  return e.json(200, {
    criterio: porTempo ? "tempo" : "distancia",
    paradas: paradas.map((p) => ({ nome: p.nome, lat: p.lat, lng: p.lng, ref: p.ref || null })),
    distanciaKm: Math.round(km * 10) / 10,
    duracaoMin: Math.round(min),
    googleMaps: linkGoogleMaps(paradas),
    trechos: linksPorTrecho(paradas, via),
  });
});

// GET /api/viagens/:id/info
// Endpoint público e minimalista: só os pontos de partida/chegada e o status
// da viagem, pra centralizar os mapas da página de solicitação
// (pb_public/solicitar.html). Não expõe reservas nem nenhum outro dado.
routerAdd("GET", "/api/viagens/{id}/info", (e) => {
  const id = e.request.pathValue("id");

  let viagem;
  try {
    viagem = e.app.findRecordById("viagens", id);
  } catch (err) {
    return e.json(404, { error: "Viagem não encontrada." });
  }

  const temChegada = !!viagem.getString("chegada_nome");

  return e.json(200, {
    status: viagem.getString("status"),
    partida: { lat: viagem.getFloat("partida_lat"), lng: viagem.getFloat("partida_lng") },
    chegada: temChegada
      ? { lat: viagem.getFloat("chegada_lat"), lng: viagem.getFloat("chegada_lng") }
      : null,
  });
});
