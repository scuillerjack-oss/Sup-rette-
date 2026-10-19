# Clé de signature des APK de BÊTA — PUBLIQUE, NON SECRÈTE

`superette-debug.keystore` est une **clé de débogage** (PKCS12, RSA 2048, valable 30 ans) :

| Champ | Valeur |
|---|---|
| Alias | `androiddebugkey` |
| Mot de passe du keystore | `android` |
| Mot de passe de la clé | `android` |
| DN | `CN=Android Debug,O=Android,C=US` |

Empreinte SHA-256 du certificat (vérifiée par la CI) :
`A9:FC:E2:34:FE:F7:8A:8B:40:F8:EE:AF:69:4D:02:72:AD:1A:4D:7C:25:93:A1:7E:35:5A:1C:F4:DA:62:3E:16`

Elle est **volontairement commitée et publique** : elle ne protège rien. Elle sert **UNIQUEMENT** à signer les
APK de bêta fabriqués par `.github/workflows/android-apk.yml` (variable `SUPERETTE_BETA_SIGNING=1`, lue par
`scripts/android-patch.gradle`). Toujours la même signature = Android installe chaque nouvelle bêta
**par-dessus** la précédente, sans désinstaller, donc **sans perdre la partie**.

- Ne jamais la remplacer ni la régénérer : la bêta suivante refuserait de s'installer par-dessus.
- Ne jamais l'utiliser pour Google Play. La vraie clé d'importation ira dans les secrets GitHub, jamais ici.
