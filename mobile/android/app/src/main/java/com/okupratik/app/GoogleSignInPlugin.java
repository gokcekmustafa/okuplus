package com.okupratik.app;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        String nonce = call.getString("nonce");

        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("Google giriş yapılandırması eksik.", "GOOGLE_CONFIGURATION_ERROR");
            return;
        }
        if (nonce == null || nonce.length() < 16 || nonce.length() > 256) {
            call.reject("Google giriş isteği geçersiz.", "GOOGLE_CONFIGURATION_ERROR");
            return;
        }

        try {
            GetSignInWithGoogleOption googleOption =
                new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build();
            GetCredentialRequest request =
                new GetCredentialRequest.Builder().addCredentialOption(googleOption).build();
            CredentialManager manager = CredentialManager.create(getContext());
            Executor executor = getContext().getMainExecutor();

            manager.getCredentialAsync(
                getActivity(),
                request,
                null,
                executor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        resolveGoogleCredential(call, response.getCredential());
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        rejectGoogleCredential(call, error);
                    }
                }
            );
        } catch (RuntimeException error) {
            // Native exception details can include provider/configuration data; never log them.
            call.reject("Google girişi başlatılamadı.", "GOOGLE_AUTH_FAILED");
        }
    }

    private void resolveGoogleCredential(PluginCall call, Credential credential) {
        if (
            !(credential instanceof CustomCredential)
                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(
                    credential.getType()
                )
        ) {
            call.reject("Google hesabı doğrulanamadı.", "GOOGLE_INVALID_CREDENTIAL");
            return;
        }

        try {
            GoogleIdTokenCredential googleCredential =
                GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
            String idToken = googleCredential.getIdToken();
            if (idToken == null || idToken.isEmpty()) {
                call.reject("Google hesabı doğrulanamadı.", "GOOGLE_INVALID_CREDENTIAL");
                return;
            }

            JSObject result = new JSObject();
            result.put("idToken", idToken);
            String displayName = googleCredential.getDisplayName();
            if (displayName != null) result.put("displayName", displayName);
            call.resolve(result);
        } catch (IllegalArgumentException error) {
            call.reject("Google hesabı doğrulanamadı.", "GOOGLE_INVALID_CREDENTIAL");
        }
    }

    private void rejectGoogleCredential(PluginCall call, GetCredentialException error) {
        if (error instanceof GetCredentialCancellationException) {
            call.reject("Google girişi iptal edildi.", "GOOGLE_SIGN_IN_CANCELLED");
        } else if (error instanceof NoCredentialException) {
            call.reject("Kullanılabilir Google hesabı bulunamadı.", "GOOGLE_NO_CREDENTIAL");
        } else if (error instanceof GetCredentialProviderConfigurationException) {
            call.reject("Google sağlayıcısı yapılandırılamadı.", "GOOGLE_PROVIDER_CONFIGURATION");
        } else {
            call.reject("Google girişi tamamlanamadı.", "GOOGLE_AUTH_FAILED");
        }
    }
}
