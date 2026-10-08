/// <reference path="../pb_data/types.d.ts" />

// POST /api/viagens/:id/solicitar
// Endpoint público (sem autenticação): o caroneiro manda nome + embarque +
// desembarque (lat/lng/ref) e isso vira uma reserva com status "pendente".
// Nunca confia no valor de "status" vindo do cliente -- só o motorista decide
// isso depois, pelo painel admin. Por usar e.app.save() diretamente (em vez
// da API padrão de collections), o createRule da coleção "reservas" continua
// null (só admin) e esse é o único caminho de escrita pública, totalmente
// validado aqui dentro.
routerAdd("POST", "/api/viagens/{id}/solicitar", (e) => {
  const id = e.request.pathValue("id");

  let viagem;
  try {
    viagem = e.app.findRecordById("viagens", id);
  } catch (err) {
    return e.json(404, { error: "Viagem não encontrada." });
  }

  if (viagem.getString("status") !== "aberta") {
    return e.json(400, { error: "Essa viagem não está mais aceitando pedidos." });
  }

  const body = e.requestInfo().body || {};
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const embarque = body.embarque || {};
  const desembarque = body.desembarque || {};

  const numValido = (v) => typeof v === "number" && isFinite(v);
  const textoSeguro = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  if (!nome) {
    return e.json(400, { error: "Informe seu nome." });
  }
  if (!numValido(embarque.lat) || !numValido(embarque.lng)) {
    return e.json(400, { error: "Marque o ponto de embarque no mapa." });
  }
  if (!numValido(desembarque.lat) || !numValido(desembarque.lng)) {
    return e.json(400, { error: "Marque o ponto de desembarque no mapa." });
  }

  const collection = e.app.findCollectionByNameOrId("reservas");
  const record = new Record(collection);
  record.set("viagem", id);
  record.set("caroneiro_nome", textoSeguro(nome, 120));
  record.set("embarque_lat", embarque.lat);
  record.set("embarque_lng", embarque.lng);
  record.set("embarque_ref", textoSeguro(embarque.ref, 200));
  record.set("desembarque_lat", desembarque.lat);
  record.set("desembarque_lng", desembarque.lng);
  record.set("desembarque_ref", textoSeguro(desembarque.ref, 200));
  record.set("status", "pendente");

  try {
    e.app.save(record);
  } catch (err) {
    return e.json(400, { error: "Não foi possível salvar o pedido." });
  }

  return e.json(200, { ok: true, id: record.get("id") });
});
