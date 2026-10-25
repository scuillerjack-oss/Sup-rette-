package com.scuillerjackoss.superette;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;

// V1.3 : copié par scripts/android-prepare.mjs à la place du MainActivity généré par Capacitor.
// À la première ouverture après l'installation d'un NOUVEL APK (versionCode différent), on efface
// le service worker gardé par la WebView. Sans cela, l'ancien service worker de la V1.0
// (« cache d'abord ») continuait d'afficher la V1.0 même après une réinstallation.
// La sauvegarde de la partie (stockage local du jeu) n'est PAS touchée.
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        purgeServiceWorkerAfterUpdate();
        super.onCreate(savedInstanceState);
    }

    private void purgeServiceWorkerAfterUpdate() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            SharedPreferences prefs = getSharedPreferences("superette_maj", MODE_PRIVATE);
            if (prefs.getLong("versionCode", -1L) == code) return;
            String data = getApplicationInfo().dataDir;
            deleteRecursive(new File(data, "app_webview/Default/Service Worker"));
            deleteRecursive(new File(data, "app_webview/Service Worker"));
            prefs.edit().putLong("versionCode", code).apply();
        } catch (Exception e) {
            // Jamais bloquant : au pire, l'ancien cache reste jusqu'à la publication suivante.
        }
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursive(c);
        f.delete();
    }
}
