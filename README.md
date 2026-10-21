# LARES Lexicon

Lessico digitale del vocabolario religioso del mondo antico e capitoli dei quattro volumi *Ofiara krwawa w Grecji starożytnej w świetle danych filologicznych*. Progetto **LARES — Languages · Religions** (UNA Europa seed funding).

I testi sono file **EpiDoc TEI XML** (49 schede del lessico e 111 capitoli), nello stesso formato del repository [LARESproject/LARES](https://github.com/LARESproject/LARES). Il sito è disponibile in italiano, inglese e polacco.

## Funzioni

- Lessico e capitoli, con le edizioni it / en / pl di ogni testo
- Indici: fonti antiche, ambiti, termini, personaggi, figure storiche, luoghi
- Ricerca a testo pieno, insensibile ad accenti e diacritici, con translitterazione del greco
- Bibliografia e pagine del progetto
- Area riservata per redattori (accesso con token): editor con barra dei tag e controlli di validità

## Avvio

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:3000
```

| Comando | |
| --- | --- |
| `npm run dev` | server di sviluppo |
| `npm run build` | build del frontend |
| `npm start` | server di produzione |
| `npm run build:static` | build per hosting statico (GitHub Pages) |
| `npm test` | test |
| `npm run lint` | controllo dei tipi |

## Pubblicazione

**GitHub Pages (statico).** `npm run build:static` genera in `dist/` il sito completo, con indice, schede e testi di ricerca già elaborati: non serve alcun server. Il workflow `.github/workflows/pages.yml` lo pubblica a ogni push su `main` (Settings → Pages → Source: *GitHub Actions*). In questa modalità l'editor non è disponibile.

**Server Node.** `npm run build` e poi `npm start`, con `EDITOR_TOKEN` impostato: abilita la ricerca lato server, l'aggiornamento automatico dei dati e l'editor.

## Configurazione

Variabili d'ambiente (`.env`), tutte facoltative:

| Variabile | Significato |
| --- | --- |
| `EDITOR_TOKEN` | password dell'area redattori; senza, in produzione il server è in sola lettura |
| `GITHUB_REPO`, `GITHUB_TOKEN`, `GITHUB_BRANCH`, `GITHUB_DATA_PATH` | sincronizzazione con una repository GitHub (il token serve solo per scrivere) |
| `GITHUB_PULL_INTERVAL_MIN` | ogni quanti minuti aggiornare da GitHub (default 5) |
| `DATA_DIR` | cartella dei file XML (default `public/data`) |
| `PORT` | default 3000 |

## Struttura

```
public/data/    file XML del corpus
public/pages/   pagine statiche (team, bibliografia, tesauro)
src/            interfaccia React, parser e ricerca
server/         server Express, cache del corpus, ricerca, sincronizzazione GitHub
scripts/        build statica
```

## Licenza dei dati

I testi sono distribuiti con licenza [CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/).
