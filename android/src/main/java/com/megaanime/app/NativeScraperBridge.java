package com.megaanime.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * FIX: ponte de scraping nativo (window.AndroidScraper), sem dependências externas.
 * Busca sempre HTML bruto na rede (useCaches=false + Cache-Control: no-cache),
 * UA de celular real, timeouts curtos e redirects seguidos manualmente (até 5 saltos,
 * inclusive entre http/https). Devolve ao WebView por
 * window.__scraperResult(id, ok, html, finalUrl, status, err).
 */
public class NativeScraperBridge {

    private static final String UA =
            "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    private static final int MAX_CHARS = 5 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;

    private final Activity act;
    private final WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);

    public NativeScraperBridge(Activity a, WebView w) {
        this.act = a;
        this.web = w;
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
            HttpURLConnection conn = null;
            try {
                conn = openFollowing(url, referer);
                int status = conn.getResponseCode();
                boolean ok = status >= 200 && status < 400;

                InputStream in = ok ? conn.getInputStream() : conn.getErrorStream();
                String html = readCapped(in);
                String finalUrl = conn.getURL() == null ? url : conn.getURL().toString();

                reply(id, ok, html, finalUrl, status, null);
            } catch (Exception e) {
                reply(id, false, "", url, 0, e.getClass().getSimpleName() + ": " + e.getMessage());
            } finally {
                if (conn != null) {
                    try { conn.disconnect(); } catch (Exception ignored) {}
                }
            }
        });
    }

    /** Abre a conexão seguindo redirects manualmente (http/https, mesmo host ou não). */
    private HttpURLConnection openFollowing(String url, String referer) throws IOException {
        String current = url;
        HttpURLConnection conn = null;

        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(15000);
            conn.setUseCaches(false);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            conn.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8");
            conn.setRequestProperty("Cache-Control", "no-cache, no-store");
            conn.setRequestProperty("Pragma", "no-cache");
            if (referer != null && !referer.isEmpty()) conn.setRequestProperty("Referer", referer);

            int code = conn.getResponseCode();
            boolean redirect = code == 301 || code == 302 || code == 303 || code == 307 || code == 308;
            if (!redirect) return conn;

            String location = conn.getHeaderField("Location");
            if (location == null || location.isEmpty()) return conn;

            String next;
            try {
                next = new URL(new URL(current), location).toString();
            } catch (Exception e) {
                return conn;
            }
            if (next.equals(current)) return conn;

            conn.disconnect();
            conn = null;
            current = next;
        }
        if (conn != null) return conn;
        return (HttpURLConnection) new URL(current).openConnection();
    }

    private String readCapped(InputStream in) throws IOException {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder(16384);
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            char[] buf = new char[8192];
            int n;
            while (sb.length() < MAX_CHARS && (n = br.read(buf)) > 0) {
                sb.append(buf, 0, Math.min(n, MAX_CHARS - sb.length()));
            }
        }
        return sb.toString();
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