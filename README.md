# Carona

Otimizador de rota pra organizar caronas em grupo: calcula a melhor ordem de
embarque/desembarque, gera links de navegação por trecho, e tem um fluxo
completo (banco + páginas web) pra caroneiros pedirem vaga e o motorista
aprovar.

## Estrutura

- `otimizar.mjs` / `rota-core.cjs` — script de linha de comando que lê um
  arquivo `viagem.json`, calcula a melhor ordem de paradas e imprime links de
  navegação. `rota-core.cjs` tem a lógica pura (sem I/O), reaproveitada tanto
  pelo CLI quanto pelo backend do PocketBase.
- `pocketbase/pb_hooks/` — endpoints do backend (otimizar rota a partir do
  banco, geocoding de endereço, solicitação pública de carona).
- `pocketbase/pb_migrations/` — schema das coleções `viagens` e `reservas`.
- `pocketbase/pb_public/` — as duas páginas web: `index.html` (tela da
  viagem, pro motorista usar no celular) e `solicitar.html` (pro caroneiro
  pedir vaga, marcando o endereço ou o ponto no mapa).

## Como rodar

### 1. Script de linha de comando

Precisa de [Node.js](https://nodejs.org) 18+ e uma chave gratuita do
[OpenRouteService](https://openrouteservice.org/dev/#/signup).

```powershell
cp viagem.exemplo.json viagem.json   # edite com os pontos reais da sua viagem
$env:ORS_KEY = "sua_chave_aqui"
node otimizar.mjs viagem.json
```

### 2. Backend + páginas web (PocketBase)

Baixe o [PocketBase](https://pocketbase.io/docs/) (binário único, não vai
neste repositório) e coloque o executável em `pocketbase/pocketbase.exe`
(ou o equivalente pro seu sistema operacional).

```powershell
cd pocketbase
$env:ORS_KEY = "sua_chave_aqui"
.\pocketbase.exe serve --http=0.0.0.0:8090
```

Isso aplica as migrações automaticamente (coleções `viagens` e `reservas`) e
sobe:
- Painel admin: `http://SEU_IP:8090/_/`
- Tela da viagem: `http://SEU_IP:8090/?id=ID_DA_VIAGEM`
- Pedido de carona: `http://SEU_IP:8090/solicitar.html?viagem=ID_DA_VIAGEM`

Fluxo de uso: crie a viagem pelo painel admin (`status: aberta`), mande o
link de solicitação pro grupo, aprove as reservas que chegarem (`status:
aprovada`) e abra a tela da viagem.

## Limitações atuais

- Precisa estar rodando (`pocketbase serve`) e acessível na mesma rede pra
  funcionar no celular.
- Geolocalização automática (GPS) só funciona em conexão HTTPS — ainda não
  publicado atrás de HTTPS.
