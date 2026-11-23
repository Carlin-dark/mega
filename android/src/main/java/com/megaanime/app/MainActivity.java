package com.megaanime.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private static final String ASSET_BASE = "file:///android_asset/web/";
    private static final String API_HOST = "mega-la8q.onrender.com";
    private static final String SITE_HOST = "carlin-dark.github.io";

    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        web.setBackgroundColor(0xFF0B0B10);

        /* mantém a assinatura do DownloadBridge.java do projeto */
        web.addJavascriptInterface(new DownloadBridge(this, web), "Android");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return route(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return route(req.getUrl().toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view;
                customCallback = cb;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                web.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (customCallback != null) customCallback.onCustomViewHidden();
                customCallback = null;
            }
        });

        String target = fromIntent(getIntent());
        web.loadUrl(target != null ? target : ASSET_BASE + "index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String target = fromIntent(intent);
        if (target != null) web.loadUrl(target);
    }

    /** Converte intent/link externo em página local com os parâmetros preservados. */
    private String fromIntent(Intent intent) {
        if (intent == null) return null;
        Uri d = intent.getData();
        if (d == null) return null;

        String scheme = d.getScheme() == null ? "" : d.getScheme().toLowerCase();
        String host = d.getHost() == null ? "" : d.getHost().toLowerCase();

        boolean isScheme = "megaanime".equals(scheme);
        boolean isSiteShare = ("https".equals(scheme) || "http".equals(scheme))
                && SITE_HOST.equals(host)
                && d.getPath() != null
                && d.getPath().endsWith("/share.html");

        if (!isScheme && !isSiteShare) return null;

        String page = ("player".equals(host) || d.getQueryParameter("ep") != null) ? "player.html" : "detail.html";
        String slug = d.getQueryParameter("slug");

        if (slug == null || slug.trim().isEmpty()) return ASSET_BASE + "index.html";

        StringBuilder q = new StringBuilder();
        appendParam(q, "source", d.getQueryParameter("source"));
        appendParam(q, "slug", slug);
        appendParam(q, "season", d.getQueryParameter("season"));
        appendParam(q, "ep", d.getQueryParameter("ep"));
        appendParam(q, "audio", d.getQueryParameter("audio"));

        return ASSET_BASE + page + "?" + q;
    }

    private void appendParam(StringBuilder sb, String key, String value) {
        if (value == null || value.isEmpty()) return;
        if (sb.length() > 0) sb.append('&');
        sb.append(key).append('=').append(Uri.encode(value));
    }

    /** true = tratado aqui; false = o WebView carrega. */
    private boolean route(String url) {
        if (url == null) return false;

        if (url.startsWith("file://")) return false;

        if (url.startsWith("megaanime://")) {
            Uri u = Uri.parse(url);
            String target = fromIntent(new Intent(Intent.ACTION_VIEW, u));
            if (target != null) { web.loadUrl(target); return true; }
            return false;
        }

        if (url.contains("/share.html")) {
            Uri u = Uri.parse(url);
            String target = fromIntent(new Intent(Intent.ACTION_VIEW, u));
            if (target != null) { web.loadUrl(target); return true; }
        }

        if (url.startsWith("http")) {
            Uri u = Uri.parse(url);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
            if (API_HOST.equals(host) || SITE_HOST.equals(host) || url.contains("/api/")) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        return false;
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.getSettings();
            if (customCallback != null) customCallback.onCustomViewHidden();
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }
}