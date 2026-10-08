/// <reference path="../pb_data/types.d.ts" />

// Serve a tela da viagem (pb_public/index.html e demais arquivos estáticos)
// na raiz do servidor, sem conflitar com /api/... e /_/... (que o próprio
// PocketBase já trata antes de chegar nessa rota coringa).
routerAdd("GET", "/{path...}", $apis.static(`${__hooks}/../pb_public`, true));
