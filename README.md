# Borgo di Mare

Un gioco rilassante di costruzione per iPhone (e computer): costruisci un paesino ligure, o un castello, su un'isola.
È un gioco **originale** (codice, grafica e nome), ispirato al genere dei "cozy builder". Gira nel browser, senza installare niente.

La guida completa compare al primo avvio (e con il tasto ❔).

## Cosa si può fare

- **Case (12)**: casa ligure, villetta, casa di pietra, a graticcio, casa dei pescatori, casa torre, locanda, fienile, mulino, serra di vetro, torre del mago, casa sull'albero.
- **Edifici (11)**: palazzo, palazzo con portico, comune con orologio, villa, mercato coperto, chiesa a fasce, cappella, duomo con cupola, campanile, torre, faro.
- **Castello**: mura che mettono da sole le torri agli angoli, bastione, torrione, torretta a guglia, mastio, porta con saracinesca, torre quadrata.
- **Muri (9 stili) e ponti**: muretto, mura, mattoni, intonacato, ringhiera, palizzata, staccionata, steccato, siepe; ponti di pietra o legno. Dopo averli fatti si regolano altezza, spessore, merli (quadrati, a coda di rondine, nessuno), torri sì/no e distanza tra le torri, tetti delle torri, pietra o colore.
- **Strade (5 tipi)**: ciottoli, mattoni a spina di pesce, lastricato, sterrato, ghiaia. Ripassando una strada con un altro tipo la cambi.
- **Natura e terreno**: ulivi, pini, cipressi, palme, abeti, querce, betulle, salici, cactus, cespugli, massi, fiori; "Misti" sceglie gli alberi adatti allo scenario. Alza, abbassa, spiana (scavando nasce un laghetto).
- **Arredo**: lampioni e panchine (si girano da soli verso la strada più vicina), fontana, pozzo, vasi, bancarella, botti, carretto, falò, gazebo, orto, statua, cristallo, gatti, pecore, barche.
- **Modifica tutto dopo**: tocca un elemento e cambi rotazione (cursore in gradi o ⟲ ⟳ a scatti di 45°), larghezza, profondità, piani o altezza, tetto, colori, pietra. Duplica, elimina, sposta trascinando.
- **7 scenari**: Riviera, Arcipelago, Laguna con canali, Monti innevati, Bosco d'autunno, Deserto con oasi, Isola del vulcano (con lava che brilla di notte).
- **4 stagioni**: in autunno querce e betulle diventano arancioni (i sempreverdi restano verdi), in inverno la neve si posa su tetti, alberi e prati.
- **Passeggiata in prima persona** con joystick, collisioni e ponti calpestabili.
- **Vita e atmosfera**: abitanti che passeggiano, panni stesi, ciclo giorno e notte, pioggia, nuvole, lucciole, faro acceso.
- **Isole**: 3 salvataggi, nuova isola casuale per ogni scenario, esporta e importa in un file.

## Comandi su iPhone

- **Tocco** = anteprima, poi **✓** per costruire. Un trascinamento non costruisce mai: gira la vista. (Nel menu si può attivare il piazzamento rapido.)
- **1 dito** sul mare o sul cielo, o lontano dall'anteprima: ruota la vista.
- **2 dita**: sposta, pizzica per lo zoom, ruota. Ogni gesto parte solo oltre una soglia, così non si mescolano.
- Muri, strade, alberi e terreno si disegnano trascinando: l'azione parte dopo un attimo, così un secondo dito la trasforma in gesto della camera.

## Pubblicarlo su Render

Sito statico, nessuna build. Render pubblica la cartella `public/`.

1. **New** → **Blueprint** (legge `render.yaml`), oppure **New** → **Static Site** con Publish Directory `public` (va bene anche vuota: l'`index.html` nella cartella principale rimanda al gioco).
2. Su iPhone apri il link con Safari → Condividi → **Aggiungi alla schermata Home**.

In locale: `python3 -m http.server 8000 -d public` e apri `http://localhost:8000`.

## Come è fatto (e perché)

```
public/js/
  main.js        oggetti, annulla, selezione, salvataggi, menu, ciclo di disegno
  input.js       tocchi e gesti (tocco, trascina, soglie, mare = rotazione)
  tools.js       strumenti: anteprima da confermare, tratti, pennelli, modifica
  editor.js      pannello di modifica (cursori, tetti, colori, ruota, duplica)
  walk.js        prima persona: joystick, sguardo, collisioni
  life.js        abitanti (due mesh "instanced" per tutti)
  textures.js    texture procedurali disegnate dalla GPU
  shaders.js     aggiunte agli shader: texture, rilievo, ombra di contatto, terreno a strati
  post.js        bagliore notturno (bloom) ed effetto miniatura
  world.js       cielo, sole, riflessi del cielo, mare, meteo, barche, gabbiani
  terrain.js     scenari, isola generata da un seme, altezze modificabili, strade
  placement.js   impronte, collisioni, allineamenti
  decor.js       erba, fiori, sassi, panni stesi, lucciole
  build/*.js     case (houses.js + houses2.js), torri, muri, ponti, natura, arredi
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
- **Qualità adattiva.** Se il telefono fatica, la grafica scende da sola di livello. Si può cambiare dal menu.

Licenze: Three.js r169 e i suoi moduli di post-processing sono MIT (vedi `public/vendor/THREE_LICENSE.txt`).
