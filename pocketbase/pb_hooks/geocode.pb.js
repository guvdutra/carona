/// <reference path="../pb_data/types.d.ts" />

// POST /api/geocode
// Converte rua + número + cidade em lat/lng usando a API de geocoding do ORS
// (sempre api.openrouteservice.org -- o mirror api.heigit.org usado pra
// matriz de distâncias não tem esse serviço). O bairro NÃO entra na busca:
// testei na mão e incluir bairro (seja como "neighbourhood" ou junto no
// endereço) piora o resultado nessa base de dados do Brasil -- o serviço
// perde a rua e só acha a cidade. O bairro fica só como texto de referência,
// responsabilidade do front-end. O "estado" é descoberto sozinho via reverse
// geocode do ponto de referência da viagem (partida ou chegada), pra não
// pedir isso de quem está preenchendo.
routerAdd("POST", "/api/geocode", (e) => {
  // Precisa ser declarada aqui dentro: handlers do PocketBase rodam
  // isolados, funções de fora do routerAdd não ficam visíveis dentro dele.
  const querystring = (params) =>
    Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join("&");

  const ORS_KEY = $os.getenv("ORS_KEY");
  if (!ORS_KEY) {
    return e.json(500, { error: "Variável ORS_KEY não definida no servidor." });
  }

  const body = e.requestInfo().body || {};
  const rua = typeof body.rua === "string" ? body.rua.trim() : "";
  const numero = typeof body.numero === "string" ? body.numero.trim() : "";
  const cidade = typeof body.cidade === "string" ? body.cidade.trim() : "";
  const perto = body.perto || {};
  const numValido = (v) => typeof v === "number" && isFinite(v);

  if (!rua) return e.json(400, { error: "Informe a rua." });
  if (!cidade) return e.json(400, { error: "Informe a cidade." });

  // Descobre o estado a partir do ponto de referência da viagem (se vier).
  let region = "";
  if (numValido(perto.lat) && numValido(perto.lng)) {
    const respReverse = $http.send({
      url: `https://api.openrouteservice.org/geocode/reverse?${querystring({
        api_key: ORS_KEY,
        "point.lat": perto.lat,
        "point.lon": perto.lng,
        size: 1,
      })}`,
      method: "GET",
      timeout: 15,
    });
    if (respReverse.statusCode === 200) {
      const props =
        (respReverse.json.features && respReverse.json.features[0] && respReverse.json.features[0].properties) || {};
      region = props.region || "";
    }
  }

  const endereco = numero ? `${rua} ${numero}` : rua;

  const respBusca = $http.send({
    url: `https://api.openrouteservice.org/geocode/search/structured?${querystring({
      api_key: ORS_KEY,
      address: endereco,
      locality: cidade,
      region,
      country: "BR",
      size: 5,
    })}`,
    method: "GET",
    timeout: 15,
  });
  if (respBusca.statusCode !== 200) {
    return e.json(502, { error: "Erro ao buscar o endereço." });
  }

  const resultados = (respBusca.json.features || []).map((f) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    confianca: f.properties.confidence,
  }));

  return e.json(200, { resultados });
});
