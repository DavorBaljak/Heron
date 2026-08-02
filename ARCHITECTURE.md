# Heron — arhitekturni dokument

**Heron** je kodni naziv ovog projekta. Trenutna implementacija cilja na Loxone kao prvi backend, no arhitektura je namjerno sustav-agnostična kako bi se u budućnosti mogli dodati i drugi home-automation sustavi.

## Kontekst

Ovaj projekt je AI sloj iznad postojećeg Loxone home-automation sustava. Cilj nije zamijeniti Loxone-ovu internu automatizaciju (Config/logiku unutar Miniservera), nego dodati "human interface" razinu koja:

- prima naredbe na prirodnom jeziku,
- tumači trenutno stanje sustava,
- daje sugestije za promjene automatizacije na temelju šireg konteksta (vremenska prognoza, kalendar/godišnji odmori, gosti u kući itd.),
- nikad ne upravlja sustavom mimo strogo definiranog MCP sloja.

Ključni sigurnosni zahtjevi:
- MCP server i agent rade isključivo unutar zatvorene kućne mreže, bez pristupa izvana.
- Agent ima pristup **samo** MCP serveru — nikad izravno Miniserveru niti bilo kojem drugom putu za izdavanje naredbi.
- MCP alati su strogo definirani (whitelist), podijeljeni u tri razine: **discovery**, **monitoring**, **action**.
- Postoje eksplicitna pravila o tome što se smije proslijediti LLM-u (lokalnom ili SOTA), radi zaštite privatnosti/sigurnosti kućnih podataka.

## 1. Pregled sustava

```mermaid
flowchart LR
    U[Korisnik / NL naredba] --> A[Agent<br/>lokalni LLM ili SOTA]
    A -->|samo MCP tool calls| M[MCP Server]
    M -->|Web API / WebSocket| L[Loxone Miniserver]
    L -->|state updates| M
    M -->|filtrirano stanje + sugestije| A
    A --> U

    W[Vanjski kontekst:<br/>vrijeme, kalendar, gosti] --> M

    subgraph Kućna mreža (bez pristupa izvana)
      A
      M
      L
    end
```

Agent nikad ne drži Loxone kredencijale i nema izravnu mrežnu rutu do Miniservera — jedina površina prema kući je set MCP alata.

## 2. Loxone integracija (tehnička osnova)

MCP server komunicira s Miniserverom preko službenog Loxone Web/WebSocket API-ja:

- **Structure file** — `data/LoxAPP3.json` (JSON) daje mapping UUID → kontrola/soba/kategorija. Ovo je temelj za **discovery** razinu (popis soba, uređaja, tipova kontrola).
- **Autentikacija** (token-based, RSA + HMAC-SHA1):
  1. `GET /jdev/cfg/api` — verzija firmvera i algoritam
  2. `GET /jdev/cfg/getPublicKey` — RSA-2048 javni ključ
  3. `GET /jdev/sys/gettoken/{hash}/{user}/{permission}/{clientId}/{clientName}` — dobivanje tokena
  4. `GET /jdev/sys/authwithtoken/{token}/{user}` — re-autentikacija
  5. `GET /jdev/sys/refreshtoken/{token}/{user}` — produljenje tokena
  6. `GET /jdev/sys/killtoken/{token}/{user}` — invalidacija pri odjavi
- **WebSocket** (`ws://{host}/ws/rfc6455`) — live state update-ovi, temelj **monitoring** razine.
- **HTTP GET mirror** pojedinačnih naredbi — temelj **action** razine.
- Token/kredencijale drži isključivo MCP server; agent ih nikad ne vidi niti prosljeđuje.

Izvori:
- [Loxone API Documentation (mr-manuel)](https://github.com/mr-manuel/Loxone_api_documentation)
- [Communicating with the Miniserver (službeni PDF)](https://www.loxone.com/wp-content/uploads/datasheets/CommunicatingWithMiniserver.pdf)
- [loxone-ts-api — referentna TS implementacija](https://github.com/andrasg/loxone-ts-api)

## 3. Tri razine MCP alata

| Razina | Tip | Primjeri alata | Rizik | Tko odobrava |
|---|---|---|---|---|
| **Discovery** | read-only, statično | dohvat strukture kuće, popis soba/uređaja/kategorija, capabilities uređaja | Nizak — nema side-effects | Agent smije pozvati autonomno |
| **Monitoring** | read-only, dinamično | trenutna stanja, senzori, potrošnja, prisutnost | Srednji — osjetljivi podaci (npr. prisutnost osoba) | Agent autonomno, uz pravila maskiranja prije slanja LLM-u |
| **Action** | write | promjena scene, target temperatura, roleta, rasvjeta | Visok — direktan utjecaj na kuću | Zahtijeva eksplicitnu potvrdu korisnika, whitelist naredbi, logging |

## 4. Sigurnosni model / granice povjerenja

- **Mrežna izolacija**: MCP server i agent rade samo na lokalnoj mreži; nema izlaza prema internetu za kontrolni put. Ovo treba biti enforced na mrežnoj razini (firewall/VLAN), ne samo dogovorom.
- **Agent ↔ MCP kontrola**: MCP je jedina površina za alate. Agent ne drži Loxone kredencijale niti direktnu mrežnu rutu do Miniservera — čak i ako bi agent bio kompromitiran, ne može zaobići whitelistane MCP alate.
- **Filtriranje podataka prema LLM-u**:
  - Smije se proslijediti u cijelosti: nazivi soba, tipovi uređaja, generička stanja (npr. "grijanje uključeno").
  - Agregira se / anonimizira: prisutnost gostiju, obrasci ponašanja ukućana.
  - Nikad se ne šalje SOTA (cloud) modelu: sirovi podaci o prisutnosti/lokaciji osoba u realnom vremenu, sigurnosne kamere/alarm detalji.
  - Lokalni LLM smije obrađivati monitoring podatke; SOTA model dobiva samo agregirane/generičke upite (npr. "predloži raspored grijanja za idući tjedan").
- **Confirmation-flow za action razinu**: agent formulira predloženu akciju (prirodni jezik + strukturirani poziv), korisnik eksplicitno potvrđuje prije izvršenja, svaka izvršena akcija se loguje s vremenskom oznakom i izvorom naredbe.

## 5. Vanjski kontekst

Vremenska prognoza, kalendar (godišnji odmori, gosti) i slični izvori ulaze u sustav kao dodatni read-only izvori koje MCP server agregira uz Loxone stanje prije nego dođu do LLM-a. Ovi izvori nemaju i ne smiju imati pristup natrag prema Loxone action alatima — isključivo su ulaz u kontekst za sugestije.

## 6. Tech stack i sljedeći koraci

- **MCP server i agent**: TypeScript/Node, koristeći službeni MCP TypeScript SDK.
- **Prvi implementacijski milestone** (izvan opsega ovog dokumenta): inicijalizacija TypeScript projekta i MCP server skeleton s isključivo discovery alatima (najniži rizik), zatim monitoring, pa tek na kraju action razina s punim confirmation-flowom.
