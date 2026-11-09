# Borgo di Mare

Un gioco rilassante di costruzione per iPhone (e computer): costruisci un paesino ligure, o un castello, su un'isola.
È un gioco **originale** (codice, grafica e nome), ispirato al genere dei "cozy builder". Gira nel browser, senza installare niente.

La guida completa compare al primo avvio (e con il tasto ❔).

## Cosa si può fare

- **Telecamera classica** (gira intorno all'isola, comoda con una mano in verticale) e, dal menu, **drone** a volo libero. Con 🚶 scendi a terra ad altezza d'uomo.
- **HUD**: minimappa con bussola (tocca un punto per andarci), 👁 per nascondere i comandi, barra degli strumenti compatta con tutto visibile.
- **Mondi**: terraferma (campagna col fiume, colline, valle alpina, lago tra i colli) o isole (riviera, arcipelago, laguna, monti, bosco d'autunno, deserto, vulcano). Intorno alla mappa c'è sempre un paesaggio fino all'orizzonte: colline, boschi, montagne innevate, isole lontane.
- **Case (12)** ed **Edifici (11)**: dalla casa ligure al duomo, tutti modificabili dopo (misure, piani, tetto, colori).
- **Castelli in un gesto**: "Fortezza intera" crea mura dritte, torri sugli angoli, porta con saracinesca e mastio trascinando un rettangolo.
- **Muri e strade dritti**: modi 📏 dritto (angoli di 15°, misure sulla griglia), ⬜ rettangolo (per le strade: piazza), ⭕ cerchio, ✍️ libero. I muri che si toccano si uniscono senza pilastri o torri doppie; gli angoli restano pieni.
- **Campi**: grano, vigna, lavanda, girasoli, mais, orto, tulipani, terra arata.
- **Griglia** visibile mentre costruisci, con passo regolabile; nel pannello ◀ ▲ ▼ ▶ per spostare di un passo e ↺ ↻ di 15°. Annulla e **rifai**.
- **Abitanti** con gambe e braccia che si muovono, vestiti, capelli, cappelli, in scala con le case.
- **Scala reale**: un piano di casa ≈ 3 m, una persona ≈ 1,75 m. Panchine, staccionate, gatti, erba sono alla misura giusta.
- **Pacchetto shader (Ultra)**: riflessi veri sul mare, raggi di sole, occlusione ambientale, nebbia che si scalda verso il sole, nuvole con ombre sul terreno, foglie ed erba nel vento, colori filmici.
- **Stagioni, ora del giorno, meteo**, 3 salvataggi, esporta e importa.

## Comandi su iPhone

- **Tocco** = anteprima, poi **✓** per costruire. Un trascinamento non costruisce mai.
- **1 dito** fuori dall'anteprima, o sul mare e sul cielo: giri intorno. **2 dita**: sposti, pizzichi per lo zoom, ruoti.
- **Minimappa**: tocca un punto per andarci. Il drone (menu) aggiunge joystick e ▲ ▼.
- Muri, strade, campi, alberi e terreno si disegnano trascinando; il tasto arancione cambia il modo di disegno.

## Pubblicarlo su Render

Sito statico, nessuna build. Render pubblica la cartella `public/`.

1. **New** → **Blueprint** (legge `render.yaml`), oppure **New** → **Static Site** con Publish Directory `public` (va bene anche vuota: l'`index.html` nella cartella principale rimanda al gioco).
2. Su iPhone apri il link con Safari → Condividi → **Aggiungi alla schermata Home**.

In locale: `python3 -m http.server 8000 -d public` e apri `http://localhost:8000`.

## Come è fatto (e perché)

```
public/js/
  main.js        oggetti, annulla/rifai, selezione, salvataggi, menu, ciclo di disegno
  controls.js    telecamera classica: gira intorno, zoom, spostamento
  drone.js       telecamera drone (opzionale): volo libero, joystick, sopra i tetti
  hud.js         minimappa con bussola
  input.js       tocchi e gesti (tocco, trascina, soglie)
  tools.js       strumenti: anteprima da confermare, tratti, pennelli, modifica
  editor.js      pannello di modifica (cursori, tetti, colori, ruota, duplica)
  walk.js        prima persona: joystick, sguardo, collisioni
  life.js        abitanti (due mesh "instanced" per tutti)
  textures.js    texture procedurali disegnate dalla GPU
  shaders.js     aggiunte agli shader: texture, rilievo, ombra di contatto, terreno a strati
  post.js        pacchetto shader: occlusione, raggi di sole, nebbia, bloom, colori filmici
  reflect.js     riflessi del mare con una camera specchiata
  vista.js       paesaggio oltre la mappa fino all'orizzonte
  world.js       cielo, sole, riflessi del cielo, mare, meteo, barche, gabbiani
  terrain.js     scenari, isola generata da un seme, altezze modificabili, strade
  placement.js   impronte, collisioni, allineamenti
  decor.js       erba, fiori, sassi, panni stesi, lucciole
  build/*.js     case (houses.js + houses2.js), torri, muri, ponti, campi, natura, arredi
```

Alcune scelte, per capire il ragionamento:

- **Texture disegnate dalla GPU.** Uno shader dipinge 20 texture ripetibili (intonaco, pietra, mattoni, coppi, ardesia, legno, fogliame, ciottoli, spina di pesce, ghiaia, paglia, marmo, erba, sabbia, roccia, acqua...) in pochi millisecondi. Generarle in JavaScript avrebbe richiesto secondi su un telefono. Ogni texture ha anche un'altezza: lo shader la usa per inclinare la luce (*bump mapping*), così le fughe tra le pietre sembrano scavate.
- **Una sola texture array.** Tutte le texture stanno in un unico "pacco" e ogni triangolo porta il numero del suo strato: così un'intera casa resta una sola chiamata di disegno.
- **Coordinate texture automatiche.** Ogni faccia proietta la texture sul proprio piano con l'asse "v" verso l'alto: i mattoni restano orizzontali e si allineano tra pezzi vicini, senza dover "srotolare" a mano i modelli.
- **Riflessi realistici.** Il cielo viene trasformato in una mappa di riflessi (PMREM): acqua, vetri e tetti riflettono il colore del cielo di quel momento.
- **Ombra di contatto economica.** Lo shader conosce l'altezza del terreno (dalla stessa mappa che usa l'acqua per la schiuma) e scurisce dolcemente la base degli oggetti: tutto sembra appoggiato, senza effetti costosi come l'SSAO.
- **Anteprima da confermare.** Su telefono il dito copre quello che tocchi ed è facile sbagliare: separare "scegli dove" da "costruisci" elimina gli errori senza rallentare chi sa cosa vuole (c'è comunque il piazzamento rapido).
- **Lampioni che guardano la strada.** Quando ne piazzi uno, il gioco cerca il punto di strada più vicino e calcola l'angolo con `atan2`: è lo stesso conto che faresti a mano con la trigonometria, solo automatico.
- **Stagioni senza rifare i modelli.** Gli alberi non vengono ricostruiti: lo shader ricolora solo le foglie (ogni albero prende una sfumatura diversa dalla sua posizione) e imbianca le facce rivolte verso l'alto. I sempreverdi hanno un "segnaposto" diverso nello strato texture, così l'autunno li salta.
- **Profondità = superpoteri.** Dopo aver disegnato la scena, il buffer di profondità dice a ogni pixel dove si trova in 3D. Da lì escono occlusione (gli angoli si scuriscono), nebbia per distanza e altezza, e i raggi di sole (si cammina dal pixel verso il sole e si conta quanto cielo luminoso si incontra).
- **Riflessi con una camera specchiata.** Il mare è un piano: basta disegnare la scena una seconda volta, a metà risoluzione, da una camera "sotto l'acqua". È esatto e costa meno dei riflessi in screen-space.
- **Muri dritti: matematica semplice.** L'angolo del dito si arrotonda al multiplo di 15° più vicino e la lunghezza al passo di griglia. Agli angoli il lato del muro si allunga di 1/cos(metà angolo) (il "miter"), così lo spessore resta pieno.
- **Qualità adattiva.** Se il telefono fatica, la grafica scende da sola di livello. Si può cambiare dal menu.

Licenze: Three.js r169 e i suoi moduli di post-processing sono MIT (vedi `public/vendor/THREE_LICENSE.txt`).
