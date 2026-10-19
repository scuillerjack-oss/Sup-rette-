// À lancer dans la CI juste après `npx cap add android` (le dossier android/ n'est pas committé).
// 1. Ajoute scripts/android-patch.gradle à la fin de android/app/build.gradle
//    (versionCode/versionName depuis package.json + signature de bêta).
// 2. Réécrit le nom de l'appli dans strings.xml en l'échappant : l'apostrophe de
//    « Ma P'tite Supérette » doit être écrite \' sinon la compilation Android échoue.
// 3. Copie les icônes de lancement (android-res/) par-dessus celles par défaut de Capacitor.
//
// Usage : node scripts/android-prepare.mjs
import { readFileSync, writeFileSync, appendFileSync, cpSync, existsSync } from 'node:fs';

const APP = 'android/app';
const gradle = `${APP}/build.gradle`;
if (!existsSync(gradle)) throw new Error(`${gradle} introuvable : lancer d'abord « npx cap add android »`);

const MARK = '// --- superette android-patch.gradle ---';
if (!readFileSync(gradle, 'utf8').includes(MARK)) {
  appendFileSync(gradle, `\n${MARK}\n${readFileSync('scripts/android-patch.gradle', 'utf8')}`);
}

export function androidString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

const { appName } = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
const stringsPath = `${APP}/src/main/res/values/strings.xml`;
let strings = readFileSync(stringsPath, 'utf8');
for (const name of ['app_name', 'title_activity_main']) {
  strings = strings.replace(
    new RegExp(`<string name="${name}">[\\s\\S]*?</string>`),
    `<string name="${name}">${androidString(appName)}</string>`
  );
}
writeFileSync(stringsPath, strings);

cpSync('android-res', `${APP}/src/main/res`, { recursive: true });
console.log(`Android préparé : « ${appName} », version et signature de bêta branchées, icônes copiées.`);
