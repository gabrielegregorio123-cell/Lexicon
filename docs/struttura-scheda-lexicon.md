# Struttura XML di una scheda del Lexicon

Analisi dei 49 file `public/data/lexicon_*.xml`, condotta l'11/11/2026. Il modello è `docs/efes/lexicon_xxx.xml` e l'esempio più semplice è `lexicon_keya.xml`. Le stesse sezioni guidano l'editor a sezioni (`#/editor/sections/<id>`).

## 1. Scheletro

```
TEI (@xml:lang facoltativo)
├── teiHeader
│   ├── fileDesc
│   │   ├── titleStmt ─ title @xml:lang (1…n)          → sezione «Titolo»
│   │   ├── publicationStmt                              → sezione «Pubblicazione»
│   │   │   ├── publisher/ref → LARES Project            (fisso)
│   │   │   ├── date @when                               (anno)
│   │   │   ├── idno @type="filename"                    (= nome del file senza .xml)
│   │   │   └── availability/licence → CC BY-SA 4.0      (fisso)
│   │   └── sourceDesc ─ p (o msDesc, 1 caso)            → sezione «Fonte»
│   └── revisionDesc/listChange ─ change @when @who      → sezione «Revisioni»
└── text/body
    ├── div @type="edition" @xml:lang="it|en|pl"         → sezione «Edizione IT/EN/PL»
    │   └── div @type="textpart" @n  (1…n)
    │       ├── head                                     (titolo della sezione, facoltativo)
    │       └── p | list/item | quote | l | div @type="translation" …
    └── div @type="bibliography" [@subtype]             → sezione «Bibliografia»
        └── p | bibl  (una voce per elemento)
```

## 2. Intestazione (`teiHeader`)

| Componente | Contenuto | Note |
|---|---|---|
| `title` | Lemma della scheda. In 38 casi è `xml:lang="grc"`, in 6 `la`, in 2 `he`; in 3 schede ci sono titoli per `it`/`en`/`pl` | Il titolo greco o latino è quello mostrato negli elenchi |
| `idno type="filename"` | `lexicon_<translitterazione>` | Solo caratteri latini, cifre e `_`; deve coincidere con il nome del file |
| `date when` | Anno di pubblicazione (2021) | |
| `sourceDesc` | «Born digital document.» oppure il rimando alla banca dati *Animal Sacrifice in Ancient Greece* | `lexicon_telestike` contiene un `msDesc` completo |
| `change when who` | Revisioni, dalla più recente: «encoded in XML», «updated document contents», «written contents» | 109 occorrenze |

## 3. Corpo (`body`)

- **Edizioni.** Ogni scheda ha da una a tre `div type="edition"`, una per lingua. Ci sono 73 edizioni EN, 24 IT e 23 PL: molte schede esistono solo in inglese.
- **Textpart.** Sono le sezioni interne. L'attributo `@n` è libero e non uniforme: compaiono `Etymology`, `Testimonies`, `Poświadczenia`, `Etimologia`, `Morphology`, `2`, `catalogue of occurrences`. Il `head` ne ripete il titolo visibile.
- **Blocchi.** Dentro un textpart si trovano `p` (2801 nel corpus), `list rend="bulleted"`/`item`, `quote` (446), versi `l n` e `lb`.
- **Bibliografia.** Di norma è `div type="bibliography"`, con un `p` per voce; a volte ha `@subtype="studies|sitography"`.

### Varianti reali da tenere presenti

| Variante | Dove |
|---|---|
| Più `div type="edition"` per la stessa lingua, una per textpart | `lexicon_Ioudaios`, `lexicon_Hebraios`, `lexicon_fides` |
| `div type="translation" xml:lang="en"` annidate nei textpart | `lexicon_fides` (7) |
| Bibliografia come `div type="textpart" subtype="bibliography"` | 3 schede |
| `div type="literary_sources"`, `div type="inscriptions"` | 2 schede ciascuno |
| **Errore strutturale:** in `lexicon_fides` alcuni `textpart` non sono chiusi dove dovrebbero, quindi l'edizione PL finisce dentro un textpart EN | da correggere a mano |

## 4. Marcatura inline (dentro i paragrafi)

| Tag | Uso | Attributi e valori nel corpus | Indice |
|---|---|---|---|
| `w lemma` | Termine greco, latino o ebraico (link a Logeion) | `lemma` = forma base (520 occorrenze) | Termini |
| `foreign xml:lang` | Parola straniera non indicizzata | `grc` 496, `la` 162, `he` 54; varianti da uniformare: `lat` 20, `es`, `en`, `hit`, `ar` | — |
| `ref type` | Fonte antica | `lit` 842, `ins` 98, `pap` 21, `author` 87, `myth` 9 | Fonti antiche |
| `ref corresp` | Link a TLG, Perseus, PHI, altre schede LARES | URL o `lexicon_x.html` | Rimandi |
| `rs type subtype` | Ambito del tesauro | Valori non uniformi: `practice` 140, `Activities`/`Ritual_Practice` 67, `Ritual_practice` 28, `Super-human_Agents`/`Divinities`… | Ambiti |
| `persName type key` | Figura divina, eroica, mitica o letteraria | `divine` 220, `attested` 129, `myth` 98; varianti: `Divine`, `Myth`, `mith`, `devine` | Personaggi |
| `persName key` (senza `type`) | Figura storica | | Figure storiche |
| `placeName key` | Luogo | 240; `type="etnic"` 15 e `type="ethnic"` 9 | Luoghi |
| `title` | Titolo di opera | 18 con `key` | — |
| `quote` | Citazione | | — |
| `emph` | Grassetto (mai `hi rend="bold"`) | 175 | — |
| `hi rend="italic"` | Corsivo | 236 | — |

Nel corpus i valori di `rs`, `persName/@type` e `foreign/@xml:lang` hanno grafie diverse per la stessa categoria, per esempio `Divine`/`divine`/`devine`. Vanno uniformati sul tesauro, ma l'editor a sezioni non li corregge da solo: li mostra così come sono e propone i valori canonici.

## 5. Mappatura sull'editor a sezioni

| Gruppo | Sezione | Elemento XML | Cosa si fa |
|---|---|---|---|
| Intestazione | Titolo | `titleStmt/title` | Si aggiungono o rimuovono titoli per lingua |
| | Pubblicazione | `idno`, `date@when`, `TEI@xml:lang` | Si controlla che il nome file coincida |
| | Fonte | `sourceDesc` | Si modifica come XML validato |
| | Revisioni | `listChange/change` | Le nuove righe vanno in testa |
| Testo | Edizione IT/EN/PL | `div[@type=edition]/div[@type=textpart]` | Si gestiscono `head`, `@n`, ordine e aggiunta delle sezioni; la marcatura si fa selezionando il testo |
| Apparato | Bibliografia | `div[@type=bibliography]` | Si aggiungono, rimuovono e ordinano le voci (A→Z) |
| | Altri blocchi | figli del `body` non riconosciuti | Si modificano come XML |
| Verifica | Controlli / Indici / XML | — | Si consultano la validazione, gli indici derivati e il file completo |
