package com.megaanime.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class DownloadBridge {
    private final Context ctx;

    DownloadBridge(Context ctx) { this.ctx = ctx; }

    @JavascriptInterface
    public void download(String url, String name, String mime, String referer) {
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setMimeType(mime);
            r.setTitle(name);
            r.setDescription("Mega Anime");
            r.addRequestHeader("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36");
            if (referer != null) r.addRequestHeader("Referer", referer);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "MegaAnime/" + name);
            ((DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(ctx, "Baixando…", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(ctx, "Falha: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}