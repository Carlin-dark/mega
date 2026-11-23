package com.megaanime.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.CacheControl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * FIX: ponte de scraping nativo (window.AndroidScraper).
 * Sempre busca HTML bruto na rede (FORCE_NETWORK), UA de celular real,
 * timeouts curtos e redirects seguidos. Devolve ao WebView por
 * window.__scraperResult(id, ok, html, finalUrl, status, err).
 */
public class NativeScraperBridge {

    private static final String UA =
            "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    private static final int MAX_CHARS = 5 * 1024 * 1024;

    private static OkHttpClient client;

    private final Activity act;
    private final WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);

    public NativeScraperBridge(Activity a, WebView w) {
        this.act = a;
        this.web = w;
    }

    private static synchronized OkHttpClient client() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                    .connectTimeout(12, TimeUnit.SECONDS)
                    .readTimeout(15, TimeUnit.SECONDS)
                    .callTimeout(22, TimeUnit.SECONDS)
                    .followRedirects(true)
                    .followSslRedirects(true)
                    .retryOnConnectionFailure(true)
                    .build();
        }
        return client;
    }

    /** O JS usa para saber se a ponte está viva. */
    @JavascriptInterface
    public boolean available() {
        return true;
    }

    @JavascriptInterface
    public void fetch(final String url, final String referer, final String id) {
        if (url == null || id == null) return;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            reply(id, false, "", url, 0, "url invalida");
            return;
        }
        pool.execute(() -> {
            Response res = null;
            try {
                Request.Builder rb = new Request.Builder()
                        .url(url)
                        .cacheControl(CacheControl.FORCE_NETWORK)
                        .header("User-Agent", UA)
                        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                        .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
                        .header("Cache-Control", "no-cache")
                        .header("Pragma", "no-cache");
                if (referer != null && !referer.isEmpty()) rb.header("Referer", referer);

                res = client().newCall(rb.build()).execute();
                ResponseBody body = res.body();
                String html = body == null ? "" : body.string();
                if (html.length() > MAX_CHARS) html = html.substring(0, MAX_CHARS);

                reply(id, res.isSuccessful(), html, res.request().url().toString(), res.code(), null);
            } catch (Exception e) {
                reply(id, false, "", url, 0, e.getClass().getSimpleName() + ": " + e.getMessage());
            } finally {
                if (res != null) {
                    try { res.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    private void reply(final String id, final boolean ok, final String body,
                       final String url, final int status, final String err) {
        final String js = "window.__scraperResult(" + q(id) + "," + ok + "," + q(body) + ","
                + q(url) + "," + status + "," + q(err) + ");";
        act.runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder(s.length() + 16).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n");  break;
                case '\r': b.append("\\r");  break;
                case '\t': b.append("\\t");  break;
                case '\u2028': b.append("\\u2028"); break;
                case '\u2029': b.append("\\u2029"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    public void shutdown() {
        pool.shutdownNow();
    }
}