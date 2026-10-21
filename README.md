# LARES Lexicon

Sito del progetto **LARES — Languages · Religions** (UNA Europa seed funding): lessico del vocabolario religioso del mondo antico e capitoli dei quattro volumi *Ofiara krwawa w Grecji starożytnej…* (Omero, tragedia, commedia, Corpus Platonicum/Hippocraticum).

È il successore leggero del sito costruito con EFES (Kiln + Solr + Sesame): stessi file **EpiDoc TEI XML** del repository [LARESproject/LARES](https://github.com/LARESproject/LARES), stesse convenzioni di marcatura, ma un'unica applicazione Node/React senza Java.

## Lingue

L'interfaccia è in **italiano** (predefinita), **inglese** e **polacco**; si cambia dalla barra laterale e la scelta viene ricordata. Anche il testo delle schede segue la lingua: se il file ha un'edizione nella lingua scelta viene mostrata quella (altrimenti l'edizione più annotata), e le schede con più edizioni hanno un selettore. I testi dell'interfaccia sono nei dizionari dei singoli componenti e in `src/i18n/translations.ts`; i messaggi dei controlli in `src/lib/validateEntry.ts`.

## Cosa fa (e come corrisponde a EFES)

| EFES | Qui |
| --- | --- |
| XML in `webapps/ROOT/content/xml/epidoc` | stessi file in `public/data/` (cartella configurabile con `DATA_DIR`) |
| `git pull` ogni 5 minuti (crontab) | il server sincronizza da GitHub all'avvio e ogni `GITHUB_PULL_INTERVAL_MIN` minuti (default 5) |
| «harvest/index all» notturno, Solr | gli indici e la ricerca si costruiscono in memoria a ogni caricamento: nessun passaggio da lanciare |
| `lists/all_documents.xml` | `manifest.json`, rigenerato dal server a ogni modifica |
| Lexicon / Book chapters / Indices / Bibliography / Team | stesse sezioni, stessi dati (`public/pages/` per Team e Bibliografia) |
| Modifica con Oxygen + GitHub Desktop | in più, un **editor nel browser** che salva e fa commit su GitHub |

## Avvio

```bash
npm install
cp .env.example .env     # poi modifica .env
npm run dev              # http://localhost:3000
```

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | server Express + Vite (sviluppo) |
| `npm run build` | build del frontend in `dist/` |
| `npm start` | server in produzione (serve `dist/` e le API) |
| `npm test` | test (parser, ricerca, markup, validazione, GitHub) |
| `npm run lint` | controllo dei tipi |

## Dati

`public/data/` contiene i 160 file del repository LARES: 49 schede del lessico (`lexicon_*.xml`, edizioni in it/en/pl) e 111 capitoli dei volumi (`hom_`, `trag_`, `com_`, `cpch_`). Il nome del file è l'identità del documento.

Come il parser legge i file ([`src/utils/xmlParser.ts`](src/utils/xmlParser.ts)):

- più `<div type="edition|translation">` nella stessa lingua sono parti di un solo testo e vengono unite; negli capitoli un'edizione senza `xml:lang` è il testo polacco originale;
- gli **indici** si costruiscono dall'edizione più annotata (a parità, en › it › pl);
- `<w lemma="…">` → termini (link a Logeion); un `<w>` senza lemma è solo una parola;
- `<ref type="lit|ins|pap|author">` → fonti; `<ref corresp="lexicon_x.html">` → rimando interno; `<ref corresp="https://…">` → link esterno;
- `<rs type|key subtype>` → ambiti (valori multipli separati da `;`, `_` come spazio); `<rs key="place">` conta come luogo;
- `<persName type="divine|hero|myth|literary" key>` → personaggi (le grafie `devine`, `mith`, `Myth`… sono normalizzate); senza tipo → figure storiche;
- `<placeName key>` → luoghi.

## Editor (area riservata)

L'editor **non è pubblico**: nessun link nel sito, l'indirizzo `#/editor` chiede il token (con il serpente di Men come emblema) e le API di scrittura rifiutano ogni richiesta senza token. Il pulsante «Modifica» sulle schede compare solo a chi ha già effettuato l'accesso (in sviluppo, senza `EDITOR_TOKEN`, l'editor è aperto). Per i lettori c'è la pagina **Collabora con noi** (`#/contact`), con l'indirizzo di riferimento definito in [`src/lib/site.ts`](src/lib/site.ts): cambiarlo lì lo cambia ovunque.

La guida al markup (`#/markup`) non è linkata dal sito pubblico; si può girare ai collaboratori abilitati.

1. **Nuova scheda**: tipo (scheda o capitolo di un volume), titolo, lingue delle edizioni, autore, data. Il nome file è proposto (`lexicon_<titolo>.xml`, oppure `hom_45_<titolo>.xml` col numero successivo) e lo scheletro è quello dei template del progetto (`docs/efes/`).
2. Seleziona il testo e premi un tag nella barra: fonti, ambiti del tesauro, divinità/eroi, persone, luoghi, termini, rimandi, link esterni, `<emph>`, `<foreign>`, `<title>`.
3. *Anteprima*, *Controlli* (errori e avvisi) e *Indici* mostrano subito cosa produrrà la marcatura.
4. **Salva** (⌘/Ctrl+S): il server valida l'XML, scrive il file, aggiorna `manifest.json` e — se GitHub è configurato in scrittura — fa un commit.

Le convenzioni applicate dai controlli (da `docs/efes/Info.md`): nomi file solo con lettere latine, cifre e `_`; `&` sempre come `&amp;`; grassetto con `<emph>`, non `<hi rend="bold">`; `persName`/`placeName` con `@key`.

Pagine statiche (Team, Bibliografia, tesauro) si modificano direttamente nei file di `public/pages/`.

## Ricerca

La ricerca a testo pieno gira **sul server** (`server/search.ts`, MiniSearch): indicizza tutte le edizioni (it / en / pl) di ogni scheda, titoli, lemmi, autori, ambiti, fonti, personaggi e luoghi, ignora accenti e diacritici e translittera il greco. L'indice viene ricostruito da solo quando il corpus cambia (salvataggio, eliminazione, pull da GitHub), quindi una scheda nuova o modificata è cercabile alla richiesta successiva. I browser già aperti scoprono le modifiche con un controllo di versione quando la scheda torna in primo piano e ogni 5 minuti. Se il server non fosse raggiungibile (frontend ospitato come sito statico) il browser ripiega su un indice più leggero.

## Configurazione (`.env`)

| Variabile | Significato |
| --- | --- |
| `EDITOR_TOKEN` | password dell'editor. In produzione **senza token il server è in sola lettura**; in sviluppo, se vuoto, l'editor è aperto |
| `GITHUB_REPO` | `LARESproject/LARES`: basta questo per **leggere** (anche senza token, per repository pubblici) |
| `GITHUB_TOKEN` | token fine-grained con *Contents: Read and write* sulla repository: serve per **scrivere** |
| `GITHUB_BRANCH` | default: il branch predefinito della repository (per LARES è `master`) |
| `GITHUB_DATA_PATH` | cartella dei file nella repo (default `webapps/ROOT/content/xml/epidoc`, come in EFES) |
| `GITHUB_PULL_INTERVAL_MIN` | ogni quanti minuti sincronizzare da GitHub (default 5, `0` = mai) |
| `DATA_DIR` | cartella locale dei file (default `public/data`) |
| `BACKUP_DIR` | dove finiscono le versioni precedenti (default `.lares-backups`) |
| `STATE_FILE` | stato della sincronizzazione (default `.lares-state.json`) |
| `PORT` | default `3000` |

### Sincronizzazione con GitHub

- Al riavvio e ogni pochi minuti il server scarica i file nuovi o modificati. Un file viene rimosso in locale solo se era sulla repository e non c'è più; i file locali mai pubblicati non vengono toccati.
- Ogni salvataggio dall'editor diventa **un commit** (API Git Data, atomico). Se il commit fallisce, il file resta salvato sul server, l'editor lo segnala e una sincronizzazione successiva non lo sovrascrive; **Pubblica tutte le schede** riprova.
- Il pannello nell'editor ha anche **Sincronizza da GitHub** per forzare subito un pull.
- `manifest.json` non viene pubblicato sulla repository (EFES non lo usa).

Se la repository è quella del sito EFES, i commit dell'editor aggiornano anche quel sito, che continua a funzionare.

## Architettura

```
browser (React, router a hash)
   │  GET /api/corpus                 indice leggero di tutto il corpus (ETag → 304 alle visite successive)
   │  GET /api/search?q=…             ricerca a testo pieno su tutte le edizioni
   │  GET /api/corpus/version         controllo di versione per aggiornarsi dopo modifiche altrui
   │  GET /api/entries/:id/body       HTML della singola scheda, solo quando si apre
   │  GET /data/<file>.xml            XML sorgente, solo per la vista XML e l'editor
   │  PUT/DELETE /api/entries/:file   salvataggio ed eliminazione (token)
   ▼
server Express (server/app.ts)
   ├─ Corpus (server/corpus.ts)      ogni XML viene parsato una volta e di nuovo solo se il file cambia
   ├─ SearchService (server/search.ts)  indice di ricerca, ricostruito quando cambia la versione del corpus
   ├─ cartella dei file XML          scritture atomiche, backup delle versioni precedenti
   └─ GitHub (server/githubStorage.ts)  pull periodico + un commit per salvataggio
```

Perché così: il parsing di ~5 MB di TEI costava ~1,2 s a ogni visita (di più su un telefono). Ora lo fa il server una sola volta; il browser scarica un indice senza HTML né XML (≈1,5 MB compressi, e 304 quando non è cambiato) e parte in <0,1 s. L'HTML di una scheda (fino a ~100 KB compressi) e il suo XML si scaricano solo quando servono.

### Robustezza
- **Scritture**: scrittura su file temporaneo + rename (un crash non lascia XML a metà); le scritture sono serializzate; ogni sovrascrittura o eliminazione copia prima la versione precedente in `.lares-backups/` (ultime 10 per file).
- **Sincronizzazione**: l'elenco dei file non ancora pubblicati e di quelli noti sulla repository è salvato in `.lares-state.json`, quindi un riavvio non permette a un pull di sovrascrivere lavoro non pubblicato.
- **Autenticazione**: confronto a tempo costante; dopo 10 token sbagliati da un indirizzo il server risponde 429 per 5 minuti. Senza `EDITOR_TOKEN` in produzione il server è in sola lettura.
- **Validazione lato server** di ogni salvataggio (XML ben formato, regole del progetto), nomi file ristretti da un'espressione regolare (niente path traversal), corpo delle richieste limitato a 2 MB, intestazioni di sicurezza di base, errori interni senza stack trace.
- **Interfaccia**: un errore di rendering in una pagina mostra un messaggio e non svuota il sito; l'HTML generato dal TEI è sempre escapato.
- **Test**: `npm test` copre parser, validazione, markup, GitHub (con risposte simulate) e l'API del server (autenticazione, limite di tentativi, salvataggio, backup, cache ETag, corpo on-demand).

## Struttura

```
server.ts                  avvio (porta, indirizzi di rete locale, arresto pulito)
server/app.ts              applicazione Express e configurazione (testabile: createApp)
server/corpus.ts           cache dei file parsati, indice e corpo delle schede
server/githubStorage.ts    lettura (raw.githubusercontent) e commit atomici (Git Data API)
server/xmlParse.ts         parsing XML rigoroso lato server
src/utils/teiRender.ts     TEI → HTML + raccolta delle annotazioni per gli indici
src/utils/xmlParser.ts     file TEI → scheda (edizioni, sezioni, indici)
src/utils/entryBody.ts     caricamento on-demand di HTML e XML
src/lib/markup.ts          catalogo dei tag (barra, guida, regole)
src/lib/validateEntry.ts   validazione condivisa client/server, messaggi in 3 lingue
src/lib/entryTemplate.ts   scheletro di un nuovo file
src/lib/volumes.ts         i quattro volumi
src/components/            Sidebar, Footer, Logo, ErrorBoundary, EntryEditor, MarkupToolbar
src/views/                 Home, Lessico, Capitoli, Scheda, Indici, Ricerca, Editor, Guida, pagine TEI
public/data/               i file XML (+ manifest.json generato)
public/pages/              Team, Bibliografia, tesauro, luoghi
docs/efes/                 template e Info.md del repository originale
```

`public/data/manifest.json` è generato dal server (serve solo a chi ospita il frontend come sito statico: in quel caso il browser fa il parsing da sé).

## Telefono

Il sito è responsive (menu a cassetto in vetro, nessuno scorrimento orizzontale, aree di tocco ≥ 44 px su schermi touch, campi a 16 px per evitare lo zoom di iOS). All'avvio il server stampa l'indirizzo di rete locale: con il telefono sulla stessa Wi-Fi basta aprirlo.

## Note

- Il codice e le dipendenze di Google AI Studio / Gemini sono stati rimossi; i vecchi file e i dati di prova generati da AI Studio sono in `../_backup-aistudio/`.
- I messaggi di errore che arrivano dal server (es. «token non valido») sono solo in italiano.
