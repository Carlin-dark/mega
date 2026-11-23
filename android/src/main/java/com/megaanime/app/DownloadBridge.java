package com.megaanime.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.widget.Toast;

public class DownloadBridge {

  private final Activity act;

  public DownloadBridge(Activity a) {
    this.act = a;
  }

  public boolean hasPermission() {
    if (Build.VERSION.SDK_INT >= 33) return true;
    return act.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        == PackageManager.PERMISSION_GRANTED;
  }

  public void ensurePermission() {
    if (hasPermission()) return;
    act.requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 1001);
  }

  /* FIX: tela cheia disparada pelo player (auto_fs). O JS chama window.Android.fullscreen() */
  @JavascriptInterface
  public void fullscreen() {
    act.runOnUiThread(() -> {
      if (act instanceof MainActivity) ((MainActivity) act).enterImmersive();
    });
  }

  @JavascriptInterface
  public void download(final String url, final String name, final String mime, final String referer) {
    act.runOnUiThread(() -> {
      if (!hasPermission()) {
        ensurePermission();
        Toast.makeText(act, "Autorize o armazenamento para baixar", Toast.LENGTH_LONG).show();
        return;
      }
      try {
        String file = (name != null && name.length() > 0)
            ? name
            : URLUtil.guessFileName(url, null, mime);

        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
        r.setTitle(file);
        r.setDescription("Mega Anime");
        r.setMimeType(mime == null ? "video/mp4" : mime);
        r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "MegaAnime/" + file);
        r.addRequestHeader("User-Agent",
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36");
        if (referer != null && referer.length() > 0) {
          r.addRequestHeader("Referer", referer);
          r.addRequestHeader("Origin", referer);
        }
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) r.addRequestHeader("Cookie", cookie);

        DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
        dm.enqueue(r);
        Toast.makeText(act, "Baixando em Downloads/MegaAnime", Toast.LENGTH_SHORT).show();
      } catch (Exception e) {
        Toast.makeText(act, "Falha: " + e.getMessage(), Toast.LENGTH_LONG).show();
      }
    });
  }
}