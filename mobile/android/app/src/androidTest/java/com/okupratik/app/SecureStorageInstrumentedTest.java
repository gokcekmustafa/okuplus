package com.okupratik.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureStorageInstrumentedTest {

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            webView.evaluateJavascript(script, value -> {
                result.set(value);
                complete.countDown();
            });
        });
        assertTrue("WebView JavaScript evaluation timed out", complete.await(10, TimeUnit.SECONDS));
        return new JSONTokener(result.get()).nextValue().toString();
    }

    private static int webViewProgress(ActivityScenario<MainActivity> scenario) {
        AtomicInteger progress = new AtomicInteger();
        scenario.onActivity(activity ->
                progress.set(activity.getBridge().getWebView().getProgress()));
        return progress.get();
    }

    @Test
    public void secureStoragePluginCanWriteReadAndRemoveOnDevice() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(60);
            int progress = 0;
            while (System.currentTimeMillis() < deadline && progress < 100) {
                progress = webViewProgress(scenario);
                if (progress < 100) Thread.sleep(250);
            }
            assertTrue("App WebView did not finish loading", progress >= 100);

            String readiness = evaluate(scenario,
                    "(() => { const capacitor = window.Capacitor; "
                            + "const plugin = window.__OKUPRATIK_RUNTIME__?.secureStorageNativePlugin; "
                            + "const header = capacitor?.PluginHeaders?.find(item => item.name === 'SecureStorage'); "
                            + "const methods = new Set((header?.methods || []).map(item => item.name)); "
                            + "if (!capacitor?.isNativePlatform?.() || capacitor.getPlatform?.() !== 'android') return 'NOT_READY:CAPACITOR_CORE'; "
                            + "if (!['internalSetItem','internalGetItem','internalRemoveItem'].every(name => methods.has(name))) return 'NOT_READY:NATIVE_PLUGIN_HEADER'; "
                            + "return plugin && ['setItem','getItem','removeItem'].every(name => typeof plugin[name] === 'function') ? 'READY' : 'NOT_READY:PACKAGE_ADAPTER'; })()");
            assertEquals("Secure Storage plugin was not registered in the app runtime", "READY", readiness);

            String key = "okupratik.instrumentation." + UUID.randomUUID();
            String value = "round-trip-" + UUID.randomUUID();
            String script = "window.__OKUPRATIK_SECURE_STORAGE_RESULT__ = 'PENDING'; "
                    + "(async () => { const plugin = window.__OKUPRATIK_RUNTIME__.secureStorageNativePlugin; "
                    + "const key = " + org.json.JSONObject.quote(key) + "; const value = " + org.json.JSONObject.quote(value) + "; "
                    + "try { await plugin.setItem(key, value); "
                    + "const stored = await plugin.getItem(key); "
                    + "if (stored !== value) return 'READ_MISMATCH'; "
                    + "await plugin.removeItem(key); "
                    + "const afterRemoval = await plugin.getItem(key); "
                    + "return afterRemoval === null ? 'PASS' : 'DELETE_MISMATCH'; "
                    + "} catch (error) { try { await plugin.removeItem(key); } catch (_) {} "
                    + "const code = typeof error?.code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(error.code) "
                    + "? error.code : 'UNKNOWN'; return 'NATIVE_ERROR:' + code; } })() "
                    + ".then(result => { window.__OKUPRATIK_SECURE_STORAGE_RESULT__ = result; }); 'STARTED';";

            assertEquals("Secure Storage test did not start", "STARTED", evaluate(scenario, script));
            String result = "PENDING";
            deadline = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(15);
            while (System.currentTimeMillis() < deadline && "PENDING".equals(result)) {
                result = evaluate(scenario,
                        "window.__OKUPRATIK_SECURE_STORAGE_RESULT__ || 'PENDING'");
                if ("PENDING".equals(result)) Thread.sleep(100);
            }
            evaluate(scenario, "delete window.__OKUPRATIK_SECURE_STORAGE_RESULT__; 'CLEARED'");
            assertEquals("Secure Storage native round-trip failed", "PASS", result);
        }
    }
}
