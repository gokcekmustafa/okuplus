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

            deadline = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(15);
            String readiness = "";
            while (System.currentTimeMillis() < deadline) {
                readiness = evaluate(scenario,
                        "(() => { const plugin = window.__OKUPRATIK_RUNTIME__?.secureStorageNativePlugin; "
                                + "return typeof plugin?.internalSetItem === 'function' "
                                + "&& typeof plugin?.internalGetItem === 'function' "
                                + "&& typeof plugin?.internalRemoveItem === 'function' ? 'READY' : 'NOT_READY'; })()");
                if ("READY".equals(readiness)) break;
                Thread.sleep(250);
            }
            assertEquals("Secure Storage plugin was not registered in the app runtime", "READY", readiness);

            String key = "capacitor-storage_okupratik.instrumentation." + UUID.randomUUID();
            String value = "round-trip-" + UUID.randomUUID();
            String script = "window.__OKUPRATIK_SECURE_STORAGE_RESULT__ = 'PENDING'; "
                    + "(async () => { const plugin = window.__OKUPRATIK_RUNTIME__.secureStorageNativePlugin; "
                    + "const prefixedKey = '" + key + "'; const data = '" + value + "'; "
                    + "try { await plugin.internalSetItem({ prefixedKey, data, sync: false, access: 0 }); "
                    + "const stored = await plugin.internalGetItem({ prefixedKey, sync: false }); "
                    + "if (stored?.data !== data) return 'READ_MISMATCH'; "
                    + "await plugin.internalRemoveItem({ prefixedKey, sync: false }); return 'PASS'; "
                    + "} catch (error) { try { await plugin.internalRemoveItem({ prefixedKey, sync: false }); } catch (_) {} "
                    + "const code = typeof error?.code === 'string' && /^[A-Z_]{1,40}$/.test(error.code) "
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
