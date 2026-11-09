# Borgo di Mare

Un piccolo gioco rilassante di costruzione, pensato per iPhone: costruisci un paesino ligure su un'isola.
Muretti a secco, case colorate con le persiane verdi, torri saracene con la bandiera di Genova, creuze in mattoni, ulivi, pini, cipressi e limoni, gozzi in mare.

È un gioco **originale** (codice, grafica e nome), ispirato al genere dei "cozy builder". Gira nel browser, senza installare niente.

## Come si gioca

**Gesti**
- **1 dito sull'isola**: usi lo strumento scelto. L'azione parte dopo un attimo, così se appoggi un secondo dito diventa un gesto della camera e non costruisci per sbaglio.
- **1 dito sul mare o sul cielo**: giri la vista (con qualsiasi strumento).
- **2 dita**: trascina per spostarti, pizzica per lo zoom, ruota le dita per girare. Ogni gesto parte solo oltre una piccola soglia, così lo zoom non fa anche girare la vista.
- Più ti avvicini, più la camera si abbassa: da vicino vedi le facciate, da lontano tutta l'isola.
- Lasciando il dito la vista scivola ancora un po' (inerzia). 🎯 ricentra, ↶ annulla.

**Strumenti** (sopra la barra scegli la variante)

| Strumento | Varianti | Note |
|---|---|---|
| 🏠 Casa | Casa ligure, Palazzo, Villetta, Chiesa | tocca o trascina per la facciata; tocca una casa esistente per cambiarle aspetto |
| 🏰 Torre | Saracena, Quadrata, Campanile, Faro | si aggancia agli angoli e sopra i muri; il faro di notte gira |
| 🧱 Muro | Muretto, Mura merlate, Staccionata, Siepe | si apre da solo dove passa una creuza (le mura fanno un portale) e dove incontra una casa |
| 🥾 Creuza | | le case vicine si girano verso la strada e non ci si costruisce sopra |
| 🌳 Natura | Misti, Ulivi, Pini, Cipressi, Palme, Fiori | |
| 🪑 Arredo | Lampione, Pozzo, Panchina, Vasi, Barca | i lampioni si accendono di notte, le barche vanno in acqua |
| ⛰️ Terreno | Alza, Abbassa, Spiana | tieni premuto; scavando sotto il livello del mare nasce un laghetto |
| 🧹 Gomma | | toglie oggetti e creuze |

**Automatico**
- Le case non si sovrappongono: se il posto è occupato, la casa si sposta nel punto libero più vicino (anteprima rossa se non c'è spazio).
- Case vicine si allineano a schiera, con le facciate in linea.
- Tra case vicine compaiono i panni stesi; erba, fiori e sassi spariscono sotto edifici e strade.
- In alto: ❔ guida, ☀️ ora del giorno, 📷 foto, 🔊 suono, 🗑️ svuota (si può annullare). L'isola si salva da sola.

## Pubblicarlo su Render

È un sito statico: niente server e niente build. Render pubblica la cartella `public/`.

**Opzione A, Blueprint (più veloce):**
1. Su [render.com](https://render.com) → **New** → **Blueprint**.
2. Scegli questo repository: Render legge `render.yaml` e crea il sito da solo.

**Opzione B, a mano:**
1. **New** → **Static Site** → scegli il repository.
2. Build Command: lascialo vuoto (o `echo ok`).
3. Publish Directory: `public`. Va bene anche vuoto: l'`index.html` nella cartella principale rimanda al gioco.

Dopo il deploy, apri l'indirizzo `https://...onrender.com` su iPhone con **Safari** → tasto Condividi → **Aggiungi alla schermata Home**. Si apre a tutto schermo come un'app.

## Provarlo in locale

```bash
python3 -m http.server 8000 -d public
```

Poi apri `http://localhost:8000`. Serve un server: aprendo `index.html` con doppio clic i moduli JavaScript non partono (il browser li blocca per sicurezza).

## Come è fatto (e perché)

```
public/
  index.html            pagina, barre, guida
  style.css             interfaccia, margini per notch e home bar
  js/main.js            oggetti, annulla, salvataggio, pulsanti, ciclo di disegno
  js/input.js           tocchi e gesti (attesa anti-errore, soglie, mare = rotazione)
  js/controls.js        camera: inerzia, inclinazione legata allo zoom
  js/tools.js           cosa fa ogni strumento
  js/placement.js       impronte, collisioni, posto libero più vicino, allineamenti
  js/terrain.js         isola, altezze modificabili, creuze, mappa altezze per l'acqua
  js/world.js           cielo col sole, mare con schiuma, luci, ora del giorno
  js/decor.js           erba, fiori, sassi, panni stesi, lucciole
  js/build/*.js         case, torri, muri, alberi, arredi (tutto generato dal codice)
  js/audio.js           onde e suoni generati al volo
  js/util.js            numeri casuali con seme, rumore, unione delle geometrie
  vendor/three.module.min.js   Three.js r169 (licenza MIT)
```

Alcune scelte, così capisci il ragionamento e non solo il codice:

- **Tutto è generato dal codice, niente modelli 3D.** Ogni casa nasce da un "seme" (un numero). Lo stesso seme dà sempre la stessa casa, quindi per salvare basta memorizzare posizione + seme, non la geometria. Il salvataggio pesa pochi KB.
- **Una mesh per oggetto.** Una casa è fatta da decine di parallelepipedi (finestre, persiane, cornici), ma `GeoBuilder` li unisce in un'unica geometria con i colori nei vertici. Per la GPU del telefono contano soprattutto le *draw call* (quante volte disegna): una per casa invece di cinquanta.
- **Il dito "colpisce" il terreno con un calcolo, non con il raycast di Three.js.** Il terreno è una griglia di altezze: si cammina lungo il raggio finché si finisce sotto terra, poi si affina. È molto più leggero che testare migliaia di triangoli a ogni movimento del dito.
- **Pointer Events** invece di eventi touch o mouse separati: lo stesso codice funziona con dito, mouse e Apple Pencil. `touch-action: none` sul canvas impedisce a Safari di fare zoom o scroll della pagina mentre giochi.
- **Collisioni con le forme giuste.** Le case sono rettangoli ruotati, le torri cerchi, i muri linee. Per sapere se due rettangoli ruotati si toccano uso il *Separating Axis Theorem*: se trovi una direzione in cui le loro "ombre" non si sovrappongono, non si toccano.
- **L'acqua sa dov'è la riva.** Le altezze del terreno finiscono in una piccola texture che lo shader dell'acqua legge: dove il fondale è basso l'acqua schiarisce e fa la schiuma. Per questo anche un laghetto scavato ha la sua riva.
- **Qualità adattiva.** Se il telefono fatica (frame oltre ~30 ms), la risoluzione scende un po' da sola.
- **Three.js è incluso nel repo** invece che preso da un CDN: niente dipendenze esterne, funziona anche se il CDN è giù.

Idee per continuare: ponti sulle creuze, terrazzamenti a fasce come alle Cinque Terre, pioggia, gatti che camminano sui muretti.
