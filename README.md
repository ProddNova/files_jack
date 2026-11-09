# Borgo di Mare

Un gioco rilassante di costruzione per iPhone (e computer): costruisci un paesino ligure, o un castello, su un'isola.
È un gioco **originale** (codice, grafica e nome), ispirato al genere dei "cozy builder". Gira nel browser, senza installare niente.

La guida completa compare al primo avvio (e con il tasto ❔).

## Cosa si può fare

- **Borgo**: casa ligure, palazzo, villetta col pergolato, chiesa a fasce, mulino a vento, campanile, torre saracena, faro.
- **Castello**: mura che mettono da sole le torri agli angoli, torrione, torretta a guglia, mastio, porta con saracinesca, torre quadrata.
- **Muri e ponti**: muretto, mura, staccionata, siepe, ponti di pietra o legno.
- **Natura, creuze, terreno**: alberi, palme, massi, fiori; strade di ciottoli; alza, abbassa, spiana (scavando nasce un laghetto).
- **Arredo**: lampioni, fontana, pozzo, panchine, vasi, bancarella, botti, carretto, falò, gazebo, orto, statua, cristallo, gatti, pecore, barche.
- **Modifica tutto dopo**: tocca un elemento e cambi rotazione, larghezza, profondità, piani o altezza, tetto, colori, pietra. Duplica, elimina, sposta trascinando.
- **Passeggiata in prima persona** con joystick, collisioni e ponti calpestabili.
- **Vita e atmosfera**: abitanti che passeggiano, panni stesi, ciclo giorno e notte, pioggia, nuvole, lucciole, faro acceso.
- **Isole**: 3 salvataggi, nuova isola casuale, esporta e importa in un file.

## Comandi su iPhone

- **Tocco** = anteprima, poi **✓** per costruire. Un trascinamento non costruisce mai: gira la vista. (Nel menu si può attivare il piazzamento rapido.)
- **1 dito** sul mare o sul cielo, o lontano dall'anteprima: ruota la vista.
- **2 dita**: sposta, pizzica per lo zoom, ruota. Ogni gesto parte solo oltre una soglia, così non si mescolano.
- Muri, creuze, alberi e terreno si disegnano trascinando: l'azione parte dopo un attimo, così un secondo dito la trasforma in gesto della camera.

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
  terrain.js     isola generata da un seme, altezze modificabili, creuze
  placement.js   impronte, collisioni, allineamenti
  decor.js       erba, fiori, sassi, panni stesi, lucciole
  build/*.js     case, torri, muri, ponti, natura, arredi
```

Alcune scelte, per capire il ragionamento:

- **Texture disegnate dalla GPU.** Uno shader dipinge 16 texture ripetibili (intonaco, pietra, mattoni, coppi, ardesia, legno, fogliame, ciottoli, erba, sabbia, roccia, acqua...) in pochi millisecondi. Generarle in JavaScript avrebbe richiesto secondi su un telefono. Ogni texture ha anche un'altezza: lo shader la usa per inclinare la luce (*bump mapping*), così le fughe tra le pietre sembrano scavate.
- **Una sola texture array.** Tutte le texture stanno in un unico "pacco" e ogni triangolo porta il numero del suo strato: così un'intera casa resta una sola chiamata di disegno.
- **Coordinate texture automatiche.** Ogni faccia proietta la texture sul proprio piano con l'asse "v" verso l'alto: i mattoni restano orizzontali e si allineano tra pezzi vicini, senza dover "srotolare" a mano i modelli.
- **Riflessi realistici.** Il cielo viene trasformato in una mappa di riflessi (PMREM): acqua, vetri e tetti riflettono il colore del cielo di quel momento.
- **Ombra di contatto economica.** Lo shader conosce l'altezza del terreno (dalla stessa mappa che usa l'acqua per la schiuma) e scurisce dolcemente la base degli oggetti: tutto sembra appoggiato, senza effetti costosi come l'SSAO.
- **Anteprima da confermare.** Su telefono il dito copre quello che tocchi ed è facile sbagliare: separare "scegli dove" da "costruisci" elimina gli errori senza rallentare chi sa cosa vuole (c'è comunque il piazzamento rapido).
- **Qualità adattiva.** Se il telefono fatica, la grafica scende da sola di livello. Si può cambiare dal menu.

Licenze: Three.js r169 e i suoi moduli di post-processing sono MIT (vedi `public/vendor/THREE_LICENSE.txt`).
