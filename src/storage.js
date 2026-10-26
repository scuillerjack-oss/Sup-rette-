// V1.3 : sauvegarde et « Nouvelle partie ».
//
// Bug corrigé : l'ancien bouton effaçait la sauvegarde puis rechargeait la page ; or le rechargement
// déclenche « visibilitychange » (page cachée) qui RÉÉCRIVAIT aussitôt l'ancienne partie. Résultat :
// rien ne se passait. Désormais, après une nouvelle partie, plus aucune sauvegarde de l'ancienne partie
// n'est possible jusqu'au rechargement, et c'est une partie neuve qui est écrite.
// Les réglages (son, vibrations) sont rangés sous une autre clé : ils ne sont jamais touchés.

export function createSaver(storage, key, getState, { fresh, serializeFn }) {
  let locked = false;
  return {
    save() {
      if (locked) return false;
      try {
        storage.setItem(key, serializeFn(getState()));
        return true;
      } catch (e) {
        return false; // stockage indisponible : la partie continue
      }
    },
    // Remplace la partie par une partie neuve et bloque toute sauvegarde de l'ancienne.
    reset() {
      locked = true;
      try {
        storage.setItem(key, serializeFn(fresh()));
      } catch (e) {
        try { storage.removeItem(key); } catch (err) { /* ignoré */ }
      }
    },
    // V1.5 : plus aucune sauvegarde jusqu'au rechargement (fin du tutoriel : sa partie d'essai est effacée).
    lock() { locked = true; },
    get locked() { return locked; }
  };
}
