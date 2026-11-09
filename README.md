# Borgo di Mare

Un piccolo gioco rilassante di costruzione, pensato per iPhone: costruisci un paesino ligure su un'isola.
Muretti a secco, case colorate con le persiane verdi, torri saracene con la bandiera di Genova, creuze in mattoni, ulivi, pini, cipressi e limoni, gozzi in mare.

È un gioco **originale** (codice, grafica e nome), ispirato al genere dei "cozy builder". Gira nel browser, senza installare niente.

## Come si gioca

| Strumento | Gesto |
|---|---|
| ✋ Vista | un dito ruota la camera |
| 🧱 Muro | trascina il dito per disegnare un muretto (se chiudi il giro, il muro si chiude) |
| 🏠 Casa | tocca per una casa, oppure trascina per decidere larghezza e direzione della facciata |
| 🏰 Torre | tocca dove vuoi una torre di avvistamento |
| 🥾 Creuza | trascina per lastricare un sentiero |
| 🌳 Alberi / 🌺 Fiori | trascina per piantare |
| 🧹 Gomma | trascina sopra ciò che vuoi togliere |

- **Due dita**, con qualsiasi strumento: pizzica per lo zoom, ruota le dita per girare, trascina per spostarti.
- In alto: ↶ annulla, ☀️ cambia ora del giorno (alba, giorno, tramonto, notte con le finestre accese), 📷 foto da condividere, 🔊 suono, 🗑️ svuota l'isola (si può annullare).
- L'isola si **salva da sola** nel browser.

## Pubblicarlo su Render

È un sito statico: niente server e niente build. Render pubblica la cartella `public/`.

**Opzione A, Blueprint (più veloce):**
1. Su [render.com](https://render.com) → **New** → **Blueprint**.
2. Scegli questo repository: Render legge `render.yaml` e crea il sito da solo.

**Opzione B, a mano:**
1. **New** → **Static Site** → scegli il repository.
2. Build Command: lascialo vuoto (o `echo ok`).
3. Publish Directory: `public`.

Dopo il deploy, apri l'indirizzo `https://...onrender.com` su iPhone con **Safari** → tasto Condividi → **Aggiungi alla schermata Home**. Si apre a tutto schermo come un'app.

## Provarlo in locale

```bash
python3 -m http.server 8000 -d public
```

Poi apri `http://localhost:8000`. Serve un server: aprendo `index.html` con doppio clic i moduli JavaScript non partono (il browser li blocca per sicurezza).

## Come è fatto (e perché)

```
public/
  index.html            pagina, barra strumenti
  style.css             interfaccia "vetro smerigliato", margini per notch e home bar
  js/main.js            input touch, strumenti, annulla, salvataggio, ciclo di rendering
  js/terrain.js         isola generata con rumore, altezza del terreno, pittura delle creuze
  js/builders.js        generatori di case, muri, torri, alberi, fiori
  js/world.js           cielo, mare animato, luci, ora del giorno, nuvole, gabbiani, gozzi
  js/controls.js        camera orbitale con movimento morbido
  js/audio.js           onde del mare e suoni generati al volo (nessun file audio)
  js/util.js            numeri casuali con seme, rumore, unione delle geometrie
  vendor/three.module.min.js   Three.js r169 (licenza MIT, in THREE_LICENSE.txt)
```

Alcune scelte, così capisci il ragionamento e non solo il codice:

- **Tutto è generato dal codice, niente modelli 3D.** Ogni casa nasce da un "seme" (un numero). Lo stesso seme dà sempre la stessa casa, quindi per salvare basta memorizzare posizione + seme, non la geometria. Il salvataggio pesa pochi KB.
- **Una mesh per oggetto.** Una casa è fatta da decine di parallelepipedi (finestre, persiane, cornici), ma `GeoBuilder` li unisce in un'unica geometria con i colori nei vertici. Per la GPU del telefono contano soprattutto le *draw call* (quante volte disegna): una per casa invece di cinquanta.
- **Il dito "colpisce" il terreno con un calcolo, non con il raycast di Three.js.** Il terreno è una griglia di altezze: si cammina lungo il raggio finché si finisce sotto terra, poi si affina. È molto più leggero che testare migliaia di triangoli a ogni movimento del dito.
- **Pointer Events** invece di eventi touch o mouse separati: lo stesso codice funziona con dito, mouse e Apple Pencil. `touch-action: none` sul canvas impedisce a Safari di fare zoom o scroll della pagina mentre giochi.
- **Qualità adattiva.** Se il telefono fatica (frame oltre ~30 ms), la risoluzione scende un po' da sola.
- **Three.js è incluso nel repo** invece che preso da un CDN: niente dipendenze esterne, funziona anche se il CDN è giù.

Idee per continuare: un lampione che si accende di notte, ponti sulle creuze, barche piazzabili, terrazzamenti.
